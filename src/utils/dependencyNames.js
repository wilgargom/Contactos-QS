// Reglas de presentación compartidas por el padrón y los catálogos. Una similitud
// de palabras no acredita pertenencia: programas, fondos y sedes se conservan.
function textKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}
const accents = Object.fromEntries(('Administración Dirección Vicerrectoría Investigación Protección Ingeniería Computación Producción Líneas Estratégicas Maestría Electromecánica Asesoría Biología Comunicación Vinculación Género Electrónica Construcción Conserjería Orientación Psicología Planificación Tecnológica Académico Tecnológico Área Gestión José Auditoría').split(' ').map(w => [textKey(w), w.toLowerCase()]));
const acronyms = new Set(['DATIC', 'VIESA', 'GASEL', 'CIPA', 'CIIF', 'CEQUIATEC', 'TEC']);
const lowerWords = new Set(['de', 'del', 'en', 'y', 'para', 'a']);
const aliases = new Map([
  ['escuela de computacion', 'Escuela de Ingeniería en Computación'],
  ['escuela de ingenieria en computacion-cartago', 'Escuela de Ingeniería en Computación'],
  ['escuela de ingenieria en computacion - cartago', 'Escuela de Ingeniería en Computación'],
  ['escuela de ingenieria produccion industrial', 'Escuela de Ingeniería en Producción Industrial'],
  ['fondo proyectos estrategicos', 'Fondo de Proyectos Estratégicos'],
]);
function normalizeDependency(value) {
  const clean = String(value || '').trim().replace(/\s+/g, ' ');
  if (aliases.has(textKey(clean))) return aliases.get(textKey(clean));
  return clean.split(' ').map((word, i) => {
    if (acronyms.has(word.replace(/[().,]/g, '').toUpperCase())) return word.toUpperCase();
    const lower = accents[textKey(word)] || word.toLocaleLowerCase('es');
    return i && lowerWords.has(lower) ? lower : lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1);
  }).join(' ');
}
function normalizedDependencies(value) {
  return [...new Set(String(value || '').split(';').map(normalizeDependency).filter(Boolean))];
}
function dependencyKey(value) {
  const key = textKey(value);
  return aliases.has(key) ? textKey(aliases.get(key)) : key;
}
module.exports = { textKey, dependencyKey, normalizeDependency, normalizedDependencies };
