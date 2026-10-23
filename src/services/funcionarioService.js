const crypto = require('node:crypto');
const { getDb, runTransaction } = require('../database/db');
const { normalizeEmail, normalizeText } = require('../utils/validator');

function resolveSedeId(sedeText) {
  if (!sedeText) return 'sede-cartago';
  const clean = (sedeText || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (clean.includes('san jose') || clean.includes('barrio amon')) return 'sede-sanjose';
  if (clean.includes('san carlos') || clean.includes('santa clara')) return 'sede-sancarlos';
  if (clean.includes('alajuela')) return 'sede-alajuela';
  if (clean.includes('limon')) return 'sede-limon';
  return 'sede-cartago';
}

const { splitDependencies, resolveDepartment, departmentKey } = require('../utils/departamentos');
const { enrich } = require('./funcionarioScope');

function departmentPlan(data) {
  const db = getDb();
  const sedes = [...new Set(String(data.sede || '').split(';').filter(s => s.trim()).map(resolveSedeId))];
  const selections = data.sedes_dependencias || {};
  if (typeof selections !== 'object' || Array.isArray(selections)) throw new Error('Revise las sedes seleccionadas por dependencia.');
  const names = splitDependencies(data.dependencia);
  if (Object.keys(selections).some(key => !names.some(name => departmentKey(name) === key))) throw new Error('La selección incluye una dependencia ajena a la fila.');
  const catalog = db.prepare('SELECT nombre, sede_id FROM departamentos WHERE activo = 1').all();
  const candidates = name => [...new Set(catalog.filter(d => departmentKey(d.nombre) === departmentKey(name) && sedes.includes(d.sede_id)).map(d => d.sede_id))];
  const previousPrimary = typeof data.email === 'string' ? db.prepare(`SELECT d.nombre, COALESCE(d.sede_id, f.sede_id) AS sede_id FROM funcionarios f
    JOIN departamentos d ON d.id = f.departamento_id AND d.activo = 1 WHERE f.email_normalized = ?`).get(normalizeEmail(data.email)) : null;
  // Principal explícita vigente; para una ficha nueva, primera dependencia del padrón.
  const keepPrincipal = previousPrimary && names.some(name => departmentKey(name) === departmentKey(previousPrimary.nombre)) && sedes.includes(previousPrimary.sede_id);
  const principal = keepPrincipal ? previousPrimary.sede_id : names.length && candidates(names[0]).length === 1 ? candidates(names[0])[0] : null;
  const principalKey = departmentKey(keepPrincipal ? previousPrimary.nombre : names[0]);
  return names.map(name => {
    const key = departmentKey(name);
    const matches = candidates(name);
    const selected = selections[key];
    if (selected !== undefined && (typeof selected !== 'string' || !sedes.includes(selected))) throw new Error('La sede seleccionada no pertenece a las sedes de esta fila.');
    const sedeId = selected || (sedes.length === 1 ? sedes[0] : key === principalKey && principal ? principal : matches.length === 1 ? matches[0] : principal);
    return { name, key, sedeId, opciones: sedes.map(id => db.prepare('SELECT id, nombre FROM sedes WHERE id = ? AND activo = 1').get(id)).filter(Boolean) };
  });
}

/**
 * Busca un funcionario por su correo institucional normalizado
 */
function getFuncionarioByEmail(email) {
  if (!email) return null;
  const norm = normalizeEmail(email);
  if (!norm) return null;

  const db = getDb();
  let f = db.prepare(`
    SELECT f.*, s.nombre as sede_nombre, d.nombre as departamento_nombre
    FROM funcionarios f
    LEFT JOIN sedes s ON f.sede_id = s.id
    LEFT JOIN departamentos d ON f.departamento_id = d.id
    WHERE f.email_normalized = ? AND f.activo = 1
  `).get(norm);

  if (!f) return null;

  return enrich(f);
}

/**
 * Busca funcionarios que coincidan con un término en nombre, email o dependencia
 */
function searchFuncionarios(term = '', limit = 10) {
  const db = getDb();
  const clean = (term || '').trim();
  if (!clean) {
    return db.prepare('SELECT * FROM funcionarios WHERE activo = 1 ORDER BY nombre ASC LIMIT ?').all(limit);
  }
  const likeTerm = `%${clean}%`;
  return db.prepare(`
    SELECT * FROM funcionarios
    WHERE activo = 1 AND (nombre LIKE ? OR email LIKE ? OR dependencia LIKE ?)
    ORDER BY nombre ASC
    LIMIT ?
  `).all(likeTerm, likeTerm, likeTerm, limit);
}

/**
 * Inserta o actualiza un funcionario en el padrón del TEC
 */
function upsertFuncionario(data, user = null) {
  const db = getDb();
  if (!db.isTransaction) return runTransaction(() => upsertFuncionario(data, user));
  const { nombre, email, dependencia, sede, sede_id, departamento_id, cargo, puesto } = data;
  if (typeof nombre !== 'string' || typeof email !== 'string' || !nombre.trim() || !email.trim()) {
    throw new Error('El nombre y correo del funcionario son obligatorios.');
  }

  if ([nombre, email, dependencia, sede].some(value => typeof value !== 'string' || !value.trim())) {
    throw new Error('Indique nombre, correo, dependencia y sede oficiales.');
  }
  if (nombre.trim().length < 3 || dependencia.trim().length < 2 || sede.trim().length < 2 ||
      nombre.length > 200 || dependencia.length > 2000 || sede.length > 200) {
    throw new Error('Revise la longitud de los datos del funcionario.');
  }
  const cleanNombre = normalizeText(nombre);
  const cleanEmail = email.trim().toLowerCase();
  const emailNorm = normalizeEmail(cleanEmail);

  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(itcr\.ac\.cr|tec\.ac\.cr)$/.test(emailNorm)) {
    throw new Error('El correo del funcionario debe pertenecer al dominio institucional del TEC (@itcr.ac.cr o @tec.ac.cr).');
  }

  const cleanDependencia = normalizeText(dependencia) || 'Dependencia no especificada';
  const cleanSede = normalizeText(sede) || 'Campus Central Cartago';

  const existing = db.prepare('SELECT * FROM funcionarios WHERE email_normalized = ?').get(emailNorm);
  const now = new Date().toISOString();

  // Resolver IDs de sede y departamento
  let finalSedeId = sede_id || resolveSedeId(cleanSede.split(';')[0]);
  const names = splitDependencies(cleanDependencia);
  if (!names.length || names.length > 30 || names.some(n => n.length < 2 || n.length > 200)) throw new Error('Revise las dependencias separadas por punto y coma.');
  const plan = departmentPlan({ email: cleanEmail, dependencia: cleanDependencia, sede: cleanSede, sedes_dependencias: data.sedes_dependencias });
  const pending = plan.filter(p => !p.sedeId);
  if (pending.length) throw Object.assign(new Error('Seleccione la sede de las dependencias indicadas antes de importar. No se guardó ninguna fila.'), {
    code: 'STAFF_DEPARTMENT_REVIEW', conflicts: pending.map(p => ({ email: emailNorm, nombre: cleanNombre, dependencia: p.name, key: p.key, opciones: p.opciones })) });
  const departmentIds = plan.map(p => resolveDepartment(db, p.name, p.sedeId));
  if (departamento_id && !departmentIds.includes(departamento_id)) throw new Error('La dependencia no coincide con el identificador indicado.');
  const previousPrimary = existing?.departamento_id ? db.prepare('SELECT nombre, COALESCE(sede_id, ?) AS sede_id FROM departamentos WHERE id = ?').get(existing.sede_id, existing.departamento_id) : null;
  const preservedPrimary = previousPrimary ? plan.findIndex(p => departmentKey(p.name) === departmentKey(previousPrimary.nombre) && p.sedeId === previousPrimary.sede_id) : -1;
  const finalDeptoId = departamento_id || (preservedPrimary >= 0 ? departmentIds[preservedPrimary] : departmentIds[0]);
  finalSedeId = db.prepare('SELECT sede_id FROM departamentos WHERE id = ?').get(finalDeptoId).sede_id || finalSedeId;
  const previousMemberships = existing ? require('./funcionarioScope').memberships(existing).map(d => d.id).sort() : [];
  const sync = id => {
    db.prepare("DELETE FROM funcionario_departamentos WHERE funcionario_id = ? AND origen = 'PADRON'").run(id);
    const insert = db.prepare('INSERT OR IGNORE INTO funcionario_departamentos VALUES (?, ?, ?)');
    for (const departmentId of departmentIds) insert.run(id, departmentId, 'PADRON');
    if (typeof (cargo ?? puesto) === 'string') db.prepare('UPDATE funcionarios SET cargo = ? WHERE id = ?').run(normalizeText(cargo ?? puesto).slice(0, 200), id);
    if (user) {
      const changes = [{ campo: 'dependencias_padron', anterior: previousMemberships.join('; '), nuevo: departmentIds.slice().sort().join('; ') },
        { campo: 'dependencia', anterior: existing?.dependencia ?? null, nuevo: cleanDependencia }];
      db.prepare('INSERT INTO funcionarios_historial (id, funcionario_id, usuario_id, usuario_nombre, accion, detalles, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), id, user.id, user.nombre || user.username || 'Administrador', existing ? 'IMPORTACION_ACTUALIZACION' : 'IMPORTACION_CREACION', JSON.stringify(changes), now);
    }
  };

  if (existing) {
    db.prepare(`
      UPDATE funcionarios
      SET nombre = ?, email = ?, dependencia = ?, sede = ?, sede_id = ?, departamento_id = ?, updated_at = ?
      WHERE id = ?
    `).run(cleanNombre, cleanEmail, cleanDependencia, cleanSede, finalSedeId, finalDeptoId, now, existing.id);

    sync(existing.id);
    const row = enrich(db.prepare(`
      SELECT f.*, s.nombre as sede_nombre, d.nombre as departamento_nombre
      FROM funcionarios f
      LEFT JOIN sedes s ON f.sede_id = s.id
      LEFT JOIN departamentos d ON f.departamento_id = d.id
      WHERE f.id = ?
    `).get(existing.id));
    return { ...row, isNew: false, funcionario: row };
  } else {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO funcionarios (
        id, nombre, email, email_normalized, dependencia, sede, sede_id, departamento_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, cleanNombre, cleanEmail, emailNorm, cleanDependencia, cleanSede, finalSedeId, finalDeptoId, now, now);

    sync(id);
    const row = enrich(db.prepare(`
      SELECT f.*, s.nombre as sede_nombre, d.nombre as departamento_nombre
      FROM funcionarios f
      LEFT JOIN sedes s ON f.sede_id = s.id
      LEFT JOIN departamentos d ON f.departamento_id = d.id
      WHERE f.id = ?
    `).get(id));
    return { ...row, isNew: true, funcionario: row };
  }
}

/**
 * Importación masiva de funcionarios desde archivo Excel/CSV
 */
function bulkImportFuncionarios(rows, user = null) {
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return { success: false, message: 'No se encontraron filas para importar.' };
  }

  if (rows.length > 10000) throw new Error('El padrón admite hasta 10000 filas por carga.');
  return runTransaction(() => {
    let imported = 0;
    let updated = 0;
    const seen = new Set();
    const prepared = [];
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('El padrón contiene una fila inválida.');
      const data = {
        nombre: row.nombre || row['Nombre de funcionario'] || row['Nombre'] || row['Funcionario'],
        email: row.email || row['Correo electrónico'] || row['Correo'] || row['Email'],
        dependencia: row.dependencia || row['Dependencia'] || row['Departamento'] || row['Escuela'],
        sede: row.sede || row['Sede'] || row['Campus'],
        cargo: row.cargo ?? row.puesto ?? row['Cargo'],
        sedes_dependencias: row.sedes_dependencias
      };
      const email = normalizeEmail(data.email);
      if (seen.has(email)) throw new Error('El padrón contiene correos repetidos. No se guardó ninguna fila.');
      seen.add(email);
      prepared.push(data);
    }
    const conflicts = [];
    for (const data of prepared) {
      const plan = departmentPlan(data);
      conflicts.push(...plan.filter(p => !p.sedeId).map(p => ({ email: normalizeEmail(data.email), nombre: data.nombre,
        dependencia: p.name, key: p.key, opciones: p.opciones })));
      data.sedes_dependencias = Object.fromEntries(plan.filter(p => p.sedeId).map(p => [p.key, p.sedeId]));
    }
    if (conflicts.length) throw Object.assign(new Error('Seleccione la sede de las dependencias indicadas antes de importar. No se guardó ninguna fila.'), { code: 'STAFF_DEPARTMENT_REVIEW', conflicts });
    for (const data of prepared) {
      const result = upsertFuncionario(data, user);
      if (result.isNew) imported++;
      else updated++;
    }
    return { success: true, total: imported + updated, imported, updated,
      nuevos: imported, actualizados: updated,
      message: `Se procesaron ${imported + updated} funcionarios (${imported} nuevos, ${updated} actualizados).` };
  });
}

function listFuncionarios() {
  const db = getDb();
  return db.prepare('SELECT * FROM funcionarios WHERE activo = 1 ORDER BY nombre ASC').all();
}

// Validación común de la persona reportante para registro individual y carga de contactos.
// Comprueba su existencia en el padrón; no sustituye una autenticación del buzón.
function verifyReporter(email) {
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(itcr\.ac\.cr|tec\.ac\.cr)$/.test(normalized)) return null;
  const funcionario = getFuncionarioByEmail(normalized);
  if (!funcionario || !funcionario.nombre?.trim() || !funcionario.sede_id || !funcionario.departamento_id) return null;
  return funcionario;
}

module.exports = {
  getFuncionarioByEmail,
  searchFuncionarios,
  upsertFuncionario,
  bulkImportFuncionarios,
  verifyReporter,
  listFuncionarios
};
