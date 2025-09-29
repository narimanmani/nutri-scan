const WGER_BASE_URL = 'https://wger.de';
const WGER_HOSTNAMES = new Set(['wger.de', 'www.wger.de']);
const ALLOWED_PATH_PREFIXES = ['/static/images/muscles/'];

function normalizePath(path = '') {
  if (!path) return '';
  const decoded = decodeURIComponent(path.trim());

  if (/^https?:\/\//i.test(decoded)) {
    return decoded;
  }

  if (decoded.startsWith('//')) {
    return `https:${decoded}`;
  }

  const normalizedBase = WGER_BASE_URL.replace(/\/$/, '');
  const normalizedPath = decoded.startsWith('/') ? decoded : `/${decoded}`;
  return `${normalizedBase}${normalizedPath}`;
}

function isAllowedAsset(urlString) {
  try {
    const url = new URL(urlString);
    if (!WGER_HOSTNAMES.has(url.hostname)) {
      return false;
    }

    return ALLOWED_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
  } catch {
    return false;
  }
}

export function buildWgerAssetProxyUrl(path = '') {
  const absoluteUrl = normalizePath(path);
  if (!absoluteUrl || !isAllowedAsset(absoluteUrl)) {
    return '';
  }

  const encoded = encodeURIComponent(absoluteUrl);
  return `/.netlify/functions/wger-asset?path=${encoded}`;
}

export function getSilhouetteAsset(view = 'front') {
  if (view === 'back') {
    return buildWgerAssetProxyUrl('/static/images/muscles/muscular_system_back.svg');
  }
  return buildWgerAssetProxyUrl('/static/images/muscles/muscular_system_front.svg');
}
