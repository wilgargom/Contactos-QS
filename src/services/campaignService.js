const crypto = require('node:crypto');
const { getDb, runTransaction } = require('../database/db');

function listCampaigns() {
  return getDb().prepare('SELECT * FROM campanias ORDER BY activa DESC, created_at DESC').all();
}
function createCampaign(name, user, confirmed) {
  if (user?.rol !== 'ADMIN' || confirmed !== true) throw Object.assign(new Error('Confirme el cambio de campaña como administrador.'), { statusCode: 403 });
  if (typeof name !== 'string' || name.trim().length < 3 || name.length > 100) throw Object.assign(new Error('Indique un nombre de campaña de 3 a 100 caracteres.'), { statusCode: 422 });
  return runTransaction(db => {
    const id = crypto.randomUUID();
    db.prepare('UPDATE campanias SET activa = 0 WHERE activa = 1').run();
    db.prepare('INSERT INTO campanias VALUES (?, ?, 1, ?)').run(id, name.trim(), new Date().toISOString());
    return { success: true, campaign: db.prepare('SELECT * FROM campanias WHERE id = ?').get(id) };
  });
}
module.exports = { listCampaigns, createCampaign };
