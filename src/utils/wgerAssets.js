const WGER_BASE_URL = 'https://wger.de';
const WGER_HOSTNAMES = new Set(['wger.de', 'www.wger.de']);
const ALLOWED_PATH_PREFIXES = ['/static/images/muscles/'];

const SILHOUETTE_MODULES = import.meta.glob('../muscles/**/muscular_system_*.svg', {
  eager: true,
  import: 'default',
});

const MAIN_MUSCLE_MODULES = import.meta.glob('../muscles/main/muscle-*.svg', {
  eager: true,
  import: 'default',
});

const SECONDARY_MUSCLE_MODULES = import.meta.glob('../muscles/secondary/muscle-*.svg', {
  eager: true,
  import: 'default',
});

const ROOT_MUSCLE_MODULES = import.meta.glob('../muscles/muscle-*.svg', {
  eager: true,
  import: 'default',
});

function parseMuscleIdFromPath(path = '') {
  const match = path.match(/muscle-(\d+)\.svg$/i);
  if (!match) return null;

  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

function buildAssetMap(primaryModules = {}, fallbackModules = {}) {
  const map = new Map();

  for (const [path, url] of Object.entries(primaryModules)) {
    const id = parseMuscleIdFromPath(path);
    if (id == null || map.has(id)) continue;
    map.set(id, url);
  }

  for (const [path, url] of Object.entries(fallbackModules)) {
    const id = parseMuscleIdFromPath(path);
    if (id == null || map.has(id)) continue;
    map.set(id, url);
  }

  return map;
}

function resolveSilhouette(view = 'front') {
  const candidates = [
    `../muscles/muscular_system_${view}.svg`,
    `../muscles/main/muscular_system_${view}.svg`,
    `../muscles/secondary/muscular_system_${view}.svg`,
  ];

  for (const candidate of candidates) {
    const asset = SILHOUETTE_MODULES[candidate];
    if (asset) {
      return asset;
    }
  }

  return '';
}

const LOCAL_SILHOUETTE_ASSETS = {
  front: resolveSilhouette('front'),
  back: resolveSilhouette('back'),
};

const LOCAL_MAIN_ASSETS = buildAssetMap(MAIN_MUSCLE_MODULES, ROOT_MUSCLE_MODULES);
const LOCAL_SECONDARY_ASSETS = buildAssetMap(SECONDARY_MUSCLE_MODULES, ROOT_MUSCLE_MODULES);

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
