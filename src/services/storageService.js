const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const directories = { RESPALDOS: config.PATHS.BACKUPS, EVIDENCIAS: config.PATHS.DRIVE_STAGING,
  EXPORTACIONES: config.PATHS.EXPORTS, CARGAS: config.PATHS.UPLOADS };

function inventory() {
  const files = [];
  for (const [category, directory] of Object.entries(directories)) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || entry.isSymbolicLink()) continue;
      const stat = fs.lstatSync(path.join(directory, entry.name));
      const id = crypto.createHash('sha256').update(JSON.stringify([category, entry.name, stat.size, stat.mtimeMs])).digest('hex');
      files.push({ id, category, name: entry.name, bytes: stat.size, modifiedAt: stat.mtime.toISOString() });
    }
  }
  files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  const protectedBackups = new Set(files.filter(f => f.category === 'RESPALDOS').slice(0, 3).map(f => f.id));
  for (const file of files) {
    const age = Date.now() - Date.parse(file.modifiedAt);
    file.deletable = age > 30 * 86400000 && !protectedBackups.has(file.id);
    // Los archivos ligados a lotes oficiales se conservan para su descarga y trazabilidad.
    if (file.category === 'EXPORTACIONES' && file.name.startsWith('lote_')) file.deletable = false;
  }
  return files;
}
function status() {
  const files = inventory();
  const databaseBytes = ['', '-wal', '-shm'].reduce((sum, suffix) => {
    try { return sum + fs.statSync(config.DB_PATH + suffix).size; } catch (_) { return sum; }
  }, 0);
  const otherBytes = fs.readdirSync(config.PATHS.STORAGE, { withFileTypes: true }).filter(e => e.isFile() && !e.isSymbolicLink() &&
    ![path.basename(config.DB_PATH), path.basename(config.DB_PATH) + '-wal', path.basename(config.DB_PATH) + '-shm'].includes(e.name))
    .reduce((sum, e) => sum + fs.lstatSync(path.join(config.PATHS.STORAGE, e.name)).size, 0);
  return { databaseBytes, otherBytes, totalBytes: databaseBytes + otherBytes + files.reduce((n, f) => n + f.bytes, 0),
    filesCount: files.length, backups: files.filter(f => f.category === 'RESPALDOS').slice(0, 20),
    cleanupCandidates: files.filter(f => f.deletable).slice(0, 30), retentionDays: 30, minimumBackups: 3 };
}
function removeFile(id, confirmed) {
  if (confirmed !== true || typeof id !== 'string') throw Object.assign(new Error('Confirme la eliminación del archivo.'), { statusCode: 400 });
  const item = inventory().find(f => f.id === id && f.deletable);
  if (!item) throw Object.assign(new Error('El archivo cambió, está protegido o no cumple el plazo de conservación.'), { statusCode: 409 });
  const target = path.join(directories[item.category], item.name);
  const stat = fs.lstatSync(target);
  const expected = crypto.createHash('sha256').update(JSON.stringify([item.category, item.name, stat.size, stat.mtimeMs])).digest('hex');
  if (!stat.isFile() || stat.isSymbolicLink() || expected !== id) throw Object.assign(new Error('El archivo cambió. Actualice la lista.'), { statusCode: 409 });
  fs.unlinkSync(target);
  return { success: true, removed: item.name, bytes: item.bytes };
}
function readBackup(name) {
  if (typeof name !== 'string' || !/^tec_qs_backup_[a-z0-9_.-]+\.sqlite$/i.test(name)) throw Object.assign(new Error('Respaldo inválido.'), { statusCode: 400 });
  const target = path.join(config.PATHS.BACKUPS, name);
  let stat;
  try { stat = fs.lstatSync(target); } catch (_) { throw Object.assign(new Error('El respaldo ya no está disponible.'), { statusCode: 404 }); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024) throw Object.assign(new Error('El respaldo requiere recuperación directa desde el almacenamiento.'), { statusCode: 413 });
  return fs.readFileSync(target);
}
module.exports = { status, removeFile, readBackup };
