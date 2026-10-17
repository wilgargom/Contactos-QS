const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const { backup, DatabaseSync } = require('node:sqlite');
const { getDb } = require('../database/db');
const crypto = require('node:crypto');

/**
 * Servicio de Almacenamiento y Sincronización Institucional (Google Drive / Staging Local)
 * Cumple con el principio de seguridad:
 * - NO almacena bases de datos vivas transaccionales en Drive.
 * - Archiva evidencias de cargas Excel originales, exportaciones históricas y copias de respaldo (.sqlite).
 */

class DriveService {
  constructor() {
    this.credentialsPath = path.join(config.PATHS.ROOT, 'service-account-key.json');
    this.isDriveConfigured = fs.existsSync(this.credentialsPath);
    this.stagingDir = config.PATHS.DRIVE_STAGING;
    this.backupDir = config.PATHS.BACKUPS;
  }

  /**
   * Guarda un archivo de evidencia (carga masiva o exportación)
   */
  async saveDocumentArchive(fileName, buffer, category = 'CARGA_EXCEL') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = `${category.replace(/[^A-Z0-9_]/gi, '_')}_${timestamp}_${crypto.randomUUID()}_${path.basename(String(fileName)).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const targetPath = path.join(this.stagingDir, safeName);

    fs.writeFileSync(targetPath, buffer);

    return {
      success: true,
      status: 'STAGED_LOCAL_PENDING_DRIVE_SYNC',
      localPath: targetPath,
      message: 'Archivo guardado localmente. La sincronización con Google Drive no está implementada.'
    };

  }

  /**
   * Genera un respaldo físico de la base de datos SQLite
   */
  async createDatabaseBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `tec_qs_backup_${timestamp}_${crypto.randomUUID()}.sqlite`;
    const backupPath = path.join(this.backupDir, backupFileName);

    if (fs.existsSync(config.DB_PATH)) {
      await backup(getDb(), backupPath);
      let restored;
      try {
        restored = new DatabaseSync(backupPath, { readOnly: true });
        const integrity = restored.prepare('PRAGMA integrity_check').get().integrity_check;
        if (integrity !== 'ok') throw new Error('El respaldo no superó la verificación de integridad.');
        if (restored.prepare('PRAGMA foreign_key_check').all().length) throw new Error('El respaldo contiene relaciones inválidas.');
        restored.prepare('SELECT COUNT(*) FROM contactos').get();
      } catch (err) {
        if (restored) { restored.close(); restored = null; }
        fs.rmSync(backupPath, { force: true });
        throw err;
      } finally { if (restored) restored.close(); }
      return {
        success: true,
        verified: true,
        backupPath,
        backupFileName,
        createdAt: new Date().toISOString(),
        sizeBytes: fs.statSync(backupPath).size
      };
    } else {
      return { success: false, message: 'La base de datos aún no ha sido creada en disco.' };
    }
  }

  getStatus() {
    const stagedFiles = fs.readdirSync(this.stagingDir).length;
    const backupFiles = fs.readdirSync(this.backupDir).length;

    return {
      isDriveApiConnected: false,
      credentialsPresent: this.isDriveConfigured,
      mode: 'LOCAL_STAGING',
      targetSharedDrive: config.DRIVE_CONFIG.FOLDER_ID,
      stagedArchivesCount: stagedFiles,
      backupsCount: backupFiles,
      architectureNote: 'Evidencias y respaldos guardados localmente. La integración con Google Drive está pendiente; SQLite conserva los registros operacionales.'
    };
  }
}

module.exports = new DriveService();
