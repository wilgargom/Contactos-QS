const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getDb, runTransaction } = require('../database/db');
const contactService = require('../services/contactService');
const { checkDuplicate } = require('../services/duplicateDetector');
const { parseXlsx, parseCsv, generateXlsx, generateOfficialTemplate, TEMPLATES } = require('../services/excelService');
const { exportContactsToXlsx } = require('../services/exportService');
const driveService = require('../services/driveService');
const {
  COUNTRIES,
  TITLES,
  QS_SUBJECTS,
  QS_INDUSTRIES,
  validateContact,
  normalizeEmail
} = require('../utils/validator');
const config = require('../config');

// Middleware de autenticación y resolución de usuario
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const queryToken = (req.query && req.query.token) ? req.query.token : undefined;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : queryToken;
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'Autenticación requerida.' });
  }

  const user = require('../services/authService').getSessionUser(token);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Sesión expirada o inválida.' });
  }

  req.user = user;
  next();
}

// Middleware para verificar rol Administrador
function requireAdmin(req, res, next) {
  if (!req.user || req.user.rol !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Acceso denegado: Se requiere rol de Administrador.' });
  }
  next();
}

// Enrutador de API modular
function handleApi(req, res, pathname, query, body, user) {
  const method = req.method;

  // 1. Catálogos generales del sistema
  if (pathname === '/api/catalogs' && method === 'GET') {
    const db = getDb();
    const sedes = db.prepare('SELECT id, codigo, nombre FROM sedes WHERE activo = 1 ORDER BY nombre').all();
    const departamentos = db.prepare('SELECT id, codigo, nombre, sede_id FROM departamentos WHERE activo = 1 ORDER BY nombre').all();

    return res.json({
      success: true,
      sedes,
      departamentos,
      paises: COUNTRIES,
      titulos: TITLES,
      areas_qs: QS_SUBJECTS,
      industrias_qs: QS_INDUSTRIES,
      source_default: config.SOURCE_NAME
    });
  }

  // 2. Estadísticas para Dashboard
  if (pathname === '/api/stats' && method === 'GET') {
    return res.json({ success: true, stats: contactService.getStatistics() });
  }

  // 3. Listado de contactos con filtros
  if (pathname === '/api/contacts' && method === 'GET') {
    const contacts = contactService.listContacts(query, user);
    return res.json({ success: true, count: contacts.length, contacts });
  }

  // 3.1 Verificación inmediata de existencia de correo electrónico (Requisito de verificación temprana)
  if (pathname === '/api/contacts/check-email' && method === 'GET') {
    const rawEmail = (query.email || '').trim().toLowerCase();
    if (!rawEmail) {
      return res.json({ success: true, exists: false, isTecDomain: false });
    }

    const isTecDomain = rawEmail.endsWith('@itcr.ac.cr') || rawEmail.endsWith('@tec.ac.cr');
    if (isTecDomain) {
      return res.json({
        success: true,
        exists: false,
        isTecDomain: true,
        message: 'Restricción institucional y QS: No se permiten correos del dominio institucional del TEC (@itcr.ac.cr / @tec.ac.cr). Los contactos para el Ranking QS deben ser externos a la institución.'
      });
    }

    const db = getDb();
    const existing = db.prepare(`
      SELECT id, first_name, last_name, email, institution, company_name, tipo_contacto, created_by_name, created_at
      FROM contactos
      WHERE email_normalized = ?
      LIMIT 1
    `).get(rawEmail);

    return res.json({
      success: true,
      exists: !!existing,
      isTecDomain: false,
      contact: existing || null
    });
  }

  // 3.2 Búsqueda y autocompletado de funcionarios del TEC
  if (pathname === '/api/funcionarios/by-email' && method === 'GET') {
    const email = (query.email || '').trim().toLowerCase();
    const funcService = require('../services/funcionarioService');
    const funcionario = funcService.getFuncionarioByEmail(email);
    return res.json({ success: true, exists: !!funcionario, funcionario });
  }

  if ((pathname === '/api/funcionarios' || pathname === '/api/funcionarios/search') && method === 'GET') {
    const funcService = require('../services/funcionarioService');
    if (query.q) {
      return res.json({ success: true, funcionarios: funcService.searchFuncionarios(query.q) });
    }
    return res.json({ success: true, funcionarios: funcService.listFuncionarios() });
  }

  if (pathname === '/api/funcionarios' && method === 'POST') {
    const funcService = require('../services/funcionarioService');
    try {
      const funcionario = funcService.upsertFuncionario(body);
      return res.json({ success: true, funcionario });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // 3.3 Exportación directa del Directorio de Contactos a Excel (.xlsx)
  if (pathname === '/api/contacts/export-directory' && method === 'GET') {
    const contacts = contactService.listContacts(query, user);
    const exportHeaders = [
      'Tipo',
      'Tratamiento',
      'Nombre',
      'Apellido',
      'Correo Electrónico',
      'País',
      'Institución / Empresa',
      'Puesto / Cargo',
      'Área Temática / Industria',
      'Teléfono',
      'Sede TEC',
      'Dependencia TEC',
      'Recomendado Por (Funcionario)',
      'Correo Funcionario TEC',
      'Estado',
      'Método de Ingreso',
      'Fecha de Registro'
    ];

    const exportRows = contacts.map(c => [
      c.tipo_contacto === 'ACADEMICO' ? 'Académico' : 'Empleador',
      c.title || '',
      c.first_name || '',
      c.last_name || '',
      c.email || '',
      c.country_name || '',
      c.institution || c.company_name || '',
      c.job_title || c.position || '',
      c.subject_area || c.industry || '',
      c.phone || '',
      c.sede_nombre || 'Sede no asignada',
      c.departamento_nombre || 'Depto no asignado',
      c.recomienda_nombre || c.created_by_name || 'Funcionario TEC',
      c.recomienda_email || '',
      c.estado,
      c.metodo_ingreso,
      c.created_at ? new Date(c.created_at).toLocaleString() : ''
    ]);

    const xlsxBuffer = generateXlsx('Directorio_Contactos', exportHeaders, exportRows);
    const filename = `Directorio_Contactos_TEC_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.end(xlsxBuffer);
  }

  // 4. Detalle individual de contacto
  if (pathname.startsWith('/api/contacts/') && method === 'GET' && !pathname.endsWith('/resolve-duplicate')) {
    const id = pathname.replace('/api/contacts/', '');
    const data = contactService.getContactById(id);
    if (!data) return res.status(404).json({ success: false, message: 'Contacto no encontrado' });
    return res.json({ success: true, ...data });
  }

  // 5. Creación individual de contacto
  if (pathname === '/api/contacts' && method === 'POST') {
    const allowOverride = body.allow_duplicate_override === true;
    const result = contactService.createContact(body, user, {
      allowDuplicateOverride: allowOverride,
      metodoIngreso: 'INDIVIDUAL'
    });

    if (!result.success) {
      const statusCode = result.duplicateStatus === 'EXACT_MATCH' ? 409 : (result.duplicateStatus === 'POTENTIAL_DUPLICATE' ? 409 : 400);
      return res.status(statusCode).json(result);
    }
    return res.status(201).json(result);
  }

  // 6. Actualización de contacto
  if (pathname.startsWith('/api/contacts/') && method === 'PUT') {
    const id = pathname.replace('/api/contacts/', '');
    const result = contactService.updateContact(id, body, user);
    if (!result.success) {
      return res.status(result.duplicateStatus === 'EXACT_MATCH' ? 409 : 400).json(result);
    }
    return res.json(result);
  }

  // 6.1 Eliminación de contacto reportado
  if (pathname.startsWith('/api/contacts/') && method === 'DELETE') {
    const id = pathname.replace('/api/contacts/', '');
    const result = contactService.deleteContact(id, user);
    if (!result.success) {
      const statusCode = result.error === 'Contacto no encontrado' ? 404 : 403;
      return res.status(statusCode).json(result);
    }
    return res.json(result);
  }


  // 7. Resolución de duplicados
  if (pathname.includes('/resolve-duplicate') && method === 'POST') {
    const id = pathname.split('/')[3];
    const { action, targetContactId } = body;
    const result = contactService.resolveDuplicate(id, action, targetContactId, user);
    return res.json(result);
  }

  // 8. Descarga de Plantillas Oficiales Excel
  if (pathname.startsWith('/api/templates/') && method === 'GET') {
    const tipo = pathname.replace('/api/templates/', '').toUpperCase();
    const template = TEMPLATES[tipo];
    if (!template) {
      return res.status(404).json({ success: false, message: 'Plantilla no encontrada. Tipos válidos: ACADEMICO, EMPLEADOR, FUNCIONARIOS' });
    }

    const xlsxBuffer = generateOfficialTemplate(tipo);
    const filename = tipo === 'FUNCIONARIOS' ? 'Plantilla_Padron_Funcionarios_TEC.xlsx' : `Plantilla_TEC_QS_${tipo}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.end(xlsxBuffer);
  }

  // 9. Carga Masiva - Análisis y Validación Previa (Administrador y Usuario)
  if (pathname === '/api/bulk/analyze' && method === 'POST') {
    if (user.rol !== 'ADMIN' && user.rol !== 'USUARIO') {
      return res.status(403).json({ success: false, message: 'La carga masiva requiere estar autenticado como Administrador o Usuario.' });
    }

    let fileBuffer;
    let fileName = body.fileName || 'archivo_carga.xlsx';
    const tipoContacto = (body.tipo_contacto || 'ACADEMICO').toUpperCase();

    if (tipoContacto === 'FUNCIONARIOS' && user.rol !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'La carga masiva del padrón de Funcionarios del TEC está reservada exclusivamente para Administradores.'
      });
    }

    if (body.fileBase64) {
      fileBuffer = Buffer.from(body.fileBase64, 'base64');
    } else {
      return res.status(400).json({ success: false, message: 'No se recibió el contenido del archivo en base64.' });
    }

    let parsed;
    try {
      if (fileName.toLowerCase().endsWith('.csv')) {
        parsed = parseCsv(fileBuffer);
      } else {
        parsed = parseXlsx(fileBuffer);
      }
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: `Error al leer el archivo Excel/CSV: ${err.message}`
      });
    }

    const expectedTemplate = TEMPLATES[tipoContacto];
    if (!expectedTemplate) {
      return res.status(400).json({ success: false, message: 'Tipo de contacto inválido.' });
    }

    // Verificar columnas mínimas requeridas
    const missingHeaders = expectedTemplate.headers.filter(h => {
      // Ignorar Source si viene omitido en la plantilla de subida
      if (h === 'Source' || h === 'Phone (Optional)') return false;
      return !parsed.headers.some(ph => {
        const phNorm = ph.toLowerCase().trim();
        const hNorm = h.toLowerCase().trim();
        return phNorm === hNorm ||
          (hNorm.includes('nombre') && phNorm.includes('nombre')) ||
          (hNorm.includes('correo') && (phNorm.includes('correo') || phNorm.includes('email'))) ||
          (hNorm.includes('dependencia') && (phNorm.includes('dependencia') || phNorm.includes('departamento') || phNorm.includes('escuela') || phNorm.includes('unidad'))) ||
          (hNorm.includes('sede') && (phNorm.includes('sede') || phNorm.includes('campus')));
      });
    });

    if (missingHeaders.length > 0) {
      return res.status(400).json({
        success: false,
        message: `El archivo no cumple con la estructura requerida para ${tipoContacto}. Columnas faltantes: ${missingHeaders.join(', ')}`,
        missingHeaders,
        expectedHeaders: expectedTemplate.headers,
        foundHeaders: parsed.headers
      });
    }

    // Analizar filas una a una
    const totalFilas = parsed.rows.length;
    if (totalFilas === 0) {
      return res.status(400).json({ success: false, message: 'El archivo Excel no contiene filas de datos.' });
    }

    // Si la carga corresponde al Padrón de Funcionarios del TEC
    if (tipoContacto === 'FUNCIONARIOS') {
      let correctos = 0;
      let conErrores = 0;
      let duplicadosExactos = 0;
      const errorDetails = [];
      const analyzedRows = [];
      const inBatchEmails = new Map();

      parsed.rows.forEach((row, idx) => {
        const rowNum = row._rowNum || idx + 2;
        const nombre = (row['Nombre de funcionario'] || row['Nombre'] || row['Funcionario'] || '').trim();
        const email = (row['Correo electrónico'] || row['Correo'] || row['Email'] || '').trim().toLowerCase();
        const dependencia = (row['Dependencia'] || row['Departamento'] || row['Escuela'] || row['Unidad'] || '').trim();
        const sede = (row['Sede'] || row['Campus'] || '').trim();

        let rowStatus = 'CORRECTO';
        const rowErrors = [];

        if (!nombre || nombre.length < 3) {
          rowStatus = 'ERROR';
          const msg = 'El nombre de funcionario debe tener al menos 3 caracteres.';
          rowErrors.push(msg);
          errorDetails.push({ row: rowNum, column: 'Nombre de funcionario', field: 'nombre', foundValue: nombre || '(vacío)', problem: msg, recommendation: 'Indique el nombre completo del funcionario.' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
          rowStatus = 'ERROR';
          const msg = 'Formato de correo inválido.';
          rowErrors.push(msg);
          errorDetails.push({ row: rowNum, column: 'Correo electrónico', field: 'email', foundValue: email || '(vacío)', problem: msg, recommendation: 'Corrija la dirección de correo electrónico.' });
        } else if (!email.endsWith('@itcr.ac.cr') && !email.endsWith('@tec.ac.cr')) {
          rowStatus = 'ERROR';
          const msg = 'El correo debe pertenecer al dominio del TEC (@itcr.ac.cr o @tec.ac.cr).';
          rowErrors.push(msg);
          errorDetails.push({ row: rowNum, column: 'Correo electrónico', field: 'email', foundValue: email, problem: msg, recommendation: 'Ingrese un correo institucional válido.' });
        }

        if (!dependencia || dependencia.length < 2) {
          rowStatus = 'ERROR';
          const msg = 'La dependencia o departamento es requerida (mínimo 2 caracteres).';
          rowErrors.push(msg);
          errorDetails.push({ row: rowNum, column: 'Dependencia', field: 'dependencia', foundValue: dependencia || '(vacío)', problem: msg, recommendation: 'Indique la unidad, escuela o departamento.' });
        }

        if (!sede || sede.length < 2) {
          rowStatus = 'ERROR';
          const msg = 'La sede es requerida (mínimo 2 caracteres).';
          rowErrors.push(msg);
          errorDetails.push({ row: rowNum, column: 'Sede', field: 'sede', foundValue: sede || '(vacío)', problem: msg, recommendation: 'Indique la sede o campus del TEC.' });
        }

        // Duplicados dentro del mismo lote
        if (inBatchEmails.has(email)) {
          rowStatus = 'DUPLICADO_EXACTO';
          duplicadosExactos++;
          const msg = `Correo duplicado dentro del mismo archivo (coincide con fila #${inBatchEmails.get(email)}).`;
          rowErrors.push(msg);
          errorDetails.push({ row: rowNum, column: 'Correo electrónico', field: 'email', foundValue: email, problem: msg, recommendation: 'Elimine las filas repetidas en el archivo antes de importar.' });
        } else if (email) {
          inBatchEmails.set(email, rowNum);
        }

        // Verificar si ya existe en la base de datos oficial de funcionarios
        if (rowStatus === 'CORRECTO' && email) {
          const db = getDb();
          const existingInDb = db.prepare('SELECT id, nombre, dependencia FROM funcionarios WHERE email_normalized = ?').get(email);
          if (existingInDb) {
            rowStatus = 'DUPLICADO_EXACTO';
            duplicadosExactos++;
            const msg = `El funcionario ya existe en el padrón institucional (${existingInDb.nombre} - ${existingInDb.dependencia}).`;
            rowErrors.push(msg);
            errorDetails.push({
              row: rowNum,
              column: 'Correo electrónico',
              field: 'email',
              foundValue: email,
              problem: msg,
              recommendation: 'Ya está registrado en el padrón institucional. Se omitirá al importar nuevos registros.'
            });
          }
        }

        if (rowStatus === 'CORRECTO') correctos++;
        if (rowStatus === 'ERROR') conErrores++;

        analyzedRows.push({
          rowNum,
          data: {
            nombre,
            email,
            dependencia,
            sede,
            'Nombre de funcionario': nombre,
            'Correo electrónico': email,
            'Dependencia': dependencia,
            'Sede': sede
          },
          status: rowStatus,
          errors: rowErrors
        });
      });

      return res.json({
        success: true,
        summary: {
          totalAnalizados: totalFilas,
          correctos,
          conErrores,
          posiblesDuplicados: 0,
          duplicadosExactos
        },
        errorDetails,
        analyzedRows
      });
    }

    let correctos = 0;
    let conErrores = 0;
    let posiblesDuplicados = 0;
    let duplicadosExactos = 0;

    const errorDetails = [];
    const analyzedRows = [];

    // Conjunto de correos dentro del mismo lote para detectar duplicados internos en el archivo
    const inBatchEmails = new Map();

    parsed.rows.forEach((row, idx) => {
      const rowNum = row._rowNum || idx + 2;
      const contactData = { ...row, tipo_contacto: tipoContacto };
      const validation = validateContact(contactData, tipoContacto);

      let rowStatus = 'CORRECTO';
      let rowErrors = [];

      // Validaciones sintácticas
      if (!validation.isValid) {
        rowStatus = 'ERROR';
        for (const [field, msg] of Object.entries(validation.errors)) {
          const colName = Object.keys(row).find(k => k.toLowerCase().includes(field.toLowerCase())) || field;
          errorDetails.push({
            row: rowNum,
            column: colName,
            field,
            foundValue: row[colName] || '(vacío)',
            problem: msg,
            recommendation: 'Corrija el valor en la celda o excluya la fila.'
          });
          rowErrors.push(msg);
        }
      }

      // Verificación de duplicado en lote actual
      const emailNorm = normalizeEmail(validation.sanitized?.email || row.Email || row['Correo electrónico']);
      if (emailNorm) {
        if (inBatchEmails.has(emailNorm)) {
          rowStatus = 'DUPLICADO_EXACTO';
          errorDetails.push({
            row: rowNum,
            column: 'Email',
            field: 'email',
            foundValue: emailNorm,
            problem: `Correo duplicado dentro del mismo archivo (coincide con la fila ${inBatchEmails.get(emailNorm)}).`,
            recommendation: 'Elimine las filas repetidas en el archivo antes de importar.'
          });
        } else {
          inBatchEmails.set(emailNorm, rowNum);
        }
      }

      // Verificación contra base de datos si no tiene error de formato
      let dupCheck = null;
      if (rowStatus === 'CORRECTO' && validation.sanitized) {
        dupCheck = checkDuplicate(validation.sanitized);
        if (dupCheck.status === 'EXACT_MATCH') {
          rowStatus = 'DUPLICADO_EXACTO';
          duplicadosExactos++;
          errorDetails.push({
            row: rowNum,
            column: 'Email/Nombre',
            field: 'duplicado',
            foundValue: validation.sanitized.email,
            problem: dupCheck.explanation,
            recommendation: 'Omitir la fila; el contacto ya existe en el sistema.'
          });
        } else if (dupCheck.status === 'POTENTIAL_DUPLICATE') {
          rowStatus = 'POSIBLE_DUPLICADO';
          posiblesDuplicados++;
          errorDetails.push({
            row: rowNum,
            column: 'Nombre/Organización',
            field: 'posible_duplicado',
            foundValue: `${validation.sanitized.first_name} ${validation.sanitized.last_name}`,
            problem: dupCheck.explanation,
            recommendation: 'Verificar si es la misma persona o un homónimo.'
          });
        }
      }

      if (rowStatus === 'CORRECTO') correctos++;
      if (rowStatus === 'ERROR') conErrores++;

      analyzedRows.push({
        rowNum,
        data: validation.sanitized || row,
        status: rowStatus,
        errors: rowErrors,
        duplicateInfo: dupCheck
      });
    });

    return res.json({
      success: true,
      summary: {
        totalAnalizados: totalFilas,
        correctos,
        conErrores,
        posiblesDuplicados,
        duplicadosExactos
      },
      errorDetails,
      analyzedRows
    });
  }

  // 10. Carga Masiva - Confirmación de Importación Atómica (Administrador y Usuario)
  if (pathname === '/api/bulk/import' && method === 'POST') {
    if (user.rol !== 'ADMIN' && user.rol !== 'USUARIO') {
      return res.status(403).json({ success: false, message: 'La importación requiere rol de Administrador o Usuario.' });
    }

    const { rowsToImport, fileName, tipo_contacto, fileBase64, recomienda_nombre, recomienda_email, sede_id, departamento_id } = body;
    if (!rowsToImport || !Array.isArray(rowsToImport) || rowsToImport.length === 0) {
      return res.status(400).json({ success: false, message: 'No se seleccionaron filas válidas para importar.' });
    }

    const loteId = crypto.randomUUID();
    const now = new Date().toISOString();

    if (tipo_contacto === 'FUNCIONARIOS') {
      if (user.rol !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'La importación masiva del padrón de Funcionarios del TEC está reservada exclusivamente para Administradores.'
        });
      }

      const funcionarioService = require('../services/funcionarioService');
      const importResult = funcionarioService.bulkImportFuncionarios(rowsToImport);

      // Guardar archivo original en staging Drive
      if (fileBase64) {
        driveService.saveDocumentArchive(fileName || 'padron_funcionarios.xlsx', Buffer.from(fileBase64, 'base64'), 'PADRON_FUNCIONARIOS')
          .catch(err => console.error('Error al archivar en Drive:', err));
      }

      return res.json({
        success: true,
        message: importResult.message,
        loteId,
        importedCount: importResult.total
      });
    }

    let importedCount = 0;

    const reporterName = (recomienda_nombre || user.nombre_completo || 'Funcionario TEC').trim();
    const reporterEmail = (recomienda_email || user.email || '').trim().toLowerCase();
    const defaultSede = sede_id || user.sede_id || null;
    const defaultDepto = departamento_id || user.departamento_id || null;

    const result = runTransaction((trx) => {
      // Registrar Lote
      trx.prepare(`
        INSERT INTO lotes_carga (
          id, nombre_archivo, tipo_contacto, total_filas, correctos, con_errores,
          posibles_duplicados, duplicados_exactos, cargado_por, cargado_por_email, created_at, detalles_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        loteId, fileName || 'carga_excel.xlsx', tipo_contacto, rowsToImport.length,
        rowsToImport.length, 0, 0, 0, reporterName, reporterEmail, now, JSON.stringify({ count: rowsToImport.length })
      );

      const stmtContact = trx.prepare(`
        INSERT INTO contactos (
          id, tipo_contacto, source, title, first_name, last_name, email, email_normalized, phone,
          country_name, sede_id, departamento_id, job_title, department_unit, institution, subject_area,
          position, industry, company_name, estado, metodo_ingreso, lote_id,
          recomienda_nombre, recomienda_email,
          created_by, created_by_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const row of rowsToImport) {
        const contactId = crypto.randomUUID();
        const initialStatus = row.status === 'POSIBLE_DUPLICADO' ? 'POSIBLE_DUPLICADO' : 'VALIDADO';
        
        stmtContact.run(
          contactId,
          tipo_contacto,
          config.SOURCE_NAME,
          row.title,
          row.first_name,
          row.last_name,
          row.email,
          row.email_normalized || normalizeEmail(row.email),
          row.phone || null,
          row.country_name,
          row.sede_id || defaultSede,
          row.departamento_id || defaultDepto,
          row.job_title || null,
          row.department_unit || null,
          row.institution || null,
          row.subject_area || null,
          row.position || null,
          row.industry || null,
          row.company_name || null,
          initialStatus,
          'CARGA_MASIVA',
          loteId,
          row.recomienda_nombre || reporterName,
          row.recomienda_email || reporterEmail,
          user.id,
          user.nombre_completo,
          now
        );
        importedCount++;
      }

      return { success: true, loteId, importedCount };
    });

    // Guardar archivo original en staging institucional / Google Drive
    if (fileBase64) {
      driveService.saveDocumentArchive(fileName || 'archivo_subido.xlsx', Buffer.from(fileBase64, 'base64'), 'CARGA_MASIVA')
        .catch(err => console.error('Error al archivar en Drive:', err));
    }

    return res.json({
      success: true,
      message: `Se importaron exitosamente ${importedCount} contactos.`,
      loteId,
      importedCount
    });
  }

  // 11. Exportación Oficial para QS
  if (pathname.startsWith('/api/export/') && method === 'GET') {
    const tipo = pathname.replace('/api/export/', '').toUpperCase();
    try {
      const exportResult = exportContactsToXlsx(tipo, query, user);
      
      // Archivar copia de respaldo en Drive/Staging
      driveService.saveDocumentArchive(exportResult.filename, exportResult.buffer, 'EXPORTACION_QS')
        .catch(err => console.error('Error al archivar exportación en Drive:', err));

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
      return res.end(exportResult.buffer);
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // 12. Estado y Respaldo de Google Drive
  if (pathname === '/api/drive/status' && method === 'GET') {
    return res.json({ success: true, drive: driveService.getStatus() });
  }

  if (pathname === '/api/drive/backup' && method === 'POST') {
    if (user.rol !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Solo administradores pueden generar respaldos.' });
    }
    driveService.createDatabaseBackup().then(result => {
      res.json(result);
    }).catch(err => {
      res.status(500).json({ success: false, message: err.message });
    });
    return;
  }

  return res.status(404).json({ success: false, message: 'Endpoint no encontrado' });
}

module.exports = {
  handleApi,
  authenticate,
  requireAdmin
};
