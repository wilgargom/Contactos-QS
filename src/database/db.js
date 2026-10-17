const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');

let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(config.DB_PATH);
    
    // HOME de App Service es un recurso compartido; WAL requiere disco local.
    dbInstance.exec(`PRAGMA journal_mode = ${config.SQLITE_JOURNAL_MODE};`);
    dbInstance.exec('PRAGMA busy_timeout = 5000;');
    dbInstance.exec('PRAGMA foreign_keys = ON;');
    dbInstance.exec('PRAGMA synchronous = NORMAL;');
    
    // Inicializar esquema si no existe
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    dbInstance.exec(schemaSql);

    try { dbInstance.exec('ALTER TABLE contactos ADD COLUMN es_consolidado INTEGER NOT NULL DEFAULT 0;'); } catch (_) {}
    try { dbInstance.exec('ALTER TABLE contactos ADD COLUMN escuela_proponente TEXT;'); } catch (_) {}

    // Auto-migraciones para columnas de trazabilidad institucional
    try { dbInstance.exec('ALTER TABLE contactos ADD COLUMN recomienda_nombre TEXT;'); } catch (_) {}
    try { dbInstance.exec('ALTER TABLE contactos ADD COLUMN recomienda_email TEXT;'); } catch (_) {}
    try { dbInstance.exec('ALTER TABLE lotes_carga ADD COLUMN cargado_por_email TEXT;'); } catch (_) {}
    try {
      dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS funcionarios (
          id TEXT PRIMARY KEY,
          nombre TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          email_normalized TEXT NOT NULL UNIQUE,
          dependencia TEXT NOT NULL,
          sede TEXT NOT NULL,
          sede_id TEXT,
          departamento_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_funcionarios_email_norm ON funcionarios(email_normalized);
      `);
    } catch (_) {}
  }
  return dbInstance;
}

/**
 * Ejecuta una serie de operaciones dentro de una transacción atómica segura.
 */
function runTransaction(fn) {
  const db = getDb();
  db.exec('BEGIN TRANSACTION;');
  try {
    const result = fn(db);
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

module.exports = {
  getDb,
  runTransaction
};
