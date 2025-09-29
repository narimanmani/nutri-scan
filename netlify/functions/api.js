const { getStore } = require('@netlify/blobs');

const OPENAI_REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS || 8000);

const suggestionCache = new Map();
const estimateCache = new Map();

const ANALYSIS_SCHEMA = {
  name: 'meal_analysis',
  schema: {
    type: 'object',
    properties: {
      meal_name: { type: 'string', description: 'Descriptive name for the meal or dish.' },
      calories: { type: 'number', description: 'Estimated calories for the entire meal.' },
      protein: { type: 'number', description: 'Estimated grams of protein.' },
      carbs: { type: 'number', description: 'Estimated grams of carbohydrates.' },
      fat: { type: 'number', description: 'Estimated grams of fat.' },
      fiber: { type: 'number', description: 'Estimated grams of fiber.' },
      sugar: { type: 'number', description: 'Estimated grams of sugar.' },
      sodium: { type: 'number', description: 'Estimated milligrams of sodium.' },
      potassium: { type: 'number', description: 'Estimated milligrams of potassium.' },
      calcium: { type: 'number', description: 'Estimated milligrams of calcium.' },
      iron: { type: 'number', description: 'Estimated milligrams of iron.' },
      vitamin_c: { type: 'number', description: 'Estimated milligrams of vitamin C.' },
      vitamin_a: { type: 'number', description: 'Estimated IU of vitamin A.' },
      ingredients: {
        type: 'array',
        description: 'Individual ingredients or components detected in the meal with portion estimates.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique identifier for the ingredient row.' },
            name: { type: 'string', description: 'Ingredient or component name.' },
            amount: { type: 'number', description: 'Detected portion amount for this ingredient.' },
            unit: {
              type: 'string',
              description: 'Unit for the detected amount (grams for solids, milliliters for liquids).'
            },
            calories: { type: 'number', description: 'Calories contributed by this ingredient.' },
            protein: { type: 'number', description: 'Protein grams contributed by this ingredient.' },
            carbs: { type: 'number', description: 'Carbohydrate grams contributed by this ingredient.' },
            fat: { type: 'number', description: 'Fat grams contributed by this ingredient.' },
            fiber: { type: 'number', description: 'Fiber grams contributed by this ingredient.' },
            sugar: { type: 'number', description: 'Sugar grams contributed by this ingredient.' },
            sodium: { type: 'number', description: 'Sodium milligrams contributed by this ingredient.' },
            potassium: { type: 'number', description: 'Potassium milligrams contributed by this ingredient.' },
            calcium: { type: 'number', description: 'Calcium milligrams contributed by this ingredient.' },
            iron: { type: 'number', description: 'Iron milligrams contributed by this ingredient.' },
            vitamin_c: { type: 'number', description: 'Vitamin C milligrams contributed by this ingredient.' },
            vitamin_a: { type: 'number', description: 'Vitamin A IU contributed by this ingredient.' }
          },
          required: ['name', 'amount', 'unit']
        }
      },
      analysis_notes: { type: 'string', description: 'Short narrative explaining the analysis and assumptions.' }
    },
    required: ['meal_name', 'calories']
  }
};

const CANONICAL_UNITS = ['g', 'ml', 'oz', 'cup', 'serving'];

const UNIT_ALIASES = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  "g (grams)": 'g',
  kilogram: 'g',
  kilograms: 'g',
  kg: 'g',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  'ml (milliliters)': 'ml',
  liter: 'ml',
  liters: 'ml',
  litre: 'ml',
  litres: 'ml',
  l: 'ml',
  ounce: 'oz',
  ounces: 'oz',
  'fl oz': 'oz',
  oz: 'oz',
  cup: 'cup',
  cups: 'cup',
  serving: 'serving',
  servings: 'serving',
  portion: 'serving',
  portions: 'serving'
};

const NUTRIENT_FIELDS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'fiber',
  'sugar',
  'sodium',
  'potassium',
  'calcium',
  'iron',
  'vitamin_c',
  'vitamin_a'
];

const DEFAULT_SUGGESTION_LIMIT = 7;
const OPENAI_SUGGESTION_MODEL = process.env.OPENAI_SUGGESTION_MODEL || 'gpt-4o-mini';
const OPENAI_NUTRITION_MODEL =
  process.env.OPENAI_NUTRITION_MODEL || process.env.OPENAI_SUGGESTION_MODEL || 'gpt-4o-mini';

