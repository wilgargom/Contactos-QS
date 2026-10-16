// Cliente API HTTP para el Sistema de Contactos QS
const API = {
  token: localStorage.getItem('tec_qs_token') || '',

  setToken(t) {
    this.token = t;
    if (t) localStorage.setItem('tec_qs_token', t);
    else localStorage.removeItem('tec_qs_token');
  },

  async request(endpoint, options = {}) {
    const headers = options.headers || {};
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(endpoint, {
        ...options,
        headers
      });

      // Si es descarga binaria
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('spreadsheetml') || contentType.includes('octet-stream')) {
        if (!response.ok) throw new Error('Error al generar la descarga del archivo.');
        const blob = await response.blob();
        return { isBlob: true, blob, response };
      }

      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.message || 'Error en la solicitud');
        error.data = data;
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (err) {
      console.error('API Error:', err);
      throw err;
    }
  },

  get(endpoint, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const url = qs ? `${endpoint}?${qs}` : endpoint;
    return this.request(url, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  delete(endpoint) {
    return this.request(endpoint, {
      method: 'DELETE'
    });
  }
};
