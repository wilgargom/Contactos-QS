const crypto = require('node:crypto');
const { getDb, runTransaction } = require('../database/db');
const { parseXlsxSheets } = require('./excelService');
const { validateContact } = require('../utils/validator');
const config = require('../config');

const normalize = value => String(value || '').trim().toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
const fullKey = c => c.first_name && c.last_name && (c.institution || c.company_name)
  ? [c.first_name, c.last_name, c.institution || c.company_name].map(normalize).join('|') : '';
const eligible = new Set(['CORRECTO', 'PENDIENTE_REVISION', 'ACTUALIZAR_PROCEDENCIA']);

function extractRows(buffer) {
  const rows = [];
  for (const sheet of parseXlsxSheets(buffer)) {
    const name = normalize(sheet.name);
    const type = name.includes('emplead') ? 'EMPLEADOR' : name.includes('academic') ? 'ACADEMICO' : null;
    if (!type) continue;
    if (!sheet.headers.some(h => normalize(h) === 'escuela proponente')) {
      throw new Error(`La hoja «${sheet.name}» no contiene Escuela Proponente.`);
    }
    for (const raw of sheet.rows) {
      const fields = new Map(Object.entries(raw).map(([k, v]) => [normalize(k), String(v || '').trim()]));
      const pick = (...keys) => keys.map(k => fields.get(normalize(k))).find(Boolean) || '';
      const data = {
        tipo_contacto: type, source: config.SOURCE_NAME,
        title: pick('Title'), first_name: pick('First Name'), last_name: pick('Last Name'),
        email: pick('mail', 'Email', 'Correo electrónico').toLowerCase(),
        country_name: pick('Country or Territory', 'Country', 'País'), phone: pick('Phone (Optional)', 'Phone'),
        job_title: type === 'ACADEMICO' ? pick('Job Title') : '',
        department_unit: type === 'ACADEMICO' ? pick('Department') : '',
        institution: type === 'ACADEMICO' ? pick('Institution') : '',
        subject_area: type === 'ACADEMICO' ? pick('Subject') : '',
        position: type === 'EMPLEADOR' ? pick('Position') : '',
        industry: type === 'EMPLEADOR' ? pick('Industry') : '',
        company_name: type === 'EMPLEADOR' ? pick('Company Name') : ''
      };
      // No convertir notas o filas que solo tienen año en contactos vacíos.
      if (!data.first_name && !data.last_name && !data.email && !data.institution && !data.company_name) continue;
      const validation = validateContact(data, type);
      rows.push({ key: `${sheet.name}:${raw._rowNum}`, sheet: sheet.name, rowNum: raw._rowNum,
        escuela: pick('Escuela Proponente'), data: { ...data, ...validation.sanitized },
        errors: Object.values(validation.errors), complete: validation.isValid });
    }
  }
  if (!rows.length) throw new Error('No se encontraron contactos en hojas de académicos o empleadores.');
  return rows;
}

