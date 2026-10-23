const { getDb } = require('../database/db');
const { equivalentDepartments } = require('../utils/departamentos');

function memberships(f) {
  const db = getDb(), result = new Map();
  const rows = db.prepare(`SELECT d.id, d.nombre, d.sede_id, m.origen FROM funcionario_departamentos m
    JOIN departamentos d ON d.id = m.departamento_id WHERE m.funcionario_id = ? AND d.activo = 1 ORDER BY d.nombre`).all(f.id);
  for (const d of rows) {
    if (d.nombre.includes(';')) continue;
    const canonical = equivalentDepartments(db, d.id, true)[0];
    if (!canonical) continue;
    const previous = result.get(canonical.id);
    result.set(canonical.id, { ...d, ...canonical, origen: previous?.origen === 'PADRON' ? 'PADRON' : d.origen });
  }
  return [...result.values()];
}
function authorizedDepartments(f) {
  const db = getDb(), result = new Map();
  const add = d => {
    if (d.nombre.includes(';')) return;
    const aliases = equivalentDepartments(db, d.id, true);
    if (!aliases.length) return;
    const canonical = aliases[0], previous = result.get(canonical.id);
    result.set(canonical.id, { ...d, ...canonical, ...previous, alias_ids: aliases.map(a => a.id),
      asignado_consolidado: Boolean(previous?.asignado_consolidado || d.asignado_consolidado) });
  };
  memberships(f).forEach(add);
  const assigned = db.prepare(`SELECT DISTINCT d.id, d.nombre, d.sede_id FROM contactos c
    JOIN departamentos d ON d.id = c.departamento_id AND d.activo = 1
    WHERE c.es_consolidado = 1 AND (c.director_funcionario_id = ? OR
      (c.director_funcionario_id IS NULL AND c.director_email = ?))`).all(f.id, f.email_normalized);
  for (const d of assigned) {
    add({ ...d, origen: 'CONSOLIDADO', asignado_consolidado: true });
  }
  return [...result.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}
function enrich(f) {
  if (!f) return null;
  const canonical = equivalentDepartments(getDb(), f.departamento_id, true)[0];
  return { ...f, departamento_id: canonical?.id || f.departamento_id,
    dependencias: memberships(f), dependencias_autorizadas: authorizedDepartments(f) };
}
function identity(f) {
  return { nombre: f.nombre, email: f.email_normalized, dependencia: f.dependencia, sede: f.sede,
    dependencias: authorizedDepartments(f) };
}
function selectDepartment(f, requested) {
  const departments = authorizedDepartments(f);
  if (requested !== undefined && requested !== null && typeof requested !== 'string') {
    throw Object.assign(new Error('Seleccione una dependencia válida.'), { statusCode: 422 });
  }
  const id = requested || (departments.length === 1 ? departments[0].id : null);
  const selected = departments.find(d => d.id === id || d.alias_ids.includes(id));
  if (!selected) throw Object.assign(new Error(id ? 'La dependencia seleccionada no está asignada al funcionario.' : 'Seleccione la dependencia a la que corresponde este aporte.'), { statusCode: 422 });
  return { ...f, departamento_id: selected.id, sede_id: selected.sede_id || f.sede_id };
}
module.exports = { memberships, authorizedDepartments, enrich, identity, selectDepartment };
