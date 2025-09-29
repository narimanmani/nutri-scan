const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const rawApiKey = import.meta.env?.VITE_OPENAI_API_KEY;
const API_KEY = typeof rawApiKey === 'string' ? rawApiKey.trim() : '';

const rawModel = import.meta.env?.VITE_OPENAI_MODEL;
const MODEL = (typeof rawModel === 'string' && rawModel.trim()) || 'gpt-4o-mini';

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

async function callOpenAI(messages, { signal } = {}) {
  assertApiKey();

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
    signal,
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
}

export async function generateExerciseInsights({
  exerciseName,
  muscleLabel,
  experienceLevel = 'intermediate',
  availableEquipment = 'basic gym setup',
  signal,
}) {
  if (!exerciseName) {
    throw new Error('exerciseName is required to request AI insights.');
  }

  const safeMuscle = normalizeString(muscleLabel);

  const result = await callOpenAI(
    [
      {
        role: 'system',
        content:
          'You are a certified strength and conditioning coach who creates safe, effective resistance training workouts. Respond in valid JSON.',
      },
      {
        role: 'user',
        content: `Provide detailed coaching notes for the exercise "${exerciseName}". Assume the trainee has an ${experienceLevel} experience level and access to ${availableEquipment}. If known, emphasize the ${safeMuscle || 'target muscle group'}. Return JSON with the following keys: description (string), recommended_sets (string), recommended_reps (string), tempo (string), rest (string), equipment (string), cues (array of strings), benefits (array of strings), video_urls (array of urls), safety_notes (string). If you are not sure about a field, provide your best professional recommendation.`,
      },
    ],
    { signal }
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

  const result = await callOpenAI(
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
  );

  return {
    focus: normalizeString(result.focus) || '',
    adaptationGoal: normalizeString(result.adaptation_goal) || '',
    warmupTip: normalizeString(result.warmup_tip) || '',
  };
}
