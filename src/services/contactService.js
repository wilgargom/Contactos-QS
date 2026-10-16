const crypto = require('node:crypto');
const { getDb, runTransaction } = require('../database/db');
const { validateContact, normalizeEmail } = require('../utils/validator');
const { checkDuplicate } = require('./duplicateDetector');

function logAudit(trx, contactoId, usuario, accion, detalles) {
  const auditId = crypto.randomUUID();
  const stmt = trx.prepare(`
    INSERT INTO auditoria (id, contacto_id, usuario_id, usuario_nombre, accion, detalles, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    auditId,
    contactoId,
    usuario.id,
    usuario.nombre_completo,
    accion,
    typeof detalles === 'object' ? JSON.stringify(detalles) : String(detalles),
    new Date().toISOString()
  );
}

function createContact(rawData, user, options = {}) {
  const { allowDuplicateOverride = false, metodoIngreso = 'INDIVIDUAL', loteId = null } = options;
  
  // 1. Validar reglas de formato y campos requeridos
  const validation = validateContact(rawData, rawData.tipo_contacto);
  if (!validation.isValid) {
    return {
      success: false,
      validationErrors: validation.errors,
      warnings: validation.warnings,
      message: 'El registro contiene errores de validación.'
    };
  }

  const s = validation.sanitized;

  // 2. Detección de duplicados
  const dupCheck = checkDuplicate(s);
  if (dupCheck.status === 'EXACT_MATCH') {
    return {
      success: false,
      duplicateStatus: 'EXACT_MATCH',
      duplicateDetails: dupCheck,
      message: `Coincidencia exacta detectada: ${dupCheck.explanation}`
    };
  }

  if (dupCheck.status === 'POTENTIAL_DUPLICATE' && !allowDuplicateOverride) {
    return {
      success: false,
      duplicateStatus: 'POTENTIAL_DUPLICATE',
      duplicateDetails: dupCheck,
      message: `Posible duplicado detectado: ${dupCheck.explanation}`
    };
  }

  // 3. Determinar estado inicial
  let estado = 'VALIDADO';
  if (dupCheck.status === 'POTENTIAL_DUPLICATE') {
    estado = 'POSIBLE_DUPLICADO';
  }

  // 4. Inserción en base de datos con transacción atómica
  const contactId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Preservar sede y departamento del usuario si no fueron especificados
  const sedeId = s.sede_id || user.sede_id || null;
  const deptoId = s.departamento_id || user.departamento_id || null;
  const recomiendaNombre = (rawData.recomienda_nombre || user.nombre_completo || '').trim();
  const recomiendaEmail = (rawData.recomienda_email || user.email || '').trim().toLowerCase();

  return runTransaction((trx) => {
    const stmt = trx.prepare(`
      INSERT INTO contactos (
        id, tipo_contacto, source, title, first_name, last_name, email, email_normalized, phone,
        country_name, sede_id, departamento_id, job_title, department_unit, institution, subject_area,
        position, industry, company_name, estado, metodo_ingreso, lote_id,
        recomienda_nombre, recomienda_email,
        created_by, created_by_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      contactId,
      s.tipo_contacto,
      s.source,
      s.title,
      s.first_name,
      s.last_name,
      s.email,
      s.email_normalized,
      s.phone,
      s.country_name,
      sedeId,
      deptoId,
      s.job_title || null,
      s.department_unit || null,
      s.institution || null,
      s.subject_area || null,
      s.position || null,
      s.industry || null,
      s.company_name || null,
      estado,
      metodoIngreso,
      loteId,
      recomiendaNombre,
      recomiendaEmail,
      user.id,
      user.nombre_completo,
      now
    );

    logAudit(trx, contactId, user, 'CREACION', {
      metodo: metodoIngreso,
      estado,
      datos: s
    });

    // Auto-registrar funcionario si fue ingresado y no existía
    if (recomiendaEmail && (recomiendaEmail.endsWith('@itcr.ac.cr') || recomiendaEmail.endsWith('@tec.ac.cr'))) {
      try {
        const { upsertFuncionario } = require('./funcionarioService');
        let sedeNombre = null;
        let deptoNombre = null;
        if (sedeId) {
          const sRow = trx.prepare('SELECT nombre FROM sedes WHERE id = ?').get(sedeId);
          if (sRow) sedeNombre = sRow.nombre;
        }
        if (deptoId) {
          const dRow = trx.prepare('SELECT nombre FROM departamentos WHERE id = ?').get(deptoId);
          if (dRow) deptoNombre = dRow.nombre;
        }

        upsertFuncionario({
          nombre: recomiendaNombre || user.nombre_completo,
          email: recomiendaEmail,
          dependencia: deptoNombre || rawData.dependencia || 'Dependencia TEC',
          sede: sedeNombre || rawData.sede || 'Campus Central Cartago',
          sede_id: sedeId,
          departamento_id: deptoId
        });
      } catch (_) {}
    }

    const created = trx.prepare('SELECT * FROM contactos WHERE id = ?').get(contactId);
    return {
      success: true,
      contact: created,
      warnings: validation.warnings,
      duplicateStatus: dupCheck.status
    };
  });
}

