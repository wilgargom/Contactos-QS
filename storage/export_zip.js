const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_DIR = 'C:\\tec-qs-contacts';
const DESKTOP_DIR = 'C:\\Users\\wgarita\\Desktop';
const OUTPUT_ZIP_DESKTOP = path.join(DESKTOP_DIR, 'tec-qs-contacts-codigo-fuente.zip');
const OUTPUT_ZIP_LOCAL = path.join(PROJECT_DIR, 'storage', 'tec-qs-contacts-codigo-fuente.zip');
const STAGING_PARENT = path.join(PROJECT_DIR, 'storage', 'staging_export');
const STAGING_DIR = path.join(STAGING_PARENT, 'tec-qs-contacts');

console.log('1. Preparando directorio de empaquetado...');
if (fs.existsSync(STAGING_PARENT)) {
  fs.rmSync(STAGING_PARENT, { recursive: true, force: true });
}
fs.mkdirSync(STAGING_DIR, { recursive: true });

// Directorios y archivos esenciales a incluir en el repositorio
const ITEMS_TO_COPY = [
  'src',
  'public',
  'tests',
  'server.js',
  'package.json',
  'README.md',
  '.gitignore',
  'iniciar_servidor.bat',
  'COMPARTIR_SISTEMA_TEC_QS.bat',
  'iniciar_con_enlace.ps1'
];

for (const item of ITEMS_TO_COPY) {
  const srcPath = path.join(PROJECT_DIR, item);
  const destPath = path.join(STAGING_DIR, item);
  if (fs.existsSync(srcPath)) {
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      fs.cpSync(srcPath, destPath, { recursive: true });
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
    console.log(`   + Incluido: ${item}`);
  }
}

// Estructura storage limpia con marcadores .gitkeep para GitHub
const STORAGE_FOLDERS = ['uploads', 'backups', 'exports', 'drive_staging'];
for (const folder of STORAGE_FOLDERS) {
  const folderPath = path.join(STAGING_DIR, 'storage', folder);
  fs.mkdirSync(folderPath, { recursive: true });
  fs.writeFileSync(path.join(folderPath, '.gitkeep'), '');
}
console.log('   + Estructura storage/ preparada con .gitkeep');

// Eliminar zips previos si existen
if (fs.existsSync(OUTPUT_ZIP_DESKTOP)) fs.unlinkSync(OUTPUT_ZIP_DESKTOP);
if (fs.existsSync(OUTPUT_ZIP_LOCAL)) fs.unlinkSync(OUTPUT_ZIP_LOCAL);

console.log('2. Comprimiendo archivos mediante tar...');
// Ejecutamos tar.exe dentro del directorio de staging para rutas relativas limpias
execSync(`tar.exe -a -c -f "${OUTPUT_ZIP_DESKTOP}" *`, {
  cwd: STAGING_DIR,
  stdio: 'inherit'
});

// Guardar también una copia en storage/ por seguridad
fs.copyFileSync(OUTPUT_ZIP_DESKTOP, OUTPUT_ZIP_LOCAL);

// Limpieza de staging
fs.rmSync(STAGING_PARENT, { recursive: true, force: true });

const stats = fs.statSync(OUTPUT_ZIP_DESKTOP);
console.log('');
console.log('=====================================================================');
console.log('3. [OK] Archivo ZIP para GitHub generado exitosamente:');
console.log(`   Escritorio: ${OUTPUT_ZIP_DESKTOP}`);
console.log(`   Copia Local: ${OUTPUT_ZIP_LOCAL}`);
console.log(`   Tamano: ${(stats.size / 1024).toFixed(1)} KB`);
console.log('=====================================================================');
