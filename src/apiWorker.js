const { parentPort } = require('node:worker_threads');
const { getDb } = require('./database/db');
const auth = require('./services/authService');

getDb();
parentPort.on('message', task => {
  const headers = {};
  let sent = false;
  const finish = (body = '') => {
    if (sent) return;
    sent = true;
    parentPort.postMessage({ id: task.id, status: res.statusCode, headers, body });
  };
  const res = {
    statusCode: 200,
    get headersSent() { return sent; },
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    getHeader(name) { return headers[name.toLowerCase()]; },
    json(data) { this.setHeader('Content-Type', 'application/json; charset=utf-8'); finish(JSON.stringify(data)); },
    end: finish
  };
  const req = { method: task.method, headers: task.headers, socket: task.socket, query: task.query };
  try {
    if (task.kind === 'reload') {
      for (const modulePath of Object.keys(require.cache)) {
        if (modulePath.startsWith(__dirname) && !modulePath.endsWith('database/db.js') &&
            !modulePath.endsWith('database\\db.js') && !modulePath.endsWith('config.js')) delete require.cache[modulePath];
      }
      return finish();
    }
    if (task.kind === 'document') {
      auth.logout(auth.readCookie(req, auth.COOKIE_NAMES.admin));
      auth.setSessionCookie(req, res, 'admin', '');
      return finish();
    }
    if (task.pathname.startsWith('/api/auth/')) return require('./routes/auth').handleAuth(req, res, task.pathname, task.query, task.body);
    const { authenticate, handleApi } = require('./routes/api');
    authenticate(req, res, () => handleApi(req, res, task.pathname, task.query, task.body, req.user));
  } catch (err) {
    const errorId = require('./services/errorService').recordError(err, task);
    const busy = /SQLITE_BUSY|database is locked/i.test(`${err.code} ${err.message}`);
    console.error('Operación API rechazada:', err.code || err.name);
    if (!sent) {
      if (busy) res.setHeader('Retry-After', '3');
      res.status(busy ? 503 : 500).json({ success: false,
        message: busy ? 'La base está ocupada. Espere unos segundos antes de intentar nuevamente.' : 'Error interno del servidor.', errorId });
    }
  }
});
parentPort.postMessage({ ready: true });
