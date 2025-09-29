const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
  'your',
  'using',
]);

const DESCRIPTOR_TOKENS = new Set(['front', 'back', 'side']);

const htmlModules = import.meta.glob('../workout/*.html', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const gifModules = import.meta.glob('../workout/Images/*.{gif,GIF}', {
  eager: true,
  import: 'default',
});

function stripDiacritics(value) {
  if (typeof value !== 'string') {
    return '';
  }

  if (typeof value.normalize === 'function') {
    return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  }

  return value;
}

function normalizeToken(token) {
  if (!token) return '';
  let base = stripDiacritics(token).toLowerCase();
  base = base.replace(/[^a-z0-9]/g, '');
  if (!base) {
    return '';
  }

  if (base.endsWith('ing') && base.length > 4) {
    base = base.slice(0, -3);
  } else if (base.endsWith('ers') && base.length > 4) {
    base = base.slice(0, -3);
  } else if (base.endsWith('es') && base.length > 3) {
    base = base.slice(0, -2);
  } else if (base.endsWith('s') && base.length > 3 && !base.endsWith('ss')) {
    base = base.slice(0, -1);
  }

  if (STOP_WORDS.has(base)) {
    return '';
  }

  return base;
}

function tokenize(value, { omitDescriptors = false } = {}) {
  if (typeof value !== 'string') return [];

  const tokens = value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => normalizeToken(token))
    .filter(Boolean);

  if (!omitDescriptors) {
    return tokens;
  }

  return tokens.filter((token) => !DESCRIPTOR_TOKENS.has(token));
}

function normalizeKey(value) {
  if (typeof value !== 'string') return '';
  return stripDiacritics(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tokensToKey(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return '';
  }
  return normalizeKey(tokens.join(' '));
}

function createBigrams(value) {
  if (typeof value !== 'string') return [];
  const normalized = value.toLowerCase();
  if (normalized.length < 2) {
    return [];
  }
  const result = [];
  for (let i = 0; i < normalized.length - 1; i += 1) {
    result.push(normalized.slice(i, i + 2));
  }
  return result;
}

function diceCoefficient(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) {
    return 0;
  }
  const setB = new Set(b);
  let overlap = 0;
  for (const fragment of a) {
    if (setB.has(fragment)) {
      overlap += 1;
    }
  }
  return (2 * overlap) / (a.length + b.length);
}

function decodeHtmlEntities(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&ldquo;/gi, '"')
    .replace(/&rdquo;/gi, '"')
    .replace(/&ndash;/gi, '-')
    .replace(/&mdash;/gi, '-')
    .replace(/&hellip;/gi, '...')
    .replace(/&deg;/gi, '°');
}

function cleanText(value) {
  if (typeof value !== 'string') return '';
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferOrientation(fileName = '') {
  const lower = fileName.toLowerCase();
  if (lower.includes('front')) return 'front';
  if (lower.includes('back')) return 'back';
  if (lower.includes('side')) return 'side';
  return '';
}

function choosePrimaryMedia(images) {
  if (!Array.isArray(images) || images.length === 0) {
    return null;
  }

  const byPreference = ['front', 'side', 'back'];

  for (const orientation of byPreference) {
    const match = images.find((image) => image.orientation === orientation);
    if (match) {
      return match;
    }
  }

  return images[0];
}

function normalizeImagePath(rawPath = '') {
  if (!rawPath) return '';
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\.\/?/, '');
  const parts = normalized.split('/');
  const fileName = parts[parts.length - 1];
  return fileName ? fileName.trim() : '';
}

function extractExercisesFromHtml(fileName, html) {
  if (!html) return [];

  const result = [];
  const sections = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>([\s\S]*?)(?=<h2[^>]*>|<\/body>)/gi)];

  for (const [, rawTitle, sectionHtml] of sections) {
    const name = cleanText(rawTitle);
    if (!name) continue;

    const imageMatches = [...sectionHtml.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)];
    if (imageMatches.length === 0) continue;

    const images = imageMatches
      .map(([, srcValue]) => {
        const fileNameOnly = normalizeImagePath(srcValue);
        if (!fileNameOnly) return null;

        const keyLower = `../workout/Images/${fileNameOnly}`;
        const keyUpper = `../workout/Images/${fileNameOnly.replace(/\.gif$/i, '.GIF')}`;
        const moduleValue = gifModules[keyLower] || gifModules[keyUpper];
        if (!moduleValue) {
          return null;
        }

        return {
          fileName: fileNameOnly,
          src: moduleValue,
          orientation: inferOrientation(fileNameOnly),
        };
      })
      .filter(Boolean);

    if (images.length === 0) continue;

    result.push({ name, images });
  }

  return result;
}

function createQuerySummary({
  name,
  normalizedName,
  tokens,
  coreTokens,
  bigrams,
  wantsFront,
  wantsBack,
  wantsSide,
}) {
  return {
    requestedName: name,
    normalizedName,
    tokens,
    coreTokens,
    bigrams,
    wantsFront,
    wantsBack,
    wantsSide,
  };
}

function createMatch(entry, { strategy, score, query, aliasName }) {
  const primary = entry.primary;
  const altOrientation = primary?.orientation ? ` (${primary.orientation})` : '';

  return {
    matched: Boolean(primary),
    src: primary?.src || '',
    alt: primary ? `${entry.name}${altOrientation} demonstration` : `${entry.name} demonstration`,
    score,
    strategy,
    query,
    tokens: entry.coreTokens,
    descriptors: entry.descriptors,
    fileName: primary?.fileName || '',
    htmlFile: entry.htmlFile,
    muscle: entry.muscleName,
    aliasName,
  };
}

