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
