const crypto = require('node:crypto');
const { getDb, runTransaction } = require('../database/db');
const config = require('../config');
const adminCredentials = require('../adminCredentials');

const COOKIE_NAMES = { user: 'tec_qs_user', admin: 'tec_qs_admin' };
const INVALID_LOGIN = { success: false, message: 'Usuario o contraseña incorrectos.' };

function verifyPassword(password, encodedHash) {
  const [algorithm, salt, hash] = String(encodedHash).split(':');
  if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hash)) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

function createSession(userId) {
  const db = getDb();
  const token = crypto.randomBytes(32).toString('hex');
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 3600000).toISOString();
  db.prepare('DELETE FROM sesiones WHERE expires_at <= ?').run(createdAt);
  db.prepare('INSERT INTO sesiones (token, usuario_id, expires_at, created_at, last_activity_at) VALUES (?, ?, ?, ?, ?)')
    .run(token, userId, expiresAt, createdAt, createdAt);
  return { success: true, token, user: getSessionUser(token), expiresAt };
}

function login(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string' ||
      username.length > 200 || password.length > 1024) return INVALID_LOGIN;
  const user = getDb().prepare('SELECT * FROM usuarios WHERE id = ? AND activo = 1 AND rol = ?')
    .get(adminCredentials.id, 'ADMIN');
  // Comprobar el hash incluso si el nombre no coincide para evitar distinguir cuentas por tiempo.
  const validPassword = verifyPassword(password, adminCredentials.passwordHash);
  if (!user || username.trim() !== adminCredentials.username || !validPassword) return INVALID_LOGIN;
  return createSession(user.id);
}

function createUserSession() {
  const id = `usr-guest-${crypto.randomUUID()}`;
  return runTransaction(db => {
    db.prepare(`INSERT INTO usuarios (id, nombre_completo, email, password_hash, salt, rol, created_at)
      VALUES (?, 'Usuario', ?, ?, '', 'USUARIO', ?)`)
      .run(id, `${id}@session.invalid`, crypto.randomBytes(64).toString('hex'), new Date().toISOString());
    return createSession(id);
  });
}

function getSessionUser(token, { touch = false, resumeGuest = false } = {}) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const db = getDb();
  const session = db.prepare('SELECT * FROM sesiones WHERE token = ?').get(token);
  if (!session) return null;
  if (!Number.isFinite(Date.parse(session.expires_at)) || Date.parse(session.expires_at) <= Date.now()) {
    db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
    return null;
  }
  const user = db.prepare('SELECT * FROM usuarios WHERE id = ? AND activo = 1').get(session.usuario_id);
  if (!user) return null;
  const isAdmin = user.id === adminCredentials.id && user.rol === 'ADMIN';
  const isGuest = user.id.startsWith('usr-guest-') && user.rol === 'USUARIO';
  if (!isAdmin && !isGuest) return null;
  const lastActivity = Date.parse(session.last_activity_at || session.created_at);
  const idle = !Number.isFinite(lastActivity) || Date.now() - lastActivity >= config.SESSION_IDLE_MS;
  if (idle && !(resumeGuest && isGuest)) {
    if (isAdmin) db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
    return null;
  }
  // Las consultas de estado no prolongan sesiones abandonadas.
  if ((touch && Date.now() - lastActivity >= 30000) || (idle && resumeGuest && isGuest)) {
    session.last_activity_at = new Date().toISOString();
    db.prepare('UPDATE sesiones SET last_activity_at = ? WHERE token = ?').run(session.last_activity_at, token);
  }
  return {
    id: user.id,
    // La sesión de acceso no representa a un funcionario ni autocompleta su identidad.
    nombre_completo: '',
    email: '',
    rol: isAdmin ? 'ADMIN' : 'USUARIO',
    sede_id: null,
    sede_nombre: '',
    departamento_id: null,
    departamento_nombre: '',
    expires_at: session.expires_at,
    idle_timeout_ms: config.SESSION_IDLE_MS
  };
}

function readCookie(req, name) {
  const cookie = (req.headers.cookie || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(`${name}=`));
  return cookie ? cookie.slice(name.length + 1) : '';
}

function setSessionCookie(req, res, kind, token) {
  // Azure termina TLS en su proxy; sus cookies requieren HTTPS aunque Node reciba HTTP interno.
  const secure = Boolean(config.IS_AZURE || req.socket.encrypted);
  const maxAge = token ? config.SESSION_TTL_HOURS * 3600 : 0;
  const value = `${COOKIE_NAMES[kind]}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  const previous = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [...(Array.isArray(previous) ? previous : [previous]), value]);
}

function getRequestToken(req) {
  return readCookie(req, COOKIE_NAMES.admin) || readCookie(req, COOKIE_NAMES.user);
}

function logout(token) {
  if (typeof token !== 'string') return;
  getDb().prepare('DELETE FROM sesiones WHERE token = ?').run(token);
}

module.exports = {
  login, createUserSession, getSessionUser, logout, readCookie, setSessionCookie, getRequestToken, COOKIE_NAMES
};
