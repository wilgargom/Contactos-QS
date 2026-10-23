const { getDb } = require('../database/db');

function memberships(f) {
  return getDb().prepare(`SELECT d.id, d.nombre, d.sede_id, m.origen FROM funcionario_departamentos m
    JOIN departamentos d ON d.id = m.departamento_id WHERE m.funcionario_id = ? AND d.activo = 1 ORDER BY d.nombre`).all(f.id);
}
function authorizedDepartments(f) {
  const db = getDb(), result = new Map(memberships(f).map(d => [d.id, d]));
  const assigned = db.prepare(`SELECT DISTINCT d.id, d.nombre, d.sede_id FROM contactos c
    JOIN departamentos d ON d.id = c.departamento_id AND d.activo = 1
    WHERE c.es_consolidado = 1 AND (c.director_funcionario_id = ? OR
      (c.director_funcionario_id IS NULL AND c.director_email = ?))`).all(f.id, f.email_normalized);
  for (const d of assigned) {
    if (result.has(d.id)) result.set(d.id, { ...result.get(d.id), asignado_consolidado: true });
    else result.set(d.id, { ...d, origen: 'CONSOLIDADO', asignado_consolidado: true });
  }
  return [...result.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}
function enrich(f) {
  return f ? { ...f, dependencias: memberships(f), dependencias_autorizadas: authorizedDepartments(f) } : null;
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
  const selected = departments.find(d => d.id === id);
  if (!selected) throw Object.assign(new Error(id ? 'La dependencia seleccionada no está asignada al funcionario.' : 'Seleccione la dependencia a la que corresponde este aporte.'), { statusCode: 422 });
  return { ...f, departamento_id: selected.id, sede_id: selected.sede_id || f.sede_id };
}
module.exports = { memberships, authorizedDepartments, enrich, identity, selectDepartment };
