const { getDb, runTransaction } = require('../database/db');
const { generateXlsx, TEMPLATES } = require('./excelService');
const { validateContact } = require('../utils/validator');
const config = require('../config');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { logAudit } = require('./contactService');

/**
 * Valida y genera el archivo Excel oficial para QS de contactos aprobados
 */
function exportContactsToXlsx(tipo, filters = {}, user) {
  const db = getDb();
  const contactType = tipo.toUpperCase();

  if (!['ACADEMICO', 'EMPLEADOR'].includes(contactType)) {
    throw new Error('Tipo de contacto inválido para exportación.');
  }

  // Filtrar solo contactos validados o corregidos
  let sql = `
    SELECT * FROM contactos
    WHERE tipo_contacto = ?
    AND estado IN ('VALIDADO', 'CORREGIDO', 'EXPORTADO')
  `;
  const params = [contactType];
  if (filters.campania_id === 'SIN_ASIGNAR') sql += ' AND campania_id IS NULL';
  else if (filters.campania_id) { sql += ' AND campania_id = ?'; params.push(filters.campania_id); }

  if (filters.sede_id) {
    sql += ' AND sede_id = ?';
    params.push(filters.sede_id);
  }
  if (filters.departamento_id) {
    sql += ' AND departamento_id = ?';
    params.push(filters.departamento_id);
  }
  if (filters.fecha_inicio) {
    sql += ' AND date(created_at) >= date(?)';
    params.push(filters.fecha_inicio);
  }
  if (filters.fecha_fin) {
    sql += ' AND date(created_at) <= date(?)';
    params.push(filters.fecha_fin);
  }

  sql += ' ORDER BY created_at ASC LIMIT 5001';
  const contacts = db.prepare(sql).all(...params);
  if (contacts.length > 5000) throw Object.assign(new Error('La exportación supera 5000 contactos. Utilice una campaña o un período menor.'), { statusCode: 413 });

  // 1. Re-validación estricta previa a la exportación
  const validRows = [];
  const invalidRows = [];
  const templateConfig = TEMPLATES[contactType];

  for (const c of contacts) {
    const val = validateContact(c, contactType);
    if (!val.isValid) {
      invalidRows.push({ contact: c, errors: val.errors });
      continue;
    }

    if (contactType === 'ACADEMICO') {
      validRows.push([
        config.SOURCE_NAME,
        c.title,
        c.first_name,
        c.last_name,
        c.job_title,
        c.department_unit,
        c.institution,
        c.country_name,
        c.email,
        c.subject_area,
        c.phone || ''
      ]);
    } else {
      validRows.push([
        config.SOURCE_NAME,
        c.title,
        c.first_name,
        c.last_name,
        c.position,
        c.industry,
        c.company_name,
        c.country_name,
        c.email,
        c.phone || ''
      ]);
    }
  }

  // 2. Generar el binario XLSX OpenXML
  const xlsxBuffer = generateXlsx(templateConfig.sheetName, templateConfig.headers, validRows);

  const excluded = new Set(invalidRows.map(row => row.contact.id));

  return {
    buffer: xlsxBuffer,
    totalProcesados: contacts.length,
    totalExportados: validRows.length,
    totalInconsistentes: invalidRows.length,
    inconsistencias: invalidRows,
    manifest: contacts.filter(c => !excluded.has(c.id)).map(c => ({ id: c.id, version: c.version })),
    filename: `TEC_QS_${contactType}_${new Date().toISOString().slice(0, 10)}.xlsx`
  };
}

