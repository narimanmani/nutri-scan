import { generateExerciseInsights, generateSectionOverview } from '@/api/openai.js';

const BASE_URL = 'https://wger.de/api/v2';
const BASE_HOST = BASE_URL.replace(/\/?api\/v2\/?$/, '');

const rawApiKey = import.meta.env?.VITE_WGER_API_KEY;
const API_KEY = typeof rawApiKey === 'string' ? rawApiKey.trim() : '';

const MUSCLE_LIBRARY_MATCHERS = [
  {
    key: 'glutes',
    patterns: [/glute/i, /gluteus/i],
  },
  {
    key: 'lats',
    patterns: [/latissimus/i, /\blats?\b/i],
  },
];

export const MUSCLE_ID_TO_LIBRARY_KEY = new Map();

function detectLibraryKey(record) {
  if (!record) {
    return '';
  }

  const id = Number(record.id);
  if (!Number.isFinite(id)) {
    return '';
  }

  const existing = MUSCLE_ID_TO_LIBRARY_KEY.get(id);
  if (existing) {
    return existing;
  }

  const nameParts = [record.name_en, record.name, record.name_de, record.alternative_names]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();

  if (!nameParts) {
    return '';
  }

  for (const matcher of MUSCLE_LIBRARY_MATCHERS) {
    if (matcher.patterns.some((pattern) => pattern.test(nameParts))) {
      return matcher.key;
    }
  }

  return '';
}

function buildLibraryMappings(records) {
  const idToKey = new Map(MUSCLE_ID_TO_LIBRARY_KEY);
  const keyToIds = new Map();

  for (const record of records) {
    if (!record) continue;

    const id = Number(record.id);
    if (!Number.isFinite(id)) {
      continue;
    }

    const libraryKey = idToKey.get(id) || detectLibraryKey(record);
    if (!libraryKey) {
      continue;
    }

    idToKey.set(id, libraryKey);

    if (!keyToIds.has(libraryKey)) {
      keyToIds.set(libraryKey, new Set());
    }
    keyToIds.get(libraryKey).add(id);
  }

  const normalizedKeyToIds = new Map(
    Array.from(keyToIds.entries()).map(([key, ids]) => [key, Array.from(ids).sort((a, b) => a - b)])
  );

  return { idToKey, keyToIds: normalizedKeyToIds };
}

function buildHeaders(extra) {
  const headers = {
    Accept: 'application/json',
    ...(extra || {}),
  };

  if (API_KEY) {
    headers.Authorization = `Token ${API_KEY}`;
  }

  return headers;
}

