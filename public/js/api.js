// Cliente HTTP con sesiones HttpOnly administradas por el servidor.
const API = {
  async request(endpoint, options = {}) {
    if (App.suspended && !['/api/auth/guest', '/api/auth/suspend'].includes(endpoint)) {
      throw new Error('Reanude la sesión antes de continuar.');
    }
    const sessionVersion = App.sessionVersion;
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    let response;
    try {
      response = await fetch(endpoint, { ...options, headers, credentials: 'same-origin', signal: controller.signal });
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Se agotó el tiempo de espera. Consulte el directorio antes de repetir un guardado.');
      throw new Error('Se interrumpió la conexión. Revise el resultado antes de repetir un guardado.');
    } finally { clearTimeout(timeout); }
    if (!endpoint.startsWith('/api/auth/') && sessionVersion !== App.sessionVersion) {
      throw new Error('La sesión cambió. Actualice la consulta.');
    }
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && (contentType.includes('spreadsheetml') || contentType.includes('octet-stream'))) {
      return { isBlob: true, blob: await response.blob(), response };
    }
    const data = await response.json();
    if (!endpoint.startsWith('/api/auth/') && sessionVersion !== App.sessionVersion) {
      throw new Error('La sesión cambió. Actualice la consulta.');
    }
    if (!response.ok) {
      if (response.status === 401 && !endpoint.startsWith('/api/auth/')) {
        await App.suspendSession(false);
      }
      const error = new Error(data.message || 'Error en la solicitud');
      error.data = data;
      error.status = response.status;
      throw error;
    }
    return data;
  },
  get(endpoint, params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(qs ? `${endpoint}?${qs}` : endpoint, { method: 'GET' });
  },
  post(endpoint, body = {}) {
    return this.request(endpoint, { method: 'POST', body: JSON.stringify(body) });
  },
  put(endpoint, body) {
    return this.request(endpoint, { method: 'PUT', body: JSON.stringify(body) });
  },
  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
};
