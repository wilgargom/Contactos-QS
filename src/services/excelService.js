const { createZip, readZip } = require('../utils/zip');

// Convertir índice numérico (0 = A, 1 = B, 26 = AA) a nombre de columna Excel
function colName(n) {
  let s = '';
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

// Convertir columna Excel ('A', 'B', 'AA') a índice 0-based
function colIndex(col) {
  let idx = 0;
  for (let i = 0; i < col.length; i++) {
    idx = idx * 26 + (col.charCodeAt(i) - 64);
  }
  return idx - 1;
}

// Escapar caracteres especiales para XML
function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Genera un archivo binario XLSX con OpenXML estándar y soporte para múltiples hojas
 */
function generateMultiSheetXlsx(sheets) {
  if (!sheets || sheets.length === 0) {
    sheets = [{ name: 'Datos', headers: [], rows: [] }];
  }

  const files = [];

  let contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`;

  let workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`;

  let sheetsTags = '';

  sheets.forEach((sheet, idx) => {
    const sheetNum = idx + 1;
    const safeSheetName = escapeXml(sheet.name || `Hoja${sheetNum}`);
    
    contentTypes += `\n  <Override PartName="/xl/worksheets/sheet${sheetNum}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
    workbookRels += `\n  <Relationship Id="rId${sheetNum}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheetNum}.xml"/>`;
    sheetsTags += `\n    <sheet name="${safeSheetName}" sheetId="${sheetNum}" r:id="rId${sheetNum}"/>`;

    const headers = sheet.headers || [];
    const rows = sheet.rows || [];
    let rowsXml = '';

    if (headers.length > 0) {
      rowsXml += '<row r="1" customHeight="1" ht="26">';
      headers.forEach((h, colIdx) => {
        const cellRef = `${colName(colIdx)}1`;
        rowsXml += `<c r="${cellRef}" t="inlineStr" s="1"><is><t>${escapeXml(h)}</t></is></c>`;
      });
      rowsXml += '</row>';
    }

    rows.forEach((row, rowIdx) => {
      const rNum = rowIdx + (headers.length > 0 ? 2 : 1);
      rowsXml += `<row r="${rNum}">`;
      const numCols = Math.max(headers.length, Array.isArray(row) ? row.length : 0);
      for (let colIdx = 0; colIdx < numCols; colIdx++) {
        const cellRef = `${colName(colIdx)}${rNum}`;
        let val = '';
        if (Array.isArray(row)) {
          val = row[colIdx] ?? '';
        } else if (typeof row === 'object' && row !== null) {
          const h = headers[colIdx];
          val = h ? (row[h] ?? row[colIdx] ?? '') : (row[colIdx] ?? '');
        } else {
          val = colIdx === 0 ? row : '';
        }
        rowsXml += `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(val)}</t></is></c>`;
      }
      rowsXml += '</row>';
    });

    const colWidths = sheet.colWidths || [];
    const colWidthsXml = (headers.length > 0 ? headers : (rows[0] || [])).map((_, i) => {
      const w = colWidths[i] || 25;
      return `<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`;
    }).join('');

    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${colWidthsXml}</cols>
  <sheetData>${rowsXml}</sheetData>
</worksheet>`;

    files.push({ name: `xl/worksheets/sheet${sheetNum}.xml`, data: sheetXml });
  });

  contentTypes += '\n</Types>';

  const stylesRelId = sheets.length + 1;
  workbookRels += `\n  <Relationship Id="rId${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetsTags}
  </sheets>
</workbook>`;

  const appRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><name val="Calibri"/><sz val="11"/></font>
    <font><b/><color rgb="FFFFFFFF"/><name val="Calibri"/><sz val="11"/></font>
    <font><b/><color rgb="FF002855"/><name val="Calibri"/><sz val="11"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF002855"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/></border>
  </borders>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" alignment="center"/>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
</styleSheet>`;

  files.push(
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: appRels },
    { name: 'xl/workbook.xml', data: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    { name: 'xl/styles.xml', data: stylesXml }
  );

  return createZip(files);
}

/**
 * Genera un archivo binario XLSX con OpenXML estándar y hoja estilizada
 */
function generateXlsx(sheetName, headers, rows) {
  return generateMultiSheetXlsx([{ name: sheetName, headers, rows }]);
}

/**
 * Parsea un archivo XLSX desde un Buffer
 */
// Leer las hojas por sus relaciones reales, sin asumir su orden o nombre de archivo.
function parseXlsxSheets(buffer) {
  const files = readZip(buffer);
  const workbook = files.get('xl/workbook.xml')?.toString('utf8') || '';
  const relationships = files.get('xl/_rels/workbook.xml.rels')?.toString('utf8') || '';
  const attr = (xml, name) => unescapeXml(new RegExp(`\\b${name}="([^"]*)"`).exec(xml)?.[1] || '');
  const targets = new Map();
  for (const match of relationships.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    if (!attr(match[0], 'Type').endsWith('/worksheet')) continue;
    const target = attr(match[0], 'Target');
    const resolved = require('node:path').posix.normalize(target.startsWith('/') ? target.slice(1) : `xl/${target}`);
    if (!resolved.startsWith('xl/worksheets/')) throw new Error('Relación de hoja inválida.');
    targets.set(attr(match[0], 'Id'), resolved);
  }
  const sheets = [];
  for (const match of workbook.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const target = targets.get(attr(match[0], 'r:id'));
    if (target) sheets.push({ name: attr(match[0], 'name'), ...parseXlsx(buffer, target) });
  }
  if (!sheets.length) throw new Error('No se encontraron hojas de datos en el libro.');
  return sheets;
}

