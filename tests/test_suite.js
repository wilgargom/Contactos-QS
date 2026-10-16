const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');

const appRoot = path.resolve(__dirname, '..', process.env.APP_ROOT || '.');

async function startServer(storage, port = '0', azure = true) {
  const child = spawn(process.execPath, ['-e', `
    const server = require('./server');
    server.once('listening', () => process.send({
      address: server.address(),
      hotReload: require('./src/config').HOT_RELOAD,
      journal: require('./src/database/db').getDb().prepare('PRAGMA journal_mode').get().journal_mode,
      storage: require('./src/config').PATHS.STORAGE
    }));
  `], {
    cwd: appRoot,
    env: { ...process.env, PORT: port, HOST: '127.0.0.1', STORAGE_DIR: storage,
      WEBSITE_SITE_NAME: azure ? 'test-contactos-qs' : '', NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  let logs = '';
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  const ready = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`El servidor no inició: ${logs}`));
    }, 15000);
    child.once('message', info => { clearTimeout(timeout); resolve(info); });
    child.once('error', err => { clearTimeout(timeout); reject(err); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`El servidor terminó con código ${code}: ${logs}`));
    });
  });
  return {
    ...ready,
    async stop() {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill();
        await exited;
      }
    }
  };
}

function request(server, route, method = 'GET', body, token) {
  return new Promise((resolve, reject) => {
    const connection = typeof server.address === 'string'
      ? { socketPath: server.address }
      : { hostname: '127.0.0.1', port: server.address.port };
    const req = http.request({ ...connection, path: route, method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text,
        json: () => JSON.parse(text) }));
    });
    req.setTimeout(5000, () => req.destroy(new Error('Tiempo de respuesta agotado')));
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

test('despliegue limpio: interfaz, autenticación y persistencia tras reiniciar', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-data-'));
  let server;
  t.after(async () => {
    if (server) await server.stop();
    fs.rmSync(storage, { recursive: true, force: true });
  });
  server = await startServer(storage);
  assert.equal(server.hotReload, false);
  assert.equal(server.journal, 'delete');
  assert.equal(server.storage, storage);
  for (const route of ['/', '/index.html']) {
    const res = await request(server, route);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.text, /<html/i);
  }
  for (const route of ['/css/tec-theme.css', '/js/app.js', '/assets/logo-tec.svg']) {
    const res = await request(server, route);
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.headers['content-type'], /text\/html/);
  }
  assert.equal((await request(server, '/api/health')).json().status, 'UP');
  assert.equal((await request(server, '/api/auth/me')).status, 401);
  assert.equal((await request(server, '/api/auth/login', 'POST', {
    email: 'admin@tec.ac.cr', password: 'incorrecta'
  })).status, 401);
  const login = await request(server, '/api/auth/login', 'POST', {
    email: 'admin@tec.ac.cr', password: 'TecQS2026!'
  });
  assert.equal(login.status, 200);
  const { token, user } = login.json();
  assert.equal(user.rol, 'ADMIN');
  assert.equal(user.departamento_id, 'dep-inter');
  assert.ok(fs.existsSync(path.join(storage, 'tec_qs.sqlite')));
  // Los archivos internos nunca se entregan como código o datos.
  for (const route of ['/package.json', '/src/config.js', '/storage/tec_qs.sqlite']) {
    assert.match((await request(server, route)).headers['content-type'], /text\/html/);
  }
  await server.stop();
  server = await startServer(storage);
  const session = await request(server, '/api/auth/me', 'GET', undefined, token);
  assert.equal(session.status, 200);
  assert.equal(session.json().user.id, user.id);
});

test('configuración conserva la named pipe de IISNode sin convertirla a número', t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-config-'));
  t.after(() => fs.rmSync(storage, { recursive: true, force: true }));
  const pipe = `\\\\.\\pipe\\qs-${randomUUID()}`;
  const result = spawnSync(process.execPath, ['-e',
    "process.stdout.write(JSON.stringify(require('./src/config').PORT))"], {
    cwd: appRoot, encoding: 'utf8', env: { ...process.env, PORT: pipe, STORAGE_DIR: storage }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout), pipe);
});

test('servidor HTTP acepta una named pipe real de Windows', {
  skip: process.platform !== 'win32' ? 'Requiere Windows; se ejecuta en el trabajo windows-latest de CI' : false
}, async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-pipe-'));
  const socket = process.platform === 'win32'
    ? `\\\\.\\pipe\\qs-${randomUUID()}`
    : path.join(os.tmpdir(), `qs-${randomUUID()}.sock`);
  let server;
  t.after(async () => {
    if (server) await server.stop();
    fs.rmSync(storage, { recursive: true, force: true });
    if (process.platform !== 'win32') fs.rmSync(socket, { force: true });
  });
  server = await startServer(storage, socket);
  assert.equal(typeof server.address, 'string');
  assert.equal((await request(server, '/api/health')).json().status, 'UP');
  assert.equal((await request(server, '/')).status, 200);
});

test('desarrollo local conserva SQLite WAL', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-local-'));
  let server;
  t.after(async () => {
    if (server) await server.stop();
    fs.rmSync(storage, { recursive: true, force: true });
  });
  server = await startServer(storage, '0', false);
  assert.equal(server.journal, 'wal');
  assert.equal((await request(server, '/api/health')).status, 200);
});
