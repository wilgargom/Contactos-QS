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
  let matches = db.prepare('SELECT id, nombre, sede_id, activo FROM departamentos ORDER BY activo DESC, id').all().filter(d => departmentKey(d.nombre) === key);
  if (new Set(matches.map(d => d.sede_id)).size > 1 && sedeId) matches = matches.filter(d => d.sede_id === sedeId);
  if (new Set(matches.map(d => d.sede_id)).size > 1) {
    throw Object.assign(new Error('Existen dependencias con el mismo nombre en distintas sedes. Solicite su revisión administrativa.'), { code: 'AMBIGUOUS_DEPARTMENT' });
  }
  if (matches[0]) return matches[0].id;
  const id = 'dep-' + crypto.randomUUID();
  db.prepare('INSERT INTO departamentos (id, codigo, nombre, sede_id, activo) VALUES (?, ?, ?, ?, 1)')
    .run(id, 'DEP', name.trim().replace(/\s+/g, ' '), sedeId);
  return id;
}

// Los catálogos antiguos admitían variantes del mismo nombre y sede con distintos IDs.
// Conservar los IDs de los contactos y consultar sus equivalencias evita alterar su procedencia o versión.
function equivalentDepartments(db, id, activeOnly = false) {
  const row = db.prepare('SELECT * FROM departamentos WHERE id = ?').get(id);
  if (!row) return [];
  return db.prepare('SELECT * FROM departamentos ORDER BY activo DESC, id').all().filter(d =>
    (!activeOnly || d.activo) && d.sede_id === row.sede_id && departmentKey(d.nombre) === departmentKey(row.nombre));
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
      const ids = [], unresolved = [];
      for (const name of names) {
        try { ids.push(resolveDepartment(db, name, f.sede.includes(';') ? null : f.sede_id)); }
        catch (err) { if (err.code !== 'AMBIGUOUS_DEPARTMENT') throw err; unresolved.push(name); }
      }
      if (!names.length && f.departamento_id) ids.push(f.departamento_id);
      for (const id of ids) insert.run(f.id, id, 'PADRON');
      if (ids.length) db.prepare('UPDATE funcionarios SET departamento_id = ? WHERE id = ?').run(ids[0], f.id);
      if (unresolved.length) db.prepare('INSERT INTO funcionarios_historial (id, funcionario_id, usuario_id, usuario_nombre, accion, detalles, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), f.id, 'SISTEMA', 'Migración del padrón', 'REVISION_DEPENDENCIAS',
          JSON.stringify([{ campo: 'dependencias_pendientes', anterior: unresolved.join('; '), nuevo: 'Requiere asignación administrativa por sede; no se concedió acceso para estas dependencias.' }]), new Date().toISOString());
    }
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
}

module.exports = { departmentKey, splitDependencies, resolveDepartment, equivalentDepartments, initializeMemberships };
