const crypto = require('node:crypto');

function departmentKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}
function splitDependencies(value) {
  const unique = new Map();
  for (const name of String(value || '').split(';').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean)) {
    unique.set(departmentKey(name), name);
  }
  return [...unique.values()];
}
// Solo se unifican diferencias de acentos, mayúsculas y espacios. Una subcadena no acredita pertenencia.
function resolveDepartment(db, name, sedeId = null) {
  const key = departmentKey(name);
  if (!key) throw new Error('Indique una dependencia.');
  const matches = db.prepare('SELECT id, nombre FROM departamentos ORDER BY id').all().filter(d => departmentKey(d.nombre) === key);
  if (matches.length > 1) throw new Error('Existen dependencias con el mismo nombre. Solicite su revisión administrativa.');
  if (matches[0]) return matches[0].id;
  const id = 'dep-' + crypto.randomUUID();
  db.prepare('INSERT INTO departamentos (id, codigo, nombre, sede_id, activo) VALUES (?, ?, ?, ?, 1)')
    .run(id, 'DEP', name.trim().replace(/\s+/g, ' '), sedeId);
  return id;
}

function initializeMemberships(db) {
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'funcionario_departamentos'").get();
  if (exists) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE funcionario_departamentos (
      funcionario_id TEXT NOT NULL REFERENCES funcionarios(id),
      departamento_id TEXT NOT NULL REFERENCES departamentos(id),
      origen TEXT NOT NULL CHECK(origen IN ('PADRON', 'MANUAL')),
      PRIMARY KEY (funcionario_id, departamento_id));
      CREATE INDEX idx_funcionario_departamentos_depto ON funcionario_departamentos(departamento_id, funcionario_id);`);
    const insert = db.prepare('INSERT OR IGNORE INTO funcionario_departamentos VALUES (?, ?, ?)');
    for (const f of db.prepare('SELECT * FROM funcionarios').all()) {
      const names = splitDependencies(f.dependencia);
      // El texto original con ; es la fuente. No perpetuar la antigua coincidencia parcial.
      const ids = names.length ? names.map(name => resolveDepartment(db, name, null)) : [f.departamento_id].filter(Boolean);
      for (const id of ids) insert.run(f.id, id, 'PADRON');
      if (ids.length) db.prepare('UPDATE funcionarios SET departamento_id = ? WHERE id = ?').run(ids[0], f.id);
    }
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
}

module.exports = { departmentKey, splitDependencies, resolveDepartment, initializeMemberships };
