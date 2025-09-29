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

const TOKEN_NORMALIZATIONS = new Map([
  ['pressup', 'pushup'],
  ['pressups', 'pushup'],
  ['pushups', 'pushup'],
  ['pushup', 'pushup'],
  ['lunges', 'lunge'],
  ['crunches', 'crunch'],
  ['raises', 'raise'],
  ['extensions', 'extension'],
  ['curls', 'curl'],
  ['rows', 'row'],
  ['squats', 'squat'],
  ['deadlifts', 'deadlift'],
  ['hips', 'hip'],
  ['glutes', 'glute'],
  ['triceps', 'tricep'],
  ['biceps', 'bicep'],
  ['calf', 'calf'],
  ['calve', 'calf'],
  ['calves', 'calf'],
]);

const DESCRIPTOR_TOKENS = new Set([
  'male',
  'female',
  'man',
  'woman',
  'front',
  'back',
  'side',
  'left',
  'right',
  'standing',
  'seated',
  'kneeling',
  'lying',
  'laying',
  'prone',
  'supine',
  'incline',
  'decline',
  'wide',
  'narrow',
  'close',
  'neutral',
  'overhand',
  'underhand',
  'pronated',
  'supinated',
  'single',
  'double',
  'one',
  'two',
  'alternating',
  'alternate',
  'variation',
  'hold',
  'position',
  'isometric',
  'assisted',
  'unassisted',
  'supported',
  'unsupported',
  'elevated',
  'low',
  'high',
]);

const FUZZY_SCORE_THRESHOLD = 0.28;

const GENERIC_EXERCISE_TOKENS = new Set([
  'exercise',
  'exercises',
  'movement',
  'movements',
  'drill',
  'drills',
  'workout',
  'workouts',
]);

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

  base = base.replace(/'(s)?$/g, '');

  if (base.endsWith('ing') && base.length > 4) {
    base = base.slice(0, -3);
  } else if (base.endsWith('ers') && base.length > 4) {
    base = base.slice(0, -3);
  } else if (base.endsWith('es') && base.length > 3) {
    base = base.slice(0, -2);
  } else if (base.endsWith('s') && base.length > 3 && !base.endsWith('ss')) {
    base = base.slice(0, -1);
  }

  const normalized = TOKEN_NORMALIZATIONS.get(base) || base;

  if (STOP_WORDS.has(normalized)) {
    return '';
  }

  return normalized;
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

function registerEntry(map, key, entry) {
  if (!key) return;
  const existing = map.get(key);
  if (existing) {
    if (!existing.includes(entry)) {
      existing.push(entry);
    }
    return;
  }
  map.set(key, [entry]);
}

function generateAliasKeys(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return [];
  }

  const keys = new Set();

  if (tokens.length >= 2) {
    keys.add(tokensToKey(tokens.slice(1)));
    keys.add(tokensToKey(tokens.slice(0, -1)));
  }

  if (tokens.length >= 3) {
    for (let i = 0; i < tokens.length; i += 1) {
      const subset = tokens.slice(0, i).concat(tokens.slice(i + 1));
      keys.add(tokensToKey(subset));
    }
  }

  return Array.from(keys).filter(Boolean);
}

const exactMatchIndex = new Map();
const coreKeyIndex = new Map();
const aliasKeyIndex = new Map();

const animationIndex = Object.entries(gifModules)
  .map(([path, src]) => {
    const resolvedSrc = typeof src === 'string' ? src : src?.default;
    if (!resolvedSrc) {
      return null;
    }

    const parts = path.split('/');
    const fileName = parts[parts.length - 1];
    const baseName = fileName.replace(/\.[^.]+$/, '');

    const normalized = normalizeKey(baseName);
    const tokens = tokenize(baseName);
    const descriptors = Array.from(new Set(tokens.filter((token) => DESCRIPTOR_TOKENS.has(token))));
    const coreTokens = tokenize(baseName, { omitDescriptors: true });
    const coreKey = tokensToKey(coreTokens);
    const aliasKeys = generateAliasKeys(coreTokens);
    const bigrams = createBigrams(normalized);

    const entry = {
      path,
      fileName,
      baseName,
      normalized,
      tokens,
      descriptors,
      coreTokens,
      coreKey,
      aliasKeys,
      bigrams,
      src: resolvedSrc,
    };

    if (normalized) {
      exactMatchIndex.set(normalized, entry);
    }

    if (coreKey) {
      registerEntry(coreKeyIndex, coreKey, entry);
    }

    aliasKeys.forEach((aliasKey) => registerEntry(aliasKeyIndex, aliasKey, entry));

    return entry;
  })
  .filter(Boolean);

