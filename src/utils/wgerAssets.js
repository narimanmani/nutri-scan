const WGER_BASE_URL = 'https://wger.de';
const WGER_HOSTNAMES = new Set(['wger.de', 'www.wger.de']);
const ALLOWED_PATH_PREFIXES = ['/static/images/muscles/'];

const LOCAL_SILHOUETTE_ASSETS = {
  front: new URL('../muscles/muscular_system_front.svg', import.meta.url).href,
  back: new URL('../muscles/muscular_system_back.svg', import.meta.url).href,
};

const SUPPORTED_MUSCLE_IDS = Array.from({ length: 23 }, (_, index) => index + 1);

function buildExplicitAssetMap(prefix) {
  return new Map(
    SUPPORTED_MUSCLE_IDS.map((id) => [
      id,
      new URL(`../muscles/${prefix}/muscle-${id}.svg`, import.meta.url).href,
    ])
  );
}

const LOCAL_MAIN_ASSETS = buildExplicitAssetMap('main');
const LOCAL_SECONDARY_ASSETS = buildExplicitAssetMap('secondary');

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

function getLocalMuscleAsset(id, variant = 'main') {
  if (!Number.isFinite(id)) return '';

  const lookup = variant === 'secondary' ? LOCAL_SECONDARY_ASSETS : LOCAL_MAIN_ASSETS;
  const fallbackLookup = variant === 'secondary' ? LOCAL_MAIN_ASSETS : LOCAL_SECONDARY_ASSETS;

  if (lookup.has(id)) {
    return lookup.get(id) || '';
  }

  if (fallbackLookup.has(id)) {
    return fallbackLookup.get(id) || '';
  }

  return '';
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
    return (
      LOCAL_SILHOUETTE_ASSETS.back ||
      buildWgerAssetProxyUrl('/static/images/muscles/muscular_system_back.svg')
    );
  }

  return (
    LOCAL_SILHOUETTE_ASSETS.front ||
    buildWgerAssetProxyUrl('/static/images/muscles/muscular_system_front.svg')
  );
}

export function getMuscleOverlayAssetUrl({ id, variant = 'main', remoteUrl = '' } = {}) {
  const normalizedId = Number(id);

  const localAsset = getLocalMuscleAsset(normalizedId, variant);
  if (localAsset) {
    return localAsset;
  }

  if (remoteUrl) {
    return buildWgerAssetProxyUrl(remoteUrl) || normalizePath(remoteUrl);
  }

  return '';
}
