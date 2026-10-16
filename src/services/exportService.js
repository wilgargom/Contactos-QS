const { getDb, runTransaction } = require('../database/db');
const { generateXlsx, TEMPLATES } = require('./excelService');
const { validateContact } = require('../utils/validator');
const config = require('../config');

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

  sql += ' ORDER BY created_at ASC';
  const contacts = db.prepare(sql).all(...params);

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

  // 3. Actualizar estado a EXPORTADO para los contactos incluidos
  if (validRows.length > 0 && user) {
    runTransaction((trx) => {
      const now = new Date().toISOString();
      const updateStmt = trx.prepare(`
        UPDATE contactos SET estado = 'EXPORTADO', updated_by = ?, updated_by_name = ?, updated_at = ?
        WHERE id = ? AND estado != 'EXPORTADO'
      `);
      const auditStmt = trx.prepare(`
        INSERT INTO auditoria (id, contacto_id, usuario_id, usuario_nombre, accion, detalles, created_at)
        VALUES (?, ?, ?, ?, 'EXPORTACION', ?, ?)
      `);

      for (const c of contacts) {
        if (!invalidRows.some(inv => inv.contact.id === c.id)) {
          updateStmt.run(user.id, user.nombre_completo, now, c.id);
          const auditId = require('node:crypto').randomUUID();
          auditStmt.run(auditId, c.id, user.id, user.nombre_completo, JSON.stringify({ tipo: contactType, fecha_corte: now }), now);
        }
      }
    });
  }

  return {
    buffer: xlsxBuffer,
    totalProcesados: contacts.length,
    totalExportados: validRows.length,
    totalInconsistentes: invalidRows.length,
    inconsistencias: invalidRows,
    filename: `TEC_QS_${contactType}_${new Date().toISOString().slice(0, 10)}.xlsx`
  };
}

module.exports = {
  exportContactsToXlsx
};
