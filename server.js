const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const os = require('node:os');
const config = require('./src/config');
const { getDb } = require('./src/database/db');
const { seedDatabase } = require('./src/database/seed');
const { ApiDispatcher } = require('./src/apiDispatcher');

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
const dispatcher = new ApiDispatcher();
let bufferedBytes = 0;

// =========================================================================
// SISTEMA DE RECARGA EN CALIENTE (HOT-RELOAD) PARA MEJORAS CONTINUAS
// Invalida automáticamente la caché en memoria cuando Antigravity modifica
// archivos en src/, permitiendo aplicar mejoras en tiempo real sin reiniciar.
// =========================================================================
const srcDir = path.join(__dirname, 'src');
if (config.HOT_RELOAD) {
  try {
    fs.watch(srcDir, { recursive: true }, (eventType, filename) => {
      if (filename) {
        dispatcher.run({ kind: 'reload' }).catch(err => console.warn('Recarga aplazada:', err.message));
      }
    });
  } catch (err) {
    console.warn('[Hot-Reload] Monitor de archivos no disponible en esta plataforma:', err.message);
  }
}

const server = http.createServer(async (req, res) => {
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
  const taskInfo = { method: req.method, headers: req.headers,
    socket: { remoteAddress: req.socket.remoteAddress, encrypted: Boolean(req.socket.encrypted) } };
  const dispatch = async task => {
    try {
      const result = await dispatcher.run({ ...taskInfo, ...task }, task.bytes || 0);
      if (res.destroyed) return;
      res.statusCode = result.status;
      for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
      if (task.kind !== 'document') res.end(typeof result.body === 'string' ? result.body : Buffer.from(result.body));
      return true;
    } catch (err) {
      if (!res.destroyed) {
        res.setHeader('Retry-After', '3');
        res.status(503).json({ success: false, message: err.message });
      }
      return false;
    }
  };

  // Rutas de API
  if (pathname.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
    if (pathname === '/api/health' && req.method === 'GET') {
      return res.status(dispatcher.ready ? 200 : 503).json({ success: dispatcher.ready, status: dispatcher.ready ? 'UP' : 'STARTING' });
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      // Las cookies de sesión solo se utilizan en solicitudes del mismo sitio.
      const origin = req.headers.origin;
      if (origin) {
        let sameOrigin = false;
        try { sameOrigin = new URL(origin).host === req.headers.host; } catch (_) {}
        if (!sameOrigin) return res.status(403).json({ success: false, message: 'Origen no autorizado.' });
      }
      if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
        return res.status(415).json({ success: false, message: 'Se requiere contenido JSON.' });
      }
    }
    const chunks = [];
    let received = 0;
    let failed = false;
    const release = () => { bufferedBytes -= received; received = 0; chunks.length = 0; };
    const rejectBody = (status, message) => {
      if (failed) return;
      failed = true; release();
      res.setHeader('Connection', 'close');
      res.status(status).json({ success: false, message });
      req.resume();
    };
    if (Number(req.headers['content-length']) > config.MAX_BODY_BYTES) {
      return rejectBody(413, 'La solicitud excede 8 MB. Divida el archivo en cargas menores.');
    }
    req.on('aborted', () => { failed = true; release(); });
    req.on('error', () => { failed = true; release(); });
    req.on('data', chunk => {
      if (failed) return;
      if (received + chunk.length > config.MAX_BODY_BYTES) return rejectBody(413, 'La solicitud excede 8 MB. Divida el archivo en cargas menores.');
      if (bufferedBytes + dispatcher.bytes + chunk.length > config.MAX_BUFFERED_BYTES) return rejectBody(503, 'El servidor está ocupado. Intente nuevamente en unos segundos.');
      received += chunk.length; bufferedBytes += chunk.length;
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (failed) return;
      const bytes = received;
      const bodyData = Buffer.concat(chunks).toString('utf8');
      release();
      let body = {};
      if (bodyData) {
        try {
          body = JSON.parse(bodyData);
        } catch {
          return res.status(400).json({ success: false, message: 'JSON mal formado.' });
        }
      }

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ success: false, message: 'Se requiere un objeto JSON.' });
      }

      dispatch({ pathname, query, body, bytes });
    });

    return;
  }

  // Cada documento nuevo revoca la administración, incluso antes de ejecutar JavaScript.
  const resetAdminForDocument = async () => !req.headers.cookie?.includes('tec_qs_admin=') || dispatch({ kind: 'document' });

  // Servir archivos estáticos del frontend con prevención de caché antigua
  let filePath = path.join(config.PATHS.PUBLIC, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath).toLowerCase();

  // Prevenir Directory Traversal
  if (!filePath.startsWith(config.PATHS.PUBLIC)) {
    res.status(403).end('Acceso denegado');
    return;
  }

  fs.stat(filePath, async (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback a index.html para Single Page Application
      if (!await resetAdminForDocument()) return;
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

    if (ext === '.html' && !await resetAdminForDocument()) return;
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

// Windows/IISNode usa una named pipe; Linux y desarrollo utilizan TCP.
const listenOptions = typeof config.PORT === 'number'
  ? { port: config.PORT, host: config.HOST }
  : { path: config.PORT };

server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.keepAliveTimeout = 5000;
server.maxRequestsPerSocket = 100;
server.on('close', () => dispatcher.close());
process.once('SIGTERM', () => {
  setTimeout(() => process.exit(0), 10000).unref();
  server.close(async () => { await dispatcher.close(); process.exit(0); });
});
dispatcher.started.then(() => server.listen(listenOptions, () => {
  if (config.IS_AZURE) {
    console.log(`Contactos QS iniciado en Azure App Service (${process.version}).`);
    console.log(`Frontend: ${config.PATHS.PUBLIC}`);
    console.log(`Almacenamiento: ${config.PATHS.STORAGE}`);
    console.log(`SQLite: ${config.SQLITE_JOURNAL_MODE}; hot-reload desactivado.`);
    return;
  }
  let nets = {};
  try {
    nets = os.networkInterfaces();
  } catch (err) {
    // La enumeración de interfaces es informativa y no debe impedir el arranque.
    console.warn('No se pudieron consultar las interfaces de red:', err.message);
  }
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
  console.log(`🔒 Modo de Base de Datos: SQLite ${config.SQLITE_JOURNAL_MODE}`);
  console.log(`⚡ Modo Hot-Reload: ${config.HOT_RELOAD ? 'Activo' : 'Desactivado'}`);
  console.log(`📁 Directorio de Staging Drive: ${config.PATHS.DRIVE_STAGING}`);
  console.log(`================================================================`);
}));

module.exports = server;
