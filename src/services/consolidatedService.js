const crypto = require('node:crypto');
const { getDb, runTransaction } = require('../database/db');
const { parseXlsxSheets } = require('./excelService');
const { validateContact } = require('../utils/validator');
const config = require('../config');
const { verifyReporter } = require('./funcionarioService');
const { departmentKey, equivalentDepartments, resolveDepartment } = require('../utils/departamentos');
const { normalizeDependency } = require('../utils/dependencyNames');

const normalize = value => String(value || '').trim().toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
const headerKey = value => normalize(value).replace(/[^a-z0-9]/g, '');
const aliases = {
  title: ['Title', 'Tratamiento', 'Título'], first_name: ['First Name', 'Nombre', 'Nombres'],
  last_name: ['Last Name', 'Apellido', 'Apellidos'], email: ['mail', 'Email', 'Correo electrónico', 'Correo'],
  country_name: ['Country or Territory', 'Country', 'País', 'País o territorio'], phone: ['Phone (Optional)', 'Phone', 'Teléfono'],
  job_title: ['Job Title', 'Cargo académico'], department_unit: ['Department', 'Departamento', 'Departamento / Unidad'],
  institution: ['Institution', 'Institución'], subject_area: ['Subject', 'Subject Area', 'Disciplina', 'Área temática'],
  position: ['Position', 'Cargo', 'Puesto'], industry: ['Industry', 'Industria', 'Industria / Sector'],
  company_name: ['Company Name', 'Empresa', 'Nombre de empresa'], escuela: ['Escuela Proponente', 'Escuela / Unidad proponente'],
  reportedType: ['Tipo de contacto'], year: ['Año de reporte', 'Año'], director: ['Director', 'Director (a)'],
  director_email: ['Correo director', 'Correo del director', 'Correo electrónico director', 'Correo electrónico del director', 'Email director', 'Director email'],
  authorization: ['Autorización de contacto', 'Autorización', 'Autoriza contacto']
};
function resolveDirector(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@(itcr\.ac\.cr|tec\.ac\.cr)$/.test(normalized)) return { error: 'Indique un Correo director institucional válido.' };
  const director = verifyReporter(normalized);
  if (!director) return { error: 'Correo director no corresponde a un funcionario activo del padrón.' };
  // Un director conserva su identidad aunque el libro le asigne varias dependencias.
  // Escuela Proponente determina cada asignación, sin cambiar su ficha del padrón.
  return { id: director.id, email: director.email_normalized, nombre: director.nombre, departamento_id: director.departamento_id,
    sede_id: director.sede_id, dependencias: director.dependencias_autorizadas, version: director.version };
}

function departmentPlan(db, row, existing) {
  const key = departmentKey(row.escuela);
  const explicitSede = /-\s*cartago$/i.test(normalize(row.escuela)) ? 'sede-cartago' : null;
  const all = db.prepare('SELECT * FROM departamentos WHERE activo = 1 ORDER BY id').all();
  const matches = all.filter(d => departmentKey(d.nombre) === key && (!explicitSede || d.sede_id === explicitSede));
  const memberships = (row.director?.dependencias || []).filter(d => departmentKey(d.nombre) === key && (!explicitSede || d.sede_id === explicitSede));
  const primary = memberships.filter(d => d.sede_id === row.director.sede_id);
  const own = memberships.length === 1 ? memberships[0] : primary.length === 1 ? primary[0] : null;
  const old = existing ? matches.find(d => d.id === existing.departamento_id) : null;
  const bySede = matches.filter(d => d.sede_id === (explicitSede || row.director?.sede_id));
  const chosen = own || old || (new Set(matches.map(d => d.sede_id)).size === 1 ? matches[0] : bySede[0]);
  const canonical = chosen ? equivalentDepartments(db, chosen.id, true)[0] : null;
  const membership = canonical && memberships.find(d => d.id === canonical.id || d.alias_ids?.includes(canonical.id));
  const sedeId = canonical?.sede_id || explicitSede || null;
  return { id: canonical?.id || null, nombre: normalizeDependency(row.escuela), sede_id: sedeId,
    sede_nombre: sedeId ? db.prepare('SELECT nombre FROM sedes WHERE id = ?').get(sedeId)?.nombre || '' : 'Sede pendiente de revisión',
    pertenencia_verificada: Boolean(membership), origen_pertenencia: membership?.origen || null,
    criterio: own ? 'DEPENDENCIA_DEL_CORREO' : old ? 'PROCEDENCIA_EXISTENTE' : canonical ? 'CATALOGO_Y_SEDE' : explicitSede ? 'SEDE_EN_ESCUELA' : 'SEDE_PENDIENTE' };
}
const missing = value => !String(value || '').trim() || /^(?:definir|por definir|pendiente|n\/a|sin datos|sin informacion|no disponible|-)$/i.test(normalize(value));
const fullKey = c => c.first_name && c.last_name && (c.institution || c.company_name)
  ? [c.first_name, c.last_name, c.institution || c.company_name].map(normalize).join('|') : '';