async function fetchJson(url, options = {}) {
  const { headers: extraHeaders, ...rest } = options;
  const response = await fetch(url, {
    ...rest,
    headers: buildHeaders(extraHeaders),
  });

  if (!response.ok) {
    const error = new Error(`Request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function fetchExercisesForMuscle(muscleId, { limit = 20, signal } = {}) {
  if (!muscleId) {
    throw new Error('A muscle id is required to fetch exercises.');
  }

  const searchParams = new URLSearchParams({
    language: '2',
    status: '2',
    muscles: String(muscleId),
    limit: String(limit),
  });

  const data = await fetchJson(`${BASE_URL}/exercise/?${searchParams.toString()}`, { signal });
  return data.results || [];
}

function toAbsoluteAssetUrl(url = '') {
  if (!url) return '';

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (url.startsWith('//')) {
    return `https:${url}`;
  }

  const normalizedBase = BASE_HOST.replace(/\/$/, '');
  const normalizedPath = url.startsWith('/') ? url : `/${url}`;
  return `${normalizedBase}${normalizedPath}`;
}

function extractPhotoUrls(exercise) {
  const urls = new Set();

  const appendUrl = (value) => {
    const normalized = toAbsoluteAssetUrl(value);
    if (normalized) {
      urls.add(normalized);
    }
  };

  if (typeof exercise?.image === 'string') {
    appendUrl(exercise.image);
  }

  const images = exercise?.images;
  if (Array.isArray(images)) {
    images.forEach((entry) => {
      if (!entry) return;

      if (typeof entry === 'string') {
        appendUrl(entry);
        return;
      }

      if (typeof entry === 'object') {
        if (typeof entry.image === 'string') {
          appendUrl(entry.image);
        } else if (typeof entry.image_url === 'string') {
          appendUrl(entry.image_url);
        } else if (typeof entry.url === 'string') {
          appendUrl(entry.url);
        }
      }
    });
  }

  return Array.from(urls);
}

export async function generateWorkoutPlanFromMuscles(
  muscles,
  { exercisesPerMuscle = 3, signal } = {}
) {
  if (!Array.isArray(muscles) || muscles.length === 0) {
    return [];
  }

  const plan = [];
  const seenExercises = new Set();

  for (const muscle of muscles) {
    try {
      const targetIds = Array.isArray(muscle.apiIds) && muscle.apiIds.length > 0 ? muscle.apiIds : [muscle.id];
      const muscleExercises = [];

      for (const targetId of targetIds) {
        if (!targetId) continue;
        const exercises = await fetchExercisesForMuscle(targetId, {
          limit: exercisesPerMuscle * 3,
          signal,
        });
        muscleExercises.push(...exercises);
      }

      if (muscleExercises.length === 0) {
        plan.push({
          muscle,
          exercises: [],
          error: 'No exercises found for this muscle group.',
        });
        continue;
      }

      const uniqueExercises = muscleExercises.filter((exercise) => {
        if (seenExercises.has(exercise.id)) {
          return false;
        }
        seenExercises.add(exercise.id);
        return true;
      });

      const selectedExercises = uniqueExercises.slice(0, exercisesPerMuscle);

      const enrichedExercises = await Promise.all(
        selectedExercises.map(async (exercise) => {
          const name = exercise?.name || `Exercise ${exercise?.id || ''}`.trim();

          try {
            const insights = await generateExerciseInsights({
              exerciseName: name,
              muscleLabel: muscle.label,
              signal,
            });

            return {
              ...exercise,
              name,
              description: insights.description || exercise.description || '',
              sets: insights.sets,
              reps: insights.reps,
              tempo: insights.tempo,
              rest: insights.rest,
              equipment: insights.equipment,
              cues: insights.cues,
              benefits: insights.benefits,
              videoUrls: [],
              photoUrls: extractPhotoUrls(exercise),
              safetyNotes: insights.safetyNotes,
            };
          } catch (detailError) {
            if (detailError.name === 'AbortError') {
              throw detailError;
            }

            const errorMessage =
              detailError.code === 'OPENAI_API_KEY_MISSING'
                ? 'Configure an OpenAI API key to generate AI coaching notes.'
                : detailError.message || 'Unable to load coaching notes for this exercise.';

            return {
              ...exercise,
              name,
              description: exercise.description || '',
              sets: '',
              reps: '',
              tempo: '',
              rest: '',
              equipment: '',
              cues: [],
              benefits: [],
              videoUrls: [],
              photoUrls: extractPhotoUrls(exercise),
              safetyNotes: '',
              detailError: errorMessage,
            };
          }
        })
      );

      let overview = { focus: '', adaptationGoal: '', warmupTip: '' };
      let overviewError = '';

      try {
        overview = await generateSectionOverview({
          muscleLabel: muscle.label,
          exerciseNames: enrichedExercises.map((exercise) => exercise.name),
          signal,
        });
      } catch (overviewErr) {
        if (overviewErr.name === 'AbortError') {
          throw overviewErr;
        }

        overviewError =
          overviewErr.code === 'OPENAI_API_KEY_MISSING'
            ? 'Configure an OpenAI API key to summarize this block.'
            : overviewErr.message || 'Unable to summarize this block right now.';
      }

      plan.push({
        muscle,
        exercises: enrichedExercises,
        overview,
        overviewError,
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw error;
      }

      if (error.code === 'OPENAI_API_KEY_MISSING') {
        throw new Error('Set VITE_OPENAI_API_KEY to generate workout plans with AI coaching.');
      }

      plan.push({
        muscle,
        exercises: [],
        error: error.message || 'Unable to load exercises',
      });
    }
  }

  return plan.filter((section) => section.exercises.length > 0 || section.error);
}

export const WGER_BASE_URL = BASE_URL;

export async function fetchAllMuscles({ signal } = {}) {
  const muscles = [];
  let nextUrl = `${BASE_URL}/muscle/?limit=200`;

  while (nextUrl) {
    const data = await fetchJson(nextUrl, { signal });
    muscles.push(...(data.results || []));
    nextUrl = data.next;
  }

  const { idToKey, keyToIds } = buildLibraryMappings(muscles);

  MUSCLE_ID_TO_LIBRARY_KEY.clear();
  for (const [id, libraryKey] of idToKey.entries()) {
    MUSCLE_ID_TO_LIBRARY_KEY.set(id, libraryKey);
  }

  return muscles.map((record) => {
    if (!record) {
      return record;
    }

    const id = Number(record.id);
    if (!Number.isFinite(id)) {
      return { ...record, libraryKey: '', libraryIds: [] };
    }

    const libraryKey = idToKey.get(id) || '';
    const ids = libraryKey ? keyToIds.get(libraryKey) || [id] : [id];

    return {
      ...record,
      libraryKey,
      libraryIds: ids,
    };
  });
}