function formatScore(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return Number(value);
}

function createQuerySummary({
  name,
  normalizedName,
  tokens,
  coreTokens,
  wantsSide,
  wantsBack,
  wantsFront,
}) {
  return {
    requestedName: name || '',
    normalized: normalizedName || '',
    tokens: Array.isArray(tokens) ? tokens : [],
    coreTokens: Array.isArray(coreTokens) ? coreTokens : [],
    wantsSide: Boolean(wantsSide),
    wantsBack: Boolean(wantsBack),
    wantsFront: Boolean(wantsFront),
  };
}

function createSuggestion(entry, score) {
  if (!entry) {
    return null;
  }

  return {
    fileName: entry.fileName,
    baseName: entry.baseName,
    descriptors: entry.descriptors,
    tokens: entry.coreTokens,
    score: formatScore(score),
    src: entry.src,
  };
}

function createMatch(entry, { strategy, score, query, confidence = 'high', suggestion = null }) {
  if (!entry) {
    return null;
  }

  return {
    matched: true,
    src: entry.src,
    alt: `${entry.baseName} demonstration`,
    strategy: strategy || 'unknown',
    score: formatScore(score ?? 1),
    fileName: entry.fileName,
    baseName: entry.baseName,
    descriptors: entry.descriptors,
    tokens: entry.coreTokens,
    query,
    confidence: confidence === 'low' ? 'low' : 'high',
    suggestion: suggestion && suggestion.fileName ? suggestion : null,
  };
}

function createUnmatched({ reason, query, suggestion, score }) {
  return {
    matched: false,
    src: '',
    alt: '',
    strategy: reason || 'unresolved',
    score: formatScore(score),
    fileName: '',
    baseName: '',
    descriptors: [],
    tokens: [],
    query,
    suggestion: suggestion || null,
    confidence: 'none',
  };
}

const GENERIC_EXERCISE_PATTERN = /^exercise\s*\d*$/i;

function hasMeaningfulTokens(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return false;
  }

  return tokens.some((token) => {
    if (!token) return false;
    if (GENERIC_EXERCISE_TOKENS.has(token)) return false;
    if (/^\d+$/.test(token)) return false;
    return true;
  });
}

function isLowSignalQuery({ name, tokens, coreTokens }) {
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  if (!normalizedName) {
    return true;
  }

  if (GENERIC_EXERCISE_PATTERN.test(normalizedName)) {
    return true;
  }

  if (hasMeaningfulTokens(coreTokens)) {
    return false;
  }

  return !hasMeaningfulTokens(tokens);
}

function chooseBestEntry(candidates, preferences) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const wantsSide = Boolean(preferences?.wantsSide);
  const wantsBack = Boolean(preferences?.wantsBack);
  const wantsFront = Boolean(preferences?.wantsFront);

  let best = null;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const descriptorSet = new Set(candidate.descriptors);
    let score = 0;

    if (wantsSide) {
      if (descriptorSet.has('side')) score += 3;
      if (descriptorSet.has('front')) score -= 0.4;
      if (descriptorSet.has('back')) score -= 0.4;
    } else if (wantsBack) {
      if (descriptorSet.has('back')) score += 2.5;
      if (descriptorSet.has('front')) score -= 0.3;
    } else if (wantsFront) {
      if (descriptorSet.has('front')) score += 2.5;
      if (descriptorSet.has('back')) score -= 0.3;
    } else {
      if (descriptorSet.has('front')) score += 1.2;
      if (descriptorSet.has('side')) score += 0.6;
    }

    score += 0.4 / (descriptorSet.size + 1);
    score -= candidate.fileName.length * 0.0005;

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function orientationBoost(descriptors, preferences) {
  const descriptorSet = new Set(descriptors);
  const wantsSide = Boolean(preferences?.wantsSide);
  const wantsBack = Boolean(preferences?.wantsBack);
  const wantsFront = Boolean(preferences?.wantsFront);

  let boost = 0;

  if (wantsSide) {
    if (descriptorSet.has('side')) boost += 0.2;
  } else if (wantsBack) {
    if (descriptorSet.has('back')) boost += 0.18;
    if (descriptorSet.has('front')) boost -= 0.05;
  } else if (wantsFront) {
    if (descriptorSet.has('front')) boost += 0.18;
    if (descriptorSet.has('back')) boost -= 0.05;
  } else if (descriptorSet.has('front')) {
    boost += 0.08;
  }

  if (descriptorSet.size === 0) {
    boost += 0.05;
  }

  return boost;
}