function parseXlsx(buffer, sheetPath = null) {
  const files = readZip(buffer);

  // 1. Extraer Shared Strings si existen
  const sharedStrings = [];
  if (files.has('xl/sharedStrings.xml')) {
    const ssXml = files.get('xl/sharedStrings.xml').toString('utf8');
    const siRegex = /<si>([\s\S]*?)<\/si>/g;
    let match;
    while ((match = siRegex.exec(ssXml)) !== null) {
      const siContent = match[1];
      const tRegex = /<t(?: [^>]*)?>([^<]*)<\/t>/g;
      let tMatch;
      let str = '';
      while ((tMatch = tRegex.exec(siContent)) !== null) {
        str += tMatch[1];
      }
      str = unescapeXml(str);
      sharedStrings.push(str);
    }
  }

  // 2. Extraer hoja de cálculo de datos (preferir sheet1.xml donde se ubican los registros)
  let sheetXmlStr = null;
  if (sheetPath && files.has(sheetPath)) {
    sheetXmlStr = files.get(sheetPath).toString('utf8');
  } else if (sheetPath) {
    throw new Error('No se encontró la hoja indicada en el libro.');
  } else if (files.has('xl/worksheets/sheet1.xml')) {
    sheetXmlStr = files.get('xl/worksheets/sheet1.xml').toString('utf8');
  } else {
    for (const [name, buf] of files.entries()) {
      if (name.startsWith('xl/worksheets/sheet') && name.endsWith('.xml')) {
        sheetXmlStr = buf.toString('utf8');
        break;
      }
    }
  }

  if (!sheetXmlStr) {
    throw new Error('No se encontró ninguna hoja de cálculo en el archivo Excel.');
  }

  // 3. Parsear filas y celdas
  const rowsMap = new Map(); // rowIndex (1-based) -> Array of values
  const rowRegex = /<row\s+r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(sheetXmlStr)) !== null) {
    const rNum = parseInt(rowMatch[1], 10);
    const rowContent = rowMatch[2];
    const rowCells = [];

    // Capturar celdas y sus atributos (r, t, etc.)
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const attrsStr = cellMatch[1];
      const cellBody = cellMatch[2];

      const rMatch = /\br="([A-Z]+)(\d+)"/i.exec(attrsStr);
      if (!rMatch) continue;
      const colStr = rMatch[1].toUpperCase();
      const colIdx = colIndex(colStr);

      const tMatch = /\bt="([a-zA-Z]+)"/i.exec(attrsStr);
      const cType = tMatch ? tMatch[1].toLowerCase() : 'n';

      let val = '';
      if (cType === 's') {
        const vMatch = /<v>(\d+)<\/v>/i.exec(cellBody);
        if (vMatch) {
          const sIdx = parseInt(vMatch[1], 10);
          val = sharedStrings[sIdx] || '';
        }
      } else if (cType === 'inlinestr') {
        const isMatch = /<is>[\s\S]*?<t(?: [^>]*)?>([\s\S]*?)<\/t>[\s\S]*?<\/is>/i.exec(cellBody);
        if (isMatch) {
          val = unescapeXml(isMatch[1]);
        }
      } else {
        const vMatch = /<v>([\s\S]*?)<\/v>/i.exec(cellBody);
        if (vMatch) {
          val = unescapeXml(vMatch[1]);
        }
      }

      rowCells[colIdx] = val ? val.trim() : '';
    }

    rowsMap.set(rNum, rowCells);
  }

  const sortedRowNums = Array.from(rowsMap.keys()).sort((a, b) => a - b);
  if (sortedRowNums.length === 0) {
    return { headers: [], rows: [], rawRows: [] };
  }

  // Fila 1 son los encabezados
  const headerRowCells = rowsMap.get(sortedRowNums[0]) || [];
  const headers = headerRowCells.map(h => (h ? String(h).trim() : ''));

  const dataRows = [];
  const rawRows = [];

  for (let i = 1; i < sortedRowNums.length; i++) {
    const rNum = sortedRowNums[i];
    const cells = rowsMap.get(rNum) || [];
    
    // Si la fila está totalmente vacía, la omitimos del procesamiento principal pero mantenemos referencia
    const hasData = cells.some(c => c && c.length > 0);
    if (!hasData) continue;

    const rowObj = { _rowNum: rNum };
    headers.forEach((h, idx) => {
      if (h) {
        rowObj[h] = (cells[idx] !== undefined) ? String(cells[idx]).trim() : '';
      }
    });

    dataRows.push(rowObj);
    rawRows.push({ rowNum: rNum, cells });
  }

  return { headers, rows: dataRows, rawRows };
}

function unescapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Parsea un CSV en texto o buffer
 */
function parseCsv(content) {
  const text = Buffer.isBuffer(content) ? content.toString('utf8') : String(content);
  // Eliminar BOM si existe
  const cleanText = text.replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r?\n/).filter(line => line.trim().length > 0);
  
  if (lines.length === 0) {
    return { headers: [], rows: [], rawRows: [] };
  }

  // Detectar delimitador (coma o punto y coma)
  const firstLine = lines[0];
  const delim = (firstLine.includes(';') && !firstLine.includes(',')) ? ';' : ',';

  function parseCsvLine(line) {
    const entries = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === delim && !inQuotes) {
        entries.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    entries.push(cur.trim());
    return entries;
  }

  const headers = parseCsvLine(lines[0]);
  const rows = [];
  const rawRows = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const rNum = i + 1;
    const rowObj = { _rowNum: rNum };
    headers.forEach((h, idx) => {
      rowObj[h] = cells[idx] || '';
    });
    rows.push(rowObj);
    rawRows.push({ rowNum: rNum, cells });
  }

  return { headers, rows, rawRows };
}

// Plantillas oficiales requeridas por QS
const TEMPLATES = {
  ACADEMICO: {
    sheetName: 'Academic Contacts',
    headers: [
      'Source',
      'Title',
      'First Name',
      'Last Name',
      'Job Title',
      'Department',
      'Institution',
      'Country or Territory',
      'Email',
      'Subject',
      'Phone (Optional)'
    ],
    sample: [
      [
        'Instituto Tecnológico de Costa Rica',
        'Miss',
        'Caden',
        'Puah',
        'Lecturer',
        'Medicine',
        'XYZ University',
        'Malaysia',
        'caden@xyz-unistaff.com',
        'Pharmacology',
        '60139999999'
      ]
    ]
  },
  EMPLEADOR: {
    sheetName: 'Employer Contacts',
    headers: [
      'Source',
      'Title',
      'First Name',
      'Last Name',
      'Position',
      'Industry',
      'Company Name',
      'Country or Territory',
      'Email',
      'Phone (Optional)'
    ],
    sample: [
      [
        'Instituto Tecnológico de Costa Rica',
        'Miss',
        'Caden',
        'Puah',
        'Manager',
        'Engineering',
        'XYZ Limited',
        'Malaysia',
        'caden.p@xyz-limited.com',
        '60139999999'
      ]
    ]
  },
  FUNCIONARIOS: {
    sheetName: 'Funcionarios TEC',
    headers: [
      'Nombre de funcionario',
      'Correo electrónico',
      'Dependencia',
      'Sede'
    ],
    sample: [
      [
        'Dr. Carlos Brenes Solano',
        'cbrenes@itcr.ac.cr',
        'Escuela de Ingeniería en Computación',
        'Campus Central Cartago'
      ],
      [
        'Dra. Patricia Solís Gómez',
        'psolis@itcr.ac.cr',
        'Escuela de Ingeniería Electrónica',
        'Campus Central Cartago'
      ],
      [
        'Licda. Elena Vargas Castro',
        'evargas@itcr.ac.cr',
        'Escuela de Administración de Empresas',
        'Campus Tecnológico Local San José'
      ]
    ]
  }
};

