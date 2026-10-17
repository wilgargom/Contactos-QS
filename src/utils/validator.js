// Catálogo oficial de Países (ISO 3166 con nombres comunes en Español e Inglés)
const COUNTRIES = [
  'Costa Rica', 'Malaysia', 'United States', 'United Kingdom', 'Spain', 'Mexico',
  'Colombia', 'Germany', 'France', 'Chile', 'Argentina', 'Brazil', 'Canada',
  'Australia', 'Japan', 'South Korea', 'Singapore', 'Italy', 'Netherlands',
  'Switzerland', 'Sweden', 'Panama', 'Guatemala', 'Peru', 'Ecuador', 'Uruguay',
  'Portugal', 'Ireland', 'Belgium', 'Austria', 'New Zealand', 'India', 'China',
  'South Africa', 'Norway', 'Denmark', 'Finland', 'Poland'
];

// Sinónimos comunes para normalización automática de países
const COUNTRY_SYNONYMS = {
  'cr': 'Costa Rica',
  'c.r.': 'Costa Rica',
  'costa-rica': 'Costa Rica',
  'usa': 'United States',
  'u.s.a.': 'United States',
  'us': 'United States',
  'estados unidos': 'United States',
  'eeuu': 'United States',
  'ee.uu.': 'United States',
  'uk': 'United Kingdom',
  'u.k.': 'United Kingdom',
  'reino unido': 'United Kingdom',
  'gran bretaña': 'United Kingdom',
  'españa': 'Spain',
  'méxico': 'Mexico',
  'colombia': 'Colombia',
  'alemania': 'Germany',
  'francia': 'France',
  'brasil': 'Brazil',
  'japón': 'Japan',
  'malasia': 'Malaysia',
  'canadá': 'Canada',
  'panamá': 'Panama',
  'perú': 'Peru',
  'italia': 'Italy',
  'suecia': 'Sweden',
  'suiza': 'Switzerland'
};

// Tratamientos / Títulos habituales
const TITLES = [
  'Dr', 'Dra', 'Prof', 'Miss', 'Mr', 'Mrs', 'Ms', 'Ing', 'Lic', 'MSc', 'PhD'
];

// Disciplinas y áreas temáticas del Ranking QS (presentadas en español)
const QS_SUBJECTS = [
  'Administración y Negocios',
  'Agricultura y Silvicultura / Ciencias Forestales',
  'Arquitectura y Urbanismo / Hábitat Construido',
  'Artes y Humanidades',
  'Biotecnología',
  'Ciencia de Datos e Inteligencia Artificial',
  'Ciencias Ambientales',
  'Ciencias Biológicas',
  'Ciencias de la Computación y Sistemas de Información',
  'Ciencias de la Salud',
  'Ciencias de la Tierra y Geología',
  'Ciencias Sociales y Administración',
  'Diseño Industrial',
  'Economía y Econometría',
  'Educación',
  'Estadística e Investigación Operativa',
  'Farmacología',
  'Física y Astronomía',
  'Ingeniería Civil y Estructural',
  'Ingeniería Eléctrica y Electrónica',
  'Ingeniería Industrial',
  'Ingeniería Mecánica, Aeronáutica y Manufactura',
  'Ingeniería Mecatrónica y Robótica',
  'Ingeniería Química',
  'Materiales y Ciencia de los Materiales',
  'Matemáticas',
  'Medicina',
  'Química'
];

// Industrias / Sectores de empleadores (en español)
const QS_INDUSTRIES = [
  'Alimentos, Bebidas y Agroindustria',
  'Automotriz y Aeroespacial',
  'Banca, Finanzas y Seguros',
  'Bienes Raíces y Construcción',
  'Comercio y Bienes de Consumo',
  'Consultoría y Servicios Profesionales',
  'Educación e Investigación Académica',
  'Energía, Servicios Públicos y Minería',
  'Farmacéutica y Biotecnología',
  'Gobierno y Administración Pública',
  'Ingeniería y Manufactura Industrial',
  'Salud y Dispositivos Médicos',
  'Tecnología / Software / TI',
  'Telecomunicaciones'
];

// Normalizar texto (elimina espacios extras y diacríticos si se requiere)
function normalizeText(text) {
  if (!text) return '';
  return String(text).trim().replace(/\s+/g, ' ');
}

// Normalizar correo electrónico
function normalizeEmail(email) {
  if (!email) return '';
  return String(email).trim().toLowerCase();
}

// Resolver país homologado
function resolveCountry(val) {
  if (!val) return null;
  const trimmed = val.trim();
  const lower = trimmed.toLowerCase();
  
  if (COUNTRY_SYNONYMS[lower]) {
    return COUNTRY_SYNONYMS[lower];
  }
  
  const exact = COUNTRIES.find(c => c.toLowerCase() === lower);
  if (exact) return exact;

  return trimmed; // Retorna el valor si no está en catálogo para validación
}

