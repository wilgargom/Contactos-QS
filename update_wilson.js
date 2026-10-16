const crypto = require('node:crypto');
const { getDb } = require('./src/database/db');
const db = getDb();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

const { hash, salt } = hashPassword('TecQS2026!');

// 1. Wilson Garita Gómez con rol USUARIO (el que inicia por defecto)
db.prepare(`
  UPDATE usuarios 
  SET nombre_completo = 'Wilson Garita Gómez',
      email = 'wgarita@itcr.ac.cr',
      password_hash = ?,
      salt = ?,
      rol = 'USUARIO',
      sede_id = 'sede-cartago',
      departamento_id = 'dep-562edd1e',
      activo = 1
  WHERE id = 'usr-admin-01' OR email = 'wgarita@itcr.ac.cr'
`).run(hash, salt);

// 2. Administrador institucional con rol ADMIN (para cuando cambien a rol Administrador)
db.prepare(`
  INSERT OR REPLACE INTO usuarios (id, nombre_completo, email, password_hash, salt, rol, sede_id, departamento_id, activo, created_at)
  VALUES ('usr-admin-backup', 'Wilson Garita Gómez (Administrador)', 'admin@tec.ac.cr', ?, ?, 'ADMIN', 'sede-cartago', 'dep-562edd1e', 1, datetime('now'))
`).run(hash, salt);

// 3. Padrón funcionarios: formatear nombre
db.prepare(`
  UPDATE funcionarios 
  SET nombre = 'Wilson Garita Gómez' 
  WHERE email = 'wgarita@itcr.ac.cr'
`).run();

// 4. Contactos de ejemplo creados por Wilson Garita Gómez
db.prepare(`
  UPDATE contactos
  SET created_by = 'usr-admin-01',
      created_by_name = 'Wilson Garita Gómez'
`).run();

// Limpiar sesiones previas
db.prepare('DELETE FROM sesiones').run();

console.log('USUARIOS:', db.prepare('SELECT id, nombre_completo, email, rol, departamento_id FROM usuarios').all());
