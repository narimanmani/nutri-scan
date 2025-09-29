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

const gifModules = import.meta.glob('../workout/Images/*.{gif,GIF}', {
  eager: true,
});

function normalizeToken(token) {
  const trimmed = token
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  if (!trimmed) return '';

  const singular = trimmed.replace(/'(s)?$/g, '').replace(/(ing|ers|es|s)$/g, '');
  if (STOP_WORDS.has(singular)) {
    return '';
  }

  return singular;
}

function tokenize(value) {
  if (typeof value !== 'string') return [];

  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => normalizeToken(token))
    .filter(Boolean);
}

function normalizeKey(value) {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const animationIndex = Object.entries(gifModules)
  .map(([path, module]) => {
    const src = typeof module === 'string' ? module : module?.default;
    if (!src) {
      return null;
    }

    const parts = path.split('/');
    const fileName = parts[parts.length - 1];
    const baseName = fileName.replace(/\.[^.]+$/, '');

    return {
      path,
      fileName,
      baseName,
      normalized: normalizeKey(baseName),
      tokens: tokenize(baseName),
      src,
    };
  })
  .filter(Boolean);

export function findExerciseAnimation(name) {
  const normalizedName = normalizeKey(name);
  if (!normalizedName) {
    return null;
  }

  const exact = animationIndex.find((entry) => entry.normalized === normalizedName);
  if (exact) {
    return {
      src: exact.src,
      alt: `${exact.baseName} demonstration`,
    };
  }

  const nameTokens = tokenize(name);
  if (nameTokens.length === 0) {
    return null;
  }

  const tokenSet = new Set(nameTokens);
  let bestEntry = null;
  let bestScore = 0;

  for (const entry of animationIndex) {
    if (entry.tokens.length === 0) continue;
    const overlap = entry.tokens.filter((token) => tokenSet.has(token));
    if (overlap.length === 0) continue;

    const coverageScore = overlap.length / entry.tokens.length;
    const matchScore = overlap.length / nameTokens.length;
    const totalScore = coverageScore * 0.7 + matchScore * 0.3;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestEntry = entry;
    }
  }

  if (bestEntry && bestScore >= 0.45) {
    return {
      src: bestEntry.src,
      alt: `${bestEntry.baseName} demonstration`,
    };
  }

  return null;
}