function updateContact(id, rawData, user) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM contactos WHERE id = ?').get(id);
  if (!existing) {
    return { success: false, message: 'Contacto no encontrado.' };
  }

  const validation = validateContact(rawData, rawData.tipo_contacto || existing.tipo_contacto);
  if (!validation.isValid) {
    return { success: false, validationErrors: validation.errors, warnings: validation.warnings };
  }

  const s = validation.sanitized;
  const dupCheck = checkDuplicate(s, id);

  if (dupCheck.status === 'EXACT_MATCH') {
    return {
      success: false,
      duplicateStatus: 'EXACT_MATCH',
      duplicateDetails: dupCheck,
      message: `No se puede actualizar: ${dupCheck.explanation}`
    };
  }

  const now = new Date().toISOString();

  const recNombre = rawData.recomienda_nombre !== undefined ? (rawData.recomienda_nombre || '').trim() : existing.recomienda_nombre;
  const recEmail = rawData.recomienda_email !== undefined ? (rawData.recomienda_email || '').trim().toLowerCase() : existing.recomienda_email;

  return runTransaction((trx) => {
    const stmt = trx.prepare(`
      UPDATE contactos SET
        title = ?, first_name = ?, last_name = ?, email = ?, email_normalized = ?, phone = ?,
        country_name = ?, job_title = ?, department_unit = ?, institution = ?, subject_area = ?,
        position = ?, industry = ?, company_name = ?,
        recomienda_nombre = ?, recomienda_email = ?,
        estado = 'CORREGIDO', updated_by = ?,
        updated_by_name = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      s.title, s.first_name, s.last_name, s.email, s.email_normalized, s.phone,
      s.country_name, s.job_title || null, s.department_unit || null, s.institution || null,
      s.subject_area || null, s.position || null, s.industry || null, s.company_name || null,
      recNombre, recEmail,
      user.id, user.nombre_completo, now, id
    );

    logAudit(trx, id, user, 'MODIFICACION', {
      valores_anteriores: existing,
      valores_nuevos: s
    });

    const updated = trx.prepare('SELECT * FROM contactos WHERE id = ?').get(id);
    return { success: true, contact: updated, warnings: validation.warnings };
  });
}

function listContacts(filters = {}, user = null) {
  const db = getDb();
  let sql = `
    SELECT c.*, s.nombre as sede_nombre, d.nombre as departamento_nombre
    FROM contactos c
    LEFT JOIN sedes s ON c.sede_id = s.id
    LEFT JOIN departamentos d ON c.departamento_id = d.id
    WHERE 1=1
  `;
  const params = [];

  // Requisito: El usuario estándar solo puede ver lo que ingresó por carga masiva o registro individual
  if (user && user.rol !== 'ADMIN') {
    sql += " AND (c.created_by = ? OR (? <> '' AND LOWER(c.recomienda_email) = LOWER(?)))";
    params.push(user.id, (user.email || '').trim(), (user.email || '').trim());
  } else if ((filters.mis_registros_solamente === 'true' || filters.mis_registros_solamente === '1' || filters.mis_registros_solamente === true) && user) {
    // Si el usuario es administrador pero activó la opción "Solo mis registros"
    sql += " AND (c.created_by = ? OR (? <> '' AND LOWER(c.recomienda_email) = LOWER(?)))";
    params.push(user.id, (user.email || '').trim(), (user.email || '').trim());
  }

  if (filters.tipo_contacto) {
    sql += ' AND c.tipo_contacto = ?';
    params.push(filters.tipo_contacto.toUpperCase());
  }

  if (filters.estado) {
    sql += ' AND c.estado = ?';
    params.push(filters.estado);
  }

  if (filters.sede_id) {
    sql += ' AND c.sede_id = ?';
    params.push(filters.sede_id);
  }

  if (filters.departamento_id) {
    sql += ' AND c.departamento_id = ?';
    params.push(filters.departamento_id);
  }

  if (filters.country_name) {
    sql += ' AND c.country_name = ?';
    params.push(filters.country_name);
  }

  if (filters.subject_area) {
    sql += ' AND c.subject_area = ?';
    params.push(filters.subject_area);
  }

  if (filters.industry) {
    sql += ' AND c.industry = ?';
    params.push(filters.industry);
  }

  if (filters.fecha_inicio) {
    sql += ' AND date(c.created_at) >= date(?)';
    params.push(filters.fecha_inicio);
  }

  if (filters.fecha_fin) {
    sql += ' AND date(c.created_at) <= date(?)';
    params.push(filters.fecha_fin);
  }

  // Búsqueda por texto libre
  if (filters.q) {
    const term = `%${filters.q.trim()}%`;
    sql += ` AND (
      c.first_name LIKE ? OR
      c.last_name LIKE ? OR
      c.email LIKE ? OR
      c.institution LIKE ? OR
      c.company_name LIKE ? OR
      c.job_title LIKE ? OR
      c.position LIKE ?
    )`;
    params.push(term, term, term, term, term, term, term);
  }

  sql += ' ORDER BY c.created_at DESC';

  return db.prepare(sql).all(...params);
}

function getContactById(id) {
  const db = getDb();
  const contact = db.prepare(`
    SELECT c.*, s.nombre as sede_nombre, d.nombre as departamento_nombre
    FROM contactos c
    LEFT JOIN sedes s ON c.sede_id = s.id
    LEFT JOIN departamentos d ON c.departamento_id = d.id
    WHERE c.id = ?
  `).get(id);

  if (!contact) return null;

  const auditHistory = db.prepare(`
    SELECT * FROM auditoria WHERE contacto_id = ? ORDER BY created_at DESC
  `).all(id);

  return { contact, auditHistory };
}

function resolveDuplicate(id, action, targetContactId, user) {
  const db = getDb();
  const contact = db.prepare('SELECT * FROM contactos WHERE id = ?').get(id);
  if (!contact) return { success: false, message: 'Contacto no encontrado.' };

  const now = new Date().toISOString();

  return runTransaction((trx) => {
    if (action === 'DISCARD') {
      trx.prepare(`
        UPDATE contactos SET estado = 'DUPLICADO', updated_by = ?, updated_by_name = ?, updated_at = ?
        WHERE id = ?
      `).run(user.id, user.nombre_completo, now, id);

      logAudit(trx, id, user, 'CAMBIO_ESTADO', { nuevo_estado: 'DUPLICADO', motivo: 'Descartado manualmente como duplicado' });
    } else if (action === 'CONFIRM_VALID') {
      trx.prepare(`
        UPDATE contactos SET estado = 'VALIDADO', updated_by = ?, updated_by_name = ?, updated_at = ?
        WHERE id = ?
      `).run(user.id, user.nombre_completo, now, id);

      logAudit(trx, id, user, 'CAMBIO_ESTADO', { nuevo_estado: 'VALIDADO', motivo: 'Confirmado como contacto válido legítimo' });
    }

    return { success: true };
  });
}

function getStatistics() {
  const db = getDb();

  const total = db.prepare('SELECT COUNT(*) as count FROM contactos').get().count;
  const academicos = db.prepare("SELECT COUNT(*) as count FROM contactos WHERE tipo_contacto = 'ACADEMICO'").get().count;
  const empleadores = db.prepare("SELECT COUNT(*) as count FROM contactos WHERE tipo_contacto = 'EMPLEADOR'").get().count;
  const validados = db.prepare("SELECT COUNT(*) as count FROM contactos WHERE estado IN ('VALIDADO', 'CORREGIDO')").get().count;
  const duplicados = db.prepare("SELECT COUNT(*) as count FROM contactos WHERE estado IN ('POSIBLE_DUPLICADO', 'DUPLICADO')").get().count;
  const exportados = db.prepare("SELECT COUNT(*) as count FROM contactos WHERE estado = 'EXPORTADO'").get().count;

  const porSede = db.prepare(`
    SELECT COALESCE(s.nombre, 'Sin sede asignada') as sede, COUNT(c.id) as count
    FROM contactos c
    LEFT JOIN sedes s ON c.sede_id = s.id
    GROUP BY s.nombre
  `).all();

  const porDepto = db.prepare(`
    SELECT COALESCE(d.nombre, 'Sin departamento') as departamento, COUNT(c.id) as count
    FROM contactos c
    LEFT JOIN departamentos d ON c.departamento_id = d.id
    GROUP BY d.nombre
    ORDER BY count DESC
    LIMIT 6
  `).all();

  return {
    total,
    academicos,
    empleadores,
    validados,
    duplicados,
    exportados,
    porSede,
    porDepto
  };
}

function deleteContact(id, user) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM contactos WHERE id = ?').get(id);
  if (!existing) {
    return { success: false, error: 'Contacto no encontrado' };
  }

  // Permisos: Admin puede eliminar cualquiera.
  // Usuario estándar puede eliminar si es quien lo creó o quien lo recomienda.
  const isAdmin = user && (user.rol === 'ADMIN' || user.role === 'ADMIN');
  const isOwner = user && (
    (existing.created_by && String(existing.created_by) === String(user.id)) ||
    (existing.recomienda_email && user.email && existing.recomienda_email.toLowerCase() === user.email.toLowerCase())
  );

  if (!isAdmin && !isOwner) {
    return {
      success: false,
      error: 'No cuenta con permisos para eliminar este contacto reportado. Solo puede eliminar los registros ingresados por usted.'
    };
  }

  return runTransaction((trx) => {
    logAudit(trx, id, user, 'ELIMINACION', {
      contacto_eliminado: {
        id: existing.id,
        nombre: `${existing.first_name || ''} ${existing.last_name || ''}`.trim(),
        email: existing.email,
        tipo_contacto: existing.tipo_contacto,
        institucion_empresa: existing.institution || existing.company_name,
        recomienda_nombre: existing.recomienda_nombre,
        recomienda_email: existing.recomienda_email,
        metodo_ingreso: existing.metodo_ingreso
      }
    });

    trx.prepare('DELETE FROM contactos WHERE id = ?').run(id);

    return {
      success: true,
      message: 'Contacto reportado eliminado correctamente.'
    };
  });
}

module.exports = {
  createContact,
  updateContact,
  deleteContact,
  listContacts,
  getContactById,
  resolveDuplicate,
  getStatistics
};
