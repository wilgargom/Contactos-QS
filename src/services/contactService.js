const crypto = require('node:crypto');
const { getDb, runTransaction } = require('../database/db');
const { validateContact, normalizeEmail } = require('../utils/validator');
const { checkDuplicate } = require('./duplicateDetector');

function canManage(contact, user) {
  return Boolean(user && (user.rol === 'ADMIN' || contact.created_by === user.id));
}

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
  return runTransaction(trx => {
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

    {
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

      const created = trx.prepare('SELECT * FROM contactos WHERE id = ?').get(contactId);
      return {
        success: true,
        contact: created,
        warnings: validation.warnings,
        duplicateStatus: dupCheck.status
      };
    }
  });
}

function updateContact(id, rawData, user) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM contactos WHERE id = ?').get(id);
  if (!existing) {
    return { success: false, message: 'Contacto no encontrado.' };
  }

  if (!canManage(existing, user)) return { success: false, statusCode: 403, message: 'No tiene acceso a este contacto.' };
  if (!Number.isInteger(rawData.version)) return { success: false, statusCode: 428, message: 'Actualice el contacto antes de editarlo.' };
  if (rawData.version !== existing.version) return { success: false, statusCode: 409, message: 'Otra persona modificó este contacto. Vuelva a abrirlo antes de guardar.' };
  if (!existing.es_consolidado && rawData.recomienda_email !== undefined && rawData.recomienda_email !== (existing.recomienda_email || '')) {
    return { success: false, statusCode: 422, message: 'La persona reportante se conserva al editar el contacto.' };
  }
  const validation = validateContact({ ...existing, ...rawData, tipo_contacto: existing.tipo_contacto }, existing.tipo_contacto);
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

  const recNombre = existing.es_consolidado ? 'Administrador' : existing.recomienda_nombre;
  const recEmail = existing.es_consolidado ? '' : existing.recomienda_email;

  return runTransaction((trx) => {
    const stmt = trx.prepare(`
      UPDATE contactos SET
        title = ?, first_name = ?, last_name = ?, email = ?, email_normalized = ?, phone = ?,
        country_name = ?, job_title = ?, department_unit = ?, institution = ?, subject_area = ?,
        position = ?, industry = ?, company_name = ?,
        recomienda_nombre = ?, recomienda_email = ?,
        estado = 'CORREGIDO', updated_by = ?,
        updated_by_name = ?, updated_at = ?
      WHERE id = ? AND version = ?
    `);

    const change = stmt.run(
      s.title, s.first_name, s.last_name, s.email, s.email_normalized, s.phone,
      s.country_name, s.job_title || null, s.department_unit || null, s.institution || null,
      s.subject_area || null, s.position || null, s.industry || null, s.company_name || null,
      recNombre, recEmail,
      user.id, user.nombre_completo, now, id, rawData.version
    );
    if (!change.changes) return { success: false, statusCode: 409, message: 'El contacto cambió; vuelva a abrirlo antes de guardar.' };

    logAudit(trx, id, user, 'MODIFICACION', {
      valores_anteriores: existing,
      valores_nuevos: s
    });

    const updated = trx.prepare('SELECT * FROM contactos WHERE id = ?').get(id);
    return { success: true, contact: updated, warnings: validation.warnings };
  });
}

