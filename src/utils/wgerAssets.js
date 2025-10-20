const WGER_BASE_URL = 'https://wger.de';
const WGER_HOSTNAMES = new Set(['wger.de', 'www.wger.de']);
const ALLOWED_PATH_PREFIXES = ['/static/images/muscles/'];

const LOCAL_SILHOUETTE_MODULES = import.meta.glob('@/muscles/*.svg', { eager: true, import: 'default' });
const LOCAL_MAIN_MUSCLE_MODULES = import.meta.glob('@/muscles/main/*.svg', { eager: true, import: 'default' });
const LOCAL_SECONDARY_MUSCLE_MODULES = import.meta.glob('@/muscles/secondary/*.svg', {
  eager: true,
  import: 'default',
});

function buildMuscleAssetMaps(modules) {
  const byFile = new Map();
  const byId = new Map();

  Object.entries(modules).forEach(([path, url]) => {
    const fileName = path.split('/').pop()?.toLowerCase() || '';
    if (!fileName) return;

    const baseName = fileName.replace(/\.svg$/i, '');

    const hyphenVariant = baseName.replace(/_/g, '-');
    const underscoreVariant = baseName.replace(/-/g, '_');

    [fileName, baseName, hyphenVariant, underscoreVariant].forEach((key) => {
      if (key) {
        byFile.set(key, url);
      }
    });

    const idMatch = baseName.match(/muscle[-_](\d+)$/i);
    if (idMatch) {
      const [, id] = idMatch;
      if (id) {
        byId.set(Number(id), url);
      }
    }
  });

  return { byFile, byId };
}

const LOCAL_MAIN_ASSETS = buildMuscleAssetMaps(LOCAL_MAIN_MUSCLE_MODULES);
const LOCAL_SECONDARY_ASSETS = buildMuscleAssetMaps(LOCAL_SECONDARY_MUSCLE_MODULES);

const LOCAL_SILHOUETTE_ASSETS = Object.entries(LOCAL_SILHOUETTE_MODULES).reduce(
  (acc, [path, url]) => {
    const fileName = path.split('/').pop()?.toLowerCase() || '';
    if (!fileName) return acc;

    if (fileName.includes('back')) {
      acc.back = url;
    } else if (fileName.includes('front')) {
      acc.front = url;
    }

    return acc;
  },
  /** @type {{ front?: string; back?: string }} */ ({})
);

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

function normalizeFileKey(value = '') {
  if (!value) return '';

  let working = value.trim();

  try {
    if (/^https?:\/\//i.test(working)) {
      const url = new URL(working);
      working = url.pathname.split('/').pop() || '';
    }
  } catch {
    // Ignore invalid URL parsing errors.
  }

  if (!working) {
    const parts = value.split('/');
    working = parts[parts.length - 1] || '';
  }

  working = working.split('#')[0];
  working = working.split('?')[0];

  return working.toLowerCase();
}

function resolveLocalMuscleAsset({ lookup, fallbackLookup, fileKey, id }) {
  const normalizedFileKey = fileKey?.toLowerCase() || '';

  if (normalizedFileKey) {
    const baseKey = normalizedFileKey.replace(/\.svg$/i, '');
    const fromFile = lookup.byFile.get(normalizedFileKey) || lookup.byFile.get(baseKey);
    if (fromFile) return fromFile;

    if (fallbackLookup) {
      const fallbackFile =
        fallbackLookup.byFile.get(normalizedFileKey) || fallbackLookup.byFile.get(baseKey);
      if (fallbackFile) return fallbackFile;
    }
  }

  if (Number.isFinite(id)) {
    const idKey = Number(id);
    const fromId = lookup.byId.get(idKey);
    if (fromId) return fromId;

    const dashKey = `muscle-${id}`;
    const underscoreKey = `muscle_${id}`;
    const fromGuess =
      lookup.byFile.get(dashKey) ||
      lookup.byFile.get(`${dashKey}.svg`) ||
      lookup.byFile.get(underscoreKey) ||
      lookup.byFile.get(`${underscoreKey}.svg`);
    if (fromGuess) return fromGuess;

    if (fallbackLookup) {
      const fallbackId = fallbackLookup.byId.get(idKey);
      if (fallbackId) return fallbackId;

      const fallbackGuess =
        fallbackLookup.byFile.get(dashKey) ||
        fallbackLookup.byFile.get(`${dashKey}.svg`) ||
        fallbackLookup.byFile.get(underscoreKey) ||
        fallbackLookup.byFile.get(`${underscoreKey}.svg`);
      if (fallbackGuess) return fallbackGuess;
    }
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
  const useSecondary = variant === 'secondary';

  const primaryLookup = useSecondary ? LOCAL_SECONDARY_ASSETS : LOCAL_MAIN_ASSETS;
  const fallbackLookup = useSecondary ? LOCAL_MAIN_ASSETS : LOCAL_SECONDARY_ASSETS;

  const fileKey = normalizeFileKey(remoteUrl);

  return (
    resolveLocalMuscleAsset({
      lookup: primaryLookup,
      fallbackLookup,
      fileKey,
      id: Number.isFinite(normalizedId) ? normalizedId : undefined,
    }) || ''
  );
}
