const WGER_BASE_URL = 'https://wger.de';
const WGER_HOST_PATTERN = /^(?:https?:\/\/)?(?:www\.)?wger\.de(?::\d+)?(\/.*)$/i;
const WGER_PROXY_PREFIX = '/wger';

function normalizeAbsoluteUrl(url = '') {
  if (!url) return '';

  if (url.startsWith('//')) {
    return `https:${url}`;
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  const base = WGER_BASE_URL.replace(/\/$/, '');
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${base}${path}`;
}

export function applyWgerProxy(url = '') {
  if (!url) return '';
  if (url.startsWith(`${WGER_PROXY_PREFIX}/`)) {
    return url;
  }

  const match = url.match(WGER_HOST_PATTERN);
  if (!match) {
    return url;
  }

  const path = match[1] || '/';
  return `${WGER_PROXY_PREFIX}${path}`;
}

export function resolveWgerAssetUrl(url = '') {
  const absolute = normalizeAbsoluteUrl(url);
  return applyWgerProxy(absolute);
}

export { WGER_BASE_URL };
