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

export async function fetchExerciseDetails(exerciseId, { signal } = {}) {
  if (!exerciseId) {
    throw new Error('An exercise id is required to fetch details.');
  }

  const data = await fetchJson(`${BASE_URL}/exerciseinfo/${exerciseId}/`, { signal });

  const videos = Array.isArray(data?.videos)
    ? data.videos
        .map((video) => {
          const id = video?.id || `${exerciseId}-video-${video?.video || ''}`;
          const url = toAbsoluteAssetUrl(video?.video || '');
          if (!url) {
            return null;
          }
          return {
            id,
            url,
          };
        })
        .filter(Boolean)
    : [];

  const images = Array.isArray(data?.images)
    ? data.images
        .map((image) => {
          const id = image?.id || `${exerciseId}-image-${image?.image || ''}`;
          const url = toAbsoluteAssetUrl(image?.image || '');
          if (!url) {
            return null;
          }
          return {
            id,
            url,
            isMain: Boolean(image?.is_main),
          };
        })
        .filter(Boolean)
    : [];

  return {
    id: data?.id || exerciseId,
    name: data?.name,
    description: data?.description,
    videos,
    images,
  };
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
          try {
            const details = await fetchExerciseDetails(exercise.id, { signal });
            return {
              ...exercise,
              description: details.description || exercise.description || '',
              videos: details.videos,
              images: details.images,
            };
          } catch (detailError) {
            if (detailError.name === 'AbortError') {
              throw detailError;
            }

            return {
              ...exercise,
              description: exercise.description || '',
              videos: [],
              images: [],
              detailError: detailError.message || 'Unable to load media for this exercise.',
            };
          }
        })
      );

      plan.push({
        muscle,
        exercises: enrichedExercises,
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw error;
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
