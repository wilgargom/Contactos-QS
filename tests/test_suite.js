const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { randomUUID, randomBytes, scryptSync } = require('node:crypto');
const testUsername = 'admin-integracion';
const testPassword = randomUUID();
const testSalt = randomBytes(16).toString('hex');
const testPasswordHash = `scrypt:${testSalt}:${scryptSync(testPassword, testSalt, 64).toString('hex')}`;

const appRoot = path.resolve(__dirname, '..', process.env.APP_ROOT || '.');

async function startServer(storage, port = '0', azure = true, overrides = {}) {
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
      WEBSITE_SITE_NAME: azure ? 'test-contactos-qs' : '', NODE_ENV: 'production',
      QS_ADMIN_USERNAME: testUsername, QS_ADMIN_PASSWORD_HASH: testPasswordHash, ...overrides },
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

function request(server, route, method = 'GET', body, cookie, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const connection = typeof server.address === 'string'
      ? { socketPath: server.address }
      : { hostname: '127.0.0.1', port: server.address.port };
    const req = http.request({ ...connection, path: route, method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders }
    }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text,
        cookies: (res.headers['set-cookie'] || []).filter(c => !c.includes('Max-Age=0')).map(c => c.split(';')[0]).join('; '),
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
    username: testUsername, password: 'incorrecta'
  })).status, 401);
  const login = await request(server, '/api/auth/login', 'POST', {
    username: testUsername, password: testPassword
  });
  assert.equal(login.status, 200);
  const { user } = login.json();
  const cookie = login.cookies;
  assert.equal(login.json().token, undefined);
  assert.equal(user.rol, 'ADMIN');
  assert.equal(user.departamento_id, null);
  assert.ok(fs.existsSync(path.join(storage, 'tec_qs.sqlite')));
  // Los archivos internos nunca se entregan como código o datos.
  for (const route of ['/package.json', '/src/config.js', '/src/adminCredentials.js', '/storage/tec_qs.sqlite']) {
    assert.match((await request(server, route)).headers['content-type'], /text\/html/);
  }
  await server.stop();
  server = await startServer(storage);
  const session = await request(server, '/api/auth/me', 'GET', undefined, cookie);
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


test('usuario automático, administrador autenticado y cierre con revocación real', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-roles-'));
  const server = await startServer(storage);
  t.after(async () => { await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  const guest = await request(server, '/api/auth/guest', 'POST', { rol: 'ADMIN' });
  assert.equal(guest.status, 200);
  assert.equal(guest.json().user.rol, 'USUARIO');
  assert.equal(guest.json().user.email, '');
  assert.equal(guest.json().user.nombre_completo, '');
  const otherGuest = await request(server, '/api/auth/guest', 'POST');
  assert.notEqual(guest.json().user.id, otherGuest.json().user.id);
  assert.equal((await request(server, '/api/catalogs', 'GET', undefined, guest.cookies)).status, 200);
  for (const route of ['/api/stats', '/api/drive/status', '/api/export/ACADEMICO', '/api/templates/FUNCIONARIOS']) {
    assert.equal((await request(server, route, 'GET', undefined, guest.cookies)).status, 403, route);
  }
  assert.equal((await request(server, '/api/drive/backup', 'POST', {}, guest.cookies)).status, 403);
  assert.equal((await request(server, '/api/auth/switch-context', 'POST', { rol: 'ADMIN' }, guest.cookies)).status, 404);
  assert.equal((await request(server, '/api/bulk/import', 'POST', {
    tipo_contacto: 'FUNCIONARIOS', rowsToImport: [{}]
  }, guest.cookies)).status, 403);
  const data = { tipo_contacto: 'ACADEMICO', title: 'Prof', first_name: 'Persona', last_name: 'Prueba',
    email: 'prueba@universidad.example', country_name: 'Costa Rica', institution: 'Universidad Prueba',
    job_title: 'Professor', department_unit: 'Computación', subject_area: 'Computer Science & Information Systems',
    sede_id: 'sede-cartago', departamento_id: 'dep-comp' };
  const created = await request(server, '/api/contacts', 'POST', data, guest.cookies);
  assert.equal(created.status, 201, created.text);
  const list = (await request(server, '/api/contacts', 'GET', undefined, guest.cookies)).json().contacts;
  assert.equal(list.length, 1);
  const id = list[0].id;
  assert.equal((await request(server, '/api/contacts', 'GET', undefined, otherGuest.cookies)).json().count, 0);
  for (const [method, suffix, body] of [['GET', '', undefined], ['PUT', '', data],
      ['DELETE', '', undefined], ['POST', '/resolve-duplicate', { action: 'DISCARD' }]]) {
    assert.equal((await request(server, `/api/contacts/${id}${suffix}`, method, body, otherGuest.cookies)).status, 403);
  }
  const login = await request(server, '/api/auth/login', 'POST', {
    username: testUsername, password: testPassword
  }, guest.cookies, { 'X-Forwarded-Proto': 'https' });
  assert.equal(login.status, 200);
  const adminCookie = login.cookies;
  for (const flag of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Max-Age=43200']) {
    assert.ok(login.headers['set-cookie'][0].includes(flag), flag);
  }
  assert.equal((await request(server, '/api/stats', 'GET', undefined, adminCookie)).status, 200);
  assert.equal((await request(server, '/api/contacts/cnt-acad-01', 'GET', undefined, adminCookie)).status, 200);
  const both = `${guest.cookies}; ${adminCookie}`;
  assert.equal((await request(server, '/api/auth/logout', 'POST', {}, both)).status, 200);
  assert.equal((await request(server, '/api/stats', 'GET', undefined, adminCookie)).status, 401);
  const resumed = await request(server, '/api/auth/guest', 'POST', {}, guest.cookies);
  assert.equal(resumed.json().user.id, guest.json().user.id);
  assert.equal((await request(server, '/api/contacts', 'GET', undefined, guest.cookies)).json().count, 1);
});

test('solicitudes inválidas, origen externo y fuerza bruta no conceden administración', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-auth-'));
  const server = await startServer(storage);
  t.after(async () => { await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  for (const body of [null, [], { username: {}, password: [] }, { username: testUsername, password: 12 }]) {
    assert.equal((await request(server, '/api/auth/login', 'POST', body)).status, 400);
  }
  const valid = { username: testUsername, password: testPassword };
  assert.equal((await request(server, '/api/auth/login', 'POST', valid, '', { Origin: 'https://otro-sitio.example' })).status, 403);
  assert.equal((await request(server, '/api/auth/login', 'POST', valid, '', { 'Content-Type': 'text/plain' })).status, 415);
  // Las credenciales y los tokens del mecanismo anterior no se admiten.
  assert.equal((await request(server, '/api/auth/login', 'POST', {
    username: 'admin@tec.ac.cr', password: 'credencial-anterior'
  })).status, 401);
  const login = await request(server, '/api/auth/login', 'POST', valid);
  const token = login.cookies.split('=')[1];
  assert.equal((await request(server, '/api/stats', 'GET', undefined, '', { Authorization: `Bearer ${token}` })).status, 401);
  assert.equal((await request(server, `/api/stats?token=${token}`)).status, 401);
  for (let i = 0; i < 10; i++) {
    assert.equal((await request(server, '/api/auth/login', 'POST', { username: testUsername, password: 'incorrecta' })).status, 401);
  }
  const blocked = await request(server, '/api/auth/login', 'POST', valid);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers['retry-after']) > 0);
  assert.equal((await request(server, '/api/health')).status, 200);
});

