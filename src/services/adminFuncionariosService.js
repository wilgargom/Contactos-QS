const crypto = require('node:crypto');
const { getDb, runTransaction } = require('../database/db');
const { normalizeText } = require('../utils/validator');
const { enrich, memberships } = require('./funcionarioScope');

function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function list(query) {
  const db = getDb();
  const q = (query.q || '').trim();
  if (q.length > 200) fail('La búsqueda admite hasta 200 caracteres.');
  const estado = query.estado || 'todos';
  if (!['todos', 'activos', 'inactivos'].includes(estado)) fail('Estado inválido.');
  const page = Number(query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) fail('Página inválida.');
  const where = [], args = [];
  if (q) { where.push('(nombre LIKE ? OR email LIKE ? OR dependencia LIKE ? OR cargo LIKE ?)'); args.push(...Array(4).fill('%' + q + '%')); }
  if (estado !== 'todos') { where.push('activo = ?'); args.push(estado === 'activos' ? 1 : 0); }
  const sql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const total = db.prepare('SELECT COUNT(*) AS total FROM funcionarios' + sql).get(...args).total;
  return { funcionarios: db.prepare('SELECT * FROM funcionarios' + sql + ' ORDER BY nombre, id LIMIT 25 OFFSET ?').all(...args, (page - 1) * 25).map(enrich), total, page, pageSize: 25 };
}
function detail(id) {
  const db = getDb();
  const funcionario = db.prepare('SELECT * FROM funcionarios WHERE id = ?').get(id);
  if (!funcionario) fail('Funcionario no encontrado.', 404);
  const history = db.prepare('SELECT usuario_nombre, accion, detalles, created_at FROM funcionarios_historial WHERE funcionario_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 30').all(id);
  return { funcionario: enrich(funcionario), history };
}
function save(id, body, user) {
  return runTransaction(db => {
    const existing = id ? detail(id).funcionario : null;
    if (existing && (!Number.isSafeInteger(body.version) || body.version !== existing.version)) fail('Otro administrador actualizó esta ficha. Cierre y abra nuevamente para revisar los datos vigentes.', 409);
    const fields = ['nombre', 'email', 'cargo', 'sede_id', 'departamento_id'];
    if (fields.some(k => typeof body[k] !== 'string') || typeof body.activo !== 'boolean') fail('Revise los campos de la ficha.');
    const nombre = normalizeText(body.nombre), email = body.email.trim().toLowerCase(), cargo = normalizeText(body.cargo);
    if (nombre.length < 3 || nombre.length > 200 || cargo.length > 200 || email.length > 254) fail('Revise el nombre, correo y cargo del funcionario.');
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(itcr\.ac\.cr|tec\.ac\.cr)$/.test(email)) fail('Ingrese un correo institucional @itcr.ac.cr o @tec.ac.cr.');
    const sede = db.prepare('SELECT * FROM sedes WHERE id = ? AND activo = 1').get(body.sede_id);
    const depto = db.prepare('SELECT * FROM departamentos WHERE id = ? AND activo = 1').get(body.departamento_id);
    if (!sede || !depto || (depto.sede_id && depto.sede_id !== sede.id)) fail('Seleccione una sede y una dependencia compatibles.');
    const ids = body.departamento_ids === undefined ? [depto.id] : body.departamento_ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 30 || ids.some(d => typeof d !== 'string') ||
        new Set(ids).size !== ids.length || !ids.includes(depto.id)) fail('Seleccione las dependencias de la ficha, incluida la principal.');
    const departments = ids.map(d => db.prepare('SELECT id, nombre FROM departamentos WHERE id = ? AND activo = 1').get(d));
    if (departments.some(d => !d || d.nombre.includes(';'))) fail('Seleccione dependencias individuales activas del catálogo.');
    if (db.prepare('SELECT id FROM funcionarios WHERE email_normalized = ? AND id != ?').get(email, id || '')) fail('El correo ya pertenece a otro funcionario.', 409);
    const now = new Date().toISOString();
    const funcionarioId = id || crypto.randomUUID();
    const data = { nombre, email, email_normalized: email, cargo, sede: sede.nombre, sede_id: sede.id,
      dependencia: departments.map(d => require('../utils/dependencyNames').normalizeDependency(d.nombre)).join('; '), departamento_id: depto.id, activo: body.activo ? 1 : 0 };
    if (existing) {
      db.prepare('UPDATE funcionarios SET nombre = ?, email = ?, email_normalized = ?, cargo = ?, sede = ?, sede_id = ?, dependencia = ?, departamento_id = ?, activo = ?, updated_at = ? WHERE id = ?')
        .run(...Object.values(data), now, funcionarioId);
    } else {
      db.prepare('INSERT INTO funcionarios (nombre, email, email_normalized, cargo, sede, sede_id, dependencia, departamento_id, activo, updated_at, id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(...Object.values(data), now, funcionarioId, now);
    }
    const changes = Object.keys(data).filter(k => !existing || existing[k] !== data[k]).map(k => ({ campo: k, anterior: existing?.[k] ?? null, nuevo: data[k] }));
    const previous = memberships({ id: funcionarioId }).map(d => d.id).sort();
    db.prepare('DELETE FROM funcionario_departamentos WHERE funcionario_id = ?').run(funcionarioId);
    for (const department of departments) {
      const origin = existing?.dependencias.find(d => d.id === department.id)?.origen || 'MANUAL';
      db.prepare('INSERT INTO funcionario_departamentos VALUES (?, ?, ?)').run(funcionarioId, department.id, origin);
    }
    changes.push({ campo: 'dependencias', anterior: previous.join('; '), nuevo: [...ids].sort().join('; ') });
    db.prepare('INSERT INTO funcionarios_historial (id, funcionario_id, usuario_id, usuario_nombre, accion, detalles, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), funcionarioId, user.id, user.nombre || user.username || 'Administrador', existing ? 'ACTUALIZACION' : 'CREACION', JSON.stringify(changes), now);
    return detail(funcionarioId);
  });
}
module.exports = { list, detail, save };
