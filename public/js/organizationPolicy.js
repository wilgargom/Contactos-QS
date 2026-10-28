(function (root) {
  const message = 'Restricción institucional: Institución / Empresa debe ser externa al TEC. No se permiten TEC, ITCR ni variantes del nombre institucional.';
  function isTecOrganization(value) {
    const text = String(value || '').normalize('NFKD').replace(/[\u0300-\u036f\u200B-\u200D\uFEFF]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
    // Siglas como palabras completas: no confundir TEC con Biblioteca, Biotec o Stantec.
    if (/(?:^| )(?:t ?e ?c|i ?t ?c ?r|tecitcr|itcrtec|fundatec|tecdigital)(?= |$)/.test(text)) return true;
    const compact = text.replace(/ /g, '');
    return ['tecnologicodecostarica', 'tecnologicocostarica', 'tecnologicocostarricense',
      'institutotecnologicodecr', 'tecnologicodecr', 'fundaciontecnologicadecostarica',
      'fundaciontecnologicacostarica', 'editorialtecnologicadecostarica',
      'costaricainstituteoftechnology', 'costaricaninstituteoftechnology',
      'technologicalinstituteofcostarica', 'costaricatechnologicalinstitute'].some(name => compact.includes(name));
  }
  const policy = { isTecOrganization, message };
  if (typeof module !== 'undefined' && module.exports) module.exports = policy;
  else root.TecOrganizationPolicy = policy;
})(globalThis);
