import { generateExerciseInsights, generateSectionOverview } from '@/api/openai.js';

const BASE_URL = 'https://wger.de/api/v2';
const BASE_HOST = BASE_URL.replace(/\/?api\/v2\/?$/, '');

const rawApiKey = import.meta.env?.VITE_WGER_API_KEY;
const API_KEY = typeof rawApiKey === 'string' ? rawApiKey.trim() : '';

const WORKOUT_PAGE_MODULES = import.meta.glob('@/workout/*.html', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const WORKOUT_IMAGE_MODULES = import.meta.glob('@/workout/Images/*', { eager: true, import: 'default' });

const WORKOUT_IMAGE_BY_FILENAME = Object.entries(WORKOUT_IMAGE_MODULES).reduce((acc, [path, url]) => {
  const fileName = path.split('/').pop();
  if (fileName) {
    acc[fileName.toLowerCase()] = url;
  }
  return acc;
}, {});

const FILE_KEY_OVERRIDES = {
  lowerback: 'lower-back',
};

const MANUAL_MUSCLE_SYNONYMS = {
  abdominals: ['abs', 'rectus abdominis', 'core', 'stomach'],
  biceps: ['biceps', 'biceps brachii', 'brachialis', 'upper arm flexors'],
  calves: ['calves', 'calf', 'gastrocnemius', 'soleus'],
  chest: ['chest', 'pectoralis', 'pectoralis major', 'pecs'],
  forearms: ['forearms', 'brachioradialis', 'forearm flexors', 'forearm extensors'],
  glutes: ['glutes', 'gluteus maximus', 'gluteus medius', 'gluteus minimus', 'hips'],
  hamstrings: ['hamstrings', 'biceps femoris', 'semitendinosus', 'semimembranosus', 'posterior chain'],
  lats: ['lats', 'latissimus dorsi', 'back width'],
  'lower-back': ['lower back', 'erector spinae', 'lumbar'],
  obliques: ['obliques', 'external oblique', 'internal oblique', 'side abs'],
  quads: ['quadriceps', 'quads', 'vastus lateralis', 'vastus medialis', 'rectus femoris', 'vastus intermedius'],
  shoulder: ['shoulders', 'shoulder', 'deltoid', 'anterior deltoid', 'lateral deltoid', 'posterior deltoid', 'rear delts', 'front delts'],
  traps: ['trapezius', 'upper trapezius', 'traps'],
  'traps-mid-back': ['middle trapezius', 'trapezius middle', 'mid traps', 'trapezius (middle)'],
  triceps: ['triceps', 'triceps brachii'],
};

const MUSCLE_ID_TO_LIBRARY_KEY = {
  1: 'biceps',
  2: 'shoulder',
  3: 'shoulder',
  4: 'shoulder',
  5: 'biceps',
  6: 'forearms',
  7: 'lats',
  8: 'lats',
  9: 'lower-back',
  10: 'traps',
  11: 'triceps',
  12: 'hamstrings',
  13: 'calves',
  14: 'glutes',
  15: 'obliques',
  16: 'calves',
  17: 'abdominals',
  18: 'shoulder',
  19: 'quads',
  20: 'chest',
  21: 'glutes',
  22: 'quads',
  23: 'traps-mid-back',
};

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

function slugify(value = '') {
  return value
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeLabel(value = '') {
  return value
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value = '') {
  return value.replace(/\s+/g, ' ').trim();
}

function resolveImageUrl(src) {
  if (!src) return '';

  const rawPath = String(src).split('\\').join('/');
  const normalizedPath = cleanText(rawPath).replace(/^\.\/?/, '');
  const fileName = normalizedPath.split('/').pop();
  if (!fileName) {
    return '';
  }

  return WORKOUT_IMAGE_BY_FILENAME[fileName.toLowerCase()] || '';
}

function parseExerciseSection(headingEl, muscleKey, index) {
  if (!headingEl) return null;

  const container = headingEl.closest('.container') || headingEl.parentElement;
  if (!container) return null;

  const title = cleanText(headingEl.textContent || '');
  if (!title) return null;

  const paragraphs = Array.from(container.querySelectorAll('p'))
    .map((p) => cleanText(p.textContent || ''))
    .filter(Boolean);

  let difficulty = '';
  const notes = [];

  for (const paragraph of paragraphs) {
    const match = paragraph.match(/difficulty\s*:\s*(.+)$/i);
    if (match && !difficulty) {
      difficulty = cleanText(match[1]);
    } else if (paragraph && !/^difficulty\s*:/i.test(paragraph)) {
      notes.push(paragraph);
    }
  }

  const instructions = Array.from(container.querySelectorAll('ol li'))
    .map((li) => cleanText(li.textContent || ''))
    .filter(Boolean);

  if (instructions.length === 0) {
    return null;
  }

  const media = Array.from(
    new Set(
      Array.from(container.querySelectorAll('img'))
        .map((img) => resolveImageUrl(img.getAttribute('src')))
        .filter(Boolean)
    )
  );

  const slug = slugify(title) || `exercise-${index + 1}`;
  const id = `${muscleKey}-${slug}`;

  return {
    id,
    slug,
    name: title,
    difficulty,
    instructions,
    notes,
    media,
    baseDescription: instructions.join(' '),
  };
}

function parseWorkoutPage(filePath, html) {
  if (!html) return null;
  if (typeof DOMParser === 'undefined') {
    return null;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const muscleHeading = doc.querySelector('h1');
  const headingText = cleanText(muscleHeading?.textContent || '');

  const baseName = filePath.split('/').pop()?.replace(/\.html$/i, '') || headingText || 'muscle';
  const normalizedBaseName = baseName.toLowerCase();
  const keyOverride = FILE_KEY_OVERRIDES[normalizedBaseName];
  const key = keyOverride || slugify(headingText || baseName);
  const normalizedLabel = normalizeLabel(headingText || baseName);

  const manualSynonyms = MANUAL_MUSCLE_SYNONYMS[key] || [];
  const normalizedSynonyms = Array.from(
    new Set(
      [normalizedLabel, normalizeLabel(baseName), ...manualSynonyms.map((syn) => normalizeLabel(syn))].filter(Boolean)
    )
  );

  const exercises = [];
  const headings = Array.from(doc.querySelectorAll('h2'));
  headings.forEach((headingEl, index) => {
    const exercise = parseExerciseSection(headingEl, key, index);
    if (exercise) {
      exercises.push(exercise);
    }
  });

  if (exercises.length === 0) {
    return null;
  }

  return {
    key,
    label: headingText || baseName,
    normalizedLabel,
    normalizedSynonyms,
    exercises,
  };
}

let workoutLibraryCache = null;

function getWorkoutLibrary() {
  if (workoutLibraryCache) {
    return workoutLibraryCache;
  }

  if (typeof DOMParser === 'undefined') {
    return new Map();
  }

  const library = new Map();
  Object.entries(WORKOUT_PAGE_MODULES).forEach(([path, html]) => {
    const entry = parseWorkoutPage(path, html);
    if (entry) {
      library.set(entry.key, entry);
    }
  });

  workoutLibraryCache = library;
  return library;
}

function findLibraryEntryForMuscle(muscle) {
  const library = getWorkoutLibrary();
  if (!library || library.size === 0) {
    return null;
  }

  const muscleId = muscle?.id;
  if (muscleId != null) {
    const mappedKey = MUSCLE_ID_TO_LIBRARY_KEY[muscleId];
    if (mappedKey && library.has(mappedKey)) {
      return library.get(mappedKey);
    }
  }

  const searchValues = [normalizeLabel(muscle?.libraryKey), normalizeLabel(muscle?.label), normalizeLabel(muscle?.name)];
  const uniqueValues = Array.from(new Set(searchValues.filter(Boolean)));

  for (const value of uniqueValues) {
    for (const entry of library.values()) {
      if (value === entry.normalizedLabel || entry.normalizedSynonyms.includes(value)) {
        return entry;
      }
    }
  }

  for (const value of uniqueValues) {
    for (const entry of library.values()) {
      if (entry.normalizedSynonyms.some((syn) => value.includes(syn) || syn.includes(value))) {
        return entry;
      }
    }
  }

  return null;
}

export async function generateWorkoutPlanFromMuscles(
  muscles,
  { exercisesPerMuscle = 3, signal } = {}
) {
  if (!Array.isArray(muscles) || muscles.length === 0) {
    return [];
  }

  const library = getWorkoutLibrary();
  if (!library || library.size === 0) {
    return muscles.map((muscle) => ({
      muscle,
      exercises: [],
      error: 'The local workout library could not be loaded. Please try again in a supported browser.',
    }));
  }

  const plan = [];
  const seenExerciseIds = new Set();

  for (const muscle of muscles) {
    const libraryEntry = findLibraryEntryForMuscle(muscle);

    if (!libraryEntry) {
      plan.push({
        muscle,
        exercises: [],
        error: 'No matching exercises were found for this muscle in the local library.',
      });
      continue;
    }

    const availableExercises = libraryEntry.exercises.filter((exercise) => !seenExerciseIds.has(exercise.id));

    if (availableExercises.length === 0) {
      plan.push({
        muscle,
        exercises: [],
        error: 'No exercises found for this muscle group.',
      });
      continue;
    }

    const selectedExercises =
      exercisesPerMuscle > 0 ? availableExercises.slice(0, exercisesPerMuscle) : availableExercises;

    selectedExercises.forEach((exercise) => seenExerciseIds.add(exercise.id));

    const enrichedExercises = await Promise.all(
      selectedExercises.map(async (exercise) => {
        const fallbackDescription = exercise.baseDescription || exercise.instructions.join(' ');
        try {
          const insights = await generateExerciseInsights({
            exerciseName: exercise.name,
            muscleLabel: libraryEntry.label || muscle.label,
            instructions: exercise.instructions,
            difficulty: exercise.difficulty,
            additionalNotes: exercise.notes,
            signal,
          });

          return {
            id: exercise.id,
            name: exercise.name,
            description: insights.description || fallbackDescription,
            sets: insights.sets,
            reps: insights.reps,
            tempo: insights.tempo,
            rest: insights.rest,
            equipment: insights.equipment,
            cues: insights.cues,
            benefits: insights.benefits,
            videoUrls: [],
            photoUrls: exercise.media,
            safetyNotes: insights.safetyNotes,
            difficulty: exercise.difficulty,
            librarySteps: exercise.instructions,
            libraryNotes: exercise.notes,
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
            id: exercise.id,
            name: exercise.name,
            description: fallbackDescription,
            sets: '',
            reps: '',
            tempo: '',
            rest: '',
            equipment: '',
            cues: [],
            benefits: [],
            videoUrls: [],
            photoUrls: exercise.media,
            safetyNotes: '',
            detailError: errorMessage,
            difficulty: exercise.difficulty,
            librarySteps: exercise.instructions,
            libraryNotes: exercise.notes,
          };
        }
      })
    );

    let overview = { focus: '', adaptationGoal: '', warmupTip: '' };
    let overviewError = '';

    try {
      overview = await generateSectionOverview({
        muscleLabel: libraryEntry.label || muscle.label,
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
      muscle: {
        ...muscle,
        matchedLibraryKey: libraryEntry.key,
        matchedLibraryLabel: libraryEntry.label,
      },
      exercises: enrichedExercises,
      overview,
      overviewError,
    });
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
