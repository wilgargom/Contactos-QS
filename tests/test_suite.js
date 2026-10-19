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

test('lector XLSX conserva columnas vacías, atributos de filas, texto enriquecido y encabezados posteriores', () => {
  const { generateMultiSheetXlsx, parseXlsx, parseXlsxSheets } = require(path.join(appRoot, 'src/services/excelService'));
  const { readZip, createZip } = require(path.join(appRoot, 'src/utils/zip'));
  const buffer = generateMultiSheetXlsx([{ name: 'Académicos', headers: ['First Name', 'Last Name', 'Email', '', 'Subject', 'Escuela Proponente'],
    rows: [['María Elena', 'Ejemplo', 'maria@example.org', '', 'Matemáticas', 'Escuela de Matemática']] }]);
  const files = readZip(buffer);
  let xml = files.get('xl/worksheets/sheet1.xml').toString();
  xml = xml.replace('<c r="D1" t="inlineStr"><is><t></t></is></c>', '<c r="D1" s="0"/>')
    .replace('<c r="D2" t="inlineStr"><is><t></t></is></c>', '<c r="D2"/>')
    .replace('<row r="2">', '<row customHeight="1" r="2">')
    .replace('<is><t>María Elena</t></is>', '<is><r><t>Mar&#237;a</t></r><r><t> Elena</t></r></is>');
  files.set('xl/worksheets/sheet1.xml', Buffer.from(xml));
  const fixed = parseXlsx(createZip([...files].map(([name, data]) => ({ name, data }))));
  assert.equal(fixed.headers[3], ''); assert.equal(fixed.headers[4], 'Subject');
  assert.equal(fixed.rows[0]['First Name'], 'María Elena');
  assert.equal(fixed.rows[0].Subject, 'Matemáticas');
  assert.equal(fixed.rows[0]['Escuela Proponente'], 'Escuela de Matemática');
  const prefixed = generateMultiSheetXlsx([{ name: 'Académicos', headers: [], rows: [['Reporte institucional'],
    ['Nombre', 'Apellidos', 'Correo', 'Escuela Proponente'], ['Ana', 'Ejemplo', 'ana@example.org', 'Unidad A']] }]);
  const parsed = parseXlsxSheets(prefixed, { headerMatch: cells => cells.includes('Correo') })[0];
  assert.equal(parsed.headerRowNum, 2); assert.equal(parsed.rows[0]._rowNum, 3);
  assert.equal(parsed.rows[0].Nombre, 'Ana');
});

test('consolidado revalida identidad, errores críticos, pendientes optativos y cambios posteriores al análisis', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-consolidated-validation-'));
  const server = await startServer(storage);
  t.after(async () => { await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  const admin = await request(server, '/api/auth/login', 'POST', { username: testUsername, password: testPassword });
  const { generateMultiSheetXlsx } = require(path.join(appRoot, 'src/services/excelService'));
  const { readZip, createZip } = require(path.join(appRoot, 'src/utils/zip'));
  const headers = ['Tratamiento', 'Nombres', 'Apellidos', 'Cargo', 'Industria', 'Empresa', 'País', 'Correo', 'Escuela Proponente', 'Año de reporte', 'Autorización de contacto'];
  const row = (name, email, school = 'Escuela Uno') => ['Mr', name, 'Prueba', 'Director', 'Software', `Empresa ${name}`, 'Costa Rica', email, school, '2024', 'si'];
  const valid = row('Completo', 'completo@example.org');
  const pending = row('Pendiente', 'pendiente@example.org'); pending[0] = '';
  const negative = row('Negativa', 'negativa@example.org'); negative[10] = 'no';
  const rows = [valid, pending, row('Inválido', 'correo-mal'), row('Interno', 'interno@itcr.ac.cr'),
    row('SinEscuela', 'escuela@example.org', ''), valid, row('Conflicto', 'conflicto@example.org'),
    row('Conflicto', 'conflicto@example.org', 'Escuela Dos'), row('MismaPersona', 'uno@example.org'),
    row('MismaPersona', 'otro@example.org'), negative, row('Fórmula', 'formula@example.org')];
  const files = readZip(generateMultiSheetXlsx([{ name: 'Resumen Empleadores 22-25', headers, rows },
    { name: 'Instrucciones', headers: ['Notas'], rows: [['No importar']] }]));
  files.set('xl/worksheets/sheet1.xml', Buffer.from(files.get('xl/worksheets/sheet1.xml').toString()
    .replace('<c r="D13" t="inlineStr"><is><t>Director</t></is></c>', '<c r="D13" t="str"><f>"Director"</f><v>Director</v></c>')));
  const body = { fileName: 'historico.xlsx', fileBase64: createZip([...files].map(([name, data]) => ({ name, data }))).toString('base64') };
  const analyze = () => request(server, '/api/bulk/consolidated/analyze', 'POST', body, admin.cookies);
  const preview = (await analyze()).json();
  assert.equal(preview.summary.totalAnalizados, 12);
  assert.equal(preview.summary.nuevosCompletos, 1);
  assert.equal(preview.summary.pendientesRevision, 1);
  assert.equal(preview.summary.conErrores, 7);
  assert.equal(preview.summary.posiblesDuplicados, 2);
  assert.equal(preview.summary.duplicadosExactos, 1);
  assert.equal(preview.sheets[1].ignored, true);
  assert.ok(preview.analyzedRows.find(r => r.rowNum === 13).errors.some(e => /fórmula/.test(e)));
  assert.ok(preview.analyzedRows.find(r => r.data.email === 'interno@itcr.ac.cr').errors.some(e => /institucional/.test(e)));
  const before = (await request(server, '/api/contacts', 'GET', undefined, admin.cookies)).json().count;
  const committed = await request(server, '/api/bulk/consolidated/import', 'POST', { ...body, analysisHash: preview.analysisHash }, admin.cookies);
  assert.equal(committed.status, 200, committed.text); assert.equal(committed.json().importedCount, 1);
  const stale = await request(server, '/api/bulk/consolidated/import', 'POST', { ...body, analysisHash: preview.analysisHash, includePending: true }, admin.cookies);
  assert.equal(stale.status, 409);
  const current = (await analyze()).json();
  const withPending = await request(server, '/api/bulk/consolidated/import', 'POST', { ...body, analysisHash: current.analysisHash, includePending: true }, admin.cookies);
  assert.equal(withPending.status, 200, withPending.text); assert.equal(withPending.json().importedCount, 1);
  const all = (await request(server, '/api/contacts', 'GET', undefined, admin.cookies)).json();
  assert.equal(all.count, before + 2);
  const person = all.contacts.find(c => c.email === 'pendiente@example.org');
  assert.equal(person.estado, 'NUEVO'); assert.equal(person.recomienda_nombre, 'Administrador');
  const detail = (await request(server, `/api/contacts/${person.id}`, 'GET', undefined, admin.cookies)).json();
  assert.ok(detail.auditHistory.some(a => String(a.detalles).includes('2024')));
  const otherEmail = generateMultiSheetXlsx([{ name: 'Empleadores', headers, rows: [row('Completo', 'diferente@example.org')] }]);
  const other = await request(server, '/api/bulk/consolidated/analyze', 'POST', { fileName: 'identidad.xlsx', fileBase64: otherEmail.toString('base64') }, admin.cookies);
  assert.equal(other.json().analyzedRows[0].status, 'POSIBLE_DUPLICADO');
  const ambiguous = generateMultiSheetXlsx([{ name: 'Empleadores', headers: [...headers, 'Email'], rows: [[...valid, 'otro@example.org']] }]);
  const rejected = await request(server, '/api/bulk/consolidated/analyze', 'POST', { fileName: 'columnas.xlsx', fileBase64: ambiguous.toString('base64') }, admin.cookies);
  assert.equal(rejected.status, 400); assert.match(rejected.json().message, /ambiguas/);
});

test('vista consolidada muestra contadores cero, filtros, paginación, escape y confirmación optativa de pendientes', async () => {
  const vm = require('node:vm'); const calls = []; let allow = false;
  const base = { status: 'CORRECTO', sheet: 'Empleadores', rowNum: 2, escuela: 'Escuela Uno', data: { first_name: 'Nombre', last_name: 'Prueba', email: 'persona@example.org', tipo_contacto: 'EMPLEADOR' }, errors: [], warnings: [] };
  const analysis = { summary: { totalAnalizados: 56, correctos: 56, nuevosCompletos: 55, nuevos: 56, pendientesRevision: 1, actualizaciones: 0, conErrores: 0, posiblesDuplicados: 0, duplicadosExactos: 0 },
    analysisHash: 'a'.repeat(64), analyzedRows: [...Array.from({ length: 55 }, (_, i) => ({ ...base, rowNum: i + 2 })), { ...base, status: 'PENDIENTE_REVISION', rowNum: 57, errors: ['Falta título'], escuela: '<img src=x onerror=alert(1)>' }], sheets: [] };
  const context = vm.createContext({ console, window: { confirm: () => allow }, document: { getElementById: () => ({ disabled: false }) }, App: { currentUser: { rol: 'ADMIN' }, showToast() {}, navigate() {} },
    API: { post: async (route, body) => { calls.push({ route, body }); return { success: true }; }, get: async () => ({}) } });
  vm.runInContext(fs.readFileSync(path.join(appRoot, 'public/js/bulkUpload.js'), 'utf8') + '\nglobalThis.bulk=BulkUploadModule', context);
  const bulk = context.bulk; bulk.analysisResult = analysis; bulk.fileBase64 = 'base64'; bulk.selectedFile = { name: 'archivo.xlsx' }; bulk.tipoContacto = 'CONSOLIDADO';
  bulk.render = () => {};
  assert.equal(bulk.escapeReporterText(0), '0');
  let html = bulk.renderConsolidatedAnalysisView();
  assert.match(html, /Error crítico \(0\)/); assert.match(html, /Confirmar carga \(55\)/);
  assert.equal((html.match(/persona@example.org/g) || []).length, 50);
  bulk.filterConsolidated('status', 'PENDIENTE_REVISION'); html = bulk.renderConsolidatedAnalysisView();
  assert.match(html, /Falta título/); assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img src=x/);
  await bulk.confirmConsolidatedImport(); assert.equal(calls.length, 0);
  allow = true; bulk.includeConsolidatedPending = true;
  await bulk.confirmConsolidatedImport(); assert.equal(calls.length, 1);
  assert.equal(calls[0].body.includePending, true); assert.equal(calls[0].body.analysisHash, analysis.analysisHash);
});

