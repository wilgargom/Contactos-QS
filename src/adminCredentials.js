// Configuración exclusiva del servidor; nunca se entrega al navegador.
// El hash se configura de forma privada en Azure, fuera del repositorio.
module.exports = {
  id: 'usr-admin-qs',
  username: process.env.QS_ADMIN_USERNAME || 'TEC_Contactos_QS',
  passwordHash: process.env.QS_ADMIN_PASSWORD_HASH || ''
};
