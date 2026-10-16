const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const outputFile = path.join(projectRoot, 'PROYECTO_COMPLETO_TEC_QS_CLAUDE.md');
const standaloneInstaller = path.join(projectRoot, 'instalar_proyecto_completo.js');

const filesToInclude = [
  'package.json',
  'server.js',
  'iniciar_servidor.bat',
  'src/config.js',
  'src/database/schema.sql',
  'src/database/db.js',
  'src/database/seed.js',
  'src/routes/api.js',
  'src/routes/auth.js',
  'src/services/contactService.js',
  'src/services/funcionarioService.js',
  'src/services/duplicateDetector.js',
  'src/services/excelService.js',
  'src/services/exportService.js',
  'src/services/driveService.js',
  'src/utils/validator.js',
  'src/utils/zip.js',
  'public/index.html',
  'public/css/styles.css',
  'public/js/api.js',
  'public/js/app.js',
  'public/js/register.js',
  'public/js/bulkUpload.js',
  'public/js/directory.js',
  'public/js/exportView.js',
  'public/js/adminView.js',
  'public/assets/logo_tec.svg',
  'tests/test_suite.js'
];

let mdContent = `# SISTEMA INSTITUCIONAL DE CONTACTOS QS - TECNOLÓGICO DE COSTA RICA (TEC)
> Documento consolidado del proyecto completo para interacción, ejecución y mejoras con la IA Claude.

---

## 1. RESUMEN EJECUTIVO Y OBJETIVO
Aplicación web institucional desarrollada para el **Tecnológico de Costa Rica (TEC)** destinada a recopilar, validar, administrar, deduplicar y consolidar información de contactos académicos y empleadores para la participación en el **Ranking QS (Quacquarelli Symonds)**.

### Características Clave:
1. **Pila Tecnológica:** Node.js (servidor nativo sin dependencias pesadas de frameworks), SQLite (modo WAL con ACID transaccional), HTML5, CSS3 institucional TEC (#002855, #D97706), Vanilla JavaScript (SPA reactiva).
2. **Modo Red / Sin Administrador:** Servidor configurado para escuchar en \`0.0.0.0:3000\`, permitiendo acceso en red local a través de la IP (\`http://172.17.112.220:3000\`) sin permisos de administrador de Windows ni intervención de DATIC.
3. **Roles Implementados:** 
   - \`ADMINISTRADOR\`: Registro individual, Carga masiva Excel (Contactos y Padrón Funcionarios), Directorio global con toggle de "Solo mis registros", Exportación a Excel y oficial QS, Monitoreo de auditoría.
   - \`USUARIO\`: Registro individual con autocompletado y auto-registro de funcionarios, Carga Masiva Excel, Directorio con estricta privacidad por rol (solo ve sus propios registros) y botón de exportar a Excel.
4. **Módulo de Funcionarios TEC (Padrón Institucional):**
   - Carga masiva de catálogo de funcionarios mediante Excel (.xlsx) con columnas: \`Nombre de funcionario\`, \`Correo electrónico\`, \`Dependencia\`, \`Sede\`.
   - Autocompletado inteligente en Registro Individual: al digitar el correo institucional (\`@itcr.ac.cr\` o \`@tec.ac.cr\`), se autocompleta el nombre, sede y carrera/departamento.
   - Si el funcionario aún no existe en el catálogo, se permite ingresarlo y se auto-registra automáticamente en la base de datos de funcionarios.
5. **Directorio de Contactos con Privacidad y Exportación a Excel:**
   - Aislamiento de privacidad por rol: el usuario estándar solo puede consultar y gestionar los contactos registrados por él.
   - Botón directo **"Exportar a Excel (.xlsx)"** para descargar la lista filtrada de contactos.
6. **Registro Individual Optimizado:**
   - Correo electrónico en primera posición (#1) con validación instantánea y aviso inmediato si ya existe en la base de datos.
   - Restricción estricta de correo institucional (@itcr.ac.cr / @tec.ac.cr no permitidos para contactos QS evaluados).
7. **Carga Masiva Excel:**
   - Soporte para Académicos, Empleadores y Padrón de Funcionarios TEC.
   - Detección de duplicados internos y cruzados con SQLite.
8. **Hot-Reloading:** \`server.js\` detecta mejoras en \`src/\` y recarga en caliente sin reiniciar el proceso.

---

## 2. INSTRUCCIONES PARA CLAUDE
Si estás leyendo este archivo en **Claude**:
- Este proyecto ya está 100% programado y funcional.
- Si necesitas correrlo: Puedes utilizar el script standalone \`instalar_proyecto_completo.js\` o ejecutar directamente \`node server.js\` en la carpeta del proyecto.
- La base de datos se inicializa automáticamente en \`storage/tec_qs.sqlite\` al iniciar el servidor.
- Credenciales iniciales de prueba:
  - Administrador: \`admin@tec.ac.cr\` / \`TecQS2026!\`
  - Usuario: \`cbrenes@tec.ac.cr\` / \`TecQS2026!\`

---

## 3. CÓDIGO FUENTE COMPLETO DE CADA ARCHIVO

`;

const filesDict = {};

for (const relPath of filesToInclude) {
  const fullPath = path.join(projectRoot, relPath);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    filesDict[relPath] = content;
    const ext = path.extname(relPath).replace('.', '');
    const lang = ext === 'js' ? 'javascript' : (ext === 'html' ? 'html' : (ext === 'css' ? 'css' : (ext === 'json' ? 'json' : (ext === 'sql' ? 'sql' : 'text'))));
    mdContent += `### Archivo: \`${relPath}\`\n\n\`\`\`${lang}\n${content}\n\`\`\`\n\n---\n\n`;
  }
}

fs.writeFileSync(outputFile, mdContent, 'utf8');
console.log(`✅ Archivo consolidado para Claude generado exitosamente: ${outputFile}`);

// Generar instalador standalone ejecutable en Node.js
const installerCode = `/**
 * SCRIPT INSTALADOR Y GENERADOR DEL PROYECTO TEC QS PARA CLAUDE / NODE.JS
 * Ejecutar con: node instalar_proyecto_completo.js
 * Crea automáticamente todas las carpetas y archivos del sistema.
 */
const fs = require('fs');
const path = require('path');

const files = ${JSON.stringify(filesDict, null, 2)};

console.log('🚀 Instalando y generando Sistema Institucional TEC QS Contactos...');

for (const [relPath, content] of Object.entries(files)) {
  const targetPath = path.join(__dirname, relPath);
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(targetPath, content, 'utf8');
  console.log('  📄 Creado: ' + relPath);
}

// Crear directorios de almacenamiento necesarios
const storageDirs = ['storage', 'storage/uploads', 'storage/exports', 'storage/backups', 'storage/drive_staging'];
for (const sDir of storageDirs) {
  const fullStorage = path.join(__dirname, sDir);
  if (!fs.existsSync(fullStorage)) {
    fs.mkdirSync(fullStorage, { recursive: true });
  }
}

console.log('\\n✅ ¡Instalación completa!');
console.log('Para iniciar el servidor ejecute:');
console.log('  node server.js');
console.log('O en Windows haga doble clic en: iniciar_servidor.bat\\n');
`;

fs.writeFileSync(standaloneInstaller, installerCode, 'utf8');
console.log(`✅ Script instalador standalone generado exitosamente: ${standaloneInstaller}`);