const SUGGESTION_RESPONSE_SCHEMA = {
  name: 'ingredient_suggestions',
  schema: {
    type: 'object',
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Stable identifier for the suggestion.' },
            name: { type: 'string', description: 'Ingredient name a person might type.' },
            description: {
              type: 'string',
              description: 'Short clarifying details such as preparation or brand.'
            },
            typical_unit: {
              type: 'string',
              description: 'Most common measuring unit such as g, cup, serving, or ml.'
            },
            example_portion: {
              type: 'string',
              description: 'Example portion string like “85 g” or “1 cup”.'
            }
          },
          required: ['name']
        }
      }
    },
    required: ['suggestions']
  }
};

const INGREDIENT_ESTIMATE_SCHEMA = {
  name: 'ingredient_estimate',
  schema: {
    type: 'object',
    properties: NUTRIENT_FIELDS.reduce((acc, field) => {
      acc[field] = { type: 'number' };
      return acc;
    }, {}),
    required: ['calories']
  }
};

function canonicalizeUnit(unit) {
  if (typeof unit !== 'string') {
    return 'g';
  }

  const normalized = unit.trim().toLowerCase();
  if (normalized.length === 0) {
    return 'g';
  }

  const mapped = UNIT_ALIASES[normalized];
  if (mapped) {
    return mapped;
  }

  return CANONICAL_UNITS.includes(normalized) ? normalized : 'g';
}

const FALLBACK_INGREDIENTS = [
  {
    id: 'fallback-chicken-breast',
    fdcId: null,
    name: 'Grilled chicken breast',
    description: 'Boneless, skinless breast cooked without breading.',
    typical_unit: 'g',
    example_portion: '85 g',
    data_source: 'fallback',
    perGram: { calories: 1.65, protein: 0.31, carbs: 0, fat: 0.04, fiber: 0, sugar: 0 }
  },
  {
    id: 'fallback-broccoli',
    fdcId: null,
    name: 'Steamed broccoli florets',
    description: 'Broccoli cooked with steam and no added butter or oil.',
    typical_unit: 'g',
    example_portion: '90 g',
    data_source: 'fallback',
    perGram: { calories: 0.35, protein: 0.028, carbs: 0.07, fat: 0.003, fiber: 0.028, sugar: 0.015 }
  },
  {
    id: 'fallback-brown-rice',
    fdcId: null,
    name: 'Cooked brown rice',
    description: 'Whole-grain brown rice cooked in water.',
    typical_unit: 'cup',
    example_portion: '1 cup',
    data_source: 'fallback',
    perGram: { calories: 1.11, protein: 0.024, carbs: 0.23, fat: 0.009, fiber: 0.018, sugar: 0.002 }
  },
  {
    id: 'fallback-avocado',
    fdcId: null,
    name: 'Avocado',
    description: 'Fresh Hass avocado, raw.',
    typical_unit: 'g',
    example_portion: '50 g',
    data_source: 'fallback',
    perGram: { calories: 1.6, protein: 0.02, carbs: 0.084, fat: 0.15, fiber: 0.067, sugar: 0.03 }
  },
  {
    id: 'fallback-greek-yogurt',
    fdcId: null,
    name: 'Greek yogurt (plain, nonfat)',
    description: 'Unsweetened nonfat strained yogurt.',
    typical_unit: 'g',
    example_portion: '170 g (6 oz)',
    data_source: 'fallback',
    perGram: { calories: 0.59, protein: 0.1, carbs: 0.038, fat: 0.002, fiber: 0, sugar: 0.029 }
  }
];

const FALLBACK_UNIT_TO_GRAMS = {
  g: 1,
  ml: 1,
  oz: 28.3495,
  cup: 240,
  serving: 100
};

