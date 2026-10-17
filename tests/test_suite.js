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
    sede_id: 'sede-cartago', departamento_id: 'dep-comp', recomienda_email: 'cbrenes@itcr.ac.cr' };
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

test('ambas cargas exigen correo en padrón y guardan los datos oficiales del reportante', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-reporters-'));
  const server = await startServer(storage);
  t.after(async () => { await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  const guest = await request(server, '/api/auth/guest', 'POST');
  const admin = await request(server, '/api/auth/login', 'POST', { username: testUsername, password: testPassword });
  const contact = { tipo_contacto: 'ACADEMICO', title: 'Prof', first_name: 'Reporte', last_name: 'Verificado',
    email: 'registro@universidad.example', country_name: 'Costa Rica', institution: 'Universidad de Prueba',
    job_title: 'Professor', department_unit: 'Computación', subject_area: 'Computer Science & Information Systems' };
  for (const cookie of [guest.cookies, admin.cookies]) {
    for (const email of [undefined, '', {}, 'otro@gmail.com', 'cbrenes@gmail.com', 'inexistente@itcr.ac.cr']) {
      const body = { ...contact, recomienda_nombre: 'Nombre anterior', recomienda_email: email };
      for (const [route, payload] of [['/api/contacts', body],
          ['/api/bulk/analyze', { tipo_contacto: 'ACADEMICO', recomienda_email: email }],
          ['/api/bulk/import', { tipo_contacto: 'ACADEMICO', recomienda_email: email, rowsToImport: [body] }]]) {
        const denied = await request(server, route, 'POST', payload, cookie);
        assert.equal(denied.status, 422, `${route}: ${denied.text}`);
        assert.equal(denied.json().code, 'REPORTER_NOT_VERIFIED');
      }
    }
  }
  assert.equal((await request(server, '/api/contacts', 'GET', undefined, guest.cookies)).json().count, 0);
  const individual = await request(server, '/api/contacts', 'POST', { ...contact,
    recomienda_email: '  CBRENES@ITCR.AC.CR ', recomienda_nombre: 'Nombre manipulado',
    sede_id: 'sede-sanjose', departamento_id: 'dep-admin' }, guest.cookies);
  assert.equal(individual.status, 201, individual.text);
  assert.equal(individual.json().contact.recomienda_nombre, 'Dr. Carlos Brenes Solano');
  assert.equal(individual.json().contact.recomienda_email, 'cbrenes@itcr.ac.cr');
  assert.equal(individual.json().contact.departamento_id, 'dep-comp');
  const imported = await request(server, '/api/bulk/import', 'POST', {
    tipo_contacto: 'ACADEMICO', recomienda_email: 'psolis@itcr.ac.cr', recomienda_nombre: 'Nombre anterior',
    rowsToImport: [{ ...contact, email: 'masivo@universidad.example', recomienda_nombre: 'Nombre manipulado',
      recomienda_email: 'otro@itcr.ac.cr', sede_id: 'sede-sanjose', departamento_id: 'dep-admin' }]
  }, admin.cookies);
  assert.equal(imported.status, 200, imported.text);
  const list = (await request(server, '/api/contacts', 'GET', undefined, admin.cookies)).json().contacts;
  const row = list.find(c => c.email === 'masivo@universidad.example');
  assert.equal(row.recomienda_nombre, 'Dra. Patricia Solís Gómez');
  assert.equal(row.recomienda_email, 'psolis@itcr.ac.cr');
  assert.equal(row.sede_id, 'sede-cartago');
  assert.equal(row.departamento_id, 'dep-elec');
  // La confirmación vuelve a consultar el padrón, aunque se haya analizado antes.
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(storage, 'tec_qs.sqlite'));
  db.prepare('DELETE FROM funcionarios WHERE email_normalized = ?').run('psolis@itcr.ac.cr');
  db.close();
  const blocked = await request(server, '/api/bulk/import', 'POST', {
    tipo_contacto: 'ACADEMICO', recomienda_email: 'psolis@itcr.ac.cr', rowsToImport: [contact]
  }, admin.cookies);
  assert.equal(blocked.status, 422);
  assert.equal((await request(server, '/api/contacts', 'GET', undefined, admin.cookies)).json().count, list.length);
});