test('migración conserva contactos, retira sesiones antiguas y respeta vencimiento', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-migration-'));
  let server = await startServer(storage);
  t.after(async () => { await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  const login = await request(server, '/api/auth/login', 'POST', { username: testUsername, password: testPassword });
  await server.stop();
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(storage, 'tec_qs.sqlite'));
  const oldToken = 'b'.repeat(64);
  db.prepare(`INSERT INTO usuarios (id, nombre_completo, email, password_hash, salt, rol, created_at)
    VALUES ('usr-admin-backup', 'Anterior', 'admin@tec.ac.cr', 'hash', 'salt', 'ADMIN', ?)`)
    .run(new Date().toISOString());
  db.prepare('INSERT INTO sesiones VALUES (?, ?, ?, ?)').run(oldToken, 'usr-admin-backup',
    new Date(Date.now() + 3600000).toISOString(), new Date().toISOString());
  db.prepare('UPDATE sesiones SET expires_at = ? WHERE token = ?').run('2000-01-01T00:00:00.000Z', login.cookies.split('=')[1]);
  const before = db.prepare('SELECT COUNT(*) n FROM contactos').get().n;
  db.close();
  server = await startServer(storage);
  assert.equal((await request(server, '/api/auth/me', 'GET', undefined, login.cookies)).status, 401);
  assert.equal((await request(server, '/api/auth/me', 'GET', undefined, `tec_qs_admin=${oldToken}`)).status, 401);
  const current = await request(server, '/api/auth/login', 'POST', { username: testUsername, password: testPassword });
  assert.equal((await request(server, '/api/contacts', 'GET', undefined, current.cookies)).json().count, before);
  const check = new DatabaseSync(path.join(storage, 'tec_qs.sqlite'));
  assert.equal(check.prepare("SELECT activo FROM usuarios WHERE id = 'usr-admin-backup'").get().activo, 0);
  assert.equal(check.prepare('SELECT COUNT(*) n FROM sesiones WHERE token = ?').get(oldToken).n, 0);
  check.close();
});


test('sin configuración privada se conserva Usuario y se bloquea administración', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-unconfigured-'));
  const server = await startServer(storage, '0', true, { QS_ADMIN_PASSWORD_HASH: '' });
  t.after(async () => { await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  assert.equal((await request(server, '/api/auth/guest', 'POST')).json().user.rol, 'USUARIO');
  assert.equal((await request(server, '/api/auth/login', 'POST', {
    username: testUsername, password: testPassword
  })).status, 401);
  assert.equal((await request(server, '/api/health')).status, 200);
});