test('lotes QS: generación sin cambios, descarga íntegra, confirmación explícita e idempotente y versiones', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-batches-'));
  const server = await startServer(storage);
  let db;
  t.after(async () => { if (db) db.close(); await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  const admin = await request(server, '/api/auth/login', 'POST', { username: testUsername, password: testPassword });
  const guest = await request(server, '/api/auth/guest', 'POST');
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(path.join(storage, 'tec_qs.sqlite'));
  const snapshot = () => JSON.stringify(db.prepare('SELECT id,estado,version FROM contactos ORDER BY id').all());
  const original = snapshot();
  const prepare = () => request(server, '/api/export/prepare', 'POST', { tipo: 'ACADEMICO', filters: {} }, admin.cookies);
  assert.equal((await request(server, '/api/export/prepare', 'POST', { tipo: 'ACADEMICO', filters: {} }, guest.cookies)).status, 403);
  const prepared = await prepare();
  assert.equal(prepared.status, 200, prepared.text);
  const batch = prepared.json().batch;
  assert.equal(batch.estado, 'GENERADO');
  assert.equal(snapshot(), original);
  assert.equal((await request(server, `/api/export/lotes/${batch.id}/confirm`, 'POST', { confirmed: true }, admin.cookies)).status, 409);
  const downloaded = await request(server, batch.downloadUrl, 'GET', undefined, admin.cookies);
  assert.equal(downloaded.status, 200);
  const stored = db.prepare('SELECT * FROM exportaciones WHERE id=?').get(batch.id);
  assert.equal(require('node:crypto').createHash('sha256').update(downloaded.buffer).digest('hex'), stored.sha256);
  assert.equal(snapshot(), original);
  assert.equal((await request(server, batch.downloadUrl, 'GET', undefined, guest.cookies)).status, 403);
  await request(server, `/api/export/lotes/${batch.id}/received`, 'POST', {}, admin.cookies);
  assert.equal((await request(server, `/api/export/lotes/${batch.id}/confirm`, 'POST', {}, admin.cookies)).status, 400);
  const confirmed = await request(server, `/api/export/lotes/${batch.id}/confirm`, 'POST', { confirmed: true }, admin.cookies);
  assert.equal(confirmed.status, 200, confirmed.text);
  assert.equal(confirmed.json().batch.estado, 'CONFIRMADO_QS');
  assert.equal(db.prepare("SELECT estado FROM contactos WHERE id='cnt-acad-01'").get().estado, 'EXPORTADO');
  const auditCount = () => db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion='EXPORTACION'").get().n;
  const audits = auditCount(); assert.ok(audits > 0);
  await request(server, `/api/export/lotes/${batch.id}/confirm`, 'POST', { confirmed: true }, admin.cookies);
  assert.equal(auditCount(), audits);
  const stale = (await prepare()).json().batch;
  await request(server, `/api/export/lotes/${stale.id}/received`, 'POST', {}, admin.cookies);
  db.prepare("UPDATE contactos SET phone='99990000' WHERE id='cnt-acad-01'").run();
  assert.equal((await request(server, `/api/export/lotes/${stale.id}/confirm`, 'POST', { confirmed: true }, admin.cookies)).status, 409);
  assert.equal(auditCount(), audits);
  const corrupt = (await prepare()).json().batch;
  const file = db.prepare('SELECT archivo FROM exportaciones WHERE id=?').get(corrupt.id).archivo;
  fs.appendFileSync(path.join(storage, 'exports', file), 'alterado');
  assert.equal((await request(server, corrupt.downloadUrl, 'GET', undefined, admin.cookies)).status, 409);
});

test('respaldo descargable, recuperación aislada y limpieza manual protegen datos y archivos recientes', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-storage-'));
  const server = await startServer(storage);
  t.after(async () => { await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  const admin = await request(server, '/api/auth/login', 'POST', { username: testUsername, password: testPassword });
  const guest = await request(server, '/api/auth/guest', 'POST');
  const created = await request(server, '/api/drive/backup', 'POST', {}, admin.cookies);
  assert.equal(created.status, 200, created.text);
  const name = created.json().backupFileName;
  const route = '/api/admin/backups/download?name=' + encodeURIComponent(name);
  assert.equal((await request(server, route, 'GET', undefined, guest.cookies)).status, 403);
  assert.equal((await request(server, '/api/admin/backups/download?name=..%2Ftec_qs.sqlite', 'GET', undefined, admin.cookies)).status, 400);
  const response = await request(server, route, 'GET', undefined, admin.cookies);
  assert.equal(response.status, 200);
  assert.deepEqual(response.buffer, fs.readFileSync(created.json().backupPath));
  const output = path.join(storage, 'restored.sqlite');
  const result = spawnSync(process.execPath, [path.join(appRoot, 'scripts/prepare-restore.js'), created.json().backupPath, output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const { DatabaseSync } = require('node:sqlite');
  const restored = new DatabaseSync(output, { readOnly: true });
  assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM sesiones').get().n, 0);
  assert.ok(restored.prepare('SELECT COUNT(*) AS n FROM contactos').get().n > 0);
  restored.close();
  assert.notEqual(spawnSync(process.execPath, [path.join(appRoot, 'scripts/prepare-restore.js'), created.json().backupPath, output]).status, 0);
  const bad = path.join(storage, 'invalid.sqlite'); fs.writeFileSync(bad, 'invalid');
  assert.notEqual(spawnSync(process.execPath, [path.join(appRoot, 'scripts/prepare-restore.js'), bad, path.join(storage, 'absent.sqlite')]).status, 0);
  assert.equal(fs.existsSync(path.join(storage, 'absent.sqlite')), false);
  for (let i = 0; i < 4; i++) {
    const file = path.join(storage, 'backups', `tec_qs_backup_old${i}.sqlite`);
    fs.writeFileSync(file, response.buffer);
    const when = new Date(Date.now() - (40 + i) * 86400000); fs.utimesSync(file, when, when);
  }
  const old = path.join(storage, 'uploads', 'obsolete.xlsx'); fs.writeFileSync(old, 'old');
  const when = new Date(Date.now() - 40 * 86400000); fs.utimesSync(old, when, when);
  const protectedFile = path.join(storage, 'exports', 'lote_protected.xlsx'); fs.writeFileSync(protectedFile, 'official'); fs.utimesSync(protectedFile, when, when);
  const overview = () => request(server, '/api/admin/overview', 'GET', undefined, admin.cookies);
  const info = (await overview()).json().storage;
  assert.equal(info.backups.length, 5);
  assert.equal(info.cleanupCandidates.filter(f => f.category === 'RESPALDOS').length, 2);
  assert.equal(info.cleanupCandidates.some(f => f.name === 'lote_protected.xlsx'), false);
  const target = info.cleanupCandidates.find(f => f.name === 'obsolete.xlsx');
  assert.ok(target);
  assert.equal((await request(server, '/api/admin/storage/delete', 'POST', { id: target.id }, admin.cookies)).status, 400);
  assert.equal(fs.existsSync(old), true);
  assert.equal((await request(server, '/api/admin/storage/delete', 'POST', { id: target.id, confirmed: true }, guest.cookies)).status, 403);
  fs.appendFileSync(old, 'changed');
  assert.equal((await request(server, '/api/admin/storage/delete', 'POST', { id: target.id, confirmed: true }, admin.cookies)).status, 409);
  fs.utimesSync(old, when, when);
  const current = (await overview()).json().storage.cleanupCandidates.find(f => f.name === 'obsolete.xlsx');
  assert.equal((await request(server, '/api/admin/storage/delete', 'POST', { id: current.id, confirmed: true }, admin.cookies)).status, 200);
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(created.json().backupPath), true);
});

test('campañas preservan registros anteriores, filtros pendientes, incidencias sin secretos y recursos con versión', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-campaigns-'));
  let server = await startServer(storage);
  t.after(async () => { await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  let admin = await request(server, '/api/auth/login', 'POST', { username: testUsername, password: testPassword });
  const guest = await request(server, '/api/auth/guest', 'POST');
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(storage, 'tec_qs.sqlite'));
  db.exec("UPDATE contactos SET campania_id=NULL WHERE id='cnt-acad-01'; UPDATE contactos SET estado='NUEVO' WHERE id='cnt-emp-01'");
  db.close();
  assert.equal((await request(server, '/api/admin/campaigns', 'POST', { name: 'Recolección nueva', confirmed: true }, guest.cookies)).status, 403);
  const campaign = (await request(server, '/api/admin/campaigns', 'POST', { name: 'Recolección nueva', confirmed: true }, admin.cookies)).json().campaign;
  assert.ok(campaign.id);
  const unassigned = (await request(server, '/api/contacts?campania_id=SIN_ASIGNAR', 'GET', undefined, admin.cookies)).json();
  assert.equal(unassigned.count, 1);
  const pending = (await request(server, '/api/contacts?pendientes=true', 'GET', undefined, admin.cookies)).json();
  assert.equal(pending.count, 1);
  assert.equal(pending.contacts[0].id, 'cnt-emp-01');
  assert.equal((await request(server, '/api/contacts?campania_id=' + campaign.id, 'GET', undefined, admin.cookies)).json().count, 0);
  const writer = new DatabaseSync(path.join(storage, 'tec_qs.sqlite'));
  writer.exec(`INSERT INTO contactos (id,tipo_contacto,title,first_name,last_name,email,email_normalized,country_name,estado,metodo_ingreso,created_by,created_at)
    VALUES ('new-campaign-contact','ACADEMICO','Dr','Nuevo','Contacto','new@example.org','new@example.org','Costa Rica','NUEVO','INDIVIDUAL','test',datetime('now'))`);
  assert.equal(writer.prepare("SELECT campania_id FROM contactos WHERE id='new-campaign-contact'").get().campania_id, campaign.id);
  writer.close();
  assert.equal((await request(server, '/api/contacts?campania_id=' + campaign.id, 'GET', undefined, admin.cookies)).json().count, 1);
  const html = await request(server, '/');
  assert.match(html.headers['cache-control'], /no-store/);
  assert.doesNotMatch(html.text, /cdn\.tailwindcss\.com/);
  const cssUrl = html.text.match(/href="(\/css\/tailwind\.css\?v=[a-f0-9]+)"/)[1];
  const css = await request(server, cssUrl);
  assert.match(css.headers['cache-control'], /immutable/);
  assert.match(css.text, /002855|0 40 85/);
  assert.equal((await request(server, cssUrl, 'GET', undefined, undefined, { 'If-None-Match': css.headers.etag })).status, 304);
  const secret = 'test-secret-must-not-appear@example.org';
  const error = spawnSync(process.execPath, ['-e', "require('./src/services/errorService').recordError(new Error(process.env.TEST_SECRET), {method:'POST',pathname:'/api/export/prepare'})"],
    { cwd: appRoot, env: { ...process.env, STORAGE_DIR: storage, TEST_SECRET: secret }, encoding: 'utf8' });
  assert.equal(error.status, 0, error.stderr);
  assert.doesNotMatch(fs.readFileSync(path.join(storage, 'technical-errors.jsonl'), 'utf8'), new RegExp(secret));
  const overview = await request(server, '/api/admin/overview', 'GET', undefined, admin.cookies);
  assert.equal(overview.json().errors.length, 1);
  assert.equal((await request(server, '/api/admin/overview', 'GET', undefined, guest.cookies)).status, 403);
  await server.stop();
  server = await startServer(storage);
  admin = await request(server, '/api/auth/login', 'POST', { username: testUsername, password: testPassword });
  assert.equal((await request(server, '/api/contacts?campania_id=SIN_ASIGNAR', 'GET', undefined, admin.cookies)).json().count, 1);
});

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
      WEBSITE_SITE_NAME: azure ? 'test-contactos-qs' : '',
      QS_ADMIN_USERNAME: testUsername, QS_ADMIN_PASSWORD_HASH: testPasswordHash,
      NODE_ENV: 'test', QS_SEED_DEMO: '1', ...overrides },
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
    // Cada solicitud de prueba usa su conexión: la preparación síncrona de datos
    // puede superar el keep-alive en Windows y dejar un socket cerrado en el agente.
    const req = http.request({ ...connection, path: route, method, agent: false,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders }
    }, res => {
      const chunks = [];
      res.on('data', chunk => { chunks.push(chunk); });
      res.on('end', () => { const buffer = Buffer.concat(chunks); const text = buffer.toString('utf8'); resolve({ status: res.statusCode, headers: res.headers, text, buffer,
        cookies: (res.headers['set-cookie'] || []).filter(c => !c.includes('Max-Age=0')).map(c => c.split(';')[0]).join('; '),
        json: () => JSON.parse(text) }); });
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
  db.prepare('INSERT INTO sesiones (token, usuario_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(oldToken, 'usr-admin-backup',
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
    rowsToImport: [{ ...contact, first_name: 'Esteban', last_name: 'Mora', institution: 'Otra Universidad', email: 'masivo@universidad.example', recomienda_nombre: 'Nombre manipulado',
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
    ...body, includePending: true, rowsToImport: [{ escuela: 'Dato manipulado' }], departamento_id: 'dep-inter'
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

test('eliminación múltiple: solo administrador, confirmación, auditoría y transacción completa', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-delete-many-'));
  const server = await startServer(storage);
  let db;
  t.after(async () => { if (db) db.close(); await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  const guest = await request(server, '/api/auth/guest', 'POST');
  const admin = await request(server, '/api/auth/login', 'POST', { username: testUsername, password: testPassword });
  const endpoint = '/api/contacts/bulk-delete';
  const ids = ['cnt-acad-01', 'cnt-emp-01'];
  assert.equal((await request(server, endpoint, 'POST', { ids, confirmed: true })).status, 401);
  assert.equal((await request(server, endpoint, 'POST', { ids, confirmed: true }, guest.cookies)).status, 403);
  for (const body of [{ ids }, { ids, confirmed: false }, { ids: [], confirmed: true },
      { ids: 'cnt-acad-01', confirmed: true }, { ids: [null], confirmed: true }]) {
    assert.equal((await request(server, endpoint, 'POST', body, admin.cookies)).status, 400);
  }
  const missing = await request(server, endpoint, 'POST', { ids: [ids[0], 'ya-no-existe'], confirmed: true }, admin.cookies);
  assert.equal(missing.status, 409);
  assert.equal((await request(server, '/api/contacts', 'GET', undefined, admin.cookies)).json().count, 2);
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(path.join(storage, 'tec_qs.sqlite'));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM auditoria').get().n, 0);
  // Un fallo en el segundo contacto debe revertir también el primero y su auditoría.
  db.exec(`CREATE TRIGGER fail_selected_delete BEFORE DELETE ON contactos
    WHEN OLD.id = 'cnt-emp-01' BEGIN SELECT RAISE(ABORT, 'Fallo de prueba'); END;`);
  const failed = await request(server, endpoint, 'POST', { ids, confirmed: true }, admin.cookies);
  assert.equal(failed.status, 500);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM contactos').get().n, 2);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM auditoria').get().n, 0);
  db.exec('DROP TRIGGER fail_selected_delete');
  const deleted = await request(server, endpoint, 'POST', { ids: [...ids, ids[0]], confirmed: true }, admin.cookies);
  assert.equal(deleted.status, 200, deleted.text);
  assert.equal(deleted.json().deletedCount, 2);
  assert.equal((await request(server, '/api/contacts', 'GET', undefined, admin.cookies)).json().count, 0);
  const audit = db.prepare("SELECT * FROM auditoria WHERE accion = 'ELIMINACION'").all();
  assert.equal(audit.length, 2);
  assert.ok(audit.every(a => a.usuario_nombre === 'Administrador'));
  const details = audit.map(a => JSON.parse(a.detalles));
  assert.ok(details.every(d => d.metodo === 'ELIMINACION_MULTIPLE' && d.cantidad_seleccionada === 2));
  assert.equal(new Set(details.map(d => d.lote_eliminacion)).size, 1);
  assert.deepEqual(details.map(d => d.contacto_eliminado.id).sort(), [...ids].sort());
  assert.equal((await request(server, endpoint, 'POST', { ids, confirmed: true }, admin.cookies)).status, 409);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM auditoria').get().n, 2);
});

test('directorio: selección visible, contador, cancelar y confirmar una sola solicitud', async () => {
  const vm = require('node:vm');
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', innerHTML: '', disabled: false,
      checked: false, indeterminate: false, addEventListener() {} });
    return nodes.get(id);
  };
  const rows = [{ id: 'a', first_name: '<img>', last_name: 'Prueba', tipo_contacto: 'ACADEMICO' },
    { id: 'b', first_name: 'Segunda', last_name: 'Persona', tipo_contacto: 'EMPLEADOR' }];
  let results = rows;
  const checkboxes = rows.map(c => ({ value: c.id, checked: false, disabled: false }));
  const requests = [];
  let resolveDelete;
  const context = vm.createContext({ console, URLSearchParams, setTimeout, clearTimeout,
    App: { currentUser: { rol: 'ADMIN' }, showToast() {} },
    document: { getElementById: node, querySelectorAll: () => checkboxes },
    API: { get: async () => ({ contacts: results }), post: (url, body) => {
      requests.push({ url, body });
      return new Promise(resolve => { resolveDelete = resolve; });
    } } });
  vm.runInContext(fs.readFileSync(path.join(appRoot, 'public', 'js', 'directory.js'), 'utf8') +
    '\nglobalThis.dir = DirectoryModule;', context);
  const dir = context.dir;
  dir.catalogs = {};
  dir.render();
  await dir.loadContacts();
  assert.match(node('directory-view').innerHTML, /Eliminar seleccionados/);
  assert.match(node('dir-table-area').innerHTML, /Seleccionar todos los contactos visibles/);
  assert.equal(node('dir-delete-selected').disabled, true);
  dir.toggleContactSelection('a', true);
  dir.toggleContactSelection('a', true);
  dir.toggleContactSelection('fuera-de-la-lista', true);
  assert.equal(node('dir-selected-count').textContent, '1 contacto seleccionado');
  assert.equal(node('dir-select-all').indeterminate, true);
  dir.toggleAllSelection(true);
  assert.equal(dir.selectedIds.size, 2);
  assert.equal(node('dir-select-all').checked, true);
  dir.confirmDeleteSelected();
  assert.match(node('dir-modal-container').innerHTML, /2 contactos/);
  assert.match(node('dir-modal-container').innerHTML, /&lt;img&gt;/);
  assert.doesNotMatch(node('dir-modal-container').innerHTML, /<img>/);
  assert.equal(requests.length, 0);
  dir.closeModal();
  await dir.deleteSelectedContacts();
  assert.equal(requests.length, 0);
  assert.equal(dir.selectedIds.size, 2);
  results = [rows[1]];
  await dir.loadContacts();
  assert.equal(dir.selectedIds.size, 0);
  assert.equal(node('dir-selected-count').textContent, '0 contactos seleccionados');
  dir.toggleAllSelection(true);
  assert.deepEqual([...dir.selectedIds], ['b']);
  dir.confirmDeleteSelected();
  const deletion = dir.deleteSelectedContacts();
  await dir.deleteSelectedContacts();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/contacts/bulk-delete');
  assert.deepEqual([...requests[0].body.ids], ['b']);
  assert.equal(requests[0].body.confirmed, true);
  assert.equal(node('dir-bulk-delete-confirm').disabled, true);
  dir.closeModal();
  assert.ok(dir.pendingDeleteIds);
  results = [];
  resolveDelete({ success: true, deletedCount: 1 });
  await deletion;
  assert.equal(dir.pendingDeleteIds, null);
  assert.equal(dir.selectedIds.size, 0);
  context.App.currentUser.rol = 'USUARIO';
  dir.render();
  dir.contacts = rows;
  dir.renderTable();
  dir.toggleAllSelection(true);
  dir.confirmDeleteSelected();
  await dir.deleteSelectedContacts();
  assert.equal(requests.length, 1);
  assert.equal(dir.selectedIds.size, 0);
  assert.doesNotMatch(node('directory-view').innerHTML, /Eliminar seleccionados/);
  assert.doesNotMatch(node('dir-table-area').innerHTML, /data-contact-select/);
});

test('recargar el documento revoca administración en servidor y conserva la sesión de usuario', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-reload-'));
  const server = await startServer(storage);
  t.after(async () => { await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  const guest = await request(server, '/api/auth/guest', 'POST');
  for (const route of ['/', '/index.html', '/ruta-spa']) {
    const admin = await request(server, '/api/auth/login', 'POST', { username: testUsername, password: testPassword });
    const both = `${guest.cookies}; ${admin.cookies}`;
    assert.equal((await request(server, '/api/stats', 'GET', undefined, both)).status, 200);
    // Los recursos JS no cierran la sesión; el documento sí.
    await request(server, '/js/app.js', 'GET', undefined, both);
    assert.equal((await request(server, '/api/stats', 'GET', undefined, both)).status, 200);
    const page = await request(server, route, 'GET', undefined, both);
    assert.equal(page.status, 200);
    assert.ok(page.headers['set-cookie'].some(c => c.startsWith('tec_qs_admin=;') && c.includes('Max-Age=0')));
    assert.equal((await request(server, '/api/stats', 'GET', undefined, admin.cookies)).status, 401);
    const resumed = await request(server, '/api/auth/guest', 'POST', {}, guest.cookies);
    assert.equal(resumed.json().user.id, guest.json().user.id);
  }
});

test('permisos: rechaza rutas alternativas y evita modificar o revelar contactos ajenos y el padrón', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-permissions-'));
  const server = await startServer(storage);
  t.after(async () => { await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  const guest = await request(server, '/api/auth/guest', 'POST');
  const admin = await request(server, '/api/auth/login', 'POST', { username: testUsername, password: testPassword });
  for (const route of ['/api/other/cnt-acad-01/resolve-duplicate', '/api/contacts/cnt-acad-01/resolve-duplicate/extra']) {
    assert.equal((await request(server, route, 'POST', { action: 'DISCARD' }, guest.cookies)).status, 404);
  }
  assert.equal((await request(server, '/api/contacts/cnt-acad-01/resolve-duplicate', 'POST', { action: 'DISCARD' }, guest.cookies)).status, 403);
  const before = (await request(server, '/api/funcionarios/by-email?email=cbrenes@itcr.ac.cr', 'GET', undefined, guest.cookies)).json().funcionario;
  const edited = await request(server, '/api/funcionarios', 'POST', { ...before, nombre: 'Nombre alterado' }, guest.cookies);
  assert.equal(edited.status, 403);
  const after = (await request(server, '/api/funcionarios/by-email?email=cbrenes@itcr.ac.cr', 'GET', undefined, guest.cookies)).json().funcionario;
  assert.deepEqual(after, before);
  const lookup = (await request(server, '/api/contacts/check-email?email=pattrsn@berkeley.edu', 'GET', undefined, guest.cookies)).json();
  assert.equal(lookup.exists, true);
  assert.equal(lookup.contact, null);
  const detail = (await request(server, '/api/contacts/cnt-acad-01', 'GET', undefined, admin.cookies)).json().contact;
  assert.equal(detail.estado, 'VALIDADO');
  const duplicate = await request(server, '/api/contacts', 'POST', { ...detail, recomienda_email: before.email }, guest.cookies);
  assert.equal(duplicate.status, 409);
  assert.doesNotMatch(duplicate.text, /David|Patterson|berkeley|pattrsn/);
});

test('edición conserva disciplina e industria y rechaza versiones antiguas o ausentes', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-edit-'));
  const server = await startServer(storage);
  t.after(async () => { await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  const admin = await request(server, '/api/auth/login', 'POST', { username: testUsername, password: testPassword });
  for (const [id, field] of [['cnt-acad-01', 'subject_area'], ['cnt-emp-01', 'industry']]) {
    const original = (await request(server, `/api/contacts/${id}`, 'GET', undefined, admin.cookies)).json().contact;
    const edited = await request(server, `/api/contacts/${id}`, 'PUT', { version: original.version, phone: '+506 22223333' }, admin.cookies);
    assert.equal(edited.status, 200, edited.text);
    assert.equal(edited.json().contact[field], original[field]);
    assert.equal(edited.json().contact.version, original.version + 1);
    assert.equal((await request(server, `/api/contacts/${id}`, 'PUT', { version: original.version, phone: '+506 99998888' }, admin.cookies)).status, 409);
    assert.equal((await request(server, `/api/contacts/${id}`, 'PUT', { phone: '+506 99998888' }, admin.cookies)).status, 428);
    const fresh = (await request(server, `/api/contacts/${id}`, 'GET', undefined, admin.cookies)).json();
    assert.equal(fresh.contact.phone, '+506 22223333');
    assert.equal(fresh.auditHistory.filter(a => a.accion === 'MODIFICACION').length, 1);
    const invalid = await request(server, `/api/contacts/${id}`, 'PUT', { version: fresh.contact.version, [field]: '' }, admin.cookies);
    assert.equal(invalid.status, 400);
    assert.ok(invalid.json().validationErrors[field === 'subject_area' ? 'subject' : 'industry']);
  }
});

test('importación revalida, revierte el lote inválido, detecta repetidos y audita cada contacto', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-import-'));
  const server = await startServer(storage);
  t.after(async () => { await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  const guest = await request(server, '/api/auth/guest', 'POST');
  const admin = await request(server, '/api/auth/login', 'POST', { username: testUsername, password: testPassword });
  const row = { tipo_contacto: 'EMPLEADOR', title: 'Mr', first_name: 'Andrea', last_name: 'Guzman', email: 'andrea@empresa.example',
    country_name: 'Costa Rica', position: 'Gerente', industry: 'Servicios', company_name: 'Empresa distinta' };
  const load = rowsToImport => request(server, '/api/bulk/import', 'POST', {
    tipo_contacto: 'EMPLEADOR', recomienda_email: 'cbrenes@itcr.ac.cr', rowsToImport
  }, guest.cookies);
  assert.equal((await load([{ ...row, email: 'correo-invalido', status: 'CORRECTO' }])).status, 422);
  // La primera fila se inserta, pero la segunda provoca rollback del contacto, lote y auditoría.
  assert.equal((await load([row, { ...row, email: 'correo-invalido' }])).status, 422);
  assert.equal((await load([row, row])).status, 409);
  assert.equal((await load([row, { ...row, email: 'otro@empresa.example' }])).status, 409);
  assert.equal((await load([null])).status, 422);
  assert.equal((await load([{ ...row, industry: {} }])).status, 422);
  assert.equal((await request(server, '/api/contacts', 'GET', undefined, guest.cookies)).json().count, 0);
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(storage, 'tec_qs.sqlite'));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lotes_carga').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM auditoria').get().n, 0);
  db.close();
  const success = await load([row]);
  assert.equal(success.status, 200, success.text);
  assert.equal(success.json().importedCount, 1);
  assert.equal((await load([row])).status, 409); // Otro análisis previo tampoco evita la detección al confirmar.
  const contact = (await request(server, '/api/contacts', 'GET', undefined, guest.cookies)).json().contacts[0];
  assert.equal(contact.estado, 'VALIDADO');
  assert.equal(contact.departamento_id, 'dep-comp');
  const audit = (await request(server, `/api/contacts/${contact.id}`, 'GET', undefined, admin.cookies)).json().auditHistory;
  assert.equal(audit.length, 1);
  assert.equal(JSON.parse(audit[0].detalles).metodo, 'CARGA_MASIVA');
});

test('paginación acota cada respuesta y la exportación conserva todos los resultados filtrados', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-pages-'));
  const server = await startServer(storage);
  t.after(async () => { await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  const admin = await request(server, '/api/auth/login', 'POST', { username: testUsername, password: testPassword });
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(storage, 'tec_qs.sqlite'));
  db.exec('BEGIN');
  for (let i = 0; i < 125; i++) db.prepare(`INSERT INTO contactos (id,tipo_contacto,title,first_name,last_name,email,email_normalized,country_name,estado,metodo_ingreso,created_by,created_at)
    VALUES (?, 'EMPLEADOR', 'Mr', 'Prueba', 'Pagina', ?, ?, 'Costa Rica', 'NUEVO', 'INDIVIDUAL', 'test', ?)`)
    .run(`page-${i}`, `page${i}@example.com`, `page${i}@example.com`, new Date().toISOString());
  db.exec('COMMIT');
  db.close();
  const first = (await request(server, '/api/contacts?page_size=50', 'GET', undefined, admin.cookies)).json();
  const second = (await request(server, '/api/contacts?page=2&page_size=50', 'GET', undefined, admin.cookies)).json();
  assert.equal(first.count, 127);
  assert.equal(first.contacts.length, 50);
  assert.equal(second.contacts.length, 50);
  assert.equal(first.pages, 3);
  assert.ok(first.contacts.every(c => !second.contacts.some(d => c.id === d.id)));
  const bounded = (await request(server, '/api/contacts?page_size=999999', 'GET', undefined, admin.cookies)).json();
  assert.equal(bounded.contacts.length, 100);
  const negative = (await request(server, '/api/contacts?page=-3&page_size=-1', 'GET', undefined, admin.cookies)).json();
  assert.equal(negative.page, 1);
  assert.equal(negative.pageSize, 1);
  // El servicio usado por exportación no limita los resultados aunque se envíe page_size.
  const result = await request(server, '/api/contacts/export-directory?page_size=1', 'GET', undefined, admin.cookies);
  assert.equal(result.status, 200);
  assert.match(result.headers['content-type'], /spreadsheetml/);
});

test('respaldo SQLite recupera transacciones WAL confirmadas y Drive informa almacenamiento local', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-backup-'));
  const server = await startServer(storage, '0', false);
  t.after(async () => { await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  const admin = await request(server, '/api/auth/login', 'POST', { username: testUsername, password: testPassword });
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(storage, 'tec_qs.sqlite'));
  db.exec('PRAGMA wal_autocheckpoint=0');
  db.prepare("UPDATE contactos SET phone = '88889999' WHERE id = 'cnt-acad-01'").run();
  assert.ok(fs.statSync(path.join(storage, 'tec_qs.sqlite-wal')).size > 0);
  const backup = await request(server, '/api/drive/backup', 'POST', {}, admin.cookies);
  assert.equal(backup.status, 200, backup.text);
  assert.equal(backup.json().verified, true);
  const copy = new DatabaseSync(backup.json().backupPath, { readOnly: true });
  try {
    assert.equal(copy.prepare("SELECT phone FROM contactos WHERE id='cnt-acad-01'").get().phone, '88889999');
    assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { copy.close(); db.close(); }
  const drive = (await request(server, '/api/drive/status', 'GET', undefined, admin.cookies)).json().drive;
  assert.equal(drive.isDriveApiConnected, false);
  assert.equal(drive.mode, 'LOCAL_STAGING');
});

test('arranque institucional no agrega ejemplos, aun con bandera de demostración', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-production-'));
  let server = await startServer(storage, '0', true, { NODE_ENV: 'production', QS_SEED_DEMO: '1' });
  t.after(async () => { await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  const admin = await request(server, '/api/auth/login', 'POST', { username: testUsername, password: testPassword });
  assert.equal((await request(server, '/api/contacts', 'GET', undefined, admin.cookies)).json().count, 0);
  assert.equal((await request(server, '/api/funcionarios', 'GET', undefined, admin.cookies)).json().funcionarios.length, 0);
  assert.ok((await request(server, '/api/catalogs', 'GET', undefined, admin.cookies)).json().sedes.length > 0);
  await server.stop();
  server = await startServer(storage, '0', true, { NODE_ENV: 'production', QS_SEED_DEMO: '0' });
  assert.equal((await request(server, '/api/contacts', 'GET', undefined, admin.cookies)).json().count, 0);
});

test('vistas de directorio escapan HTML almacenado, preservan catálogos externos y envían la versión', async () => {
  const vm = require('node:vm');
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', innerHTML: '', textContent: '', disabled: false, after() {}, addEventListener() {} });
    return nodes.get(id);
  };
  const attack = '<img src=x onerror="alert(1)">';
  const contact = { id: 'contact-safe', version: 7, title: 'Tratamiento propio', first_name: 'Ana', last_name: "O'Connor", email: 'ana@example.com',
    tipo_contacto: 'ACADEMICO', institution: attack, job_title: attack, subject_area: attack, country_name: 'País propio',
    recomienda_nombre: attack, recomienda_email: 'ana@itcr.ac.cr', departamento_nombre: attack, estado: 'VALIDADO' };
  let sent;
  const context = vm.createContext({ console, URLSearchParams, setTimeout, clearTimeout,
    App: { currentUser: { rol: 'ADMIN' }, showToast() {} },
    document: { getElementById: node, querySelectorAll: () => [], createElement: () => ({ dataset: {} }) },
    API: { get: async () => ({ contact, auditHistory: [{ detalles: attack, usuario_nombre: attack }] }),
      put: async (url, data) => { sent = { url, data }; return { success: true }; } } });
  vm.runInContext(fs.readFileSync(path.join(appRoot, 'public/js/directory.js'), 'utf8') + '\nglobalThis.dir = DirectoryModule;', context);
  const dir = context.dir;
  dir.catalogs = { paises: ['Costa Rica'], titulos: ['Dr'] };
  dir.contacts = [contact];
  dir.renderTable();
  assert.doesNotMatch(node('dir-table-area').innerHTML, /<img/);
  assert.match(node('dir-table-area').innerHTML, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(node('dir-table-area').innerHTML, /O%27Connor/);
  await dir.viewDetails(contact.id);
  assert.doesNotMatch(node('dir-modal-container').innerHTML, /<img/);
  await dir.editContact(contact.id);
  const edit = node('dir-modal-container').innerHTML;
  assert.doesNotMatch(edit, /<img/);
  assert.match(edit, /value="Tratamiento propio" selected/);
  assert.match(edit, /value="País propio" selected/);
  assert.match(edit, /id="edit-subject_area"/);
  for (const [key, value] of Object.entries(contact)) node(`edit-${key}`).value = value;
  dir.loadContacts = () => {};
  await dir.saveEdit(contact.id);
  assert.equal(sent.data.version, 7);
  assert.equal(sent.data.subject_area, attack);
  dir.confirmDelete(contact.id, encodeURIComponent(attack));
  assert.doesNotMatch(node('dir-modal-container').innerHTML, /<img/);
});

test('borrador conserva datos del contacto durante la sesión y exige identificar nuevamente al reportante', () => {
  const vm = require('node:vm');
  const nodes = new Map(); const saved = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', innerHTML: '', disabled: false,
      style: {}, classList: { add() {}, remove() {}, toggle() {} }, querySelectorAll: () => [], addEventListener() {} });
    return nodes.get(id);
  };
  const fields = ['first_name', 'email', 'subject_area'].map(key => { const input = node(`field-${key}`); input.id = `field-${key}`; return input; });
  node('contact-form').querySelectorAll = () => fields;
  const context = vm.createContext({ console, setTimeout, clearTimeout,
    sessionStorage: { setItem: (key, value) => saved.set(key, value), getItem: key => saved.get(key), removeItem: key => saved.delete(key) },
    localStorage: { removeItem() {} }, document: { getElementById: node },
    window: { confirm: () => false }, App: { currentUser: { id: 'guest-draft', rol: 'USUARIO' }, showToast() {} } });
  vm.runInContext(fs.readFileSync(path.join(appRoot, 'public/js/register.js'), 'utf8') + '\nglobalThis.mod = RegisterModule;', context);
  const mod = context.mod;
  mod.currentType = 'ACADEMICO';
  fields[0].value = 'Nombre sin guardar'; fields[1].value = 'draft@example.com'; fields[2].value = 'Disciplina propia';
  mod.recomiendaNombre = 'Persona anterior'; mod.recomiendaEmail = 'persona@itcr.ac.cr';
  mod.captureDraft();
  const stored = [...saved.values()][0];
  assert.doesNotMatch(stored, /persona@itcr|Persona anterior|recomienda/);
  fields.forEach(input => { input.value = ''; });
  mod.render = () => mod.restoreDraft();
  mod.init({});
  assert.equal(fields[0].value, 'Nombre sin guardar');
  assert.equal(fields[2].value, 'Disciplina propia');
  assert.equal(mod.recomiendaEmail, '');
  assert.equal(mod.funcionarioIdentificado, null);
  assert.equal(mod.isReporterVerified(), false);
  mod.selectType('EMPLEADOR'); // Cancelar el cambio conserva el borrador.
  assert.equal(mod.currentType, 'ACADEMICO');
  mod.clearDraft();
  assert.equal(saved.size, 0);
});

test('confirmaciones simultáneas importan una sola vez y el padrón inválido se revierte completo', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-concurrent-'));
  const server = await startServer(storage);
  t.after(async () => { await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  const guest = await request(server, '/api/auth/guest', 'POST');
  const other = await request(server, '/api/auth/guest', 'POST');
  const admin = await request(server, '/api/auth/login', 'POST', { username: testUsername, password: testPassword });
  const payload = { tipo_contacto: 'EMPLEADOR', recomienda_email: 'cbrenes@itcr.ac.cr', rowsToImport: [{
    title: 'Mr', first_name: 'Concurrencia', last_name: 'Prueba', email: 'concurrente@empresa.example',
    position: 'Gerente', industry: 'Servicios', company_name: 'Empresa concurrente', country_name: 'Costa Rica' }] };
  const results = await Promise.all([guest, other].map(user => request(server, '/api/bulk/import', 'POST', payload, user.cookies)));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await request(server, '/api/contacts?q=concurrente', 'GET', undefined, admin.cookies)).json().count, 1);
  const official = { nombre: 'Funcionario Prueba', email: 'prueba@itcr.ac.cr', dependencia: 'Escuela de Ingeniería en Computación', sede: 'Campus Central Cartago' };
  const invalid = await request(server, '/api/bulk/import', 'POST', { tipo_contacto: 'FUNCIONARIOS', rowsToImport: [official, { ...official, email: 'correo-invalido' }] }, admin.cookies);
  assert.equal(invalid.status, 422);
  assert.equal((await request(server, '/api/funcionarios/by-email?email=prueba@itcr.ac.cr', 'GET', undefined, admin.cookies)).json().exists, false);
  assert.equal((await request(server, '/api/funcionarios', 'POST', official, admin.cookies)).status, 200);
  assert.equal((await request(server, '/api/funcionarios/by-email?email=prueba@itcr.ac.cr', 'GET', undefined, admin.cookies)).json().exists, true);
});

test('evidencia local no informa sincronización por la sola presencia de credenciales y acota la ruta', () => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-drive-local-'));
  try {
    const result = spawnSync(process.execPath, ['-e', `
      const drive = require('./src/services/driveService');
      drive.isDriveConfigured = true;
      drive.saveDocumentArchive('../../evidencia.xlsx', Buffer.from('evidencia')).then(result => {
        process.stdout.write(JSON.stringify({ result, drive: drive.getStatus() }));
      });
    `], { cwd: appRoot, env: { ...process.env, STORAGE_DIR: storage }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.equal(data.result.status, 'STAGED_LOCAL_PENDING_DRIVE_SYNC');
    assert.equal(data.drive.credentialsPresent, true);
    assert.equal(data.drive.isDriveApiConnected, false);
    assert.equal(path.dirname(data.result.localPath), path.join(storage, 'drive_staging'));
    assert.equal(fs.readFileSync(data.result.localPath, 'utf8'), 'evidencia');
  } finally { fs.rmSync(storage, { recursive: true, force: true }); }
});

test('inactividad se verifica en servidor, las consultas no renuevan y reanudar conserva al usuario', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-idle-'));
  const server = await startServer(storage, '0', true, { QS_SESSION_IDLE_MINUTES: '1' });
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(storage, 'tec_qs.sqlite'));
  t.after(async () => { db.close(); await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  const guest = await request(server, '/api/auth/guest', 'POST');
  const guestToken = guest.cookies.split('=')[1];
  assert.equal(guest.json().user.idle_timeout_ms, 60000);
  const old = new Date(Date.now() - 40000).toISOString();
  db.prepare('UPDATE sesiones SET last_activity_at = ? WHERE token = ?').run(old, guestToken);
  assert.equal((await request(server, '/api/auth/me', 'GET', undefined, guest.cookies)).status, 200);
  assert.equal(db.prepare('SELECT last_activity_at FROM sesiones WHERE token = ?').get(guestToken).last_activity_at, old);
  assert.equal((await request(server, '/api/auth/activity', 'POST', {}, guest.cookies)).status, 200);
  assert.ok(db.prepare('SELECT last_activity_at FROM sesiones WHERE token = ?').get(guestToken).last_activity_at > old);
  const expired = new Date(Date.now() - 90000).toISOString();
  db.prepare('UPDATE sesiones SET last_activity_at = ? WHERE token = ?').run(expired, guestToken);
  assert.equal((await request(server, '/api/auth/me', 'GET', undefined, guest.cookies)).status, 401);
  assert.equal((await request(server, '/api/contacts', 'GET', undefined, guest.cookies)).status, 401);
  assert.equal((await request(server, '/api/auth/activity', 'POST', {}, guest.cookies)).status, 401);
  const resumed = await request(server, '/api/auth/guest', 'POST', {}, guest.cookies);
  assert.equal(resumed.json().user.id, guest.json().user.id);
  const admin = await request(server, '/api/auth/login', 'POST', { username: testUsername, password: testPassword });
  const adminToken = admin.cookies.split('=')[1];
  db.prepare('UPDATE sesiones SET last_activity_at = ? WHERE token = ?').run(expired, adminToken);
  assert.equal((await request(server, '/api/stats', 'GET', undefined, admin.cookies)).status, 401);
  assert.equal(db.prepare('SELECT token FROM sesiones WHERE token = ?').get(adminToken), undefined);
  const loginAgain = await request(server, '/api/auth/login', 'POST', { username: testUsername, password: testPassword });
  const both = `${guest.cookies}; ${loginAgain.cookies}`;
  assert.equal((await request(server, '/api/auth/suspend', 'POST', {}, both)).status, 200);
  assert.equal((await request(server, '/api/stats', 'GET', undefined, loginAgain.cookies)).status, 401);
  assert.equal((await request(server, '/api/contacts', 'GET', undefined, guest.cookies)).status, 401);
});

test('veinte usuarios simultáneos guardan contactos independientes con auditoría y sin perder datos', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-users-'));
  const server = await startServer(storage);
  t.after(async () => { await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  const guests = await Promise.all(Array.from({ length: 20 }, () => request(server, '/api/auth/guest', 'POST')));
  assert.ok(guests.every(r => r.status === 200));
  assert.equal(new Set(guests.map(r => r.json().user.id)).size, 20);
  const saved = await Promise.all(guests.map((g, i) => request(server, '/api/contacts', 'POST', {
    tipo_contacto: 'EMPLEADOR', title: 'Mr', first_name: `Nombre${i}`, last_name: `Apellido${i}`,
    email: `simultaneo${i}@empresa.example`, position: 'Director', company_name: `Empresa${i}`,
    industry: 'Servicios', country_name: 'Costa Rica', recomienda_email: 'cbrenes@itcr.ac.cr', allow_duplicate_override: true
  }, g.cookies)));
  assert.ok(saved.every(r => r.status === 201), saved.map(r => r.text).join('\n'));
  const lists = await Promise.all(guests.map(g => request(server, '/api/contacts', 'GET', undefined, g.cookies)));
  for (let i = 0; i < lists.length; i++) {
    assert.equal(lists[i].json().count, 1);
    const contact = lists[i].json().contacts[0];
    assert.equal(contact.email, `simultaneo${i}@empresa.example`);
    const detail = (await request(server, `/api/contacts/${contact.id}`, 'GET', undefined, guests[i].cookies)).json();
    assert.equal(detail.auditHistory.length, 1);
  }
});

test('base ocupada no bloquea HTTP y la cola llena responde 503 sin ejecutar solicitudes adicionales', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-backpressure-'));
  const server = await startServer(storage, '0', true, { QS_MAX_API_QUEUE: '2' });
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(storage, 'tec_qs.sqlite'));
  t.after(async () => {
    try { db.exec('ROLLBACK'); } catch (_) {}
    db.close(); await server.stop(); fs.rmSync(storage, { recursive: true, force: true });
  });
  const guest = await request(server, '/api/auth/guest', 'POST');
  db.exec('BEGIN EXCLUSIVE');
  const active = request(server, '/api/contacts', 'GET', undefined, guest.cookies);
  await new Promise(resolve => setTimeout(resolve, 100));
  const queued = Array.from({ length: 4 }, () => request(server, '/api/contacts', 'GET', undefined, guest.cookies));
  await new Promise(resolve => setTimeout(resolve, 100));
  const started = Date.now();
  const health = await request(server, '/api/health');
  assert.equal(health.status, 200);
  assert.ok(Date.now() - started < 1500, 'HTTP debe responder mientras SQLite espera el bloqueo');
  db.exec('COMMIT');
  assert.equal((await active).status, 200);
  const results = await Promise.all(queued);
  assert.equal(results.filter(r => r.status === 503).length, 2);
  assert.ok(results.filter(r => r.status === 503).every(r => r.headers['retry-after'] === '3'));
  assert.equal(results.filter(r => r.status === 200).length, 2);
});

test('limita cargas por filas, bytes y expansión de Excel antes de guardar', async t => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-limits-'));
  const server = await startServer(storage, '0', true, { QS_MAX_IMPORT_ROWS: '2' });
  t.after(async () => { await server.stop(); fs.rmSync(storage, { recursive: true, force: true }); });
  const guest = await request(server, '/api/auth/guest', 'POST');
  const excessive = await request(server, '/api/bulk/import', 'POST', {
    tipo_contacto: 'EMPLEADOR', recomienda_email: 'cbrenes@itcr.ac.cr', rowsToImport: [{}, {}, {}]
  }, guest.cookies);
  assert.equal(excessive.status, 400);
  const oversized = await request(server, '/api/contacts', 'POST', {}, guest.cookies, { 'Content-Length': String(9 * 1024 * 1024) });
  assert.equal(oversized.status, 413);
  const { createZip, readZip } = require(path.join(appRoot, 'src/utils/zip'));
  const compressed = createZip([{ name: 'xl/worksheets/sheet1.xml', data: Buffer.alloc(25 * 1024 * 1024, 65) }]);
  assert.throws(() => readZip(compressed), /24 MB/);
  assert.equal((await request(server, '/api/health')).status, 200);
});

