const crypto = require('node:crypto');
const { getDb } = require('../database/db');
const config = require('../config');

function verifyPassword(password, hash, salt) {
  const testHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(testHash, 'hex'), Buffer.from(hash, 'hex'));
}

function login(email, password) {
  const db = getDb();
  const cleanEmail = (email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').get(cleanEmail);

  if (!user) {
    return { success: false, message: 'Credenciales inválidas o usuario inactivo.' };
  }

  const isValid = verifyPassword(password, user.password_hash, user.salt);
  if (!isValid) {
    return { success: false, message: 'Credenciales inválidas o usuario inactivo.' };
  }

  // Generar token de sesión criptográficamente seguro
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 3600 * 1000).toISOString();
  const createdAt = new Date().toISOString();

  db.prepare('INSERT INTO sesiones (token, usuario_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(token, user.id, expiresAt, createdAt);

  // Obtener nombres de sede y departamento
  const sede = user.sede_id ? db.prepare('SELECT nombre FROM sedes WHERE id = ?').get(user.sede_id) : null;
  const depto = user.departamento_id ? db.prepare('SELECT nombre FROM departamentos WHERE id = ?').get(user.departamento_id) : null;

  return {
    success: true,
    token,
    user: {
      id: user.id,
      nombre_completo: user.nombre_completo,
      email: user.email,
      rol: user.rol,
      sede_id: user.sede_id,
      sede_nombre: sede ? sede.nombre : 'Todas las sedes',
      departamento_id: user.departamento_id,
      departamento_nombre: depto ? depto.nombre : 'Administración Central'
    }
  };
}

function getSessionUser(token) {
  if (!token) return null;
  const db = getDb();
  const session = db.prepare('SELECT * FROM sesiones WHERE token = ?').get(token);
  if (!session) return null;

  if (new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
    return null;
  }

  const user = db.prepare('SELECT * FROM usuarios WHERE id = ? AND activo = 1').get(session.usuario_id);
  if (!user) return null;

  const sede = user.sede_id ? db.prepare('SELECT nombre FROM sedes WHERE id = ?').get(user.sede_id) : null;
  const depto = user.departamento_id ? db.prepare('SELECT nombre FROM departamentos WHERE id = ?').get(user.departamento_id) : null;

  return {
    id: user.id,
    nombre_completo: user.nombre_completo,
    email: user.email,
    rol: user.rol,
    sede_id: user.sede_id,
    sede_nombre: sede ? sede.nombre : 'Todas las sedes',
    departamento_id: user.departamento_id,
    departamento_nombre: depto ? depto.nombre : 'Administración Central'
  };
}

function logout(token) {
  if (!token) return;
  const db = getDb();
  db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
}

module.exports = {
  login,
  getSessionUser,
  logout
};