for (const [file, moduleName, inputId, cardPrefix] of [
  ['register.js', 'RegisterModule', 'reg', 'card'], ['bulkUpload.js', 'BulkUploadModule', 'bulk', 'bulk-card']
]) {
  test(`${moduleName}: sección vacía, cambio de correo y respuestas tardías no autorizan cargas`, async () => {
    const vm = require('node:vm');
    const nodes = new Map();
    const element = id => {
      if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', innerHTML: '', disabled: false, style: {},
        classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, focus() {} });
      return nodes.get(id);
    };
    let pendingResolve;
    let pendingReject;
    let posts = 0;
    const api = { get: () => new Promise((resolve, reject) => { pendingResolve = resolve; pendingReject = reject; }),
      post: () => { posts++; throw new Error('No debe guardar sin verificar'); } };
    const timers = new Map(); let timerId = 0;
    const prefs = new Map([['tec_qs_pref_depto', 'dependencia-anterior']]);
    const context = vm.createContext({ console, API: api,
      App: { currentUser: { rol: 'ADMIN', nombre_completo: 'Anterior', email: 'anterior@itcr.ac.cr' }, showToast() {} },
      document: { getElementById: element },
      localStorage: { removeItem: key => prefs.delete(key) },
      setTimeout: cb => { timers.set(++timerId, cb); return timerId; }, clearTimeout: id => timers.delete(id) });
    vm.runInContext(fs.readFileSync(path.join(appRoot, 'public', 'js', file), 'utf8') + `\nglobalThis.moduleUnderTest = ${moduleName};`, context);
    const mod = context.moduleUnderTest;
    mod.init({ sedes: [{ id: 'sede-cartago', nombre: 'Cartago' }],
      departamentos: [{ id: 'dep-comp', nombre: 'Departamento anterior' }] });
    assert.equal(mod.recomiendaEmail, '');
    assert.equal(mod.selectedSedeId, '');
    assert.equal(mod.selectedDeptoId, '');
    assert.equal(element(`${cardPrefix}-display-depto`).textContent, 'Oficina o Departamento');
    assert.equal(element(`${cardPrefix}-display-sede`).textContent, 'Sede del TEC');
    assert.equal(prefs.size, 0);
    assert.equal(mod.isReporterVerified(), false);
    if (inputId === 'bulk') assert.equal(element('bulk-file-select').disabled, true);
    mod.onRecomiendaEmailInput('  CBRENES@ITCR.AC.CR ');
    const first = mod.lookupFuncionario(mod.recomiendaEmail);
    pendingResolve({ exists: true, funcionario: { nombre: 'Carlos', email: 'cbrenes@itcr.ac.cr',
      sede_id: 'sede-cartago', departamento_id: 'dep-comp', sede: 'Cartago', dependencia: 'Computación' } });
    await first;
    assert.equal(mod.isReporterVerified(), true);
    assert.equal(element(`${inputId}-recomienda-email`).value, 'cbrenes');
    mod.onRecomiendaEmailInput('otra');
    assert.equal(mod.isReporterVerified(), false);
    assert.equal(mod.recomiendaNombre, '');
    assert.equal(element(`${cardPrefix}-display-depto`).textContent, 'Oficina o Departamento');
    if (inputId === 'bulk') {
      assert.equal(element('bulk-file-select').disabled, true);
      await mod.confirmImport();
    } else await mod.handleSubmit();
    assert.equal(posts, 0);
    const stale = mod.lookupFuncionario(mod.recomiendaEmail);
    const resolveOld = pendingResolve;
    mod.onRecomiendaEmailInput('nuevo@tec.ac.cr');
    const current = mod.lookupFuncionario(mod.recomiendaEmail);
    pendingResolve({ exists: true, funcionario: { nombre: 'Nuevo', email: 'nuevo@tec.ac.cr',
      sede_id: 'sede-cartago', departamento_id: 'dep-comp', sede: 'Cartago', dependencia: 'Computación' } });
    await current;
    resolveOld({ exists: true, funcionario: { nombre: 'Anterior', email: 'otra@itcr.ac.cr',
      sede_id: 'sede-cartago', departamento_id: 'dep-comp' } });
    await stale;
    assert.equal(mod.recomiendaEmail, 'nuevo@tec.ac.cr');
    assert.equal(mod.recomiendaNombre, 'Nuevo');
    assert.equal(element(`${inputId}-recomienda-domain`).textContent, '@tec.ac.cr');
    mod.onRecomiendaEmailInput('inexistente');
    const unknown = mod.lookupFuncionario(mod.recomiendaEmail);
    pendingResolve({ exists: false });
    await unknown;
    assert.equal(mod.isReporterVerified(), false);
    assert.match(mod.reporterValidationError, /no encontrado/);
    mod.onRecomiendaEmailInput('fallo');
    const failed = mod.lookupFuncionario(mod.recomiendaEmail);
    pendingReject(new Error('Sin conexión'));
    await failed;
    assert.equal(mod.isReporterVerified(), false);
    assert.match(mod.reporterValidationError, /No se logró verificar/);
    mod.onRecomiendaEmailInput('cbrenes@gmail.com');
    assert.equal(mod.recomiendaEmail, 'cbrenes@gmail.com');
    assert.equal(mod.isReporterVerified(), false);
    assert.equal(timers.size, 0);
    mod.onRecomiendaEmailInput('pendiente');
    const beforeClear = mod.lookupFuncionario(mod.recomiendaEmail);
    const resolveAfterClear = pendingResolve;
    mod.limpiarFuncionario();
    resolveAfterClear({ exists: true, funcionario: { nombre: 'Anterior', email: 'pendiente@itcr.ac.cr',
      sede_id: 'sede-cartago', departamento_id: 'dep-comp' } });
    await beforeClear;
    assert.equal(mod.recomiendaEmail, '');
    assert.equal(mod.funcionarioIdentificado, null);
    assert.equal(mod.isReporterVerified(), false);
    if (inputId === 'bulk') {
      context.App.currentUser.rol = 'USUARIO';
      mod.setTipoContacto('CONSOLIDADO');
      assert.equal(mod.tipoContacto, 'ACADEMICO');
      assert.doesNotMatch(element('bulk-upload-view').innerHTML, /value="CONSOLIDADO"/);
      context.App.currentUser.rol = 'ADMIN';
      mod.setTipoContacto('CONSOLIDADO');
      assert.equal(mod.tipoContacto, 'CONSOLIDADO');
      assert.equal(element('bulk-file-select').disabled, false);
      assert.match(element('bulk-upload-view').innerHTML, /Consolidado institucional/);
    }
  });
}