test('sesión inactiva deja de consultar y reanuda solo por acción explícita, coordinando pestañas', async () => {
  const vm = require('node:vm');
  let now = 1000000;
  const saved = new Map(); const timers = new Map(); const nodes = new Map(); const events = {};
  let timerId = 0; let captured = 0;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { id, textContent: '', innerHTML: '', style: {}, hidden: false,
      classList: { add() {}, remove() {} }, replaceChildren() {}, close() {}, reset() {}, focus() {},
      addEventListener(name, cb) { events[`${id}:${name}`] = cb; }, remove() { nodes.delete(id); } });
    return nodes.get(id);
  };
  const calls = [];
  const context = vm.createContext({ console, Date: class extends Date { static now() { return now; } },
    setTimeout: (cb, ms) => { timers.set(++timerId, { cb, ms }); return timerId; }, clearTimeout: id => timers.delete(id),
    localStorage: { setItem: (k, v) => saved.set(k, v), getItem: k => saved.get(k), removeItem: k => saved.delete(k) },
    window: { addEventListener: (event, cb) => { events[event] = cb; } },
    document: { getElementById: node, addEventListener: (event, cb) => { events[event] = cb; },
      createElement: () => node('session-suspended'), body: { appendChild() {} } },
    RegisterModule: { captureDraft() { captured++; }, resetReporter() {} },
    BulkUploadModule: { resetReporter() {} }, DirectoryModule: { selectedIds: new Set() }, AdminModule: {}, ExportModule: {},
    API: { post: async endpoint => { calls.push(endpoint); return { user: { id: 'same-guest', rol: 'USUARIO', idle_timeout_ms: 60000 } }; } }
  });
  vm.runInContext(fs.readFileSync(path.join(appRoot, 'public/js/app.js'), 'utf8') + '\nglobalThis.app = App;', context);
  const app = context.app;
  app.currentUser = { id: 'admin', rol: 'ADMIN', idle_timeout_ms: 60000 }; app.catalogs = {};
  app.navigate = () => {};
  app.startSessionMonitor();
  assert.equal(calls.length, 0); // No hay consultas periódicas al servidor.
  now += 60001;
  saved.set(app.activityKey, String(now - 10000)); // Otra pestaña sí estuvo activa.
  app.scheduleIdleCheck();
  assert.equal(app.suspended, false);
  now += 60001;
  app.scheduleIdleCheck();
  await Promise.resolve();
  assert.equal(app.suspended, true);
  assert.equal(app.currentUser, null);
  assert.equal(captured, 1);
  assert.deepEqual(calls, ['/api/auth/suspend']);
  events.focus(); app.noteActivity();
  assert.equal(calls.length, 1);
  await app.resumeSession();
  assert.equal(app.suspended, false);
  assert.equal(app.currentUser.rol, 'USUARIO');
  assert.deepEqual(calls, ['/api/auth/suspend', '/api/auth/guest']);
});
