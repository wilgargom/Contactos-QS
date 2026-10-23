const { getDb } = require('../database/db');
const { normalizeEmail, normalizeText } = require('../utils/validator');

/**
 * Distancia de Levenshtein entre dos cadenas
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let i = 1; i <= b.length; i++) {
    const current = [i];
    for (let j = 1; j <= a.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1,
        previous[j - 1] + (b[i - 1] === a[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[a.length];

}

/**
 * Similitud entre 0 y 1 calculada mediante Levenshtein normalizado
 */
function stringSimilarity(s1, s2) {
  const str1 = normalizeText(s1).toLowerCase();
  const str2 = normalizeText(s2).toLowerCase();
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;
  const maxLen = Math.max(str1.length, str2.length);
  const dist = levenshteinDistance(str1, str2);
  return 1.0 - (dist / maxLen);
}

/**
 * Limpieza fonética/diacrítica para nombres
 */
function cleanName(name) {
  return normalizeText(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '');
}

/**
 * Evalúa un nuevo contacto contra la base de datos para detectar duplicados
 * candidate: { email, first_name, last_name, tipo_contacto, institution, company_name }
 * excludeId: (opcional) ID de contacto a excluir al editar
 */
function checkDuplicate(candidate, excludeId = null) {
  const db = getDb();
  const candEmailNorm = normalizeEmail(candidate.email);
  const candFirstName = cleanName(candidate.first_name);
  const candLastName = cleanName(candidate.last_name);
  const candFullName = `${candFirstName} ${candLastName}`.trim();
  const candType = (candidate.tipo_contacto || '').toUpperCase();
  const candOrg = cleanName(candType === 'ACADEMICO' ? candidate.institution : candidate.company_name);

  // 1. Búsqueda exacta por correo electrónico
  let queryEmail = "SELECT * FROM contactos WHERE TRIM(email) <> '' AND LOWER(TRIM(email)) = ?";
  const paramsEmail = [candEmailNorm];
  if (excludeId) {
    queryEmail += ' AND id != ?';
    paramsEmail.push(excludeId);
  }
  const emailMatches = candEmailNorm ? db.prepare(queryEmail).all(...paramsEmail) : [];

  if (emailMatches.length > 0) {
    const matched = emailMatches[0];
      return {
        status: 'EXACT_MATCH',
        matchType: 'EMAIL_EXACT',
        existingContact: matched,
        similarityScore: 1.0,
        explanation: `El correo electrónico "${candEmailNorm}" ya se encuentra registrado en el sistema. El correo identifica al contacto y no admite otro registro, aunque cambie su tipo, escuela o procedencia.`
      };
  }

  // 2. Obtener todos los contactos del mismo tipo o potenciales para análisis de similitud
  let queryAll = 'SELECT * FROM contactos WHERE 1=1';
  const paramsAll = [];
  if (excludeId) {
    queryAll += ' AND id != ?';
    paramsAll.push(excludeId);
  }
  const allContacts = db.prepare(queryAll).iterate(...paramsAll);

  let bestMatch = null;
  let highestScore = 0;
  let matchReason = '';
  let matchType = '';

  for (const contact of allContacts) {
    const contactFullName = `${cleanName(contact.first_name)} ${cleanName(contact.last_name)}`.trim();
    const contactOrg = cleanName(contact.tipo_contacto === 'ACADEMICO' ? contact.institution : contact.company_name);

    // Comparar nombre y apellido
    const nameSim = stringSimilarity(candFullName, contactFullName);
    const orgSim = stringSimilarity(candOrg, contactOrg);

    // Mismo nombre y apellido idénticos en la misma institución
    if (nameSim >= 0.95 && orgSim >= 0.85) {
      return {
        status: 'EXACT_MATCH',
        matchType: 'NAME_AND_ORG_EXACT',
        existingContact: contact,
        similarityScore: 0.98,
        explanation: `El contacto "${contact.first_name} ${contact.last_name}" ya está registrado en la institución/empresa "${contactOrg}" con otro correo (${contact.email}).`
      };
    }

    // Nombre muy similar (ej. Levenshtein <= 2 o similitud >= 0.85)
    let combinedScore = 0;
    if (nameSim >= 0.85 && orgSim >= 0.70) {
      combinedScore = (nameSim * 0.6) + (orgSim * 0.4);
      if (combinedScore > highestScore) {
        highestScore = combinedScore;
        bestMatch = contact;
        matchType = 'SIMILAR_NAME_AND_ORG';
        matchReason = `Posible duplicado: Nombre altamente similar (${(nameSim*100).toFixed(0)}%) e institución similar (${(orgSim*100).toFixed(0)}%).`;
      }
    } else if (nameSim >= 0.92) {
      combinedScore = nameSim * 0.8;
      if (combinedScore > highestScore) {
        highestScore = combinedScore;
        bestMatch = contact;
        matchType = 'SAME_NAME_DIFFERENT_ORG';
        matchReason = `Mismo nombre completo registrado en "${contactOrg || 'otra organización'}". Requiere confirmar si es homónimo o la misma persona.`;
      }
    }

    // Mismo dominio de correo corporativo + nombre similar
    const candDomain = candEmailNorm.split('@')[1];
    const contactDomain = contact.email_normalized.split('@')[1];
    if (candDomain && contactDomain && candDomain === contactDomain && !['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com'].includes(candDomain)) {
      if (nameSim >= 0.75) {
        const domainScore = 0.85;
        if (domainScore > highestScore) {
          highestScore = domainScore;
          bestMatch = contact;
          matchType = 'SAME_DOMAIN_SIMILAR_NAME';
          matchReason = `Mismo dominio corporativo (@${candDomain}) y similitud de nombre (${(nameSim*100).toFixed(0)}%).`;
        }
      }
    }
  }

  if (highestScore >= 0.75 && bestMatch) {
    return {
      status: 'POTENTIAL_DUPLICATE',
      matchType,
      existingContact: bestMatch,
      similarityScore: highestScore,
      explanation: matchReason
    };
  }

  return {
    status: 'NEW_CONTACT',
    matchType: 'NONE',
    existingContact: null,
    similarityScore: 0.0,
    explanation: 'No se detectaron coincidencias relevantes. Contacto nuevo verificado.'
  };
}

module.exports = {
  checkDuplicate,
  stringSimilarity,
  levenshteinDistance
};
