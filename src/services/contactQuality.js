const { validateContact } = require('../utils/validator');
const { normalizeDependency } = require('../utils/dependencyNames');

function quality(contact) {
  const validation = validateContact(contact, contact.tipo_contacto);
  return {
    ...contact,
    ...(contact.departamento_nombre ? { departamento_nombre: normalizeDependency(contact.departamento_nombre) } : {}),
    calidad_datos: validation.isValid ? 'COMPLETO' : 'CON_OBSERVACIONES',
    observaciones_datos: Object.values(validation.errors).join('; '),
    exportable_historico: Boolean(contact.es_consolidado && ['NUEVO', 'VALIDADO', 'CORREGIDO', 'EXPORTADO'].includes(contact.estado))
  };
}

function exportValidation(contact, includeHistorical = false) {
  const validation = validateContact(contact, contact.tipo_contacto);
  const historical = includeHistorical && Boolean(contact.es_consolidado) && ['NUEVO', 'VALIDADO', 'CORREGIDO', 'EXPORTADO'].includes(contact.estado);
  const complete = validation.isValid && ['VALIDADO', 'CORREGIDO', 'EXPORTADO'].includes(contact.estado);
  return { ...validation, isValid: complete || historical,
    historicalWithObservations: historical && !validation.isValid };
}

module.exports = { quality, exportValidation };
