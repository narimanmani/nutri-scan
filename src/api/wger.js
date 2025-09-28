const BASE_URL = 'https://wger.de/api/v2';

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
    ...options,
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

      plan.push({
        muscle,
        exercises: uniqueExercises.slice(0, exercisesPerMuscle),
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