function listContacts(filters = {}, user = null, paginate = false) {
  const db = getDb();
  let sql = `
    SELECT c.*, s.nombre as sede_nombre, d.nombre as departamento_nombre
    FROM contactos c
    LEFT JOIN sedes s ON c.sede_id = s.id
    LEFT JOIN departamentos d ON c.departamento_id = d.id
    WHERE 1=1
  `;
  const params = [];
  if (filters.pendientes === 'true') sql += " AND c.estado IN ('NUEVO','POSIBLE_DUPLICADO')";
  if (filters.campania_id === 'SIN_ASIGNAR') sql += ' AND c.campania_id IS NULL';
  else if (filters.campania_id) { sql += ' AND c.campania_id = ?'; params.push(filters.campania_id); }

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

  if (paginate) {
    const total = db.prepare(`SELECT COUNT(*) AS total FROM (${sql})`).get(...params).total;
    const pageSize = Math.min(100, Math.max(1, parseInt(filters.page_size, 10) || 50));
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(pages, Math.max(1, parseInt(filters.page, 10) || 1));
    const contacts = db.prepare(sql + ' ORDER BY c.created_at DESC, c.id LIMIT ? OFFSET ?').all(...params, pageSize, (page - 1) * pageSize);
    return { contacts, total, page, pageSize, pages };
  }
  sql += ' ORDER BY c.created_at DESC, c.id';
  return db.prepare(sql).all(...params);
}

function getContactById(id, user) {
  const db = getDb();
  const contact = db.prepare(`
    SELECT c.*, s.nombre as sede_nombre, d.nombre as departamento_nombre
    FROM contactos c
    LEFT JOIN sedes s ON c.sede_id = s.id
    LEFT JOIN departamentos d ON c.departamento_id = d.id
    WHERE c.id = ?
  `).get(id);

  if (!contact || !canManage(contact, user)) return null;

  const auditHistory = db.prepare(`
    SELECT * FROM auditoria WHERE contacto_id = ? ORDER BY created_at DESC
  `).all(id);

  return { contact, auditHistory };
}

function resolveDuplicate(id, action, targetContactId, user) {
  const db = getDb();
  const contact = db.prepare('SELECT * FROM contactos WHERE id = ?').get(id);
  if (!contact) return { success: false, message: 'Contacto no encontrado.' };

  if (!canManage(contact, user)) return { success: false, statusCode: 403, message: 'No tiene acceso a este contacto.' };
  if (!['DISCARD', 'CONFIRM_VALID'].includes(action)) return { success: false, statusCode: 400, message: 'Acción inválida.' };
  if (action === 'CONFIRM_VALID') {
    const validation = validateContact(contact, contact.tipo_contacto);
    if (!validation.isValid) return { success: false, statusCode: 422, validationErrors: validation.errors, message: 'Complete los campos requeridos antes de validar.' };
  }
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

function deleteContacts(ids, user) {
  if (user?.rol !== 'ADMIN') {
    return { success: false, statusCode: 403, message: 'La eliminación múltiple requiere una sesión de administrador.' };
  }
  if (!Array.isArray(ids) || !ids.length || ids.length > 10000 ||
      ids.some(id => typeof id !== 'string' || !id.trim() || id.length > 200)) {
    return { success: false, statusCode: 400, message: 'Seleccione entre 1 y 10000 contactos válidos.' };
  }
  const uniqueIds = [...new Set(ids)];
  return runTransaction(trx => {
    const lookup = trx.prepare('SELECT * FROM contactos WHERE id = ?');
    const contacts = uniqueIds.map(id => lookup.get(id));
    if (contacts.some(c => !c)) {
      return { success: false, statusCode: 409,
        message: 'La selección contiene contactos que ya no están disponibles. Actualice la lista; no se eliminó ningún contacto.' };
    }
    const batchId = crypto.randomUUID();
    const actor = { ...user, nombre_completo: user.nombre_completo || 'Administrador' };
    const remove = trx.prepare('DELETE FROM contactos WHERE id = ?');
    for (const contact of contacts) {
      logAudit(trx, contact.id, actor, 'ELIMINACION', {
        metodo: 'ELIMINACION_MULTIPLE', lote_eliminacion: batchId,
        cantidad_seleccionada: uniqueIds.length, contacto_eliminado: contact
      });
      remove.run(contact.id);
    }
    return { success: true, deletedCount: uniqueIds.length,
      message: `Se eliminaron ${uniqueIds.length} contactos del directorio.` };
  });
}

module.exports = {
  createContact,
  updateContact,
  deleteContact,
  deleteContacts,
  listContacts,
  getContactById,
  resolveDuplicate,
  getStatistics,
  logAudit
};