const MOCK_RESPONSE = {
  meal_name: 'Grilled Chicken Salad',
  analysis_notes:
    'Estimated values based on grilled chicken breast with mixed greens, cherry tomatoes, avocado, and a light vinaigrette.',
  ingredients: [
    {
      id: 'ingredient_chicken',
      name: 'Grilled chicken breast',
      amount: 150,
      unit: 'g',
      calories: 248,
      protein: 46,
      carbs: 0,
      fat: 5.3,
      fiber: 0,
      sugar: 0,
      sodium: 440,
      potassium: 440,
      calcium: 12,
      iron: 1.2,
      vitamin_c: 0,
      vitamin_a: 21
    },
    {
      id: 'ingredient_greens',
      name: 'Mixed greens & vegetables',
      amount: 120,
      unit: 'g',
      calories: 80,
      protein: 4,
      carbs: 12,
      fat: 2,
      fiber: 4,
      sugar: 6,
      sodium: 120,
      potassium: 360,
      calcium: 110,
      iron: 1.6,
      vitamin_c: 32,
      vitamin_a: 610
    },
    {
      id: 'ingredient_dressing',
      name: 'Avocado vinaigrette',
      amount: 45,
      unit: 'ml',
      calories: 192,
      protein: 0,
      carbs: 4,
      fat: 14.7,
      fiber: 4,
      sugar: 3,
      sodium: 160,
      potassium: 180,
      calcium: 18,
      iron: 0.4,
      vitamin_c: 10,
      vitamin_a: 119
    }
  ]
};

function normalizeIngredient(ingredient, index = 0) {
  const safe = typeof ingredient === 'object' && ingredient !== null ? { ...ingredient } : {};
  const normalized = {
    id: typeof safe.id === 'string' && safe.id.length > 0 ? safe.id : `ingredient_${Date.now()}_${index}`,
    name:
      typeof safe.name === 'string' && safe.name.length > 0
        ? safe.name
        : `Ingredient ${index + 1}`,
    unit: canonicalizeUnit(safe.unit),
    amount: Number(safe.amount) || 0
  };

  NUTRIENT_FIELDS.forEach((field) => {
    const parsed = Number(safe[field]);
    normalized[field] = Number.isFinite(parsed) ? parsed : 0;
  });

  return normalized;
}

function sumNutrients(ingredients) {
  return ingredients.reduce(
    (totals, ingredient) => {
      NUTRIENT_FIELDS.forEach((field) => {
        totals[field] += Number(ingredient[field]) || 0;
      });
      return totals;
    },
    NUTRIENT_FIELDS.reduce((acc, field) => ({ ...acc, [field]: 0 }), {})
  );
}

function ensureNumbers(payload) {
  const result = { ...payload };

  const normalizedIngredients = Array.isArray(result.ingredients)
    ? result.ingredients.map((ingredient, index) => normalizeIngredient(ingredient, index))
    : [];

  if (normalizedIngredients.length === 0) {
    normalizedIngredients.push(normalizeIngredient({
      name: result.meal_name || 'Meal serving',
      unit: 'serving',
      amount: 1,
      ...NUTRIENT_FIELDS.reduce((acc, field) => ({ ...acc, [field]: Number(result[field]) || 0 }), {})
    }, 0));
  }

  result.ingredients = normalizedIngredients;

  const totals = sumNutrients(normalizedIngredients);
  NUTRIENT_FIELDS.forEach((field) => {
    result[field] = totals[field];
  });

  return result;
}

function fallbackSuggestions(query) {
  if (!query || typeof query !== 'string') {
    return FALLBACK_INGREDIENTS.slice(0, 7);
  }

  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return FALLBACK_INGREDIENTS.slice(0, 7);
  }

  const matches = FALLBACK_INGREDIENTS.filter((item) =>
    item.name.toLowerCase().includes(normalized)
  );

  return (matches.length > 0 ? matches : FALLBACK_INGREDIENTS).slice(0, 7);
}