function generateOfficialTemplate(tipo) {
  const t = (tipo || 'ACADEMICO').toUpperCase();

  if (t === 'ACADEMICO') {
    const dataSheet = {
      name: 'Academic Contacts',
      headers: [
        'Source',
        'Title',
        'First Name',
        'Last Name',
        'Job Title',
        'Department',
        'Institution',
        'Country or Territory',
        'Email',
        'Subject',
        'Phone (Optional)'
      ],
      rows: [
        [
          'Instituto Tecnológico de Costa Rica',
          'Dr.',
          'Carlos',
          'Gómez Morera',
          'Catedrático de Computación',
          'Departamento de Informática',
          'Universidad de Salamanca',
          'España',
          'cgomez@usal.es',
          'Ingeniería y Tecnología',
          '+34 923 294 500'
        ],
        [
          'Instituto Tecnológico de Costa Rica',
          'Dra.',
          'Elena',
          'Vázquez Ramos',
          'Directora de Investigaciones',
          'Facultad de Medicina',
          'Johns Hopkins University',
          'Estados Unidos',
          'evazquez@jhu.edu',
          'Ciencias de la Vida y Medicina',
          '+1 410 555 0199'
        ]
      ],
      colWidths: [26, 12, 18, 20, 26, 26, 28, 22, 28, 26, 20]
    };

    const rulesSheet = {
      name: 'Reglas e Instrucciones',
      headers: [
        'Nº',
        'Columna / Requisito',
        'Obligatoriedad',
        'Reglas Mínimas para Evitar Errores de Carga',
        'Ejemplos Correctos Aceptados',
        'Errores Frecuentes Rechazados'
      ],
      rows: [
        ['1', 'Source', 'Opcional / Automático', 'Institución que reporta. Se preconfigura "Instituto Tecnológico de Costa Rica".', 'Instituto Tecnológico de Costa Rica', 'Dejar en blanco está permitido.'],
        ['2', 'Email', 'OBLIGATORIO (Crítico QS)', 'Correo institucional del académico externo. REGLA ESTRICTA QS: NO se permiten correos @itcr.ac.cr ni @tec.ac.cr. Debe ser un académico externo al TEC.', 'cgomez@usal.es, evazquez@jhu.edu', 'Ingresar correos @itcr.ac.cr o @tec.ac.cr (rechazo automático).'],
        ['3', 'Title (Tratamiento)', 'OBLIGATORIO', 'Tratamiento académico o de cortesía oficial. Valores admitidos: Dr., Dra., Prof., Profra., Ing., Lic., Licda., MSc., PhD, Mr., Mrs., Ms., Miss.', 'Dr., Dra., Prof., MSc.', 'Tratamientos inventados o celda vacía.'],
        ['4', 'First Name (Nombre)', 'OBLIGATORIO', 'Nombre de pila del contacto (mínimo 2 letras, sin números ni símbolos extraños).', 'Carlos, Elena, Roberto', 'Iniciales solas (ej. "C.") o nombres con números.'],
        ['5', 'Last Name (Apellido)', 'OBLIGATORIO', 'Apellido(s) del contacto (mínimo 2 letras).', 'Gómez Morera, Vázquez', 'Dejar en blanco.'],
        ['6', 'Job Title (Cargo)', 'OBLIGATORIO', 'Cargo académico en su institución (ej. Catedrático, Decano, Investigador).', 'Catedrático de Computación, Decana', 'Dejar en blanco.'],
        ['7', 'Institution (Institución)', 'OBLIGATORIO', 'Nombre de la universidad o centro externo de educación superior.', 'Universidad de Salamanca, MIT, UCR', 'Colocar "TEC" o "Instituto Tecnológico de Costa Rica".'],
        ['8', 'Department (Departamento)', 'OBLIGATORIO', 'Escuela, facultad o unidad académica del contacto.', 'Departamento de Informática, Facultad de Ciencias', 'Dejar en blanco.'],
        ['9', 'Country or Territory (País)', 'OBLIGATORIO', 'País donde radica la institución externa según catálogo oficial.', 'Costa Rica, España, Estados Unidos, México, Colombia', 'Abreviaturas no estándar como "CR" o "USA".'],
        ['10', 'Subject (Área Temática)', 'OBLIGATORIO', 'Una de las 5 áreas QS: Arte y Humanidades, Ingeniería y Tecnología, Ciencias de la Vida y Medicina, Ciencias Naturales, Ciencias Sociales y Administración.', 'Ingeniería y Tecnología', 'Textos libres sin relación con las áreas evaluadas por QS.'],
        ['11', 'Phone (Teléfono)', 'OPCIONAL', 'Número telefónico internacional numérico con código de país.', '+34 923 294 500, +506 2222 3333', 'Texto como "no tiene", "N/A" o letras.'],
        ['12', 'Prevención de Duplicados', 'REGLA GENERAL', 'No duplicar correos electrónicos dentro del mismo archivo ni con contactos ya registrados en el sistema.', 'Un solo registro por correo', 'Filas repetidas con el mismo correo electrónico.'],
        ['13', 'Estructura de la Plantilla', 'REGLA GENERAL', 'No modificar los nombres de los encabezados de la Fila 1 ni insertar filas en blanco antes de los datos.', 'Comenzar a llenar datos en Fila 2', 'Cambiar el nombre de las columnas o borrar la Fila 1.']
      ],
      colWidths: [6, 22, 22, 45, 32, 38]
    };

    return generateMultiSheetXlsx([dataSheet, rulesSheet]);
  }

  if (t === 'EMPLEADOR') {
    const dataSheet = {
      name: 'Employer Contacts',
      headers: [
        'Source',
        'Title',
        'First Name',
        'Last Name',
        'Position',
        'Industry',
        'Company Name',
        'Country or Territory',
        'Email',
        'Phone (Optional)'
      ],
      rows: [
        [
          'Instituto Tecnológico de Costa Rica',
          'Licda.',
          'Marcela',
          'Montero Salas',
          'Directora de Talento Humano',
          'Tecnología de Información',
          'Intel Corporation',
          'Costa Rica',
          'marcela.montero@intel.com',
          '+506 2298 6000'
        ],
        [
          'Instituto Tecnológico de Costa Rica',
          'Ing.',
          'Roberto',
          'Navarro Mora',
          'Gerente de Operaciones de Planta',
          'Dispositivos Médicos',
          'Boston Scientific',
          'Costa Rica',
          'rnavarro@bsci.com',
          '+506 2437 2000'
        ]
      ],
      colWidths: [26, 12, 18, 20, 26, 26, 28, 22, 28, 20]
    };

    const rulesSheet = {
      name: 'Reglas e Instrucciones',
      headers: [
        'Nº',
        'Columna / Requisito',
        'Obligatoriedad',
        'Reglas Mínimas para Evitar Errores de Carga',
        'Ejemplos Correctos Aceptados',
        'Errores Frecuentes Rechazados'
      ],
      rows: [
        ['1', 'Source', 'Opcional / Automático', 'Institución que reporta. Se preconfigura "Instituto Tecnológico de Costa Rica".', 'Instituto Tecnológico de Costa Rica', 'Dejar en blanco está permitido.'],
        ['2', 'Email', 'OBLIGATORIO (Crítico QS)', 'Correo corporativo del empleador externo. REGLA ESTRICTA QS: NO se admiten correos @itcr.ac.cr ni @tec.ac.cr. Debe ser un empleador externo.', 'marcela.montero@intel.com, rnavarro@bsci.com', 'Ingresar correos institucionales del TEC (@itcr.ac.cr).'],
        ['3', 'Title (Tratamiento)', 'OBLIGATORIO', 'Tratamiento de cortesía o profesional: Dr., Dra., Ing., Lic., Licda., Mr., Mrs., Ms., Miss.', 'Licda., Ing., Mr., Ms.', 'Dejar en blanco.'],
        ['4', 'First Name (Nombre)', 'OBLIGATORIO', 'Nombre de pila del contacto empleador (mínimo 2 letras).', 'Marcela, Roberto', 'Iniciales solas o nombres incompletos.'],
        ['5', 'Last Name (Apellido)', 'OBLIGATORIO', 'Apellido o apellidos del contacto empleador.', 'Montero Salas, Navarro Mora', 'Dejar en blanco.'],
        ['6', 'Position (Cargo)', 'OBLIGATORIO', 'Cargo de liderazgo, contratación o gerencia en la empresa.', 'Directora de Talento Humano, Gerente de Planta, CEO', 'Dejar en blanco.'],
        ['7', 'Industry (Industria/Sector)', 'OBLIGATORIO', 'Sector económico de la empresa empleadora.', 'Tecnología de Información, Dispositivos Médicos, Banca', 'Dejar en blanco.'],
        ['8', 'Company Name (Empresa)', 'OBLIGATORIO', 'Nombre comercial o legal de la empresa empleadora.', 'Intel Corporation, Boston Scientific, BAC Credomatic', 'Colocar "Instituto Tecnológico de Costa Rica" como empresa.'],
        ['9', 'Country or Territory (País)', 'OBLIGATORIO', 'País de operación de la empresa según catálogo oficial.', 'Costa Rica, Estados Unidos, Panamá, México', 'Abreviaciones no oficiales.'],
        ['10', 'Phone (Teléfono)', 'OPCIONAL', 'Teléfono numérico internacional de la empresa.', '+506 2298 6000', 'Textos no numéricos.'],
        ['11', 'Prevención de Duplicados', 'REGLA GENERAL', 'No duplicar correos dentro del lote ni con registros ya existentes en el Directorio.', 'Un solo registro por correo', 'Correos repetidos en el archivo.'],
        ['12', 'Estructura de la Plantilla', 'REGLA GENERAL', 'No alterar los encabezados en la Fila 1 ni dejar filas vacías intermedias.', 'Comenzar datos en Fila 2', 'Modificar nombres de columnas.']
      ],
      colWidths: [6, 22, 22, 45, 32, 38]
    };

    return generateMultiSheetXlsx([dataSheet, rulesSheet]);
  }

  // FUNCIONARIOS
  const dataSheet = {
    name: 'Funcionarios TEC',
    headers: [
      'Nombre de funcionario',
      'Correo electrónico',
      'Dependencia',
      'Sede'
    ],
    rows: [
      ['Dr. Carlos Brenes Solano', 'cbrenes@itcr.ac.cr', 'Escuela de Ingeniería en Computación', 'Campus Central Cartago'],
      ['Dra. Patricia Solís Gómez', 'psolis@itcr.ac.cr', 'Escuela de Ingeniería Electrónica', 'Campus Central Cartago'],
      ['Licda. Elena Vargas Castro', 'evargas@itcr.ac.cr', 'Escuela de Administración de Empresas', 'Campus Tecnológico Local San José']
    ],
    colWidths: [28, 26, 32, 28]
  };

  const rulesSheet = {
    name: 'Reglas e Instrucciones',
    headers: [
      'Nº',
      'Columna / Requisito',
      'Obligatoriedad',
      'Reglas Mínimas para Evitar Errores de Carga',
      'Ejemplos Correctos Aceptados',
      'Errores Frecuentes Rechazados'
    ],
    rows: [
      ['1', 'Nombre de funcionario', 'OBLIGATORIO', 'Nombre completo con título del funcionario/a del TEC (mínimo 3 caracteres).', 'Dr. Carlos Brenes Solano', 'Dejar en blanco o iniciales sueltas.'],
      ['2', 'Correo electrónico', 'OBLIGATORIO (Regla TEC)', 'Correo institucional del TEC. REGLA ESTRICTA: DEBE terminar exclusivamente en @itcr.ac.cr o @tec.ac.cr.', 'cbrenes@itcr.ac.cr, psolis@itcr.ac.cr', 'Ingresar correos personales como @gmail.com, @hotmail.com o correos externos.'],
      ['3', 'Dependencia', 'OBLIGATORIO', 'Escuela, departamento, vicerrectoría o unidad administrativa del TEC.', 'Escuela de Ingeniería en Computación, Escuela de Electrónica', 'Dejar en blanco.'],
      ['4', 'Sede', 'OBLIGATORIO', 'Sede o campus institucional del TEC según catálogo oficial: Campus Central Cartago, Campus Tecnológico Local San José, Campus Tecnológico Local San Carlos, Centro Académico de Alajuela, Centro Académico de Limón.', 'Campus Central Cartago, Campus Tecnológico Local San José', 'Nombres de sedes inventados o vacíos.'],
      ['5', 'Sin Duplicados', 'REGLA GENERAL', 'Un único registro por funcionario/correo institucional en el archivo.', 'Un solo registro por correo', 'Repetir correos electrónicos en el archivo.'],
      ['6', 'Estructura de la Plantilla', 'REGLA GENERAL', 'Conservar los encabezados en la Fila 1 y completar los datos desde la Fila 2.', 'Llenar datos desde Fila 2', 'Cambiar nombres de columnas.']
    ],
    colWidths: [6, 22, 22, 45, 32, 38]
  };

  return generateMultiSheetXlsx([dataSheet, rulesSheet]);
}

module.exports = {
  generateXlsx,
  generateMultiSheetXlsx,
  generateOfficialTemplate,
  parseXlsx,
  parseXlsxSheets,
  parseCsv,
  TEMPLATES
};
