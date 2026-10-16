const path = require('node:path');
const fs = require('node:fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const IS_AZURE = Boolean(process.env.WEBSITE_SITE_NAME);
// Los datos quedan fuera del paquete de código y sobreviven a nuevos despliegues.
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || (
  IS_AZURE && process.env.HOME
    ? path.join(process.env.HOME, 'data', 'tec-qs-contacts')
    : path.join(ROOT_DIR, 'storage')
));
const portValue = process.env.PORT || '3000';
// IISNode entrega una named pipe en PORT; no convertirla a número.
const PORT = /^\d+$/.test(portValue) ? Number(portValue) : portValue;
const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');
const EXPORTS_DIR = path.join(STORAGE_DIR, 'exports');
const BACKUPS_DIR = path.join(STORAGE_DIR, 'backups');
const DRIVE_STAGING_DIR = path.join(STORAGE_DIR, 'drive_staging');

// Asegurar directorios de almacenamiento
for (const dir of [STORAGE_DIR, UPLOADS_DIR, EXPORTS_DIR, BACKUPS_DIR, DRIVE_STAGING_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = {
  PORT,
  IS_AZURE,
  HOT_RELOAD: !IS_AZURE && process.env.NODE_ENV !== 'production',
  SQLITE_JOURNAL_MODE: IS_AZURE ? 'DELETE' : 'WAL',
  HOST: process.env.HOST || '0.0.0.0',
  DB_PATH: path.join(STORAGE_DIR, 'tec_qs.sqlite'),
  SOURCE_NAME: 'Instituto Tecnológico de Costa Rica',
  SESSION_SECRET: process.env.SESSION_SECRET || 'tec-secret-key-qs-ranking-2026',
  SESSION_TTL_HOURS: 12,
  PATHS: {
    ROOT: ROOT_DIR,
    STORAGE: STORAGE_DIR,
    UPLOADS: UPLOADS_DIR,
    EXPORTS: EXPORTS_DIR,
    BACKUPS: BACKUPS_DIR,
    DRIVE_STAGING: DRIVE_STAGING_DIR,
    PUBLIC: path.join(ROOT_DIR, 'public')
  },
  // Configuración de integración con Google Drive
  DRIVE_CONFIG: {
    ENABLED: true,
    MODE: 'SERVICE_ACCOUNT_HYBRID', // 'SERVICE_ACCOUNT_HYBRID' o 'LOCAL_STAGING'
    FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID || 'tec-qs-shared-drive-root',
    AUTO_BACKUP_HOURS: 24
  }
};
