const API_BASE = '/api';

async function request(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const init = {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    signal,
  };

  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, init);
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json().catch(() => ({})) : {};

  if (!response.ok) {
    const error = new Error(payload?.error || `Request to ${path} failed with status ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export function get(path, options) {
  return request(path, { ...options, method: 'GET' });
}

export function post(path, body, options) {
  return request(path, { ...options, method: 'POST', body });
}

export function put(path, body, options) {
  return request(path, { ...options, method: 'PUT', body });
}

export function patch(path, body, options) {
  return request(path, { ...options, method: 'PATCH', body });
}

export function del(path, options) {
  return request(path, { ...options, method: 'DELETE' });
}