test('consolidado exclusivo del administrador: dos hojas, Escuela Proponente y actualización sin duplicar', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-consolidated-'));
  const server = await startServer(storage);
  t.after(async () => { await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  const guest = await request(server, '/api/auth/guest', 'POST');
  const admin = await request(server, '/api/auth/login', 'POST', { username: testUsername, password: testPassword });
  const { generateMultiSheetXlsx } = require(path.join(appRoot, 'src/services/excelService'));
  const headersE = ['Title', 'First Name', 'Last Name', 'Position', 'Industry', 'Company Name', 'Country or Territory', 'mail', 'Escuela Proponente '];
  const headersA = ['Title', 'First Name', 'Last Name', 'Job Title', 'Department', 'Institution', 'Country', 'mail', 'Subject', 'Escuela Proponente'];
  const old = { title: 'Mr', first_name: 'Original', last_name: 'Conservado', email: 'anterior@company.example',
    position: 'Director', industry: 'Software', company_name: 'Empresa Anterior', country_name: 'Costa Rica' };
  const legacy = await request(server, '/api/bulk/import', 'POST', { tipo_contacto: 'EMPLEADOR',
    recomienda_email: 'cbrenes@itcr.ac.cr', rowsToImport: [old] }, guest.cookies);
  assert.equal(legacy.status, 200, legacy.text);
  const makeFile = () => generateMultiSheetXlsx([
    { name: 'Resumen Académicos 22-25', headers: headersA, rows: [
      ['Prof', 'Academico', 'Prueba', 'Professor', 'Department externo', 'Universidad Externa', 'Costa Rica', 'academico@uni.example', 'Computer Science & Information Systems', 'Escuela Alfa'],
      ['Prof', 'David', 'Patterson', 'Professor', 'Computer Science', 'University of California, Berkeley', 'United States', 'pattrsn@berkeley.edu', 'Computer Science & Information Systems', 'No reemplazar registro individual']
    ] },
    { name: 'Resumen Empleadores 22-25', headers: headersE, rows: [
      ['Mr', 'Nuevo', 'Empleador', 'Director', 'Software', 'Empresa Prueba', 'Costa Rica', 'nuevo@company.example', 'Escuela Alfa'],
      ['', 'Pendiente', 'Revision', '', '', 'Empresa Dos', '', 'pendiente@company.example', 'Escuela Beta'],
      ['Mr', 'Sin', 'Escuela', 'Director', 'Software', 'Empresa Tres', 'Costa Rica', 'sin@company.example', ''],
      ['Mr', 'Otro nombre', 'No sobrescribir', 'Director', 'Software', 'Empresa Anterior', 'Costa Rica', 'anterior@company.example', 'Escuela Gamma'],
      ['Mr', 'Nuevo', 'Empleador', 'Director', 'Software', 'Empresa Prueba', 'Costa Rica', 'nuevo@company.example', 'Escuela Alfa']
    ] }
  ]);
  const body = { fileName: 'consolidado.xlsx', fileBase64: makeFile().toString('base64') };
  for (const endpoint of ['analyze', 'import']) {
    assert.equal((await request(server, `/api/bulk/consolidated/${endpoint}`, 'POST', { ...body, rol: 'ADMIN' }, guest.cookies)).status, 403);
  }
  const preview = await request(server, '/api/bulk/consolidated/analyze', 'POST', body, admin.cookies);
  assert.equal(preview.status, 200, preview.text);
  assert.equal(preview.json().summary.totalAnalizados, 7);
  assert.equal(preview.json().summary.nuevos, 3);
  assert.equal(preview.json().summary.actualizaciones, 1);
  assert.equal(preview.json().summary.pendientesRevision, 1);
  assert.equal(preview.json().summary.conErrores, 1);
  assert.equal(preview.json().summary.duplicadosExactos, 2);
  const before = (await request(server, '/api/contacts', 'GET', undefined, admin.cookies)).json().count;
  const imported = await request(server, '/api/bulk/consolidated/import', 'POST', {
    ...body, rowsToImport: [{ escuela: 'Dato manipulado' }], departamento_id: 'dep-inter'
  }, admin.cookies);
  assert.equal(imported.status, 200, imported.text);
  assert.equal(imported.json().importedCount, 3);
  assert.equal(imported.json().updatedCount, 1);
  const list = (await request(server, '/api/contacts', 'GET', undefined, admin.cookies)).json().contacts;
  assert.equal(list.length, before + 3);
  const consolidated = list.filter(c => c.es_consolidado);
  assert.equal(consolidated.length, 4);
  assert.ok(consolidated.every(c => c.recomienda_nombre === 'Administrador' && c.recomienda_email === ''));
  assert.equal(list.find(c => c.email === 'pendiente@company.example').estado, 'NUEVO');
  assert.equal(list.find(c => c.email === 'academico@uni.example').escuela_proponente, 'Escuela Alfa');
  const previous = list.find(c => c.email === 'anterior@company.example');
  assert.equal(previous.first_name, 'Original');
  assert.equal(previous.escuela_proponente, 'Escuela Gamma');
  const edited = await request(server, `/api/contacts/${previous.id}`, 'PUT', {
    ...previous, recomienda_nombre: 'Otra persona', recomienda_email: 'otra@itcr.ac.cr'
  }, admin.cookies);
  assert.equal(edited.status, 200, edited.text);
  assert.equal(edited.json().contact.recomienda_nombre, 'Administrador');
  assert.equal(edited.json().contact.recomienda_email, '');

  assert.equal(list.find(c => c.email === 'pattrsn@berkeley.edu').es_consolidado, 0);
  const detail = (await request(server, `/api/contacts/${previous.id}`, 'GET', undefined, admin.cookies)).json();
  assert.ok(detail.auditHistory.some(a => a.accion === 'ACTUALIZACION_PROCEDENCIA'));
  const stats = (await request(server, '/api/stats', 'GET', undefined, admin.cookies)).json().stats;
  assert.equal(stats.porDepto.find(d => d.departamento === 'Escuela Alfa').count, 2);
  assert.equal(stats.porDepto.find(d => d.departamento === 'Escuela Beta').count, 1);
  assert.equal(stats.porDepto.find(d => d.departamento === 'Escuela Gamma').count, 1);
  assert.equal(stats.porDepto.reduce((sum, d) => sum + d.count, 0), stats.total);
  const again = await request(server, '/api/bulk/consolidated/import', 'POST', body, admin.cookies);
  assert.equal(again.status, 200, again.text);
  assert.equal(again.json().importedCount, 0);
  assert.equal((await request(server, '/api/contacts', 'GET', undefined, admin.cookies)).json().count, list.length);
  const ambiguous = generateMultiSheetXlsx([{ name: 'Empleadores', headers: headersE, rows: [
    ['Mr', 'Dos', 'Escuelas', 'Director', 'Software', 'Empresa', 'Costa Rica', 'dos@company.example', 'Escuela Uno'],
    ['Mr', 'Dos', 'Escuelas', 'Director', 'Software', 'Empresa', 'Costa Rica', 'dos@company.example', 'Escuela Dos']
  ] }]);
  const rejected = await request(server, '/api/bulk/consolidated/import', 'POST', {
    fileName: 'ambiguo.xlsx', fileBase64: ambiguous.toString('base64')
  }, admin.cookies);
  assert.equal(rejected.status, 400);
  assert.equal((await request(server, '/api/contacts', 'GET', undefined, admin.cookies)).json().count, list.length);
  const moreSchools = generateMultiSheetXlsx([{ name: 'Empleadores', headers: headersE,
    rows: Array.from({ length: 7 }, (_, i) => ['Mr', 'Persona', `Prueba ${i}`, 'Director', 'Software', 'Empresa', 'Costa Rica', `escuela${i}@company.example`, `Unidad ${i}`]) }]);
  assert.equal((await request(server, '/api/bulk/consolidated/import', 'POST', {
    fileName: 'unidades.xlsx', fileBase64: moreSchools.toString('base64')
  }, admin.cookies)).status, 200);
  const allStats = (await request(server, '/api/stats', 'GET', undefined, admin.cookies)).json().stats;
  assert.ok(allStats.porDepto.length > 6);
  assert.equal(allStats.porDepto.reduce((sum, d) => sum + d.count, 0), allStats.total);
});
