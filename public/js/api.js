// Cliente HTTP con sesiones HttpOnly administradas por el servidor.
const API = {
  async request(endpoint, options = {}) {
    const sessionVersion = App.sessionVersion;
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const response = await fetch(endpoint, { ...options, headers, credentials: 'same-origin' });
    if (!endpoint.startsWith('/api/auth/') && sessionVersion !== App.sessionVersion) {
      throw new Error('La sesión cambió. Actualice la consulta.');
    }
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && (contentType.includes('spreadsheetml') || contentType.includes('octet-stream'))) {
      return { isBlob: true, blob: await response.blob(), response };
    }
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 && !endpoint.startsWith('/api/auth/')) {
        await App.restoreUserSession();
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