function fail(message, statusCode = 409) { return Object.assign(new Error(message), { statusCode }); }
function requireAdmin(user) { if (user?.rol !== 'ADMIN') throw fail('Se requiere administración.', 403); }
function batch(id) {
  const item = getDb().prepare('SELECT * FROM exportaciones WHERE id = ?').get(id);
  if (!item) throw fail('Lote de exportación no encontrado.', 404);
  return item;
}
function metadata(item) {
  const { id, tipo, estado, total, excluidos, created_at, recibido_at, confirmado_at } = item;
  return { id, tipo, estado, total, excluidos, created_at, recibido_at, confirmado_at,
    filename: `TEC_QS_${tipo}_${id}.xlsx`, downloadUrl: `/api/export/lotes/${id}/download` };
}
function listBatches(user) {
  requireAdmin(user);
  return getDb().prepare('SELECT * FROM exportaciones ORDER BY created_at DESC LIMIT 50').all().map(metadata);
}
function prepareExport(tipo, filters, user) {
  requireAdmin(user);
  const result = exportContactsToXlsx(tipo, filters, user);
  if (!result.totalExportados) throw fail('No hay contactos completos para exportar con los filtros seleccionados.', 422);
  const id = crypto.randomUUID();
  const file = `lote_${id}.xlsx`;
  const target = path.join(config.PATHS.EXPORTS, file);
  fs.writeFileSync(target, result.buffer, { flag: 'wx' });
  try {
    getDb().prepare(`INSERT INTO exportaciones (id,tipo,estado,archivo,sha256,manifiesto,total,excluidos,created_by,created_at)
      VALUES (?,?,'GENERADO',?,?,?,?,?,?,?)`).run(id, tipo.toUpperCase(), file,
      crypto.createHash('sha256').update(result.buffer).digest('hex'), JSON.stringify(result.manifest),
      result.totalExportados, result.totalInconsistentes, user.id, new Date().toISOString());
  } catch (err) { fs.rmSync(target, { force: true }); throw err; }
  return { ...metadata(batch(id)), inconsistencias: result.inconsistencias.slice(0, 20).map(row => ({ id: row.contact.id, errors: row.errors })) };
}
function downloadBatch(id, user) {
  requireAdmin(user);
  const item = batch(id);
  if (!/^lote_[a-f0-9-]+\.xlsx$/.test(item.archivo)) throw fail('Archivo de lote inválido.');
  const target = path.join(config.PATHS.EXPORTS, item.archivo);
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024) throw fail('El archivo no está disponible para descarga.');
  const buffer = fs.readFileSync(target);
  if (crypto.createHash('sha256').update(buffer).digest('hex') !== item.sha256) throw fail('El archivo del lote cambió. Genere un lote nuevo.');
  return { buffer, filename: metadata(item).filename };
}
function receiveBatch(id, user) {
  requireAdmin(user);
  const item = batch(id);
  if (item.estado === 'GENERADO') getDb().prepare("UPDATE exportaciones SET estado='RECIBIDO_NAVEGADOR', recibido_at=? WHERE id=?")
    .run(new Date().toISOString(), id);
  return metadata(batch(id));
}
function confirmBatch(id, user, confirmed) {
  requireAdmin(user);
  if (confirmed !== true) throw fail('Confirme que realizó el envío a QS.', 400);
  return runTransaction(db => {
    const item = batch(id);
    if (item.estado === 'CONFIRMADO_QS') return metadata(item);
    if (item.estado !== 'RECIBIDO_NAVEGADOR') throw fail('Descargue el lote antes de confirmar el envío.');
    const manifest = JSON.parse(item.manifiesto);
    const contacts = manifest.map(entry => db.prepare('SELECT * FROM contactos WHERE id=?').get(entry.id));
    if (contacts.some((c, i) => !c || c.version !== manifest[i].version || !validateContact(c, c.tipo_contacto).isValid)) {
      throw fail('Hay contactos modificados o eliminados desde la preparación. Genere y revise un lote nuevo.');
    }
    const now = new Date().toISOString();
    for (const contact of contacts) {
      db.prepare("UPDATE contactos SET estado='EXPORTADO',updated_by=?,updated_by_name=?,updated_at=? WHERE id=? AND estado!='EXPORTADO'")
        .run(user.id, user.nombre_completo || 'Administrador', now, contact.id);
      logAudit(db, contact.id, { ...user, nombre_completo: user.nombre_completo || 'Administrador' }, 'EXPORTACION',
        { lote: id, confirmacion: 'ENVIO_QS_DECLARADO_POR_ADMINISTRADOR', sha256: item.sha256 });
    }
    db.prepare("UPDATE exportaciones SET estado='CONFIRMADO_QS',confirmado_at=? WHERE id=?").run(now, id);
    return metadata(batch(id));
  });
}

module.exports = {
  exportContactsToXlsx, prepareExport, listBatches, downloadBatch, receiveBatch, confirmBatch
};
