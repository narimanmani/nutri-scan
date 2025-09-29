import { generateExerciseInsights, generateSectionOverview } from '@/api/openai.js';
import { findExerciseAnimation } from '@/lib/workoutMedia.js';

const BASE_URL = 'https://wger.de/api/v2';
const BASE_HOST = BASE_URL.replace(/\/?api\/v2\/?$/, '');

const rawApiKey = import.meta.env?.VITE_WGER_API_KEY;
const API_KEY = typeof rawApiKey === 'string' ? rawApiKey.trim() : '';

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

const PLACEHOLDER_EXERCISE_NAME = /^exercise\s*\d*$/i;

function cleanExerciseName(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim();
}

function isMeaningfulExerciseName(name) {
  const cleaned = cleanExerciseName(name);
  if (!cleaned) {
    return false;
  }

  if (PLACEHOLDER_EXERCISE_NAME.test(cleaned)) {
    return false;
  }

  const hasLetter = /[a-z]/i.test(cleaned) || /\p{L}/u.test(cleaned);
  if (!hasLetter) {
    return false;
  }

  return true;
}

function appendNameCandidate(list, value) {
  if (!value) return;

  if (typeof value === 'string') {
    const cleaned = cleanExerciseName(value);
    if (cleaned) {
      list.push(cleaned);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => appendNameCandidate(list, entry));
    return;
  }

  if (typeof value === 'object') {
    const candidateKeys = ['text', 'name', 'full_name', 'en', 'english', 'value', 'label'];
    let appended = false;

    for (const key of candidateKeys) {
      if (typeof value[key] === 'string') {
        appendNameCandidate(list, value[key]);
        appended = true;
      }
    }

    if (!appended) {
      Object.values(value).forEach((entry) => appendNameCandidate(list, entry));
    }
  }
}

function dedupeNames(names) {
  const seen = new Set();
  const unique = [];

  for (const name of names) {
    const cleaned = cleanExerciseName(name);
    if (!cleaned) continue;

    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(cleaned);
  }

  return unique;
}

function gatherExerciseNameCandidates(exercise) {
  const candidates = [];

  appendNameCandidate(candidates, exercise?.name);
  appendNameCandidate(candidates, exercise?.name_en);
  appendNameCandidate(candidates, exercise?.name_original);
  appendNameCandidate(candidates, exercise?.alias);
  appendNameCandidate(candidates, exercise?.aliases);

  const translations = exercise?.name_translations;
  if (translations) {
    appendNameCandidate(candidates, translations);
  }

  return dedupeNames(candidates);
}

function chooseDisplayName(candidates, fallbackId) {
  for (const candidate of candidates) {
    if (isMeaningfulExerciseName(candidate)) {
      return cleanExerciseName(candidate);
    }
  }

  if (fallbackId) {
    return `Exercise ${fallbackId}`;
  }

  return 'Exercise';
}

function resolveExercisePresentation(exercise) {
  const id = exercise?.id;
  const candidates = gatherExerciseNameCandidates(exercise);

  if (id) {
    const fallback = `Exercise ${id}`;
    if (!candidates.some((candidate) => candidate.toLowerCase() === fallback.toLowerCase())) {
      candidates.push(fallback);
    }
  }

  if (candidates.length === 0) {
    candidates.push(id ? `Exercise ${id}` : 'Exercise');
  }

  const displayName = chooseDisplayName(candidates, id);

  let bestResult = null;
  let bestName = displayName;

  for (const candidate of candidates) {
    const result = findExerciseAnimation(candidate);
    if (!result) continue;

    const candidateScore = typeof result.score === 'number' ? result.score : 0;
    const bestScore = typeof bestResult?.score === 'number' ? bestResult.score : 0;
    const candidateMatched = Boolean(result.matched);
    const bestMatched = Boolean(bestResult?.matched);

    if (!bestResult || (candidateMatched && !bestMatched) || (candidateMatched === bestMatched && candidateScore > bestScore)) {
      bestResult = result;
      bestName = candidate;
    }

    if (candidateMatched) {
      break;
    }
  }

  if (!bestResult && displayName) {
    bestResult = findExerciseAnimation(displayName);
    bestName = displayName;
  }

  let finalName = displayName;
  if (bestResult?.matched && isMeaningfulExerciseName(bestName)) {
    finalName = cleanExerciseName(bestName);
  }

  return { name: finalName, animation: bestResult };
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
          const { name: resolvedName, animation } = resolveExercisePresentation(exercise);
          const name = cleanExerciseName(resolvedName) || `Exercise ${exercise?.id || ''}`.trim();
          const animationMeta = animation || null;
          const animationMatched = Boolean(animationMeta?.matched);
          const animationUrl = animationMatched ? animationMeta.src : '';
          const animationAlt = animationMatched ? animationMeta.alt : `${name} demonstration`;

          try {
            const insights = await generateExerciseInsights({
              exerciseName: name,
              muscleLabel: muscle.label,
              signal,
            });

            return {
              ...exercise,
              name,
              animationUrl,
              animationAlt,
              animationMeta: animationMeta,
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
              animationUrl,
              animationAlt,
              animationMeta: animationMeta,
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

  return muscles;
}