const identityKey = c => c.tipo_contacto + ':' + (c.email ? 'email:' + c.email : 'name:' + fullKey(c));
const eligible = new Set(['CORRECTO', 'PENDIENTE_REVISION', 'ACTUALIZAR_PROCEDENCIA']);

function extractRows(buffer) {
  const rows = [], sheets = [];
  const parsed = parseXlsxSheets(buffer, { headerMatch: cells => {
    const keys = new Set(cells.map(headerKey));
    return aliases.first_name.some(k => keys.has(headerKey(k))) && aliases.email.some(k => keys.has(headerKey(k)));
  } });
  for (const sheet of parsed) {
    const name = normalize(sheet.name);
    const type = name.includes('emplead') ? 'EMPLEADOR' : name.includes('academic') ? 'ACADEMICO' : null;
    if (!type) { sheets.push({ name: sheet.name, ignored: true, total: sheet.rows.length }); continue; }
    const mapping = {}, mappedColumns = new Set(), warnings = [];
    for (const [field, names] of Object.entries(aliases)) {
      const found = sheet.headers.map((h, i) => names.some(n => headerKey(n) === headerKey(h)) ? i : -1).filter(i => i >= 0);
      if (found.length > 1) throw new Error(`La hoja «${sheet.name}» tiene columnas ambiguas para ${names[0]}; deje una sola columna.`);
      if (found.length) { mapping[field] = sheet.headers[found[0]]; mappedColumns.add(found[0]); }
    }
    const required = ['first_name', 'last_name', 'email', 'escuela', type === 'ACADEMICO' ? 'institution' : 'company_name'];
    const absent = required.filter(k => !mapping[k]);
    if (absent.length) throw new Error(`La hoja «${sheet.name}» no contiene las columnas ${absent.map(k => aliases[k][0]).join(', ')}.`);
    const optional = ['title', 'country_name', ...(type === 'ACADEMICO' ? ['subject_area', 'department_unit', 'job_title'] : ['industry', 'position'])];
    if (!mapping.director_email) warnings.push('No se encontró Correo director: la consulta se limita a las pertenencias de Escuela Proponente registradas en el padrón.');
    for (const k of optional) if (!mapping[k]) warnings.push(`No se encontró ${aliases[k][0]}; los contactos sin este dato quedarán pendientes.`);
    const info = { name: sheet.name, type, headerRow: sheet.headerRowNum, total: 0, ignored: false, warnings,
      columns: Object.entries(mapping).map(([field, header]) => ({ field, header, label: aliases[field][0] })),
      ignoredColumns: sheet.headers.filter(h => h && !Object.values(mapping).includes(h)) };
    sheets.push(info);
    for (const raw of sheet.rows) {
      const original = {}, sourceValues = {}, notes = [];
      for (const [field, header] of Object.entries(mapping)) {
        sourceValues[header] = String(raw[header] ?? '');
        const value = sourceValues[header].trim().replace(/\s+/g, ' ');
        original[field] = value;
        if (missing(value) && value) notes.push(`${aliases[field][0]}: «${value}» se trata como dato faltante.`);
      }
      const data = { tipo_contacto: type, source: config.SOURCE_NAME };
      for (const field of Object.keys(aliases).filter(k => !['escuela', 'reportedType', 'year', 'director', 'director_email', 'authorization'].includes(k))) {
        data[field] = missing(original[field]) ? '' : original[field];
      }
      data.email = data.email.toLowerCase();
      // No convertir notas o filas que solo tienen año en contactos vacíos.
      if (!data.first_name && !data.last_name && !data.email && !data.institution && !data.company_name) continue;
      if (rows.length >= config.MAX_IMPORT_ROWS) throw new Error(`Divida el consolidado en archivos de hasta ${config.MAX_IMPORT_ROWS} contactos.`);
      const validation = validateContact(data, type);
      const fieldSource = { country: 'country_name', department: 'department_unit', subject: 'subject_area' };
      // Conservar el histórico como pendiente sin aplicar las exigencias de exportación QS.
      // Un correo mal formado sigue requiriendo corrección, pero un correo TEC es un dato real.
      const invalidFields = Object.keys(validation.errors).filter(k => k === 'email' && !missing(data.email) && !/@(?:itcr|tec)\.ac\.cr$/i.test(data.email));
      const blockers = invalidFields.map(k => validation.errors[k]);
      const director = mapping.director_email ? resolveDirector(original.director_email) : null;
      const review = Object.entries(validation.errors).map(([field, message]) => missing(data[fieldSource[field] || field])
        ? `${aliases[fieldSource[field] || field]?.[0] || field}: sin dato, se conserva vacío.`
        : field === 'email' && /@(?:itcr|tec)\.ac\.cr$/i.test(data.email)
          ? 'Correo institucional del TEC: se conserva en el histórico como pendiente, no es un par externo para la exportación QS.'
          : `${message} Se conserva el valor original como pendiente de revisión.`);
      if (director?.error) review.push(director.error + ' Se conserva el correo del archivo y su vinculación queda pendiente.');
      const literalMarkup = [original.escuela, ...Object.values(data)].some(value => /[<>]|[\"'`]\s+[a-z][\w-]*\s*=/i.test(String(value)));
      if (literalMarkup) review.push('Los caracteres y etiquetas se conservan como texto literal, sin ejecutarse como HTML.');
      if (Object.values(data).some(value => String(value).length > 500)) blockers.push('Un campo supera 500 caracteres; revise su longitud.');
      if (director && !director.error && original.director && normalize(original.director) !== normalize(director.nombre)) notes.push('Observación informativa: el nombre del director difiere del padrón; la identidad se confirma por su correo y esta diferencia no impide importar.');
      if (!mapping.director_email) notes.push('Sin vinculación por Correo director; visible únicamente para administración.');
      if (original.reportedType && headerKey(original.reportedType) !== headerKey(type)) blockers.push('El tipo indicado en la fila no corresponde a la hoja.');
      if (String(original.escuela || '').length > 180) blockers.push('Escuela Proponente no debe superar 180 caracteres.');
      if (/^(no|no autoriza|rechazado|rechazada)$/i.test(normalize(original.authorization))) blockers.push('La autorización de contacto indica una negativa; la fila no se incorporará.');
      if (original.year && !/^(19|20)\d{2}$/.test(original.year)) notes.push('Año de reporte no reconocido; revise el dato histórico en el archivo.');
      if (!original.authorization) notes.push('El archivo no indica autorización de contacto, este dato no se completa automáticamente.');
      for (const issue of raw._cellIssues || []) if (mappedColumns.has(issue.column)) blockers.push(`${sheet.headers[issue.column]} contiene ${issue.kind === 'ERROR' ? 'un error de Excel' : 'una fórmula; conviértala a valores antes de cargar'}.`);
      info.total++;
      rows.push({ key: `${sheet.name}:${raw._rowNum}`, sheet: sheet.name, rowNum: raw._rowNum,
        escuela: missing(original.escuela) ? '' : original.escuela, data: { ...data, ...validation.sanitized },
        director: director && !director.error ? director : null,
        metadata: { director_email: original.director_email?.toLowerCase() || '', year: original.year || '', director: original.director || '', authorization: original.authorization || '', director_column_present: Boolean(mapping.director_email), source_values: sourceValues },
        errors: review, fieldErrors: validation.errors, blockers,
        warnings: [...notes, ...Object.values(validation.warnings)], complete: validation.isValid && !literalMarkup && !director?.error });
    }
  }
  if (!rows.length) throw new Error('No se encontraron contactos en hojas de académicos o empleadores.');
  return { rows, sheets };
}

function analyzeConsolidated(buffer) {
  const { rows, sheets } = extractRows(buffer);
  const db = getDb();
  const existing = db.prepare('SELECT id,email_normalized,first_name,last_name,institution,company_name,tipo_contacto,metodo_ingreso,es_consolidado,version,departamento_id FROM contactos').all();
  const versions = new Map(existing.map(c => [c.id, c.version]));
  const emails = new Map(), names = new Map(), batch = new Map(), batchNames = new Map();
  const add = (map, key, value) => { if (key) map.set(key, [...(map.get(key) || []), value]); };
  for (const c of existing) { add(emails, c.tipo_contacto + ':' + normalize(c.email_normalized), c); add(names, fullKey(c) ? c.tipo_contacto + ':' + fullKey(c) : '', c); }
  for (const r of rows) { add(batch, identityKey(r.data), r); add(batchNames, fullKey(r.data) ? r.data.tipo_contacto + ':' + fullKey(r.data) : '', r); }
  const seen = new Set();
  const summary = { totalAnalizados: rows.length, correctos: 0, nuevos: 0, nuevosCompletos: 0, actualizaciones: 0,
    pendientesRevision: 0, conErrores: 0, posiblesDuplicados: 0, duplicadosExactos: 0 };
  for (const r of rows) {
    const d = r.data;
    const identity = identityKey(d);
    const peers = batch.get(identity) || [];
    const emailKey = d.tipo_contacto + ':' + d.email, nameKey = d.tipo_contacto + ':' + fullKey(d);
    const matches = d.email && emails.has(emailKey) ? emails.get(emailKey) : (fullKey(d) ? names.get(nameKey) : []) || [];
    r.departamento = departmentPlan(db, r, matches.length === 1 ? matches[0] : null);
    if (r.director && !r.departamento.pertenencia_verificada) r.warnings.push('La pertenencia de este correo a Escuela Proponente no consta en el padrón ni en asignaciones consolidadas previas. Al confirmar, el administrador registra esta asignación del consolidado; no se modifica la ficha del funcionario.');
    if (!r.departamento.sede_id) r.warnings.push('La sede no se identifica de forma inequívoca. Se conservará sin asignar sede, junto con Escuela Proponente, sin bloquear la carga histórica.');
    if (r.blockers.length) {
      r.status = 'ERROR'; r.errors = [...new Set([...r.blockers, ...r.errors])];
    } else if (!r.escuela || (!d.email && !fullKey(d))) {
      r.status = 'ERROR';
      r.errors.unshift(!r.escuela ? 'Falta Escuela Proponente.' : 'Falta correo o nombre completo con organización para identificar el contacto.');
    } else if (new Set(peers.map(p => normalize(p.escuela))).size > 1 ||
        new Set(peers.map(p => p.data.tipo_contacto)).size > 1 ||
        new Set(peers.map(p => p.director?.id || '')).size > 1) {
      r.status = 'ERROR'; r.errors.unshift('El contacto figura con escuelas, directores o tipos diferentes en el archivo; requiere revisión.');
    } else if (new Set((batchNames.get(nameKey) || []).map(p => p.data.email).filter(Boolean)).size > 1) {
      r.status = 'POSIBLE_DUPLICADO'; r.errors.unshift('El mismo nombre y organización aparecen con correos diferentes en el archivo; revise la identidad.');
    } else if (new Set(peers.map(p => JSON.stringify(Object.fromEntries(Object.entries(p.data).map(([k, v]) => [k, normalize(v)]))))).size > 1) {
      r.status = 'POSIBLE_DUPLICADO'; r.errors.unshift('El mismo contacto tiene datos diferentes en el archivo; corrija o unifique las filas antes de importar.');
    } else if (seen.has(identity)) {
      r.status = 'DUPLICADO_EXACTO'; r.errors = ['Fila repetida dentro del archivo; se omite.'];
    } else if (matches.length > 1 || (matches.length && matches[0].tipo_contacto !== d.tipo_contacto)) {
      r.status = 'ERROR'; r.errors.unshift('Coincidencia ambigua o conflicto de tipo con contactos existentes.');
    } else if (matches.length && d.email && normalize(matches[0].email_normalized) !== d.email) {
      r.status = 'POSIBLE_DUPLICADO'; r.errors.unshift('Coincide el nombre y la organización, pero el correo es diferente; se omite hasta revisar la identidad.');
    } else if (matches.length && !matches[0].es_consolidado) {
      r.status = 'DUPLICADO_EXACTO'; r.errors = ['Ya registrado por un funcionario; se conservan su autoría y procedencia.'];
    } else if (matches.length) {
      r.existingId = matches[0].id;
      r.status = 'ACTUALIZAR_PROCEDENCIA';
      r.errors = ['Se actualizarán únicamente la procedencia administrativa, Escuela Proponente y vinculación del director.'];
      summary.actualizaciones++;
    } else {
      r.status = r.complete ? 'CORRECTO' : 'PENDIENTE_REVISION';
      summary.nuevos++;
      if (!r.complete) summary.pendientesRevision++;
      else summary.nuevosCompletos++;
    }
    seen.add(identity);
    if (eligible.has(r.status)) summary.correctos++;
    else if (r.status === 'ERROR') summary.conErrores++;
    else if (r.status === 'POSIBLE_DUPLICADO') summary.posiblesDuplicados++;
    else summary.duplicadosExactos++;
  }
  for (const sheet of sheets) sheet.counts = Object.fromEntries(['CORRECTO', 'PENDIENTE_REVISION', 'ACTUALIZAR_PROCEDENCIA', 'ERROR', 'POSIBLE_DUPLICADO', 'DUPLICADO_EXACTO'].map(status => [status, rows.filter(r => r.sheet === sheet.name && r.status === status).length]));
  summary.asignacionesPorConfirmar = rows.filter(r => eligible.has(r.status) && r.director && !r.departamento.pertenencia_verificada).length;
  summary.sedesPorRevisar = rows.filter(r => eligible.has(r.status) && !r.departamento.sede_id).length;
  const analysisHash = crypto.createHash('sha256').update(buffer).update(JSON.stringify(rows.map(r =>
    [r.key, r.status, r.existingId || null, r.existingId ? versions.get(r.existingId) : null, r.director?.id, r.director?.version, r.director?.departamento_id, r.departamento]))).digest('hex');
  return { success: true, summary, sheets, analysisHash, analyzedRows: rows, errorDetails: rows.filter(r => r.errors.length).map(r => ({ sheet: r.sheet, rowNum: r.rowNum, errors: r.errors })) };
}

function schoolDepartment(db, row) {
  const id = row.departamento.id || resolveDepartment(db, row.escuela, row.departamento.sede_id, { exactSede: true });
  return db.prepare('SELECT * FROM departamentos WHERE id = ?').get(id);
}

function importConsolidated(buffer, fileName, user, options = {}) {
  if (user?.rol !== 'ADMIN') throw new Error('Solo el administrador autoriza la carga consolidada.');
  return runTransaction(db => {
    // Volver a leer el archivo original y consultar duplicados al confirmar.
    const analysis = analyzeConsolidated(buffer);
    if (options.analysisHash && options.analysisHash !== analysis.analysisHash) throw Object.assign(new Error('El análisis cambió desde la vista previa. Analice nuevamente el archivo antes de confirmar.'), { statusCode: 409 });
    const rows = analysis.analyzedRows.filter(r => eligible.has(r.status) && (r.status !== 'PENDIENTE_REVISION' || options.includePending === true));
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
      'recomienda_nombre', 'recomienda_email', 'created_by', 'created_by_name', 'created_at', 'es_consolidado', 'escuela_proponente', 'director_email', 'director_funcionario_id', 'autorizacion_contacto'];
    const insert = db.prepare(`INSERT INTO contactos (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
    for (const row of rows) {
      const dep = schoolDepartment(db, row), id = row.existingId || crypto.randomUUID();
      let previous = null;
      if (row.existingId) {
        previous = db.prepare('SELECT * FROM contactos WHERE id = ?').get(id);
        const keepDirector = !row.metadata.director_column_present && previous.departamento_id === dep.id;
        db.prepare(`UPDATE contactos SET es_consolidado = 1, escuela_proponente = ?, departamento_id = ?,
          sede_id = ?, director_email = ?, director_funcionario_id = ?, autorizacion_contacto = ?, recomienda_nombre = 'Administrador', recomienda_email = '', updated_by = ?,
          updated_by_name = 'Administrador', updated_at = ? WHERE id = ?`)
          .run(row.escuela, dep.id, dep.sede_id || null, row.director?.email || (row.metadata.director_column_present ? row.metadata.director_email : keepDirector ? previous.director_email : '') || '', row.director?.id || (keepDirector ? previous.director_funcionario_id : null) || null,
            row.metadata.authorization || previous.autorizacion_contacto || '', user.id, now, id);
        updatedCount++;
      } else {
        const c = { ...row.data, id, email_normalized: row.data.email || '', sede_id: dep.sede_id || null,
          departamento_id: dep.id, estado: row.complete ? 'VALIDADO' : 'NUEVO', metodo_ingreso: 'CARGA_MASIVA',
          lote_id: loteId, recomienda_nombre: 'Administrador', recomienda_email: '', created_by: user.id,
          created_by_name: 'Administrador', created_at: now, es_consolidado: 1, escuela_proponente: row.escuela,
          director_email: row.director?.email || row.metadata.director_email || '', director_funcionario_id: row.director?.id || null, autorizacion_contacto: row.metadata.authorization };
        insert.run(...columns.map(key => Object.hasOwn(c, key) ? c[key] : ''));
        importedCount++;
      }
      db.prepare(`INSERT INTO auditoria (id, contacto_id, usuario_id, usuario_nombre, accion, detalles, created_at)
        VALUES (?, ?, ?, 'Administrador', ?, ?, ?)`).run(crypto.randomUUID(), id, user.id,
          previous ? 'ACTUALIZACION_PROCEDENCIA' : 'CREACION', JSON.stringify({ loteId, hoja: row.sheet,
            fila: row.rowNum, escuela_proponente: row.escuela, valores_anteriores: previous, errores_revision: row.errors,
            origen_consolidado: row.metadata, verificacion_dependencia: row.departamento, observaciones: row.warnings }), now);
    }
    return { success: true, loteId, importedCount, updatedCount, skippedCount: analysis.summary.totalAnalizados - rows.length, summary: analysis.summary,
      message: `${importedCount} contactos importados y ${updatedCount} procedencias actualizadas.` };
  });
}

module.exports = { analyzeConsolidated, importConsolidated };