// Regex estándar RFC 5322 simplificado para email
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Lista de dominios institucionales prohibidos como pares externos
const SELF_NOMINATION_DOMAINS = ['itcr.ac.cr', 'tec.ac.cr'];
const SELF_NOMINATION_KEYWORDS = ['tecnologico de costa rica', 'instituto tecnologico de costa rica', 'tec costa rica', 'itcr'];

/**
 * Valida un contacto de manera individual y devuelve { isValid, errors, warnings, sanitized }
 */
function validateContact(data, tipo) {
  const errors = {};
  const warnings = {};
  const sanitized = {};

  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      Object.values(data).some(value => value !== null && value !== undefined && !['string', 'number', 'boolean'].includes(typeof value))) {
    return { isValid: false, errors: { datos: 'Los campos deben contener valores simples.' }, warnings, sanitized };
  }
  const contactType = String(tipo || data.tipo_contacto || '').toUpperCase();
  if (!['ACADEMICO', 'EMPLEADOR'].includes(contactType)) {
    errors.tipo_contacto = 'El tipo de contacto debe ser "Académico" o "Empleador".';
    return { isValid: false, errors, warnings, sanitized };
  }
  sanitized.tipo_contacto = contactType;

  // 1. Source (Pre-fijado institucional)
  sanitized.source = 'Instituto Tecnológico de Costa Rica';

  // 2. Title / Tratamiento
  const title = normalizeText(data.title || data['Title'] || data['Tratamiento'] || data['Tratamiento / Título']);
  if (!title) {
    errors.title = 'El tratamiento o título es obligatorio (ej. Dr, Prof, Miss, Mr).';
  } else if (title.length > 30) {
    errors.title = 'El tratamiento no debe superar 30 caracteres.';
  } else {
    sanitized.title = title;
  }

  // 3. First Name
  const firstName = normalizeText(data.first_name || data['First Name'] || data['Nombre']);
  if (!firstName) {
    errors.first_name = 'El nombre es obligatorio.';
  } else if (firstName.length < 2) {
    errors.first_name = 'El nombre debe tener al menos 2 caracteres.';
  } else if (firstName.length > 80) {
    errors.first_name = 'El nombre no debe exceder 80 caracteres.';
  } else if (/[<>{}[\]\\\/=^$*+?|]/.test(firstName)) {
    errors.first_name = 'El nombre contiene caracteres especiales inválidos.';
  } else {
    sanitized.first_name = firstName;
  }

  // 4. Last Name
  const lastName = normalizeText(data.last_name || data['Last Name'] || data['Apellido']);
  if (!lastName) {
    errors.last_name = 'El apellido es obligatorio.';
  } else if (lastName.length < 2) {
    errors.last_name = 'El apellido debe tener al menos 2 caracteres.';
  } else if (lastName.length > 80) {
    errors.last_name = 'El apellido no debe exceder 80 caracteres.';
  } else if (/[<>{}[\]\\\/=^$*+?|]/.test(lastName)) {
    errors.last_name = 'El apellido contiene caracteres especiales inválidos.';
  } else {
    sanitized.last_name = lastName;
  }

  // 5. Email
  const rawEmail = (data.email || data['Email'] || data['Correo electrónico'] || '').toString();
  if (rawEmail !== rawEmail.trim()) {
    warnings.email = 'El correo electrónico contenía espacios al inicio o final que fueron limpiados automáticamente.';
  }
  const cleanEmail = normalizeEmail(rawEmail);
  if (!cleanEmail) {
    errors.email = 'El correo electrónico es obligatorio.';
  } else if (!EMAIL_REGEX.test(cleanEmail)) {
    errors.email = 'El formato del correo electrónico es inválido (ejemplo: usuario@institucion.com).';
  } else if (cleanEmail.length > 120) {
    errors.email = 'El correo electrónico no debe exceder 120 caracteres.';
  } else {
    // Restricción institucional y QS: prohibir correos del propio TEC
    const domain = (cleanEmail.split('@')[1] || '').toLowerCase();
    if (SELF_NOMINATION_DOMAINS.includes(domain) || cleanEmail.endsWith('@itcr.ac.cr') || cleanEmail.endsWith('@tec.ac.cr')) {
      errors.email = 'Restricción institucional y QS: No se permiten correos del dominio institucional del TEC (@itcr.ac.cr / @tec.ac.cr). Los contactos para el Ranking QS deben ser externos a la institución.';
    } else {
      sanitized.email = cleanEmail;
      sanitized.email_normalized = cleanEmail;
    }
  }

  // 6. Country or Territory
  const rawCountry = normalizeText(data.country || data.country_name || data['Country or Territory'] || data['País o territorio'] || data['País']);
  if (!rawCountry) {
    errors.country = 'El país o territorio es obligatorio.';
  } else {
    const resolvedCountry = resolveCountry(rawCountry);
    if (!resolvedCountry) {
      errors.country = 'Debe seleccionar un país o territorio válido.';
    } else {
      sanitized.country_name = resolvedCountry;
      if (resolvedCountry !== rawCountry) {
        warnings.country = `El país "${rawCountry}" fue normalizado a "${resolvedCountry}".`;
      }
    }
  }

  // 7. Phone (Opcional)
  const phone = normalizeText(data.phone || data['Phone (Optional)'] || data['Teléfono (opcional)'] || data['Teléfono']);
  if (phone) {
    const digits = phone.replace(/[^0-9]/g, '');
    if (digits.length < 6 || digits.length > 18) {
      errors.phone = 'El teléfono debe contener entre 6 y 18 dígitos numéricos.';
    } else {
      sanitized.phone = phone;
    }
  } else {
    sanitized.phone = '';
  }

  // 8. Campos específicos para Académico
  if (contactType === 'ACADEMICO') {
    const jobTitle = normalizeText(data.job_title || data['Job Title'] || data['Puesto / Cargo'] || data['Puesto']);
    if (!jobTitle) {
      errors.job_title = 'El puesto o cargo académico es obligatorio (ej. Lecturer, Professor, Dean).';
    } else if (jobTitle.length > 120) {
      errors.job_title = 'El cargo no debe superar 120 caracteres.';
    } else {
      sanitized.job_title = jobTitle;
    }

    const dept = normalizeText(data.department || data.department_unit || data['Department'] || data['Departamento / Unidad'] || data['Departamento']);
    if (!dept) {
      errors.department = 'El departamento o unidad académica es obligatorio.';
    } else if (dept.length > 120) {
      errors.department = 'El departamento no debe superar 120 caracteres.';
    } else {
      sanitized.department_unit = dept;
    }

    const inst = normalizeText(data.institution || data['Institution'] || data['Institución']);
    if (!inst) {
      errors.institution = 'La institución universitaria o centro de investigación es obligatoria.';
    } else if (inst.length > 150) {
      errors.institution = 'La institución no debe superar 150 caracteres.';
    } else {
      const cleanInst = inst.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (SELF_NOMINATION_KEYWORDS.some(k => cleanInst.includes(k))) {
        warnings.institution = 'Nota institucional: Se recomienda indicar una universidad o centro externo para pares de reputación académica en QS.';
      }
      sanitized.institution = inst;
    }

    const subject = normalizeText(data.subject || data.subject_area || data['Subject'] || data['Área temática / Disciplina académica'] || data['Disciplina']);
    if (!subject) {
      errors.subject = 'La disciplina académica o área temática es obligatoria.';
    } else {
      sanitized.subject_area = subject;
    }
  }

  // 9. Campos específicos para Empleador
  if (contactType === 'EMPLEADOR') {
    const position = normalizeText(data.position || data['Position'] || data['Puesto / Cargo'] || data['Puesto']);
    if (!position) {
      errors.position = 'El cargo o posición en la empresa es obligatorio (ej. Manager, Director, HR Lead).';
    } else if (position.length > 120) {
      errors.position = 'La posición no debe superar 120 caracteres.';
    } else {
      sanitized.position = position;
    }

    const industry = normalizeText(data.industry || data['Industry'] || data['Industria / Sector'] || data['Industria']);
    if (!industry) {
      errors.industry = 'La industria o sector empresarial es obligatorio.';
    } else {
      sanitized.industry = industry;
    }

    const company = normalizeText(data.company_name || data['Company Name'] || data['Nombre de la empresa / institución'] || data['Empresa']);
    if (!company) {
      errors.company_name = 'El nombre de la empresa o institución empleadora es obligatorio.';
    } else if (company.length > 150) {
      errors.company_name = 'El nombre de la empresa no debe superar 150 caracteres.';
    } else {
      sanitized.company_name = company;
    }
  }

  // Contexto institucional (Sede y Departamento del TEC)
  sanitized.sede_id = data.sede_id || null;
  sanitized.departamento_id = data.departamento_id || null;

  for (const [field, value] of Object.entries(sanitized)) {
    if (typeof value === 'string' && value.length > 500) errors[field] = 'El campo no debe superar 500 caracteres.';
  }
  const isValid = Object.keys(errors).length === 0;
  return { isValid, errors, warnings, sanitized };
}

module.exports = {
  COUNTRIES,
  COUNTRY_SYNONYMS,
  TITLES,
  QS_SUBJECTS,
  QS_INDUSTRIES,
  normalizeText,
  normalizeEmail,
  resolveCountry,
  validateContact
};
