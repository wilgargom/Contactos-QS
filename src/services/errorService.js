const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const logPath = path.join(config.PATHS.STORAGE, 'technical-errors.jsonl');

function recordError(error, context = {}) {
  const id = crypto.randomUUID();
  const segments = String(context.pathname || '').split('/').slice(1, 3).map(v => v.replace(/[^a-z-]/gi, '').slice(0, 30));
  const location = String(error.stack || '').split('\n').slice(1, 4)
    .map(line => line.match(/(?:src[\\/][\w./\\-]+:\d+:\d+|server\.js:\d+:\d+)/)?.[0]).filter(Boolean);
  const entry = { id, fecha: new Date().toISOString(), codigo: String(error.code || error.name || 'ERROR').slice(0, 80),
    operacion: `${context.method || ''} /${segments.join('/')}`, ubicacion: location };
  try {
    if (fs.existsSync(logPath) && fs.statSync(logPath).size >= 2 * 1024 * 1024) {
      fs.rmSync(`${logPath}.1`, { force: true }); fs.renameSync(logPath, `${logPath}.1`);
    }
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch (_) { console.error('No se logró registrar la incidencia:', id); }
  return id;
}
function listErrors() {
  if (!fs.existsSync(logPath)) return [];
  return fs.readFileSync(logPath, 'utf8').trim().split('\n').slice(-50).reverse().flatMap(line => {
    try { return [JSON.parse(line)]; } catch (_) { return []; }
  });
}
module.exports = { recordError, listErrors };