export function findExerciseAnimation(name) {
  const nameTokens = tokenize(name);
  const nameCoreTokens = tokenize(name, { omitDescriptors: true });
  const normalizedName = normalizeKey(name);

  const wantsSide = nameTokens.includes('side');
  const wantsBack = nameTokens.includes('back');
  const wantsFront = nameTokens.includes('front');

  const query = createQuerySummary({
    name,
    normalizedName,
    tokens: nameTokens,
    coreTokens: nameCoreTokens,
    wantsSide,
    wantsBack,
    wantsFront,
  });

  if (!normalizedName && nameTokens.length === 0) {
    return createUnmatched({ reason: 'missing-query', query });
  }

  const preferences = { wantsSide, wantsBack, wantsFront };

  const exact = exactMatchIndex.get(normalizedName);
  if (exact) {
    return createMatch(exact, { strategy: 'exact', score: 1, query });
  }

  const coreKey = tokensToKey(nameCoreTokens);
  if (coreKey) {
    const coreMatch = chooseBestEntry(coreKeyIndex.get(coreKey), preferences);
    if (coreMatch) {
      return createMatch(coreMatch, { strategy: 'core-key', score: 0.95, query });
    }

    const aliasFallback = chooseBestEntry(aliasKeyIndex.get(coreKey), preferences);
    if (aliasFallback) {
      return createMatch(aliasFallback, { strategy: 'core-alias', score: 0.9, query });
    }
  }

  const aliasKeys = generateAliasKeys(nameCoreTokens);
  for (const aliasKey of aliasKeys) {
    const coreAlias = chooseBestEntry(coreKeyIndex.get(aliasKey), preferences);
    if (coreAlias) {
      return createMatch(coreAlias, { strategy: 'alias-core', score: 0.85, query });
    }
    const looseAlias = chooseBestEntry(aliasKeyIndex.get(aliasKey), preferences);
    if (looseAlias) {
      return createMatch(looseAlias, { strategy: 'alias', score: 0.8, query });
    }
  }

  const nameTokenSet = new Set(nameTokens);
  const nameCoreSet = new Set(nameCoreTokens);
  const nameBigrams = createBigrams(normalizedName);

  let bestEntry = null;
  let bestScore = 0;

  for (const entry of animationIndex) {
    const tokenOverlap = entry.tokens.filter((token) => nameTokenSet.has(token)).length;
    const tokenScore = tokenOverlap / Math.max(entry.tokens.length || 1, nameTokens.length || 1);

    const coreOverlap = entry.coreTokens.filter((token) => nameCoreSet.has(token)).length;
    const coreScore = coreOverlap / Math.max(entry.coreTokens.length || 1, nameCoreTokens.length || 1);

    const diceScore = diceCoefficient(nameBigrams, entry.bigrams);

    let partialBonus = 0;
    if (entry.normalized && normalizedName && (entry.normalized.includes(normalizedName) || normalizedName.includes(entry.normalized))) {
      partialBonus += 0.3;
    }
    if (coreKey && entry.coreKey === coreKey) {
      partialBonus += 0.25;
    } else if (coreKey && entry.coreKey && (entry.coreKey.includes(coreKey) || coreKey.includes(entry.coreKey))) {
      partialBonus += 0.15;
    }

    partialBonus += orientationBoost(entry.descriptors, preferences);

    const totalScore = tokenScore * 0.45 + coreScore * 0.35 + diceScore * 0.2 + partialBonus;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestEntry = entry;
    }
  }

  if (bestEntry) {
    if (bestScore >= FUZZY_SCORE_THRESHOLD) {
      return createMatch(bestEntry, { strategy: 'fuzzy', score: bestScore, query });
    }

    if (isLowSignalQuery({ name, tokens: nameTokens, coreTokens: nameCoreTokens })) {
      const suggestion = createSuggestion(bestEntry, bestScore);
      return createMatch(bestEntry, {
        strategy: 'fuzzy-low',
        score: bestScore,
        query,
        confidence: 'low',
        suggestion,
      });
    }
  }

  const suggestion = createSuggestion(bestEntry, bestScore);
  return createUnmatched({ reason: 'no-match', query, suggestion, score: bestScore });
}

export function listAvailableWorkoutAnimations() {
  return animationIndex.map((entry) => ({
    name: entry.baseName,
    descriptors: entry.descriptors,
    tokens: entry.coreTokens,
    src: entry.src,
  }));
}
