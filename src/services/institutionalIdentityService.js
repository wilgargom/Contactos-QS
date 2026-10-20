const { getDb } = require('../database/db');
const { verifyReporter } = require('./funcionarioService');
const config = require('../config');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function configured() {
  return config.IS_AZURE && process.env.QS_MICROSOFT_AUTH === 'azure-easy-auth' && uuid.test(process.env.QS_ENTRA_TENANT_ID || '');
}
function fail(message, statusCode = 403, code = 'INSTITUTIONAL_IDENTITY_REQUIRED') {
  throw Object.assign(new Error(message), { statusCode, code });
}
function resolve(req) {
  if (!configured()) fail('El acceso institucional todavía requiere configuración por la administración.', 503, 'MICROSOFT_NOT_CONFIGURED');
  // Encabezado reservado y validado por Azure App Service Authentication. No aceptar cabeceras de clientes en un despliegue sin Easy Auth.
  const raw = req.headers['x-ms-client-principal'];
  if (typeof raw !== 'string' || raw.length > 24000) fail('Inicie sesión con su cuenta Microsoft institucional.');
  let principal;
  try { principal = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); }
  catch (_) { fail('La identificación institucional es inválida.'); }
  if (principal?.auth_typ !== 'aad' || !Array.isArray(principal.claims) || principal.claims.length > 200) fail('Se requiere la cuenta Microsoft institucional.');
  const claim = names => {
    const values = [...new Set(principal.claims.filter(c => c && names.includes(c.typ)).map(c => c.val))];
    if (values.some(v => typeof v !== 'string') || values.length > 1) fail('Los datos de identidad institucional son ambiguos.');
    return values[0] || '';
  };
  if (claim(['acct']) !== '0') fail('La cuenta debe ser miembro del directorio institucional; no se admiten cuentas invitadas.');
  const tenant = claim(['tid', 'http://schemas.microsoft.com/identity/claims/tenantid']).toLowerCase();
  const objectId = claim(['oid', 'http://schemas.microsoft.com/identity/claims/objectidentifier']).toLowerCase();
  const issuer = claim(['iss']);
  if (tenant !== process.env.QS_ENTRA_TENANT_ID.toLowerCase() || !uuid.test(objectId) ||
      (issuer && !['https://sts.windows.net/'+tenant+'/', 'https://login.microsoftonline.com/'+tenant+'/v2.0'].includes(issuer))) fail('La cuenta no pertenece al directorio institucional autorizado.');
  // Usar el UPN administrado por el tenant, nunca el correo digitado en la solicitud.
  const upn = claim(['preferred_username']) || claim(['upn', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn']);
  if (!/^[a-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@(itcr\.ac\.cr|tec\.ac\.cr)$/i.test(upn)) fail('La cuenta autenticada no tiene un identificador institucional admitido.');
  const funcionario = verifyReporter(upn.trim().toLowerCase());
  if (!funcionario) fail('Su cuenta no corresponde a un funcionario activo del padrón. Solicite la revisión de su ficha.');
  const db = getDb();
  const bound = db.prepare('SELECT * FROM identidades_funcionarios WHERE tenant_id = ? AND object_id = ?').get(tenant, objectId);
  const previous = db.prepare('SELECT * FROM identidades_funcionarios WHERE funcionario_id = ?').get(funcionario.id);
  if ((bound && bound.funcionario_id !== funcionario.id) || (previous && (previous.tenant_id !== tenant || previous.object_id !== objectId))) fail('La identidad de Microsoft ya está vinculada a otra ficha. Solicite revisión administrativa.');
  if (!bound) db.prepare('INSERT INTO identidades_funcionarios (tenant_id, object_id, funcionario_id, created_at) VALUES (?, ?, ?, ?)').run(tenant, objectId, funcionario.id, new Date().toISOString());
  return { funcionario, tenant, objectId };
}
module.exports = { configured, resolve };
