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

function resolveOrRegisterDepartamento(db, dependenciaName, sedeId) {
  if (!dependenciaName) return null;
  const clean = (dependenciaName || '').trim();
  if (!clean) return null;

  // 1. Coincidencia exacta
  let d = db.prepare('SELECT id FROM departamentos WHERE LOWER(TRIM(nombre)) = LOWER(?)').get(clean);
  if (d) return d.id;

  // 2. Coincidencia parcial
  d = db.prepare("SELECT id FROM departamentos WHERE LOWER(?) LIKE ('%' || LOWER(nombre) || '%')").get(clean);
  if (d) return d.id;

  d = db.prepare("SELECT id FROM departamentos WHERE LOWER(nombre) LIKE ?").get(`%${clean.toLowerCase()}%`);
  if (d) return d.id;

  // 3. Crear nuevo departamento en la tabla departamentos
  const newId = 'dep-' + crypto.randomUUID().slice(0, 8);
  const cod = clean.slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'DEP';
  db.prepare(`
    INSERT INTO departamentos (id, codigo, nombre, sede_id, activo)
    VALUES (?, ?, ?, ?, 1)
  `).run(newId, cod, clean, sedeId || 'sede-cartago');

  return newId;
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
    WHERE f.email_normalized = ?
  `).get(norm);

  if (!f) return null;

  // Si sede_id o departamento_id no estaban asignados, resolverlos y persistirlos
  let needsUpdate = false;
  let finalSedeId = f.sede_id;
  let finalDeptoId = f.departamento_id;

  if (!finalSedeId && f.sede) {
    finalSedeId = resolveSedeId(f.sede);
    needsUpdate = true;
  }
  if (!finalDeptoId && f.dependencia) {
    finalDeptoId = resolveOrRegisterDepartamento(db, f.dependencia, finalSedeId);
    needsUpdate = true;
  }

  if (needsUpdate) {
    db.prepare('UPDATE funcionarios SET sede_id = ?, departamento_id = ? WHERE id = ?')
      .run(finalSedeId, finalDeptoId, f.id);
    
    f = db.prepare(`
      SELECT f.*, s.nombre as sede_nombre, d.nombre as departamento_nombre
      FROM funcionarios f
      LEFT JOIN sedes s ON f.sede_id = s.id
      LEFT JOIN departamentos d ON f.departamento_id = d.id
      WHERE f.id = ?
    `).get(f.id);
  }

  return f;
}

/**
 * Busca funcionarios que coincidan con un término en nombre, email o dependencia
 */
function searchFuncionarios(term = '', limit = 10) {
  const db = getDb();
  const clean = (term || '').trim();
  if (!clean) {
    return db.prepare('SELECT * FROM funcionarios ORDER BY nombre ASC LIMIT ?').all(limit);
  }
  const likeTerm = `%${clean}%`;
  return db.prepare(`
    SELECT * FROM funcionarios
    WHERE nombre LIKE ? OR email LIKE ? OR dependencia LIKE ?
    ORDER BY nombre ASC
    LIMIT ?
  `).all(likeTerm, likeTerm, likeTerm, limit);
}

/**
 * Inserta o actualiza un funcionario en el padrón del TEC
 */
function upsertFuncionario({ nombre, email, dependencia, sede, sede_id, departamento_id }) {
  if (!nombre || !email) {
    throw new Error('El nombre y correo del funcionario son obligatorios.');
  }

  const cleanNombre = normalizeText(nombre);
  const cleanEmail = email.trim().toLowerCase();
  const emailNorm = normalizeEmail(cleanEmail);

  if (!emailNorm.endsWith('@itcr.ac.cr') && !emailNorm.endsWith('@tec.ac.cr')) {
    throw new Error('El correo del funcionario debe pertenecer al dominio institucional del TEC (@itcr.ac.cr o @tec.ac.cr).');
  }

  const cleanDependencia = normalizeText(dependencia) || 'Dependencia no especificada';
  const cleanSede = normalizeText(sede) || 'Campus Central Cartago';

  const db = getDb();
  const existing = db.prepare('SELECT * FROM funcionarios WHERE email_normalized = ?').get(emailNorm);
  const now = new Date().toISOString();

  // Resolver IDs de sede y departamento
  const finalSedeId = sede_id || resolveSedeId(cleanSede);
  const finalDeptoId = departamento_id || resolveOrRegisterDepartamento(db, cleanDependencia, finalSedeId);

  if (existing) {
    db.prepare(`
      UPDATE funcionarios
      SET nombre = ?, email = ?, dependencia = ?, sede = ?, sede_id = ?, departamento_id = ?, updated_at = ?
      WHERE id = ?
    `).run(cleanNombre, cleanEmail, cleanDependencia, cleanSede, finalSedeId, finalDeptoId, now, existing.id);

    const row = db.prepare(`
      SELECT f.*, s.nombre as sede_nombre, d.nombre as departamento_nombre
      FROM funcionarios f
      LEFT JOIN sedes s ON f.sede_id = s.id
      LEFT JOIN departamentos d ON f.departamento_id = d.id
      WHERE f.id = ?
    `).get(existing.id);
    return { ...row, isNew: false, funcionario: row };
  } else {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO funcionarios (
        id, nombre, email, email_normalized, dependencia, sede, sede_id, departamento_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, cleanNombre, cleanEmail, emailNorm, cleanDependencia, cleanSede, finalSedeId, finalDeptoId, now, now);

    const row = db.prepare(`
      SELECT f.*, s.nombre as sede_nombre, d.nombre as departamento_nombre
      FROM funcionarios f
      LEFT JOIN sedes s ON f.sede_id = s.id
      LEFT JOIN departamentos d ON f.departamento_id = d.id
      WHERE f.id = ?
    `).get(id);
    return { ...row, isNew: true, funcionario: row };
  }
}

/**
 * Importación masiva de funcionarios desde archivo Excel/CSV
 */
function bulkImportFuncionarios(rows) {
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return { success: false, message: 'No se encontraron filas para importar.' };
  }

  let imported = 0;
  let updated = 0;

  return runTransaction((trx) => {
    for (const row of rows) {
      const nombre = row.nombre || row['Nombre de funcionario'] || row['Nombre'] || row['Funcionario'];
      const email = row.email || row['Correo electrónico'] || row['Correo'] || row['Email'];
      const dependencia = row.dependencia || row['Dependencia'] || row['Departamento'] || row['Escuela'] || 'Dependencia no especificada';
      const sede = row.sede || row['Sede'] || row['Campus'] || 'Campus Central Cartago';

      if (!nombre || !email) continue;
      const emailNorm = normalizeEmail(email);
      if (!emailNorm || (!emailNorm.endsWith('@itcr.ac.cr') && !emailNorm.endsWith('@tec.ac.cr'))) continue;

      const finalSedeId = row.sede_id || resolveSedeId(sede);
      const finalDeptoId = row.departamento_id || resolveOrRegisterDepartamento(trx, dependencia, finalSedeId);

      const existing = trx.prepare('SELECT id FROM funcionarios WHERE email_normalized = ?').get(emailNorm);
      const now = new Date().toISOString();

      if (existing) {
        trx.prepare(`
          UPDATE funcionarios
          SET nombre = ?, email = ?, dependencia = ?, sede = ?, sede_id = ?, departamento_id = ?, updated_at = ?
          WHERE id = ?
        `).run(nombre.trim(), email.trim().toLowerCase(), dependencia.trim(), sede.trim(), finalSedeId, finalDeptoId, now, existing.id);
        updated++;
      } else {
        const id = crypto.randomUUID();
        trx.prepare(`
          INSERT INTO funcionarios (
            id, nombre, email, email_normalized, dependencia, sede, sede_id, departamento_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, nombre.trim(), email.trim().toLowerCase(), emailNorm, dependencia.trim(), sede.trim(), finalSedeId, finalDeptoId, now, now);
        imported++;
      }
    }

    return {
      success: true,
      total: imported + updated,
      imported,
      updated,
      nuevos: imported,
      actualizados: updated,
      message: `Se procesaron exitosamente ${imported + updated} funcionarios (${imported} nuevos, ${updated} actualizados).`
    };
  });
}

function listFuncionarios() {
  const db = getDb();
  return db.prepare('SELECT * FROM funcionarios ORDER BY nombre ASC').all();
}

module.exports = {
  getFuncionarioByEmail,
  searchFuncionarios,
  upsertFuncionario,
  bulkImportFuncionarios,
  listFuncionarios
};
