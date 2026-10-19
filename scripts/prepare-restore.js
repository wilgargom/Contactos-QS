// Prepara una base nueva; nunca sustituye la base activa.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync, backup } = require('node:sqlite');

function verify(db) {
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Integridad inválida.');
  if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Relaciones inválidas.');
  for (const table of ['contactos', 'usuarios', 'sesiones', 'auditoria']) db.prepare(`SELECT COUNT(*) FROM ${table}`).get();
}
async function prepareRestore(source, destination) {
  if (!source || !destination) throw new Error('Uso: node scripts/prepare-restore.js respaldo.sqlite base-nueva.sqlite');
  const input = path.resolve(source); const output = path.resolve(destination);
  if (fs.existsSync(output)) throw new Error('El destino ya existe. Elija un archivo nuevo.');
  if (!fs.lstatSync(input).isFile() || fs.lstatSync(input).isSymbolicLink()) throw new Error('El respaldo debe ser un archivo regular.');
  const temporary = path.join(path.dirname(output), `.restore-${crypto.randomUUID()}.sqlite`);
  let original; let restored;
  try {
    original = new DatabaseSync(input, { readOnly: true });
    verify(original);
    await backup(original, temporary);
    original.close(); original = null;
    restored = new DatabaseSync(temporary);
    restored.exec('PRAGMA journal_mode=DELETE; DELETE FROM sesiones;');
    verify(restored);
    const contacts = restored.prepare('SELECT COUNT(*) AS total FROM contactos').get().total;
    restored.close(); restored = null;
    fs.copyFileSync(temporary, output, fs.constants.COPYFILE_EXCL);
    return { verified: true, sessionsRevoked: true, contacts, output };
  } finally {
    if (original) original.close();
    if (restored) restored.close();
    for (const suffix of ['', '-wal', '-shm', '-journal']) fs.rmSync(temporary + suffix, { force: true });
  }
}
if (require.main === module) prepareRestore(...process.argv.slice(2)).then(result => console.log(JSON.stringify(result)))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { prepareRestore };
