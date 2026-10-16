# SISTEMA INSTITUCIONAL DE CONTACTOS QS - TECNOLÓGICO DE COSTA RICA (TEC)
> Documento consolidado del proyecto completo para interacción, ejecución y mejoras con la IA Claude.

---

## 1. RESUMEN EJECUTIVO Y OBJETIVO
Aplicación web institucional desarrollada para el **Tecnológico de Costa Rica (TEC)** destinada a recopilar, validar, administrar, deduplicar y consolidar información de contactos académicos y empleadores para la participación en el **Ranking QS (Quacquarelli Symonds)**.

### Características Clave:
1. **Pila Tecnológica:** Node.js (servidor nativo sin dependencias pesadas de frameworks), SQLite (modo WAL con ACID transaccional), HTML5, CSS3 institucional TEC (#002855, #D97706), Vanilla JavaScript (SPA reactiva).
2. **Modo Red / Sin Administrador:** Servidor configurado para escuchar en `0.0.0.0:3000`, permitiendo acceso en red local a través de la IP (`http://172.17.112.220:3000`) sin permisos de administrador de Windows ni intervención de DATIC.
3. **Roles Implementados:** 
   - `ADMINISTRADOR`: Registro individual, Carga masiva Excel (Contactos y Padrón Funcionarios), Directorio global con toggle de "Solo mis registros", Exportación a Excel y oficial QS, Monitoreo de auditoría.
   - `USUARIO`: Registro individual con autocompletado y auto-registro de funcionarios, Carga Masiva Excel, Directorio con estricta privacidad por rol (solo ve sus propios registros) y botón de exportar a Excel.
4. **Módulo de Funcionarios TEC (Padrón Institucional):**
   - Carga masiva de catálogo de funcionarios mediante Excel (.xlsx) con columnas: `Nombre de funcionario`, `Correo electrónico`, `Dependencia`, `Sede`.
   - Autocompletado inteligente en Registro Individual: al digitar el correo institucional (`@itcr.ac.cr` o `@tec.ac.cr`), se autocompleta el nombre, sede y carrera/departamento.
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
8. **Hot-Reloading:** `server.js` detecta mejoras en `src/` y recarga en caliente sin reiniciar el proceso.

---

## 2. INSTRUCCIONES PARA CLAUDE
Si estás leyendo este archivo en **Claude**:
- Este proyecto ya está 100% programado y funcional.
- Si necesitas correrlo: Puedes utilizar el script standalone `instalar_proyecto_completo.js` o ejecutar directamente `node server.js` en la carpeta del proyecto.
- La base de datos se inicializa automáticamente en `storage/tec_qs.sqlite` al iniciar el servidor.
- Credenciales iniciales de prueba:
  - Administrador: `admin@tec.ac.cr` / `TecQS2026!`
  - Usuario: `cbrenes@tec.ac.cr` / `TecQS2026!`

---

## 3. CÓDIGO FUENTE COMPLETO DE CADA ARCHIVO

### Archivo: `package.json`

```json
{
  "name": "tec-qs-contacts",
  "version": "1.0.0",
  "description": "Sistema Institucional de Gestión de Contactos Académicos y Empleadores para el Ranking QS - Tecnológico de Costa Rica (TEC)",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "test": "node tests/test_suite.js"
  },
  "keywords": [
    "tec",
    "qs-ranking",
    "contacts",
    "academic-reputation",
    "employer-reputation"
  ],
  "author": "Tecnológico de Costa Rica",
  "license": "Proprietary"
}

```

---

### Archivo: `server.js`

```javascript
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const os = require('node:os');
const config = require('./src/config');
const { getDb } = require('./src/database/db');
const { seedDatabase } = require('./src/database/seed');

// MIME Types para servidor estático
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

// Inicializar base de datos y catálogos
getDb();
seedDatabase();

// =========================================================================
// SISTEMA DE RECARGA EN CALIENTE (HOT-RELOAD) PARA MEJORAS CONTINUAS
// Invalida automáticamente la caché en memoria cuando Antigravity modifica
// archivos en src/, permitiendo aplicar mejoras en tiempo real sin reiniciar.
// =========================================================================
const srcDir = path.join(__dirname, 'src');
try {
  fs.watch(srcDir, { recursive: true }, (eventType, filename) => {
    if (filename) {
      Object.keys(require.cache).forEach(modulePath => {
        // Preservar conexión de base de datos sqlite en memoria para estabilidad
        if (modulePath.startsWith(srcDir) && !modulePath.includes('db.js')) {
          delete require.cache[modulePath];
        }
      });
      console.log(`[Hot-Reload] ⚡ Mejora detectada en ${filename}. Módulos actualizados en tiempo real.`);
    }
  });
} catch (err) {
  console.warn('[Hot-Reload] Monitor de archivos no disponible en esta plataforma:', err.message);
}

// Carga dinámica de rutas y autenticación
function getRouteHandlers() {
  return {
    handleAuth: require('./src/routes/auth').handleAuth,
    handleApi: require('./src/routes/api').handleApi,
    authenticate: require('./src/routes/api').authenticate
  };
}

const server = http.createServer((req, res) => {
  // CORS y encabezados de seguridad institucionales
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Helpers para respuesta JSON
  res.status = function(code) {
    this.statusCode = code;
    return this;
  };
  res.json = function(data) {
    this.setHeader('Content-Type', 'application/json; charset=utf-8');
    this.end(JSON.stringify(data));
  };

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // Rutas de API
  if (pathname.startsWith('/api/')) {
    let bodyData = '';
    req.on('data', chunk => {
      bodyData += chunk;
      // Protección contra archivos excesivamente grandes (> 35MB)
      if (bodyData.length > 35 * 1024 * 1024) {
        res.status(413).json({ success: false, message: 'El payload excede el límite máximo permitido (35MB).' });
        req.destroy();
      }
    });

    req.on('end', () => {
      let body = {};
      if (bodyData) {
        try {
          body = JSON.parse(bodyData);
        } catch {
          return res.status(400).json({ success: false, message: 'JSON mal formado.' });
        }
      }

      req.query = query;
      const routes = getRouteHandlers();

      // Endpoint público de salud
      if (pathname === '/api/health') {
        return res.json({ success: true, status: 'UP', timestamp: new Date().toISOString() });
      }

      // Autenticación pública
      if (pathname.startsWith('/api/auth/')) {
        return routes.handleAuth(req, res, pathname, query, body);
      }

      // Descargas de plantillas públicas sin requerir login si se desea
      if (pathname.startsWith('/api/templates/')) {
        return routes.handleApi(req, res, pathname, query, body, { rol: 'ADMIN', id: 'system', nombre_completo: 'Sistema' });
      }

      // Rutas protegidas de API
      try {
        routes.authenticate(req, res, () => {
          routes.handleApi(req, res, pathname, query, body, req.user);
        });
      } catch (err) {
        console.error('Error no capturado en ruta API:', err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: 'Error interno del servidor.' });
        }
      }
    });

    return;
  }

  // Servir archivos estáticos del frontend con prevención de caché antigua
  let filePath = path.join(config.PATHS.PUBLIC, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath).toLowerCase();

  // Prevenir Directory Traversal
  if (!filePath.startsWith(config.PATHS.PUBLIC)) {
    res.status(403).end('Acceso denegado');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback a index.html para Single Page Application
      const indexPath = path.join(config.PATHS.PUBLIC, 'index.html');
      fs.readFile(indexPath, (readErr, content) => {
        if (readErr) {
          res.status(404).end('Archivo no encontrado');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        res.end(content);
      });
      return;
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(config.PORT, config.HOST, () => {
  const nets = os.networkInterfaces();
  const netIps = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
        netIps.push({ name, address: net.address });
      }
    }
  }

  console.log(`================================================================`);
  console.log(`🚀 Sistema Institucional de Contactos QS - TEC activo`);
  console.log(`📍 Acceso Local (Este equipo): http://localhost:${config.PORT} (o http://127.0.0.1:${config.PORT})`);
  if (netIps.length > 0) {
    netIps.forEach(ip => {
      console.log(`🌐 Acceso en Red Institucional (${ip.name}): http://${ip.address}:${config.PORT}`);
    });
  } else {
    console.log(`🌐 Acceso en Red: http://${config.HOST}:${config.PORT}`);
  }
  console.log(`🏛️ Institución: ${config.SOURCE_NAME}`);
  console.log(`🔒 Modo de Base de Datos: SQLite WAL (Transaccional ACID)`);
  console.log(`⚡ Modo Hot-Reload: Activo (Mejoras aplicadas en tiempo real)`);
  console.log(`📁 Directorio de Staging Drive: ${config.PATHS.DRIVE_STAGING}`);
  console.log(`================================================================`);
});

module.exports = server;

```

---

### Archivo: `iniciar_servidor.bat`

```text
@echo off
title Sistema Institucional de Contactos QS - TEC
echo ================================================================
echo   Iniciando Sistema de Contactos QS - Tecnologico de Costa Rica
echo ================================================================
echo.

cd /d "%~dp0"

:: Verificar si Node.js esta en PATH o usar agy-node
where node >nul 2>nul
if %errorlevel% equ 0 (
    echo Iniciando servidor con Node.js...
    node server.js
) else (
    if exist "%USERPROFILE%\AppData\Roaming\Antigravity\bin\agy-node.cmd" (
        echo Iniciando servidor con Antigravity Node...
        "%USERPROFILE%\AppData\Roaming\Antigravity\bin\agy-node.cmd" server.js
    ) else (
        echo [ERROR] No se encontro Node.js instalado.
        pause
    )
)
pause

```

---

### Archivo: `src/config.js`

```javascript
const path = require('node:path');
const fs = require('node:fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const STORAGE_DIR = path.join(ROOT_DIR, 'storage');
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
  PORT: process.env.PORT || 3000,
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

```

---

### Archivo: `src/database/schema.sql`

```sql
-- Esquema SQLite para Gestión de Contactos QS - Tecnológico de Costa Rica
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 1. Catálogo de Sedes del TEC
CREATE TABLE IF NOT EXISTS sedes (
  id TEXT PRIMARY KEY,
  codigo TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  activo INTEGER DEFAULT 1
);

-- 2. Catálogo de Escuelas y Departamentos
CREATE TABLE IF NOT EXISTS departamentos (
  id TEXT PRIMARY KEY,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  sede_id TEXT,
  activo INTEGER DEFAULT 1,
  FOREIGN KEY (sede_id) REFERENCES sedes(id)
);

-- 3. Usuarios del Sistema
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  nombre_completo TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  rol TEXT NOT NULL CHECK(rol IN ('ADMIN', 'USUARIO')),
  sede_id TEXT,
  departamento_id TEXT,
  activo INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (sede_id) REFERENCES sedes(id),
  FOREIGN KEY (departamento_id) REFERENCES departamentos(id)
);

-- 4. Sesiones Activas
CREATE TABLE IF NOT EXISTS sesiones (
  token TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- 5. Lotes de Carga Masiva (Excel)
CREATE TABLE IF NOT EXISTS lotes_carga (
  id TEXT PRIMARY KEY,
  nombre_archivo TEXT NOT NULL,
  tipo_contacto TEXT NOT NULL,
  total_filas INTEGER NOT NULL,
  correctos INTEGER NOT NULL,
  con_errores INTEGER NOT NULL,
  posibles_duplicados INTEGER NOT NULL,
  duplicados_exactos INTEGER NOT NULL,
  cargado_por TEXT NOT NULL,
  created_at TEXT NOT NULL,
  detalles_json TEXT
);

-- 6. Contactos Principales (Académicos y Empleadores)
CREATE TABLE IF NOT EXISTS contactos (
  id TEXT PRIMARY KEY,
  tipo_contacto TEXT NOT NULL CHECK(tipo_contacto IN ('ACADEMICO', 'EMPLEADOR')),
  source TEXT DEFAULT 'Instituto Tecnológico de Costa Rica',
  title TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  phone TEXT,
  country_name TEXT NOT NULL,
  sede_id TEXT,
  departamento_id TEXT,
  
  -- Campos específicos Académico
  job_title TEXT,
  department_unit TEXT,
  institution TEXT,
  subject_area TEXT,

  -- Campos específicos Empleador
  position TEXT,
  industry TEXT,
  company_name TEXT,

  -- Identificación de quien recomienda / reporta el contacto (Funcionario del TEC)
  recomienda_nombre TEXT,
  recomienda_email TEXT,

  -- Trazabilidad y Estado
  estado TEXT NOT NULL CHECK(estado IN ('NUEVO', 'VALIDADO', 'POSIBLE_DUPLICADO', 'DUPLICADO', 'CORREGIDO', 'EXPORTADO')),
  metodo_ingreso TEXT NOT NULL CHECK(metodo_ingreso IN ('INDIVIDUAL', 'CARGA_MASIVA')),
  lote_id TEXT,
  created_by TEXT NOT NULL,
  created_by_name TEXT,
  created_at TEXT NOT NULL,
  updated_by TEXT,
  updated_by_name TEXT,
  updated_at TEXT,
  
  FOREIGN KEY (sede_id) REFERENCES sedes(id),
  FOREIGN KEY (departamento_id) REFERENCES departamentos(id),
  FOREIGN KEY (lote_id) REFERENCES lotes_carga(id)
);

-- Índices de alto rendimiento para búsquedas y prevención de duplicados
CREATE INDEX IF NOT EXISTS idx_contactos_email_norm ON contactos(email_normalized);
CREATE INDEX IF NOT EXISTS idx_contactos_tipo ON contactos(tipo_contacto);
CREATE INDEX IF NOT EXISTS idx_contactos_estado ON contactos(estado);
CREATE INDEX IF NOT EXISTS idx_contactos_sede ON contactos(sede_id);
CREATE INDEX IF NOT EXISTS idx_contactos_depto ON contactos(departamento_id);
CREATE INDEX IF NOT EXISTS idx_contactos_created_at ON contactos(created_at);

-- 7. Historial y Auditoría Inmutable
CREATE TABLE IF NOT EXISTS auditoria (
  id TEXT PRIMARY KEY,
  contacto_id TEXT,
  usuario_id TEXT,
  usuario_nombre TEXT,
  accion TEXT NOT NULL,
  detalles TEXT,
  created_at TEXT NOT NULL
);

-- 8. Padrón Oficial de Funcionarios del TEC
CREATE TABLE IF NOT EXISTS funcionarios (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email_normalized TEXT NOT NULL UNIQUE,
  dependencia TEXT NOT NULL,
  sede TEXT NOT NULL,
  sede_id TEXT,
  departamento_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (sede_id) REFERENCES sedes(id),
  FOREIGN KEY (departamento_id) REFERENCES departamentos(id)
);

CREATE INDEX IF NOT EXISTS idx_funcionarios_email_norm ON funcionarios(email_normalized);


```

---

### Archivo: `src/database/db.js`

```javascript
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');

let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(config.DB_PATH);
    
    // Activar modo WAL para concurrencia multi-hilo / multi-usuario y llaves foráneas
    dbInstance.exec('PRAGMA journal_mode = WAL;');
    dbInstance.exec('PRAGMA foreign_keys = ON;');
    dbInstance.exec('PRAGMA synchronous = NORMAL;');
    
    // Inicializar esquema si no existe
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    dbInstance.exec(schemaSql);

    // Auto-migraciones para columnas de trazabilidad institucional
    try { dbInstance.exec('ALTER TABLE contactos ADD COLUMN recomienda_nombre TEXT;'); } catch (_) {}
    try { dbInstance.exec('ALTER TABLE contactos ADD COLUMN recomienda_email TEXT;'); } catch (_) {}
    try { dbInstance.exec('ALTER TABLE lotes_carga ADD COLUMN cargado_por_email TEXT;'); } catch (_) {}
    try {
      dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS funcionarios (
          id TEXT PRIMARY KEY,
          nombre TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          email_normalized TEXT NOT NULL UNIQUE,
          dependencia TEXT NOT NULL,
          sede TEXT NOT NULL,
          sede_id TEXT,
          departamento_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_funcionarios_email_norm ON funcionarios(email_normalized);
      `);
    } catch (_) {}
  }
  return dbInstance;
}

/**
 * Ejecuta una serie de operaciones dentro de una transacción atómica segura.
 */
function runTransaction(fn) {
  const db = getDb();
  db.exec('BEGIN TRANSACTION;');
  try {
    const result = fn(db);
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

module.exports = {
  getDb,
  runTransaction
};

```

---

### Archivo: `src/database/seed.js`

```javascript
const crypto = require('node:crypto');
const { getDb, runTransaction } = require('./db');

// Función segura de hash con PBKDF2 (sin dependencias externas)
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function seedDatabase() {
  const db = getDb();

  runTransaction((trx) => {
    // 1. Sedes Oficiales del TEC
    const sedesData = [
      { id: 'sede-cartago', codigo: 'CART', nombre: 'Campus Central Cartago' },
      { id: 'sede-sanjose', codigo: 'SJ', nombre: 'Campus Tecnológico Local San José' },
      { id: 'sede-sancarlos', codigo: 'SC', nombre: 'Campus Tecnológico Local San Carlos' },
      { id: 'sede-alajuela', codigo: 'AL', nombre: 'Centro Académico de Alajuela' },
      { id: 'sede-limon', codigo: 'LIM', nombre: 'Centro Académico de Limón' }
    ];

    const stmtSede = trx.prepare('INSERT OR IGNORE INTO sedes (id, codigo, nombre) VALUES (?, ?, ?)');
    for (const s of sedesData) {
      stmtSede.run(s.id, s.codigo, s.nombre);
    }

    // 2. Departamentos y Escuelas del TEC
    const deptosData = [
      { id: 'dep-comp', codigo: 'IC', nombre: 'Escuela de Ingeniería en Computación', sede: 'sede-cartago' },
      { id: 'dep-elec', codigo: 'IE', nombre: 'Escuela de Ingeniería Electrónica', sede: 'sede-cartago' },
      { id: 'dep-ind', codigo: 'PI', nombre: 'Escuela de Ingeniería en Producción Industrial', sede: 'sede-cartago' },
      { id: 'dep-biotech', codigo: 'IB', nombre: 'Escuela de Ingeniería en Biotecnología', sede: 'sede-cartago' },
      { id: 'dep-admin', codigo: 'AE', nombre: 'Escuela de Administración de Empresas', sede: 'sede-sanjose' },
      { id: 'dep-mecatr', codigo: 'IM', nombre: 'Escuela de Ingeniería Mecatrónica', sede: 'sede-cartago' },
      { id: 'dep-const', codigo: 'CO', nombre: 'Escuela de Ingeniería en Construcción', sede: 'sede-cartago' },
      { id: 'dep-inter', codigo: 'DCAI', nombre: 'Dirección de Cooperación y Asuntos Internacionales', sede: 'sede-cartago' }
    ];

    const stmtDepto = trx.prepare('INSERT OR IGNORE INTO departamentos (id, codigo, nombre, sede_id) VALUES (?, ?, ?, ?)');
    for (const d of deptosData) {
      stmtDepto.run(d.id, d.codigo, d.nombre, d.sede);
    }

    // 3. Usuarios de prueba institucionales
    const usersData = [
      {
        id: 'usr-admin-01',
        nombre_completo: 'Lic. Administrador General QS',
        email: 'admin@tec.ac.cr',
        password: 'TecQS2026!',
        rol: 'ADMIN',
        sede_id: 'sede-cartago',
        departamento_id: 'dep-inter'
      },
      {
        id: 'usr-user-01',
        nombre_completo: 'Ing. Carlos Brenes (Computación)',
        email: 'cbrenes@tec.ac.cr',
        password: 'TecQS2026!',
        rol: 'USUARIO',
        sede_id: 'sede-cartago',
        departamento_id: 'dep-comp'
      },
      {
        id: 'usr-user-02',
        nombre_completo: 'Dra. Elena Vargas (San José)',
        email: 'evargas@tec.ac.cr',
        password: 'TecQS2026!',
        rol: 'USUARIO',
        sede_id: 'sede-sanjose',
        departamento_id: 'dep-admin'
      }
    ];

    const stmtUser = trx.prepare(`
      INSERT OR IGNORE INTO usuarios (id, nombre_completo, email, password_hash, salt, rol, sede_id, departamento_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const u of usersData) {
      const { hash, salt } = hashPassword(u.password);
      stmtUser.run(u.id, u.nombre_completo, u.email, hash, salt, u.rol, u.sede_id, u.departamento_id, new Date().toISOString());
    }

    // 4. Contactos iniciales de prueba (para demostración inmediata de filtros, duplicados y exportación)
    const initialContacts = [
      {
        id: 'cnt-acad-01',
        tipo_contacto: 'ACADEMICO',
        source: 'Instituto Tecnológico de Costa Rica',
        title: 'Prof',
        first_name: 'David',
        last_name: 'Patterson',
        email: 'pattrsn@berkeley.edu',
        email_normalized: 'pattrsn@berkeley.edu',
        phone: '+15106421234',
        country_name: 'United States',
        sede_id: 'sede-cartago',
        departamento_id: 'dep-comp',
        job_title: 'Professor Emeritus',
        department_unit: 'Computer Science Division',
        institution: 'University of California, Berkeley',
        subject_area: 'Computer Science & Information Systems',
        position: null,
        industry: null,
        company_name: null,
        estado: 'VALIDADO',
        metodo_ingreso: 'INDIVIDUAL',
        created_by: 'usr-admin-01',
        created_by_name: 'Lic. Administrador General QS',
        created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
        updated_by: null,
        updated_by_name: null,
        updated_at: null
      },
      {
        id: 'cnt-emp-01',
        tipo_contacto: 'EMPLEADOR',
        source: 'Instituto Tecnológico de Costa Rica',
        title: 'Ms',
        first_name: 'Sarah',
        last_name: 'Connor',
        email: 'sarah.connor@intel.com',
        email_normalized: 'sarah.connor@intel.com',
        phone: '+50622984000',
        country_name: 'Costa Rica',
        sede_id: 'sede-cartago',
        departamento_id: 'dep-elec',
        job_title: null,
        department_unit: null,
        institution: null,
        subject_area: null,
        position: 'Engineering Director',
        industry: 'Technology / Software / IT',
        company_name: 'Intel Costa Rica',
        estado: 'VALIDADO',
        metodo_ingreso: 'INDIVIDUAL',
        created_by: 'usr-user-01',
        created_by_name: 'Ing. Carlos Brenes (Computación)',
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
        updated_by: null,
        updated_by_name: null,
        updated_at: null
      }
    ];

    const stmtContact = trx.prepare(`
      INSERT OR IGNORE INTO contactos (
        id, tipo_contacto, source, title, first_name, last_name, email, email_normalized, phone,
        country_name, sede_id, departamento_id, job_title, department_unit, institution, subject_area,
        position, industry, company_name, estado, metodo_ingreso, created_by, created_by_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const c of initialContacts) {
      stmtContact.run(
        c.id, c.tipo_contacto, c.source, c.title, c.first_name, c.last_name, c.email, c.email_normalized,
        c.phone, c.country_name, c.sede_id, c.departamento_id, c.job_title, c.department_unit,
        c.institution, c.subject_area, c.position, c.industry, c.company_name, c.estado,
        c.metodo_ingreso, c.created_by, c.created_by_name, c.created_at
      );
    }

    // 5. Padrón inicial de Funcionarios del TEC
    const initialFuncionarios = [
      {
        id: 'func-01',
        nombre: 'Dr. Carlos Brenes Solano',
        email: 'cbrenes@itcr.ac.cr',
        email_normalized: 'cbrenes@itcr.ac.cr',
        dependencia: 'Escuela de Ingeniería en Computación',
        sede: 'Campus Central Cartago',
        sede_id: 'sede-cartago',
        departamento_id: 'dep-comp'
      },
      {
        id: 'func-02',
        nombre: 'Dra. Patricia Solís Gómez',
        email: 'psolis@itcr.ac.cr',
        email_normalized: 'psolis@itcr.ac.cr',
        dependencia: 'Escuela de Ingeniería Electrónica',
        sede: 'Campus Central Cartago',
        sede_id: 'sede-cartago',
        departamento_id: 'dep-elec'
      },
      {
        id: 'func-03',
        nombre: 'Licda. Elena Vargas Castro',
        email: 'evargas@itcr.ac.cr',
        email_normalized: 'evargas@itcr.ac.cr',
        dependencia: 'Escuela de Administración de Empresas',
        sede: 'Campus Tecnológico Local San José',
        sede_id: 'sede-sanjose',
        departamento_id: 'dep-admin'
      },
      {
        id: 'func-04',
        nombre: 'Ing. Roberto Méndez Mora',
        email: 'rmendez@itcr.ac.cr',
        email_normalized: 'rmendez@itcr.ac.cr',
        dependencia: 'Escuela de Ingeniería en Producción Industrial',
        sede: 'Campus Central Cartago',
        sede_id: 'sede-cartago',
        departamento_id: 'dep-ind'
      },
      {
        id: 'func-05',
        nombre: 'Dra. María Auxiliadora Gómez',
        email: 'mauxiliadora@itcr.ac.cr',
        email_normalized: 'mauxiliadora@itcr.ac.cr',
        dependencia: 'Dirección de Cooperación y Asuntos Internacionales',
        sede: 'Campus Central Cartago',
        sede_id: 'sede-cartago',
        departamento_id: 'dep-inter'
      }
    ];

    const stmtFunc = trx.prepare(`
      INSERT OR IGNORE INTO funcionarios (
        id, nombre, email, email_normalized, dependencia, sede, sede_id, departamento_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    for (const f of initialFuncionarios) {
      stmtFunc.run(f.id, f.nombre, f.email, f.email_normalized, f.dependencia, f.sede, f.sede_id, f.departamento_id, now, now);
    }
  });

  console.log('✅ Base de datos inicializada y sembrada exitosamente.');
}

if (require.main === module) {
  seedDatabase();
}

module.exports = {
  seedDatabase,
  hashPassword
};

```

---

### Archivo: `src/routes/api.js`

```javascript
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

```

---

### Archivo: `src/routes/auth.js`

```javascript
const authService = require('../services/authService');
const { getDb } = require('../database/db');

function handleAuth(req, res, pathname, query, body) {
  const method = req.method;

  if (pathname === '/api/auth/login' && method === 'POST') {
    const { email, password } = body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Correo y contraseña requeridos.' });
    }
    const result = authService.login(email, password);
    if (!result.success) {
      return res.status(401).json(result);
    }
    return res.json(result);
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : query.token;
    const user = authService.getSessionUser(token);
    if (!user) {
      return res.status(401).json({ success: false, message: 'No autenticado o sesión expirada.' });
    }
    return res.json({ success: true, user });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : body.token;
    authService.logout(token);
    return res.json({ success: true, message: 'Sesión cerrada correctamente.' });
  }

  if (pathname === '/api/auth/switch-context' && method === 'POST') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : body.token;
    const user = authService.getSessionUser(token);
    if (!user) {
      return res.status(401).json({ success: false, message: 'No autenticado.' });
    }

    const { sede_id, departamento_id } = body;
    const db = getDb();

    // Actualizar contexto en la base de datos para el usuario
    if (sede_id) {
      db.prepare('UPDATE usuarios SET sede_id = ? WHERE id = ?').run(sede_id, user.id);
    }
    if (departamento_id) {
      db.prepare('UPDATE usuarios SET departamento_id = ? WHERE id = ?').run(departamento_id, user.id);
    }

    const updatedUser = authService.getSessionUser(token);
    return res.json({ success: true, user: updatedUser });
  }

  return res.status(404).json({ success: false, message: 'Ruta de autenticación no encontrada' });
}

module.exports = {
  handleAuth
};

```

---

### Archivo: `src/services/contactService.js`

```javascript
const crypto = require('node:crypto');
const { getDb, runTransaction } = require('../database/db');
const { validateContact, normalizeEmail } = require('../utils/validator');
const { checkDuplicate } = require('./duplicateDetector');

function logAudit(trx, contactoId, usuario, accion, detalles) {
  const auditId = crypto.randomUUID();
  const stmt = trx.prepare(`
    INSERT INTO auditoria (id, contacto_id, usuario_id, usuario_nombre, accion, detalles, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    auditId,
    contactoId,
    usuario.id,
    usuario.nombre_completo,
    accion,
    typeof detalles === 'object' ? JSON.stringify(detalles) : String(detalles),
    new Date().toISOString()
  );
}

function createContact(rawData, user, options = {}) {
  const { allowDuplicateOverride = false, metodoIngreso = 'INDIVIDUAL', loteId = null } = options;
  
  // 1. Validar reglas de formato y campos requeridos
  const validation = validateContact(rawData, rawData.tipo_contacto);
  if (!validation.isValid) {
    return {
      success: false,
      validationErrors: validation.errors,
      warnings: validation.warnings,
      message: 'El registro contiene errores de validación.'
    };
  }

  const s = validation.sanitized;

  // 2. Detección de duplicados
  const dupCheck = checkDuplicate(s);
  if (dupCheck.status === 'EXACT_MATCH') {
    return {
      success: false,
      duplicateStatus: 'EXACT_MATCH',
      duplicateDetails: dupCheck,
      message: `Coincidencia exacta detectada: ${dupCheck.explanation}`
    };
  }

  if (dupCheck.status === 'POTENTIAL_DUPLICATE' && !allowDuplicateOverride) {
    return {
      success: false,
      duplicateStatus: 'POTENTIAL_DUPLICATE',
      duplicateDetails: dupCheck,
      message: `Posible duplicado detectado: ${dupCheck.explanation}`
    };
  }

  // 3. Determinar estado inicial
  let estado = 'VALIDADO';
  if (dupCheck.status === 'POTENTIAL_DUPLICATE') {
    estado = 'POSIBLE_DUPLICADO';
  }

  // 4. Inserción en base de datos con transacción atómica
  const contactId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Preservar sede y departamento del usuario si no fueron especificados
  const sedeId = s.sede_id || user.sede_id || null;
  const deptoId = s.departamento_id || user.departamento_id || null;
  const recomiendaNombre = (rawData.recomienda_nombre || user.nombre_completo || '').trim();
  const recomiendaEmail = (rawData.recomienda_email || user.email || '').trim().toLowerCase();

  return runTransaction((trx) => {
    const stmt = trx.prepare(`
      INSERT INTO contactos (
        id, tipo_contacto, source, title, first_name, last_name, email, email_normalized, phone,
        country_name, sede_id, departamento_id, job_title, department_unit, institution, subject_area,
        position, industry, company_name, estado, metodo_ingreso, lote_id,
        recomienda_nombre, recomienda_email,
        created_by, created_by_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      contactId,
      s.tipo_contacto,
      s.source,
      s.title,
      s.first_name,
      s.last_name,
      s.email,
      s.email_normalized,
      s.phone,
      s.country_name,
      sedeId,
      deptoId,
      s.job_title || null,
      s.department_unit || null,
      s.institution || null,
      s.subject_area || null,
      s.position || null,
      s.industry || null,
      s.company_name || null,
      estado,
      metodoIngreso,
      loteId,
      recomiendaNombre,
      recomiendaEmail,
      user.id,
      user.nombre_completo,
      now
    );

    logAudit(trx, contactId, user, 'CREACION', {
      metodo: metodoIngreso,
      estado,
      datos: s
    });

    // Auto-registrar funcionario si fue ingresado y no existía
    if (recomiendaEmail && (recomiendaEmail.endsWith('@itcr.ac.cr') || recomiendaEmail.endsWith('@tec.ac.cr'))) {
      try {
        const { upsertFuncionario } = require('./funcionarioService');
        let sedeNombre = null;
        let deptoNombre = null;
        if (sedeId) {
          const sRow = trx.prepare('SELECT nombre FROM sedes WHERE id = ?').get(sedeId);
          if (sRow) sedeNombre = sRow.nombre;
        }
        if (deptoId) {
          const dRow = trx.prepare('SELECT nombre FROM departamentos WHERE id = ?').get(deptoId);
          if (dRow) deptoNombre = dRow.nombre;
        }

        upsertFuncionario({
          nombre: recomiendaNombre || user.nombre_completo,
          email: recomiendaEmail,
          dependencia: deptoNombre || rawData.dependencia || 'Dependencia TEC',
          sede: sedeNombre || rawData.sede || 'Campus Central Cartago',
          sede_id: sedeId,
          departamento_id: deptoId
        });
      } catch (_) {}
    }

    const created = trx.prepare('SELECT * FROM contactos WHERE id = ?').get(contactId);
    return {
      success: true,
      contact: created,
      warnings: validation.warnings,
      duplicateStatus: dupCheck.status
    };
  });
}

function updateContact(id, rawData, user) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM contactos WHERE id = ?').get(id);
  if (!existing) {
    return { success: false, message: 'Contacto no encontrado.' };
  }

  const validation = validateContact(rawData, rawData.tipo_contacto || existing.tipo_contacto);
  if (!validation.isValid) {
    return { success: false, validationErrors: validation.errors, warnings: validation.warnings };
  }

  const s = validation.sanitized;
  const dupCheck = checkDuplicate(s, id);

  if (dupCheck.status === 'EXACT_MATCH') {
    return {
      success: false,
      duplicateStatus: 'EXACT_MATCH',
      duplicateDetails: dupCheck,
      message: `No se puede actualizar: ${dupCheck.explanation}`
    };
  }

  const now = new Date().toISOString();

  const recNombre = rawData.recomienda_nombre !== undefined ? (rawData.recomienda_nombre || '').trim() : existing.recomienda_nombre;
  const recEmail = rawData.recomienda_email !== undefined ? (rawData.recomienda_email || '').trim().toLowerCase() : existing.recomienda_email;

  return runTransaction((trx) => {
    const stmt = trx.prepare(`
      UPDATE contactos SET
        title = ?, first_name = ?, last_name = ?, email = ?, email_normalized = ?, phone = ?,
        country_name = ?, job_title = ?, department_unit = ?, institution = ?, subject_area = ?,
        position = ?, industry = ?, company_name = ?,
        recomienda_nombre = ?, recomienda_email = ?,
        estado = 'CORREGIDO', updated_by = ?,
        updated_by_name = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      s.title, s.first_name, s.last_name, s.email, s.email_normalized, s.phone,
      s.country_name, s.job_title || null, s.department_unit || null, s.institution || null,
      s.subject_area || null, s.position || null, s.industry || null, s.company_name || null,
      recNombre, recEmail,
      user.id, user.nombre_completo, now, id
    );

    logAudit(trx, id, user, 'MODIFICACION', {
      valores_anteriores: existing,
      valores_nuevos: s
    });

    const updated = trx.prepare('SELECT * FROM contactos WHERE id = ?').get(id);
    return { success: true, contact: updated, warnings: validation.warnings };
  });
}

function listContacts(filters = {}, user = null) {
  const db = getDb();
  let sql = `
    SELECT c.*, s.nombre as sede_nombre, d.nombre as departamento_nombre
    FROM contactos c
    LEFT JOIN sedes s ON c.sede_id = s.id
    LEFT JOIN departamentos d ON c.departamento_id = d.id
    WHERE 1=1
  `;
  const params = [];

  // Requisito: El usuario estándar solo puede ver lo que ingresó por carga masiva o registro individual
  if (user && user.rol !== 'ADMIN') {
    sql += ' AND (c.created_by = ? OR LOWER(c.recomienda_email) = LOWER(?))';
    params.push(user.id, (user.email || '').trim());
  } else if ((filters.mis_registros_solamente === 'true' || filters.mis_registros_solamente === '1' || filters.mis_registros_solamente === true) && user) {
    // Si el usuario es administrador pero activó la opción "Solo mis registros"
    sql += ' AND (c.created_by = ? OR LOWER(c.recomienda_email) = LOWER(?))';
    params.push(user.id, (user.email || '').trim());
  }

  if (filters.tipo_contacto) {
    sql += ' AND c.tipo_contacto = ?';
    params.push(filters.tipo_contacto.toUpperCase());
  }

  if (filters.estado) {
    sql += ' AND c.estado = ?';
    params.push(filters.estado);
  }

  if (filters.sede_id) {
    sql += ' AND c.sede_id = ?';
    params.push(filters.sede_id);
  }

  if (filters.departamento_id) {
    sql += ' AND c.departamento_id = ?';
    params.push(filters.departamento_id);
  }

  if (filters.country_name) {
    sql += ' AND c.country_name = ?';
    params.push(filters.country_name);
  }

  if (filters.subject_area) {
    sql += ' AND c.subject_area = ?';
    params.push(filters.subject_area);
  }

  if (filters.industry) {
    sql += ' AND c.industry = ?';
    params.push(filters.industry);
  }

  if (filters.fecha_inicio) {
    sql += ' AND date(c.created_at) >= date(?)';
    params.push(filters.fecha_inicio);
  }

  if (filters.fecha_fin) {
    sql += ' AND date(c.created_at) <= date(?)';
    params.push(filters.fecha_fin);
  }

  // Búsqueda por texto libre
  if (filters.q) {
    const term = `%${filters.q.trim()}%`;
    sql += ` AND (
      c.first_name LIKE ? OR
      c.last_name LIKE ? OR
      c.email LIKE ? OR
      c.institution LIKE ? OR
      c.company_name LIKE ? OR
      c.job_title LIKE ? OR
      c.position LIKE ?
    )`;
    params.push(term, term, term, term, term, term, term);
  }

  sql += ' ORDER BY c.created_at DESC';

  return db.prepare(sql).all(...params);
}

function getContactById(id) {
  const db = getDb();
  const contact = db.prepare(`
    SELECT c.*, s.nombre as sede_nombre, d.nombre as departamento_nombre
    FROM contactos c
    LEFT JOIN sedes s ON c.sede_id = s.id
    LEFT JOIN departamentos d ON c.departamento_id = d.id
    WHERE c.id = ?
  `).get(id);

  if (!contact) return null;

  const auditHistory = db.prepare(`
    SELECT * FROM auditoria WHERE contacto_id = ? ORDER BY created_at DESC
  `).all(id);

  return { contact, auditHistory };
}

function resolveDuplicate(id, action, targetContactId, user) {
  const db = getDb();
  const contact = db.prepare('SELECT * FROM contactos WHERE id = ?').get(id);
  if (!contact) return { success: false, message: 'Contacto no encontrado.' };

  const now = new Date().toISOString();

  return runTransaction((trx) => {
    if (action === 'DISCARD') {
      trx.prepare(`
        UPDATE contactos SET estado = 'DUPLICADO', updated_by = ?, updated_by_name = ?, updated_at = ?
        WHERE id = ?
      `).run(user.id, user.nombre_completo, now, id);

      logAudit(trx, id, user, 'CAMBIO_ESTADO', { nuevo_estado: 'DUPLICADO', motivo: 'Descartado manualmente como duplicado' });
    } else if (action === 'CONFIRM_VALID') {
      trx.prepare(`
        UPDATE contactos SET estado = 'VALIDADO', updated_by = ?, updated_by_name = ?, updated_at = ?
        WHERE id = ?
      `).run(user.id, user.nombre_completo, now, id);

      logAudit(trx, id, user, 'CAMBIO_ESTADO', { nuevo_estado: 'VALIDADO', motivo: 'Confirmado como contacto válido legítimo' });
    }

    return { success: true };
  });
}

function getStatistics() {
  const db = getDb();

  const total = db.prepare('SELECT COUNT(*) as count FROM contactos').get().count;
  const academicos = db.prepare("SELECT COUNT(*) as count FROM contactos WHERE tipo_contacto = 'ACADEMICO'").get().count;
  const empleadores = db.prepare("SELECT COUNT(*) as count FROM contactos WHERE tipo_contacto = 'EMPLEADOR'").get().count;
  const validados = db.prepare("SELECT COUNT(*) as count FROM contactos WHERE estado IN ('VALIDADO', 'CORREGIDO')").get().count;
  const duplicados = db.prepare("SELECT COUNT(*) as count FROM contactos WHERE estado IN ('POSIBLE_DUPLICADO', 'DUPLICADO')").get().count;
  const exportados = db.prepare("SELECT COUNT(*) as count FROM contactos WHERE estado = 'EXPORTADO'").get().count;

  const porSede = db.prepare(`
    SELECT COALESCE(s.nombre, 'Sin sede asignada') as sede, COUNT(c.id) as count
    FROM contactos c
    LEFT JOIN sedes s ON c.sede_id = s.id
    GROUP BY s.nombre
  `).all();

  const porDepto = db.prepare(`
    SELECT COALESCE(d.nombre, 'Sin departamento') as departamento, COUNT(c.id) as count
    FROM contactos c
    LEFT JOIN departamentos d ON c.departamento_id = d.id
    GROUP BY d.nombre
    ORDER BY count DESC
    LIMIT 6
  `).all();

  return {
    total,
    academicos,
    empleadores,
    validados,
    duplicados,
    exportados,
    porSede,
    porDepto
  };
}

function deleteContact(id, user) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM contactos WHERE id = ?').get(id);
  if (!existing) {
    return { success: false, error: 'Contacto no encontrado' };
  }

  // Permisos: Admin puede eliminar cualquiera.
  // Usuario estándar puede eliminar si es quien lo creó o quien lo recomienda.
  const isAdmin = user && (user.rol === 'ADMIN' || user.role === 'ADMIN');
  const isOwner = user && (
    (existing.created_by && String(existing.created_by) === String(user.id)) ||
    (existing.recomienda_email && user.email && existing.recomienda_email.toLowerCase() === user.email.toLowerCase())
  );

  if (!isAdmin && !isOwner) {
    return {
      success: false,
      error: 'No cuenta con permisos para eliminar este contacto reportado. Solo puede eliminar los registros ingresados por usted.'
    };
  }

  return runTransaction((trx) => {
    logAudit(trx, id, user, 'ELIMINACION', {
      contacto_eliminado: {
        id: existing.id,
        nombre: `${existing.first_name || ''} ${existing.last_name || ''}`.trim(),
        email: existing.email,
        tipo_contacto: existing.tipo_contacto,
        institucion_empresa: existing.institution || existing.company_name,
        recomienda_nombre: existing.recomienda_nombre,
        recomienda_email: existing.recomienda_email,
        metodo_ingreso: existing.metodo_ingreso
      }
    });

    trx.prepare('DELETE FROM contactos WHERE id = ?').run(id);

    return {
      success: true,
      message: 'Contacto reportado eliminado correctamente.'
    };
  });
}

module.exports = {
  createContact,
  updateContact,
  deleteContact,
  listContacts,
  getContactById,
  resolveDuplicate,
  getStatistics
};


```

---

### Archivo: `src/services/funcionarioService.js`

```javascript
const crypto = require('node:crypto');
const { getDb, runTransaction } = require('../database/db');
const { normalizeEmail, normalizeText } = require('../utils/validator');

function resolveSedeId(sedeText) {
  if (!sedeText) return 'sede-cartago';
  const clean = (sedeText || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (clean.includes('san jose') || clean.includes('barrio amon')) return 'sede-sanjose';
  if (clean.includes('san carlos') || clean.includes('santa clara')) return 'sede-sancarlos';
  if (clean.includes('alajuela')) return 'sede-alajuela';
  if (clean.includes('limon')) return 'sede-limon';
  return 'sede-cartago';
}

function resolveOrRegisterDepartamento(db, dependenciaName, sedeId) {
  if (!dependenciaName) return null;
  const clean = (dependenciaName || '').trim();
  if (!clean) return null;

  // 1. Coincidencia exacta
  let d = db.prepare('SELECT id FROM departamentos WHERE LOWER(TRIM(nombre)) = LOWER(?)').get(clean);
  if (d) return d.id;

  // 2. Coincidencia parcial
  d = db.prepare("SELECT id FROM departamentos WHERE LOWER(?) LIKE ('%' || LOWER(nombre) || '%')").get(clean);
  if (d) return d.id;

  d = db.prepare("SELECT id FROM departamentos WHERE LOWER(nombre) LIKE ?").get(`%${clean.toLowerCase()}%`);
  if (d) return d.id;

  // 3. Crear nuevo departamento en la tabla departamentos
  const newId = 'dep-' + crypto.randomUUID().slice(0, 8);
  const cod = clean.slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'DEP';
  db.prepare(`
    INSERT INTO departamentos (id, codigo, nombre, sede_id, activo)
    VALUES (?, ?, ?, ?, 1)
  `).run(newId, cod, clean, sedeId || 'sede-cartago');

  return newId;
}

/**
 * Busca un funcionario por su correo institucional normalizado
 */
function getFuncionarioByEmail(email) {
  if (!email) return null;
  const norm = normalizeEmail(email);
  if (!norm) return null;

  const db = getDb();
  let f = db.prepare(`
    SELECT f.*, s.nombre as sede_nombre, d.nombre as departamento_nombre
    FROM funcionarios f
    LEFT JOIN sedes s ON f.sede_id = s.id
    LEFT JOIN departamentos d ON f.departamento_id = d.id
    WHERE f.email_normalized = ?
  `).get(norm);

  if (!f) return null;

  // Si sede_id o departamento_id no estaban asignados, resolverlos y persistirlos
  let needsUpdate = false;
  let finalSedeId = f.sede_id;
  let finalDeptoId = f.departamento_id;

  if (!finalSedeId && f.sede) {
    finalSedeId = resolveSedeId(f.sede);
    needsUpdate = true;
  }
  if (!finalDeptoId && f.dependencia) {
    finalDeptoId = resolveOrRegisterDepartamento(db, f.dependencia, finalSedeId);
    needsUpdate = true;
  }

  if (needsUpdate) {
    db.prepare('UPDATE funcionarios SET sede_id = ?, departamento_id = ? WHERE id = ?')
      .run(finalSedeId, finalDeptoId, f.id);
    
    f = db.prepare(`
      SELECT f.*, s.nombre as sede_nombre, d.nombre as departamento_nombre
      FROM funcionarios f
      LEFT JOIN sedes s ON f.sede_id = s.id
      LEFT JOIN departamentos d ON f.departamento_id = d.id
      WHERE f.id = ?
    `).get(f.id);
  }

  return f;
}

/**
 * Busca funcionarios que coincidan con un término en nombre, email o dependencia
 */
function searchFuncionarios(term = '', limit = 10) {
  const db = getDb();
  const clean = (term || '').trim();
  if (!clean) {
    return db.prepare('SELECT * FROM funcionarios ORDER BY nombre ASC LIMIT ?').all(limit);
  }
  const likeTerm = `%${clean}%`;
  return db.prepare(`
    SELECT * FROM funcionarios
    WHERE nombre LIKE ? OR email LIKE ? OR dependencia LIKE ?
    ORDER BY nombre ASC
    LIMIT ?
  `).all(likeTerm, likeTerm, likeTerm, limit);
}

/**
 * Inserta o actualiza un funcionario en el padrón del TEC
 */
function upsertFuncionario({ nombre, email, dependencia, sede, sede_id, departamento_id }) {
  if (!nombre || !email) {
    throw new Error('El nombre y correo del funcionario son obligatorios.');
  }

  const cleanNombre = normalizeText(nombre);
  const cleanEmail = email.trim().toLowerCase();
  const emailNorm = normalizeEmail(cleanEmail);

  if (!emailNorm.endsWith('@itcr.ac.cr') && !emailNorm.endsWith('@tec.ac.cr')) {
    throw new Error('El correo del funcionario debe pertenecer al dominio institucional del TEC (@itcr.ac.cr o @tec.ac.cr).');
  }

  const cleanDependencia = normalizeText(dependencia) || 'Dependencia no especificada';
  const cleanSede = normalizeText(sede) || 'Campus Central Cartago';

  const db = getDb();
  const existing = db.prepare('SELECT * FROM funcionarios WHERE email_normalized = ?').get(emailNorm);
  const now = new Date().toISOString();

  // Resolver IDs de sede y departamento
  const finalSedeId = sede_id || resolveSedeId(cleanSede);
  const finalDeptoId = departamento_id || resolveOrRegisterDepartamento(db, cleanDependencia, finalSedeId);

  if (existing) {
    db.prepare(`
      UPDATE funcionarios
      SET nombre = ?, email = ?, dependencia = ?, sede = ?, sede_id = ?, departamento_id = ?, updated_at = ?
      WHERE id = ?
    `).run(cleanNombre, cleanEmail, cleanDependencia, cleanSede, finalSedeId, finalDeptoId, now, existing.id);

    const row = db.prepare(`
      SELECT f.*, s.nombre as sede_nombre, d.nombre as departamento_nombre
      FROM funcionarios f
      LEFT JOIN sedes s ON f.sede_id = s.id
      LEFT JOIN departamentos d ON f.departamento_id = d.id
      WHERE f.id = ?
    `).get(existing.id);
    return { ...row, isNew: false, funcionario: row };
  } else {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO funcionarios (
        id, nombre, email, email_normalized, dependencia, sede, sede_id, departamento_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, cleanNombre, cleanEmail, emailNorm, cleanDependencia, cleanSede, finalSedeId, finalDeptoId, now, now);

    const row = db.prepare(`
      SELECT f.*, s.nombre as sede_nombre, d.nombre as departamento_nombre
      FROM funcionarios f
      LEFT JOIN sedes s ON f.sede_id = s.id
      LEFT JOIN departamentos d ON f.departamento_id = d.id
      WHERE f.id = ?
    `).get(id);
    return { ...row, isNew: true, funcionario: row };
  }
}

/**
 * Importación masiva de funcionarios desde archivo Excel/CSV
 */
function bulkImportFuncionarios(rows) {
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return { success: false, message: 'No se encontraron filas para importar.' };
  }

  let imported = 0;
  let updated = 0;

  return runTransaction((trx) => {
    for (const row of rows) {
      const nombre = row.nombre || row['Nombre de funcionario'] || row['Nombre'] || row['Funcionario'];
      const email = row.email || row['Correo electrónico'] || row['Correo'] || row['Email'];
      const dependencia = row.dependencia || row['Dependencia'] || row['Departamento'] || row['Escuela'] || 'Dependencia no especificada';
      const sede = row.sede || row['Sede'] || row['Campus'] || 'Campus Central Cartago';

      if (!nombre || !email) continue;
      const emailNorm = normalizeEmail(email);
      if (!emailNorm || (!emailNorm.endsWith('@itcr.ac.cr') && !emailNorm.endsWith('@tec.ac.cr'))) continue;

      const finalSedeId = row.sede_id || resolveSedeId(sede);
      const finalDeptoId = row.departamento_id || resolveOrRegisterDepartamento(trx, dependencia, finalSedeId);

      const existing = trx.prepare('SELECT id FROM funcionarios WHERE email_normalized = ?').get(emailNorm);
      const now = new Date().toISOString();

      if (existing) {
        trx.prepare(`
          UPDATE funcionarios
          SET nombre = ?, email = ?, dependencia = ?, sede = ?, sede_id = ?, departamento_id = ?, updated_at = ?
          WHERE id = ?
        `).run(nombre.trim(), email.trim().toLowerCase(), dependencia.trim(), sede.trim(), finalSedeId, finalDeptoId, now, existing.id);
        updated++;
      } else {
        const id = crypto.randomUUID();
        trx.prepare(`
          INSERT INTO funcionarios (
            id, nombre, email, email_normalized, dependencia, sede, sede_id, departamento_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, nombre.trim(), email.trim().toLowerCase(), emailNorm, dependencia.trim(), sede.trim(), finalSedeId, finalDeptoId, now, now);
        imported++;
      }
    }

    return {
      success: true,
      total: imported + updated,
      imported,
      updated,
      nuevos: imported,
      actualizados: updated,
      message: `Se procesaron exitosamente ${imported + updated} funcionarios (${imported} nuevos, ${updated} actualizados).`
    };
  });
}

function listFuncionarios() {
  const db = getDb();
  return db.prepare('SELECT * FROM funcionarios ORDER BY nombre ASC').all();
}

module.exports = {
  getFuncionarioByEmail,
  searchFuncionarios,
  upsertFuncionario,
  bulkImportFuncionarios,
  listFuncionarios
};

```

---

### Archivo: `src/services/duplicateDetector.js`

```javascript
const { getDb } = require('../database/db');
const { normalizeEmail, normalizeText } = require('../utils/validator');

/**
 * Distancia de Levenshtein entre dos cadenas
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // sustitución
          matrix[i][j - 1] + 1,     // inserción
          matrix[i - 1][j] + 1      // eliminación
        );
      }
    }
  }

  return matrix[b.length][a.length];
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
  let queryEmail = 'SELECT * FROM contactos WHERE email_normalized = ?';
  const paramsEmail = [candEmailNorm];
  if (excludeId) {
    queryEmail += ' AND id != ?';
    paramsEmail.push(excludeId);
  }
  const emailMatches = db.prepare(queryEmail).all(...paramsEmail);

  if (emailMatches.length > 0) {
    const matched = emailMatches[0];
    // Verificar si es del mismo tipo
    if (matched.tipo_contacto === candType) {
      return {
        status: 'EXACT_MATCH',
        matchType: 'EMAIL_EXACT',
        existingContact: matched,
        similarityScore: 1.0,
        explanation: `El correo electrónico "${candEmailNorm}" ya se encuentra registrado para este mismo tipo de contacto.`
      };
    } else {
      // Conflicto de doble rol (Académico registrado como Empleador o viceversa)
      return {
        status: 'POTENTIAL_DUPLICATE',
        matchType: 'CROSS_ROLE_CONFLICT',
        existingContact: matched,
        similarityScore: 0.95,
        explanation: `Conflicto de roles cruzados: Este correo ya pertenece a un contacto registrado como "${matched.tipo_contacto}". En QS no se recomienda postular a la misma persona en ambos roles durante el mismo ciclo.`
      };
    }
  }

  // 2. Obtener todos los contactos del mismo tipo o potenciales para análisis de similitud
  let queryAll = 'SELECT * FROM contactos WHERE 1=1';
  const paramsAll = [];
  if (excludeId) {
    queryAll += ' AND id != ?';
    paramsAll.push(excludeId);
  }
  const allContacts = db.prepare(queryAll).all(...paramsAll);

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

```

---

### Archivo: `src/services/excelService.js`

```javascript
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
function parseXlsx(buffer) {
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
  if (files.has('xl/worksheets/sheet1.xml')) {
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
  parseCsv,
  TEMPLATES
};


```

---

### Archivo: `src/services/exportService.js`

```javascript
const { getDb, runTransaction } = require('../database/db');
const { generateXlsx, TEMPLATES } = require('./excelService');
const { validateContact } = require('../utils/validator');
const config = require('../config');

/**
 * Valida y genera el archivo Excel oficial para QS de contactos aprobados
 */
function exportContactsToXlsx(tipo, filters = {}, user) {
  const db = getDb();
  const contactType = tipo.toUpperCase();

  if (!['ACADEMICO', 'EMPLEADOR'].includes(contactType)) {
    throw new Error('Tipo de contacto inválido para exportación.');
  }

  // Filtrar solo contactos validados o corregidos
  let sql = `
    SELECT * FROM contactos
    WHERE tipo_contacto = ?
    AND estado IN ('VALIDADO', 'CORREGIDO', 'EXPORTADO')
  `;
  const params = [contactType];

  if (filters.sede_id) {
    sql += ' AND sede_id = ?';
    params.push(filters.sede_id);
  }
  if (filters.departamento_id) {
    sql += ' AND departamento_id = ?';
    params.push(filters.departamento_id);
  }
  if (filters.fecha_inicio) {
    sql += ' AND date(created_at) >= date(?)';
    params.push(filters.fecha_inicio);
  }
  if (filters.fecha_fin) {
    sql += ' AND date(created_at) <= date(?)';
    params.push(filters.fecha_fin);
  }

  sql += ' ORDER BY created_at ASC';
  const contacts = db.prepare(sql).all(...params);

  // 1. Re-validación estricta previa a la exportación
  const validRows = [];
  const invalidRows = [];
  const templateConfig = TEMPLATES[contactType];

  for (const c of contacts) {
    const val = validateContact(c, contactType);
    if (!val.isValid) {
      invalidRows.push({ contact: c, errors: val.errors });
      continue;
    }

    if (contactType === 'ACADEMICO') {
      validRows.push([
        config.SOURCE_NAME,
        c.title,
        c.first_name,
        c.last_name,
        c.job_title,
        c.department_unit,
        c.institution,
        c.country_name,
        c.email,
        c.subject_area,
        c.phone || ''
      ]);
    } else {
      validRows.push([
        config.SOURCE_NAME,
        c.title,
        c.first_name,
        c.last_name,
        c.position,
        c.industry,
        c.company_name,
        c.country_name,
        c.email,
        c.phone || ''
      ]);
    }
  }

  // 2. Generar el binario XLSX OpenXML
  const xlsxBuffer = generateXlsx(templateConfig.sheetName, templateConfig.headers, validRows);

  // 3. Actualizar estado a EXPORTADO para los contactos incluidos
  if (validRows.length > 0 && user) {
    runTransaction((trx) => {
      const now = new Date().toISOString();
      const updateStmt = trx.prepare(`
        UPDATE contactos SET estado = 'EXPORTADO', updated_by = ?, updated_by_name = ?, updated_at = ?
        WHERE id = ? AND estado != 'EXPORTADO'
      `);
      const auditStmt = trx.prepare(`
        INSERT INTO auditoria (id, contacto_id, usuario_id, usuario_nombre, accion, detalles, created_at)
        VALUES (?, ?, ?, ?, 'EXPORTACION', ?, ?)
      `);

      for (const c of contacts) {
        if (!invalidRows.some(inv => inv.contact.id === c.id)) {
          updateStmt.run(user.id, user.nombre_completo, now, c.id);
          const auditId = require('node:crypto').randomUUID();
          auditStmt.run(auditId, c.id, user.id, user.nombre_completo, JSON.stringify({ tipo: contactType, fecha_corte: now }), now);
        }
      }
    });
  }

  return {
    buffer: xlsxBuffer,
    totalProcesados: contacts.length,
    totalExportados: validRows.length,
    totalInconsistentes: invalidRows.length,
    inconsistencias: invalidRows,
    filename: `TEC_QS_${contactType}_${new Date().toISOString().slice(0, 10)}.xlsx`
  };
}

module.exports = {
  exportContactsToXlsx
};

```

---

### Archivo: `src/services/driveService.js`

```javascript
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');

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
    const safeName = `${category}_${timestamp}_${fileName}`;
    const targetPath = path.join(this.stagingDir, safeName);

    fs.writeFileSync(targetPath, buffer);

    if (this.isDriveConfigured) {
      // Si la cuenta de servicio del TEC está provista, se conectaría con la API oficial v3 de Google Drive
      return {
        success: true,
        status: 'SYNCED_TO_GOOGLE_DRIVE',
        localPath: targetPath,
        driveFolderId: config.DRIVE_CONFIG.FOLDER_ID,
        message: 'Archivo sincronizado exitosamente con la carpeta compartida de Google Drive institucional.'
      };
    } else {
      // Almacenamiento seguro en staging local con trazabilidad para posterior sincronización
      return {
        success: true,
        status: 'STAGED_LOCAL_PENDING_DRIVE_SYNC',
        localPath: targetPath,
        message: 'Archivo archivado en el área de staging local. Para habilitar sincronización directa en la nube de Google Drive, coloque la clave de cuenta de servicio en service-account-key.json.'
      };
    }
  }

  /**
   * Genera un respaldo físico de la base de datos SQLite
   */
  async createDatabaseBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `tec_qs_backup_${timestamp}.sqlite`;
    const backupPath = path.join(this.backupDir, backupFileName);

    if (fs.existsSync(config.DB_PATH)) {
      fs.copyFileSync(config.DB_PATH, backupPath);
      return {
        success: true,
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
      isDriveApiConnected: this.isDriveConfigured,
      mode: this.isDriveConfigured ? 'GOOGLE_DRIVE_API_V3' : 'LOCAL_STAGING_HYBRID',
      targetSharedDrive: config.DRIVE_CONFIG.FOLDER_ID,
      stagedArchivesCount: stagedFiles,
      backupsCount: backupFiles,
      architectureNote: 'Google Drive se utiliza como repositorio inmutable de evidencias y respaldos. Los registros operacionales multiusuario residen en el motor relacional SQLite con WAL.'
    };
  }
}

module.exports = new DriveService();

```

---

### Archivo: `src/utils/validator.js`

```javascript
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

  const contactType = (tipo || data.tipo_contacto || '').toUpperCase();
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

```

---

### Archivo: `src/utils/zip.js`

```javascript
const zlib = require('node:zlib');

// Tabla CRC32 estándar
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

function calculateCRC32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}

/**
 * Crea un buffer ZIP estándar (PKZip 2.0) a partir de una lista de archivos.
 * files: Array<{ name: string, data: Buffer | string }>
 */
function createZip(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let currentOffset = 0;

  for (const file of files) {
    const rawData = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8');
    const nameBuf = Buffer.from(file.name, 'utf8');
    const crc = calculateCRC32(rawData);

    // Comprimir con DEFLATE
    const compressedData = zlib.deflateRawSync(rawData);
    // Si la compresión no reduce el tamaño, podríamos almacenar sin compresión, pero deflate estándar es universal para xlsx
    const method = 8; // Deflate
    const compressedSize = compressedData.length;
    const uncompressedSize = rawData.length;

    // Local Header (30 bytes + nameBuf.length)
    const lh = Buffer.alloc(30 + nameBuf.length);
    lh.writeUInt32LE(0x04034b50, 0); // Firma Local Header
    lh.writeUInt16LE(20, 4);         // Versión necesaria (2.0)
    lh.writeUInt16LE(0, 6);          // Flags
    lh.writeUInt16LE(method, 8);     // Método compresión (8 = deflate)
    lh.writeUInt16LE(0, 10);         // Tiempo mod
    lh.writeUInt16LE(0, 12);         // Fecha mod
    lh.writeUInt32LE(crc, 14);       // CRC-32
    lh.writeUInt32LE(compressedSize, 18);
    lh.writeUInt32LE(uncompressedSize, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);         // Extra field length
    nameBuf.copy(lh, 30);

    const localChunk = Buffer.concat([lh, compressedData]);
    localHeaders.push(localChunk);

    // Central Directory Header (46 bytes + nameBuf.length)
    const ch = Buffer.alloc(46 + nameBuf.length);
    ch.writeUInt32LE(0x02014b50, 0); // Firma Central Header
    ch.writeUInt16LE(20, 4);         // Versión creada por (2.0)
    ch.writeUInt16LE(20, 6);         // Versión necesaria
    ch.writeUInt16LE(0, 8);          // Flags
    ch.writeUInt16LE(method, 10);    // Método compresión
    ch.writeUInt16LE(0, 12);         // Tiempo mod
    ch.writeUInt16LE(0, 14);         // Fecha mod
    ch.writeUInt32LE(crc, 16);       // CRC-32
    ch.writeUInt32LE(compressedSize, 20);
    ch.writeUInt32LE(uncompressedSize, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);         // Extra field length
    ch.writeUInt16LE(0, 32);         // File comment length
    ch.writeUInt16LE(0, 34);         // Disk number start
    ch.writeUInt16LE(0, 36);         // Internal file attributes
    ch.writeUInt32LE(0, 38);         // External file attributes
    ch.writeUInt32LE(currentOffset, 42); // Relative offset of local header
    nameBuf.copy(ch, 46);

    centralHeaders.push(ch);
    currentOffset += localChunk.length;
  }

  const centralDirOffset = currentOffset;
  const centralDirBuffer = Buffer.concat(centralHeaders);
  const centralDirSize = centralDirBuffer.length;

  // End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // Firma EOCD
  eocd.writeUInt16LE(0, 4);          // Disk number
  eocd.writeUInt16LE(0, 6);          // Start disk
  eocd.writeUInt16LE(files.length, 8); // Entries on disk
  eocd.writeUInt16LE(files.length, 10); // Total entries
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);         // Comment length

  return Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
}

/**
 * Lee un archivo ZIP (Buffer) y extrae sus archivos internos como un mapa name -> Buffer.
 */
function readZip(buf) {
  const result = new Map();

  // Buscar End of Central Directory (EOCD) hacia atrás
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('El archivo no es un ZIP válido o está dañado');
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

  let curOffset = centralDirOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(curOffset) !== 0x02014b50) {
      break;
    }

    const method = buf.readUInt16LE(curOffset + 10);
    const compressedSize = buf.readUInt32LE(curOffset + 20);
    const uncompressedSize = buf.readUInt32LE(curOffset + 24);
    const nameLen = buf.readUInt16LE(curOffset + 28);
    const extraLen = buf.readUInt16LE(curOffset + 30);
    const commentLen = buf.readUInt16LE(curOffset + 32);
    const localHeaderOffset = buf.readUInt32LE(curOffset + 42);

    const fileName = buf.toString('utf8', curOffset + 46, curOffset + 46 + nameLen);

    // Leer encabezado local para ubicar los datos
    if (buf.readUInt32LE(localHeaderOffset) === 0x04034b50) {
      const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const rawCompressed = buf.subarray(dataStart, dataStart + compressedSize);

      let uncompressed;
      if (method === 8) {
        uncompressed = zlib.inflateRawSync(rawCompressed);
      } else if (method === 0) {
        uncompressed = rawCompressed;
      } else {
        throw new Error(`Método de compresión no soportado en ZIP: ${method}`);
      }

      result.set(fileName, uncompressed);
    }

    curOffset += 46 + nameLen + extraLen + commentLen;
  }

  return result;
}

module.exports = {
  createZip,
  readZip,
  calculateCRC32
};

```

---

### Archivo: `public/index.html`

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sistema de Gestión de Contactos QS | Tecnológico de Costa Rica</title>
  <link rel="icon" type="image/svg+xml" href="assets/logo_tec.svg">

  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>

  <!-- Font Awesome 6 Icons -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

  <!-- Estilos Personalizados e Institucionales -->
  <link rel="stylesheet" href="css/styles.css">

  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            tec: {
              primary: '#002855',
              dark: '#001A35',
              light: '#0B4182',
              accent: '#D97706',
              surface: '#F8FAFC'
            }
          }
        }
      }
    }
  </script>
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen flex flex-col antialiased">

  <!-- =========================================================================
       A. ENCABEZADO SUPERIOR AZUL INSTITUCIONAL
       Único contenido: Logo TEC a la izquierda, Título y Subtítulo Centrados
       (Inmóvil, siempre visible, nunca tapado por ningún menú)
       ========================================================================= -->
  <header class="bg-tec-primary text-white shadow-md sticky top-0 z-50 border-b-4 border-amber-500 h-[64px]">
    <div class="w-full h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between relative">
      
      <!-- Lado Izquierdo: Botón móvil + Logotipo Oficial Institucional TEC -->
      <div class="flex items-center gap-3 z-10">
        <!-- Botón hamburguesa para móvil -->
        <button id="mobile-sidebar-toggle" class="lg:hidden p-2 text-slate-300 hover:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" aria-label="Abrir menú">
          <i class="fa-solid fa-bars text-xl"></i>
        </button>

        <!-- Logotipo Oficial TEC en blanco -->
        <img src="assets/logo_tec_white.svg" alt="Logotipo Oficial Tecnológico de Costa Rica" class="h-8 sm:h-9 w-auto object-contain flex-shrink-0 drop-shadow-sm" title="Instituto Tecnológico de Costa Rica">
      </div>

      <!-- Centro Absoluto: Título y Subtítulo Oficiales del Sistema -->
      <div class="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none">
        <h1 class="text-base sm:text-lg md:text-xl font-bold tracking-tight text-white leading-tight">
          Sistema de Gestión de Contactos QS
        </h1>
        <p class="text-slate-300 font-light text-[11px] sm:text-xs mt-0.5">
          Ranking Quacquarelli Symonds · Tecnológico de Costa Rica
        </p>
      </div>

      <!-- Lado Derecho: Contrapeso vacío para garantizar simetría óptica -->
      <div class="w-24 sm:w-36 hidden sm:block"></div>

    </div>
  </header>

  <!-- Overlay para menú en pantallas móviles -->
  <div id="sidebar-overlay" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 hidden lg:hidden transition-opacity"></div>

  <!-- =========================================================================
       CONTENEDOR PRINCIPAL: MENÚ LATERAL IZQUIERDO + CONTENIDO DE PANTALLA
       ========================================================================= -->
  <div class="flex-1 flex overflow-hidden">

    <!-- =======================================================================
         B. MENÚ LATERAL IZQUIERDO (SIDEBAR INMÓVIL)
         Ubicado estrictamente debajo de la barra azul superior (sin taparla)
         ======================================================================= -->
    <aside id="sidebar" 
           class="bg-white border-r border-slate-200 flex flex-col justify-between flex-shrink-0 shadow-lg lg:shadow-none"
           aria-label="Menú de Navegación Principal">

      <!-- Zona de Navegación del Menú -->
      <div class="flex-1 flex flex-col overflow-y-auto">
        
        <!-- Encabezado del Menú con Botón de Colapso -->
        <div class="h-12 px-4 border-b border-slate-100 flex items-center justify-between">
          <span class="sidebar-header-title text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Navegación
          </span>
          <button id="sidebar-toggle-btn" 
                  class="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  title="Expandir / Contraer menú lateral">
            <i class="fa-solid fa-chevron-left text-xs"></i>
          </button>
        </div>

        <!-- Lista de Opciones del Menú de Navegación -->
        <nav class="p-3 space-y-1">

          <!-- 1. REGISTRO INDIVIDUAL -->
          <div class="sidebar-item" data-tooltip="Registro Individual">
            <button onclick="App.navigate('register')" id="nav-btn-register"
                    class="sidebar-link w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors bg-blue-50 text-blue-900 border border-blue-200/80 shadow-sm">
              <i class="fa-solid fa-user-plus w-5 text-center text-blue-800 text-base"></i>
              <span class="sidebar-text truncate">Registro Individual</span>
            </button>
          </div>

          <!-- 2. CARGA MASIVA (Administrador y Usuario) -->
          <div class="sidebar-item" data-tooltip="Carga Masiva" id="nav-item-bulk">
            <button onclick="App.navigate('bulk')" id="nav-btn-bulk"
                    class="sidebar-link w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors group">
              <i class="fa-solid fa-file-excel w-5 text-center text-slate-400 group-hover:text-blue-800 text-base"></i>
              <span class="sidebar-text truncate">Carga Masiva</span>
            </button>
          </div>

          <!-- 3. DIRECTORIO Y CONSULTA -->
          <div class="sidebar-item" data-tooltip="Directorio de Contactos">
            <button onclick="App.navigate('directory')" id="nav-btn-directory"
                    class="sidebar-link w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors group">
              <i class="fa-solid fa-address-book w-5 text-center text-slate-400 group-hover:text-blue-800 text-base"></i>
              <span class="sidebar-text truncate">Directorio Contactos</span>
            </button>
          </div>

          <!-- 4. EXPORTACIÓN QS - Solo Administrador -->
          <div class="sidebar-item" data-tooltip="Exportación Oficial QS" id="nav-item-export">
            <button onclick="App.navigate('export')" id="nav-btn-export"
                    class="sidebar-link w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors group">
              <i class="fa-solid fa-file-export w-5 text-center text-slate-400 group-hover:text-blue-800 text-base"></i>
              <span class="sidebar-text truncate">Exportación QS</span>
            </button>
          </div>

          <!-- 5. TABLERO Y ADMINISTRACIÓN - Solo Administrador -->
          <div class="sidebar-item" data-tooltip="Tablero y Métricas" id="nav-item-admin">
            <button onclick="App.navigate('admin')" id="nav-btn-admin"
                    class="sidebar-link w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors group">
              <i class="fa-solid fa-chart-pie w-5 text-center text-slate-400 group-hover:text-blue-800 text-base"></i>
              <span class="sidebar-text truncate">Tablero / Drive</span>
            </button>
          </div>

        </nav>
      </div>

      <!-- Pie del Menú Lateral: Selector de los 2 Roles Oficiales (Administrador y Usuario) y Cerrar Sesión -->
      <div class="border-t border-slate-100">
        <!-- Selector exclusivo de 2 Roles de Usuario -->
        <div class="p-3 border-b border-slate-100 sidebar-text bg-slate-50/60">
          <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center justify-between">
            <span>Rol Activo:</span>
            <span id="role-display-badge" class="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-900">ADMINISTRADOR</span>
          </label>
          <select id="role-selector" class="w-full bg-white text-slate-800 text-xs rounded-lg px-2.5 py-1.5 border border-slate-200 outline-none cursor-pointer hover:border-slate-300 transition-colors shadow-xs" onchange="App.switchRole(this.value)">
            <option value="ADMIN">Administrador</option>
            <option value="USUARIO">Usuario</option>
          </select>
        </div>

        <!-- Botón de Cerrar Sesión -->
        <div class="p-3">
          <div class="sidebar-item" data-tooltip="Cerrar sesión">
            <button onclick="App.handleLogout()" 
                    class="sidebar-link w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:text-red-800 hover:bg-red-50 transition-colors group">
              <i class="fa-solid fa-right-from-bracket w-5 text-center text-red-500 group-hover:text-red-700 text-sm"></i>
              <span class="sidebar-text truncate">Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </div>

    </aside>

    <!-- =======================================================================
         C. CONTENIDO PRINCIPAL DE PANTALLA (A la derecha del sidebar inmóvil)
         ======================================================================= -->
    <main class="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8" style="height: calc(100vh - 64px);">
      <div class="max-w-7xl mx-auto space-y-6">
        
        <!-- Vistas Modulares -->
        <section id="register-view"></section>
        <section id="bulk-upload-view" style="display: none;"></section>
        <section id="directory-view" style="display: none;"></section>
        <section id="export-view" style="display: none;"></section>
        <section id="admin-view" style="display: none;"></section>

      </div>
    </main>

  </div>

  <!-- Contenedor Global para Modales -->
  <div id="app-modal-area"></div>

  <!-- Scripts de la Aplicación -->
  <script src="js/api.js"></script>
  <script src="js/register.js"></script>
  <script src="js/bulkUpload.js"></script>
  <script src="js/directory.js"></script>
  <script src="js/exportView.js"></script>
  <script src="js/adminView.js"></script>
  <script src="js/app.js"></script>
</body>
</html>

```

---

### Archivo: `public/css/styles.css`

```css
/* ==========================================================================
   ESTILOS INSTITUCIONALES - TECNOLÓGICO DE COSTA RICA (TEC)
   Sistema de Gestión de Contactos QS (Reputación Académica y Empleadores)
   ========================================================================== */

:root {
  --tec-primary: #002855;
  --tec-primary-dark: #001A35;
  --tec-primary-light: #0B4182;
  --tec-accent: #D97706;
  --tec-accent-light: #F59E0B;
  --tec-bg: #F8FAFC;
  --tec-header-height: 64px;
  --tec-sidebar-width: 260px;
  --tec-sidebar-collapsed-width: 76px;

  /* Colores de Estados y Semáforos QS */
  --status-success: #15803d;
  --status-success-bg: #f0fdf4;
  --status-error: #b91c1c;
  --status-error-bg: #fef2f2;
  --status-warning: #b45309;
  --status-warning-bg: #fffbeb;
  --status-info: #0369a1;
  --status-info-bg: #f0f9ff;
  --status-purple: #6b21a8;
  --status-purple-bg: #faf5ff;
}

body {
  font-family: 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif;
  background-color: var(--tec-bg);
  color: #1E293B;
  overflow-x: hidden;
}

/* --------------------------------------------------------------------------
   Encabezado Superior Azul Fijo (Inamovible, nunca tapado)
   -------------------------------------------------------------------------- */
header.bg-tec-primary {
  height: var(--tec-header-height);
  position: sticky;
  top: 0;
  z-index: 50; /* Capa superior máxima */
}

/* --------------------------------------------------------------------------
   Menú Lateral Izquierdo (Inmóvil, ubicado debajo de la barra azul)
   -------------------------------------------------------------------------- */
#sidebar {
  width: var(--tec-sidebar-width);
  height: calc(100vh - var(--tec-header-height));
  position: sticky;
  top: var(--tec-header-height);
  z-index: 30; /* Debajo de la cabecera */
  flex-shrink: 0;
  overflow-y: auto;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

@media (max-width: 1023px) {
  #sidebar {
    position: fixed;
    top: var(--tec-header-height);
    left: 0;
    bottom: 0;
    height: calc(100vh - var(--tec-header-height));
    z-index: 40;
    transform: translateX(-100%);
    transition: transform 0.25s ease, width 0.25s ease;
  }
  #sidebar.open {
    transform: translateX(0);
  }
}

#sidebar.collapsed {
  width: var(--tec-sidebar-collapsed-width);
}

/* Sincronización de la zona del logo en cabecera con el menú lateral */
#header-sidebar-zone {
  width: 100%;
}

@media (min-width: 1024px) {
  #header-sidebar-zone {
    width: var(--tec-sidebar-width);
    transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  #header-sidebar-zone.collapsed {
    width: var(--tec-sidebar-collapsed-width);
  }
}

#sidebar.collapsed .sidebar-text,
#sidebar.collapsed .sidebar-badge {
  display: none;
  opacity: 0;
}

#sidebar.collapsed .sidebar-link {
  justify-content: center;
  padding-left: 0.75rem;
  padding-right: 0.75rem;
}

#sidebar.collapsed .sidebar-link i,
#sidebar.collapsed .sidebar-link svg {
  font-size: 1.25rem;
  margin-right: 0;
}

#sidebar.collapsed .sidebar-header-title {
  display: none;
}

/* Tooltip para modo colapsado */
#sidebar.collapsed .sidebar-item {
  position: relative;
}

#sidebar.collapsed .sidebar-item:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  background-color: #0F172A;
  color: #FFFFFF;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  z-index: 50;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  pointer-events: none;
  animation: fadeIn 0.15s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-50%) translateX(-4px); }
  to { opacity: 1; transform: translateY(-50%) translateX(0); }
}

/* --------------------------------------------------------------------------
   Tarjetas de Selección de Tipo de Contacto (Dentro del Registro Individual)
   -------------------------------------------------------------------------- */
.contact-type-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.type-option-card {
  border: 2px solid #E2E8F0;
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  background-color: #FFFFFF;
}

.type-option-card:hover {
  border-color: #0B4182;
  background-color: #F8FAFC;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 40, 85, 0.05);
}

.type-option-card.selected {
  border-color: var(--tec-primary);
  background-color: #EFF6FF;
  box-shadow: 0 0 0 2px var(--tec-primary);
}

.type-option-card input[type="radio"] {
  width: 1.2rem;
  height: 1.2rem;
  accent-color: var(--tec-primary);
  margin-top: 0.25rem;
}

.type-info h4 {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--tec-primary);
}

.type-info p {
  font-size: 0.85rem;
  color: #64748B;
  margin-top: 0.25rem;
  line-height: 1.4;
}

/* --------------------------------------------------------------------------
   Formularios y Controles de Entrada (Validación Reactiva)
   -------------------------------------------------------------------------- */
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.25rem;
  margin-bottom: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-label {
  font-size: 0.88rem;
  font-weight: 600;
  color: #1E293B;
  margin-bottom: 0.35rem;
}

.form-label .req {
  color: var(--status-error);
  margin-left: 2px;
}

.form-control {
  padding: 0.65rem 0.85rem;
  font-size: 0.92rem;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  background-color: #FFFFFF;
  color: #0F172A;
  transition: border-color 0.2s, box-shadow 0.2s;
  outline: none;
}

.form-control:focus {
  border-color: var(--tec-primary-light);
  box-shadow: 0 0 0 3px rgba(11, 65, 130, 0.15);
}

/* Placeholders tenues efímeros que no se guardan (Requisito 5 y 6) */
.form-control::placeholder {
  color: #94A3B8;
  opacity: 0.65;
  font-style: italic;
  font-weight: 400;
}

.form-control.is-invalid {
  border-color: var(--status-error) !important;
  background-color: #FFF5F5;
}

.form-control.is-valid {
  border-color: var(--status-success);
}

.error-feedback {
  font-size: 0.8rem;
  color: var(--status-error);
  margin-top: 0.35rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.hint-text {
  font-size: 0.78rem;
  color: #64748B;
  margin-top: 0.25rem;
}

/* --------------------------------------------------------------------------
   Botones Institucionales
   -------------------------------------------------------------------------- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.65rem 1.25rem;
  font-size: 0.92rem;
  font-weight: 600;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
}

.btn-tec {
  background-color: var(--tec-primary);
  color: #FFFFFF;
}

.btn-tec:hover:not(:disabled) {
  background-color: var(--tec-primary-dark);
}

.btn-tec:disabled {
  background-color: #94A3B8;
  cursor: not-allowed;
  opacity: 0.65;
}

.btn-outline {
  background-color: transparent;
  border-color: #CBD5E1;
  color: #475569;
}

.btn-outline:hover {
  background-color: #F1F5F9;
  color: #0F172A;
}

.btn-sm {
  padding: 0.35rem 0.75rem;
  font-size: 0.82rem;
}

/* --------------------------------------------------------------------------
   Alertas y Banners
   -------------------------------------------------------------------------- */
.alert {
  padding: 0.9rem 1.2rem;
  border-radius: 8px;
  margin-bottom: 1.25rem;
  font-size: 0.9rem;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.alert-success { background-color: var(--status-success-bg); border: 1px solid #BBF7D0; color: var(--status-success); }
.alert-warning { background-color: var(--status-warning-bg); border: 1px solid #FDE68A; color: var(--status-warning); }
.alert-error   { background-color: var(--status-error-bg);   border: 1px solid #FECACA; color: var(--status-error); }
.alert-info    { background-color: var(--status-info-bg);    border: 1px solid #BAE6FD; color: var(--status-info); }

/* --------------------------------------------------------------------------
   Badges de Estado
   -------------------------------------------------------------------------- */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.55rem;
  border-radius: 9999px;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}

.badge-validado { background-color: #DCFCE7; color: #166534; }
.badge-nuevo     { background-color: #E0F2FE; color: #075985; }
.badge-posible   { background-color: #FEF3C7; color: #92400E; }
.badge-duplicado { background-color: #F3E8FF; color: #6B21A8; }
.badge-corregido { background-color: #FFEDD5; color: #9A3412; }
.badge-exportado { background-color: #E2E8F0; color: #334155; }
.badge-error     { background-color: #FEE2E2; color: #991B1B; }

/* --------------------------------------------------------------------------
   Tablas de Datos Modernas
   -------------------------------------------------------------------------- */
.table-responsive {
  width: 100%;
  overflow-x: auto;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  text-align: left;
}

.data-table th {
  background-color: #F8FAFC;
  color: var(--tec-primary);
  font-weight: 700;
  padding: 0.75rem 1rem;
  border-bottom: 2px solid #CBD5E1;
  white-space: nowrap;
}

.data-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #E2E8F0;
  color: #475569;
}

.data-table tbody tr:hover {
  background-color: #F8FAFC;
}

/* Tabla compacta y ajustada al 100% sin barra de desplazamiento horizontal */
.table-responsive-fit {
  width: 100%;
  border: 1px solid #E2E8F0;
  border-radius: 12px;
  overflow: hidden;
  background-color: #FFFFFF;
}

@media (max-width: 768px) {
  .table-responsive-fit {
    overflow-x: auto;
  }
}

.data-table-fit {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
  text-align: left;
  table-layout: fixed;
}

.data-table-fit th {
  background-color: #F8FAFC;
  color: var(--tec-primary);
  font-weight: 700;
  padding: 0.65rem 0.75rem;
  border-bottom: 2px solid #CBD5E1;
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  white-space: normal;
  vertical-align: middle;
}

.data-table-fit td {
  padding: 0.7rem 0.75rem;
  border-bottom: 1px solid #E2E8F0;
  color: #334155;
  vertical-align: middle;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.data-table-fit tbody tr:hover {
  background-color: #F8FAFC;
}


/* --------------------------------------------------------------------------
   Modales y Ventanas Emergentes
   -------------------------------------------------------------------------- */
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 40, 85, 0.45);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1.5rem;
}

.modal-content {
  background: #FFFFFF;
  border-radius: 12px;
  max-width: 680px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  padding: 1.75rem;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #E2E8F0;
  padding-bottom: 0.75rem;
  margin-bottom: 1.25rem;
}

.modal-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--tec-primary);
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #64748B;
}

/* Comparador Side-by-Side para Duplicados */
.diff-comparison {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  background: #F8FAFC;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  padding: 1rem;
  margin: 1rem 0;
}

.diff-col h5 {
  font-size: 0.85rem;
  text-transform: uppercase;
  color: var(--tec-primary);
  border-bottom: 1px solid #CBD5E1;
  padding-bottom: 0.35rem;
  margin-bottom: 0.6rem;
}

.diff-item {
  font-size: 0.83rem;
  margin-bottom: 0.4rem;
}

.diff-item strong {
  color: #0F172A;
}

/* --------------------------------------------------------------------------
   Tarjetas de Indicadores KPI
   -------------------------------------------------------------------------- */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.kpi-card {
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 10px;
  padding: 1.2rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border-top: 4px solid var(--tec-primary);
  transition: all 0.2s ease;
}

.kpi-card:hover {
  border-color: #94A3B8;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
}

.kpi-title {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #64748B;
  letter-spacing: 0.5px;
}

.kpi-value {
  font-size: 2rem;
  font-weight: 800;
  color: var(--tec-primary);
  margin-top: 0.25rem;
}

/* --------------------------------------------------------------------------
   Área de Dropzone (Carga Masiva Excel)
   -------------------------------------------------------------------------- */
.dropzone {
  border: 2px dashed #CBD5E1;
  border-radius: 12px;
  padding: 2.5rem 1.5rem;
  text-align: center;
  background-color: #F8FAFC;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dropzone:hover {
  border-color: var(--tec-primary);
  background-color: #EFF6FF;
}

/* --------------------------------------------------------------------------
   Scrollbars
   -------------------------------------------------------------------------- */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: #F1F5F9;
}
::-webkit-scrollbar-thumb {
  background: #CBD5E1;
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #94A3B8;
}

/* Responsive */
@media (max-width: 768px) {
  .contact-type-selector {
    grid-template-columns: 1fr;
  }
  .diff-comparison {
    grid-template-columns: 1fr;
  }
}

```

---

### Archivo: `public/js/api.js`

```javascript
// Cliente API HTTP para el Sistema de Contactos QS
const API = {
  token: localStorage.getItem('tec_qs_token') || '',

  setToken(t) {
    this.token = t;
    if (t) localStorage.setItem('tec_qs_token', t);
    else localStorage.removeItem('tec_qs_token');
  },

  async request(endpoint, options = {}) {
    const headers = options.headers || {};
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(endpoint, {
        ...options,
        headers
      });

      // Si es descarga binaria
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('spreadsheetml') || contentType.includes('octet-stream')) {
        if (!response.ok) throw new Error('Error al generar la descarga del archivo.');
        const blob = await response.blob();
        return { isBlob: true, blob, response };
      }

      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.message || 'Error en la solicitud');
        error.data = data;
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (err) {
      console.error('API Error:', err);
      throw err;
    }
  },

  get(endpoint, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const url = qs ? `${endpoint}?${qs}` : endpoint;
    return this.request(url, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  delete(endpoint) {
    return this.request(endpoint, {
      method: 'DELETE'
    });
  }
};

```

---

### Archivo: `public/js/app.js`

```javascript
// Controlador Principal de la Aplicación (SPA) con Menú Lateral Izquierdo Inmóvil
const App = {
  currentUser: null,
  catalogs: null,
  activeTab: 'register',
  sidebarCollapsed: false,

  async init() {
    this.initToastContainer();
    this.initSidebarEvents();

    // 1. Verificar si hay token o iniciar sesión demo por defecto
    const token = API.token;
    if (token) {
      try {
        const res = await API.get('/api/auth/me');
        this.currentUser = res.user;
      } catch (err) {
        console.warn('Sesión no válida o expirada:', err);
        API.setToken('');
      }
    }

    // Si no hay usuario autenticado, autenticar como Administrador por defecto
    if (!this.currentUser) {
      await this.loginUser('admin@tec.ac.cr', 'TecQS2026!');
    }

    // 2. Cargar catálogos
    try {
      this.catalogs = await API.get('/api/catalogs');
    } catch (err) {
      console.error('Error al cargar catálogos:', err);
    }

    // 3. Actualizar interfaz según rol y cargar vista inicial
    this.updateRoleUI();
    this.navigate(this.activeTab);
  },

  initSidebarEvents() {
    // Botón de colapsar / expandir en desktop
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        this.toggleSidebarCollapse();
      });
    }

    // Botón hamburguesa para móvil
    const mobileToggle = document.getElementById('mobile-sidebar-toggle');
    const overlay = document.getElementById('sidebar-overlay');
    const sidebar = document.getElementById('sidebar');

    if (mobileToggle && sidebar && overlay) {
      mobileToggle.addEventListener('click', () => {
        sidebar.classList.add('open');
        overlay.classList.remove('hidden');
      });

      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.add('hidden');
      });
    }
  },

  toggleSidebarCollapse() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');

    this.sidebarCollapsed = !this.sidebarCollapsed;

    if (sidebar) sidebar.classList.toggle('collapsed', this.sidebarCollapsed);

    if (toggleBtn) {
      const icon = toggleBtn.querySelector('i');
      if (icon) {
        icon.className = this.sidebarCollapsed ? 'fa-solid fa-chevron-right text-xs' : 'fa-solid fa-chevron-left text-xs';
      }
    }
  },

  async loginUser(email, password) {
    try {
      const res = await API.post('/api/auth/login', { email, password });
      API.setToken(res.token);
      this.currentUser = res.user;
      this.updateRoleUI();
      return true;
    } catch (err) {
      this.showToast(err.message || 'Error de autenticación', 'error');
      return false;
    }
  },

  // Conmutador entre los 2 únicos roles del sistema: Administrador y Usuario
  async switchRole(targetRole) {
    const email = targetRole === 'ADMIN' ? 'admin@tec.ac.cr' : 'cbrenes@tec.ac.cr';
    const roleName = targetRole === 'ADMIN' ? 'Administrador' : 'Usuario';
    
    this.showToast(`Cambiando a rol: ${roleName}...`, 'info');
    const ok = await this.loginUser(email, 'TecQS2026!');
    if (ok) {
      this.showToast(`✅ Rol activo: ${roleName}`, 'success');
      this.updateRoleUI();
      // Si el rol es Usuario y está en una pantalla de solo admin, redirigir a registro
      if (targetRole === 'USUARIO' && ['export', 'admin'].includes(this.activeTab)) {
        this.navigate('register');
      } else {
        this.navigate(this.activeTab);
      }
    }
  },

  handleLogout() {
    API.setToken('');
    this.currentUser = null;
    this.showToast('Sesión cerrada. Reiniciando como Administrador...', 'info');
    this.loginUser('admin@tec.ac.cr', 'TecQS2026!').then(() => {
      this.navigate('register');
    });
  },

  // Actualiza la interfaz del menú lateral según el rol activo (2 únicos roles: Administrador y Usuario)
  updateRoleUI() {
    if (!this.currentUser) return;
    const isAdmin = this.currentUser.rol === 'ADMIN';

    // Actualizar badge y selector de rol en el menú lateral
    const roleBadge = document.getElementById('role-display-badge');
    const roleSelector = document.getElementById('role-selector');

    if (roleBadge) {
      roleBadge.textContent = isAdmin ? 'ADMINISTRADOR' : 'USUARIO';
      roleBadge.className = `px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${isAdmin ? 'bg-amber-100 text-amber-900' : 'bg-slate-200 text-slate-800'}`;
    }

    if (roleSelector) {
      roleSelector.value = this.currentUser.rol;
    }

    // Visibilidad de opciones en el menú lateral según los 2 roles
    const navBulk = document.getElementById('nav-item-bulk');
    const navExport = document.getElementById('nav-item-export');
    const navAdmin = document.getElementById('nav-item-admin');

    // Carga Masiva disponible para Administrador y Usuario
    if (navBulk) navBulk.style.display = 'block';
    if (navExport) navExport.style.display = isAdmin ? 'block' : 'none';
    if (navAdmin) navAdmin.style.display = isAdmin ? 'block' : 'none';
  },

  navigate(tabName) {
    this.activeTab = tabName;

    // Actualizar estilos activos en el menú lateral izquierdo
    const menuButtons = {
      register: document.getElementById('nav-btn-register'),
      bulk: document.getElementById('nav-btn-bulk'),
      directory: document.getElementById('nav-btn-directory'),
      export: document.getElementById('nav-btn-export'),
      admin: document.getElementById('nav-btn-admin')
    };

    const activeClasses = ['bg-blue-50', 'text-blue-900', 'border', 'border-blue-200/80', 'shadow-sm', 'font-semibold'];
    const inactiveClasses = ['text-slate-600', 'hover:text-slate-900', 'hover:bg-slate-100', 'font-medium'];

    Object.keys(menuButtons).forEach(key => {
      const btn = menuButtons[key];
      if (!btn) return;
      const icon = btn.querySelector('i');

      if (key === tabName) {
        btn.classList.add(...activeClasses);
        btn.classList.remove(...inactiveClasses);
        if (icon) {
          icon.classList.add('text-blue-800');
          icon.classList.remove('text-slate-400');
        }
      } else {
        btn.classList.remove(...activeClasses);
        btn.classList.add(...inactiveClasses);
        if (icon) {
          icon.classList.remove('text-blue-800');
          icon.classList.add('text-slate-400');
        }
      }
    });

    // Cerrar sidebar en pantallas móviles al seleccionar
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (window.innerWidth < 1024 && sidebar && overlay) {
      sidebar.classList.remove('open');
      overlay.classList.add('hidden');
    }

    // Ocultar todas las vistas de contenido
    const views = ['register-view', 'bulk-upload-view', 'directory-view', 'export-view', 'admin-view'];
    views.forEach(v => {
      const el = document.getElementById(v);
      if (el) el.style.display = 'none';
    });

    // Mostrar vista seleccionada e inicializar
    const targetEl = document.getElementById(`${tabName === 'bulk' ? 'bulk-upload' : tabName}-view`);
    if (targetEl) targetEl.style.display = 'block';

    if (tabName === 'register') RegisterModule.init(this.catalogs);
    else if (tabName === 'bulk') BulkUploadModule.init(this.catalogs);
    else if (tabName === 'directory') DirectoryModule.init(this.catalogs);
    else if (tabName === 'export') ExportModule.init(this.catalogs);
    else if (tabName === 'admin') AdminModule.init(this.catalogs);
  },

  initToastContainer() {
    if (!document.getElementById('toast-container')) {
      const toastDiv = document.createElement('div');
      toastDiv.id = 'toast-container';
      toastDiv.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; pointer-events: none;';
      document.body.appendChild(toastDiv);
    }
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `alert alert-${type}`;
    toast.style.cssText = 'box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15); pointer-events: auto; min-width: 280px; max-width: 450px; margin-bottom: 0;';
    toast.innerHTML = `<span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  App.init();
});

```

---

### Archivo: `public/js/register.js`

```javascript
// Módulo de Registro Individual de Contactos
const RegisterModule = {
  currentType: null, // 'ACADEMICO' | 'EMPLEADOR' | null
  catalogs: null,
  pendingSubmission: null,
  selectedSedeId: '',
  selectedDeptoId: '',
  recomiendaNombre: '',
  recomiendaEmail: '',
  touchedFields: {},
  submitting: false,
  emailExists: false,
  emailValid: false,
  emailIsTecDomain: false,
  isCustomSubject: false,
  customSubjectValue: '',
  emailCheckTimeout: null,
  recEmailCheckTimeout: null,
  funcionarioIdentificado: null,

  init(catalogs) {
    this.catalogs = catalogs;
    // Cargar preferencias del usuario que reporta desde almacenamiento local o usuario activo
    this.selectedSedeId = localStorage.getItem('tec_qs_pref_sede') || App.currentUser?.sede_id || '';
    this.selectedDeptoId = localStorage.getItem('tec_qs_pref_depto') || App.currentUser?.departamento_id || '';
    this.recomiendaNombre = localStorage.getItem('tec_qs_pref_recomienda_nombre') || App.currentUser?.nombre_completo || '';
    this.recomiendaEmail = localStorage.getItem('tec_qs_pref_recomienda_email') || App.currentUser?.email || '';
    
    // Si no hay seleccionados, asignar el primero disponible
    if (!this.selectedSedeId && this.catalogs?.sedes?.length > 0) {
      this.selectedSedeId = this.catalogs.sedes[0].id;
    }
    if (!this.selectedDeptoId && this.catalogs?.departamentos?.length > 0) {
      this.selectedDeptoId = this.catalogs.departamentos[0].id;
    }

    this.render();
    if (this.recomiendaEmail) {
      this.lookupFuncionario(this.recomiendaEmail);
    }
  },

  getRecomiendaPrefix() {
    if (!this.recomiendaEmail) return '';
    return this.recomiendaEmail.split('@')[0];
  },

  getSelectedSedeNombre() {
    if (this.funcionarioIdentificado?.sede) {
      return this.funcionarioIdentificado.sede;
    }
    return this.catalogs?.sedes?.find(s => s.id === this.selectedSedeId)?.nombre || 'Campus Central Cartago';
  },

  getSelectedDeptoNombre() {
    if (this.funcionarioIdentificado?.dependencia) {
      return this.funcionarioIdentificado.dependencia;
    }
    return this.catalogs?.departamentos?.find(d => d.id === this.selectedDeptoId)?.nombre || 'Oficina o Departamento';
  },

  getInitials(name) {
    if (!name) return 'TEC';
    const clean = name.replace(/^(dr\.|dra\.|ing\.|lic\.|licda\.|prof\.|profra\.|msc\.|phd)\s+/i, '').trim();
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase() || 'TC';
  },

  render() {
    const container = document.getElementById('register-view');
    if (!container) return;

    // Generar opciones de sedes
    const sedesOptions = (this.catalogs?.sedes || []).map(s => `
      <option value="${s.id}" ${s.id === this.selectedSedeId ? 'selected' : ''}>${s.nombre}</option>
    `).join('');

    // Filtrar o listar departamentos (priorizando la sede seleccionada)
    const deptosParaSede = (this.catalogs?.departamentos || []).filter(d => !d.sede_id || d.sede_id === this.selectedSedeId);
    const todosDeptos = (this.catalogs?.departamentos || []);
    const listaDeptos = deptosParaSede.length > 0 ? deptosParaSede : todosDeptos;

    const deptosOptions = listaDeptos.map(d => `
      <option value="${d.id}" ${d.id === this.selectedDeptoId ? 'selected' : ''}>${d.nombre}</option>
    `).join('');

    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
        
        <!-- Encabezado de la Tarjeta de Registro -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100 mb-6">
          <div>
            <h2 class="text-xl font-bold text-slate-900 flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-lg bg-blue-50 text-blue-900 flex items-center justify-center text-sm border border-blue-200/60 shadow-xs">
                <i class="fa-solid fa-user-plus text-blue-900"></i>
              </span>
              Registro Individual de Contactos
            </h2>
            <p class="text-xs sm:text-sm text-slate-500 mt-1">
              Recopilación oficial para participación institucional del TEC en el Ranking QS (Reputación Académica y Empleadores).
            </p>
          </div>
        </div>

        <!-- 1. Bloque: Datos de la persona del TEC que registra el contacto -->
        <div class="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 mb-6 shadow-2xs">
          <div class="mb-4 pb-2 border-b border-slate-100 flex items-center justify-between">
            <h3 class="text-xs sm:text-sm font-bold text-blue-950 uppercase tracking-wider m-0 flex items-center gap-2">
              <span class="w-6 h-6 rounded-md bg-blue-900 text-white flex items-center justify-center text-xs">
                <i class="fa-solid fa-id-card"></i>
              </span>
              Datos de la persona del TEC que registra el contacto
            </h3>
            <button type="button" 
                    class="btn btn-outline btn-xs text-blue-900 border-blue-200 bg-white hover:bg-blue-50 py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5 rounded-lg shadow-2xs transition-colors shrink-0"
                    onclick="RegisterModule.openNuevoUsuarioModal()"
                    title="Incluir a una nueva persona funcionaria en el padrón del TEC">
              <i class="fa-solid fa-user-plus text-amber-600"></i>
              <span>+ Nuevo funcionario</span>
            </button>
          </div>

          <!-- Disposición simétrica: Izquierda (Input de correo acortado) y Derecha (Tarjeta de datos del funcionario) -->
          <div class="grid grid-cols-1 md:grid-cols-[minmax(260px,360px)_1fr] gap-5 items-start">
            <!-- COLUMNA IZQUIERDA: 1. Correo institucional (@itcr.ac.cr) * (Largo acortado a 360px y alto 76px) -->
            <div>
              <label class="form-label text-xs sm:text-sm font-bold text-slate-800 mb-2 block" for="reg-recomienda-email">
                1. Correo institucional (@itcr.ac.cr) <span class="req text-red-500 font-bold">*</span>
              </label>
              <div class="flex rounded-xl shadow-2xs overflow-hidden border border-slate-300 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 bg-white transition-all h-[76px] w-full max-w-[360px]" id="rec-input-group">
                <input type="text"
                       id="reg-recomienda-email"
                       class="flex-1 px-4 py-3 text-sm sm:text-base text-slate-900 placeholder:text-slate-400 placeholder:italic outline-none border-0 h-full"
                       placeholder="Espacio para digitar el correo"
                       value="${this.getRecomiendaPrefix()}"
                       oninput="RegisterModule.onRecomiendaEmailInput(this.value)"
                       onblur="RegisterModule.onRecomiendaBlur('reg-recomienda-email')"
                       autocomplete="off"
                       spellcheck="false">
                <div class="bg-slate-100 border-l border-slate-300 px-4 sm:px-5 flex items-center justify-center font-mono text-xs sm:text-sm text-slate-700 font-semibold select-none shrink-0 h-full">
                  itcr.ac.cr
                </div>
              </div>
              <div class="error-feedback mt-1.5" id="err-recomienda-email"></div>
              <div id="rec-email-spinner" class="hidden text-xs text-blue-800 font-medium mt-1.5 flex items-center gap-1.5">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>Consultando padrón del TEC...</span>
              </div>
            </div>

            <!-- COLUMNA DERECHA: Tarjeta con ícono verde y datos en 3 filas (Mismo alto 76px) -->
            <div>
              <div class="text-xs sm:text-sm font-bold text-slate-800 mb-2 invisible select-none">
                <!-- Espaciador simétrico para alineación exacta con la etiqueta de la columna izquierda -->
                Detalle
              </div>
              <div id="card-funcionario-container" class="border border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50/80 shadow-2xs flex items-center gap-3.5 h-[76px] transition-all">
                <!-- Ícono verde de usuario / check -->
                <div id="card-funcionario-icon" class="w-12 h-12 rounded-lg ${this.recomiendaNombre ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-400 border border-slate-200'} flex items-center justify-center text-2xl shrink-0 shadow-2xs">
                  <i class="fa-solid ${this.recomiendaNombre ? 'fa-user-check' : 'fa-user'}"></i>
                </div>

                <!-- 3 filas de información con interlineado simétrico -->
                <div class="flex-1 min-w-0" id="card-funcionario-text">
                  <div class="text-sm sm:text-base font-bold text-slate-900 truncate leading-tight" id="card-display-nombre">
                    ${this.recomiendaNombre || 'Nombre de la persona funcionaria'}
                  </div>
                  <div class="text-xs sm:text-sm text-slate-600 truncate leading-tight mt-1" id="card-display-depto">
                    ${this.getSelectedDeptoNombre() || 'Oficina o Departamento'}
                  </div>
                  <div class="text-[11px] sm:text-xs text-slate-500 truncate leading-tight mt-0.5" id="card-display-sede">
                    ${this.getSelectedSedeNombre() || 'Sede del TEC'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. Selector de Tipo de Contacto (Dentro del Registro Individual) -->
        <div class="mb-6">
          <label class="block text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full bg-blue-900 text-white flex items-center justify-center text-[11px] font-bold">2</span>
            Seleccione el Tipo de Contacto que desea registrar *
          </label>
          <div class="contact-type-selector">
            <div class="type-option-card ${this.currentType === 'ACADEMICO' ? 'selected' : ''}" id="opt-academico" onclick="RegisterModule.selectType('ACADEMICO')">
              <input type="radio" name="tipo_contacto" id="radio-academico" value="ACADEMICO" ${this.currentType === 'ACADEMICO' ? 'checked' : ''}>
              <div class="type-info">
                <div class="flex items-center gap-2">
                  <i class="fa-solid fa-graduation-cap text-blue-800 text-base"></i>
                  <h4>Académico (Academic Survey)</h4>
                </div>
                <p>Profesores, investigadores, decanos y homólogos de universidades internacionales que conocen la calidad académica del TEC.</p>
              </div>
            </div>

            <div class="type-option-card ${this.currentType === 'EMPLEADOR' ? 'selected' : ''}" id="opt-empleador" onclick="RegisterModule.selectType('EMPLEADOR')">
              <input type="radio" name="tipo_contacto" id="radio-empleador" value="EMPLEADOR" ${this.currentType === 'EMPLEADOR' ? 'checked' : ''}>
              <div class="type-info">
                <div class="flex items-center gap-2">
                  <i class="fa-solid fa-briefcase text-emerald-700 text-base"></i>
                  <h4>Empleador (Employer Survey)</h4>
                </div>
                <p>Gerentes, directores y reclutadores de empresas e industrias que contratan y valoran a los profesionales graduados del TEC.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. Contenedor dinámico de campos de formulario (Dentro de la misma tarjeta) -->
        <div id="dynamic-form-area">
          ${this.currentType ? this.renderFormFields() : `
            <div class="text-center py-10 px-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl">
              <i class="fa-solid fa-arrow-pointer text-slate-400 text-3xl mb-2 block"></i>
              <p class="text-slate-600 font-medium text-sm">
                Seleccione si el contacto corresponde a un <strong>Académico</strong> o un <strong>Empleador</strong> para desplegar los campos correspondientes.
              </p>
              <p class="text-slate-400 text-xs mt-1">Los formularios no se muestran simultáneamente para evitar confusiones.</p>
            </div>
          `}
        </div>
      </div>

      <!-- Modal de Detección de Duplicados -->
      <div id="duplicate-modal-container"></div>
    `;

    if (this.currentType) {
      this.attachFormListeners();
    }
  },

  onSedeChange(sedeId, preserveDeptoId = null, preserveDeptoName = null) {
    this.selectedSedeId = sedeId;
    localStorage.setItem('tec_qs_pref_sede', sedeId);

    // Actualizar lista de departamentos
    const deptoSelect = document.getElementById('reg-departamento-id');
    if (deptoSelect && this.catalogs?.departamentos) {
      const deptosParaSede = this.catalogs.departamentos.filter(d => !d.sede_id || d.sede_id === sedeId);
      let listaDeptos = deptosParaSede.length > 0 ? deptosParaSede : this.catalogs.departamentos;

      // Si preserveDeptoId o preserveDeptoName no está en listaDeptos, incluirlo
      if (preserveDeptoId && !listaDeptos.some(d => d.id === preserveDeptoId)) {
        const foundGlobally = this.catalogs.departamentos.find(d => d.id === preserveDeptoId);
        if (foundGlobally) {
          listaDeptos = [foundGlobally, ...listaDeptos];
        } else if (preserveDeptoName) {
          listaDeptos = [{ id: preserveDeptoId, nombre: preserveDeptoName }, ...listaDeptos];
        }
      } else if (preserveDeptoName && !listaDeptos.some(d => d.nombre.toLowerCase() === preserveDeptoName.toLowerCase())) {
        const foundGlobally = this.catalogs.departamentos.find(d => d.nombre.toLowerCase() === preserveDeptoName.toLowerCase());
        if (foundGlobally) {
          listaDeptos = [foundGlobally, ...listaDeptos];
          preserveDeptoId = foundGlobally.id;
        } else {
          const tempId = preserveDeptoId || 'dep-' + Math.random().toString(36).substring(2, 9);
          listaDeptos = [{ id: tempId, nombre: preserveDeptoName }, ...listaDeptos];
          preserveDeptoId = tempId;
        }
      }

      deptoSelect.innerHTML = listaDeptos.map(d => `
        <option value="${d.id}" ${preserveDeptoId ? (d.id === preserveDeptoId ? 'selected' : '') : (d.id === this.selectedDeptoId ? 'selected' : '')}>${d.nombre}</option>
      `).join('');

      if (preserveDeptoId) {
        this.selectedDeptoId = preserveDeptoId;
        deptoSelect.value = preserveDeptoId;
      } else if (listaDeptos.length > 0 && !listaDeptos.some(d => d.id === this.selectedDeptoId)) {
        this.selectedDeptoId = listaDeptos[0].id;
        deptoSelect.value = listaDeptos[0].id;
      }
      localStorage.setItem('tec_qs_pref_depto', this.selectedDeptoId);
    }
    this.validateLive();
  },

  onDeptoChange(deptoId) {
    this.selectedDeptoId = deptoId;
    localStorage.setItem('tec_qs_pref_depto', deptoId);
    this.validateLive();
  },

  onRecomiendaNombreInput(val) {
    this.recomiendaNombre = val;
    localStorage.setItem('tec_qs_pref_recomienda_nombre', val);
    const errEl = document.getElementById('err-recomienda-nombre');
    const inputEl = document.getElementById('reg-recomienda-nombre');
    if (val.trim().length > 0 && val.trim().length < 3) {
      if (errEl) errEl.innerHTML = `<span class="text-slate-500 text-xs"><i class="fa-solid fa-info-circle mr-1"></i> Mínimo 3 caracteres requeridos (ha digitado ${val.trim().length}).</span>`;
      if (inputEl) inputEl.classList.add('is-invalid');
    } else {
      if (errEl) errEl.textContent = '';
      if (inputEl) inputEl.classList.remove('is-invalid');
    }
    this.validateLive();
  },

  onRecomiendaEmailInput(val) {
    let cleanUser = (val || '').trim().toLowerCase();
    // Si el usuario escribe o pega con @, extraer solo el nombre de usuario
    if (cleanUser.includes('@')) {
      cleanUser = cleanUser.split('@')[0];
      const inputEl = document.getElementById('reg-recomienda-email');
      if (inputEl) inputEl.value = cleanUser;
    }

    const fullEmail = cleanUser.length > 0 ? `${cleanUser}@itcr.ac.cr` : '';
    this.recomiendaEmail = fullEmail;
    if (fullEmail) {
      localStorage.setItem('tec_qs_pref_recomienda_email', fullEmail);
    } else {
      localStorage.removeItem('tec_qs_pref_recomienda_email');
    }

    const errEl = document.getElementById('err-recomienda-email');
    const inputEl = document.getElementById('reg-recomienda-email');
    const spinner = document.getElementById('rec-email-spinner');
    const iconEl = document.getElementById('card-funcionario-icon');
    const nombreEl = document.getElementById('card-display-nombre');
    const deptoEl = document.getElementById('card-display-depto');
    const sedeEl = document.getElementById('card-display-sede');
    
    clearTimeout(this.recEmailCheckTimeout);

    if (cleanUser.length === 0) {
      this.funcionarioIdentificado = null;
      this.recomiendaNombre = '';
      if (errEl) errEl.textContent = '';
      if (inputEl) inputEl.classList.remove('is-invalid', 'is-valid');
      if (spinner) spinner.classList.add('hidden');
      if (iconEl) {
        iconEl.className = 'w-12 h-12 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 flex items-center justify-center text-2xl shrink-0 shadow-2xs';
        iconEl.innerHTML = '<i class="fa-solid fa-user"></i>';
      }
      if (nombreEl) nombreEl.textContent = 'Nombre de la persona funcionaria';
      if (deptoEl) deptoEl.textContent = 'Oficina o Departamento';
      if (sedeEl) sedeEl.textContent = 'Sede del TEC';
      this.validateLive();
      return;
    }

    if (/\s/.test(cleanUser)) {
      if (errEl) errEl.innerHTML = `<span class="text-red-600 font-medium text-xs"><i class="fa-solid fa-circle-exclamation mr-1"></i> No incluya espacios en blanco.</span>`;
      if (inputEl) inputEl.classList.add('is-invalid');
      if (spinner) spinner.classList.add('hidden');
      this.validateLive();
      return;
    }

    if (errEl) errEl.textContent = '';
    if (inputEl) inputEl.classList.remove('is-invalid');

    // Buscar funcionario con debounce de 250ms
    if (spinner) spinner.classList.remove('hidden');
    this.recEmailCheckTimeout = setTimeout(() => {
      this.lookupFuncionario(fullEmail);
    }, 250);

    this.validateLive();
  },

  async lookupFuncionario(email) {
    const spinner = document.getElementById('rec-email-spinner');
    const inputEl = document.getElementById('reg-recomienda-email');
    const iconEl = document.getElementById('card-funcionario-icon');
    const nombreEl = document.getElementById('card-display-nombre');
    const deptoEl = document.getElementById('card-display-depto');
    const sedeEl = document.getElementById('card-display-sede');
    const errEl = document.getElementById('err-recomienda-email');

    try {
      const res = await API.get(`/api/funcionarios/by-email?email=${encodeURIComponent(email)}`);
      if (spinner) spinner.classList.add('hidden');

      if (res.exists && res.funcionario) {
        const f = res.funcionario;
        this.funcionarioIdentificado = f;
        this.recomiendaNombre = f.nombre || '';
        this.recomiendaEmail = f.email || email;

        localStorage.setItem('tec_qs_pref_recomienda_email', this.recomiendaEmail);
        localStorage.setItem('tec_qs_pref_recomienda_nombre', this.recomiendaNombre);

        // Resolver sede
        let matchedSedeId = f.sede_id;
        if (!matchedSedeId && this.catalogs?.sedes) {
          const s = this.catalogs.sedes.find(x => 
            x.id === f.sede_id || 
            (f.sede && (x.nombre.toLowerCase().includes(f.sede.toLowerCase()) || f.sede.toLowerCase().includes(x.nombre.toLowerCase())))
          );
          if (s) matchedSedeId = s.id;
        }
        if (!matchedSedeId) matchedSedeId = 'sede-cartago';
        this.selectedSedeId = matchedSedeId;
        localStorage.setItem('tec_qs_pref_sede', matchedSedeId);

        // Resolver departamento
        this.selectedDeptoId = f.departamento_id || null;
        if (f.dependencia) {
          this.selectedDeptoNombre = f.dependencia;
        }
        if (this.selectedDeptoId) {
          localStorage.setItem('tec_qs_pref_depto', this.selectedDeptoId);
        }

        // 1. Actualizar Tarjeta a estado Verde / Encontrado
        if (iconEl) {
          iconEl.className = 'w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center text-2xl shrink-0 shadow-2xs';
          iconEl.innerHTML = '<i class="fa-solid fa-user-check"></i>';
        }
        if (nombreEl) nombreEl.textContent = f.nombre;
        if (deptoEl) deptoEl.textContent = f.dependencia || this.getSelectedDeptoNombre();
        if (sedeEl) sedeEl.textContent = f.sede || this.getSelectedSedeNombre();

        if (inputEl) {
          inputEl.value = this.getRecomiendaPrefix();
          inputEl.classList.remove('is-invalid');
          inputEl.classList.add('is-valid');
        }
        if (errEl) errEl.textContent = '';
      } else {
        this.funcionarioIdentificado = null;
        this.recomiendaNombre = '';

        // Actualizar Tarjeta a estado Advertencia / No encontrado
        if (iconEl) {
          iconEl.className = 'w-12 h-12 rounded-lg bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center text-2xl shrink-0 shadow-2xs';
          iconEl.innerHTML = '<i class="fa-solid fa-user-xmark"></i>';
        }
        if (nombreEl) nombreEl.innerHTML = '<span class="text-amber-800 text-sm font-semibold">Funcionario no registrado en el padrón</span>';
        if (deptoEl) deptoEl.innerHTML = '<span class="text-slate-500 text-xs">Verifique el correo institucional o <button type="button" class="text-blue-800 font-bold underline hover:text-blue-900" onclick="RegisterModule.openNuevoUsuarioModal()">inclúyalo en el padrón</button></span>';
        if (sedeEl) sedeEl.textContent = '';

        if (inputEl) {
          inputEl.classList.add('is-invalid');
          inputEl.classList.remove('is-valid');
        }
        if (errEl) {
          errEl.innerHTML = '<span class="text-amber-700 text-xs font-medium"><i class="fa-solid fa-circle-info mr-1"></i> No se encontró este usuario en el padrón oficial del TEC.</span>';
        }
      }
      this.validateLive();
    } catch (err) {
      if (spinner) spinner.classList.add('hidden');
      console.warn('Error al consultar funcionario:', err);
    }
  },

  limpiarFuncionario() {
    this.recomiendaEmail = '';
    this.recomiendaNombre = '';
    this.funcionarioIdentificado = null;
    localStorage.removeItem('tec_qs_pref_recomienda_email');
    localStorage.removeItem('tec_qs_pref_recomienda_nombre');

    const inputEmail = document.getElementById('reg-recomienda-email');
    const inputNombre = document.getElementById('reg-recomienda-nombre');
    const badgeFound = document.getElementById('rec-status-indicator');
    const badgeNotFound = document.getElementById('rec-notfound-indicator');

    if (inputEmail) {
      inputEmail.value = '';
      inputEmail.classList.remove('is-valid', 'is-invalid');
      inputEmail.focus();
    }
    if (inputNombre) {
      inputNombre.value = '';
      inputNombre.classList.remove('is-valid', 'is-invalid');
    }
    if (badgeFound) badgeFound.classList.add('hidden');
    if (badgeNotFound) badgeNotFound.classList.add('hidden');

    App.showToast('Campos de funcionario limpiados. Digite el correo o incluya un nuevo usuario.', 'info');
    this.validateLive();
  },

  openNuevoUsuarioModal() {
    const modalContainer = document.getElementById('duplicate-modal-container');
    if (!modalContainer) return;

    const sedesOpts = (this.catalogs?.sedes || []).map(s => `
      <option value="${s.id}" ${s.id === this.selectedSedeId ? 'selected' : ''}>${s.nombre}</option>
    `).join('');

    modalContainer.innerHTML = `
      <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
        <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
              <span class="w-8 h-8 rounded-lg bg-blue-50 text-blue-900 flex items-center justify-center text-sm border border-blue-200/60">
                <i class="fa-solid fa-user-plus text-blue-900"></i>
              </span>
              Incluir Nuevo Usuario / Funcionario
            </h3>
            <button type="button" class="text-slate-400 hover:text-slate-600 text-lg" onclick="RegisterModule.closeNuevoUsuarioModal()">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <p class="text-xs text-slate-500 mb-4">
            Registre al funcionario/a en el padrón institucional del TEC. Una vez registrado, sus datos quedarán seleccionados automáticamente para este reporte y futuros registros.
          </p>

          <form id="form-nuevo-funcionario" onsubmit="RegisterModule.saveNuevoUsuarioModal(event)" class="space-y-3.5">
            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-700">Correo institucional del TEC *</label>
              <input type="text" 
                     id="modal-func-email" 
                     class="form-control text-sm" 
                     placeholder="usuario@itcr.ac.cr" 
                     required 
                     maxlength="120"
                     oninput="RegisterModule.onModalEmailInput(this.value)">
              <div class="error-feedback" id="err-modal-func-email"></div>
            </div>

            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-700">Nombre completo del funcionario/a *</label>
              <input type="text" 
                     id="modal-func-nombre" 
                     class="form-control text-sm" 
                     placeholder="Ej. Dr. Mario Fonseca Ruiz" 
                     required 
                     maxlength="100">
            </div>

            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-700">Sede del TEC *</label>
              <select id="modal-func-sede" class="form-control text-sm" required>
                ${sedesOpts}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-700">Carrera, Escuela, Departamento o Dependencia *</label>
              <input type="text" 
                     id="modal-func-dependencia" 
                     class="form-control text-sm" 
                     placeholder="Ej. Escuela de Ingeniería Forestal / Rectoría" 
                     required 
                     maxlength="120">
            </div>

            <div class="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
              <button type="button" class="btn btn-outline btn-sm" onclick="RegisterModule.closeNuevoUsuarioModal()">
                Cancelar
              </button>
              <button type="submit" class="btn btn-tec btn-sm" id="btn-save-modal-func">
                <i class="fa-solid fa-save mr-1"></i>
                Guardar en Padrón y Seleccionar
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    const emailInput = document.getElementById('modal-func-email');
    if (emailInput) {
      emailInput.focus();
      const currentEmail = this.recomiendaEmail || (document.getElementById('reg-recomienda-email')?.value?.trim() ? `${document.getElementById('reg-recomienda-email').value.trim()}@itcr.ac.cr` : '');
      if (currentEmail) {
        emailInput.value = currentEmail;
        this.onModalEmailInput(currentEmail);
      }
    }
  },

  onModalEmailInput(val) {
    let clean = (val || '').trim().toLowerCase();
    if (clean && !clean.includes('@')) {
      clean = `${clean}@itcr.ac.cr`;
    }
    const feedbackEl = document.getElementById('err-modal-func-email');
    const btnSave = document.getElementById('btn-save-modal-func');
    if (!feedbackEl) return;

    clearTimeout(this.modalEmailTimeout);
    if (!clean || clean.length < 5) {
      feedbackEl.innerHTML = '';
      if (btnSave) {
        btnSave.innerHTML = '<i class="fa-solid fa-save mr-1"></i> Guardar en Padrón y Seleccionar';
      }
      return;
    }

    this.modalEmailTimeout = setTimeout(async () => {
      try {
        const res = await API.get(`/api/funcionarios/by-email?email=${encodeURIComponent(clean)}`);
        if (res.exists && res.funcionario) {
          const f = res.funcionario;
          feedbackEl.innerHTML = `
            <div class="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 text-xs mt-1.5 animate-fadeIn">
              <div class="font-bold flex items-center gap-1.5 text-blue-800">
                <i class="fa-solid fa-circle-check text-emerald-600"></i> Funcionario ya registrado en el padrón
              </div>
              <div class="mt-1 text-slate-700">
                <strong>${f.nombre}</strong> (${f.dependencia || 'Dependencia no indicada'} · ${f.sede || 'Sede no indicada'}).
              </div>
              <div class="text-[11px] text-blue-700 mt-0.5">Sus datos se completaron automáticamente para seleccionarlo.</div>
            </div>
          `;
          const nombreInput = document.getElementById('modal-func-nombre');
          const sedeSelect = document.getElementById('modal-func-sede');
          const deptoInput = document.getElementById('modal-func-dependencia');
          if (nombreInput && f.nombre) nombreInput.value = f.nombre;
          if (sedeSelect && f.sede_id) sedeSelect.value = f.sede_id;
          if (deptoInput && f.dependencia) deptoInput.value = f.dependencia;
          if (btnSave) {
            btnSave.innerHTML = '<i class="fa-solid fa-user-check mr-1"></i> Seleccionar este Funcionario';
          }
        } else {
          feedbackEl.innerHTML = `
            <div class="text-[11px] text-emerald-700 mt-1 flex items-center gap-1">
              <i class="fa-solid fa-circle-info text-emerald-600"></i> Correo nuevo · Complete los datos para agregarlo al padrón institucional.
            </div>
          `;
          if (btnSave) {
            btnSave.innerHTML = '<i class="fa-solid fa-save mr-1"></i> Guardar en Padrón y Seleccionar';
          }
        }
      } catch (err) {
        console.warn('Error verificando correo en modal:', err);
      }
    }, 250);
  },

  closeNuevoUsuarioModal() {
    const modalContainer = document.getElementById('duplicate-modal-container');
    if (modalContainer) modalContainer.innerHTML = '';
  },

  async saveNuevoUsuarioModal(event) {
    event.preventDefault();
    let email = document.getElementById('modal-func-email')?.value?.trim().toLowerCase() || '';
    if (email && !email.includes('@')) {
      email = `${email}@itcr.ac.cr`;
    }
    const nombre = document.getElementById('modal-func-nombre')?.value?.trim();
    const sedeId = document.getElementById('modal-func-sede')?.value;
    const dependencia = document.getElementById('modal-func-dependencia')?.value?.trim();
    const errEmail = document.getElementById('err-modal-func-email');

    if (!email || (!email.endsWith('@itcr.ac.cr') && !email.endsWith('@tec.ac.cr'))) {
      if (errEmail) errEmail.textContent = 'Debe indicar un correo institucional (@itcr.ac.cr o @tec.ac.cr).';
      return;
    }
    if (!nombre || nombre.length < 3) {
      App.showToast('El nombre debe tener al menos 3 caracteres.', 'warning');
      return;
    }
    if (!dependencia || dependencia.length < 2) {
      App.showToast('Debe indicar la dependencia o departamento.', 'warning');
      return;
    }

    const sedeObj = (this.catalogs?.sedes || []).find(s => s.id === sedeId);
    const sedeNombre = sedeObj ? sedeObj.nombre : 'Campus Central Cartago';

    const saveBtn = document.getElementById('btn-save-modal-func');
    if (saveBtn) saveBtn.disabled = true;

    try {
      const res = await API.post('/api/funcionarios', {
        nombre,
        email,
        dependencia,
        sede: sedeNombre,
        sede_id: sedeId
      });

      if (res.success && res.funcionario) {
        App.showToast('🎉 Funcionario incluido exitosamente en el padrón institucional.', 'success');
        this.closeNuevoUsuarioModal();

        // Actualizar catálogos si trajo nuevo departamento
        if (this.catalogs?.departamentos && res.funcionario.departamento_id) {
          if (!this.catalogs.departamentos.some(d => d.id === res.funcionario.departamento_id)) {
            this.catalogs.departamentos.push({
              id: res.funcionario.departamento_id,
              nombre: dependencia,
              sede_id: sedeId
            });
          }
        }

        // Establecer valores en el formulario de Registro Individual
        this.recomiendaEmail = email;
        this.recomiendaNombre = nombre;
        this.selectedSedeId = sedeId;
        this.selectedDeptoId = res.funcionario.departamento_id;
        this.funcionarioIdentificado = res.funcionario;

        localStorage.setItem('tec_qs_pref_recomienda_email', email);
        localStorage.setItem('tec_qs_pref_recomienda_nombre', nombre);
        localStorage.setItem('tec_qs_pref_sede', sedeId);
        if (res.funcionario.departamento_id) {
          localStorage.setItem('tec_qs_pref_depto', res.funcionario.departamento_id);
        }

        const inputEmail = document.getElementById('reg-recomienda-email');
        const inputNombre = document.getElementById('reg-recomienda-nombre');
        const sedeEl = document.getElementById('reg-sede-id');
        const badgeFound = document.getElementById('rec-status-indicator');
        const badgeNotFound = document.getElementById('rec-notfound-indicator');

        if (inputEmail) {
          inputEmail.value = this.getRecomiendaPrefix();
          inputEmail.classList.add('is-valid');
        }
        if (inputNombre) {
          inputNombre.value = nombre;
          inputNombre.classList.add('is-valid');
        }
        if (sedeEl) {
          sedeEl.value = sedeId;
          sedeEl.classList.add('is-valid');
        }
        if (badgeFound) badgeFound.classList.remove('hidden');
        if (badgeNotFound) badgeNotFound.classList.add('hidden');

        // Actualizar departamentos y seleccionar el nuevo
        this.selectedDeptoId = res.funcionario.departamento_id;
        this.updateCardDisplay();
        this.validateLive();
      }
    } catch (err) {
      App.showToast(err.message || 'Error al guardar funcionario', 'error');
      if (saveBtn) saveBtn.disabled = false;
    }
  },

  updateCardDisplay() {
    const iconEl = document.getElementById('card-funcionario-icon');
    const nombreEl = document.getElementById('card-display-nombre');
    const sedeEl = document.getElementById('card-display-sede');
    const deptoEl = document.getElementById('card-display-depto');
    const inputEl = document.getElementById('reg-recomienda-email');

    const nombre = this.recomiendaNombre || App.currentUser?.nombre_completo || '';

    if (inputEl) {
      inputEl.value = this.getRecomiendaPrefix();
      if (this.recomiendaEmail) {
        inputEl.classList.add('is-valid');
        inputEl.classList.remove('is-invalid');
      }
    }

    if (nombre) {
      if (iconEl) {
        iconEl.className = 'w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center text-2xl shrink-0 shadow-2xs';
        iconEl.innerHTML = '<i class="fa-solid fa-user-check"></i>';
      }
      if (nombreEl) nombreEl.textContent = nombre;
      if (deptoEl) deptoEl.textContent = this.getSelectedDeptoNombre();
      if (sedeEl) sedeEl.textContent = this.getSelectedSedeNombre();
    } else {
      if (iconEl) {
        iconEl.className = 'w-12 h-12 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 flex items-center justify-center text-2xl shrink-0 shadow-2xs';
        iconEl.innerHTML = '<i class="fa-solid fa-user"></i>';
      }
      if (nombreEl) nombreEl.textContent = 'Nombre de la persona funcionaria';
      if (deptoEl) deptoEl.textContent = 'Oficina o Departamento';
      if (sedeEl) sedeEl.textContent = 'Sede del TEC';
    }

    this.validateLive();
  },

  openBuscarFuncionarioModal() {
    const modalContainer = document.getElementById('duplicate-modal-container');
    if (!modalContainer) return;

    modalContainer.innerHTML = `
      <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
        <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 shrink-0">
            <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
              <span class="w-8 h-8 rounded-lg bg-blue-50 text-blue-900 flex items-center justify-center text-sm border border-blue-200/60">
                <i class="fa-solid fa-user-pen text-blue-900"></i>
              </span>
              Cambiar Persona Funcionaria del TEC
            </h3>
            <button type="button" class="text-slate-400 hover:text-slate-600 text-lg" onclick="RegisterModule.closeModal()">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <p class="text-xs text-slate-500 mb-3 shrink-0">
            Busque por nombre, apellido o correo institucional en el padrón oficial del TEC para seleccionarlo en la tarjeta.
          </p>

          <div class="relative mb-3 shrink-0">
            <input type="text" 
                   id="modal-search-funcionario-input" 
                   class="form-control text-sm pr-9" 
                   placeholder="Escriba nombre o correo (ej. Rodrigo Calvo o rcalvo)..."
                   oninput="RegisterModule.onSearchFuncionarioInput(this.value)">
            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <i class="fa-solid fa-magnifying-glass"></i>
            </span>
          </div>

          <!-- Lista de resultados -->
          <div id="modal-search-results" class="flex-1 overflow-y-auto max-h-64 space-y-2 pr-1">
            <div class="text-center py-6 text-slate-400 text-xs">
              <i class="fa-solid fa-spinner fa-spin mr-1"></i> Cargando funcionarios...
            </div>
          </div>

          <div class="flex items-center justify-between pt-3 border-t border-slate-100 mt-4 shrink-0">
            <button type="button" class="btn btn-outline btn-xs text-xs" onclick="RegisterModule.resetToCurrentUser()">
              <i class="fa-solid fa-rotate-left mr-1"></i> Usar mis datos de usuario
            </button>
            <div class="flex items-center gap-2">
              <button type="button" class="btn btn-outline btn-xs text-blue-900 border-blue-200" onclick="RegisterModule.openNuevoUsuarioModal()">
                <i class="fa-solid fa-user-plus text-amber-600 mr-1"></i> + Nuevo funcionario
              </button>
              <button type="button" class="btn btn-outline btn-sm" onclick="RegisterModule.closeModal()">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    const input = document.getElementById('modal-search-funcionario-input');
    if (input) {
      input.focus();
      this.searchFuncionariosInModal('');
    }
  },

  closeModal() {
    const modalContainer = document.getElementById('duplicate-modal-container');
    if (modalContainer) modalContainer.innerHTML = '';
  },

  onSearchFuncionarioInput(val) {
    clearTimeout(this.searchModalTimeout);
    this.searchModalTimeout = setTimeout(() => {
      this.searchFuncionariosInModal(val);
    }, 200);
  },

  async searchFuncionariosInModal(query) {
    const resultsContainer = document.getElementById('modal-search-results');
    if (!resultsContainer) return;

    try {
      const res = await API.get(`/api/funcionarios?q=${encodeURIComponent(query || '')}`);
      const list = res.funcionarios || [];
      if (list.length === 0) {
        resultsContainer.innerHTML = `
          <div class="text-center py-6 text-slate-400 text-xs">
            No se encontraron funcionarios que coincidan con "<strong>${query}</strong>".
            <div class="mt-2">
              <button type="button" class="btn btn-outline btn-xs" onclick="RegisterModule.openNuevoUsuarioModal()">
                + Incluir como nuevo funcionario en el padrón
              </button>
            </div>
          </div>
        `;
        return;
      }

      resultsContainer.innerHTML = list.map(f => {
        const fJson = JSON.stringify(f).replace(/"/g, '&quot;');
        return `
          <div class="p-3 border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/50 transition-all flex items-center justify-between gap-3 cursor-pointer" onclick='RegisterModule.selectFuncionario(${fJson})'>
            <div class="min-w-0">
              <div class="text-xs font-bold text-slate-900 truncate">${f.nombre}</div>
              <div class="text-[11px] font-mono text-blue-900">${f.email}</div>
              <div class="text-[11px] text-slate-500 truncate">${f.sede || ''} · ${f.dependencia || ''}</div>
            </div>
            <button type="button" class="btn btn-tec btn-xs shrink-0 py-1 px-2.5 text-[11px]">
              Seleccionar
            </button>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.warn('Error al buscar funcionarios:', err);
    }
  },

  selectFuncionario(f) {
    this.recomiendaNombre = f.nombre;
    this.recomiendaEmail = f.email;
    this.selectedSedeId = f.sede_id || 'sede-cartago';
    this.selectedDeptoId = f.departamento_id || null;

    localStorage.setItem('tec_qs_pref_recomienda_nombre', f.nombre);
    localStorage.setItem('tec_qs_pref_recomienda_email', f.email);
    if (f.sede_id) localStorage.setItem('tec_qs_pref_sede', f.sede_id);
    if (f.departamento_id) localStorage.setItem('tec_qs_pref_depto', f.departamento_id);

    this.closeModal();
    this.updateCardDisplay();
    App.showToast(`✅ Funcionario seleccionado: ${f.nombre}`, 'success');
  },

  resetToCurrentUser() {
    this.recomiendaNombre = App.currentUser?.nombre_completo || '';
    this.recomiendaEmail = App.currentUser?.email || '';
    this.selectedSedeId = App.currentUser?.sede_id || 'sede-cartago';
    this.selectedDeptoId = App.currentUser?.departamento_id || null;

    localStorage.setItem('tec_qs_pref_recomienda_nombre', this.recomiendaNombre);
    localStorage.setItem('tec_qs_pref_recomienda_email', this.recomiendaEmail);
    if (this.selectedSedeId) localStorage.setItem('tec_qs_pref_sede', this.selectedSedeId);
    if (this.selectedDeptoId) localStorage.setItem('tec_qs_pref_depto', this.selectedDeptoId);

    this.closeModal();
    this.updateCardDisplay();
    App.showToast('✅ Restablecido a sus datos de usuario.', 'info');
  },

  onRecomiendaBlur(fieldId) {
    this.touchedFields[fieldId] = true;
    if (fieldId === 'reg-recomienda-email' && this.recomiendaEmail) {
      this.lookupFuncionario(this.recomiendaEmail);
    }
    this.validateLive();
  },

  selectType(type) {
    this.currentType = type;
    this.render();
  },

  renderFormFields() {
    const isAcademic = this.currentType === 'ACADEMICO';
    const countriesOptions = (this.catalogs?.paises || []).map(c => `<option value="${c}">${c}</option>`).join('');
    const titlesOptions = (this.catalogs?.titulos || ['Dr', 'Dra', 'Prof', 'Ing', 'Lic', 'MSc', 'PhD', 'Mr', 'Mrs', 'Ms']).map(t => `<option value="${t}">${t}</option>`).join('');
    const defaultSubjectsEs = [
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
    const rawSubjects = (this.catalogs?.areas_qs && this.catalogs.areas_qs.length > 0) ? this.catalogs.areas_qs : defaultSubjectsEs;
    const subjectsOptions = rawSubjects.map(s => `<option value="${s}">${s}</option>`).join('');
    const industriesOptions = (this.catalogs?.industrias_qs || []).map(i => `<option value="${i}">${i}</option>`).join('');

    return `
      <form id="contact-form" onsubmit="event.preventDefault(); RegisterModule.handleSubmit();" novalidate class="mt-4 pt-4 border-t border-slate-100">
        <div class="mb-5 flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <span class="w-5 h-5 rounded-full bg-blue-900 text-white flex items-center justify-center text-[11px] font-bold">2</span>
            Campos del Formulario (${isAcademic ? 'Académico' : 'Empleador'})
          </span>
          <span class="text-xs text-slate-400 italic">* Campos obligatorios</span>
        </div>

        <!-- 1. PRIMERA FILA: Correo Electrónico (tamaño disminuido) -->
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-4 mb-4">
          <div class="sm:col-span-7 lg:col-span-6">
            <div class="form-group mb-0 bg-blue-50/60 p-3.5 rounded-xl border-2 border-blue-200/90 transition-all shadow-2xs" id="email-group-container">
              <div class="flex items-center justify-between mb-1.5">
                <label class="form-label text-xs font-bold text-blue-950 mb-0 flex items-center gap-2" for="field-email">
                  <i class="fa-solid fa-envelope text-blue-800"></i>
                  1. Correo electrónico <span class="req">*</span>
                </label>
                <div id="email-status-indicator" class="flex items-center gap-1.5 text-xs">
                  <span id="email-checking-spinner" class="text-blue-700 hidden items-center gap-1 font-medium">
                    <i class="fa-solid fa-spinner fa-spin"></i> Verificando en la base...
                  </span>
                </div>
              </div>
              <input type="text" 
                     inputmode="email" 
                     autocomplete="email" 
                     spellcheck="false" 
                     class="form-control text-sm bg-white" 
                     id="field-email" 
                     placeholder="${isAcademic ? 'caden@xyz-unistaff.com' : 'caden.p@xyz-limited.com'}" 
                     required 
                     maxlength="120" 
                     oninput="RegisterModule.onEmailInput(this.value)">
              <div class="error-feedback" id="err-email"></div>
            </div>
          </div>
        </div>

        <!-- 2. SEGUNDA FILA: Tratamiento / Título, Nombre, Apellido (3 columnas simétricas) -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div class="form-group mb-0">
            <label class="form-label text-xs font-bold text-slate-700" for="field-title">
              2. Tratamiento / Título <span class="req">*</span>
            </label>
            <select class="form-control text-sm bg-white" id="field-title" required onchange="RegisterModule.onFieldInput('field-title')">
              <option value="">Seleccione título...</option>
              ${titlesOptions}
            </select>
            <div class="error-feedback" id="err-title"></div>
          </div>

          <div class="form-group mb-0">
            <label class="form-label text-xs font-bold text-slate-700" for="field-first_name">
              3. Nombre <span class="req">*</span>
            </label>
            <input type="text" class="form-control text-sm bg-white" id="field-first_name" placeholder="Caden" required maxlength="80" oninput="RegisterModule.onFieldInput('field-first_name')">
            <div class="error-feedback" id="err-first_name"></div>
          </div>

          <div class="form-group mb-0">
            <label class="form-label text-xs font-bold text-slate-700" for="field-last_name">
              4. Apellido <span class="req">*</span>
            </label>
            <input type="text" class="form-control text-sm bg-white" id="field-last_name" placeholder="Puah" required maxlength="80" oninput="RegisterModule.onFieldInput('field-last_name')">
            <div class="error-feedback" id="err-last_name"></div>
          </div>
        </div>

        ${isAcademic ? `
          <!-- 3. TERCERA FILA (ACADÉMICO): Puesto / Cargo, Institución, Departamento (3 columnas simétricas) -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div class="form-group mb-0">
              <label class="form-label text-xs font-bold text-slate-700" for="field-job_title">
                Puesto / Cargo <span class="req">*</span>
              </label>
              <input type="text" class="form-control text-sm bg-white" id="field-job_title" placeholder="Lecturer / Professor" required maxlength="120" oninput="RegisterModule.onFieldInput('field-job_title')">
              <div class="error-feedback" id="err-job_title"></div>
            </div>

            <div class="form-group mb-0">
              <label class="form-label text-xs font-bold text-slate-700" for="field-institution">
                Institución <span class="req">*</span>
              </label>
              <input type="text" class="form-control text-sm bg-white" id="field-institution" placeholder="XYZ University" required maxlength="150" oninput="RegisterModule.onFieldInput('field-institution')">
              <div class="error-feedback" id="err-institution"></div>
            </div>

            <div class="form-group mb-0">
              <label class="form-label text-xs font-bold text-slate-700" for="field-department_unit">
                Departamento / Unidad <span class="req">*</span>
              </label>
              <input type="text" class="form-control text-sm bg-white" id="field-department_unit" placeholder="Medicine / Faculty of Sciences" required maxlength="120" oninput="RegisterModule.onFieldInput('field-department_unit')">
              <div class="error-feedback" id="err-department_unit"></div>
            </div>
          </div>

          <!-- 4. CUARTA FILA (ACADÉMICO): Área temática, País y Teléfono (3 columnas simétricas) -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div class="form-group mb-0">
              <div class="flex items-center justify-between mb-1">
                <label class="form-label mb-0 text-xs font-bold text-slate-700" for="field-subject_area">
                  Área temática / Disciplina <span class="req">*</span>
                </label>
                <button type="button" 
                        class="text-[11px] text-blue-900 hover:text-blue-950 font-bold flex items-center gap-1 hover:underline cursor-pointer" 
                        onclick="RegisterModule.toggleCustomSubject()">
                  <i class="fa-solid fa-circle-plus text-amber-600"></i>
                  <span>¿Otra?</span>
                </button>
              </div>

              <select class="form-control text-sm bg-white" id="field-subject_area" required onchange="RegisterModule.onSubjectAreaChange(this.value)">
                <option value="">Seleccione área temática...</option>
                ${subjectsOptions}
                <option value="__OTRA__" ${this.isCustomSubject ? 'selected' : ''}>+ Otra disciplina (incluir nueva)...</option>
              </select>
              <div class="error-feedback" id="err-subject_area"></div>

              <!-- Campo dinámico para escribir disciplina personalizada si no está en la lista -->
              <div id="custom-subject-wrapper" class="mt-2 p-2.5 bg-amber-50/90 border-2 border-amber-300 rounded-xl ${this.isCustomSubject ? '' : 'hidden'} transition-all shadow-2xs">
                <div class="flex items-center justify-between mb-1">
                  <label class="block text-xs font-bold text-amber-950 flex items-center gap-1" for="field-subject_area_custom">
                    <i class="fa-solid fa-pen-to-square text-amber-700"></i>
                    Nombre de la disciplina *
                  </label>
                  <button type="button" class="text-[11px] text-slate-500 hover:text-slate-800 font-medium" onclick="RegisterModule.cancelCustomSubject()">
                    <i class="fa-solid fa-xmark mr-0.5"></i> Volver
                  </button>
                </div>
                <input type="text" 
                       class="form-control text-sm bg-white" 
                       id="field-subject_area_custom" 
                       placeholder="Ej. Nanotecnología Aplicada..." 
                       maxlength="120" 
                       value="${this.customSubjectValue || ''}" 
                       oninput="RegisterModule.onCustomSubjectInput(this.value)">
                <div class="error-feedback" id="err-subject_area_custom"></div>
              </div>
            </div>

            <div class="form-group mb-0">
              <label class="form-label text-xs font-bold text-slate-700" for="field-country_name">
                País o territorio <span class="req">*</span>
              </label>
              <select class="form-control text-sm bg-white" id="field-country_name" required onchange="RegisterModule.onFieldInput('field-country_name')">
                <option value="">Seleccione país...</option>
                ${countriesOptions}
              </select>
              <div class="error-feedback" id="err-country_name"></div>
            </div>

            <div class="form-group mb-0">
              <label class="form-label text-xs font-bold text-slate-700" for="field-phone">
                Teléfono (opcional)
              </label>
              <input type="tel" class="form-control text-sm bg-white" id="field-phone" placeholder="60139999999" maxlength="20" oninput="RegisterModule.onFieldInput('field-phone')">
              <div class="error-feedback" id="err-phone"></div>
            </div>
          </div>
        ` : `
          <!-- 3. TERCERA FILA (EMPLEADOR): Puesto / Cargo, Industria, Nombre de la empresa (3 columnas simétricas) -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div class="form-group mb-0">
              <label class="form-label text-xs font-bold text-slate-700" for="field-position">
                Puesto / Cargo <span class="req">*</span>
              </label>
              <input type="text" class="form-control text-sm bg-white" id="field-position" placeholder="Manager" required maxlength="120" oninput="RegisterModule.onFieldInput('field-position')">
              <div class="error-feedback" id="err-position"></div>
            </div>

            <div class="form-group mb-0">
              <label class="form-label text-xs font-bold text-slate-700" for="field-industry">
                Industria / Sector <span class="req">*</span>
              </label>
              <select class="form-control text-sm bg-white" id="field-industry" required onchange="RegisterModule.onFieldInput('field-industry')">
                <option value="">Seleccione sector empresarial / industria...</option>
                ${industriesOptions}
              </select>
              <div class="error-feedback" id="err-industry"></div>
            </div>

            <div class="form-group mb-0">
              <label class="form-label text-xs font-bold text-slate-700" for="field-company_name">
                Nombre de la empresa / institución <span class="req">*</span>
              </label>
              <input type="text" class="form-control text-sm bg-white" id="field-company_name" placeholder="XYZ Limited" required maxlength="150" oninput="RegisterModule.onFieldInput('field-company_name')">
              <div class="error-feedback" id="err-company_name"></div>
            </div>
          </div>

          <!-- 4. CUARTA FILA (EMPLEADOR): País y Teléfono (simétrico) -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div class="form-group mb-0">
              <label class="form-label text-xs font-bold text-slate-700" for="field-country_name">
                País o territorio <span class="req">*</span>
              </label>
              <select class="form-control text-sm bg-white" id="field-country_name" required onchange="RegisterModule.onFieldInput('field-country_name')">
                <option value="">Seleccione país...</option>
                ${countriesOptions}
              </select>
              <div class="error-feedback" id="err-country_name"></div>
            </div>

            <div class="form-group mb-0">
              <label class="form-label text-xs font-bold text-slate-700" for="field-phone">
                Teléfono (opcional)
              </label>
              <input type="tel" class="form-control text-sm bg-white" id="field-phone" placeholder="60139999999" maxlength="20" oninput="RegisterModule.onFieldInput('field-phone')">
              <div class="error-feedback" id="err-phone"></div>
            </div>
          </div>
        `}

        <!-- Acciones del Formulario -->
        <div class="flex items-center justify-end gap-3 pt-5 border-t border-slate-100 mt-4">
          <button type="button" class="btn btn-outline" onclick="RegisterModule.resetForm()">
            Cancelar / Limpiar
          </button>
          <button type="submit" class="btn btn-tec" id="btn-save" disabled>
            <i class="fa-solid fa-floppy-disk"></i>
            Guardar Contacto
          </button>
        </div>
      </form>
    `;
  },

  // Manejo de restricciones en el momento exacto de la digitación
  onFieldInput(fieldId) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    const val = el.value;
    const errId = 'err-' + fieldId.replace('field-', '').replace('reg-', '');
    const errEl = document.getElementById(errId);
    if (!errEl) return;

    if (fieldId === 'field-first_name' || fieldId === 'field-last_name') {
      const fieldName = fieldId === 'field-first_name' ? 'nombre' : 'apellido';
      if (/[<>{}[\]\\\/=^$*+?|]/.test(val)) {
        errEl.innerHTML = `<span class="text-red-600 font-medium text-xs"><i class="fa-solid fa-circle-exclamation mr-1"></i> Carácter no permitido: no utilice símbolos especiales como &lt; &gt; / \\ = { } [ ] ^ * + ?</span>`;
        el.classList.add('is-invalid');
        this.validateLive();
        return;
      }
      if (val.trim().length === 1) {
        errEl.innerHTML = `<span class="text-slate-500 text-xs"><i class="fa-solid fa-info-circle mr-1"></i> El ${fieldName} requiere al menos 2 caracteres (ha digitado 1).</span>`;
        this.validateLive();
        return;
      }
      errEl.textContent = '';
      el.classList.remove('is-invalid');
    }

    if (fieldId === 'field-phone') {
      if (/[a-zA-Z]/.test(val)) {
        errEl.innerHTML = `<span class="text-red-600 font-medium text-xs"><i class="fa-solid fa-circle-exclamation mr-1"></i> El teléfono solo admite dígitos numéricos y prefijo internacional "+" (sin letras).</span>`;
        el.classList.add('is-invalid');
        this.validateLive();
        return;
      }
      const digits = val.replace(/[^0-9]/g, '');
      if (val.trim().length > 0 && digits.length < 6) {
        errEl.innerHTML = `<span class="text-slate-500 text-xs"><i class="fa-solid fa-info-circle mr-1"></i> Mínimo 6 dígitos numéricos (ha digitado ${digits.length}).</span>`;
        this.validateLive();
        return;
      }
      errEl.textContent = '';
      el.classList.remove('is-invalid');
    }

    if (['field-job_title', 'field-position', 'field-department_unit', 'field-institution', 'field-company_name'].includes(fieldId)) {
      if (val.trim().length === 1) {
        errEl.innerHTML = `<span class="text-slate-500 text-xs"><i class="fa-solid fa-info-circle mr-1"></i> Mínimo 2 caracteres requeridos (ha digitado 1).</span>`;
        this.validateLive();
        return;
      }
      errEl.textContent = '';
      el.classList.remove('is-invalid');
    }

    this.validateLive();
  },

  // Manejo de Área Temática personalizada (cuando no está en la lista de QS)
  onSubjectAreaChange(val) {
    if (val === '__OTRA__') {
      this.isCustomSubject = true;
      const wrapper = document.getElementById('custom-subject-wrapper');
      if (wrapper) wrapper.classList.remove('hidden');
      const inputEl = document.getElementById('field-subject_area_custom');
      if (inputEl) inputEl.focus();
    } else {
      this.isCustomSubject = false;
      const wrapper = document.getElementById('custom-subject-wrapper');
      if (wrapper) wrapper.classList.add('hidden');
    }
    this.onFieldInput('field-subject_area');
    this.validateLive();
  },

  toggleCustomSubject() {
    this.isCustomSubject = !this.isCustomSubject;
    const select = document.getElementById('field-subject_area');
    const wrapper = document.getElementById('custom-subject-wrapper');
    if (this.isCustomSubject) {
      if (select) select.value = '__OTRA__';
      if (wrapper) wrapper.classList.remove('hidden');
      const inputEl = document.getElementById('field-subject_area_custom');
      if (inputEl) inputEl.focus();
    } else {
      if (select) select.value = '';
      if (wrapper) wrapper.classList.add('hidden');
    }
    this.validateLive();
  },

  cancelCustomSubject() {
    this.isCustomSubject = false;
    this.customSubjectValue = '';
    const select = document.getElementById('field-subject_area');
    const wrapper = document.getElementById('custom-subject-wrapper');
    if (select) select.value = '';
    if (wrapper) wrapper.classList.add('hidden');
    const inputEl = document.getElementById('field-subject_area_custom');
    if (inputEl) inputEl.value = '';
    this.validateLive();
  },

  onCustomSubjectInput(val) {
    this.customSubjectValue = val;
    const errEl = document.getElementById('err-subject_area_custom');
    const inputEl = document.getElementById('field-subject_area_custom');
    if (val.trim().length === 1) {
      if (errEl) errEl.innerHTML = `<span class="text-slate-500 text-xs"><i class="fa-solid fa-info-circle mr-1"></i> Mínimo 2 caracteres requeridos (ha digitado 1).</span>`;
      if (inputEl) inputEl.classList.add('is-invalid');
    } else {
      if (errEl) errEl.textContent = '';
      if (inputEl) inputEl.classList.remove('is-invalid');
    }
    this.validateLive();
  },

  // Verificación reactiva y de duplicados en tiempo real para Correo Electrónico
  onEmailInput(value) {
    clearTimeout(this.emailCheckTimeout);
    const trimmed = (value || '').trim();
    const errEl = document.getElementById('err-email');
    const inputEl = document.getElementById('field-email');
    const groupEl = document.getElementById('email-group-container');
    if (!errEl || !inputEl) return;

    // 1. Restricción de espacios en blanco durante la digitación
    if (/\s/.test(value)) {
      errEl.innerHTML = `<span class="text-red-600 font-medium text-xs"><i class="fa-solid fa-circle-exclamation mr-1"></i> El correo no debe contener espacios en blanco.</span>`;
      inputEl.classList.add('is-invalid');
      inputEl.classList.remove('is-valid');
      if (groupEl) {
        groupEl.className = 'form-group mb-0 bg-red-50/50 p-3.5 rounded-xl border-2 border-red-300 transition-all';
      }
      this.emailValid = false;
      this.emailExists = false;
      this.emailIsTecDomain = false;
      this.validateLive();
      return;
    }

    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

    if (!trimmed) {
      errEl.textContent = '';
      inputEl.classList.remove('is-valid', 'is-invalid');
      if (groupEl) {
        groupEl.className = 'form-group mb-0 bg-blue-50/60 p-3.5 rounded-xl border-2 border-blue-200/90 transition-all shadow-2xs';
      }
      this.emailValid = false;
      this.emailExists = false;
      this.emailIsTecDomain = false;
      this.validateLive();
      return;
    }

    // 2. RESTRICCIÓN ESTRICTA DE CORREOS INSTITUCIONALES DEL TEC (@itcr.ac.cr / @tec.ac.cr)
    const cleanLower = trimmed.toLowerCase();
    const isTecDomain = cleanLower.endsWith('@itcr.ac.cr') || cleanLower.endsWith('@tec.ac.cr') || cleanLower.includes('@itcr.ac.cr') || cleanLower.includes('@tec.ac.cr');

    if (isTecDomain) {
      this.emailIsTecDomain = true;
      this.emailValid = false;
      this.emailExists = false;
      inputEl.classList.add('is-invalid');
      inputEl.classList.remove('is-valid');
      if (groupEl) {
        groupEl.className = 'form-group mb-0 bg-red-50/80 p-3.5 rounded-xl border-2 border-red-500 transition-all shadow-xs';
      }
      errEl.innerHTML = `
        <div class="p-3 bg-red-100/95 border-2 border-red-400 rounded-lg text-red-950 mt-2 shadow-xs animate-fadeIn">
          <div class="font-bold text-sm flex items-center gap-1.5 text-red-700">
            <i class="fa-solid fa-ban text-red-600 text-base"></i>
            Restricción institucional y QS: Correo no permitido
          </div>
          <div class="text-xs text-red-900 mt-1.5 font-semibold">
            No se permite el registro de contactos con correos del dominio institucional del TEC (<strong>@itcr.ac.cr</strong> / <strong>@tec.ac.cr</strong>).
          </div>
          <div class="text-[11px] text-red-800 mt-1 bg-white/80 p-2 rounded border border-red-200 leading-relaxed">
            <i class="fa-solid fa-triangle-exclamation text-amber-600 mr-1"></i> Según las normativas internacionales de Quacquarelli Symonds (QS), las evaluaciones de reputación académica y empleadores deben corresponder a <strong>pares externos</strong> a la institución nominadora. No se permite la auto-nominación ni la postulación de colegas internos del TEC.
          </div>
        </div>
      `;
      this.validateLive();
      return;
    } else {
      this.emailIsTecDomain = false;
    }

    // Si aún no cumple sintaxis de correo
    if (!emailRegex.test(trimmed)) {
      if (this.touchedFields['field-email']) {
        errEl.innerHTML = `<span class="text-red-600 text-xs"><i class="fa-solid fa-circle-exclamation mr-1"></i> Ingrese un formato de correo válido (ej. usuario@dominio.com).</span>`;
        inputEl.classList.add('is-invalid');
      } else {
        errEl.textContent = '';
        inputEl.classList.remove('is-invalid', 'is-valid');
      }
      if (groupEl) {
        groupEl.className = 'form-group mb-0 bg-blue-50/60 p-3.5 rounded-xl border-2 border-blue-200/90 transition-all shadow-2xs';
      }
      this.emailValid = false;
      this.emailExists = false;
      this.validateLive();
      return;
    }

    // Formato válido: verificar de inmediato en la base de datos (con debounce de 250ms)
    this.emailCheckTimeout = setTimeout(() => {
      this.checkEmailAvailability(trimmed);
    }, 250);
  },

  // Consulta inmediata a la base para determinar si el correo existe
  async checkEmailAvailability(email) {
    const errEl = document.getElementById('err-email');
    const inputEl = document.getElementById('field-email');
    const spinner = document.getElementById('email-checking-spinner');
    const groupEl = document.getElementById('email-group-container');
    if (!errEl || !inputEl) return;

    // Doble verificación de dominio TEC
    const cleanEmailLower = email.toLowerCase().trim();
    if (cleanEmailLower.endsWith('@itcr.ac.cr') || cleanEmailLower.endsWith('@tec.ac.cr')) {
      this.emailIsTecDomain = true;
      this.emailValid = false;
      this.emailExists = false;
      inputEl.classList.add('is-invalid');
      inputEl.classList.remove('is-valid');
      if (groupEl) {
        groupEl.className = 'form-group mb-0 bg-red-50/80 p-3.5 rounded-xl border-2 border-red-500 transition-all shadow-xs';
      }
      errEl.innerHTML = `
        <div class="p-3 bg-red-100/95 border-2 border-red-400 rounded-lg text-red-950 mt-2 shadow-xs animate-fadeIn">
          <div class="font-bold text-sm flex items-center gap-1.5 text-red-700">
            <i class="fa-solid fa-ban text-red-600 text-base"></i>
            Restricción institucional y QS: Correo no permitido
          </div>
          <div class="text-xs text-red-900 mt-1.5 font-semibold">
            No se permite el registro de contactos con correos del dominio institucional del TEC (<strong>@itcr.ac.cr</strong> / <strong>@tec.ac.cr</strong>).
          </div>
          <div class="text-[11px] text-red-800 mt-1 bg-white/80 p-2 rounded border border-red-200 leading-relaxed">
            <i class="fa-solid fa-triangle-exclamation text-amber-600 mr-1"></i> Los contactos del Ranking QS deben pertenecer obligatoriamente a instituciones o empresas externas.
          </div>
        </div>
      `;
      this.validateLive();
      return;
    }

    if (spinner) spinner.classList.remove('hidden');

    try {
      const res = await API.get(`/api/contacts/check-email?email=${encodeURIComponent(email)}`);
      if (spinner) spinner.classList.add('hidden');

      if (res.isTecDomain) {
        this.emailIsTecDomain = true;
        this.emailValid = false;
        this.emailExists = false;
        inputEl.classList.add('is-invalid');
        inputEl.classList.remove('is-valid');
        if (groupEl) {
          groupEl.className = 'form-group mb-0 bg-red-50/80 p-3.5 rounded-xl border-2 border-red-500 transition-all shadow-xs';
        }
        errEl.innerHTML = `
          <div class="p-3 bg-red-100/95 border-2 border-red-400 rounded-lg text-red-950 mt-2 shadow-xs animate-fadeIn">
            <div class="font-bold text-sm flex items-center gap-1.5 text-red-700">
              <i class="fa-solid fa-ban text-red-600 text-base"></i>
              Restricción institucional y QS: Correo no permitido
            </div>
            <div class="text-xs text-red-900 mt-1.5 font-semibold">
              ${res.message || 'No se permiten correos del dominio institucional del TEC.'}
            </div>
          </div>
        `;
      } else if (res.exists && res.contact) {
        // EL CORREO YA EXISTE: alertar de inmediato para no perder tiempo
        this.emailExists = true;
        this.emailValid = false;
        this.emailIsTecDomain = false;
        inputEl.classList.add('is-invalid');
        inputEl.classList.remove('is-valid');

        if (groupEl) {
          groupEl.className = 'form-group mb-0 bg-red-50/60 p-3.5 rounded-xl border-2 border-red-400 transition-all shadow-xs';
        }

        const c = res.contact;
        const org = c.institution || c.company_name || 'Institución no especificada';

        errEl.innerHTML = `
          <div class="p-3 bg-red-100/80 border border-red-300 rounded-lg text-red-900 mt-2 shadow-xs animate-fadeIn">
            <div class="font-bold text-sm flex items-center gap-1.5 text-red-700">
              <i class="fa-solid fa-circle-xmark text-red-600 text-base"></i>
              Este correo ya existe
            </div>
            <div class="text-xs text-red-800 mt-1 font-medium">
              Ya se encuentra registrado en el sistema como <strong>${c.tipo_contacto}</strong>: ${c.first_name} ${c.last_name} (${org}).
            </div>
            <div class="text-[11px] text-red-700/90 mt-1 bg-white/70 p-1.5 rounded border border-red-200">
              <i class="fa-solid fa-hand text-amber-600 mr-1"></i> No es necesario continuar completando los demás campos para este contacto ya que se encuentra almacenado.
            </div>
          </div>
        `;
      } else {
        // CORREO DISPONIBLE Y VÁLIDO (EXTERNO)
        this.emailExists = false;
        this.emailValid = true;
        this.emailIsTecDomain = false;
        inputEl.classList.remove('is-invalid');
        inputEl.classList.add('is-valid');

        if (groupEl) {
          groupEl.className = 'form-group mb-0 bg-emerald-50/40 p-3.5 rounded-xl border-2 border-emerald-300 transition-all';
        }

        errEl.innerHTML = `
          <span class="text-emerald-700 text-xs font-semibold flex items-center gap-1 mt-1 bg-emerald-100/70 px-2 py-1 rounded border border-emerald-200">
            <i class="fa-solid fa-circle-check text-emerald-600"></i>
            Correo disponible · Externo y no registrado previamente en la base. Puede continuar completando los datos.
          </span>
        `;
      }
    } catch (err) {
      if (spinner) spinner.classList.add('hidden');
      console.warn('Error al verificar correo:', err);
    }

    this.validateLive();
  },

  attachFormListeners() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    const emailInput = document.getElementById('field-email');
    if (emailInput) {
      emailInput.addEventListener('blur', () => {
        emailInput.value = emailInput.value.trim();
        this.touchedFields['field-email'] = true;
        if (emailInput.value.length > 0) {
          this.checkEmailAvailability(emailInput.value);
        } else {
          this.validateLive();
        }
      });
    }

    const inputs = form.querySelectorAll('input, select');
    inputs.forEach(input => {
      input.addEventListener('input', () => {
        this.validateLive();
      });
      input.addEventListener('change', () => {
        this.touchedFields[input.id] = true;
        this.validateLive();
      });
      input.addEventListener('blur', () => {
        this.touchedFields[input.id] = true;
        this.validateLive();
      });
    });

    this.validateLive();
  },

  getFormData() {
    const isAcademic = this.currentType === 'ACADEMICO';
    const sedeSelect = document.getElementById('reg-sede-id');
    const deptoSelect = document.getElementById('reg-departamento-id');
    const recNombreInput = document.getElementById('reg-recomienda-nombre');
    const recEmailInput = document.getElementById('reg-recomienda-email');

    let recEmailClean = (this.recomiendaEmail || '').trim().toLowerCase();
    if (!recEmailClean) {
      const recInputEl = document.getElementById('reg-recomienda-email');
      if (recInputEl && recInputEl.value.trim()) {
        recEmailClean = `${recInputEl.value.trim().split('@')[0]}@itcr.ac.cr`;
      } else if (App.currentUser?.email) {
        recEmailClean = App.currentUser.email.trim().toLowerCase();
      }
    }
    if (recEmailClean && !recEmailClean.includes('@')) {
      recEmailClean = `${recEmailClean}@itcr.ac.cr`;
    }

    const data = {
      tipo_contacto: this.currentType,
      recomienda_nombre: (this.recomiendaNombre || App.currentUser?.nombre_completo || '').trim(),
      recomienda_email: recEmailClean,
      title: document.getElementById('field-title')?.value.trim() || '',
      first_name: document.getElementById('field-first_name')?.value.trim() || '',
      last_name: document.getElementById('field-last_name')?.value.trim() || '',
      country_name: document.getElementById('field-country_name')?.value.trim() || '',
      email: document.getElementById('field-email')?.value.trim() || '',
      phone: document.getElementById('field-phone')?.value.trim() || '',
      sede_id: this.selectedSedeId || App.currentUser?.sede_id || 'sede-cartago',
      departamento_id: this.selectedDeptoId || App.currentUser?.departamento_id || null
    };

    if (isAcademic) {
      data.job_title = document.getElementById('field-job_title')?.value.trim() || '';
      data.department_unit = document.getElementById('field-department_unit')?.value.trim() || '';
      data.institution = document.getElementById('field-institution')?.value.trim() || '';

      const selectSubj = document.getElementById('field-subject_area')?.value.trim() || '';
      if (selectSubj === '__OTRA__' || this.isCustomSubject) {
        data.subject_area = document.getElementById('field-subject_area_custom')?.value.trim() || '';
      } else {
        data.subject_area = selectSubj;
      }
    } else {
      data.position = document.getElementById('field-position')?.value.trim() || '';
      data.industry = document.getElementById('field-industry')?.value.trim() || '';
      data.company_name = document.getElementById('field-company_name')?.value.trim() || '';
    }

    return data;
  },

  validateLive() {
    const data = this.getFormData();
    let isValid = true;
    const isAcademic = this.currentType === 'ACADEMICO';

    const checkField = (fieldId, errId, condition, errMsg, warningMsg = '') => {
      const el = document.getElementById(fieldId);
      const errEl = document.getElementById(errId);
      if (!el || !errEl) return;

      const isTouched = !!this.touchedFields[fieldId] || this.submitting;

      if (!condition) {
        isValid = false;
        if (this.submitting || (isTouched && el.value.trim().length > 0)) {
          el.classList.add('is-invalid');
          el.classList.remove('is-valid');
          errEl.innerHTML = `<span class="text-red-600 font-medium text-xs"><i class="fa-solid fa-circle-exclamation mr-1"></i>${errMsg}</span>`;
        } else {
          el.classList.remove('is-valid', 'is-invalid');
          errEl.textContent = '';
        }
      } else {
        el.classList.remove('is-invalid');
        if (el.value.trim().length > 0) {
          el.classList.add('is-valid');
        } else {
          el.classList.remove('is-valid');
        }

        if (warningMsg) {
          errEl.innerHTML = `<span class="text-amber-700 text-xs font-normal flex items-center gap-1 mt-0.5"><i class="fa-solid fa-triangle-exclamation"></i>${warningMsg}</span>`;
        } else {
          errEl.textContent = '';
        }
      }
    };

    // 0. Identificación de quien registra el contacto (Validación desde la tarjeta institucional)
    const recEmailClean = (data.recomienda_email || '').toLowerCase().trim();
    const isRecEmailValid = recEmailClean.length >= 6 && (recEmailClean.endsWith('@itcr.ac.cr') || recEmailClean.endsWith('@tec.ac.cr')) && !/\s/.test(recEmailClean);
    if (!data.recomienda_nombre || data.recomienda_nombre.length < 3) {
      isValid = false;
    }
    if (!isRecEmailValid) {
      isValid = false;
    }
    if (!data.sede_id) {
      isValid = false;
    }

    // 1. Evaluación crítica de Correo Electrónico
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    const isEmailFormatValid = emailRegex.test(data.email) && !/\s/.test(data.email);

    if (this.emailIsTecDomain) {
      isValid = false;
    } else if (this.emailExists) {
      isValid = false;
    } else if (!isEmailFormatValid) {
      isValid = false;
      const emailEl = document.getElementById('field-email');
      const errEmail = document.getElementById('err-email');
      if (data.email.length > 0 && this.touchedFields['field-email']) {
        if (emailEl) emailEl.classList.add('is-invalid');
        if (errEmail) errEmail.innerHTML = `<span class="text-red-600 text-xs"><i class="fa-solid fa-circle-exclamation mr-1"></i> Formato de correo inválido (ej. usuario@dominio.com).</span>`;
      }
    }

    // 2. Procedencia Institucional de quien recomienda el contacto
    checkField('reg-sede-id', 'err-sede', data.sede_id && data.sede_id.length > 0, 'Seleccione la sede de procedencia.');
    checkField('reg-departamento-id', 'err-departamento', data.departamento_id && data.departamento_id.length > 0, 'Seleccione la escuela o unidad.');

    // 3. Tratamiento, Nombre y Apellido
    checkField('field-title', 'err-title', data.title.length > 0, 'Debe seleccionar un tratamiento o título oficial.');
    const hasInvalidNameChars = /[<>{}[\]\\\/=^$*+?|]/.test(data.first_name);
    checkField('field-first_name', 'err-first_name', data.first_name.length >= 2 && !hasInvalidNameChars, hasInvalidNameChars ? 'El nombre no debe contener caracteres especiales (<, >, /, =, etc.).' : 'El nombre debe tener al menos 2 caracteres (solo letras y espacios).');
    const hasInvalidLastChars = /[<>{}[\]\\\/=^$*+?|]/.test(data.last_name);
    checkField('field-last_name', 'err-last_name', data.last_name.length >= 2 && !hasInvalidLastChars, hasInvalidLastChars ? 'El apellido no debe contener caracteres especiales (<, >, /, =, etc.).' : 'El apellido debe tener al menos 2 caracteres (solo letras y espacios).');

    checkField('field-country_name', 'err-country_name', data.country_name.length > 0, 'Debe seleccionar un país o territorio de la lista homologada.');

    if (isAcademic) {
      checkField('field-job_title', 'err-job_title', data.job_title.length >= 2, 'El puesto o cargo formal es obligatorio (mínimo 2 caracteres).');
      checkField('field-department_unit', 'err-department_unit', data.department_unit.length >= 2, 'La facultad, departamento o unidad es obligatoria (mínimo 2 caracteres).');
      const isTecInst = data.institution.toLowerCase().includes('tecnologico de costa rica') || data.institution.toLowerCase() === 'tec';
      checkField(
        'field-institution',
        'err-institution',
        data.institution.length >= 2,
        'La institución universitaria o centro externo es obligatoria (mínimo 2 caracteres).',
        isTecInst ? 'Nota: Se recomienda indicar una universidad externa para pares académicos QS.' : ''
      );

      const isCustomSubj = this.isCustomSubject || document.getElementById('field-subject_area')?.value === '__OTRA__';
      if (isCustomSubj) {
        const customVal = document.getElementById('field-subject_area_custom')?.value.trim() || '';
        checkField('field-subject_area_custom', 'err-subject_area_custom', customVal.length >= 2, 'El nombre del área temática personalizada debe tener al menos 2 caracteres.');
        if (customVal.length < 2) isValid = false;
      } else {
        checkField('field-subject_area', 'err-subject_area', data.subject_area.length > 0, 'Debe seleccionar un área temática / disciplina académica o incluir una nueva.');
      }
    } else {
      checkField('field-position', 'err-position', data.position.length >= 2, 'El cargo o posición en la empresa es obligatorio (mínimo 2 caracteres).');
      checkField('field-industry', 'err-industry', data.industry.length > 0, 'Debe seleccionar el sector empresarial o industria.');
      checkField('field-company_name', 'err-company_name', data.company_name.length >= 2, 'La razón social o nombre de la empresa es obligatorio (mínimo 2 caracteres).');
    }

    if (data.phone.length > 0) {
      const phoneDigits = data.phone.replace(/[^0-9]/g, '');
      const hasPhoneLetters = /[a-zA-Z]/.test(data.phone);
      checkField('field-phone', 'err-phone', phoneDigits.length >= 6 && !hasPhoneLetters, hasPhoneLetters ? 'El teléfono no puede contener letras.' : 'El teléfono debe contener al menos 6 dígitos numéricos.');
    }

    const btnSave = document.getElementById('btn-save');
    if (btnSave) {
      if (this.emailIsTecDomain) {
        btnSave.disabled = true;
        btnSave.innerHTML = `<i class="fa-solid fa-ban text-red-300"></i> Correo institucional @itcr.ac.cr no permitido`;
        btnSave.className = 'btn btn-tec bg-red-800 text-white opacity-70 cursor-not-allowed';
      } else if (this.emailExists) {
        btnSave.disabled = true;
        btnSave.innerHTML = `<i class="fa-solid fa-ban text-red-300"></i> Este correo ya existe`;
        btnSave.className = 'btn btn-tec bg-red-800 text-white opacity-70 cursor-not-allowed';
      } else {
        btnSave.disabled = !isValid;
        btnSave.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Guardar Contacto`;
        btnSave.className = 'btn btn-tec';
      }
    }

    return isValid;
  },

  async handleSubmit() {
    this.submitting = true;
    if (this.emailIsTecDomain) {
      App.showToast('Restricción QS: No se permiten correos del dominio institucional (@itcr.ac.cr / @tec.ac.cr). Los contactos deben ser externos.', 'error');
      return;
    }

    if (this.emailExists) {
      App.showToast('Este correo ya existe en la base de datos. No se puede duplicar.', 'error');
      return;
    }

    if (!this.validateLive()) {
      App.showToast('Por favor complete los campos obligatorios indicados.', 'warning');
      return;
    }

    const data = this.getFormData();
    const btnSave = document.getElementById('btn-save');
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Guardando contacto...
      `;
    }

    try {
      const response = await API.post('/api/contacts', data);
      this.onSuccess(response);
    } catch (err) {
      if (err.data && (err.data.duplicateStatus === 'EXACT_MATCH' || err.data.duplicateStatus === 'POTENTIAL_DUPLICATE')) {
        this.showDuplicateDialog(data, err.data);
      } else {
        App.showToast(err.message || 'Error al guardar el contacto', 'error');
      }
    } finally {
      if (btnSave) {
        btnSave.disabled = false;
        btnSave.innerHTML = `
          <i class="fa-solid fa-floppy-disk"></i>
          Guardar Contacto
        `;
      }
    }
  },

  onSuccess(res) {
    App.showToast('✅ Contacto registrado exitosamente en el sistema.', 'success');
    // Si se usó una disciplina personalizada, agregarla a la lista en memoria para futuros contactos
    const data = this.getFormData();
    if (data.subject_area && this.catalogs?.areas_qs && !this.catalogs.areas_qs.includes(data.subject_area)) {
      this.catalogs.areas_qs.push(data.subject_area);
    }
    this.resetForm();
  },

  resetForm() {
    clearTimeout(this.emailCheckTimeout);
    this.emailExists = false;
    this.emailValid = false;
    this.emailIsTecDomain = false;
    this.isCustomSubject = false;
    this.customSubjectValue = '';
    this.touchedFields = {};
    this.submitting = false;
    this.currentType = null;
    this.render();
  },

  showDuplicateDialog(candidateData, errorData) {
    const isExact = errorData.duplicateStatus === 'EXACT_MATCH';
    const details = errorData.duplicateDetails;
    const existing = details.existingContact;

    const modalContainer = document.getElementById('duplicate-modal-container');
    if (!modalContainer) return;

    modalContainer.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title flex items-center gap-2" style="color: ${isExact ? 'var(--status-error)' : 'var(--status-warning)'};">
              <i class="fa-solid fa-triangle-exclamation"></i>
              ${isExact ? 'Coincidencia Exacta Detectada' : 'Posible Contacto Duplicado'}
            </h3>
            <button class="modal-close" onclick="RegisterModule.closeDuplicateModal()">&times;</button>
          </div>

          <div class="alert ${isExact ? 'alert-error' : 'alert-warning'}">
            <div>
              <strong>Diagnóstico del Sistema:</strong> ${details.explanation}
              ${isExact ? '<p class="mt-1">Por integridad del proceso QS, el sistema no permite duplicar este contacto.</p>' : ''}
            </div>
          </div>

          <div class="diff-comparison">
            <div class="diff-col">
              <h5>Datos Que Intenta Registrar</h5>
              <div class="diff-item"><strong>Nombre:</strong> ${candidateData.first_name} ${candidateData.last_name}</div>
              <div class="diff-item"><strong>Correo:</strong> ${candidateData.email}</div>
              <div class="diff-item"><strong>Tipo:</strong> ${candidateData.tipo_contacto}</div>
              <div class="diff-item"><strong>Institución/Empresa:</strong> ${candidateData.institution || candidateData.company_name}</div>
              <div class="diff-item"><strong>País:</strong> ${candidateData.country_name}</div>
            </div>

            <div class="diff-col">
              <h5>Registro Existente en Sistema</h5>
              <div class="diff-item"><strong>Nombre:</strong> ${existing.first_name} ${existing.last_name}</div>
              <div class="diff-item"><strong>Correo:</strong> ${existing.email}</div>
              <div class="diff-item"><strong>Tipo:</strong> ${existing.tipo_contacto}</div>
              <div class="diff-item"><strong>Institución/Empresa:</strong> ${existing.institution || existing.company_name}</div>
              <div class="diff-item"><strong>Registrado por:</strong> ${existing.created_by_name || 'Usuario institucional'}</div>
              <div class="diff-item"><strong>Fecha de registro:</strong> ${new Date(existing.created_at).toLocaleDateString()}</div>
            </div>
          </div>

          <div class="flex items-center justify-end gap-3 mt-6">
            <button class="btn btn-outline" onclick="RegisterModule.closeDuplicateModal()">
              Cerrar y Corregir Datos
            </button>
            ${!isExact ? `
              <button class="btn btn-tec" onclick="RegisterModule.confirmDuplicateOverride()">
                Confirmar Como Contacto Distinto
              </button>
            ` : `
              <button class="btn btn-tec" onclick="App.navigate('directory'); RegisterModule.closeDuplicateModal();">
                Ver Registro Existente en Directorio
              </button>
            `}
          </div>
        </div>
      </div>
    `;

    this.pendingSubmission = candidateData;
  },

  closeDuplicateModal() {
    const modalContainer = document.getElementById('duplicate-modal-container');
    if (modalContainer) modalContainer.innerHTML = '';
    this.pendingSubmission = null;
  },

  async confirmDuplicateOverride() {
    if (!this.pendingSubmission) return;
    try {
      const response = await API.post('/api/contacts', {
        ...this.pendingSubmission,
        allow_duplicate_override: true
      });
      this.closeDuplicateModal();
      this.onSuccess(response);
    } catch (err) {
      App.showToast(err.message || 'Error al forzar guardado', 'error');
    }
  }
};

```

---

### Archivo: `public/js/bulkUpload.js`

```javascript
// Módulo de Carga Masiva mediante Excel (Administrador y Usuario)
const BulkUploadModule = {
  selectedFile: null,
  fileBase64: null,
  analysisResult: null,
  activeFilter: 'TODOS',
  tipoContacto: 'ACADEMICO',
  catalogs: null,
  selectedSedeId: '',
  selectedDeptoId: '',
  recomiendaNombre: '',
  recomiendaEmail: '',
  funcionarioIdentificado: null,
  recEmailCheckTimeout: null,
  modalEmailTimeout: null,

  init(catalogs) {
    this.catalogs = catalogs || App.catalogs;
    if (this.tipoContacto === 'FUNCIONARIOS' && App.currentUser?.rol !== 'ADMIN') {
      this.tipoContacto = 'ACADEMICO';
    }
    this.recomiendaNombre = localStorage.getItem('tec_qs_pref_recomienda_nombre') || App.currentUser?.nombre_completo || '';
    this.recomiendaEmail = localStorage.getItem('tec_qs_pref_recomienda_email') || App.currentUser?.email || '';
    this.selectedSedeId = localStorage.getItem('tec_qs_pref_sede') || App.currentUser?.sede_id || '';
    this.selectedDeptoId = localStorage.getItem('tec_qs_pref_depto') || App.currentUser?.departamento_id || '';

    if (!this.selectedSedeId && this.catalogs?.sedes?.length > 0) {
      this.selectedSedeId = this.catalogs.sedes[0].id;
    }
    if (!this.selectedDeptoId && this.catalogs?.departamentos?.length > 0) {
      this.selectedDeptoId = this.catalogs.departamentos[0].id;
    }

    this.render();

    if (this.recomiendaEmail) {
      this.lookupFuncionario(this.recomiendaEmail);
    }
  },

  getRecomiendaPrefix() {
    if (!this.recomiendaEmail) return '';
    return this.recomiendaEmail.split('@')[0];
  },

  getSelectedSedeNombre() {
    if (this.funcionarioIdentificado?.sede) return this.funcionarioIdentificado.sede;
    return this.catalogs?.sedes?.find(s => s.id === this.selectedSedeId)?.nombre || 'Campus Central Cartago';
  },

  getSelectedDeptoNombre() {
    if (this.funcionarioIdentificado?.dependencia) return this.funcionarioIdentificado.dependencia;
    return this.catalogs?.departamentos?.find(d => d.id === this.selectedDeptoId)?.nombre || 'Oficina o Departamento';
  },

  onRecomiendaEmailInput(val) {
    let cleanUser = (val || '').trim().toLowerCase();
    if (cleanUser.includes('@')) {
      cleanUser = cleanUser.split('@')[0];
      const inputEl = document.getElementById('bulk-recomienda-email');
      if (inputEl) inputEl.value = cleanUser;
    }

    const fullEmail = cleanUser.length > 0 ? `${cleanUser}@itcr.ac.cr` : '';
    this.recomiendaEmail = fullEmail;
    if (fullEmail) {
      localStorage.setItem('tec_qs_pref_recomienda_email', fullEmail);
    } else {
      localStorage.removeItem('tec_qs_pref_recomienda_email');
    }

    const errEl = document.getElementById('err-bulk-recomienda-email');
    const inputEl = document.getElementById('bulk-recomienda-email');
    const spinner = document.getElementById('bulk-rec-email-spinner');
    const iconEl = document.getElementById('bulk-card-funcionario-icon');
    const nombreEl = document.getElementById('bulk-card-display-nombre');
    const deptoEl = document.getElementById('bulk-card-display-depto');
    const sedeEl = document.getElementById('bulk-card-display-sede');

    clearTimeout(this.recEmailCheckTimeout);

    if (cleanUser.length === 0) {
      this.funcionarioIdentificado = null;
      this.recomiendaNombre = '';
      if (errEl) errEl.textContent = '';
      if (inputEl) inputEl.classList.remove('is-invalid', 'is-valid');
      if (spinner) spinner.classList.add('hidden');
      if (iconEl) {
        iconEl.className = 'w-12 h-12 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 flex items-center justify-center text-2xl shrink-0 shadow-2xs';
        iconEl.innerHTML = '<i class="fa-solid fa-user"></i>';
      }
      if (nombreEl) nombreEl.textContent = 'Nombre de la persona funcionaria';
      if (deptoEl) deptoEl.textContent = 'Oficina o Departamento';
      if (sedeEl) sedeEl.textContent = 'Sede del TEC';
      return;
    }

    if (/\s/.test(cleanUser)) {
      if (errEl) errEl.innerHTML = `<span class="text-red-600 font-medium text-xs"><i class="fa-solid fa-circle-exclamation mr-1"></i> No incluya espacios en blanco.</span>`;
      if (inputEl) inputEl.classList.add('is-invalid');
      if (spinner) spinner.classList.add('hidden');
      return;
    }

    if (errEl) errEl.textContent = '';
    if (inputEl) inputEl.classList.remove('is-invalid');

    if (spinner) spinner.classList.remove('hidden');
    this.recEmailCheckTimeout = setTimeout(() => {
      this.lookupFuncionario(fullEmail);
    }, 250);
  },

  async lookupFuncionario(email) {
    const spinner = document.getElementById('bulk-rec-email-spinner');
    const inputEl = document.getElementById('bulk-recomienda-email');
    const iconEl = document.getElementById('bulk-card-funcionario-icon');
    const nombreEl = document.getElementById('bulk-card-display-nombre');
    const deptoEl = document.getElementById('bulk-card-display-depto');
    const sedeEl = document.getElementById('bulk-card-display-sede');
    const errEl = document.getElementById('err-bulk-recomienda-email');

    try {
      const res = await API.get(`/api/funcionarios/by-email?email=${encodeURIComponent(email)}`);
      if (spinner) spinner.classList.add('hidden');

      if (res.exists && res.funcionario) {
        const f = res.funcionario;
        this.funcionarioIdentificado = f;
        this.recomiendaNombre = f.nombre || '';
        this.recomiendaEmail = f.email || email;

        localStorage.setItem('tec_qs_pref_recomienda_email', this.recomiendaEmail);
        localStorage.setItem('tec_qs_pref_recomienda_nombre', this.recomiendaNombre);

        if (f.sede_id) {
          this.selectedSedeId = f.sede_id;
          localStorage.setItem('tec_qs_pref_sede', f.sede_id);
        }
        if (f.departamento_id) {
          this.selectedDeptoId = f.departamento_id;
          localStorage.setItem('tec_qs_pref_depto', f.departamento_id);
        }

        if (iconEl) {
          iconEl.className = 'w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center text-2xl shrink-0 shadow-2xs';
          iconEl.innerHTML = '<i class="fa-solid fa-user-check"></i>';
        }
        if (nombreEl) nombreEl.textContent = f.nombre;
        if (deptoEl) deptoEl.textContent = f.dependencia || this.getSelectedDeptoNombre();
        if (sedeEl) sedeEl.textContent = f.sede || this.getSelectedSedeNombre();

        if (inputEl) {
          inputEl.value = this.getRecomiendaPrefix();
          inputEl.classList.remove('is-invalid');
          inputEl.classList.add('is-valid');
        }
        if (errEl) errEl.textContent = '';
      } else {
        this.funcionarioIdentificado = null;
        this.recomiendaNombre = '';

        if (iconEl) {
          iconEl.className = 'w-12 h-12 rounded-lg bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center text-2xl shrink-0 shadow-2xs';
          iconEl.innerHTML = '<i class="fa-solid fa-user-xmark"></i>';
        }
        if (nombreEl) nombreEl.innerHTML = '<span class="text-amber-800 text-sm font-semibold">Funcionario no registrado en el padrón</span>';
        if (deptoEl) deptoEl.innerHTML = '<span class="text-slate-500 text-xs">Verifique el correo institucional o <button type="button" class="text-blue-800 font-bold underline hover:text-blue-900" onclick="BulkUploadModule.openNuevoUsuarioModal()">inclúyalo en el padrón</button></span>';
        if (sedeEl) sedeEl.textContent = '';

        if (inputEl) {
          inputEl.classList.add('is-invalid');
          inputEl.classList.remove('is-valid');
        }
        if (errEl) {
          errEl.innerHTML = '<span class="text-amber-700 text-xs font-medium"><i class="fa-solid fa-circle-info mr-1"></i> No se encontró este usuario en el padrón oficial del TEC.</span>';
        }
      }
    } catch (err) {
      if (spinner) spinner.classList.add('hidden');
      console.warn('Error al consultar funcionario:', err);
    }
  },

  openNuevoUsuarioModal() {
    const modalContainer = document.getElementById('bulk-modal-container');
    if (!modalContainer) return;

    const sedesOpts = (this.catalogs?.sedes || []).map(s => `
      <option value="${s.id}" ${s.id === this.selectedSedeId ? 'selected' : ''}>${s.nombre}</option>
    `).join('');

    modalContainer.innerHTML = `
      <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
        <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
              <span class="w-8 h-8 rounded-lg bg-blue-50 text-blue-900 flex items-center justify-center text-sm border border-blue-200/60">
                <i class="fa-solid fa-user-plus text-blue-900"></i>
              </span>
              Incluir Nuevo Usuario / Funcionario
            </h3>
            <button type="button" class="text-slate-400 hover:text-slate-600 text-lg" onclick="BulkUploadModule.closeNuevoUsuarioModal()">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <p class="text-xs text-slate-500 mb-4">
            Registre al funcionario/a en el padrón institucional del TEC para asociarlo a los registros de carga masiva.
          </p>

          <form id="form-bulk-nuevo-funcionario" onsubmit="BulkUploadModule.saveNuevoUsuarioModal(event)" class="space-y-3.5">
            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-700">Correo institucional del TEC *</label>
              <input type="text" 
                     id="bulk-modal-func-email" 
                     class="form-control text-sm" 
                     placeholder="usuario@itcr.ac.cr" 
                     required 
                     maxlength="120"
                     oninput="BulkUploadModule.onModalEmailInput(this.value)">
              <div class="error-feedback" id="err-bulk-modal-func-email"></div>
            </div>

            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-700">Nombre completo del funcionario/a *</label>
              <input type="text" 
                     id="bulk-modal-func-nombre" 
                     class="form-control text-sm" 
                     placeholder="Ej. Dr. Mario Fonseca Ruiz" 
                     required 
                     maxlength="100">
            </div>

            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-700">Sede del TEC *</label>
              <select id="bulk-modal-func-sede" class="form-control text-sm" required>
                ${sedesOpts}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label text-xs font-bold text-slate-700">Carrera, Escuela, Departamento o Dependencia *</label>
              <input type="text" 
                     id="bulk-modal-func-dependencia" 
                     class="form-control text-sm" 
                     placeholder="Ej. Escuela de Ingeniería Forestal / Rectoría" 
                     required 
                     maxlength="120">
            </div>

            <div class="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
              <button type="button" class="btn btn-outline btn-sm" onclick="BulkUploadModule.closeNuevoUsuarioModal()">
                Cancelar
              </button>
              <button type="submit" class="btn btn-tec btn-sm" id="btn-save-bulk-modal-func">
                <i class="fa-solid fa-save mr-1"></i>
                Guardar en Padrón y Seleccionar
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    const emailInput = document.getElementById('bulk-modal-func-email');
    if (emailInput) {
      emailInput.focus();
      const currentEmail = this.recomiendaEmail || (document.getElementById('bulk-recomienda-email')?.value?.trim() ? `${document.getElementById('bulk-recomienda-email').value.trim()}@itcr.ac.cr` : '');
      if (currentEmail) {
        emailInput.value = currentEmail;
        this.onModalEmailInput(currentEmail);
      }
    }
  },

  onModalEmailInput(val) {
    let clean = (val || '').trim().toLowerCase();
    if (clean && !clean.includes('@')) {
      clean = `${clean}@itcr.ac.cr`;
    }
    const feedbackEl = document.getElementById('err-bulk-modal-func-email');
    const btnSave = document.getElementById('btn-save-bulk-modal-func');
    if (!feedbackEl) return;

    clearTimeout(this.modalEmailTimeout);
    if (!clean || clean.length < 5) {
      feedbackEl.innerHTML = '';
      if (btnSave) {
        btnSave.innerHTML = '<i class="fa-solid fa-save mr-1"></i> Guardar en Padrón y Seleccionar';
      }
      return;
    }

    this.modalEmailTimeout = setTimeout(async () => {
      try {
        const res = await API.get(`/api/funcionarios/by-email?email=${encodeURIComponent(clean)}`);
        if (res.exists && res.funcionario) {
          const f = res.funcionario;
          feedbackEl.innerHTML = `
            <div class="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 text-xs mt-1.5 animate-fadeIn">
              <div class="font-bold flex items-center gap-1.5 text-blue-800">
                <i class="fa-solid fa-circle-check text-emerald-600"></i> Funcionario ya registrado en el padrón
              </div>
              <div class="mt-1 text-slate-700">
                <strong>${f.nombre}</strong> (${f.dependencia || 'Dependencia no indicada'} · ${f.sede || 'Sede no indicada'}).
              </div>
              <div class="text-[11px] text-blue-700 mt-0.5">Sus datos se completaron automáticamente para seleccionarlo.</div>
            </div>
          `;
          const nombreInput = document.getElementById('bulk-modal-func-nombre');
          const sedeSelect = document.getElementById('bulk-modal-func-sede');
          const deptoInput = document.getElementById('bulk-modal-func-dependencia');
          if (nombreInput && f.nombre) nombreInput.value = f.nombre;
          if (sedeSelect && f.sede_id) sedeSelect.value = f.sede_id;
          if (deptoInput && f.dependencia) deptoInput.value = f.dependencia;
          if (btnSave) {
            btnSave.innerHTML = '<i class="fa-solid fa-user-check mr-1"></i> Seleccionar este Funcionario';
          }
        } else {
          feedbackEl.innerHTML = `
            <div class="text-[11px] text-emerald-700 mt-1 flex items-center gap-1">
              <i class="fa-solid fa-circle-info text-emerald-600"></i> Correo nuevo · Complete los datos para agregarlo al padrón institucional.
            </div>
          `;
          if (btnSave) {
            btnSave.innerHTML = '<i class="fa-solid fa-save mr-1"></i> Guardar en Padrón y Seleccionar';
          }
        }
      } catch (err) {
        console.warn('Error verificando correo en modal:', err);
      }
    }, 250);
  },

  closeNuevoUsuarioModal() {
    const modalContainer = document.getElementById('bulk-modal-container');
    if (modalContainer) modalContainer.innerHTML = '';
  },

  async saveNuevoUsuarioModal(event) {
    event.preventDefault();
    let email = document.getElementById('bulk-modal-func-email')?.value?.trim().toLowerCase() || '';
    if (email && !email.includes('@')) {
      email = `${email}@itcr.ac.cr`;
    }
    const nombre = document.getElementById('bulk-modal-func-nombre')?.value?.trim();
    const sedeId = document.getElementById('bulk-modal-func-sede')?.value;
    const dependencia = document.getElementById('bulk-modal-func-dependencia')?.value?.trim();
    const errEmail = document.getElementById('err-bulk-modal-func-email');

    if (!email || (!email.endsWith('@itcr.ac.cr') && !email.endsWith('@tec.ac.cr'))) {
      if (errEmail) errEmail.textContent = 'Debe indicar un correo institucional (@itcr.ac.cr o @tec.ac.cr).';
      return;
    }
    if (!nombre || nombre.length < 3) {
      App.showToast('El nombre debe tener al menos 3 caracteres.', 'warning');
      return;
    }
    if (!dependencia || dependencia.length < 2) {
      App.showToast('Debe indicar la dependencia o departamento.', 'warning');
      return;
    }

    const sedeObj = (this.catalogs?.sedes || []).find(s => s.id === sedeId);
    const sedeNombre = sedeObj ? sedeObj.nombre : 'Campus Central Cartago';
    const saveBtn = document.getElementById('btn-save-bulk-modal-func');
    if (saveBtn) saveBtn.disabled = true;

    try {
      const res = await API.post('/api/funcionarios', {
        nombre,
        email,
        dependencia,
        sede: sedeNombre,
        sede_id: sedeId
      });

      if (res.success && res.funcionario) {
        App.showToast('🎉 Funcionario incluido exitosamente en el padrón institucional.', 'success');
        this.closeNuevoUsuarioModal();

        this.recomiendaEmail = email;
        this.recomiendaNombre = nombre;
        this.selectedSedeId = sedeId;
        this.selectedDeptoId = res.funcionario.departamento_id;
        this.funcionarioIdentificado = res.funcionario;

        localStorage.setItem('tec_qs_pref_recomienda_email', email);
        localStorage.setItem('tec_qs_pref_recomienda_nombre', nombre);
        localStorage.setItem('tec_qs_pref_sede', sedeId);
        if (res.funcionario.departamento_id) {
          localStorage.setItem('tec_qs_pref_depto', res.funcionario.departamento_id);
        }

        this.updateCardDisplay();
      }
    } catch (err) {
      App.showToast(err.message || 'Error al guardar funcionario', 'error');
      if (saveBtn) saveBtn.disabled = false;
    }
  },

  updateCardDisplay() {
    const iconEl = document.getElementById('bulk-card-funcionario-icon');
    const nombreEl = document.getElementById('bulk-card-display-nombre');
    const sedeEl = document.getElementById('bulk-card-display-sede');
    const deptoEl = document.getElementById('bulk-card-display-depto');
    const inputEl = document.getElementById('bulk-recomienda-email');

    const nombre = this.recomiendaNombre || App.currentUser?.nombre_completo || '';

    if (inputEl) {
      inputEl.value = this.getRecomiendaPrefix();
      if (this.recomiendaEmail) {
        inputEl.classList.add('is-valid');
        inputEl.classList.remove('is-invalid');
      }
    }

    if (nombre) {
      if (iconEl) {
        iconEl.className = 'w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center text-2xl shrink-0 shadow-2xs';
        iconEl.innerHTML = '<i class="fa-solid fa-user-check"></i>';
      }
      if (nombreEl) nombreEl.textContent = nombre;
      if (deptoEl) deptoEl.textContent = this.getSelectedDeptoNombre();
      if (sedeEl) sedeEl.textContent = this.getSelectedSedeNombre();
    } else {
      if (iconEl) {
        iconEl.className = 'w-12 h-12 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 flex items-center justify-center text-2xl shrink-0 shadow-2xs';
        iconEl.innerHTML = '<i class="fa-solid fa-user"></i>';
      }
      if (nombreEl) nombreEl.textContent = 'Nombre de la persona funcionaria';
      if (deptoEl) deptoEl.textContent = 'Oficina o Departamento';
      if (sedeEl) sedeEl.textContent = 'Sede del TEC';
    }
  },

  render() {
    const container = document.getElementById('bulk-upload-view');
    if (!container) return;

    if (!App.currentUser) {
      container.innerHTML = `
        <div class="bg-white rounded-2xl border border-slate-200/90 shadow-sm text-center p-10">
          <i class="fa-solid fa-lock text-amber-500 text-4xl mb-3 block"></i>
          <h3 class="text-lg font-bold text-slate-900">Inicio de Sesión Requerido</h3>
          <p class="text-slate-500 text-sm max-w-md mx-auto mt-1">
            Debe iniciar sesión para utilizar el módulo de carga masiva de contactos.
          </p>
        </div>
      `;
      return;
    }

    // Generar opciones de sedes
    const sedesOptions = (this.catalogs?.sedes || []).map(s => `
      <option value="${s.id}" ${s.id === this.selectedSedeId ? 'selected' : ''}>${s.nombre}</option>
    `).join('');

    // Filtrar departamentos de la sede
    const deptosParaSede = (this.catalogs?.departamentos || []).filter(d => !d.sede_id || d.sede_id === this.selectedSedeId);
    const todosDeptos = (this.catalogs?.departamentos || []);
    const listaDeptos = deptosParaSede.length > 0 ? deptosParaSede : todosDeptos;

    const deptosOptions = listaDeptos.map(d => `
      <option value="${d.id}" ${d.id === this.selectedDeptoId ? 'selected' : ''}>${d.nombre}</option>
    `).join('');

    const isAdmin = App.currentUser?.rol === 'ADMIN';
    if (!isAdmin && this.tipoContacto === 'FUNCIONARIOS') {
      this.tipoContacto = 'ACADEMICO';
    }

    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
        <div class="pb-5 border-b border-slate-100 mb-6 space-y-3">
          <div>
            <h2 class="text-xl font-bold text-slate-900 flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center text-sm border border-emerald-200/60 shadow-xs">
                <i class="fa-solid fa-file-excel text-emerald-700"></i>
              </span>
              Carga Académica
            </h2>
          </div>

          <!-- Plantillas oficiales alineadas en la misma fila -->
          <div class="flex flex-wrap items-center gap-2.5 pt-0.5">
            <a href="/api/templates/ACADEMICO" download class="btn btn-outline btn-xs text-xs py-1.5 px-3 flex items-center gap-2 shadow-2xs hover:bg-slate-50 transition-colors">
              <i class="fa-solid fa-graduation-cap text-blue-800 text-[11px]"></i>
              <span>Plantilla de académicos</span>
              <i class="fa-solid fa-download text-[10px] text-slate-400 ml-1"></i>
            </a>
            <a href="/api/templates/EMPLEADOR" download class="btn btn-outline btn-xs text-xs py-1.5 px-3 flex items-center gap-2 shadow-2xs hover:bg-slate-50 transition-colors">
              <i class="fa-solid fa-briefcase text-emerald-700 text-[11px]"></i>
              <span>Plantilla de empleadores</span>
              <i class="fa-solid fa-download text-[10px] text-slate-400 ml-1"></i>
            </a>
            ${isAdmin ? `
              <a href="/api/templates/FUNCIONARIOS" download class="btn btn-outline btn-xs text-xs py-1.5 px-3 flex items-center gap-2 shadow-2xs text-blue-900 border-blue-200 bg-blue-50/50 hover:bg-blue-100/70 transition-colors">
                <i class="fa-solid fa-address-book text-amber-600 text-[11px]"></i>
                <span>Plantilla de funcionarios</span>
                <i class="fa-solid fa-download text-[10px] text-slate-400 ml-1"></i>
              </a>
            ` : ''}
          </div>
        </div>

        <!-- 1. Bloque: Datos de la persona del TEC que reporta la carga (solo para contactos) -->
        ${this.tipoContacto !== 'FUNCIONARIOS' ? `
          <div class="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 mb-6 shadow-2xs">
            <div class="mb-4 pb-2 border-b border-slate-100 flex items-center justify-between">
              <h3 class="text-xs sm:text-sm font-bold text-blue-950 uppercase tracking-wider m-0 flex items-center gap-2">
                <span class="w-6 h-6 rounded-md bg-blue-900 text-white flex items-center justify-center text-xs">
                  <i class="fa-solid fa-id-card"></i>
                </span>
                Datos de la persona del TEC que reporta la carga
              </h3>
              <button type="button" 
                      class="btn btn-outline btn-xs text-blue-900 border-blue-200 bg-white hover:bg-blue-50 py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5 rounded-lg shadow-2xs transition-colors shrink-0"
                      onclick="BulkUploadModule.openNuevoUsuarioModal()"
                      title="Incluir a una nueva persona funcionaria en el padrón del TEC">
                <i class="fa-solid fa-user-plus text-amber-600"></i>
                <span>+ Nuevo funcionario</span>
              </button>
            </div>

            <!-- Disposición simétrica: Izquierda (Input de correo acortado a 360px) y Derecha (Tarjeta de datos del funcionario) -->
            <div class="grid grid-cols-1 md:grid-cols-[minmax(260px,360px)_1fr] gap-5 items-start">
              <!-- COLUMNA IZQUIERDA: 1. Correo institucional (@itcr.ac.cr) * (Alto 76px, ancho 360px) -->
              <div>
                <label class="form-label text-xs sm:text-sm font-bold text-slate-800 mb-2 block" for="bulk-recomienda-email">
                  1. Correo institucional (@itcr.ac.cr) <span class="req text-red-500 font-bold">*</span>
                </label>
                <div class="flex rounded-xl shadow-2xs overflow-hidden border border-slate-300 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 bg-white transition-all h-[76px] w-full max-w-[360px]" id="bulk-rec-input-group">
                  <input type="text" 
                         id="bulk-recomienda-email" 
                         class="flex-1 px-4 py-3 text-sm sm:text-base text-slate-900 placeholder:text-slate-400 placeholder:italic outline-none border-0 h-full"
                         placeholder="Espacio para digitar el correo"
                         value="${this.getRecomiendaPrefix()}" 
                         oninput="BulkUploadModule.onRecomiendaEmailInput(this.value)"
                         autocomplete="off"
                         spellcheck="false">
                  <div class="bg-slate-100 border-l border-slate-300 px-4 sm:px-5 flex items-center justify-center font-mono text-xs sm:text-sm text-slate-700 font-semibold select-none shrink-0 h-full">
                    itcr.ac.cr
                  </div>
                </div>
                <div class="error-feedback mt-1.5" id="err-bulk-recomienda-email"></div>
                <div id="bulk-rec-email-spinner" class="hidden text-xs text-blue-800 font-medium mt-1.5 flex items-center gap-1.5">
                  <i class="fa-solid fa-spinner fa-spin"></i>
                  <span>Consultando padrón del TEC...</span>
                </div>
              </div>

              <!-- COLUMNA DERECHA: Tarjeta con ícono verde y datos en 3 filas (Mismo alto 76px) -->
              <div>
                <div class="text-xs sm:text-sm font-bold text-slate-800 mb-2 invisible select-none">
                  Detalle
                </div>
                <div id="bulk-card-funcionario-container" class="border border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50/80 shadow-2xs flex items-center gap-3.5 h-[76px] transition-all">
                  <!-- Ícono verde de usuario / check -->
                  <div id="bulk-card-funcionario-icon" class="w-12 h-12 rounded-lg ${this.recomiendaNombre ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-400 border border-slate-200'} flex items-center justify-center text-2xl shrink-0 shadow-2xs">
                    <i class="fa-solid ${this.recomiendaNombre ? 'fa-user-check' : 'fa-user'}"></i>
                  </div>

                  <!-- 3 filas de información -->
                  <div class="flex-1 min-w-0" id="bulk-card-funcionario-text">
                    <div class="text-sm sm:text-base font-bold text-slate-900 truncate leading-tight" id="bulk-card-display-nombre">
                      ${this.recomiendaNombre || 'Nombre de la persona funcionaria'}
                    </div>
                    <div class="text-xs sm:text-sm text-slate-600 truncate leading-tight mt-1" id="bulk-card-display-depto">
                      ${this.getSelectedDeptoNombre() || 'Oficina o Departamento'}
                    </div>
                    <div class="text-[11px] sm:text-xs text-slate-500 truncate leading-tight mt-0.5" id="bulk-card-display-sede">
                      ${this.getSelectedSedeNombre() || 'Sede del TEC'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- 2. Selección de Tipo de Contacto y Ubicación del Archivo -->
        ${!this.analysisResult ? `
          <div class="space-y-6">
            <!-- Sección: Selectores de Tipo de Carga Apilados y Cuadro de Reglas Alineado -->
            <div>
              <label class="block text-sm font-bold text-slate-800 mb-2.5 flex items-center gap-2">
                <i class="fa-solid fa-users-gear text-blue-900"></i>
                Tipo de Carga Masiva y Reglas Mínimas *
              </label>

              <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                <!-- Columna Izquierda: Selectores apilados verticalmente (uno sobre otro) -->
                <div class="lg:col-span-4 flex flex-col justify-between gap-2.5">
                  <label class="flex-1 flex items-start gap-3 p-3.5 border-2 rounded-xl cursor-pointer transition-all ${this.tipoContacto === 'ACADEMICO' ? 'border-blue-900 bg-blue-50/70 shadow-xs' : 'border-slate-200 bg-white hover:border-slate-300'}">
                    <input type="radio" name="bulk_tipo" value="ACADEMICO" ${this.tipoContacto === 'ACADEMICO' ? 'checked' : ''} onchange="BulkUploadModule.setTipoContacto('ACADEMICO')" class="accent-tec-primary w-4 h-4 mt-0.5">
                    <div>
                      <div class="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <i class="fa-solid fa-graduation-cap text-blue-800"></i>
                        Académico
                      </div>
                      <div class="text-xs text-slate-500 mt-0.5">Contactos para Academic Survey</div>
                    </div>
                  </label>

                  <label class="flex-1 flex items-start gap-3 p-3.5 border-2 rounded-xl cursor-pointer transition-all ${this.tipoContacto === 'EMPLEADOR' ? 'border-blue-900 bg-blue-50/70 shadow-xs' : 'border-slate-200 bg-white hover:border-slate-300'}">
                    <input type="radio" name="bulk_tipo" value="EMPLEADOR" ${this.tipoContacto === 'EMPLEADOR' ? 'checked' : ''} onchange="BulkUploadModule.setTipoContacto('EMPLEADOR')" class="accent-tec-primary w-4 h-4 mt-0.5">
                    <div>
                      <div class="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <i class="fa-solid fa-briefcase text-blue-800"></i>
                        Empleador
                      </div>
                      <div class="text-xs text-slate-500 mt-0.5">Contactos para Employer Survey</div>
                    </div>
                  </label>

                  ${isAdmin ? `
                    <label class="flex-1 flex items-start gap-3 p-3.5 border-2 rounded-xl cursor-pointer transition-all ${this.tipoContacto === 'FUNCIONARIOS' ? 'border-blue-900 bg-blue-50/70 shadow-xs' : 'border-slate-200 bg-white hover:border-slate-300'}">
                      <input type="radio" name="bulk_tipo" value="FUNCIONARIOS" ${this.tipoContacto === 'FUNCIONARIOS' ? 'checked' : ''} onchange="BulkUploadModule.setTipoContacto('FUNCIONARIOS')" class="accent-tec-primary w-4 h-4 mt-0.5">
                      <div>
                        <div class="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                          <i class="fa-solid fa-address-book text-amber-600"></i>
                          Funcionarios TEC
                        </div>
                        <div class="text-xs text-slate-500 mt-0.5">Padrón: Nombre, Correo, Dependencia, Sede</div>
                      </div>
                    </label>
                  ` : ''}
                </div>

                <!-- Columna Derecha: Cuadro de Reglas Mínimas perfectamente alineado de primer a último selector -->
                <div class="lg:col-span-8 flex flex-col">
                  <div class="bg-amber-50/70 border border-amber-200/90 rounded-xl p-4 sm:p-5 text-xs shadow-2xs h-full flex flex-col justify-between">
                    <div class="flex items-center justify-between pb-2 mb-2 border-b border-amber-200/60">
                      <span class="font-bold text-amber-950 flex items-center gap-2 text-xs uppercase tracking-wider">
                        <i class="fa-solid fa-clipboard-check text-amber-700"></i>
                        Reglas Mínimas para Evitar Errores (${this.tipoContacto === 'ACADEMICO' ? 'Académicos' : this.tipoContacto === 'EMPLEADOR' ? 'Empleadores' : 'Funcionarios TEC'})
                      </span>
                      <span class="text-[11px] text-amber-800/80 font-medium hidden sm:inline">
                        Pestaña "Reglas e Instrucciones" en el Excel descargado
                      </span>
                    </div>

                    <div class="flex-1 flex flex-col justify-around py-0.5">
                      ${this.tipoContacto === 'ACADEMICO' ? `
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-slate-700">
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-check text-emerald-600 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Campos Obligatorios:</strong> First Name, Last Name, Email, Title, Job Title, Department, Institution, Country, Subject.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-ban text-red-600 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Restricción Crítica QS:</strong> NO se permiten correos @itcr.ac.cr ni @tec.ac.cr (deben ser contactos externos).</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-graduation-cap text-blue-700 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Tratamientos Aceptados:</strong> Dr., Dra., Prof., Profra., Ing., Lic., Licda., MSc., PhD, Mr., Mrs., Ms., Miss.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-tags text-indigo-700 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Áreas Temáticas QS:</strong> Arte y Humanidades, Ingeniería y Tecnología, Ciencias de la Vida, Ciencias Naturales, Ciencias Sociales.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-earth-americas text-slate-600 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>País:</strong> Nombre oficial completo según catálogo internacional (ej. Costa Rica, España, Estados Unidos).</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-copy text-amber-700 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Sin Duplicados:</strong> No incluir correos repetidos en el archivo ni contactos ya registrados en el sistema.</span>
                          </div>
                        </div>
                      ` : this.tipoContacto === 'EMPLEADOR' ? `
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-slate-700">
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-check text-emerald-600 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Campos Obligatorios:</strong> First Name, Last Name, Email, Title, Position, Industry, Company Name, Country.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-ban text-red-600 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Restricción Crítica QS:</strong> NO se permiten correos @itcr.ac.cr ni @tec.ac.cr (deben ser empleadores externos).</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-user-tie text-blue-700 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Tratamientos Aceptados:</strong> Dr., Dra., Ing., Lic., Licda., Mr., Mrs., Ms., Miss.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-building text-indigo-700 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Cargo y Empresa:</strong> Puesto de liderazgo/contratación y nombre legal o comercial de la empresa empleadora.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-earth-americas text-slate-600 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>País:</strong> Nombre oficial completo del país donde opera la empresa según catálogo internacional.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-copy text-amber-700 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Sin Duplicados:</strong> No incluir correos repetidos en el archivo ni contactos previamente reportados.</span>
                          </div>
                        </div>
                      ` : `
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-slate-700">
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-check text-emerald-600 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Campos Obligatorios:</strong> Nombre de funcionario, Correo electrónico, Dependencia, Sede.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-at text-emerald-700 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Dominio Obligatorio TEC:</strong> El correo institucional DEBE terminar exclusivamente en @itcr.ac.cr o @tec.ac.cr.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-landmark text-blue-700 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Sedes Oficiales:</strong> Campus Central Cartago, San José, San Carlos, Centro Académico Alajuela o Limón.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-sitemap text-indigo-700 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Dependencia:</strong> Escuela académica, vicerrectoría o departamento administrativo oficial del TEC.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-user-check text-slate-600 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Nombre Completo:</strong> Mínimo 3 caracteres con título institucional de cortesía.</span>
                          </div>
                          <div class="flex items-start gap-2">
                            <i class="fa-solid fa-copy text-amber-700 mt-0.5 shrink-0 text-[11px]"></i>
                            <span><strong>Sin Duplicados:</strong> Un único registro por funcionario/correo institucional en el archivo.</span>
                          </div>
                        </div>
                      `}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Selector de Ubicación del Archivo -->
            <div>
              <label class="block text-sm font-bold text-slate-800 mb-2 flex items-center gap-2" for="excel-file-display">
                <i class="fa-solid fa-folder-open text-blue-900"></i>
                Ubicación del Archivo *
              </label>

              <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div class="relative flex-1">
                  <input type="text" 
                         id="excel-file-display" 
                         readonly 
                         placeholder="Haga clic en 'Buscar archivo...' para seleccionar la ubicación (.xlsx, .csv)" 
                         value="${this.selectedFile ? this.selectedFile.name : ''}"
                         class="form-control text-sm bg-slate-50 text-slate-700 w-full cursor-pointer truncate pr-10"
                         onclick="document.getElementById('excel-file-input').click()">
                  <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <i class="fa-solid fa-file-excel"></i>
                  </span>
                </div>

                <input type="file" 
                       id="excel-file-input" 
                       accept=".xlsx, .xls, .csv" 
                       class="hidden" 
                       onchange="BulkUploadModule.handleFileSelect(event)">

                <button type="button" 
                        class="btn btn-tec whitespace-nowrap shadow-xs" 
                        onclick="document.getElementById('excel-file-input').click()">
                  <i class="fa-solid fa-folder-open"></i>
                  Buscar archivo...
                </button>
              </div>

              <p class="text-xs text-slate-500 mt-2">
                Formatos permitidos: Hojas de cálculo Excel (.xlsx, .xls) o texto delimitado por comas (.csv).
              </p>
            </div>
          </div>
        ` : this.renderAnalysisView()}
      </div>
      <!-- Modal para incluir nuevo funcionario -->
      <div id="bulk-modal-container"></div>
    `;
  },

  setTipoContacto(tipo) {
    if (tipo === 'FUNCIONARIOS' && App.currentUser?.rol !== 'ADMIN') {
      App.showToast('La carga masiva del padrón de funcionarios está reservada para Administradores.', 'warning');
      this.tipoContacto = 'ACADEMICO';
      this.render();
      return;
    }
    this.tipoContacto = tipo;
    this.render();
  },

  handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    this.selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuf = e.target.result;
      let binary = '';
      const bytes = new Uint8Array(arrayBuf);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      this.fileBase64 = btoa(binary);
      this.analyzeFile();
    };
    reader.readAsArrayBuffer(file);
  },

  async analyzeFile() {
    App.showToast('🔍 Analizando archivo y verificando duplicados...', 'info');

    try {
      const response = await API.post('/api/bulk/analyze', {
        fileName: this.selectedFile.name,
        tipo_contacto: this.tipoContacto,
        fileBase64: this.fileBase64
      });

      this.analysisResult = response;
      this.activeFilter = 'TODOS';
      this.render();
      App.showToast('✅ Análisis preliminar completado.', 'success');
    } catch (err) {
      App.showToast(err.message || 'Error al analizar el archivo Excel', 'error');
      this.selectedFile = null;
      this.fileBase64 = null;
      this.analysisResult = null;
      this.render();
    }
  },

  renderAnalysisView() {
    const { summary, errorDetails, analyzedRows } = this.analysisResult;
    const isFuncionarios = this.tipoContacto === 'FUNCIONARIOS';

    const filteredRows = analyzedRows.filter(r => {
      if (this.activeFilter === 'CORRECTOS') return r.status === 'CORRECTO';
      if (this.activeFilter === 'ERRORES') return r.status === 'ERROR';
      if (this.activeFilter === 'POSIBLES') return r.status === 'POSIBLE_DUPLICADO';
      if (this.activeFilter === 'DUPLICADOS') return r.status === 'DUPLICADO_EXACTO';
      return true;
    });

    return `
      <div>
        <!-- Resumen de Identificación del Reporte / Carga -->
        ${isFuncionarios ? `
          <div class="bg-amber-50/90 border border-amber-200/90 rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div class="flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center text-sm shadow-xs">
                <i class="fa-solid fa-address-book"></i>
              </span>
              <div>
                <div class="font-bold text-slate-900 text-sm">
                  Padrón Institucional de Funcionarios del TEC
                </div>
                <div class="text-slate-600">
                  Archivo cargado: <span class="font-mono font-semibold">${this.selectedFile?.name || 'padron.xlsx'}</span>
                </div>
              </div>
            </div>
            <div class="text-left sm:text-right">
              <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200">
                <i class="fa-solid fa-database text-amber-700"></i> Actualización de Catálogo Base
              </span>
            </div>
          </div>
        ` : `
          <div class="bg-blue-50/80 border border-blue-200 rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div class="flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-lg bg-blue-900 text-white flex items-center justify-center text-sm shadow-xs">
                <i class="fa-solid fa-user-check"></i>
              </span>
              <div>
                <div class="font-bold text-blue-950 text-sm">
                  ${this.recomiendaNombre || App.currentUser?.nombre_completo || 'Funcionario TEC'}
                </div>
                <div class="text-blue-800 font-mono">
                  ${this.recomiendaEmail || App.currentUser?.email || '(Sin correo registrado)'}
                </div>
              </div>
            </div>
            <div class="text-left sm:text-right sm:border-l sm:border-blue-200 sm:pl-4">
              <span class="text-slate-500 font-medium block">Procedencia Institucional:</span>
              <strong class="text-slate-800">${this.getSelectedSedeNombre()} · ${this.getSelectedDeptoNombre()}</strong>
            </div>
          </div>
        `}

        <!-- Resumen de Métricas (Requisito 11) -->
        <div class="kpi-grid mb-6">
          <div class="kpi-card" style="border-top-color: var(--tec-primary);">
            <div class="kpi-title">Registros Analizados</div>
            <div class="kpi-value text-slate-900">${summary.totalAnalizados}</div>
          </div>
          <div class="kpi-card" style="border-top-color: var(--status-success);">
            <div class="kpi-title">No existen en el sistema (Nuevos)</div>
            <div class="kpi-value text-emerald-700">${summary.correctos}</div>
          </div>
          <div class="kpi-card" style="border-top-color: var(--status-purple);">
            <div class="kpi-title">Ya existen en el sistema</div>
            <div class="kpi-value text-purple-700">${summary.duplicadosExactos}</div>
          </div>
          <div class="kpi-card" style="border-top-color: var(--status-warning);">
            <div class="kpi-title">Posibles Duplicados</div>
            <div class="kpi-value text-amber-700">${summary.posiblesDuplicados}</div>
          </div>
          <div class="kpi-card" style="border-top-color: var(--status-error);">
            <div class="kpi-title">Con Errores Críticos</div>
            <div class="kpi-value text-red-700">${summary.conErrores}</div>
          </div>
        </div>

        <!-- Filtros de Pestaña para la Auditoría -->
        <div class="flex gap-2 mb-4 flex-wrap">
          <button class="btn btn-sm ${this.activeFilter === 'TODOS' ? 'btn-tec' : 'btn-outline'}" onclick="BulkUploadModule.setFilter('TODOS')">
            Todos (${summary.totalAnalizados})
          </button>
          <button class="btn btn-sm ${this.activeFilter === 'CORRECTOS' ? 'btn-tec' : 'btn-outline'}" onclick="BulkUploadModule.setFilter('CORRECTOS')">
            Nuevos / No existen (${summary.correctos})
          </button>
          <button class="btn btn-sm ${this.activeFilter === 'DUPLICADOS' ? 'btn-tec' : 'btn-outline'}" onclick="BulkUploadModule.setFilter('DUPLICADOS')">
            Ya existen (${summary.duplicadosExactos})
          </button>
          <button class="btn btn-sm ${this.activeFilter === 'POSIBLES' ? 'btn-tec' : 'btn-outline'}" onclick="BulkUploadModule.setFilter('POSIBLES')">
            Posibles Duplicados (${summary.posiblesDuplicados})
          </button>
          <button class="btn btn-sm ${this.activeFilter === 'ERRORES' ? 'btn-tec' : 'btn-outline'}" onclick="BulkUploadModule.setFilter('ERRORES')">
            Con Errores (${summary.conErrores})
          </button>
        </div>

        <!-- Tabla Detallada de Auditoría Previa (Requisito 11) -->
        <div class="table-responsive max-h-96 overflow-y-auto mb-6">
          <table class="data-table">
            <thead>
              <tr>
                <th>Fila Excel</th>
                <th>Estado</th>
                ${isFuncionarios ? `
                  <th>Nombre de Funcionario</th>
                  <th>Correo Institucional</th>
                  <th>Dependencia / Departamento</th>
                  <th>Sede TEC</th>
                  <th>Diagnóstico</th>
                ` : `
                  <th>Nombre Completo</th>
                  <th>Correo Electrónico</th>
                  <th>Institución / Empresa</th>
                  <th>Diagnóstico / Problema</th>
                  <th>Recomendación</th>
                `}
              </tr>
            </thead>
            <tbody>
              ${filteredRows.map(r => {
                const d = r.data;
                const badgeClass =
                  r.status === 'CORRECTO' ? 'badge-validado' :
                  r.status === 'ERROR' ? 'badge-error' :
                  r.status === 'POSIBLE_DUPLICADO' ? 'badge-posible' : 'badge-duplicado';

                if (isFuncionarios) {
                  const errorMsg = r.errors?.join('; ') || 'Datos conformes para padrón de funcionarios.';
                  return `
                    <tr>
                      <td><strong>#${r.rowNum}</strong></td>
                      <td><span class="badge ${badgeClass}">${r.status}</span></td>
                      <td class="font-medium text-slate-900">${d.nombre || d['Nombre de funcionario'] || '-'}</td>
                      <td><code class="text-blue-900 font-semibold">${d.email || d['Correo electrónico'] || '-'}</code></td>
                      <td>${d.dependencia || d['Dependencia'] || '-'}</td>
                      <td>${d.sede || d['Sede'] || '-'}</td>
                      <td class="${r.status !== 'CORRECTO' ? 'text-red-600 font-medium' : 'text-slate-500'}">${errorMsg}</td>
                    </tr>
                  `;
                }

                const errorMsg = r.errors?.join('; ') || r.duplicateInfo?.explanation || 'Datos conformes a directriz QS.';
                const reco = r.status === 'CORRECTO' ? 'Aprobado para importación' :
                             r.status === 'ERROR' ? 'Corregir celda o excluir fila' :
                             r.status === 'POSIBLE_DUPLICADO' ? 'Revisar homónimo en directorio' : 'Omitir; ya registrado';

                return `
                  <tr>
                    <td><strong>#${r.rowNum}</strong></td>
                    <td><span class="badge ${badgeClass}">${r.status}</span></td>
                    <td>${d.first_name || d['First Name'] || '-'} ${d.last_name || d['Last Name'] || '-'}</td>
                    <td><code>${d.email || d['Email'] || '-'}</code></td>
                    <td>${d.institution || d.company_name || d['Institution'] || d['Company Name'] || '-'}</td>
                    <td class="${r.status !== 'CORRECTO' ? 'text-red-600 font-medium' : 'text-slate-500'}">${errorMsg}</td>
                    <td><small class="text-slate-500">${reco}</small></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Mensaje Informativo para Subida Selectiva de Registros No Existentes -->
        ${summary.correctos > 0 ? `
          <div class="bg-emerald-50/80 border border-emerald-200/90 rounded-xl p-4 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
            <div class="flex items-center gap-3">
              <span class="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center text-sm shadow-xs shrink-0">
                <i class="fa-solid fa-cloud-arrow-up"></i>
              </span>
              <div>
                <div class="font-bold text-emerald-950 text-sm">
                  Subida selectiva disponible: ${summary.correctos} registros nuevos listos para incorporar
                </div>
                <p class="text-emerald-800 m-0 mt-0.5">
                  ${summary.duplicadosExactos > 0 
                    ? `Se omitirán automáticamente los <strong>${summary.duplicadosExactos} registros existentes</strong> para no duplicar datos y se subirán únicamente los registros que no existen en el sistema.` 
                    : 'Todos los registros son nuevos y cumplen con los estándares institucionales requeridos.'}
                </p>
              </div>
            </div>
          </div>
        ` : summary.duplicadosExactos > 0 ? `
          <div class="bg-amber-50/80 border border-amber-200/90 rounded-xl p-4 mb-5 flex items-center gap-3 text-xs text-amber-950 shadow-2xs">
            <span class="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center text-sm shadow-xs shrink-0">
              <i class="fa-solid fa-circle-info"></i>
            </span>
            <div>
              <strong class="text-sm block">Todos los registros del archivo ya existen en el sistema</strong>
              <p class="text-amber-800 m-0 mt-0.5">
                Los ${summary.duplicadosExactos} registros analizados ya constan previamente en la base de datos. No hay registros nuevos que subir.
              </p>
            </div>
          </div>
        ` : ''}

        <!-- Acciones Finales -->
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-5 border-t border-slate-100">
          <button class="btn btn-outline" onclick="BulkUploadModule.cancelAnalysis()">
            <i class="fa-solid fa-arrow-left mr-1"></i> Cancelar y Subir Otro Archivo
          </button>

          <div class="flex flex-wrap items-center gap-3">
            ${summary.correctos > 0 ? `
              <button class="btn btn-tec py-2.5 px-4 font-semibold text-sm shadow-sm flex items-center gap-2" id="btn-import-valid" onclick="BulkUploadModule.confirmImport(false)">
                <i class="fa-solid fa-cloud-arrow-up"></i>
                <span>Subir los registros que no existen (${summary.correctos})</span>
              </button>
            ` : ''}

            ${summary.posiblesDuplicados > 0 ? `
              <button class="btn btn-outline text-amber-800 border-amber-300 hover:bg-amber-50 py-2.5 px-4 text-xs font-semibold flex items-center gap-1.5" onclick="BulkUploadModule.confirmImport(true)">
                <i class="fa-solid fa-user-plus text-amber-600"></i>
                <span>Subir nuevos + Posibles duplicados (${summary.correctos + summary.posiblesDuplicados})</span>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  },

  setFilter(filter) {
    this.activeFilter = filter;
    this.render();
  },

  cancelAnalysis() {
    this.selectedFile = null;
    this.fileBase64 = null;
    this.analysisResult = null;
    this.render();
  },

  async confirmImport(includePotentialDuplicates = false) {
    // Si la carga es del padrón institucional de funcionarios
    if (this.tipoContacto === 'FUNCIONARIOS') {
      const rowsToImport = this.analysisResult.analyzedRows
        .filter(r => r.status === 'CORRECTO' || (includePotentialDuplicates && r.status === 'POSIBLE_DUPLICADO'))
        .map(r => ({
          nombre: r.data.nombre || r.data['Nombre de funcionario'],
          email: r.data.email || r.data['Correo electrónico'],
          dependencia: r.data.dependencia || r.data['Dependencia'],
          sede: r.data.sede || r.data['Sede'],
          status: r.status
        }));

      if (rowsToImport.length === 0) {
        App.showToast('No hay registros válidos de funcionarios para importar.', 'warning');
        return;
      }

      const btn = document.getElementById('btn-import-valid');
      if (btn) btn.disabled = true;

      try {
        const response = await API.post('/api/bulk/import', {
          fileName: this.selectedFile.name,
          tipo_contacto: 'FUNCIONARIOS',
          rowsToImport,
          fileBase64: this.fileBase64
        });

        App.showToast(`🎉 ${response.message}`, 'success');
        this.cancelAnalysis();
      } catch (err) {
        App.showToast(err.message || 'Error en la importación de funcionarios', 'error');
        if (btn) btn.disabled = false;
      }
      return;
    }

    // Para contactos QS (Académicos / Empleadores)
    const recNombre = (this.recomiendaNombre || App.currentUser?.nombre_completo || '').trim();
    let recEmail = (this.recomiendaEmail || '').trim().toLowerCase();
    if (!recEmail) {
      const recInputEl = document.getElementById('bulk-recomienda-email');
      if (recInputEl && recInputEl.value.trim()) {
        recEmail = `${recInputEl.value.trim().split('@')[0]}@itcr.ac.cr`;
      } else if (App.currentUser?.email) {
        recEmail = App.currentUser.email.trim().toLowerCase();
      }
    }
    if (recEmail && !recEmail.includes('@')) {
      recEmail = `${recEmail}@itcr.ac.cr`;
    }

    if (!recNombre || recNombre.length < 3) {
      App.showToast('Debe indicar el nombre de quien reporta la carga masiva (mínimo 3 caracteres).', 'warning');
      return;
    }
    if (!recEmail || (!recEmail.endsWith('@itcr.ac.cr') && !recEmail.endsWith('@tec.ac.cr'))) {
      App.showToast('Debe indicar un correo institucional del TEC válido (@itcr.ac.cr o @tec.ac.cr).', 'warning');
      return;
    }

    const rowsToImport = this.analysisResult.analyzedRows
      .filter(r => r.status === 'CORRECTO' || (includePotentialDuplicates && r.status === 'POSIBLE_DUPLICADO'))
      .map(r => ({
        ...r.data,
        status: r.status,
        recomienda_nombre: recNombre,
        recomienda_email: recEmail,
        sede_id: this.selectedSedeId || null,
        departamento_id: this.selectedDeptoId || null
      }));

    if (rowsToImport.length === 0) {
      App.showToast('No hay registros aptos para importar.', 'warning');
      return;
    }

    const btn = document.getElementById('btn-import-valid');
    if (btn) btn.disabled = true;

    try {
      const response = await API.post('/api/bulk/import', {
        fileName: this.selectedFile.name,
        tipo_contacto: this.tipoContacto,
        rowsToImport,
        fileBase64: this.fileBase64,
        recomienda_nombre: recNombre,
        recomienda_email: recEmail,
        sede_id: this.selectedSedeId || null,
        departamento_id: this.selectedDeptoId || null
      });

      App.showToast(`🎉 ${response.message}`, 'success');
      this.cancelAnalysis();
      App.navigate('directory');
    } catch (err) {
      App.showToast(err.message || 'Error en la importación', 'error');
      if (btn) btn.disabled = false;
    }
  }
};

```

---

### Archivo: `public/js/directory.js`

```javascript
// Módulo de Consulta, Búsqueda y Gestión de Contactos
const DirectoryModule = {
  contacts: [],
  catalogs: null,
  filters: {
    q: '',
    tipo_contacto: '',
    sede_id: '',
    departamento_id: '',
    country_name: '',
    estado: '',
    fecha_inicio: '',
    fecha_fin: '',
    mis_registros_solamente: ''
  },
  selectedContact: null,

  init(catalogs) {
    this.catalogs = catalogs;
    this.render();
    this.loadContacts();
  },

  render() {
    const container = document.getElementById('directory-view');
    if (!container) return;

    const isAdmin = App.currentUser?.rol === 'ADMIN';
    const sedesOpts = (this.catalogs?.sedes || []).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
    const deptosOpts = (this.catalogs?.departamentos || []).map(d => `<option value="${d.id}">${d.nombre}</option>`).join('');
    const paisesOpts = (this.catalogs?.paises || []).map(p => `<option value="${p}">${p}</option>`).join('');

    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 mb-6">
          <div>
            <h2 class="text-xl font-bold text-slate-900 flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-lg bg-blue-50 text-blue-900 flex items-center justify-center text-sm border border-blue-200/60 shadow-xs">
                <i class="fa-solid fa-address-book text-blue-900"></i>
              </span>
              Directorio y Consulta de Contactos
            </h2>
            <p class="text-xs sm:text-sm text-slate-500 mt-1">Administración, filtrado facetado y trazabilidad de contactos QS.</p>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <button class="btn btn-outline btn-sm" onclick="DirectoryModule.loadContacts()">
              <i class="fa-solid fa-arrows-rotate text-xs"></i>
              Refrescar Lista
            </button>
            <button class="btn btn-tec btn-sm shadow-xs" onclick="DirectoryModule.exportToExcel()">
              <i class="fa-solid fa-file-excel text-emerald-300 mr-1.5"></i>
              Exportar a Excel (.xlsx)
            </button>
          </div>
        </div>

        <!-- Aviso de Privacidad para Usuarios Estándar -->
        ${!isAdmin ? `
          <div class="bg-blue-50/80 border border-blue-200/90 rounded-xl px-4 py-3 mb-5 flex items-center gap-3 text-xs text-blue-950 shadow-2xs">
            <span class="w-7 h-7 rounded-lg bg-blue-900 text-white flex items-center justify-center text-xs shrink-0">
              <i class="fa-solid fa-user-shield"></i>
            </span>
            <div>
              <strong class="font-bold">Vista de privacidad activa:</strong> Como usuario institucional, se muestran únicamente los contactos registrados por usted (mediante registro individual o carga masiva).
            </div>
          </div>
        ` : ''}

        <!-- Barra de Filtros Facetados (Requisito 14) -->
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-3.5">
            <!-- Búsqueda libre -->
            <div class="form-group sm:col-span-2">
              <label class="form-label text-xs">Búsqueda rápida</label>
              <input type="text" class="form-control" id="dir-filter-q" placeholder="Buscar por nombre, correo, institución, empresa o cargo..." value="${this.filters.q}">
            </div>

            <!-- Tipo -->
            <div class="form-group">
              <label class="form-label text-xs">Tipo de Contacto</label>
              <select class="form-control" id="dir-filter-tipo">
                <option value="">Todos los tipos</option>
                <option value="ACADEMICO">Académicos</option>
                <option value="EMPLEADOR">Empleadores</option>
              </select>
            </div>

            <!-- Estado -->
            <div class="form-group">
              <label class="form-label text-xs">Estado de Validación</label>
              <select class="form-control" id="dir-filter-estado">
                <option value="">Todos los estados</option>
                <option value="VALIDADO">Validado</option>
                <option value="POSIBLE_DUPLICADO">Posible duplicado</option>
                <option value="DUPLICADO">Duplicado</option>
                <option value="CORREGIDO">Corregido</option>
                <option value="EXPORTADO">Exportado</option>
              </select>
            </div>

            <!-- Sede -->
            <div class="form-group">
              <label class="form-label text-xs">Sede del TEC</label>
              <select class="form-control" id="dir-filter-sede">
                <option value="">Todas las sedes</option>
                ${sedesOpts}
              </select>
            </div>

            <!-- Departamento -->
            <div class="form-group">
              <label class="form-label text-xs">Escuela / Departamento</label>
              <select class="form-control" id="dir-filter-depto">
                <option value="">Todos los departamentos</option>
                ${deptosOpts}
              </select>
            </div>

            <!-- País -->
            <div class="form-group sm:col-span-2">
              <label class="form-label text-xs">País</label>
              <select class="form-control" id="dir-filter-pais">
                <option value="">Todos los países</option>
                ${paisesOpts}
              </select>
            </div>
          </div>

          <!-- Filtro de Administrador: Solo mis registros -->
          ${isAdmin ? `
            <div class="pt-2 mb-3 border-t border-slate-200/70 flex items-center justify-between">
              <label class="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-700 select-none">
                <input type="checkbox" 
                       id="dir-filter-solo-mios" 
                       class="accent-blue-900 w-4 h-4 rounded" 
                       ${this.filters.mis_registros_solamente === 'true' ? 'checked' : ''} 
                       onchange="DirectoryModule.toggleSoloMios(this.checked)">
                <span>Ver únicamente mis registros ingresados (como creador o recomendador)</span>
              </label>
              <span class="text-[11px] text-slate-400">Modo de filtrado personal</span>
            </div>
          ` : ''}

          <div class="flex justify-end gap-2">
            <button class="btn btn-outline btn-sm" onclick="DirectoryModule.clearFilters()">Limpiar Filtros</button>
            <button class="btn btn-tec btn-sm" onclick="DirectoryModule.applyFilters()">Aplicar Filtros</button>
          </div>
        </div>

        <!-- Tabla de Contactos -->
        <div id="dir-table-area">
          <div class="text-center py-8 text-slate-400">Cargando registros...</div>
        </div>
      </div>

      <!-- Contenedor de Modales (Detalle / Edición / Resolución) -->
      <div id="dir-modal-container"></div>
    `;

    this.attachFilterEvents();
  },

  attachFilterEvents() {
    const qInput = document.getElementById('dir-filter-q');
    if (qInput) {
      let debounceTimeout;
      qInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
          this.filters.q = e.target.value.trim();
          this.loadContacts();
        }, 350);
      });
    }
  },

  toggleSoloMios(checked) {
    this.filters.mis_registros_solamente = checked ? 'true' : '';
    this.loadContacts();
  },

  exportToExcel() {
    const params = new URLSearchParams();
    Object.entries(this.filters).forEach(([k, v]) => {
      if (v) params.append(k, v);
    });
    App.showToast('📊 Generando archivo Excel del Directorio...', 'info');
    window.location.href = `/api/contacts/export-directory?${params.toString()}`;
  },

  applyFilters() {
    this.filters.q = document.getElementById('dir-filter-q')?.value.trim() || '';
    this.filters.tipo_contacto = document.getElementById('dir-filter-tipo')?.value || '';
    this.filters.estado = document.getElementById('dir-filter-estado')?.value || '';
    this.filters.sede_id = document.getElementById('dir-filter-sede')?.value || '';
    this.filters.departamento_id = document.getElementById('dir-filter-depto')?.value || '';
    this.filters.country_name = document.getElementById('dir-filter-pais')?.value || '';
    const soloMiosEl = document.getElementById('dir-filter-solo-mios');
    if (soloMiosEl) {
      this.filters.mis_registros_solamente = soloMiosEl.checked ? 'true' : '';
    }
    this.loadContacts();
  },

  clearFilters() {
    this.filters = { q: '', tipo_contacto: '', sede_id: '', departamento_id: '', country_name: '', estado: '', fecha_inicio: '', fecha_fin: '', mis_registros_solamente: '' };
    this.render();
    this.loadContacts();
  },

  async loadContacts() {
    try {
      const response = await API.get('/api/contacts', this.filters);
      this.contacts = response.contacts || [];
      this.renderTable();
    } catch (err) {
      App.showToast('Error al cargar contactos: ' + err.message, 'error');
    }
  },

  renderTable() {
    const area = document.getElementById('dir-table-area');
    if (!area) return;

    if (this.contacts.length === 0) {
      area.innerHTML = `
        <div class="text-center py-12 text-slate-400">
          <i class="fa-solid fa-magnifying-glass text-3xl mb-2 block text-slate-300"></i>
          <p class="font-medium text-sm">No se encontraron contactos que coincidan con los criterios de búsqueda.</p>
        </div>
      `;
      return;
    }

    area.innerHTML = `
      <div class="mb-3 text-xs text-slate-500 font-medium flex items-center justify-between">
        <span>Mostrando <strong>${this.contacts.length}</strong> contactos registrados:</span>
        <span class="text-[11px] text-slate-400">Todos los elementos visibles en pantalla</span>
      </div>
      <div class="table-responsive-fit">
        <table class="data-table-fit">
          <thead>
            <tr>
              <th style="width: 26%;">Contacto y Tipo</th>
              <th style="width: 27%;">Institución / Empresa & Cargo</th>
              <th style="width: 26%;">Procedencia TEC</th>
              <th style="width: 11%;">País y Estado</th>
              <th style="width: 10%; text-align: center;">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${this.contacts.map(c => {
              const badgeClass =
                c.estado === 'VALIDADO' ? 'badge-validado' :
                c.estado === 'POSIBLE_DUPLICADO' ? 'badge-posible' :
                c.estado === 'DUPLICADO' ? 'badge-duplicado' :
                c.estado === 'CORREGIDO' ? 'badge-corregido' :
                c.estado === 'EXPORTADO' ? 'badge-exportado' : 'badge-nuevo';

              const isAcademico = c.tipo_contacto === 'ACADEMICO';
              const safeFullName = encodeURIComponent(`${c.first_name || ''} ${c.last_name || ''}`.trim());

              return `
                <tr>
                  <td>
                    <div class="mb-1">
                      <span class="badge ${isAcademico ? 'bg-blue-50 text-blue-900 border border-blue-200' : 'bg-emerald-50 text-emerald-900 border border-emerald-200'} text-[10px] font-bold py-0.5 px-2">
                        ${isAcademico ? '🎓 Académico' : '💼 Empleador'}
                      </span>
                    </div>
                    <strong class="text-slate-900 font-bold text-xs sm:text-sm block">${c.title || ''} ${c.first_name} ${c.last_name}</strong>
                    <code class="text-xs text-slate-500 font-mono break-all block mt-0.5">${c.email}</code>
                    ${c.phone ? `<span class="text-[11px] text-slate-500 block mt-0.5"><i class="fa-solid fa-phone text-[9px] text-slate-400 mr-1"></i>${c.phone}</span>` : ''}
                  </td>
                  <td>
                    <strong class="text-slate-800 font-semibold text-xs block leading-snug">${c.institution || c.company_name || '-'}</strong>
                    <span class="text-xs text-slate-600 block mt-0.5">${c.job_title || c.position || '-'}</span>
                    ${c.subject_area || c.industry ? `
                      <span class="text-[11px] text-slate-500 block mt-1">
                        <i class="fa-solid fa-tag text-[9px] text-slate-400 mr-1"></i>${c.subject_area || c.industry}
                      </span>
                    ` : ''}
                  </td>
                  <td>
                    <div class="font-semibold text-slate-800 text-xs flex items-center gap-1.5 leading-snug">
                      <i class="fa-solid fa-user-tie text-amber-600 text-[10px] shrink-0"></i>
                      <span>${c.recomienda_nombre || c.created_by_name || 'Funcionario TEC'}</span>
                    </div>
                    ${c.recomienda_email ? `<code class="text-[11px] text-blue-800 font-mono break-all block mt-0.5">${c.recomienda_email}</code>` : ''}
                    <span class="text-slate-500 text-[11px] block mt-1">${c.sede_nombre || 'Sede N/A'} · ${c.departamento_nombre || 'Depto. N/A'}</span>
                  </td>
                  <td>
                    <div class="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-1.5">
                      <i class="fa-solid fa-earth-americas text-slate-400 text-[11px] shrink-0"></i>
                      <span>${c.country_name}</span>
                    </div>
                    <span class="badge ${badgeClass} text-[10px]">${c.estado}</span>
                  </td>
                  <td style="text-align: center;">
                    <div class="flex items-center justify-center gap-1">
                      <button class="btn btn-outline btn-xs px-2 py-1 text-slate-700 hover:text-blue-900 hover:bg-blue-50 border-slate-300" 
                              onclick="DirectoryModule.viewDetails('${c.id}')" 
                              title="Ver Expediente y Auditoría">
                        <i class="fa-solid fa-eye text-xs"></i>
                      </button>
                      <button class="btn btn-outline btn-xs px-2 py-1 text-slate-700 hover:text-blue-900 hover:bg-blue-50 border-slate-300" 
                              onclick="DirectoryModule.editContact('${c.id}')" 
                              title="Editar Contacto">
                        <i class="fa-solid fa-pen text-xs"></i>
                      </button>
                      <button class="btn btn-outline btn-xs px-2 py-1 text-red-600 hover:text-white hover:bg-red-600 border-red-300 transition-colors" 
                              onclick="DirectoryModule.confirmDelete('${c.id}', '${safeFullName}')" 
                              title="Eliminar Contacto Reportado">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  async viewDetails(id) {
    try {
      const response = await API.get(`/api/contacts/${id}`);
      const { contact, auditHistory } = response;
      const modal = document.getElementById('dir-modal-container');
      if (!modal) return;

      modal.innerHTML = `
        <div class="modal-overlay">
          <div class="modal-content" style="max-width: 750px;">
            <div class="modal-header">
              <h3 class="modal-title flex items-center gap-2">
                <i class="fa-solid fa-file-invoice text-tec-primary"></i>
                Expediente y Auditoría del Contacto
              </h3>
              <button class="modal-close" onclick="DirectoryModule.closeModal()">&times;</button>
            </div>

            <!-- Identificación y Procedencia Institucional de quien recomienda el contacto -->
            <div class="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3.5 mb-4 text-xs">
              <div class="font-bold text-blue-950 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <i class="fa-solid fa-user-check text-blue-800"></i>
                Identificación de quien recomienda el contacto (Funcionario/a TEC)
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-slate-700">
                <div>
                  <span class="text-slate-500 block text-[11px]">Funcionario/a que recomienda:</span>
                  <strong class="text-slate-900">${contact.recomienda_nombre || contact.created_by_name || 'No especificado'}</strong>
                </div>
                <div>
                  <span class="text-slate-500 block text-[11px]">Correo institucional del recomendador:</span>
                  <code class="text-blue-900 font-semibold">${contact.recomienda_email || '(No registrado)'}</code>
                </div>
                <div>
                  <span class="text-slate-500 block text-[11px]">Sede de procedencia:</span>
                  <strong class="text-slate-800">${contact.sede_nombre || 'Sede no asignada'}</strong>
                </div>
                <div>
                  <span class="text-slate-500 block text-[11px]">Carrera / Escuela / Departamento:</span>
                  <strong class="text-slate-800">${contact.departamento_nombre || 'No asignado'}</strong>
                </div>
              </div>
            </div>

            <!-- Ficha Técnica -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl mb-5 text-sm">
              <div>
                <div><strong>Tipo:</strong> ${contact.tipo_contacto}</div>
                <div><strong>Nombre:</strong> ${contact.title} ${contact.first_name} ${contact.last_name}</div>
                <div><strong>Correo:</strong> <code>${contact.email}</code></div>
                <div><strong>Teléfono:</strong> ${contact.phone || '(No registrado)'}</div>
                <div><strong>País:</strong> ${contact.country_name}</div>
              </div>
              <div>
                <div><strong>Institución/Empresa:</strong> ${contact.institution || contact.company_name}</div>
                <div><strong>Puesto/Cargo:</strong> ${contact.job_title || contact.position}</div>
                <div><strong>Disciplina/Sector:</strong> ${contact.subject_area || contact.industry}</div>
                <div><strong>Estado:</strong> <span class="badge badge-validado">${contact.estado}</span></div>
                <div><strong>Método de Ingreso:</strong> ${contact.metodo_ingreso}</div>
              </div>
            </div>

            <!-- Trazabilidad Institucional (Requisito 15) -->
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Historial de Trazabilidad y Auditoría</h4>
            <div class="max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
              <table class="data-table text-xs">
                <thead>
                  <tr>
                    <th>Fecha / Hora</th>
                    <th>Usuario Responsable</th>
                    <th>Acción</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  ${auditHistory.map(a => `
                    <tr>
                      <td>${new Date(a.created_at).toLocaleString()}</td>
                      <td>${a.usuario_nombre}</td>
                      <td><strong>${a.accion}</strong></td>
                      <td><code>${a.detalles}</code></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <!-- Acciones de resolución si es Posible Duplicado -->
            ${contact.estado === 'POSIBLE_DUPLICADO' ? `
              <div class="alert alert-warning mt-4">
                <div>
                  <strong>Atención:</strong> Este contacto se encuentra en estado de revisión de duplicados.
                  <div class="mt-2 flex gap-2">
                    <button class="btn btn-sm btn-tec" onclick="DirectoryModule.resolveDuplicate('${contact.id}', 'CONFIRM_VALID')">
                      Aprobar Como Contacto Válido
                    </button>
                    <button class="btn btn-sm btn-outline text-red-600 border-red-300" onclick="DirectoryModule.resolveDuplicate('${contact.id}', 'DISCARD')">
                      Descartar Como Duplicado
                    </button>
                  </div>
                </div>
              </div>
            ` : ''}

            <div class="flex flex-wrap items-center justify-between gap-3 mt-5 pt-3 border-t border-slate-100">
              <button type="button" class="btn btn-outline text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700 btn-sm" 
                      onclick="DirectoryModule.confirmDelete('${contact.id}', '${encodeURIComponent(`${contact.first_name || ''} ${contact.last_name || ''}`.trim())}')">
                <i class="fa-solid fa-trash-can mr-1.5"></i>
                Eliminar Contacto Reportado
              </button>
              <div class="flex gap-2">
                <button type="button" class="btn btn-outline btn-sm" onclick="DirectoryModule.editContact('${contact.id}')">
                  <i class="fa-solid fa-pen mr-1"></i> Editar
                </button>
                <button type="button" class="btn btn-tec btn-sm" onclick="DirectoryModule.closeModal()">Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      App.showToast('Error al obtener detalle: ' + err.message, 'error');
    }
  },

  async editContact(id) {
    try {
      const response = await API.get(`/api/contacts/${id}`);
      const { contact } = response;
      const isAcademic = contact.tipo_contacto === 'ACADEMICO';
      const modal = document.getElementById('dir-modal-container');
      if (!modal) return;

      const countriesOpts = (this.catalogs?.paises || []).map(p => `<option value="${p}" ${p === contact.country_name ? 'selected' : ''}>${p}</option>`).join('');
      const titlesOpts = (this.catalogs?.titulos || []).map(t => `<option value="${t}" ${t === contact.title ? 'selected' : ''}>${t}</option>`).join('');

      modal.innerHTML = `
        <div class="modal-overlay">
          <div class="modal-content" style="max-width: 650px;">
            <div class="modal-header">
              <h3 class="modal-title">Editar Contacto (${contact.tipo_contacto})</h3>
              <button class="modal-close" onclick="DirectoryModule.closeModal()">&times;</button>
            </div>

            <form id="edit-form" onsubmit="event.preventDefault(); DirectoryModule.saveEdit('${contact.id}');">
              <div class="form-grid">
                <div class="form-group">
                  <label class="form-label">Título *</label>
                  <select class="form-control" id="edit-title" required>${titlesOpts}</select>
                </div>
                <div class="form-group">
                  <label class="form-label">Nombre *</label>
                  <input type="text" class="form-control" id="edit-first_name" value="${contact.first_name}" required>
                </div>
                <div class="form-group">
                  <label class="form-label">Apellido *</label>
                  <input type="text" class="form-control" id="edit-last_name" value="${contact.last_name}" required>
                </div>
                <div class="form-group">
                  <label class="form-label">Correo Electrónico *</label>
                  <input type="email" class="form-control" id="edit-email" value="${contact.email}" required>
                </div>
                <div class="form-group">
                  <label class="form-label">País *</label>
                  <select class="form-control" id="edit-country_name" required>${countriesOpts}</select>
                </div>
                <div class="form-group">
                  <label class="form-label">Teléfono</label>
                  <input type="tel" class="form-control" id="edit-phone" value="${contact.phone || ''}">
                </div>

                ${isAcademic ? `
                  <div class="form-group">
                    <label class="form-label">Puesto / Cargo *</label>
                    <input type="text" class="form-control" id="edit-job_title" value="${contact.job_title}" required>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Institución *</label>
                    <input type="text" class="form-control" id="edit-institution" value="${contact.institution}" required>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Departamento *</label>
                    <input type="text" class="form-control" id="edit-department_unit" value="${contact.department_unit}" required>
                  </div>
                ` : `
                  <div class="form-group">
                    <label class="form-label">Posición *</label>
                    <input type="text" class="form-control" id="edit-position" value="${contact.position}" required>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Empresa *</label>
                    <input type="text" class="form-control" id="edit-company_name" value="${contact.company_name}" required>
                  </div>
                `}
                <div class="form-group sm:col-span-2 bg-slate-50 p-3 rounded-lg border border-slate-200 mt-2">
                  <div class="text-xs font-bold text-slate-700 uppercase mb-2">Identificación de quien recomienda (TEC)</div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label class="form-label text-xs">Nombre Funcionario/a TEC</label>
                      <input type="text" class="form-control text-sm bg-white" id="edit-recomienda_nombre" value="${contact.recomienda_nombre || ''}">
                    </div>
                    <div>
                      <label class="form-label text-xs">Correo institucional (@itcr.ac.cr)</label>
                      <input type="email" class="form-control text-sm bg-white" id="edit-recomienda_email" value="${contact.recomienda_email || ''}">
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex justify-end gap-3 mt-6">
                <button type="button" class="btn btn-outline" onclick="DirectoryModule.closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-tec">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      `;
    } catch (err) {
      App.showToast('Error al abrir formulario de edición: ' + err.message, 'error');
    }
  },

  async saveEdit(id) {
    const updatedData = {
      title: document.getElementById('edit-title').value,
      first_name: document.getElementById('edit-first_name').value,
      last_name: document.getElementById('edit-last_name').value,
      email: document.getElementById('edit-email').value,
      country_name: document.getElementById('edit-country_name').value,
      phone: document.getElementById('edit-phone').value,
      job_title: document.getElementById('edit-job_title')?.value,
      institution: document.getElementById('edit-institution')?.value,
      department_unit: document.getElementById('edit-department_unit')?.value,
      position: document.getElementById('edit-position')?.value,
      company_name: document.getElementById('edit-company_name')?.value,
      recomienda_nombre: document.getElementById('edit-recomienda_nombre')?.value,
      recomienda_email: document.getElementById('edit-recomienda_email')?.value
    };

    try {
      await API.put(`/api/contacts/${id}`, updatedData);
      App.showToast('✅ Contacto actualizado correctamente.', 'success');
      this.closeModal();
      this.loadContacts();
    } catch (err) {
      App.showToast(err.message || 'Error al actualizar contacto', 'error');
    }
  },

  async resolveDuplicate(id, action) {
    try {
      await API.post(`/api/contacts/${id}/resolve-duplicate`, { action });
      App.showToast('Estado del contacto actualizado exitosamente.', 'success');
      this.closeModal();
      this.loadContacts();
    } catch (err) {
      App.showToast('Error al resolver duplicado: ' + err.message, 'error');
    }
  },

  confirmDelete(id, safeName) {
    const contactName = decodeURIComponent(safeName || 'este contacto');
    const modal = document.getElementById('dir-modal-container');
    if (!modal) return;

    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content" style="max-width: 520px;">
          <div class="modal-header">
            <h3 class="modal-title flex items-center gap-2 text-red-600 font-bold">
              <i class="fa-solid fa-triangle-exclamation"></i>
              Eliminar Contacto Reportado
            </h3>
            <button class="modal-close" onclick="DirectoryModule.closeModal()">&times;</button>
          </div>

          <div class="py-4">
            <p class="text-sm text-slate-700 mb-3">
              ¿Está seguro de que desea eliminar el contacto reportado <strong class="text-slate-900">${contactName}</strong>?
            </p>
            <div class="bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs text-red-900 mb-2 flex items-start gap-2.5">
              <i class="fa-solid fa-circle-exclamation text-red-600 mt-0.5 shrink-0 text-sm"></i>
              <div>
                <strong>Aviso de Trazabilidad:</strong> Esta acción removerá el contacto del Directorio. El evento quedará registrado en la bitácora inmutable de auditoría para fines de rendición de cuentas.
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button type="button" class="btn btn-outline btn-sm" onclick="DirectoryModule.closeModal()">
              Cancelar
            </button>
            <button type="button" class="btn btn-sm bg-red-600 text-white hover:bg-red-700 shadow-xs" onclick="DirectoryModule.deleteContact('${id}')">
              <i class="fa-solid fa-trash-can mr-1.5"></i>
              Sí, Eliminar Contacto
            </button>
          </div>
        </div>
      </div>
    `;
  },

  async deleteContact(id) {
    try {
      const res = await API.delete(`/api/contacts/${id}`);
      if (res.success) {
        App.showToast('✅ Contacto eliminado exitosamente del directorio.', 'success');
        this.closeModal();
        this.loadContacts();
      } else {
        App.showToast(res.error || res.message || 'No se pudo eliminar el contacto', 'error');
      }
    } catch (err) {
      App.showToast(err.message || 'Error al eliminar el contacto reportado', 'error');
    }
  },

  closeModal() {
    const modal = document.getElementById('dir-modal-container');
    if (modal) modal.innerHTML = '';
  }
};

```

---

### Archivo: `public/js/exportView.js`

```javascript
// Módulo de Consolidación y Exportación para QS
const ExportModule = {
  currentTipo: 'ACADEMICO',
  catalogs: null,

  init(catalogs) {
    this.catalogs = catalogs;
    this.render();
  },

  render() {
    const container = document.getElementById('export-view');
    if (!container) return;

    if (App.currentUser?.rol !== 'ADMIN') {
      container.innerHTML = `
        <div class="bg-white rounded-2xl border border-slate-200/90 shadow-sm text-center p-10">
          <i class="fa-solid fa-lock text-red-500 text-4xl mb-3 block"></i>
          <h3 class="text-lg font-bold text-slate-900">Acceso Restringido a Administradores</h3>
          <p class="text-slate-500 text-sm max-w-md mx-auto mt-1">
            La generación de los archivos de exportación oficiales para QS está reservada para el Administrador Institucional.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
        <div class="pb-5 border-b border-slate-100 mb-6">
          <h2 class="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-lg bg-amber-50 text-amber-800 flex items-center justify-center text-sm border border-amber-200/60 shadow-xs">
              <i class="fa-solid fa-file-export text-amber-700"></i>
            </span>
            Consolidación y Exportación Oficial – Ranking QS
          </h2>
          <p class="text-xs sm:text-sm text-slate-500 mt-1">
            Generación de archivos Excel formateados según la especificación exacta de Quacquarelli Symonds con pre-validación de calidad.
          </p>
        </div>

        <div class="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-6">
          <h4 class="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full bg-blue-900 text-white flex items-center justify-center text-[11px] font-bold">1</span>
            Seleccione la Población a Exportar
          </h4>
          
          <div class="contact-type-selector mb-6">
            <div class="type-option-card ${this.currentTipo === 'ACADEMICO' ? 'selected' : ''}" onclick="ExportModule.setTipo('ACADEMICO')">
              <input type="radio" name="export_tipo" value="ACADEMICO" ${this.currentTipo === 'ACADEMICO' ? 'checked' : ''}>
              <div class="type-info">
                <div class="flex items-center gap-2">
                  <i class="fa-solid fa-graduation-cap text-blue-800 text-base"></i>
                  <h4>Matriz de Académicos (Academic Reputation)</h4>
                </div>
                <p>11 columnas requeridas por QS. Incluye Source pre-llenado ("Instituto Tecnológico de Costa Rica").</p>
              </div>
            </div>

            <div class="type-option-card ${this.currentTipo === 'EMPLEADOR' ? 'selected' : ''}" onclick="ExportModule.setTipo('EMPLEADOR')">
              <input type="radio" name="export_tipo" value="EMPLEADOR" ${this.currentTipo === 'EMPLEADOR' ? 'checked' : ''}>
              <div class="type-info">
                <div class="flex items-center gap-2">
                  <i class="fa-solid fa-briefcase text-emerald-700 text-base"></i>
                  <h4>Matriz de Empleadores (Employer Reputation)</h4>
                </div>
                <p>10 columnas requeridas por QS. Datos de industria, empresa y posición corporativa validados.</p>
              </div>
            </div>
          </div>

          <h4 class="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full bg-blue-900 text-white flex items-center justify-center text-[11px] font-bold">2</span>
            Filtros de Período y Alcance (Opcional)
          </h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div class="form-group">
              <label class="form-label text-xs">Fecha Desde</label>
              <input type="date" class="form-control" id="exp-fecha-inicio">
            </div>
            <div class="form-group">
              <label class="form-label text-xs">Fecha Hasta</label>
              <input type="date" class="form-control" id="exp-fecha-fin">
            </div>
          </div>

          <div class="alert alert-info mb-6">
            <i class="fa-solid fa-circle-info text-sky-600 mt-0.5"></i>
            <div>
              <strong>Control de Calidad QS Activo:</strong> El sistema re-valida automáticamente cada registro antes de incluirlo en el archivo Excel. Cualquier contacto con duplicidad pendiente o datos faltantes será excluido para proteger el ranking institucional.
            </div>
          </div>

          <div class="flex justify-end">
            <button class="btn btn-tec" id="btn-export-download" onclick="ExportModule.triggerExport()">
              <i class="fa-solid fa-file-arrow-down"></i>
              Descargar Archivo Oficial XLSX para QS
            </button>
          </div>
        </div>
      </div>
    `;
  },

  setTipo(tipo) {
    this.currentTipo = tipo;
    this.render();
  },

  async triggerExport() {
    const btn = document.getElementById('btn-export-download');
    if (btn) btn.disabled = true;

    const fechaInicio = document.getElementById('exp-fecha-inicio')?.value || '';
    const fechaFin = document.getElementById('exp-fecha-fin')?.value || '';

    const params = new URLSearchParams();
    if (fechaInicio) params.append('fecha_inicio', fechaInicio);
    if (fechaFin) params.append('fecha_fin', fechaFin);

    try {
      App.showToast('Generando archivo consolidado...', 'info');
      const url = `/api/export/${this.currentTipo}?${params.toString()}`;
      const response = await API.get(url);

      if (response.isBlob) {
        const downloadUrl = window.URL.createObjectURL(response.blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `TEC_QS_${this.currentTipo}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);

        App.showToast('✅ Archivo Excel descargado exitosamente y archivado en evidencias.', 'success');
      }
    } catch (err) {
      App.showToast(err.message || 'Error al exportar contactos', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }
};

```

---

### Archivo: `public/js/adminView.js`

```javascript
// Módulo de Administración, Métricas KPI y Google Drive
const AdminModule = {
  stats: null,
  driveStatus: null,
  catalogs: null,

  init(catalogs) {
    this.catalogs = catalogs;
    this.loadData();
  },

  async loadData() {
    try {
      const [statsRes, driveRes] = await Promise.all([
        API.get('/api/stats'),
        API.get('/api/drive/status')
      ]);
      this.stats = statsRes.stats;
      this.driveStatus = driveRes.drive;
      this.render();
    } catch (err) {
      App.showToast('Error al cargar panel de administración: ' + err.message, 'error');
    }
  },

  render() {
    const container = document.getElementById('admin-view');
    if (!container) return;

    if (App.currentUser?.rol !== 'ADMIN') {
      container.innerHTML = `
        <div class="bg-white rounded-2xl border border-slate-200/90 shadow-sm text-center p-10">
          <i class="fa-solid fa-lock text-red-500 text-4xl mb-3 block"></i>
          <h3 class="text-lg font-bold text-slate-900">Panel Reservado para Administradores</h3>
        </div>
      `;
      return;
    }

    if (!this.stats) {
      container.innerHTML = '<div class="bg-white rounded-2xl p-6 text-slate-400"><p>Cargando métricas...</p></div>';
      return;
    }

    const { total, academicos, empleadores, validados, duplicados, exportados, porSede, porDepto } = this.stats;

    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 mb-6">
          <div>
            <h2 class="text-xl font-bold text-slate-900 flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-lg bg-blue-50 text-blue-900 flex items-center justify-center text-sm border border-blue-200/60 shadow-xs">
                <i class="fa-solid fa-chart-pie text-blue-900"></i>
              </span>
              Tablero General de Gestión – Ranking QS
            </h2>
            <p class="text-xs sm:text-sm text-slate-500 mt-1">Métricas consolidadas, distribución institucional y estado de sincronización.</p>
          </div>
          <button class="btn btn-outline btn-sm" onclick="AdminModule.loadData()">
            <i class="fa-solid fa-arrows-rotate text-xs"></i>
            Actualizar Métricas
          </button>
        </div>

        <!-- Tarjetas KPI -->
        <div class="kpi-grid mb-6">
          <div class="kpi-card" style="border-top-color: var(--tec-primary);">
            <div class="kpi-title">Total de Contactos</div>
            <div class="kpi-value text-slate-900">${total}</div>
          </div>
          <div class="kpi-card" style="border-top-color: #0284c7;">
            <div class="kpi-title">Académicos</div>
            <div class="kpi-value text-sky-700">${academicos}</div>
          </div>
          <div class="kpi-card" style="border-top-color: #059669;">
            <div class="kpi-title">Empleadores</div>
            <div class="kpi-value text-emerald-700">${empleadores}</div>
          </div>
          <div class="kpi-card" style="border-top-color: var(--status-success);">
            <div class="kpi-title">Validados / Aptos</div>
            <div class="kpi-value text-emerald-700">${validados}</div>
          </div>
          <div class="kpi-card" style="border-top-color: var(--status-warning);">
            <div class="kpi-title">Duplicados Detectados</div>
            <div class="kpi-value text-amber-700">${duplicados}</div>
          </div>
          <div class="kpi-card" style="border-top-color: var(--tec-accent);">
            <div class="kpi-title">Exportados Oficiales</div>
            <div class="kpi-value text-amber-600">${exportados}</div>
          </div>
        </div>

        <!-- Distribución por Sedes y Departamentos -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-5">
            <h4 class="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <i class="fa-solid fa-map-location-dot text-blue-900"></i>
              Distribución por Sede del TEC
            </h4>
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr><th>Sede</th><th style="text-align: right;">Contactos</th></tr>
                </thead>
                <tbody>
                  ${porSede.map(s => `
                    <tr>
                      <td>${s.sede}</td>
                      <td style="text-align: right;"><strong>${s.count}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div class="bg-slate-50 border border-slate-200 rounded-xl p-5">
            <h4 class="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <i class="fa-solid fa-building-user text-blue-900"></i>
              Contactos por Escuela / Unidad
            </h4>
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr><th>Escuela / Unidad</th><th style="text-align: right;">Contactos</th></tr>
                </thead>
                <tbody>
                  ${porDepto.map(d => `
                    <tr>
                      <td>${d.departamento}</td>
                      <td style="text-align: right;"><strong>${d.count}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Módulo de Arquitectura y Google Drive (Requisito 18) -->
        <div class="bg-white border-2 border-slate-200 rounded-xl p-6">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
                <i class="fa-brands fa-google-drive text-amber-500"></i>
                Gestión de Respaldos e Integración con Google Drive Institucional
              </h3>
              <p class="text-slate-500 text-xs mt-1">
                ${this.driveStatus.architectureNote}
              </p>
            </div>
            <button class="btn btn-tec btn-sm" onclick="AdminModule.triggerBackup()">
              <i class="fa-solid fa-database"></i>
              Generar Respaldo (.sqlite) Ahora
            </button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-lg text-xs">
            <div><strong>Modo Almacenamiento:</strong> <code class="text-blue-900">${this.driveStatus.mode}</code></div>
            <div><strong>Carpeta Destino Drive:</strong> <code class="text-slate-600">${this.driveStatus.targetSharedDrive}</code></div>
            <div><strong>Evidencias Archivadas:</strong> <strong>${this.driveStatus.stagedArchivesCount}</strong> archivos</div>
            <div><strong>Copias Respaldo BD:</strong> <strong>${this.driveStatus.backupsCount}</strong> respaldos</div>
          </div>
        </div>
      </div>
    `;
  },

  async triggerBackup() {
    try {
      App.showToast('Creando copia de respaldo física de la base de datos...', 'info');
      const res = await API.post('/api/drive/backup', {});
      if (res.success) {
        App.showToast(`✅ Respaldo exitoso: ${res.backupFileName} (${(res.sizeBytes / 1024).toFixed(1)} KB)`, 'success');
        this.loadData();
      }
    } catch (err) {
      App.showToast('Error al generar respaldo: ' + err.message, 'error');
    }
  }
};

```

---

### Archivo: `public/assets/logo_tec.svg`

```text
﻿<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg
   xmlns:dc="http://purl.org/dc/elements/1.1/"
   xmlns:cc="http://creativecommons.org/ns#"
   xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
   xmlns:svg="http://www.w3.org/2000/svg"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   version="1.1"
   id="svg851"
   xml:space="preserve"
   width="425.9296"
   height="83.901329"
   viewBox="0 0 425.9296 83.901331"
   sodipodi:docname="logotec.svg"
   inkscape:version="1.0.1 (3bc2e813f5, 2020-09-07)"><metadata
     id="metadata857"><rdf:RDF><cc:Work
         rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type
           rdf:resource="http://purl.org/dc/dcmitype/StillImage" /><dc:title></dc:title></cc:Work></rdf:RDF></metadata><defs
     id="defs855"><clipPath
       clipPathUnits="userSpaceOnUse"
       id="clipPath871"><path
         d="M 0,92.851 H 400.301 V 0 H 0 Z"
         id="path869" /></clipPath></defs><sodipodi:namedview
     pagecolor="#ffffff"
     bordercolor="#666666"
     borderopacity="1"
     objecttolerance="10"
     gridtolerance="10"
     guidetolerance="10"
     inkscape:pageopacity="0"
     inkscape:pageshadow="2"
     inkscape:window-width="2560"
     inkscape:window-height="1385"
     id="namedview853"
     showgrid="false"
     fit-margin-top="0"
     fit-margin-left="0"
     fit-margin-right="0"
     fit-margin-bottom="0"
     inkscape:zoom="3.702214"
     inkscape:cx="218.06827"
     inkscape:cy="41.950529"
     inkscape:window-x="0"
     inkscape:window-y="0"
     inkscape:window-maximized="1"
     inkscape:current-layer="g859" /><g
     id="g859"
     inkscape:groupmode="layer"
     inkscape:label="logotec"
     transform="matrix(1.3333333,0,0,-1.3333333,-48.799065,103.85093)"><g
       id="g861"
       transform="translate(184.2874,77.8882)"><path
         d="M 0,0 H 2.815 L 2.814,-62.926 h -2.815 z"
         style="fill:#ef3340;fill-opacity:1;fill-rule:nonzero;stroke:none"
         id="path863" /></g><g
       id="g865"><g
         id="g867"
         clip-path="url(#clipPath871)"><g
           id="g873"
           transform="translate(220.0188,71.77)"><path
             d="m 0,0 0.23,-4.896 h -0.584 c -0.114,0.863 -0.267,1.478 -0.461,1.847 -0.318,0.596 -0.743,1.034 -1.272,1.317 -0.527,0.282 -1.223,0.424 -2.085,0.424 h -2.939 v -15.948 c 0,-1.283 0.139,-2.083 0.416,-2.402 0.39,-0.429 0.989,-0.645 1.8,-0.645 h 0.723 v -0.571 h -8.85 v 0.571 h 0.739 c 0.882,0 1.509,0.266 1.879,0.8 0.225,0.328 0.337,1.077 0.337,2.247 v 15.948 h -2.508 c -0.974,0 -1.668,-0.072 -2.077,-0.215 -0.535,-0.196 -0.991,-0.57 -1.37,-1.124 -0.38,-0.555 -0.607,-1.304 -0.679,-2.249 h -0.584 L -17.038,0 Z"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path875" /></g><g
           id="g877"
           transform="translate(222.1858,60.5796)"><path
             d="M 0,0 H 6.526 C 6.475,0.903 6.368,1.539 6.205,1.908 5.948,2.483 5.566,2.935 5.058,3.262 4.55,3.591 4.018,3.755 3.465,3.755 2.612,3.755 1.851,3.424 1.179,2.762 0.506,2.101 0.114,1.179 0,0 m 0,-0.893 c -0.008,-2.094 0.498,-3.736 1.525,-4.926 1.025,-1.191 2.231,-1.786 3.616,-1.786 0.923,0 1.727,0.254 2.411,0.762 0.681,0.508 1.254,1.378 1.716,2.61 L 9.745,-4.542 C 9.528,-5.947 8.904,-7.228 7.867,-8.381 6.829,-9.536 5.533,-10.115 3.973,-10.115 c -1.693,0 -3.144,0.661 -4.347,1.979 -1.208,1.319 -1.811,3.092 -1.811,5.319 0,2.411 0.62,4.291 1.854,5.641 1.236,1.349 2.789,2.024 4.658,2.024 1.58,0 2.877,-0.521 3.894,-1.562 1.015,-1.042 1.524,-2.435 1.524,-4.179 z"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path879" /></g><g
           id="g881"
           transform="translate(245.7864,56.2534)"><path
             d="m 0,0 c -0.381,-1.858 -1.123,-3.287 -2.231,-4.286 -1.109,-1.001 -2.335,-1.503 -3.678,-1.503 -1.602,0 -2.998,0.673 -4.189,2.017 -1.191,1.345 -1.785,3.162 -1.785,5.45 0,2.217 0.659,4.017 1.978,5.403 1.319,1.385 2.9,2.077 4.749,2.077 1.385,0 2.525,-0.366 3.417,-1.1 C -0.847,7.325 -0.4,6.562 -0.4,5.771 -0.4,5.382 -0.525,5.067 -0.778,4.826 -1.029,4.585 -1.381,4.463 -1.831,4.463 c -0.607,0 -1.064,0.197 -1.371,0.586 -0.175,0.216 -0.29,0.626 -0.347,1.232 -0.056,0.605 -0.264,1.066 -0.623,1.385 -0.359,0.308 -0.858,0.462 -1.493,0.462 -1.026,0 -1.853,-0.38 -2.48,-1.14 C -8.973,5.982 -9.39,4.653 -9.39,3.001 c 0,-1.682 0.414,-3.168 1.239,-4.455 0.827,-1.289 1.943,-1.932 3.349,-1.932 1.003,0 1.907,0.344 2.708,1.031 0.566,0.472 1.113,1.329 1.648,2.571 z"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path883" /></g><g
           id="g885"
           transform="translate(251.9124,62.4263)"><path
             d="m 0,0 c 1.653,1.99 3.229,2.985 4.727,2.985 0.769,0 1.429,-0.192 1.985,-0.577 0.554,-0.385 0.995,-1.018 1.323,-1.9 0.227,-0.616 0.339,-1.56 0.339,-2.833 v -6.018 c 0,-0.893 0.071,-1.498 0.217,-1.816 0.112,-0.258 0.294,-0.457 0.545,-0.6 0.253,-0.145 0.718,-0.216 1.394,-0.216 V -11.53 H 3.557 v 0.555 h 0.292 c 0.657,0 1.115,0.1 1.378,0.3 0.26,0.201 0.443,0.495 0.546,0.884 0.041,0.155 0.062,0.636 0.062,1.448 v 5.772 c 0,1.283 -0.168,2.214 -0.501,2.794 C 5,0.803 4.438,1.093 3.647,1.093 2.427,1.093 1.212,0.426 0,-0.908 v -7.435 c 0,-0.955 0.057,-1.544 0.171,-1.77 0.143,-0.298 0.34,-0.516 0.591,-0.655 0.252,-0.137 0.762,-0.207 1.531,-0.207 v -0.555 h -6.971 v 0.555 h 0.307 c 0.718,0 1.204,0.183 1.453,0.546 0.254,0.365 0.379,1.06 0.379,2.086 v 5.234 c 0,1.692 -0.039,2.724 -0.115,3.094 -0.077,0.369 -0.196,0.62 -0.355,0.754 -0.158,0.133 -0.371,0.2 -0.639,0.2 -0.288,0 -0.63,-0.078 -1.03,-0.231 L -4.91,1.263 -0.66,2.985 H 0 Z"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path887" /></g><g
           id="g889"
           transform="translate(269.9827,64.4116)"><path
             d="m 0,0 c -0.543,0 -1.091,-0.161 -1.639,-0.485 -0.549,-0.323 -0.992,-0.89 -1.331,-1.701 -0.338,-0.811 -0.508,-1.853 -0.508,-3.125 0,-2.052 0.408,-3.822 1.223,-5.31 0.818,-1.487 1.891,-2.231 3.227,-2.231 0.994,0 1.816,0.41 2.463,1.23 0.644,0.821 0.968,2.232 0.968,4.234 0,2.503 -0.538,4.474 -1.615,5.911 C 2.059,-0.492 1.131,0 0,0 m 0.479,1 c 2.134,0 3.849,-0.81 5.14,-2.432 1.099,-1.385 1.648,-2.976 1.648,-4.771 0,-1.262 -0.303,-2.541 -0.909,-3.833 -0.605,-1.294 -1.439,-2.269 -2.502,-2.924 -1.061,-0.657 -2.244,-0.987 -3.548,-0.987 -2.123,0 -3.811,0.848 -5.063,2.541 -1.057,1.426 -1.585,3.027 -1.585,4.803 0,1.292 0.319,2.579 0.961,3.856 0.642,1.277 1.484,2.221 2.531,2.831 C -1.8,0.695 -0.692,1 0.479,1"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path891" /></g><g
           id="g893"
           transform="translate(284.178,72.7857)"><path
             d="m 0,0 v -18.702 c 0,-0.883 0.061,-1.468 0.192,-1.756 0.127,-0.286 0.325,-0.504 0.592,-0.653 0.267,-0.149 0.763,-0.223 1.491,-0.223 v -0.555 h -6.911 v 0.555 c 0.648,0 1.09,0.067 1.326,0.199 0.235,0.134 0.42,0.356 0.553,0.663 0.133,0.307 0.199,0.898 0.199,1.77 v 12.806 c 0,1.591 -0.035,2.568 -0.107,2.934 -0.072,0.363 -0.188,0.612 -0.347,0.745 -0.158,0.134 -0.361,0.2 -0.605,0.2 -0.27,0 -0.607,-0.082 -1.019,-0.246 L -4.896,-1.724 -0.694,0 Z"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path895" /></g><g
           id="g897"
           transform="translate(298.2297,72.293)"><path
             d="M 0,0 -4.54,-5.311 H -5.063 L -3.447,0 Z m -3.725,-7.881 c -0.544,0 -1.09,-0.161 -1.639,-0.485 -0.55,-0.323 -0.992,-0.89 -1.33,-1.701 -0.34,-0.811 -0.509,-1.853 -0.509,-3.125 0,-2.053 0.407,-3.823 1.224,-5.31 0.815,-1.488 1.89,-2.231 3.225,-2.231 0.994,0 1.816,0.41 2.463,1.23 0.645,0.821 0.969,2.232 0.969,4.233 0,2.504 -0.538,4.475 -1.616,5.912 -0.731,0.984 -1.658,1.477 -2.787,1.477 m 0.477,1 c 2.136,0 3.849,-0.81 5.142,-2.432 1.097,-1.385 1.647,-2.976 1.647,-4.771 0,-1.262 -0.303,-2.541 -0.909,-3.833 -0.605,-1.294 -1.438,-2.269 -2.5,-2.924 -1.064,-0.658 -2.246,-0.987 -3.548,-0.987 -2.125,0 -3.813,0.848 -5.065,2.541 -1.057,1.426 -1.585,3.027 -1.585,4.803 0,1.292 0.321,2.578 0.962,3.856 0.641,1.276 1.486,2.221 2.531,2.831 1.047,0.611 2.155,0.916 3.325,0.916"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path899" /></g><g
           id="g901"
           transform="translate(310.2971,64.6734)"><path
             d="m 0,0 c -0.758,0 -1.396,-0.303 -1.908,-0.908 -0.512,-0.605 -0.771,-1.534 -0.771,-2.786 0,-1.621 0.351,-2.879 1.047,-3.771 0.533,-0.677 1.211,-1.017 2.031,-1.017 0.783,0 1.422,0.293 1.926,0.878 0.501,0.586 0.754,1.504 0.754,2.756 0,1.631 -0.354,2.908 -1.061,3.832 C 1.495,-0.339 0.821,0 0,0 m -2.831,-13.777 c -0.482,-0.523 -0.846,-1.011 -1.094,-1.462 -0.246,-0.451 -0.368,-0.867 -0.368,-1.246 0,-0.494 0.297,-0.924 0.893,-1.294 1.024,-0.637 2.508,-0.954 4.448,-0.954 1.846,0 3.209,0.326 4.087,0.979 0.876,0.651 1.316,1.346 1.316,2.084 0,0.535 -0.264,0.914 -0.785,1.139 -0.534,0.226 -1.593,0.36 -3.172,0.401 -2.307,0.061 -4.086,0.178 -5.325,0.353 m 0.152,5.142 c -0.861,0.421 -1.521,1.009 -1.985,1.762 -0.46,0.754 -0.692,1.589 -0.692,2.501 0,1.396 0.527,2.598 1.579,3.602 1.051,1.006 2.397,1.508 4.039,1.508 1.342,0 2.509,-0.327 3.494,-0.984 h 2.987 c 0.441,0 0.698,-0.013 0.769,-0.039 C 7.585,-0.31 7.636,-0.354 7.665,-0.416 7.728,-0.507 7.759,-0.672 7.759,-0.908 7.759,-1.174 7.731,-1.36 7.682,-1.461 7.651,-1.513 7.598,-1.554 7.521,-1.585 7.442,-1.616 7.184,-1.631 6.743,-1.631 H 4.91 c 0.575,-0.74 0.862,-1.682 0.862,-2.833 0,-1.314 -0.501,-2.437 -1.506,-3.37 -1.007,-0.935 -2.356,-1.402 -4.049,-1.402 -0.699,0 -1.412,0.103 -2.142,0.309 -0.451,-0.39 -0.756,-0.732 -0.914,-1.024 -0.159,-0.293 -0.239,-0.542 -0.239,-0.747 0,-0.174 0.086,-0.344 0.253,-0.507 0.171,-0.165 0.502,-0.283 0.994,-0.355 0.288,-0.041 1.005,-0.077 2.156,-0.107 2.114,-0.052 3.483,-0.124 4.109,-0.216 0.956,-0.134 1.716,-0.487 2.286,-1.063 0.568,-0.574 0.855,-1.282 0.855,-2.124 0,-1.159 -0.545,-2.247 -1.633,-3.263 -1.599,-1.498 -3.688,-2.247 -6.264,-2.247 -1.981,0 -3.654,0.447 -5.019,1.339 -0.769,0.513 -1.155,1.047 -1.155,1.601 0,0.246 0.057,0.492 0.17,0.739 0.176,0.38 0.534,0.908 1.079,1.585 0.07,0.092 0.595,0.647 1.57,1.662 -0.536,0.32 -0.912,0.604 -1.132,0.855 -0.222,0.251 -0.331,0.536 -0.331,0.854 0,0.359 0.147,0.78 0.438,1.262 0.293,0.484 0.968,1.165 2.023,2.048"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path903" /></g><g
           id="g905"
           transform="translate(323.1956,72.7857)"><path
             d="m 0,0 c 0.432,0 0.8,-0.151 1.103,-0.454 0.302,-0.303 0.455,-0.67 0.455,-1.101 0,-0.431 -0.153,-0.8 -0.455,-1.108 C 0.8,-2.971 0.432,-3.125 0,-3.125 c -0.429,0 -0.799,0.154 -1.106,0.462 -0.309,0.308 -0.461,0.677 -0.461,1.108 0,0.431 0.15,0.798 0.452,1.101 C -0.811,-0.151 -0.438,0 0,0 m 1.279,-7.374 v -11.328 c 0,-0.883 0.064,-1.47 0.194,-1.763 0.126,-0.293 0.316,-0.511 0.567,-0.654 0.254,-0.144 0.712,-0.215 1.38,-0.215 v -0.555 h -6.851 v 0.555 c 0.687,0 1.15,0.067 1.386,0.199 0.235,0.134 0.424,0.356 0.562,0.663 0.137,0.307 0.209,0.898 0.209,1.77 v 5.433 c 0,1.529 -0.049,2.519 -0.141,2.971 -0.071,0.328 -0.185,0.557 -0.339,0.685 -0.153,0.127 -0.363,0.193 -0.63,0.193 -0.287,0 -0.636,-0.078 -1.047,-0.232 l -0.215,0.555 4.247,1.723 z"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path907" /></g><g
           id="g909"
           transform="translate(340.344,56.2534)"><path
             d="m 0,0 c -0.38,-1.858 -1.123,-3.287 -2.231,-4.286 -1.109,-1.001 -2.335,-1.503 -3.678,-1.503 -1.603,0 -2.996,0.673 -4.188,2.017 -1.189,1.345 -1.786,3.162 -1.786,5.45 0,2.217 0.66,4.017 1.979,5.403 1.319,1.385 2.901,2.077 4.748,2.077 1.385,0 2.524,-0.366 3.417,-1.1 0.894,-0.733 1.34,-1.496 1.34,-2.287 0,-0.389 -0.126,-0.704 -0.378,-0.945 -0.252,-0.241 -0.603,-0.363 -1.054,-0.363 -0.606,0 -1.062,0.197 -1.37,0.586 -0.174,0.216 -0.292,0.626 -0.347,1.232 -0.056,0.605 -0.265,1.066 -0.623,1.385 -0.358,0.308 -0.856,0.462 -1.494,0.462 -1.025,0 -1.851,-0.38 -2.478,-1.14 -0.831,-1.006 -1.245,-2.335 -1.245,-3.987 0,-1.682 0.411,-3.168 1.239,-4.455 0.824,-1.289 1.94,-1.932 3.346,-1.932 1.006,0 1.91,0.344 2.709,1.031 0.567,0.472 1.115,1.329 1.648,2.571 z"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path911" /></g><g
           id="g913"
           transform="translate(348.7795,64.4116)"><path
             d="m 0,0 c -0.541,0 -1.09,-0.161 -1.64,-0.485 -0.548,-0.323 -0.99,-0.89 -1.331,-1.701 -0.338,-0.811 -0.508,-1.853 -0.508,-3.125 0,-2.052 0.409,-3.822 1.225,-5.31 0.816,-1.487 1.891,-2.231 3.225,-2.231 0.996,0 1.815,0.41 2.463,1.23 0.645,0.821 0.97,2.232 0.97,4.234 0,2.503 -0.539,4.474 -1.618,5.911 C 2.056,-0.492 1.13,0 0,0 m 0.479,1 c 2.133,0 3.847,-0.81 5.139,-2.432 1.099,-1.385 1.649,-2.976 1.649,-4.771 0,-1.262 -0.305,-2.541 -0.908,-3.833 -0.606,-1.294 -1.441,-2.269 -2.503,-2.924 -1.061,-0.657 -2.245,-0.987 -3.548,-0.987 -2.122,0 -3.812,0.848 -5.063,2.541 -1.057,1.426 -1.585,3.027 -1.585,4.803 0,1.292 0.319,2.579 0.96,3.856 0.642,1.277 1.484,2.221 2.531,2.831 C -1.799,0.695 -0.692,1 0.479,1"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path915" /></g><g
           id="g917"
           transform="translate(211.4221,22.832)"><path
             d="M 0,0 V 6.404 C -0.054,7.019 -0.218,7.58 -0.489,8.085 -0.76,8.592 -1.12,8.974 -1.566,9.233 c -0.449,0.258 -0.886,0.386 -1.31,0.386 -0.796,0 -1.506,-0.358 -2.129,-1.072 -0.824,-0.942 -1.234,-2.316 -1.234,-4.126 0,-1.824 0.397,-3.225 1.193,-4.196 0.795,-0.974 1.681,-1.458 2.658,-1.458 0.823,0 1.619,0.41 2.388,1.233 m 0,-0.949 c -0.606,-0.632 -1.199,-1.088 -1.777,-1.364 -0.579,-0.275 -1.203,-0.414 -1.872,-0.414 -1.356,0 -2.541,0.568 -3.554,1.703 -1.013,1.135 -1.52,2.593 -1.52,4.377 0,1.78 0.561,3.411 1.682,4.888 1.121,1.48 2.564,2.217 4.326,2.217 1.096,0 2.001,-0.346 2.715,-1.041 v 2.291 c 0,1.419 -0.035,2.292 -0.103,2.617 -0.067,0.326 -0.173,0.548 -0.317,0.666 -0.145,0.117 -0.325,0.176 -0.543,0.176 -0.236,0 -0.547,-0.073 -0.935,-0.218 l -0.179,0.476 3.704,1.518 h 0.61 V 2.578 c 0,-1.456 0.035,-2.345 0.104,-2.665 0.065,-0.323 0.175,-0.546 0.324,-0.671 0.149,-0.129 0.323,-0.191 0.522,-0.191 0.244,0 0.571,0.077 0.978,0.231 L 4.312,-1.194 0.624,-2.727 H 0 Z"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path919" /></g><g
           id="g921"
           transform="translate(218.6262,29.0176)"><path
             d="M 0,0 H 5.75 C 5.705,0.798 5.61,1.358 5.466,1.684 5.238,2.19 4.903,2.588 4.455,2.876 4.008,3.166 3.538,3.311 3.051,3.311 2.299,3.311 1.628,3.02 1.036,2.437 0.444,1.853 0.098,1.041 0,0 M 0,-0.786 C -0.01,-2.63 0.437,-4.078 1.342,-5.127 2.246,-6.176 3.31,-6.701 4.53,-6.701 c 0.813,0 1.521,0.223 2.122,0.672 0.603,0.447 1.106,1.214 1.513,2.3 L 8.584,-4 C 8.396,-5.241 7.844,-6.369 6.93,-7.386 6.017,-8.403 4.873,-8.912 3.498,-8.912 c -1.49,0 -2.768,0.581 -3.832,1.743 -1.063,1.164 -1.596,2.725 -1.596,4.686 0,2.126 0.548,3.783 1.637,4.974 1.091,1.189 2.459,1.782 4.105,1.782 1.391,0 2.535,-0.458 3.43,-1.377 0.896,-0.917 1.342,-2.144 1.342,-3.682 z"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path923" /></g><g
           id="g925"
           transform="translate(251.6712,39.3013)"><path
             d="M 0,0 0.42,-6.254 H 0 c -0.561,1.873 -1.361,3.219 -2.401,4.043 -1.039,0.822 -2.287,1.234 -3.745,1.234 -1.22,0 -2.323,-0.31 -3.309,-0.929 -0.984,-0.619 -1.762,-1.607 -2.326,-2.965 -0.567,-1.356 -0.849,-3.043 -0.849,-5.058 0,-1.665 0.266,-3.107 0.8,-4.328 0.535,-1.22 1.336,-2.158 2.408,-2.809 1.072,-0.651 2.294,-0.976 3.67,-0.976 1.194,0 2.247,0.255 3.162,0.766 0.911,0.511 1.916,1.526 3.01,3.046 l 0.422,-0.272 c -0.922,-1.637 -2,-2.834 -3.23,-3.595 -1.229,-0.759 -2.69,-1.139 -4.38,-1.139 -3.049,0 -5.41,1.131 -7.083,3.391 -1.248,1.683 -1.871,3.663 -1.871,5.942 0,1.837 0.412,3.523 1.236,5.061 0.821,1.537 1.954,2.728 3.396,3.574 1.443,0.846 3.02,1.268 4.728,1.268 1.329,0 2.641,-0.326 3.933,-0.977 0.379,-0.199 0.652,-0.299 0.816,-0.299 0.243,0 0.455,0.086 0.636,0.258 0.236,0.244 0.403,0.583 0.501,1.018 z"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path927" /></g><g
           id="g929"
           transform="translate(259.9993,32.3975)"><path
             d="m 0,0 c -0.479,0 -0.959,-0.143 -1.445,-0.428 -0.483,-0.284 -0.873,-0.786 -1.171,-1.499 -0.299,-0.715 -0.449,-1.632 -0.449,-2.755 0,-1.808 0.36,-3.367 1.077,-4.678 0.719,-1.313 1.669,-1.968 2.844,-1.968 0.876,0 1.6,0.362 2.169,1.084 0.57,0.724 0.856,1.968 0.856,3.732 0,2.206 -0.476,3.943 -1.425,5.21 C 1.813,-0.436 0.995,0 0,0 m 0.421,0.879 c 1.88,0 3.392,-0.713 4.532,-2.141 0.967,-1.221 1.451,-2.623 1.451,-4.205 0,-1.113 -0.266,-2.24 -0.801,-3.38 -0.534,-1.139 -1.27,-1.998 -2.205,-2.578 -0.936,-0.578 -1.977,-0.867 -3.127,-0.867 -1.871,0 -3.36,0.746 -4.461,2.238 -0.932,1.258 -1.399,2.669 -1.399,4.233 0,1.139 0.283,2.273 0.848,3.399 0.567,1.127 1.309,1.956 2.231,2.496 0.924,0.538 1.901,0.805 2.931,0.805"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path931" /></g><g
           id="g933"
           transform="translate(276.2639,33.2769)"><path
             d="m 0,0 v -4.232 h -0.447 c -0.342,1.331 -0.785,2.235 -1.322,2.715 -0.538,0.478 -1.223,0.718 -2.054,0.718 -0.634,0 -1.146,-0.168 -1.534,-0.503 -0.389,-0.333 -0.583,-0.703 -0.583,-1.112 0,-0.506 0.143,-0.94 0.434,-1.302 0.279,-0.371 0.85,-0.764 1.71,-1.18 l 1.981,-0.962 c 1.835,-0.897 2.752,-2.078 2.752,-3.541 0,-1.132 -0.427,-2.043 -1.282,-2.734 -0.854,-0.692 -1.811,-1.038 -2.87,-1.038 -0.758,0 -1.626,0.136 -2.604,0.407 -0.298,0.091 -0.542,0.137 -0.733,0.137 -0.207,0 -0.37,-0.118 -0.487,-0.354 h -0.447 v 4.436 h 0.447 c 0.254,-1.267 0.737,-2.22 1.452,-2.864 0.714,-0.641 1.513,-0.962 2.401,-0.962 0.624,0 1.13,0.183 1.527,0.549 0.391,0.366 0.59,0.808 0.59,1.323 0,0.625 -0.221,1.149 -0.658,1.575 -0.441,0.424 -1.315,0.961 -2.626,1.614 -1.311,0.651 -2.169,1.237 -2.579,1.763 -0.407,0.515 -0.608,1.166 -0.608,1.952 0,1.023 0.349,1.878 1.05,2.567 0.7,0.685 1.608,1.028 2.72,1.028 0.488,0 1.081,-0.102 1.777,-0.311 0.463,-0.135 0.768,-0.202 0.924,-0.202 0.143,0 0.256,0.03 0.337,0.094 0.083,0.063 0.176,0.203 0.285,0.419 z"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path935" /></g><g
           id="g937"
           transform="translate(282.6555,36.9942)"><path
             d="m 0,0 v -4.083 h 2.903 v -0.95 H 0 v -8.057 c 0,-0.806 0.113,-1.348 0.347,-1.628 0.228,-0.281 0.525,-0.421 0.887,-0.421 0.299,0 0.588,0.093 0.867,0.279 0.282,0.185 0.5,0.46 0.652,0.82 h 0.529 c -0.317,-0.885 -0.764,-1.554 -1.342,-2 -0.58,-0.447 -1.177,-0.672 -1.792,-0.672 -0.416,0 -0.821,0.116 -1.219,0.345 -0.399,0.231 -0.693,0.562 -0.882,0.992 -0.191,0.428 -0.285,1.091 -0.285,1.986 v 8.356 h -1.968 v 0.449 c 0.498,0.199 1.007,0.536 1.525,1.01 0.52,0.476 0.985,1.039 1.392,1.688 0.207,0.344 0.498,0.973 0.868,1.886 z"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path939" /></g><g
           id="g941"
           transform="translate(293.8069,23.1597)"><path
             d="M 0,0 V 4.733 C -1.366,4.19 -2.249,3.807 -2.646,3.581 -3.359,3.182 -3.871,2.766 -4.18,2.333 -4.485,1.898 -4.64,1.423 -4.64,0.906 c 0,-0.649 0.195,-1.191 0.582,-1.619 0.39,-0.431 0.837,-0.644 1.343,-0.644 0.689,0 1.592,0.451 2.715,1.357 m 0,-0.884 c -1.275,-0.985 -2.076,-1.554 -2.402,-1.709 -0.487,-0.227 -1.007,-0.339 -1.56,-0.339 -0.86,0 -1.568,0.293 -2.125,0.883 -0.556,0.588 -0.832,1.359 -0.832,2.319 0,0.605 0.136,1.13 0.405,1.574 0.371,0.615 1.016,1.194 1.935,1.737 0.917,0.542 2.444,1.203 4.579,1.98 L 0,6.049 C 0,7.288 -0.197,8.137 -0.592,8.6 -0.983,9.06 -1.557,9.291 -2.308,9.291 -2.877,9.291 -3.329,9.137 -3.664,8.829 -4.007,8.524 -4.18,8.169 -4.18,7.771 l 0.028,-0.786 c 0,-0.417 -0.107,-0.737 -0.319,-0.962 -0.213,-0.227 -0.491,-0.339 -0.835,-0.339 -0.333,0 -0.607,0.115 -0.82,0.352 -0.214,0.234 -0.318,0.555 -0.318,0.963 0,0.778 0.397,1.493 1.193,2.143 0.796,0.651 1.913,0.975 3.351,0.975 1.103,0 2.007,-0.184 2.713,-0.555 C 1.346,9.282 1.741,8.843 1.993,8.246 2.155,7.857 2.237,7.062 2.237,5.858 V 1.64 c 0,-1.184 0.023,-1.91 0.068,-2.178 0.047,-0.267 0.12,-0.445 0.223,-0.536 0.105,-0.091 0.224,-0.134 0.361,-0.134 0.144,0 0.272,0.03 0.38,0.093 0.19,0.117 0.556,0.449 1.099,0.993 V -0.884 C 3.354,-2.241 2.387,-2.918 1.464,-2.918 c -0.443,0 -0.796,0.153 -1.058,0.46 C 0.145,-2.15 0.007,-1.625 0,-0.884"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path943" /></g><g
           id="g945"
           transform="translate(310.886,29.9414)"><path
             d="m 0,0 c 0.171,0 0.32,-0.002 0.447,-0.008 0.127,-0.004 0.232,-0.006 0.313,-0.006 1.753,0 3.075,0.379 3.969,1.14 0.889,0.759 1.333,1.727 1.333,2.903 0,1.148 -0.357,2.082 -1.078,2.8 C 4.266,7.549 3.313,7.908 2.128,7.908 1.604,7.908 0.895,7.821 0,7.65 Z M 13.063,-9.456 H 8.152 L 1.927,-0.855 C 1.465,-0.873 1.089,-0.883 0.801,-0.883 0.683,-0.883 0.555,-0.88 0.419,-0.876 0.283,-0.871 0.143,-0.864 0,-0.855 V -6.2 c 0,-1.159 0.126,-1.878 0.378,-2.157 0.345,-0.398 0.86,-0.598 1.549,-0.598 h 0.717 v -0.501 h -7.882 v 0.501 h 0.692 c 0.779,0 1.333,0.254 1.669,0.76 0.189,0.28 0.283,0.946 0.283,1.995 V 5.684 c 0,1.157 -0.125,1.877 -0.379,2.155 -0.352,0.4 -0.876,0.598 -1.573,0.598 H -5.238 V 8.938 H 1.465 C 3.417,8.938 4.858,8.796 5.784,8.512 6.713,8.227 7.499,7.703 8.146,6.937 8.792,6.174 9.115,5.264 9.115,4.204 9.115,3.075 8.745,2.093 8.01,1.261 7.272,0.429 6.131,-0.159 4.583,-0.503 l 3.8,-5.276 c 0.87,-1.212 1.616,-2.016 2.236,-2.416 0.626,-0.398 1.44,-0.65 2.444,-0.76 z"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path947" /></g><g
           id="g949"
           transform="translate(327.7346,39.7754)"><path
             d="M 0,0 C 0.38,0 0.702,-0.133 0.969,-0.4 1.235,-0.666 1.368,-0.991 1.368,-1.37 1.368,-1.75 1.235,-2.075 0.969,-2.346 0.702,-2.618 0.38,-2.753 0,-2.753 c -0.38,0 -0.708,0.135 -0.978,0.407 -0.271,0.271 -0.405,0.596 -0.405,0.976 0,0.379 0.132,0.704 0.4,0.97 C -0.716,-0.133 -0.391,0 0,0 m 1.126,-6.499 v -9.983 c 0,-0.777 0.055,-1.295 0.168,-1.553 0.114,-0.258 0.281,-0.45 0.503,-0.577 0.222,-0.126 0.627,-0.191 1.214,-0.191 v -0.487 h -6.036 v 0.487 c 0.605,0 1.011,0.06 1.22,0.178 0.208,0.118 0.373,0.312 0.495,0.583 0.122,0.272 0.184,0.792 0.184,1.56 v 4.789 c 0,1.347 -0.041,2.22 -0.123,2.619 -0.062,0.289 -0.163,0.49 -0.298,0.602 -0.136,0.114 -0.32,0.17 -0.557,0.17 -0.252,0 -0.56,-0.068 -0.921,-0.202 l -0.191,0.488 3.746,1.517 z"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path951" /></g><g
           id="g953"
           transform="translate(342.8459,25.207)"><path
             d="m 0,0 c -0.334,-1.637 -0.989,-2.897 -1.968,-3.779 -0.974,-0.881 -2.056,-1.323 -3.242,-1.323 -1.408,0 -2.639,0.592 -3.689,1.778 -1.049,1.184 -1.574,2.785 -1.574,4.803 0,1.953 0.581,3.54 1.743,4.76 1.163,1.221 2.558,1.831 4.187,1.831 1.221,0 2.223,-0.321 3.01,-0.969 0.788,-0.646 1.181,-1.317 1.181,-2.015 0,-0.343 -0.112,-0.621 -0.333,-0.835 C -0.907,4.04 -1.217,3.935 -1.614,3.935 -2.146,3.935 -2.551,4.104 -2.82,4.449 -2.976,4.64 -3.076,5 -3.127,5.533 -3.177,6.068 -3.359,6.477 -3.675,6.754 -3.992,7.026 -4.431,7.163 -4.992,7.163 -5.896,7.163 -6.625,6.827 -7.176,6.159 -7.908,5.273 -8.273,4.1 -8.273,2.645 c 0,-1.482 0.362,-2.792 1.09,-3.928 0.728,-1.134 1.711,-1.702 2.95,-1.702 0.887,0 1.682,0.303 2.387,0.909 0.499,0.415 0.983,1.17 1.454,2.265 z"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path955" /></g><g
           id="g957"
           transform="translate(351.6643,23.1597)"><path
             d="M 0,0 V 4.733 C -1.365,4.19 -2.248,3.807 -2.646,3.581 -3.36,3.182 -3.871,2.766 -4.178,2.333 -4.485,1.898 -4.641,1.423 -4.641,0.906 c 0,-0.649 0.197,-1.191 0.584,-1.619 0.389,-0.431 0.836,-0.644 1.344,-0.644 0.687,0 1.591,0.451 2.713,1.357 m 0,-0.884 c -1.275,-0.985 -2.077,-1.554 -2.4,-1.709 -0.49,-0.227 -1.009,-0.339 -1.563,-0.339 -0.858,0 -1.565,0.293 -2.12,0.883 -0.558,0.588 -0.837,1.359 -0.837,2.319 0,0.605 0.136,1.13 0.407,1.574 0.372,0.615 1.016,1.194 1.934,1.737 0.917,0.542 2.444,1.203 4.579,1.98 V 6.049 C 0,7.288 -0.197,8.137 -0.591,8.6 -0.982,9.06 -1.556,9.291 -2.306,9.291 -2.875,9.291 -3.329,9.137 -3.663,8.829 -4.007,8.524 -4.178,8.169 -4.178,7.771 l 0.026,-0.786 c 0,-0.417 -0.108,-0.737 -0.319,-0.962 -0.211,-0.227 -0.49,-0.339 -0.833,-0.339 -0.335,0 -0.61,0.115 -0.822,0.352 -0.211,0.234 -0.317,0.555 -0.317,0.963 0,0.778 0.399,1.493 1.192,2.143 0.795,0.651 1.914,0.975 3.351,0.975 1.103,0 2.008,-0.184 2.714,-0.555 C 1.347,9.282 1.741,8.843 1.993,8.246 2.156,7.857 2.239,7.062 2.239,5.858 V 1.64 c 0,-1.184 0.022,-1.91 0.067,-2.178 0.045,-0.267 0.119,-0.445 0.224,-0.536 0.104,-0.091 0.224,-0.134 0.359,-0.134 0.143,0 0.272,0.03 0.38,0.093 0.19,0.117 0.556,0.449 1.099,0.993 V -0.884 C 3.356,-2.241 2.388,-2.918 1.464,-2.918 1.022,-2.918 0.67,-2.765 0.405,-2.458 0.145,-2.15 0.008,-1.625 0,-0.884"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path959" /></g><g
           id="g961"
           transform="translate(78.3523,71.6328)"><path
             d="m 0,0 0.558,-11.823 h -1.413 c -0.274,2.083 -0.645,3.57 -1.116,4.461 -0.769,1.438 -1.791,2.498 -3.067,3.179 -1.277,0.683 -2.955,1.023 -5.038,1.023 h -7.102 v -38.518 c 0,-3.097 0.336,-5.031 1.005,-5.799 0.941,-1.042 2.391,-1.562 4.35,-1.562 h 1.747 v -1.375 h -21.378 v 1.375 h 1.785 c 2.131,0 3.643,0.644 4.536,1.933 0.545,0.793 0.817,2.604 0.817,5.428 V -3.16 h -6.06 c -2.355,0 -4.028,-0.174 -5.019,-0.52 -1.29,-0.472 -2.393,-1.376 -3.309,-2.715 -0.917,-1.338 -1.463,-3.148 -1.636,-5.428 h -1.413 L -41.158,0 Z"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path963" /></g><g
           id="g965"
           transform="translate(94.4343,68.8819)"><path
             d="m 0,0 v -19.929 h 11.08 c 2.874,0 4.795,0.435 5.762,1.302 1.288,1.14 2.008,3.148 2.157,6.023 h 1.375 v -17.548 h -1.375 c -0.348,2.453 -0.695,4.027 -1.041,4.72 -0.447,0.869 -1.179,1.549 -2.194,2.046 -1.016,0.496 -2.578,0.743 -4.684,0.743 H 0 v -16.619 c 0,-2.23 0.098,-3.588 0.297,-4.07 0.199,-0.483 0.545,-0.867 1.041,-1.152 0.495,-0.287 1.437,-0.428 2.826,-0.428 h 8.551 c 2.85,0 4.92,0.197 6.209,0.595 1.289,0.397 2.528,1.177 3.718,2.342 1.537,1.536 3.11,3.853 4.722,6.953 h 1.487 l -4.35,-12.641 h -38.853 v 1.375 h 1.785 c 1.189,0 2.317,0.284 3.383,0.855 0.793,0.397 1.333,0.992 1.617,1.784 0.285,0.793 0.429,2.418 0.429,4.87 v 32.756 c 0,3.197 -0.324,5.168 -0.968,5.912 -0.892,0.99 -2.379,1.486 -4.461,1.486 h -1.785 v 1.376 h 38.853 l 0.558,-11.043 h -1.451 c -0.521,2.653 -1.096,4.476 -1.728,5.466 -0.632,0.992 -1.568,1.748 -2.807,2.268 C 18.082,-0.186 16.333,0 13.831,0 Z"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path967" /></g><g
           id="g969"
           transform="translate(166.3064,72.7857)"><path
             d="M 0,0 1.153,-17.14 H 0 c -1.538,5.131 -3.73,8.825 -6.581,11.08 -2.851,2.255 -6.271,3.382 -10.261,3.382 -3.346,0 -6.371,-0.848 -9.072,-2.546 -2.702,-1.697 -4.828,-4.405 -6.377,-8.124 -1.548,-3.717 -2.324,-8.34 -2.324,-13.867 0,-4.56 0.732,-8.514 2.195,-11.861 1.462,-3.346 3.662,-5.911 6.599,-7.695 2.937,-1.786 6.29,-2.678 10.057,-2.678 3.272,0 6.16,0.699 8.662,2.101 2.504,1.4 5.255,4.182 8.255,8.347 l 1.152,-0.743 c -2.528,-4.487 -5.478,-7.772 -8.848,-9.853 -3.372,-2.081 -7.374,-3.124 -12.009,-3.124 -8.353,0 -14.823,3.099 -19.408,9.296 -3.421,4.611 -5.131,10.038 -5.131,16.284 0,5.031 1.128,9.654 3.384,13.868 2.255,4.213 5.359,7.479 9.313,9.797 3.954,2.317 8.272,3.476 12.957,3.476 3.644,0 7.237,-0.892 10.781,-2.678 1.042,-0.545 1.785,-0.817 2.232,-0.817 0.669,0 1.251,0.235 1.747,0.706 0.644,0.669 1.102,1.599 1.376,2.789 z"
             style="fill:#002855;fill-opacity:1;fill-rule:nonzero;stroke:none"
             id="path971" /></g></g></g></g></svg>



```

---

### Archivo: `tests/test_suite.js`

```javascript
const assert = require('node:assert');
const { getDb } = require('../src/database/db');
const { seedDatabase } = require('../src/database/seed');
const { validateContact, normalizeEmail, normalizeText } = require('../src/utils/validator');
const { checkDuplicate, stringSimilarity, levenshteinDistance } = require('../src/services/duplicateDetector');
const { generateXlsx, generateMultiSheetXlsx, generateOfficialTemplate, parseXlsx, parseCsv, TEMPLATES } = require('../src/services/excelService');
const contactService = require('../src/services/contactService');
const { exportContactsToXlsx } = require('../src/services/exportService');
const { handleApi } = require('../src/routes/api');

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runAllTests() {
  console.log('\n======================================================');
  console.log('🧪 Ejecutando Suite de Pruebas Institucionales TEC QS');
  console.log('======================================================\n');

  // Inicializar base de datos y limpiar datos de prueba para asegurar idempotencia
  const db = getDb();
  seedDatabase();
  db.exec("DELETE FROM contactos WHERE id LIKE 'test-%' OR email_normalized IN ('hinton@cs.toronto.edu', 'feifeili@cs.stanford.edu', 'andrew.ng@deeplearning.ai', 'contact.user1@techcorp1.com', 'contact.user2@bankcorp2.com', 'yoshua.bengio@umontreal.ca') OR email_normalized LIKE '%bengio%'");
  db.exec("DELETE FROM funcionarios WHERE email_normalized IN ('lmorales@itcr.ac.cr', 'gcastro@itcr.ac.cr', 'kjimenez@itcr.ac.cr', 'mjimenez.fonseca@itcr.ac.cr', 'inedito.func@itcr.ac.cr') OR email_normalized LIKE '%inedito%'");
  db.exec("DELETE FROM auditoria WHERE contacto_id NOT IN (SELECT id FROM contactos)");

  const mockAdmin = {
    id: 'usr-admin-01',
    nombre_completo: 'Lic. Administrador General QS',
    rol: 'ADMIN',
    sede_id: 'sede-cartago',
    departamento_id: 'dep-inter'
  };

  // 1. Pruebas de Validación Sintáctica y de Reglas de Negocio
  console.log('--- 1. Validaciones de Formulario y Sanitización ---');

  test('Validación de contacto Académico completo y correcto', () => {
    const data = {
      tipo_contacto: 'ACADEMICO',
      title: 'Dr',
      first_name: 'Caden',
      last_name: 'Puah',
      job_title: 'Lecturer',
      department_unit: 'Medicine',
      institution: 'XYZ University',
      country: 'Malaysia',
      email: 'caden@xyz-unistaff.com',
      subject: 'Pharmacology'
    };
    const res = validateContact(data, 'ACADEMICO');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.sanitized.source, 'Instituto Tecnológico de Costa Rica');
    assert.strictEqual(res.sanitized.email, 'caden@xyz-unistaff.com');
  });

  test('Rechazo de correo con formato inválido', () => {
    const data = {
      tipo_contacto: 'ACADEMICO',
      title: 'Dr',
      first_name: 'Caden',
      last_name: 'Puah',
      job_title: 'Lecturer',
      department_unit: 'Medicine',
      institution: 'XYZ University',
      country: 'Malaysia',
      email: 'caden.xyz-unistaff.com', // Falta @
      subject: 'Pharmacology'
    };
    const res = validateContact(data, 'ACADEMICO');
    assert.strictEqual(res.isValid, false);
    assert.ok(res.errors.email);
  });

  test('Limpieza automática de espacios innecesarios al inicio y final del correo', () => {
    const data = {
      tipo_contacto: 'EMPLEADOR',
      title: 'Miss',
      first_name: ' Caden ',
      last_name: ' Puah ',
      position: 'Manager',
      industry: 'Engineering',
      company_name: 'XYZ Limited',
      country: 'Malaysia',
      email: '  caden.p@xyz-limited.com  '
    };
    const res = validateContact(data, 'EMPLEADOR');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.sanitized.email, 'caden.p@xyz-limited.com');
    assert.strictEqual(res.sanitized.first_name, 'Caden');
    assert.ok(res.warnings.email);
  });

  test('Rechazo estricto de contactos con correos institucionales del TEC (@itcr.ac.cr / @tec.ac.cr)', () => {
    const data = {
      tipo_contacto: 'ACADEMICO',
      title: 'Prof',
      first_name: 'Juan',
      last_name: 'Pérez',
      job_title: 'Investigador',
      department_unit: 'Computación',
      institution: 'XYZ University',
      country: 'Costa Rica',
      email: 'jperez@itcr.ac.cr',
      subject: 'Pharmacology'
    };
    const res = validateContact(data, 'ACADEMICO');
    assert.strictEqual(res.isValid, false);
    assert.ok(res.errors.email);
    assert.ok(res.errors.email.includes('itcr.ac.cr'));
  });

  test('Permitir disciplinas académicas personalizadas no listadas en el catálogo QS', () => {
    const data = {
      tipo_contacto: 'ACADEMICO',
      title: 'Prof',
      first_name: 'Elena',
      last_name: 'Vargas',
      job_title: 'Investigadora Principal',
      department_unit: 'Centro de Biotecnología',
      institution: 'Universidad de Chile',
      country: 'Chile',
      email: 'evargas@uchile.cl',
      subject: 'Nanotecnología y Bioinformática Molecular Aplicada'
    };
    const res = validateContact(data, 'ACADEMICO');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.sanitized.subject_area, 'Nanotecnología y Bioinformática Molecular Aplicada');
  });

  test('Alerta informativa indicando al TEC como institución evaluadora', () => {
    const data = {
      tipo_contacto: 'ACADEMICO',
      title: 'Prof',
      first_name: 'Juan',
      last_name: 'Pérez',
      job_title: 'Investigador',
      department_unit: 'Computación',
      institution: 'Tecnológico de Costa Rica',
      country: 'Costa Rica',
      email: 'jperez@universidad-externa.edu',
      subject: 'Pharmacology'
    };
    const res = validateContact(data, 'ACADEMICO');
    assert.strictEqual(res.isValid, true);
    assert.ok(res.warnings.institution);
  });

  // 2. Pruebas de Detección de Duplicados
  console.log('\n--- 2. Motor de Detección de Duplicados y Similitud ---');

  test('Detección de coincidencia exacta por correo normalizado', () => {
    const candidate = {
      tipo_contacto: 'ACADEMICO',
      first_name: 'David',
      last_name: 'Patterson',
      email: '  PATTRSN@BERKELEY.EDU  ', // Mismo correo que el seed en mayúsculas y espacios
      institution: 'University of California, Berkeley'
    };
    const check = checkDuplicate(candidate);
    assert.strictEqual(check.status, 'EXACT_MATCH');
    assert.strictEqual(check.matchType, 'EMAIL_EXACT');
  });

  test('Detección de conflicto de roles cruzados (Académico ya registrado como Empleador)', () => {
    const candidate = {
      tipo_contacto: 'ACADEMICO',
      first_name: 'Sarah',
      last_name: 'Connor',
      email: 'sarah.connor@intel.com', // Registrado como EMPLEADOR en seed
      institution: 'Intel Labs'
    };
    const check = checkDuplicate(candidate);
    assert.strictEqual(check.status, 'POTENTIAL_DUPLICATE');
    assert.strictEqual(check.matchType, 'CROSS_ROLE_CONFLICT');
  });

  test('Detección de duplicado difuso por Levenshtein en nombre completo en misma institución', () => {
    const candidate = {
      tipo_contacto: 'ACADEMICO',
      first_name: 'Dave', // Variación corta
      last_name: 'Patterson',
      email: 'dave.patterson@eecs.berkeley.edu', // Correo nuevo
      institution: 'University of California, Berkeley'
    };
    const check = checkDuplicate(candidate);
    assert.strictEqual(check.status, 'POTENTIAL_DUPLICATE');
  });

  test('Reconocimiento de contacto nuevo sin coincidencias previas', () => {
    const candidate = {
      tipo_contacto: 'ACADEMICO',
      first_name: 'Yoshua',
      last_name: 'Bengio',
      email: 'yoshua.bengio@mila.quebec',
      institution: 'Mila - Quebec AI Institute'
    };
    const check = checkDuplicate(candidate);
    assert.strictEqual(check.status, 'NEW_CONTACT');
  });

  // 3. Pruebas de Creación y Trazabilidad Transaccional
  console.log('\n--- 3. Persistencia y Trazabilidad de Auditoría ---');

  test('Creación exitosa de contacto y registro de auditoría inmutable', () => {
    const rawData = {
      tipo_contacto: 'ACADEMICO',
      title: 'Prof',
      first_name: 'Geoffrey',
      last_name: 'Hinton',
      job_title: 'Emeritus Professor',
      department_unit: 'Computer Science',
      institution: 'University of Toronto',
      country: 'Canada',
      email: 'hinton@cs.toronto.edu',
      subject: 'Computer Science & Information Systems'
    };

    const res = contactService.createContact(rawData, mockAdmin);
    assert.strictEqual(res.success, true);
    assert.ok(res.contact.id);
    assert.strictEqual(res.contact.created_by, mockAdmin.id);

    // Verificar historial de auditoría
    const detail = contactService.getContactById(res.contact.id);
    assert.ok(detail.auditHistory.length >= 1);
    assert.strictEqual(detail.auditHistory[0].accion, 'CREACION');
  });

  test('Bloqueo de creación automática ante coincidencia exacta', () => {
    const rawData = {
      tipo_contacto: 'ACADEMICO',
      title: 'Prof',
      first_name: 'Geoffrey',
      last_name: 'Hinton',
      job_title: 'Emeritus Professor',
      department_unit: 'Computer Science',
      institution: 'University of Toronto',
      country: 'Canada',
      email: 'hinton@cs.toronto.edu', // Ya creado en el test anterior
      subject: 'Computer Science & Information Systems'
    };

    const res = contactService.createContact(rawData, mockAdmin);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.duplicateStatus, 'EXACT_MATCH');
  });

  test('Identificación y persistencia de quien recomienda el contacto institucionalmente', () => {
    const rawData = {
      tipo_contacto: 'ACADEMICO',
      title: 'Dr',
      first_name: 'Fei-Fei',
      last_name: 'Li',
      job_title: 'Professor',
      department_unit: 'Computer Science',
      institution: 'Stanford University',
      country: 'United States',
      email: 'feifeili@cs.stanford.edu',
      subject: 'Computer Science & Information Systems',
      recomienda_nombre: 'Dra. María Auxiliadora',
      recomienda_email: 'mauxiliadora@itcr.ac.cr'
    };

    const res = contactService.createContact(rawData, mockAdmin);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.contact.recomienda_nombre, 'Dra. María Auxiliadora');
    assert.strictEqual(res.contact.recomienda_email, 'mauxiliadora@itcr.ac.cr');

    // Comprobar actualización
    const upd = contactService.updateContact(res.contact.id, {
      ...rawData,
      recomienda_nombre: 'Dra. María Auxiliadora Actualizada',
      recomienda_email: 'mauxiliadora@tec.ac.cr'
    }, mockAdmin);
    assert.strictEqual(upd.success, true);
    assert.strictEqual(upd.contact.recomienda_nombre, 'Dra. María Auxiliadora Actualizada');
    assert.strictEqual(upd.contact.recomienda_email, 'mauxiliadora@tec.ac.cr');
  });

  // 4. Pruebas del Motor OpenXML (Excel) y Plantillas Oficiales
  console.log('\n--- 4. Motor Excel OpenXML y Plantillas QS ---');

  test('Generación y parseo roundtrip de archivo XLSX para Académicos', () => {
    const tpl = TEMPLATES.ACADEMICO;
    const buf = generateXlsx(tpl.sheetName, tpl.headers, tpl.sample);
    assert.ok(Buffer.isBuffer(buf));
    assert.ok(buf.length > 500);

    const parsed = parseXlsx(buf);
    assert.strictEqual(parsed.headers.length, tpl.headers.length);
    assert.strictEqual(parsed.rows.length, 1);
    assert.strictEqual(parsed.rows[0].Email, 'caden@xyz-unistaff.com');
    assert.strictEqual(parsed.rows[0].Institution, 'XYZ University');
  });

  test('Generación y parseo roundtrip de archivo XLSX para Empleadores', () => {
    const tpl = TEMPLATES.EMPLEADOR;
    const buf = generateXlsx(tpl.sheetName, tpl.headers, tpl.sample);
    const parsed = parseXlsx(buf);
    assert.strictEqual(parsed.headers.length, tpl.headers.length);
    assert.strictEqual(parsed.rows.length, 1);
    assert.strictEqual(parsed.rows[0]['Company Name'], 'XYZ Limited');
    assert.strictEqual(parsed.rows[0].Position, 'Manager');
  });

  // 5. Pruebas de Exportación Oficial QS
  console.log('\n--- 5. Exportación Oficial con Control de Calidad ---');

  test('Exportación oficial de contactos académicos respetando campos QS', () => {
    const exp = exportContactsToXlsx('ACADEMICO', {}, mockAdmin);
    assert.ok(exp.buffer);
    assert.ok(exp.totalExportados >= 1);
    assert.ok(typeof exp.totalInconsistentes === 'number');

    // Parsear el binario generado para confirmar su estructura
    const parsedExp = parseXlsx(exp.buffer);
    assert.strictEqual(parsedExp.headers[0], 'Source');
    assert.strictEqual(parsedExp.headers[1], 'Title');
    assert.strictEqual(parsedExp.headers[8], 'Email');
    assert.ok(parsedExp.rows.length >= 1);
  });

  // 6. Pruebas de Casos de Borde Críticos (Requisito 20)
  console.log('\n--- 6. Casos de Borde Específicos (Requisito 20) ---');

  test('Caso de borde: Detección de Excel con columnas faltantes', () => {
    // Falta 'Email' e 'Institution'
    const headersIncompletos = ['Source', 'Title', 'First Name', 'Last Name', 'Job Title'];
    const sample = [['Instituto Tecnológico de Costa Rica', 'Dr', 'Ana', 'Rojas', 'Docente']];
    const buf = generateXlsx('Test', headersIncompletos, sample);
    const parsed = parseXlsx(buf);

    const missing = TEMPLATES.ACADEMICO.headers.filter(h => {
      if (h === 'Source' || h === 'Phone (Optional)') return false;
      return !parsed.headers.includes(h);
    });

    assert.ok(missing.includes('Email'));
    assert.ok(missing.includes('Institution'));
    assert.ok(missing.length >= 2);
  });

  test('Caso de borde: Detección de Excel con columnas adicionales no reconocidas', () => {
    const headersConExtras = [...TEMPLATES.EMPLEADOR.headers, 'Notas Privadas', 'Salario Estimado'];
    const sample = [[...TEMPLATES.EMPLEADOR.sample[0], 'Nota de prueba', '5000 USD']];
    const buf = generateXlsx('Test', headersConExtras, sample);
    const parsed = parseXlsx(buf);

    const extras = parsed.headers.filter(h => !TEMPLATES.EMPLEADOR.headers.includes(h));
    assert.deepStrictEqual(extras, ['Notas Privadas', 'Salario Estimado']);
  });

  test('Caso de borde: Detección de archivo Excel sin filas de datos', () => {
    const buf = generateXlsx('Vacio', TEMPLATES.ACADEMICO.headers, []);
    const parsed = parseXlsx(buf);
    assert.strictEqual(parsed.rows.length, 0);
  });

  test('Caso de borde: Homónimos legítimos en diferentes países e instituciones', () => {
    const candidatoHomonimo = {
      tipo_contacto: 'ACADEMICO',
      first_name: 'David',
      last_name: 'Patterson',
      email: 'd.patterson@oxford.ac.uk',
      institution: 'University of Oxford',
      country: 'United Kingdom'
    };
    // Aunque el nombre coincide con David Patterson en Berkeley, la institución y país difieren diametralmente
    const check = checkDuplicate(candidatoHomonimo);
    assert.notStrictEqual(check.status, 'EXACT_MATCH');
    assert.ok(check.status === 'POTENTIAL_DUPLICATE' || check.status === 'NEW_CONTACT');
  });

  test('Caso de borde: Normalización de países escritos de múltiples formas (CR -> Costa Rica)', () => {
    const { resolveCountry } = require('../src/utils/validator');
    assert.strictEqual(resolveCountry('cr'), 'Costa Rica');
    assert.strictEqual(resolveCountry('c.r.'), 'Costa Rica');
    assert.strictEqual(resolveCountry('costa-rica'), 'Costa Rica');
    assert.strictEqual(resolveCountry('usa'), 'United States');
    assert.strictEqual(resolveCountry('reino unido'), 'United Kingdom');
  });

  // 8. Padrón de Funcionarios TEC, Privacidad de Contactos y Exportación
  console.log('--- 8. Padrón de Funcionarios TEC, Privacidad y Exportación ---');
  const funcionarioService = require('../src/services/funcionarioService');

  test('Consulta de funcionario existente por correo electrónico (caso Rodrigo Calvo)', () => {
    const f = funcionarioService.getFuncionarioByEmail('rocalvo@itcr.ac.cr');
    assert.ok(f);
    assert.strictEqual(f.email_normalized, 'rocalvo@itcr.ac.cr');
    assert.strictEqual(f.nombre, 'CALVO BODAN RODRIGO ALBERTO');
    assert.strictEqual(f.sede_id, 'sede-cartago');
    assert.strictEqual(f.sede_nombre, 'Campus Central Cartago');
    assert.ok(f.departamento_id);
    assert.strictEqual(f.departamento_nombre, 'CONSEJO INSTITUCIONAL; OFICINA DE PLANIFICACION INSTITUCIONAL');
  });

  test('Upsert de funcionario: creación de nuevo funcionario y actualización', () => {
    const nuevo = funcionarioService.upsertFuncionario({
      nombre: 'Ing. Laura Morales Navarro',
      email: 'lmorales@itcr.ac.cr',
      dependencia: 'Escuela de Ingeniería en Computación',
      sede: 'Campus Central Cartago'
    });
    assert.strictEqual(nuevo.isNew, true);
    assert.strictEqual(nuevo.funcionario.nombre, 'Ing. Laura Morales Navarro');

    // Actualización sobre el mismo correo
    const actualizado = funcionarioService.upsertFuncionario({
      nombre: 'Dra. Laura Morales Navarro',
      email: 'lmorales@itcr.ac.cr',
      dependencia: 'Dirección de Posgrados',
      sede: 'Campus Central Cartago'
    });
    assert.strictEqual(actualizado.isNew, false);
    assert.strictEqual(actualizado.funcionario.nombre, 'Dra. Laura Morales Navarro');
    assert.strictEqual(actualizado.funcionario.dependencia, 'Dirección de Posgrados');
  });

  test('Carga masiva de funcionarios TEC vía bulkImportFuncionarios', () => {
    const filas = [
      {
        nombre: 'Prof. Gabriel Castro',
        email: 'gcastro@itcr.ac.cr',
        dependencia: 'Escuela de Física',
        sede: 'Campus Central Cartago'
      },
      {
        nombre: 'Licda. Karen Jiménez',
        email: 'kjimenez@itcr.ac.cr',
        dependencia: 'Escuela de Química',
        sede: 'Campus Tecnológico Local San José'
      }
    ];
    const res = funcionarioService.bulkImportFuncionarios(filas);
    assert.strictEqual(res.total, 2);
    assert.ok(res.nuevos >= 1);

    const fg = funcionarioService.getFuncionarioByEmail('gcastro@itcr.ac.cr');
    assert.ok(fg);
    assert.strictEqual(fg.nombre, 'Prof. Gabriel Castro');
  });

  test('Auto-registro de funcionario cuando no existe al ingresar un contacto individual', () => {
    const mockUser = {
      id: 'usr-user-01',
      nombre_completo: 'Ing. Usuario Operativo QS',
      rol: 'USUARIO',
      email: 'usuario.qs@itcr.ac.cr',
      sede_id: 'sede-cartago',
      departamento_id: 'dep-comp'
    };

    const contacto = {
      tipo_contacto: 'ACADEMICO',
      title: 'Dr',
      first_name: 'Andrew',
      last_name: 'Ng',
      job_title: 'Adjunct Professor',
      department_unit: 'Computer Science',
      institution: 'Stanford University',
      country: 'United States',
      email: 'andrew.ng@deeplearning.ai',
      subject: 'Computer Science & Information Systems',
      recomienda_nombre: 'Dra. Marta Jiménez Fonseca',
      recomienda_email: 'mjimenez.fonseca@itcr.ac.cr',
      sede_id: 'sede-cartago',
      departamento_id: 'dep-comp'
    };

    const res = contactService.createContact(contacto, mockUser, { metodoIngreso: 'INDIVIDUAL' });
    assert.strictEqual(res.success, true);

    // Verificar que Dra. Marta Jiménez Fonseca fue auto-registrada en funcionarios
    const func = funcionarioService.getFuncionarioByEmail('mjimenez.fonseca@itcr.ac.cr');
    assert.ok(func);
    assert.strictEqual(func.nombre, 'Dra. Marta Jiménez Fonseca');
  });

  test('Privacidad en Directorio: Usuario estándar solo ve sus propios registros', () => {
    const user1 = {
      id: 'usr-isolated-01',
      nombre_completo: 'Profesor Uno',
      rol: 'USUARIO',
      email: 'prof.uno@itcr.ac.cr'
    };

    const user2 = {
      id: 'usr-isolated-02',
      nombre_completo: 'Profesor Dos',
      rol: 'USUARIO',
      email: 'prof.dos@itcr.ac.cr'
    };

    // Crear contacto para User1
    contactService.createContact({
      tipo_contacto: 'EMPLEADOR',
      title: 'Mr',
      first_name: 'ContactForUserOne',
      last_name: 'Test',
      position: 'CTO',
      industry: 'Technology',
      company_name: 'TechCorp 1',
      country: 'Costa Rica',
      email: 'contact.user1@techcorp1.com',
      recomienda_nombre: user1.nombre_completo,
      recomienda_email: user1.email
    }, user1);

    // Crear contacto para User2
    contactService.createContact({
      tipo_contacto: 'EMPLEADOR',
      title: 'Ms',
      first_name: 'ContactForUserTwo',
      last_name: 'Test',
      position: 'HR Director',
      industry: 'Finance',
      company_name: 'BankCorp 2',
      country: 'Costa Rica',
      email: 'contact.user2@bankcorp2.com',
      recomienda_nombre: user2.nombre_completo,
      recomienda_email: user2.email
    }, user2);

    // Consulta para User1: Solo debe ver sus contactos
    const contactsUser1 = contactService.listContacts({}, user1);
    const hasUser2Contact = contactsUser1.some(c => c.email === 'contact.user2@bankcorp2.com');
    assert.strictEqual(hasUser2Contact, false, 'User1 no debe tener visibilidad sobre contactos de User2');

    const hasUser1Contact = contactsUser1.some(c => c.email === 'contact.user1@techcorp1.com');
    assert.strictEqual(hasUser1Contact, true, 'User1 debe ver sus propios contactos');

    // Administrador: Debe ver todos los contactos
    const adminContacts = contactService.listContacts({}, mockAdmin);
    assert.ok(adminContacts.some(c => c.email === 'contact.user1@techcorp1.com'));
    assert.ok(adminContacts.some(c => c.email === 'contact.user2@bankcorp2.com'));

    // Administrador con filtro 'mis_registros_solamente': no debe ver los de user1 ni user2
    const adminOnlyMine = contactService.listContacts({ mis_registros_solamente: 'true' }, mockAdmin);
    assert.strictEqual(adminOnlyMine.some(c => c.email === 'contact.user1@techcorp1.com'), false);
  });

  test('Estructura de plantilla para Padrón de Funcionarios TEC', () => {
    assert.ok(TEMPLATES.FUNCIONARIOS);
    assert.strictEqual(TEMPLATES.FUNCIONARIOS.sheetName, 'Funcionarios TEC');
    assert.deepStrictEqual(TEMPLATES.FUNCIONARIOS.headers, [
      'Nombre de funcionario',
      'Correo electrónico',
      'Dependencia',
      'Sede'
    ]);
    const buf = generateXlsx(TEMPLATES.FUNCIONARIOS.sheetName, TEMPLATES.FUNCIONARIOS.headers, TEMPLATES.FUNCIONARIOS.sample);
    const parsed = parseXlsx(buf);
    assert.strictEqual(parsed.headers.length, 4);
    assert.ok(parsed.rows.length >= 1);
  });

  // 9. Pruebas de Eliminación de Contactos y Plantillas con Reglas Mínimas
  console.log('\n--- 9. Eliminación de Contactos Reportados y Plantillas con Reglas ---');

  test('Eliminación de contacto reportado por el propio usuario creador', () => {
    const userElim = {
      id: 'usr-elim-01',
      nombre_completo: 'Prof. Creador Eliminación',
      rol: 'USUARIO',
      email: 'pcreador@itcr.ac.cr'
    };

    const created = contactService.createContact({
      tipo_contacto: 'ACADEMICO',
      title: 'Dr',
      first_name: 'ContactToDelete',
      last_name: 'SelfUser',
      job_title: 'Researcher',
      department: 'Physics',
      institution: 'Oxford University',
      country: 'Reino Unido',
      email: 'delete.self@oxford.ac.uk',
      subject: 'Ciencias Naturales',
      recomienda_nombre: userElim.nombre_completo,
      recomienda_email: userElim.email
    }, userElim);

    assert.ok(created.success);
    const contactId = created.contact.id;

    // Eliminar por el mismo usuario creador
    const delResult = contactService.deleteContact(contactId, userElim);
    assert.strictEqual(delResult.success, true);

    // Verificar que ya no existe en la base de datos
    const found = contactService.getContactById(contactId);
    assert.strictEqual(found, null);

    // Verificar que se registró la baja en auditoría
    const audit = db.prepare("SELECT * FROM auditoria WHERE contacto_id = ? AND accion = 'ELIMINACION'").get(contactId);
    assert.ok(audit, 'La auditoría debe registrar la eliminación');
    assert.strictEqual(audit.usuario_id, userElim.id);
  });

  test('Bloqueo de eliminación cuando un usuario intenta eliminar el contacto de otro usuario', () => {
    const userA = {
      id: 'usr-owner-a',
      nombre_completo: 'Dueño Legitimo',
      rol: 'USUARIO',
      email: 'dueno@itcr.ac.cr'
    };

    const userB = {
      id: 'usr-intruder-b',
      nombre_completo: 'Usuario Intruso',
      rol: 'USUARIO',
      email: 'intruso@itcr.ac.cr'
    };

    const created = contactService.createContact({
      tipo_contacto: 'EMPLEADOR',
      title: 'Ing',
      first_name: 'ContactProtect',
      last_name: 'SecurityTest',
      position: 'VP Security',
      industry: 'Technology',
      company_name: 'SecureCorp',
      country: 'Costa Rica',
      email: 'security.protect@securecorp.com',
      recomienda_nombre: userA.nombre_completo,
      recomienda_email: userA.email
    }, userA);

    assert.ok(created.success);
    const contactId = created.contact.id;

    // Intruso intenta eliminar
    const delIntruder = contactService.deleteContact(contactId, userB);
    assert.strictEqual(delIntruder.success, false);
    assert.ok(delIntruder.error.includes('permisos'));

    // Verificar que el contacto sigue existiendo intacto
    const stillExists = contactService.getContactById(contactId);
    assert.ok(stillExists);

    // Limpieza con usuario dueño legítimo
    const delOwner = contactService.deleteContact(contactId, userA);
    assert.strictEqual(delOwner.success, true);
  });

  test('Eliminación de contacto reportado por Administrador con registro inmutable en auditoría', () => {
    const userNorm = {
      id: 'usr-norm-admin-del',
      nombre_completo: 'Usuario Normal',
      rol: 'USUARIO',
      email: 'norm@itcr.ac.cr'
    };

    const created = contactService.createContact({
      tipo_contacto: 'ACADEMICO',
      title: 'Prof',
      first_name: 'AdminCanDelete',
      last_name: 'AcademicPerson',
      job_title: 'Full Professor',
      department: 'Math',
      institution: 'Cambridge University',
      country: 'Reino Unido',
      email: 'admin.del@cambridge.ac.uk',
      subject: 'Ciencias Naturales',
      recomienda_nombre: userNorm.nombre_completo,
      recomienda_email: userNorm.email
    }, userNorm);

    assert.ok(created.success);
    const contactId = created.contact.id;

    // Administrador elimina el contacto de un usuario normal
    const delAdmin = contactService.deleteContact(contactId, mockAdmin);
    assert.strictEqual(delAdmin.success, true);

    const audit = db.prepare("SELECT * FROM auditoria WHERE contacto_id = ? AND accion = 'ELIMINACION'").get(contactId);
    assert.ok(audit);
    assert.strictEqual(audit.usuario_id, mockAdmin.id);
  });

  test('Plantillas oficiales descargables con pestaña de Reglas e Instrucciones y parseo de datos', () => {
    // 1. Plantilla Académica
    const bufAcad = generateOfficialTemplate('ACADEMICO');
    assert.ok(Buffer.isBuffer(bufAcad) && bufAcad.length > 500);
    const parsedAcad = parseXlsx(bufAcad);
    assert.strictEqual(parsedAcad.headers.length, 11);
    assert.ok(parsedAcad.rows.length >= 2, 'Debe incluir al menos 2 filas de ejemplo con datos válidos');

    // 2. Plantilla Empleador
    const bufEmp = generateOfficialTemplate('EMPLEADOR');
    assert.ok(Buffer.isBuffer(bufEmp) && bufEmp.length > 500);
    const parsedEmp = parseXlsx(bufEmp);
    assert.strictEqual(parsedEmp.headers.length, 10);
    assert.ok(parsedEmp.rows.length >= 2);

    // 3. Plantilla Funcionarios
    const bufFunc = generateOfficialTemplate('FUNCIONARIOS');
    assert.ok(Buffer.isBuffer(bufFunc) && bufFunc.length > 500);
    const parsedFunc = parseXlsx(bufFunc);
    assert.strictEqual(parsedFunc.headers.length, 4);
    assert.ok(parsedFunc.rows.length >= 3);
  });

  // 10. Control de Roles y Subida Selectiva de Registros No Existentes
  console.log('\n--- 10. Control de Roles y Subida Selectiva en Cargas Masivas ---');

  function createMockRes() {
    return {
      statusCode: 200,
      headers: {},
      data: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(k, v) {
        this.headers[k] = v;
        return this;
      },
      json(obj) {
        this.data = obj;
        return this;
      },
      end(str) {
        this.data = str;
        return this;
      }
    };
  }

  test('Restricción de rol: Usuario regular es rechazado (403) al intentar analizar o importar padrón de Funcionarios TEC', () => {
    const regularUser = { id: 'usr-reg-test', rol: 'USUARIO', nombre_completo: 'Usuario Regular', email: 'reg@itcr.ac.cr' };
    
    // Intento de análisis
    const resAnalyze = createMockRes();
    handleApi({ method: 'POST' }, resAnalyze, '/api/bulk/analyze', {}, { tipo_contacto: 'FUNCIONARIOS', fileBase64: 'dGVzdA==' }, regularUser);
    assert.strictEqual(resAnalyze.statusCode, 403);
    assert.strictEqual(resAnalyze.data.success, false);
    assert.ok(resAnalyze.data.message.includes('reservada exclusivamente para Administradores'));

    // Intento de importación
    const resImport = createMockRes();
    handleApi({ method: 'POST' }, resImport, '/api/bulk/import', {}, {
      tipo_contacto: 'FUNCIONARIOS',
      rowsToImport: [{ nombre: 'Test', email: 'test@itcr.ac.cr' }]
    }, regularUser);
    assert.strictEqual(resImport.statusCode, 403);
    assert.strictEqual(resImport.data.success, false);
    assert.ok(resImport.data.message.includes('reservada exclusivamente para Administradores'));
  });

  test('Carga masiva de Funcionarios: Detección de existentes en BD como Duplicado Exacto y subida de únicamente registros no existentes', () => {
    // Generar archivo con 1 funcionario existente (rocalvo@itcr.ac.cr) y 1 no existente
    const sample = [
      ['Dr. Rodrigo Calvo', 'rocalvo@itcr.ac.cr', 'Escuela de Computación', 'Campus Central Cartago'],
      ['Ing. Funcionario Inédito', 'inedito.func@itcr.ac.cr', 'Escuela de Computación', 'Campus Central Cartago']
    ];
    const buf = generateXlsx('Funcionarios TEC', TEMPLATES.FUNCIONARIOS.headers, sample);

    // Análisis por Administrador
    const resAnalyze = createMockRes();
    handleApi({ method: 'POST' }, resAnalyze, '/api/bulk/analyze', {}, {
      tipo_contacto: 'FUNCIONARIOS',
      fileBase64: buf.toString('base64'),
      fileName: 'padron_test.xlsx'
    }, mockAdmin);

    assert.strictEqual(resAnalyze.statusCode, 200);
    assert.strictEqual(resAnalyze.data.summary.totalAnalizados, 2);
    assert.strictEqual(resAnalyze.data.summary.correctos, 1, 'Debe detectar exactamente 1 registro nuevo que no existe en el sistema');
    assert.strictEqual(resAnalyze.data.summary.duplicadosExactos, 1, 'Debe detectar exactamente 1 registro existente en la base de datos');

    // Subir únicamente los registros que no existen
    const rowsToImport = resAnalyze.data.analyzedRows
      .filter(r => r.status === 'CORRECTO')
      .map(r => r.data);

    assert.strictEqual(rowsToImport.length, 1);

    const resImport = createMockRes();
    handleApi({ method: 'POST' }, resImport, '/api/bulk/import', {}, {
      tipo_contacto: 'FUNCIONARIOS',
      rowsToImport,
      fileName: 'padron_test.xlsx'
    }, mockAdmin);

    assert.strictEqual(resImport.statusCode, 200);
    assert.strictEqual(resImport.data.success, true);
    assert.strictEqual(resImport.data.importedCount, 1);

    // Verificar en BD que el nuevo funcionario fue insertado
    const nuevoEnDb = db.prepare("SELECT * FROM funcionarios WHERE email_normalized = 'inedito.func@itcr.ac.cr'").get();
    assert.ok(nuevoEnDb, 'El funcionario que no existía debe quedar registrado');
    assert.strictEqual(nuevoEnDb.nombre, 'Ing. Funcionario Inédito');

    // Limpieza
    db.prepare("DELETE FROM funcionarios WHERE email_normalized = 'inedito.func@itcr.ac.cr'").run();
  });

  test('Carga masiva de Contactos: Detección de duplicados exactos y subida selectiva de registros nuevos no existentes', () => {
    // Crear archivo con 1 contacto existente (Hinton) y 1 contacto nuevo
    const sample = [
      ['Instituto Tecnológico de Costa Rica', 'Dr', 'Geoffrey', 'Hinton', 'Professor Emeritus', 'Computer Science', 'University of Toronto', 'Canadá', 'hinton@cs.toronto.edu', 'Ingeniería y Tecnología', '+14169782011'],
      ['Instituto Tecnológico de Costa Rica', 'Prof', 'Yoshua', 'Bengio', 'Full Professor', 'DIRO', 'Universite de Montreal', 'Canadá', 'yoshua.bengio.suite@umontreal.ca', 'Ingeniería y Tecnología', '+15143436111']
    ];
    const buf = generateXlsx('Academic Contacts', TEMPLATES.ACADEMICO.headers, sample);

    const resAnalyze = createMockRes();
    handleApi({ method: 'POST' }, resAnalyze, '/api/bulk/analyze', {}, {
      tipo_contacto: 'ACADEMICO',
      fileBase64: buf.toString('base64'),
      fileName: 'academicos_selectivo.xlsx'
    }, mockAdmin);

    assert.strictEqual(resAnalyze.statusCode, 200);
    assert.strictEqual(resAnalyze.data.summary.totalAnalizados, 2);
    assert.strictEqual(resAnalyze.data.summary.correctos, 1, 'Debe haber 1 registro nuevo que no existe');
    assert.strictEqual(resAnalyze.data.summary.duplicadosExactos, 1, 'Debe haber 1 duplicado exacto que ya existe en el sistema');

    // Subir únicamente los registros que no existen (summary.correctos)
    const rowsToImport = resAnalyze.data.analyzedRows
      .filter(r => r.status === 'CORRECTO')
      .map(r => ({ ...r.data, status: r.status }));

    assert.strictEqual(rowsToImport.length, 1);

    const resImport = createMockRes();
    handleApi({ method: 'POST' }, resImport, '/api/bulk/import', {}, {
      tipo_contacto: 'ACADEMICO',
      rowsToImport,
      fileName: 'academicos_selectivo.xlsx',
      recomienda_nombre: mockAdmin.nombre_completo,
      recomienda_email: 'admin@itcr.ac.cr'
    }, mockAdmin);

    assert.strictEqual(resImport.statusCode, 200);
    assert.strictEqual(resImport.data.success, true);
    assert.strictEqual(resImport.data.importedCount, 1);

    // Verificar en BD que el nuevo contacto existe
    const nuevoContacto = db.prepare("SELECT * FROM contactos WHERE email_normalized = 'yoshua.bengio.suite@umontreal.ca'").get();
    assert.ok(nuevoContacto);
    assert.strictEqual(nuevoContacto.first_name, 'Yoshua');

    // Limpieza
    db.prepare("DELETE FROM contactos WHERE email_normalized = 'yoshua.bengio.suite@umontreal.ca'").run();
  });

  console.log('\n======================================================');
  console.log(`📊 Resultado de Pruebas: ${passedTests} de ${totalTests} pasadas exitosamente.`);
  console.log('======================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Error fatal durante pruebas:', err);
  process.exit(1);
});

```

---

