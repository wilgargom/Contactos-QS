const authService = require('../services/authService');

// Límite temporal en memoria, sin registrar contraseñas ni cuerpos de solicitudes.
const loginAttempts = new Map();
const WINDOW_MS = 15 * 60000;

function handleAuth(req, res, pathname, query, body) {
  res.setHeader('Cache-Control', 'no-store');
  const method = req.method;

  if (pathname === '/api/auth/login' && method === 'POST') {
    const { username, password } = body;
    if (typeof username !== 'string' || typeof password !== 'string' ||
        !username.trim() || !password || username.length > 200 || password.length > 1024) {
      return res.status(400).json({ success: false, message: 'Ingrese un usuario y una contraseña válidos.' });
    }
    const key = req.socket.remoteAddress || 'local';
    const now = Date.now();
    for (const [address, attempt] of loginAttempts) {
      if (attempt.until <= now) loginAttempts.delete(address);
    }
    const attempt = loginAttempts.get(key) || { count: 0, until: now + WINDOW_MS };
    if (attempt.count >= 10) {
      res.setHeader('Retry-After', String(Math.ceil((attempt.until - now) / 1000)));
      return res.status(429).json({ success: false, message: 'Demasiados intentos. Intente nuevamente más tarde.' });
    }
    const result = authService.login(username, password);
    if (!result.success) {
      attempt.count++;
      loginAttempts.set(key, attempt);
      return res.status(401).json(result);
    }
    loginAttempts.delete(key);
    authService.logout(authService.readCookie(req, authService.COOKIE_NAMES.admin));
    authService.setSessionCookie(req, res, 'admin', result.token);
    return res.json({ success: true, user: result.user, expiresAt: result.expiresAt });
  }

  if (pathname === '/api/auth/guest' && method === 'POST') {
    const token = authService.readCookie(req, authService.COOKIE_NAMES.user);
    const user = authService.getSessionUser(token);
    // Mantener los registros de la sesión de usuario al entrar/salir de administración.
    authService.logout(authService.readCookie(req, authService.COOKIE_NAMES.admin));
    authService.setSessionCookie(req, res, 'admin', '');
    if (user && user.rol === 'USUARIO') return res.json({ success: true, user });
    const result = authService.createUserSession();
    authService.setSessionCookie(req, res, 'user', result.token);
    return res.json({ success: true, user: result.user });
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const user = authService.getSessionUser(authService.getRequestToken(req));
    if (!user) return res.status(401).json({ success: false, message: 'Sesión expirada o inválida.' });
    return res.json({ success: true, user });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    authService.logout(authService.readCookie(req, authService.COOKIE_NAMES.admin));
    authService.setSessionCookie(req, res, 'admin', '');
    return res.json({ success: true, message: 'Sesión administrativa cerrada.' });
  }

  // El contexto del funcionario se gestiona en los formularios, nunca cambia el rol.
  return res.status(404).json({ success: false, message: 'Ruta de autenticación no encontrada.' });
}

module.exports = { handleAuth };
