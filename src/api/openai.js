const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const rawApiKey = import.meta.env?.VITE_OPENAI_API_KEY;
const API_KEY = typeof rawApiKey === 'string' ? rawApiKey.trim() : '';

const rawModel = import.meta.env?.VITE_OPENAI_MODEL;
const MODEL = (typeof rawModel === 'string' && rawModel.trim()) || 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = Number(import.meta.env?.VITE_OPENAI_TIMEOUT_MS || 20000);

const exerciseInsightsCache = new Map();
const sectionOverviewCache = new Map();

function composeAbortSignals(signalA, signalB) {
  if (!signalA) return signalB;
  if (!signalB) return signalA;
  if (signalA === signalB) return signalA;

  const controller = new AbortController();

  const abortFromSignal = (sourceSignal) => {
    if (controller.signal.aborted) {
      return;
    }

    const reason =
      typeof sourceSignal.reason !== 'undefined'
        ? sourceSignal.reason
        : typeof DOMException === 'function'
          ? new DOMException('Aborted', 'AbortError')
          : new Error('Aborted');
    controller.abort(reason);
  };

  if (signalA.aborted) {
    abortFromSignal(signalA);
  } else {
    signalA.addEventListener('abort', () => abortFromSignal(signalA), { once: true });
  }

  if (signalB.aborted) {
    abortFromSignal(signalB);
  } else {
    signalB.addEventListener('abort', () => abortFromSignal(signalB), { once: true });
  }

  return controller.signal;
}

function normalizeCacheString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

function normalizeCacheList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => normalizeCacheString(entry)).filter(Boolean);
}

function buildExerciseInsightCacheKey({
  exerciseName,
  muscleLabel,
  experienceLevel,
  availableEquipment,
  instructions,
  difficulty,
  additionalNotes,
}) {
  const parts = [
    normalizeCacheString(exerciseName),
    normalizeCacheString(muscleLabel),
    normalizeCacheString(experienceLevel),
    normalizeCacheString(availableEquipment),
    normalizeCacheString(difficulty),
  ];

  const normalizedInstructions = normalizeCacheList(instructions);
  if (normalizedInstructions.length > 0) {
    parts.push(normalizedInstructions.join('|'));
  }

  const normalizedNotes = normalizeCacheList(additionalNotes);
  if (normalizedNotes.length > 0) {
    parts.push(normalizedNotes.join('|'));
  }

  return parts.filter(Boolean).join('::');
}

function buildSectionOverviewCacheKey({ muscleLabel, exerciseNames }) {
  const normalizedMuscle = normalizeCacheString(muscleLabel);
  const normalizedExercises = normalizeCacheList(exerciseNames).sort();
  return [normalizedMuscle, normalizedExercises.join('|')].filter(Boolean).join('::');
}

function getOrCreateCachedValue(cache, key, factory) {
  if (!key) {
    return factory();
  }

  if (cache.has(key)) {
    const cached = cache.get(key);
    if (cached && typeof cached.then === 'function') {
      return cached;
    }
    return Promise.resolve(cached);
  }

  const promise = Promise.resolve()
    .then(factory)
    .then((value) => {
      cache.set(key, value);
      return value;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, promise);
  return promise;
}

function assertApiKey() {
  if (!API_KEY) {
    const error = new Error('OpenAI API key is not configured. Set VITE_OPENAI_API_KEY.');
    error.code = 'OPENAI_API_KEY_MISSING';
    throw error;
  }
}

function scrubJson(raw = '') {
  if (typeof raw !== 'string') {
    return '';
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  return trimmed;
}

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeString(entry))
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === 'string') {
    return value
      .split(/\n|\r|,/) // allow comma or line separated fallback
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return [];
}

