const { getDb } = require('../database/db');
function fail(message) { throw Object.assign(new Error(message), { statusCode: 400 }); }
function list(reporter, query = {}) {
  const db = getDb(), f = reporter.funcionario;
  if (Object.keys(query).some(k => !['origen', 'q', 'tipo_contacto', 'metodo', 'director_id', 'departamento_id', 'page'].includes(k))) fail('La consulta contiene filtros no admitidos.');
  if (Object.values(query).some(v => typeof v !== 'string')) fail('Filtros inválidos.');
  const origen = query.origen || 'actuales';
  if (!['actuales', 'consolidado'].includes(origen)) fail('Seleccione una procedencia válida.');
  if (query.tipo_contacto && !['ACADEMICO','EMPLEADOR'].includes(query.tipo_contacto)) fail('Tipo de contacto inválido.');
  if (query.metodo && !['INDIVIDUAL','CARGA_MASIVA'].includes(query.metodo)) fail('Método inválido.');
  const page = Number(query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || (query.q || '').length > 200) fail('Revise la búsqueda o la página.');
  // El correo ingresado identifica una ficha activa del padrón. El servidor toma de esa ficha el identificador y la dependencia; los filtros no cambian ese alcance.
  const own = 'c.es_consolidado = 0 AND c.reportante_funcionario_id = ?';
  // El libro administrativo puede asignar varias dependencias al mismo director.
  // Las relaciones se toman de los contactos; la dependencia principal del padrón no se sobrescribe.
  const consolidated = 'c.es_consolidado = 1 AND ((c.director_funcionario_id IS NOT NULL AND (c.departamento_id = ? OR c.director_funcionario_id = ?)) OR (c.director_funcionario_id IS NULL AND c.director_email = ?))';
  const scope = [f.departamento_id, f.id, f.email_normalized];
  const base = origen === 'actuales' ? own : consolidated, args = origen === 'actuales' ? [f.id] : [...scope];
  let where = '(' + base + ')';
  if (query.q) { where += ' AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.institution LIKE ? OR c.company_name LIKE ?)'; args.push(...Array(5).fill('%'+query.q.trim()+'%')); }
  if (query.tipo_contacto) { where += ' AND c.tipo_contacto = ?'; args.push(query.tipo_contacto); }
  if (query.departamento_id) { where += ' AND c.departamento_id = ?'; args.push(query.departamento_id); }
  if (query.metodo && origen === 'actuales') { where += ' AND c.metodo_ingreso = ?'; args.push(query.metodo); }
  if (query.director_id && origen === 'consolidado') { where += ' AND c.director_funcionario_id = ?'; args.push(query.director_id); }
  const total = db.prepare('SELECT COUNT(*) AS n FROM contactos c WHERE '+where).get(...args).n;
  const pages = Math.max(1, Math.ceil(total / 25)), currentPage = Math.min(page, pages);
  const contacts = db.prepare('SELECT c.id, c.tipo_contacto, c.title, c.first_name, c.last_name, c.email, c.phone, c.country_name, c.institution, c.company_name, c.job_title, c.position, c.department_unit, c.subject_area, c.industry, c.estado, c.metodo_ingreso, c.es_consolidado, c.escuela_proponente, c.director_email, c.autorizacion_contacto, c.created_at, d.nombre AS departamento_nombre FROM contactos c LEFT JOIN departamentos d ON d.id = c.departamento_id WHERE '+where+' ORDER BY c.created_at DESC, c.id LIMIT 25 OFFSET ?').all(...args, (currentPage - 1)*25);
  const counts = { actuales: db.prepare('SELECT COUNT(*) AS n FROM contactos c WHERE '+own).get(f.id).n,
    consolidado: db.prepare('SELECT COUNT(*) AS n FROM contactos c WHERE '+consolidated).get(...scope).n };
  const directors = db.prepare('SELECT DISTINCT f.id, f.nombre, f.email_normalized AS email FROM contactos c JOIN funcionarios f ON f.id = c.director_funcionario_id OR (c.director_funcionario_id IS NULL AND f.email_normalized = c.director_email) WHERE '+consolidated+' ORDER BY f.nombre, f.email_normalized').all(...scope);
  const departments = db.prepare('SELECT DISTINCT d.id, d.nombre FROM contactos c JOIN departamentos d ON c.departamento_id = d.id WHERE ('+own+') OR ('+consolidated+') ORDER BY d.nombre').all(f.id, ...scope);
  return { contacts, total, page: currentPage, pages, pageSize: 25, counts, directors, departments, origen,
    funcionario: { nombre: f.nombre, email: f.email_normalized, dependencia: f.dependencia, sede: f.sede } };
}
module.exports = { list };