function fallbackEstimate({ ingredientName, amount, unit }) {
  const normalizedName = typeof ingredientName === 'string' ? ingredientName.trim().toLowerCase() : '';
  const match = FALLBACK_INGREDIENTS.find((item) =>
    item.name.toLowerCase() === normalizedName || item.name.toLowerCase().includes(normalizedName)
  );

  const safeAmount = Number(amount) || 0;
  const safeUnit = canonicalizeUnit(unit);

  if (!match || safeAmount <= 0) {
    return {
      name: ingredientName || 'Ingredient',
      amount: safeAmount,
      unit: safeUnit,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
      sodium: 0,
      potassium: 0,
      calcium: 0,
      iron: 0,
      vitamin_c: 0,
      vitamin_a: 0,
      data_source: 'fallback'
    };
  }

  const gramsEquivalent = safeAmount * (FALLBACK_UNIT_TO_GRAMS[safeUnit] || 1);
  const estimate = { name: match.name, amount: safeAmount, unit: safeUnit };

  Object.entries(match.perGram).forEach(([key, perGram]) => {
    estimate[key] = Number((perGram * gramsEquivalent).toFixed(2));
  });

  [
    'calories',
    'protein',
    'carbs',
    'fat',
    'fiber',
    'sugar',
    'sodium',
    'potassium',
    'calcium',
    'iron',
    'vitamin_c',
    'vitamin_a'
  ].forEach((field) => {
    if (estimate[field] == null) {
      estimate[field] = 0;
    }
  });

  estimate.data_source = 'fallback';
  return estimate;
}

function cacheSuggestions(query, payload) {
  const normalized = typeof query === 'string' ? query.trim().toLowerCase() : '';
  if (!normalized) {
    return payload;
  }

  suggestionCache.set(normalized, payload);
  return payload;
}

function getCachedSuggestions(query) {
  const normalized = typeof query === 'string' ? query.trim().toLowerCase() : '';
  return normalized ? suggestionCache.get(normalized) : undefined;
}

function cacheEstimate(signature, payload) {
  if (!signature) {
    return payload;
  }

  estimateCache.set(signature, payload);
  return payload;
}

function getCachedEstimate(signature) {
  return signature ? estimateCache.get(signature) : undefined;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = OPENAI_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
      timeoutError.code = 'TIMEOUT';
      throw timeoutError;
    }
    throw error;
  }
}

