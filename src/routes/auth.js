const authService = require('../services/authService');
const { getDb } = require('../database/db');

function handleAuth(req, res, pathname, query, body) {
  const method = req.method;

  if (pathname === '/api/auth/login' && method === 'POST') {
    const { email, password } = body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Correo y contraseña requeridos.' });
    }
    const result = authService.login(email, password);
    if (!result.success) {
      return res.status(401).json(result);
    }
    return res.json(result);
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : query.token;
    const user = authService.getSessionUser(token);
    if (!user) {
      return res.status(401).json({ success: false, message: 'No autenticado o sesión expirada.' });
    }
    return res.json({ success: true, user });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : body.token;
    authService.logout(token);
    return res.json({ success: true, message: 'Sesión cerrada correctamente.' });
  }

  if (pathname === '/api/auth/switch-context' && method === 'POST') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : body.token;
    const user = authService.getSessionUser(token);
    if (!user) {
      return res.status(401).json({ success: false, message: 'No autenticado.' });
    }

    const { sede_id, departamento_id } = body;
    const db = getDb();

    // Actualizar contexto en la base de datos para el usuario
    if (sede_id) {
      db.prepare('UPDATE usuarios SET sede_id = ? WHERE id = ?').run(sede_id, user.id);
    }
    if (departamento_id) {
      db.prepare('UPDATE usuarios SET departamento_id = ? WHERE id = ?').run(departamento_id, user.id);
    }

    const updatedUser = authService.getSessionUser(token);
    return res.json({ success: true, user: updatedUser });
  }

  return res.status(404).json({ success: false, message: 'Ruta de autenticación no encontrada' });
}

module.exports = {
  handleAuth
};