function analyzeConsolidated(buffer) {
  const rows = extractRows(buffer);
  const db = getDb();
  const existing = db.prepare('SELECT * FROM contactos').all();
  const emails = new Map(), names = new Map(), batch = new Map();
  const add = (map, key, value) => { if (key) map.set(key, [...(map.get(key) || []), value]); };
  for (const c of existing) { add(emails, normalize(c.email_normalized), c); add(names, fullKey(c), c); }
  for (const r of rows) add(batch, r.data.email ? `email:${r.data.email}` : `name:${fullKey(r.data)}`, r);
  const seen = new Set();
  const summary = { totalAnalizados: rows.length, correctos: 0, nuevos: 0, actualizaciones: 0,
    pendientesRevision: 0, conErrores: 0, posiblesDuplicados: 0, duplicadosExactos: 0 };
  for (const r of rows) {
    const d = r.data;
    const identity = d.email ? `email:${d.email}` : `name:${fullKey(d)}`;
    const peers = batch.get(identity) || [];
    const matches = d.email && emails.has(d.email) ? emails.get(d.email) : names.get(fullKey(d)) || [];
    if ([r.escuela, ...Object.values(d)].some(value => /[<>]|[\"'`]\s+[a-z][\w-]*\s*=/i.test(String(value)))) {
      r.status = 'ERROR'; r.errors.unshift('Revise el contenido con etiquetas o atributos HTML antes de importar.');
    } else if (!r.escuela || (!d.email && !fullKey(d))) {
      r.status = 'ERROR';
      r.errors.unshift(!r.escuela ? 'Falta Escuela Proponente.' : 'Falta correo o nombre completo con organización para identificar el contacto.');
    } else if (new Set(peers.map(p => normalize(p.escuela))).size > 1 ||
        new Set(peers.map(p => p.data.tipo_contacto)).size > 1) {
      r.status = 'ERROR'; r.errors.unshift('El contacto figura con escuelas o tipos diferentes en el archivo; requiere revisión.');
    } else if (seen.has(identity)) {
      r.status = 'DUPLICADO_EXACTO'; r.errors = ['Fila repetida dentro del archivo; se omite.'];
    } else if (matches.length > 1 || (matches.length && matches[0].tipo_contacto !== d.tipo_contacto)) {
      r.status = 'ERROR'; r.errors.unshift('Coincidencia ambigua o conflicto de tipo con contactos existentes.');
    } else if (matches.length && matches[0].metodo_ingreso !== 'CARGA_MASIVA') {
      r.status = 'DUPLICADO_EXACTO'; r.errors = ['Ya registrado individualmente; se conserva su procedencia.'];
    } else if (matches.length) {
      r.existingId = matches[0].id;
      r.status = 'ACTUALIZAR_PROCEDENCIA';
      r.errors = ['Se actualizarán únicamente la procedencia administrativa y Escuela Proponente.'];
      summary.actualizaciones++;
    } else {
      r.status = r.complete ? 'CORRECTO' : 'PENDIENTE_REVISION';
      summary.nuevos++;
      if (!r.complete) summary.pendientesRevision++;
    }
    seen.add(identity);
    if (eligible.has(r.status)) summary.correctos++;
    else if (r.status === 'ERROR') summary.conErrores++;
    else summary.duplicadosExactos++;
  }
  return { success: true, summary, analyzedRows: rows, errorDetails: [] };
}

function schoolDepartment(db, school) {
  // Solo coincidencia exacta normalizada: no atribuir escuelas por semejanza parcial.
  const existing = db.prepare('SELECT * FROM departamentos').all().find(d => normalize(d.nombre) === normalize(school));
  if (existing) return existing;
  const id = `dep-qs-${crypto.createHash('sha256').update(normalize(school)).digest('hex').slice(0, 20)}`;
  db.prepare('INSERT OR IGNORE INTO departamentos (id, codigo, nombre, sede_id) VALUES (?, ?, ?, NULL)')
    .run(id, 'QS', school);
  return db.prepare('SELECT * FROM departamentos WHERE id = ?').get(id);
}

function importConsolidated(buffer, fileName, user) {
  if (user?.rol !== 'ADMIN') throw new Error('Solo el administrador autoriza la carga consolidada.');
  return runTransaction(db => {
    // Volver a leer el archivo original y consultar duplicados al confirmar.
    const analysis = analyzeConsolidated(buffer);
    const rows = analysis.analyzedRows.filter(r => eligible.has(r.status));
    if (!rows.length) throw new Error('No hay filas importables ni procedencias por actualizar.');
    const now = new Date().toISOString(), loteId = crypto.randomUUID();
    db.prepare(`INSERT INTO lotes_carga (id, nombre_archivo, tipo_contacto, total_filas, correctos,
      con_errores, posibles_duplicados, duplicados_exactos, cargado_por, created_at, detalles_json)
      VALUES (?, ?, 'CONSOLIDADO', ?, ?, ?, 0, ?, 'Administrador', ?, ?)`)
      .run(loteId, fileName, analysis.summary.totalAnalizados, rows.length, analysis.summary.conErrores,
        analysis.summary.duplicadosExactos, now, JSON.stringify(analysis.summary));
    let importedCount = 0, updatedCount = 0;
    const columns = ['id', 'tipo_contacto', 'source', 'title', 'first_name', 'last_name', 'email', 'email_normalized',
      'phone', 'country_name', 'sede_id', 'departamento_id', 'job_title', 'department_unit', 'institution',
      'subject_area', 'position', 'industry', 'company_name', 'estado', 'metodo_ingreso', 'lote_id',
      'recomienda_nombre', 'recomienda_email', 'created_by', 'created_by_name', 'created_at', 'es_consolidado', 'escuela_proponente'];
    const insert = db.prepare(`INSERT INTO contactos (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
    for (const row of rows) {
      const dep = schoolDepartment(db, row.escuela), id = row.existingId || crypto.randomUUID();
      let previous = null;
      if (row.existingId) {
        previous = db.prepare('SELECT * FROM contactos WHERE id = ?').get(id);
        db.prepare(`UPDATE contactos SET es_consolidado = 1, escuela_proponente = ?, departamento_id = ?,
          sede_id = ?, recomienda_nombre = 'Administrador', recomienda_email = '', updated_by = ?,
          updated_by_name = 'Administrador', updated_at = ? WHERE id = ?`)
          .run(row.escuela, dep.id, dep.sede_id || null, user.id, now, id);
        updatedCount++;
      } else {
        const c = { ...row.data, id, email_normalized: row.data.email || '', sede_id: dep.sede_id || null,
          departamento_id: dep.id, estado: row.complete ? 'VALIDADO' : 'NUEVO', metodo_ingreso: 'CARGA_MASIVA',
          lote_id: loteId, recomienda_nombre: 'Administrador', recomienda_email: '', created_by: user.id,
          created_by_name: 'Administrador', created_at: now, es_consolidado: 1, escuela_proponente: row.escuela };
        insert.run(...columns.map(key => Object.hasOwn(c, key) ? c[key] : ''));
        importedCount++;
      }
      db.prepare(`INSERT INTO auditoria (id, contacto_id, usuario_id, usuario_nombre, accion, detalles, created_at)
        VALUES (?, ?, ?, 'Administrador', ?, ?, ?)`).run(crypto.randomUUID(), id, user.id,
          previous ? 'ACTUALIZACION_PROCEDENCIA' : 'CREACION', JSON.stringify({ loteId, hoja: row.sheet,
            fila: row.rowNum, escuela_proponente: row.escuela, valores_anteriores: previous, errores_revision: row.errors }), now);
    }
    return { success: true, loteId, importedCount, updatedCount, summary: analysis.summary,
      message: `${importedCount} contactos importados y ${updatedCount} procedencias actualizadas.` };
  });
}

module.exports = { analyzeConsolidated, importConsolidated };
