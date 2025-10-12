const API_BASE = '/api';

function buildUrl(path, params) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params && typeof params === 'object') {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }

      url.searchParams.set(key, value);
    });
  }

  return url.pathname + url.search;
}

async function request(path, { method = 'GET', body, headers, params } = {}) {
  const url = buildUrl(path, params);
  const init = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {})
    },
    credentials: 'include'
  };

  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const response = await fetch(url, init);
  let payload = null;

  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(payload?.error || 'Request failed.');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export function apiGet(path, options) {
  return request(path, { ...(options || {}), method: 'GET' });
}

export function apiPost(path, body, options) {
  return request(path, { ...(options || {}), method: 'POST', body });
}

export function apiPut(path, body, options) {
  return request(path, { ...(options || {}), method: 'PUT', body });
}

export function apiDelete(path, options) {
  return request(path, { ...(options || {}), method: 'DELETE' });
}

export { request as apiRequest };
