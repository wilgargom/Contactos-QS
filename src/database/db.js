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
    const sessionColumns = dbInstance.prepare('PRAGMA table_info(sesiones)').all();
    if (!sessionColumns.some(c => c.name === 'last_activity_at')) {
      dbInstance.exec('ALTER TABLE sesiones ADD COLUMN last_activity_at TEXT');
      dbInstance.exec('UPDATE sesiones SET last_activity_at = created_at WHERE last_activity_at IS NULL');
    }
    dbInstance.exec('CREATE INDEX IF NOT EXISTS idx_sesiones_expires ON sesiones(expires_at)');
    dbInstance.exec('CREATE INDEX IF NOT EXISTS idx_contactos_owner_date ON contactos(created_by, created_at DESC)');

    try { dbInstance.exec('ALTER TABLE contactos ADD COLUMN es_consolidado INTEGER NOT NULL DEFAULT 0;'); } catch (_) {}
    try { dbInstance.exec('ALTER TABLE contactos ADD COLUMN escuela_proponente TEXT;'); } catch (_) {}

    const columns = dbInstance.prepare('PRAGMA table_info(contactos)').all();
    // Conservar duplicados históricos existentes; impedir que nuevas escrituras
    // agreguen otro contacto con el mismo correo, sin distinguir categoría u origen.
    dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_contactos_email_identity ON contactos(LOWER(TRIM(email))) WHERE TRIM(email) <> '';
      CREATE TRIGGER IF NOT EXISTS contactos_email_unique_insert BEFORE INSERT ON contactos
      WHEN TRIM(NEW.email) <> '' AND EXISTS (SELECT 1 FROM contactos WHERE TRIM(email) <> '' AND LOWER(TRIM(email)) = LOWER(TRIM(NEW.email)))
      BEGIN SELECT RAISE(ABORT, 'CONTACT_EMAIL_ALREADY_EXISTS'); END;
      CREATE TRIGGER IF NOT EXISTS contactos_email_unique_update BEFORE UPDATE OF email ON contactos
      WHEN TRIM(NEW.email) <> '' AND LOWER(TRIM(NEW.email)) <> LOWER(TRIM(OLD.email)) AND EXISTS
        (SELECT 1 FROM contactos WHERE id <> OLD.id AND TRIM(email) <> '' AND LOWER(TRIM(email)) = LOWER(TRIM(NEW.email)))
      BEGIN SELECT RAISE(ABORT, 'CONTACT_EMAIL_ALREADY_EXISTS'); END;`);
    if (!columns.some(c => c.name === 'version')) {
      dbInstance.exec('ALTER TABLE contactos ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
    }
    // Cualquier modificación, también exportaciones y consolidaciones, cambia la versión.
    dbInstance.exec(`CREATE TRIGGER IF NOT EXISTS contactos_version AFTER UPDATE ON contactos
      WHEN NEW.version = OLD.version BEGIN
        UPDATE contactos SET version = OLD.version + 1 WHERE id = NEW.id;
      END;`);
    dbInstance.exec(`CREATE TABLE IF NOT EXISTS campanias (
      id TEXT PRIMARY KEY, nombre TEXT NOT NULL, activa INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_campania_activa ON campanias(activa) WHERE activa = 1;
      INSERT INTO campanias (id, nombre, activa, created_at)
        SELECT 'camp-vigente', 'Recolección vigente', 1, datetime('now') WHERE NOT EXISTS (SELECT 1 FROM campanias);
      CREATE TABLE IF NOT EXISTS exportaciones (
        id TEXT PRIMARY KEY, tipo TEXT NOT NULL, estado TEXT NOT NULL,
        archivo TEXT NOT NULL, sha256 TEXT NOT NULL, manifiesto TEXT NOT NULL,
        total INTEGER NOT NULL, excluidos INTEGER NOT NULL, created_by TEXT NOT NULL,
        created_at TEXT NOT NULL, recibido_at TEXT, confirmado_at TEXT);`);
    const exportColumns = dbInstance.prepare('PRAGMA table_info(exportaciones)').all();
    for (const name of ['anulado_at', 'anulado_por', 'motivo_anulacion']) {
      if (!exportColumns.some(c => c.name === name)) dbInstance.exec('ALTER TABLE exportaciones ADD COLUMN ' + name + ' TEXT');
    }
    if (!exportColumns.some(c => c.name === 'incluye_historicos')) dbInstance.exec('ALTER TABLE exportaciones ADD COLUMN incluye_historicos INTEGER NOT NULL DEFAULT 0');
    if (!columns.some(c => c.name === 'campania_id')) {
      dbInstance.exec('ALTER TABLE contactos ADD COLUMN campania_id TEXT REFERENCES campanias(id)');
    }
    // Solo los registros nuevos reciben la campaña vigente; los anteriores conservan su contexto.
    dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_contactos_campania ON contactos(campania_id);
      CREATE TRIGGER IF NOT EXISTS contactos_campania AFTER INSERT ON contactos
      WHEN NEW.campania_id IS NULL BEGIN
        UPDATE contactos SET campania_id = (SELECT id FROM campanias WHERE activa = 1) WHERE id = NEW.id;
      END;`);

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
    const funcionarioColumns = dbInstance.prepare('PRAGMA table_info(funcionarios)').all();
    for (const [name, definition] of [['cargo', "TEXT NOT NULL DEFAULT ''"], ['activo', 'INTEGER NOT NULL DEFAULT 1'], ['version', 'INTEGER NOT NULL DEFAULT 1']]) {
      if (!funcionarioColumns.some(c => c.name === name)) dbInstance.exec('ALTER TABLE funcionarios ADD COLUMN ' + name + ' ' + definition);
    }
    dbInstance.exec(`CREATE TRIGGER IF NOT EXISTS funcionarios_version AFTER UPDATE ON funcionarios
      WHEN NEW.version = OLD.version BEGIN
        UPDATE funcionarios SET version = OLD.version + 1 WHERE id = NEW.id;
      END;
      CREATE TABLE IF NOT EXISTS funcionarios_historial (
        id TEXT PRIMARY KEY, funcionario_id TEXT NOT NULL REFERENCES funcionarios(id),
        usuario_id TEXT NOT NULL, usuario_nombre TEXT NOT NULL, accion TEXT NOT NULL,
        detalles TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_funcionarios_historial ON funcionarios_historial(funcionario_id, created_at DESC);`);
    const contactColumns = dbInstance.prepare('PRAGMA table_info(contactos)').all();
    for (const [name, definition] of [['director_email', "TEXT NOT NULL DEFAULT ''"], ['director_funcionario_id', 'TEXT REFERENCES funcionarios(id)'],
      ['autorizacion_contacto', "TEXT NOT NULL DEFAULT ''"], ['reportante_funcionario_id', 'TEXT REFERENCES funcionarios(id)']]) {
      if (!contactColumns.some(c => c.name === name)) dbInstance.exec('ALTER TABLE contactos ADD COLUMN ' + name + ' ' + definition);
    }
    dbInstance.exec("CREATE INDEX IF NOT EXISTS idx_contactos_reportante_origen ON contactos(reportante_funcionario_id, es_consolidado, created_at DESC)");
    if (!contactColumns.some(c => c.name === 'reportante_funcionario_id')) dbInstance.exec("UPDATE contactos SET reportante_funcionario_id = (SELECT f.id FROM funcionarios f WHERE f.email_normalized = LOWER(TRIM(contactos.recomienda_email))) WHERE es_consolidado = 0");
    dbInstance.exec("CREATE TRIGGER IF NOT EXISTS contactos_reportante AFTER INSERT ON contactos WHEN NEW.es_consolidado = 0 AND NEW.reportante_funcionario_id IS NULL BEGIN UPDATE contactos SET reportante_funcionario_id = (SELECT f.id FROM funcionarios f WHERE f.email_normalized = LOWER(TRIM(NEW.recomienda_email))) WHERE id = NEW.id; END;");
    dbInstance.exec("CREATE INDEX IF NOT EXISTS idx_contactos_consolidado_departamento ON contactos(es_consolidado, departamento_id, director_funcionario_id)");
    require('../utils/departamentos').initializeMemberships(dbInstance);
  }
  return dbInstance;
}

/**
 * Ejecuta una serie de operaciones dentro de una transacción atómica segura.
 */
function runTransaction(fn) {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const result = fn(db);
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    db.exec('ROLLBACK;');
    if (err.message?.includes('CONTACT_EMAIL_ALREADY_EXISTS')) {
      err.statusCode = 409;
      err.message = 'El correo ya está registrado en el sistema y no admite otro registro.';
    }
    throw err;
  }
}

module.exports = {
  getDb,
  runTransaction
};