function createSuggestion(entry, score) {
  if (!entry) return null;
  return {
    fileName: entry.primary?.fileName || '',
    tokens: entry.coreTokens,
    descriptors: entry.descriptors,
    score,
  };
}

function createUnmatched({ query, suggestion, score }) {
  return {
    matched: false,
    src: '',
    alt: '',
    score,
    strategy: 'none',
    query,
    suggestion,
  };
}

function orientationBonus(entry, query) {
  const wants = {
    front: Boolean(query.wantsFront),
    back: Boolean(query.wantsBack),
    side: Boolean(query.wantsSide),
  };

  const descriptors = new Set(entry.descriptors);

  let bonus = 0;
  if (wants.side) {
    if (descriptors.has('side')) bonus += 0.2;
  } else if (wants.back) {
    if (descriptors.has('back')) bonus += 0.18;
    if (descriptors.has('front')) bonus -= 0.05;
  } else if (wants.front) {
    if (descriptors.has('front')) bonus += 0.18;
    if (descriptors.has('back')) bonus -= 0.05;
  } else if (descriptors.has('front')) {
    bonus += 0.08;
  }

  return bonus;
}

const exactIndex = new Map();
const exerciseEntries = [];

for (const [path, rawHtml] of Object.entries(htmlModules)) {
  const fileName = path.split('/').pop();
  if (!fileName) continue;

  const muscleName = cleanText(fileName.replace(/\.html$/i, '').replace(/[-_]/g, ' '));
  const muscleTokens = tokenize(muscleName, { omitDescriptors: true });

  const exercises = extractExercisesFromHtml(fileName, rawHtml);
  for (const exercise of exercises) {
    const name = exercise.name;
    const normalized = normalizeKey(name);
    const tokens = tokenize(name);
    const coreTokens = tokenize(name, { omitDescriptors: true });
    const descriptors = Array.from(
      new Set(exercise.images.map((image) => image.orientation).filter(Boolean))
    );

    const entry = {
      name,
      normalized,
      tokens,
      coreTokens,
      coreKey: tokensToKey(coreTokens),
      descriptors,
      bigrams: createBigrams(normalized),
      primary: choosePrimaryMedia(exercise.images),
      htmlFile: fileName,
      muscleName,
      muscleTokens,
    };

    if (!entry.primary) {
      continue;
    }

    const aliasNames = new Set([
      name,
      `${muscleName} ${name}`,
      `${name} ${muscleName}`,
    ]);

    for (const alias of aliasNames) {
      const key = normalizeKey(alias);
      if (!key || exactIndex.has(key)) continue;
      exactIndex.set(key, { entry, aliasName: alias });
    }

    exerciseEntries.push(entry);
  }
}

function evaluateEntry(entry, query) {
  if (!entry) return 0;

  const queryTokenSet = new Set(query.tokens);
  const queryCoreSet = new Set(query.coreTokens);

  const tokenOverlap = entry.tokens.filter((token) => queryTokenSet.has(token)).length;
  const coreOverlap = entry.coreTokens.filter((token) => queryCoreSet.has(token)).length;
  const muscleOverlap = entry.muscleTokens.filter((token) => queryCoreSet.has(token)).length;

  const tokenScore = tokenOverlap / Math.max(entry.tokens.length || 1, query.tokens.length || 1);
  const coreScore = coreOverlap / Math.max(entry.coreTokens.length || 1, query.coreTokens.length || 1);
  const muscleScore = muscleOverlap / Math.max(entry.muscleTokens.length || 1, query.coreTokens.length || 1);

  let nameScore = 0;
  if (query.normalizedName && entry.normalized.includes(query.normalizedName)) {
    nameScore = 0.6;
  } else if (query.normalizedName && query.normalizedName.includes(entry.normalized)) {
    nameScore = 0.55;
  } else if (query.normalizedName) {
    nameScore = diceCoefficient(query.bigrams, entry.bigrams) * 0.5;
  }

  const orientationScore = orientationBonus(entry, query);

  return tokenScore * 0.35 + coreScore * 0.35 + muscleScore * 0.2 + nameScore + orientationScore;
}

export function findExerciseAnimation(name) {
  const tokens = tokenize(name);
  const coreTokens = tokenize(name, { omitDescriptors: true });
  const normalizedName = normalizeKey(name);
  const bigrams = createBigrams(normalizedName);
  const wantsFront = tokens.includes('front');
  const wantsBack = tokens.includes('back');
  const wantsSide = tokens.includes('side');

  const query = createQuerySummary({
    name,
    normalizedName,
    tokens,
    coreTokens,
    bigrams,
    wantsFront,
    wantsBack,
    wantsSide,
  });

  if (!normalizedName && tokens.length === 0) {
    return createUnmatched({ query, suggestion: null, score: 0 });
  }

  const exact = exactIndex.get(normalizedName);
  if (exact) {
    return createMatch(exact.entry, {
      strategy: exact.aliasName === exact.entry.name ? 'exact' : 'exact-alias',
      score: 1,
      query,
      aliasName: exact.aliasName,
    });
  }

  let bestEntry = null;
  let bestScore = 0;

  for (const entry of exerciseEntries) {
    const score = evaluateEntry(entry, query);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  if (bestEntry && bestScore >= 0.25) {
    return createMatch(bestEntry, {
      strategy: 'scored-html',
      score: bestScore,
      query,
      aliasName: bestEntry.name,
    });
  }

  const suggestion = createSuggestion(bestEntry, bestScore);
  return createUnmatched({ query, suggestion, score: bestScore });
}

export function listAvailableWorkoutAnimations() {
  return exerciseEntries.map((entry) => ({
    name: entry.name,
    muscle: entry.muscleName,
    descriptors: entry.descriptors,
    fileName: entry.primary?.fileName || '',
    src: entry.primary?.src || '',
  }));
}