function slugify(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeAiSuggestion(rawSuggestion, index = 0) {
  if (!rawSuggestion) {
    return null;
  }

  const name = typeof rawSuggestion.name === 'string' ? rawSuggestion.name.trim() : '';
  if (!name) {
    return null;
  }

  const baseId =
    typeof rawSuggestion.id === 'string' && rawSuggestion.id.trim().length > 0
      ? rawSuggestion.id.trim()
      : slugify(`${name}-${index}`) || `suggestion_${index}`;

  const suggestion = {
    id: baseId,
    name,
    data_source: 'openai'
  };

  if (typeof rawSuggestion.description === 'string' && rawSuggestion.description.trim()) {
    suggestion.description = rawSuggestion.description.trim();
  }

  if (typeof rawSuggestion.example_portion === 'string' && rawSuggestion.example_portion.trim()) {
    suggestion.example_portion = rawSuggestion.example_portion.trim();
  }

  if (typeof rawSuggestion.typical_unit === 'string' && rawSuggestion.typical_unit.trim()) {
    suggestion.typical_unit = canonicalizeUnit(rawSuggestion.typical_unit);
  }

  return suggestion;
}

async function callOpenAiForJson({ messages, schema, model = 'gpt-4o-mini', timeoutMs = OPENAI_REQUEST_TIMEOUT_MS }) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages,
        response_format: { type: 'json_schema', json_schema: schema }
      })
    },
    timeoutMs
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error?.message || `OpenAI request failed with status ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('OpenAI response did not include any content.');
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error('Failed to parse OpenAI response JSON.');
  }
}

async function fetchAiSuggestions(query) {
  const cached = getCachedSuggestions(query);
  if (cached) {
    return cached;
  }

  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return cacheSuggestions(query, { suggestions: [] });
  }

  const trimmedQuery = query.trim();

  if (!process.env.OPENAI_API_KEY) {
    return cacheSuggestions(query, { suggestions: fallbackSuggestions(trimmedQuery) });
  }

  try {
    const result = await callOpenAiForJson({
      messages: [
        {
          role: 'system',
          content:
            'You help people log meals by suggesting closely related ingredients based on their partial input. Return relevant whole foods or packaged ingredients without recipes.'
        },
        {
          role: 'user',
          content: `Suggest up to ${DEFAULT_SUGGESTION_LIMIT} ingredient ideas matching "${trimmedQuery}". Focus on realistic grocery or kitchen items and include preparation details when helpful.`
        }
      ],
      schema: SUGGESTION_RESPONSE_SCHEMA,
      model: OPENAI_SUGGESTION_MODEL
    });

    const rawSuggestions = Array.isArray(result?.suggestions) ? result.suggestions : [];
    const suggestions = rawSuggestions
      .map((item, index) => normalizeAiSuggestion(item, index))
      .filter(Boolean)
      .slice(0, DEFAULT_SUGGESTION_LIMIT);

    if (suggestions.length === 0) {
      return cacheSuggestions(query, { suggestions: fallbackSuggestions(trimmedQuery) });
    }

    return cacheSuggestions(query, { suggestions });
  } catch (error) {
    console.warn('OpenAI ingredient suggestion request failed. Using fallback data.', error);
    return cacheSuggestions(query, { suggestions: fallbackSuggestions(trimmedQuery) });
  }
}

function safeRound(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

async function estimateIngredientWithOpenAi({ ingredientName, amount, unit, suggestionId }) {
  const normalizedUnit = canonicalizeUnit(unit);
  const numericAmount = Number(amount);
  const normalizedName = typeof ingredientName === 'string' ? ingredientName.trim() : '';

  const cacheKey = suggestionId
    ? `${suggestionId}|${numericAmount}|${normalizedUnit}`
    : normalizedName
      ? `${normalizedName.toLowerCase()}|${numericAmount}|${normalizedUnit}`
      : null;

  const cached = getCachedEstimate(cacheKey);
  if (cached) {
    return cached;
  }

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return cacheEstimate(
      cacheKey,
      fallbackEstimate({ ingredientName: normalizedName, amount: numericAmount, unit: normalizedUnit })
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return cacheEstimate(
      cacheKey,
      fallbackEstimate({ ingredientName: normalizedName, amount: numericAmount, unit: normalizedUnit })
    );
  }

  try {
    const result = await callOpenAiForJson({
      messages: [
        {
          role: 'system',
          content:
            'You are a meticulous nutrition scientist. Estimate calories and detailed nutrients for single ingredients and typical grocery items. Use grams for macros, milligrams for minerals (vitamin_a in IU), and respond with zero if unsure.'
        },
        {
          role: 'user',
          content: `Ingredient: ${normalizedName || 'Unknown ingredient'}\nAmount: ${numericAmount}\nUnit: ${normalizedUnit}\nReturn the nutrient values for this portion.`
        }
      ],
      schema: INGREDIENT_ESTIMATE_SCHEMA,
      model: OPENAI_NUTRITION_MODEL
    });

    const estimate = {
      name: normalizedName || 'Ingredient',
      amount: numericAmount,
      unit: normalizedUnit,
      data_source: 'openai'
    };

    NUTRIENT_FIELDS.forEach((field) => {
      estimate[field] = safeRound(Number(result?.[field]));
    });

    return cacheEstimate(cacheKey, estimate);
  } catch (error) {
    console.warn('OpenAI ingredient estimate request failed. Using fallback data.', error);
    return cacheEstimate(
      cacheKey,
      fallbackEstimate({ ingredientName: normalizedName, amount: numericAmount, unit: normalizedUnit })
    );
  }
}

function parseImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
    throw new Error('A data URL is required to store the photo.');
  }

  const matches = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!matches) {
    throw new Error('The provided image is not a valid base64 data URL.');
  }

  const mimeType = matches[1];
  const base64 = matches[2];
  const buffer = Buffer.from(base64, 'base64');

  return { mimeType, buffer };
}

function extensionFromMime(mimeType) {
  if (!mimeType) {
    return 'png';
  }

  const [, subtype] = mimeType.split('/');
  if (subtype === 'jpeg') {
    return 'jpg';
  }
  if (subtype) {
    return subtype.split('+')[0];
  }
  return 'png';
}

async function storeMealPhoto(imageDataUrl) {
  const { mimeType, buffer } = parseImageDataUrl(imageDataUrl);

  let store;
  try {
    store = getStore({ name: process.env.MEAL_PHOTO_STORE || 'meal-photos' });
  } catch (error) {
    throw new Error('Unable to access Netlify Blob storage.');
  }

  if (!store) {
    throw new Error('Netlify Blob store is not configured.');
  }

  const key = `meals/${Date.now()}-${Math.random().toString(36).slice(2)}.${extensionFromMime(mimeType)}`;

  await store.set(key, buffer, {
    visibility: 'public',
    contentType: mimeType,
    metadata: {
      createdAt: new Date().toISOString(),
    },
  });

  const publicUrl = store.getPublicUrl(key);
  if (!publicUrl) {
    throw new Error('Unable to generate a public URL for the uploaded photo.');
  }

  return { url: publicUrl, key };
}

async function analyzeWithOpenAI({ imageDataUrl }) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn('OPENAI_API_KEY is not configured. Using mock analysis response.');
    return ensureNumbers(MOCK_RESPONSE);
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a registered dietitian that analyses meals from photos and provides complete nutritional breakdowns.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this food image and return a detailed nutritional estimate. Use realistic portion sizes.'
            },
            {
              type: 'image_url',
              image_url: {
                url: imageDataUrl
              }
            }
          ]
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: ANALYSIS_SCHEMA
      }
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || 'The OpenAI API returned an unexpected error.');
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('The OpenAI API did not return any analysis content.');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    console.error('Failed to parse OpenAI response, falling back to mock data.', error);
    return ensureNumbers(MOCK_RESPONSE);
  }

  return ensureNumbers(parsed);
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(body)
  };
}

function resolveSubPath(event) {
  const rawPath = typeof event?.path === 'string' ? event.path : '';

  if (!rawPath) {
    return '/';
  }

  const withoutFunctionPrefix = rawPath.replace(/^\/\.netlify\/functions\/api/, '');
  const withoutApiPrefix = withoutFunctionPrefix.replace(/^\/api/, '');
  const normalized = withoutApiPrefix.length > 0 ? withoutApiPrefix : '/';

  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

exports.handler = async function handler(event) {
  const subPath = resolveSubPath(event);

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    };
  }

  if (subPath === '/analyze' && event.httpMethod === 'POST') {
    try {
      const payload = JSON.parse(event.body || '{}');
      const { imageDataUrl } = payload;

      if (!imageDataUrl) {
        return jsonResponse(400, { error: 'imageDataUrl is required.' });
      }

      const analysis = await analyzeWithOpenAI({ imageDataUrl });
      return jsonResponse(200, { data: analysis });
    } catch (error) {
      console.error('Failed to analyze meal image via Netlify function:', error);
      return jsonResponse(500, { error: error.message || 'Failed to analyze the meal image.' });
    }
  }

  if (subPath === '/ingredient-suggestions' && event.httpMethod === 'POST') {
    try {
      const payload = JSON.parse(event.body || '{}');
      const { type = 'suggestions' } = payload;

      if (type === 'estimate') {
        const { ingredientName, amount, unit, suggestionId } = payload;

        if (!ingredientName || typeof ingredientName !== 'string') {
          return jsonResponse(400, { error: 'ingredientName is required.' });
        }

        if (!unit) {
          return jsonResponse(400, { error: 'unit is required.' });
        }

        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
          return jsonResponse(400, { error: 'amount must be a positive number.' });
        }

        const estimate = await estimateIngredientWithOpenAi({
          ingredientName,
          amount: numericAmount,
          unit,
          suggestionId
        });

        return jsonResponse(200, { data: estimate });
      }

      const { query = '' } = payload;
      const suggestions = await fetchAiSuggestions(query);
      return jsonResponse(200, { data: suggestions });
    } catch (error) {
      console.error('Failed to provide ingredient suggestions via Netlify function:', error);
      return jsonResponse(500, { error: error.message || 'Failed to fetch ingredient suggestions.' });
    }
  }

  if (subPath === '/upload-photo' && event.httpMethod === 'POST') {
    try {
      const payload = JSON.parse(event.body || '{}');
      const { imageDataUrl } = payload;

      if (!imageDataUrl) {
        return jsonResponse(400, { error: 'imageDataUrl is required.' });
      }

      try {
        const { url, key } = await storeMealPhoto(imageDataUrl);
        return jsonResponse(200, { url, key });
      } catch (error) {
        console.error('Failed to store meal photo in Netlify Blobs:', error);
        return jsonResponse(502, {
          error: error.message || 'Unable to store the meal photo at this time.',
        });
      }
    } catch (error) {
      console.error('Invalid upload-photo payload:', error);
      return jsonResponse(400, { error: 'Invalid request payload.' });
    }
  }

  return jsonResponse(404, { error: 'Not found.' });
};