async function callOpenAI(messages, { signal, timeoutMs } = {}) {
  assertApiKey();

  const effectiveTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;

  let timeoutController;
  let timeoutId;
  let didTimeout = false;

  if (effectiveTimeout > 0 && Number.isFinite(effectiveTimeout)) {
    timeoutController = new AbortController();
    timeoutId = setTimeout(() => {
      didTimeout = true;
      timeoutController.abort();
    }, effectiveTimeout);
  }

  const combinedSignal = timeoutController
    ? composeAbortSignals(signal, timeoutController.signal)
    : signal;

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages,
      }),
      signal: combinedSignal,
    });

    if (!response.ok) {
      const error = new Error(`OpenAI request failed with status ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const cleaned = scrubJson(content);

    if (!cleaned) {
      const error = new Error('OpenAI response did not include content.');
      error.code = 'OPENAI_EMPTY_RESPONSE';
      throw error;
    }

    try {
      return JSON.parse(cleaned);
    } catch (err) {
      const parseError = new Error('Unable to parse OpenAI response as JSON.');
      parseError.cause = err;
      parseError.code = 'OPENAI_PARSE_ERROR';
      throw parseError;
    }
  } catch (error) {
    if (didTimeout) {
      const timeoutError = new Error('OpenAI request timed out.');
      timeoutError.name = 'AbortError';
      timeoutError.code = 'OPENAI_REQUEST_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function generateExerciseInsights({
  exerciseName,
  muscleLabel,
  experienceLevel = 'intermediate',
  availableEquipment = 'basic gym setup',
  instructions = [],
  difficulty,
  additionalNotes = [],
  signal,
}) {
  if (!exerciseName) {
    throw new Error('exerciseName is required to request AI insights.');
  }

  const safeMuscle = normalizeString(muscleLabel);
  const normalizedDifficulty = normalizeString(difficulty);
  const normalizedInstructions = Array.isArray(instructions)
    ? instructions.map((step) => normalizeString(step)).filter(Boolean)
    : [];
  const normalizedNotes = Array.isArray(additionalNotes)
    ? additionalNotes.map((note) => normalizeString(note)).filter(Boolean)
    : [];

  const referenceLines = [];

  if (normalizedDifficulty) {
    referenceLines.push(`Difficulty: ${normalizedDifficulty}.`);
  }

  if (normalizedInstructions.length > 0) {
    const steps = normalizedInstructions.map((step, index) => `${index + 1}. ${step}`).join('\n');
    referenceLines.push(`Steps to reference:\n${steps}`);
  }

  if (normalizedNotes.length > 0) {
    referenceLines.push(`Additional context: ${normalizedNotes.join(' ')}`);
  }

  const referenceText =
    referenceLines.length > 0
      ? `\n\nReference details from our exercise library:\n${referenceLines.join('\n')}`
      : '';
  const cacheKey = buildExerciseInsightCacheKey({
    exerciseName,
    muscleLabel,
    experienceLevel,
    availableEquipment,
    instructions,
    difficulty,
    additionalNotes,
  });

  const result = await getOrCreateCachedValue(exerciseInsightsCache, cacheKey, () =>
    callOpenAI(
      [
        {
          role: 'system',
          content:
            'You are a certified strength and conditioning coach who creates safe, effective resistance training workouts. Respond in valid JSON.',
        },
        {
          role: 'user',
          content: `Provide detailed coaching notes for the exercise "${exerciseName}". Assume the trainee has an ${experienceLevel} experience level and access to ${availableEquipment}. Focus on the ${
            safeMuscle || 'target muscle group'
          }. Use the reference material when crafting your guidance.${referenceText}\n\nRespond in JSON with the following keys: description (string), recommended_sets (string), recommended_reps (string), tempo (string), rest (string), equipment (string), cues (array of strings), benefits (array of strings), video_urls (array of urls), safety_notes (string). Ensure the cues and benefits are practical and rooted in the reference information.`,
        },
      ],
      { signal }
    )
  );

  return {
    description: normalizeString(result.description) || '',
    sets: normalizeString(result.recommended_sets) || '',
    reps: normalizeString(result.recommended_reps) || '',
    tempo: normalizeString(result.tempo) || '',
    rest: normalizeString(result.rest) || '',
    equipment: normalizeString(result.equipment) || '',
    cues: normalizeStringArray(result.cues),
    benefits: normalizeStringArray(result.benefits),
    videoUrls: normalizeStringArray(result.video_urls),
    safetyNotes: normalizeString(result.safety_notes) || '',
  };
}

export async function generateSectionOverview({ muscleLabel, exerciseNames = [], signal }) {
  const exercisesList = Array.isArray(exerciseNames) ? exerciseNames.filter(Boolean) : [];
  const cacheKey = buildSectionOverviewCacheKey({ muscleLabel, exerciseNames: exercisesList });

  const result = await getOrCreateCachedValue(sectionOverviewCache, cacheKey, () =>
    callOpenAI(
      [
        {
          role: 'system',
          content:
            'You are a knowledgeable strength coach summarizing focused resistance training blocks. Respond in valid JSON.',
        },
        {
          role: 'user',
          content: `Create a concise training focus summary for a workout block targeting the ${muscleLabel ||
            'selected muscle group'}. The block should include the following exercises: ${
            exercisesList.length > 0 ? exercisesList.join(', ') : 'a mix of complementary movements'
          }. Return JSON with keys: focus (string), adaptation_goal (string), warmup_tip (string).`,
        },
      ],
      { signal }
    )
  );

  return {
    focus: normalizeString(result.focus) || '',
    adaptationGoal: normalizeString(result.adaptation_goal) || '',
    warmupTip: normalizeString(result.warmup_tip) || '',
  };
}
