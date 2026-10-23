const { getDb, runTransaction } = require('../database/db');
const { generateXlsx, TEMPLATES } = require('./excelService');
const { validateContact } = require('../utils/validator');
const config = require('../config');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { logAudit } = require('./contactService');
const { exportValidation } = require('./contactQuality');

/**
 * Valida y genera el archivo Excel oficial para QS de contactos aprobados
 */
function exportContactsToXlsx(tipo, filters = {}, user, options = {}) {
  if (options.includeHistorical) requireAdmin(user);
  const includeHistorical = options.includeHistorical === true;
  const db = getDb();
  const contactType = tipo.toUpperCase();

  if (!['ACADEMICO', 'EMPLEADOR'].includes(contactType)) {
    throw new Error('Tipo de contacto inválido para exportación.');
  }

  // Filtrar solo contactos validados o corregidos
  let sql = `
    SELECT * FROM contactos
    WHERE tipo_contacto = ?
    AND (estado IN ('VALIDADO', 'CORREGIDO', 'EXPORTADO')${includeHistorical ? " OR (es_consolidado = 1 AND estado = 'NUEVO')" : ''})
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

  // El administrador declara la aceptación previa al incluir el consolidado histórico.
  // Sus observaciones se conservan; los registros de funcionarios mantienen la validación estricta.
  const validRows = [];
  const invalidRows = [];
  const manifest = [];
  const templateConfig = TEMPLATES[contactType];

  for (const c of contacts) {
    const val = exportValidation(c, includeHistorical);
    if (!val.isValid) {
      invalidRows.push({ contact: c, errors: val.errors });
      continue;
    }
    manifest.push({ id: c.id, version: c.version, historico_con_observaciones: Boolean(val.historicalWithObservations),
      observaciones: val.historicalWithObservations ? val.errors : {} });

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

  return {
    buffer: xlsxBuffer,
    totalProcesados: contacts.length,
    totalExportados: validRows.length,
    totalInconsistentes: invalidRows.length,
    inconsistencias: invalidRows,
    manifest,
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
  const { id, tipo, estado, total, excluidos, created_at, recibido_at, confirmado_at, anulado_at, motivo_anulacion } = item;
  const historicalCount = JSON.parse(item.manifiesto).filter(entry => entry.historico_con_observaciones).length;
  return { id, tipo, estado, total, excluidos, created_at, recibido_at, confirmado_at, anulado_at, motivo_anulacion,
    incluye_historicos: Boolean(item.incluye_historicos), completos: total - historicalCount, historicos_con_observaciones: historicalCount,
    filename: `TEC_QS_${tipo}_${id}.xlsx`, downloadUrl: `/api/export/lotes/${id}/download` };
}
function listBatches(user) {
  requireAdmin(user);
  return getDb().prepare('SELECT * FROM exportaciones ORDER BY created_at DESC LIMIT 50').all().map(metadata);
}
function prepareExport(tipo, filters, user, options = {}) {
  requireAdmin(user);
  const result = exportContactsToXlsx(tipo, filters, user, options);
  if (!result.totalExportados) throw fail('No hay contactos exportables con los filtros seleccionados.', 422);
  const id = crypto.randomUUID();
  const file = `lote_${id}.xlsx`;
  const target = path.join(config.PATHS.EXPORTS, file);
  fs.writeFileSync(target, result.buffer, { flag: 'wx' });
  try {
    runTransaction(db => {
      db.prepare(`INSERT INTO exportaciones (id,tipo,estado,archivo,sha256,manifiesto,total,excluidos,created_by,created_at,incluye_historicos)
        VALUES (?,?,'GENERADO',?,?,?,?,?,?,?,?)`).run(id, tipo.toUpperCase(), file,
        crypto.createHash('sha256').update(result.buffer).digest('hex'), JSON.stringify(result.manifest),
        result.totalExportados, result.totalInconsistentes, user.id, new Date().toISOString(), options.includeHistorical === true ? 1 : 0);
      logAudit(db, null, { ...user, nombre_completo: user.nombre_completo || 'Administrador' }, 'PREPARACION_EXPORTACION', {
        lote: id, incluye_historicos: options.includeHistorical === true,
        criterio: options.includeHistorical === true ? 'CONSOLIDADO_PREVIAMENTE_ACEPTADO_POR_QS_DECLARADO_POR_ADMINISTRACION' : 'VALIDACION_COMPLETA',
        historicos_con_observaciones: result.manifest.filter(entry => entry.historico_con_observaciones).length
      });
    });
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
  if (item.estado === 'ANULADO') throw fail('El lote está anulado. Prepare un lote nuevo.');
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
    if (contacts.some((c, i) => !c || c.version !== manifest[i].version || !exportValidation(c, item.incluye_historicos === 1).isValid)) {
      throw fail('Hay contactos modificados o eliminados desde la preparación. Genere y revise un lote nuevo.');
    }
    const now = new Date().toISOString();
    for (const contact of contacts) {
      db.prepare("UPDATE contactos SET estado='EXPORTADO',updated_by=?,updated_by_name=?,updated_at=? WHERE id=? AND estado!='EXPORTADO'")
        .run(user.id, user.nombre_completo || 'Administrador', now, contact.id);
      logAudit(db, contact.id, { ...user, nombre_completo: user.nombre_completo || 'Administrador' }, 'EXPORTACION',
        { lote: id, confirmacion: 'ENVIO_QS_DECLARADO_POR_ADMINISTRADOR', sha256: item.sha256,
          estado_anterior: contact.estado, incluye_historicos: Boolean(item.incluye_historicos),
          version_confirmada: db.prepare('SELECT version FROM contactos WHERE id=?').get(contact.id).version });
    }
    db.prepare("UPDATE exportaciones SET estado='CONFIRMADO_QS',confirmado_at=? WHERE id=?").run(now, id);
    return metadata(batch(id));
  });
}

function cancelBatch(id, user, confirmed, reason) {
  requireAdmin(user);
  if (confirmed !== true) throw fail('Confirme la anulación del lote.', 400);
  if (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 500) {
    throw fail('Indique un motivo de anulación de entre 3 y 500 caracteres.', 400);
  }
  return runTransaction(db => {
    const item = batch(id);
    if (item.estado === 'ANULADO') return metadata(item);
    if (!['GENERADO', 'RECIBIDO_NAVEGADOR', 'CONFIRMADO_QS'].includes(item.estado)) throw fail('El estado del lote no admite anulación.');
    const actor = { ...user, nombre_completo: user.nombre_completo || 'Administrador' };
    const now = new Date().toISOString(), motive = reason.trim();
    let restoredCount = 0;
    if (item.estado === 'CONFIRMADO_QS') {
      // Un mismo contacto puede pertenecer a otros lotes cuyo envío sigue confirmado.
      const stillExported = new Set(db.prepare("SELECT manifiesto FROM exportaciones WHERE estado='CONFIRMADO_QS' AND id!=?")
        .all(id).flatMap(other => JSON.parse(other.manifiesto).map(entry => entry.id)));
      for (const entry of JSON.parse(item.manifiesto)) {
        const contact = db.prepare('SELECT * FROM contactos WHERE id=?').get(entry.id);
        let restoredState = contact?.estado || null, criterion = 'SIN_CAMBIO';
        if (contact?.estado === 'EXPORTADO' && !stillExported.has(entry.id)) {
          const history = db.prepare("SELECT detalles FROM auditoria WHERE contacto_id=? AND accion='EXPORTACION' ORDER BY created_at DESC, rowid DESC")
            .all(entry.id).map(a => JSON.parse(a.detalles));
          const previous = history.find(a => ['VALIDADO', 'CORREGIDO'].includes(a.estado_anterior));
          const latest = history[0];
          const changed = latest?.version_confirmada !== undefined && latest.version_confirmada !== contact.version;
          // Los lotes antiguos no guardaban el estado previo: se revalidan los datos actuales.
          // Solo se modifica el estado; nunca se sobrescriben campos del contacto.
          restoredState = validateContact(contact, contact.tipo_contacto).isValid
            ? changed ? 'CORREGIDO' : previous?.estado_anterior || 'VALIDADO'
            : 'NUEVO';
          criterion = changed ? 'REVALIDACION_CAMBIOS_POSTERIORES' : previous ? 'ESTADO_PREVIO_REGISTRADO' : 'REVALIDACION_LOTE_ANTERIOR';
          db.prepare('UPDATE contactos SET estado=?,updated_by=?,updated_by_name=?,updated_at=? WHERE id=?')
            .run(restoredState, actor.id, actor.nombre_completo, now, entry.id);
          restoredCount++;
        }
        logAudit(db, entry.id, actor, 'ANULACION_EXPORTACION', {
          lote: id, motivo: motive, estado_anterior: contact?.estado || null, estado_resultante: restoredState,
          criterio: criterion, otro_envio_confirmado: stillExported.has(entry.id)
        });
      }
    }
    db.prepare("UPDATE exportaciones SET estado='ANULADO',anulado_at=?,anulado_por=?,motivo_anulacion=? WHERE id=?")
      .run(now, actor.id, motive, id);
    logAudit(db, null, actor, 'ANULACION_LOTE_EXPORTACION', {
      lote: id, motivo: motive, estado_anterior: item.estado, contactos_actualizados: restoredCount,
      sha256: item.sha256, confirmado_at: item.confirmado_at
    });
    return metadata(batch(id));
  });
}

module.exports = {
  exportContactsToXlsx, prepareExport, listBatches, downloadBatch, receiveBatch, confirmBatch, cancelBatch
};
