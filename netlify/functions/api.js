const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const {
  ensureSchema,
  seedInitialData,
  query,
  getUserByUsername,
  hashPassword,
  verifyPassword,
  createSession,
  getSession,
  deleteSession,
  ensureMeasurementDefaults
} = require('../lib/database');

const OPENAI_REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS || 20000);
const OPENAI_ANALYSIS_TIMEOUT_MS = Number(
  process.env.OPENAI_ANALYSIS_TIMEOUT_MS || Math.max(OPENAI_REQUEST_TIMEOUT_MS, 25000)
);

const suggestionCache = new Map();
const estimateCache = new Map();
const analysisCache = new Map();

const USDA_API_KEY = process.env.USDA_API_KEY || process.env.FDC_API_KEY || '';
const USDA_API_URL = process.env.USDA_API_URL || 'https://api.nal.usda.gov/fdc/v1';
const USDA_SUGGESTION_TIMEOUT_MS = Number(process.env.USDA_SUGGESTION_TIMEOUT_MS || 4500);
const USDA_SUGGESTION_PAGE_SIZE = Number(process.env.USDA_SUGGESTION_PAGE_SIZE || 20);
const USDA_DATA_TYPES = (process.env.USDA_SUGGESTION_DATA_TYPES
  ? process.env.USDA_SUGGESTION_DATA_TYPES.split(',')
  : ['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded']
).map((value) => value.trim()).filter(Boolean);

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

function canonicalizeUnit(unit) {
  if (typeof unit !== 'string') {
    return 'g';
  }

  const normalized = unit.trim().toLowerCase();
  if (!normalized) {
    return 'g';
  }

  return UNIT_ALIASES[normalized] || (CANONICAL_UNITS.includes(normalized) ? normalized : 'g');
}

function normalizeIngredient(ingredient, index = 0) {
  const safe = ingredient && typeof ingredient === 'object' ? { ...ingredient } : {};
  const normalized = {
    id:
      typeof safe.id === 'string' && safe.id.trim().length > 0
        ? safe.id.trim()
        : `ingredient_${index + 1}`,
    name:
      typeof safe.name === 'string' && safe.name.trim().length > 0
        ? safe.name.trim()
        : `Ingredient ${index + 1}`,
    unit: canonicalizeUnit(safe.unit),
    amount: Number.isFinite(Number(safe.amount)) && Number(safe.amount) >= 0 ? Number(safe.amount) : 0
  };

  for (const field of NUTRIENT_FIELDS) {
    const numeric = Number(safe[field]);
    normalized[field] = Number.isFinite(numeric) ? numeric : 0;
  }

  return normalized;
}

function normalizeMealPayload(raw, { id: forcedId, createdDate: forcedCreatedDate } = {}) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const cloned = { ...raw };
  const sanitized = { ...cloned };

  const id = typeof forcedId === 'string' && forcedId
    ? forcedId
    : typeof sanitized.id === 'string' && sanitized.id.trim().length > 0
      ? sanitized.id.trim()
      : `meal_${crypto.randomUUID()}`;

  sanitized.id = id;

  const rawCreated =
    typeof forcedCreatedDate === 'string' && forcedCreatedDate.trim().length > 0
      ? forcedCreatedDate
      : sanitized.created_date || sanitized.meal_date;

  const createdDate = new Date(rawCreated || Date.now());
  sanitized.created_date = Number.isNaN(createdDate.getTime())
    ? new Date().toISOString()
    : createdDate.toISOString();

  sanitized.meal_date = sanitized.created_date;

  sanitized.meal_name = typeof sanitized.meal_name === 'string' ? sanitized.meal_name.trim() : '';
  sanitized.meal_type =
    typeof sanitized.meal_type === 'string' && sanitized.meal_type.trim().length > 0
      ? sanitized.meal_type.trim().toLowerCase()
      : 'lunch';
  sanitized.analysis_notes =
    typeof sanitized.analysis_notes === 'string' ? sanitized.analysis_notes.trim() : '';
  sanitized.notes = typeof sanitized.notes === 'string' ? sanitized.notes.trim() : '';
  sanitized.photo_url = typeof sanitized.photo_url === 'string' ? sanitized.photo_url : '';

  for (const field of NUTRIENT_FIELDS) {
    const numeric = Number(sanitized[field]);
    sanitized[field] = Number.isFinite(numeric) ? numeric : 0;
  }

  const ingredients = Array.isArray(sanitized.ingredients)
    ? sanitized.ingredients.map((ingredient, index) => normalizeIngredient(ingredient, index)).filter(Boolean)
    : [];

  if (ingredients.length === 0) {
    ingredients.push(
      normalizeIngredient(
        {
          id: 'ingredient_1',
          name: sanitized.meal_name || 'Meal serving',
          unit: 'serving',
          amount: 1,
          ...NUTRIENT_FIELDS.reduce(
            (totals, field) => ({
              ...totals,
              [field]: sanitized[field] || 0
            }),
            {}
          )
        },
        0
      )
    );
  }

  sanitized.ingredients = ingredients;

  return sanitized;
}

const SESSION_COOKIE_NAME = 'nutri_scan_session';
let bootstrapPromise = null;

async function bootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await ensureSchema();
      await seedInitialData(bcrypt);
    })();
  }

  return bootstrapPromise;
}

function parseCookies(header) {
  if (!header || typeof header !== 'string') {
    return {};
  }

  return header.split(';').reduce((accumulator, segment) => {
    const [rawName, ...rawValue] = segment.trim().split('=');
    if (!rawName) {
      return accumulator;
    }

    const name = rawName.trim();
    const value = rawValue.join('=').trim();
    accumulator[name] = decodeURIComponent(value || '');
    return accumulator;
  }, {});
}

function isSecureRequest(event) {
  const forwardedProto =
    event?.headers?.['x-forwarded-proto'] || event?.headers?.['X-Forwarded-Proto'];
  if (forwardedProto) {
    return forwardedProto.split(',')[0].trim() === 'https';
  }

  const origin = event?.headers?.origin || event?.headers?.Origin;
  return typeof origin === 'string' ? origin.startsWith('https://') : false;
}

function serializeSessionCookie(token, expiresAt, secure) {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Expires=${expiresAt.toUTCString()}`
  ];

  if (secure) {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}

function serializeClearCookie(secure) {
  const attributes = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  ];

  if (secure) {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}

async function getAuthenticatedUser(event) {
  const cookieHeader = event?.headers?.cookie || event?.headers?.Cookie;
  const cookies = parseCookies(cookieHeader);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) {
    return null;
  }

  await bootstrap();
  const session = await getSession(token);
  if (!session) {
    return null;
  }

  return {
    id: session.user_id,
    username: session.username,
    role: session.role
  };
}

async function requireUser(event) {
  const user = await getAuthenticatedUser(event);
  if (!user) {
    return { response: jsonResponse(401, { error: 'Authentication required.' }, event) };
  }

  return { user };
}

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
  if (!normalized) {
    return undefined;
  }

  const direct = suggestionCache.get(normalized);
  if (direct) {
    return direct;
  }

  return filterCachedSuggestions(normalized);
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

function cacheAnalysis(signature, payload) {
  if (!signature) {
    return payload;
  }

  analysisCache.set(signature, payload);
  return payload;
}

function getCachedAnalysis(signature) {
  return signature ? analysisCache.get(signature) : undefined;
}

function hashImageDataUrl(imageDataUrl) {
  if (typeof imageDataUrl !== 'string' || imageDataUrl.length === 0) {
    return null;
  }

  try {
    return crypto.createHash('sha1').update(imageDataUrl).digest('hex');
  } catch (error) {
    console.warn('Failed to hash image data URL for analysis cache.', error);
    return null;
  }
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

function truncateText(value, maxLength = 140) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trim()}…`;
}

function dedupeSuggestions(suggestions = []) {
  const seen = new Set();
  const result = [];

  suggestions.forEach((item) => {
    if (!item || typeof item.name !== 'string') {
      return;
    }

    const key = item.name.trim().toLowerCase();
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    result.push(item);
  });

  return result;
}

function normalizeUsdaSuggestion(food, index = 0) {
  if (!food || typeof food !== 'object') {
    return null;
  }

  const description = typeof food.description === 'string' ? food.description.trim() : '';
  if (!description) {
    return null;
  }

  const brandOwner = typeof food.brandOwner === 'string' ? food.brandOwner.trim() : '';
  const dataType = typeof food.dataType === 'string' ? food.dataType.trim() : '';
  const baseName = brandOwner && !description.toLowerCase().includes(brandOwner.toLowerCase())
    ? `${description} (${brandOwner})`
    : description;

  const suggestion = {
    id: food.fdcId ? `usda-${food.fdcId}` : slugify(`${baseName}-${index}`) || `usda_${index}`,
    name: baseName,
    data_source: 'usda'
  };

  const descriptionParts = [];
  if (brandOwner && !baseName.includes(brandOwner)) {
    descriptionParts.push(brandOwner);
  }
  if (dataType) {
    descriptionParts.push(dataType);
  }
  if (typeof food.additionalDescriptions === 'string' && food.additionalDescriptions.trim()) {
    descriptionParts.push(food.additionalDescriptions.trim());
  }
  if (typeof food.ingredients === 'string' && food.ingredients.trim()) {
    descriptionParts.push(`Ingredients: ${truncateText(food.ingredients.trim(), 120)}`);
  }

  if (descriptionParts.length > 0) {
    suggestion.description = truncateText(descriptionParts.join(' • '), 160);
  }

  const servingSize = Number(food.servingSize);
  const servingUnit = canonicalizeUnit(food.servingSizeUnit);

  if (Number.isFinite(servingSize) && servingSize > 0) {
    suggestion.example_portion = servingUnit
      ? `${servingSize} ${servingUnit}`
      : `${servingSize}`;
  }

  if (typeof food.householdServingFullText === 'string' && food.householdServingFullText.trim()) {
    suggestion.example_portion = food.householdServingFullText.trim();
  }

  if (servingUnit && servingUnit !== 'serving') {
    suggestion.typical_unit = servingUnit;
  } else if (typeof food.householdServingFullText === 'string') {
    const match = food.householdServingFullText.match(/\b(g|gram|grams|ml|milliliter|milliliters|cup|cups|oz|ounce|ounces)\b/i);
    if (match) {
      suggestion.typical_unit = canonicalizeUnit(match[0]);
    }
  }

  return suggestion;
}

function filterCachedSuggestions(query) {
  const normalized = typeof query === 'string' ? query.trim().toLowerCase() : '';
  if (!normalized) {
    return undefined;
  }

  for (const [key, payload] of suggestionCache.entries()) {
    if (!key.startsWith(normalized) || !payload || !Array.isArray(payload.suggestions)) {
      continue;
    }

    const filtered = payload.suggestions
      .filter((item) => item?.name && item.name.toLowerCase().includes(normalized))
      .slice(0, DEFAULT_SUGGESTION_LIMIT);

    if (filtered.length > 0) {
      const result = { suggestions: filtered };
      suggestionCache.set(normalized, result);
      return result;
    }
  }

  return undefined;
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

async function fetchUsdaSuggestions(query) {
  if (!USDA_API_KEY || !query) {
    return null;
  }

  const body = {
    query,
    pageSize: USDA_SUGGESTION_PAGE_SIZE,
    requireAllWords: false,
    pageNumber: 1
  };

  if (USDA_DATA_TYPES.length > 0) {
    body.dataType = USDA_DATA_TYPES;
  }

  try {
    const response = await fetchWithTimeout(
      `${USDA_API_URL.replace(/\/$/, '')}/foods/search?api_key=${encodeURIComponent(USDA_API_KEY)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      },
      USDA_SUGGESTION_TIMEOUT_MS
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const message = error?.error?.message || error?.message || response.statusText;
      throw new Error(message || `USDA request failed with status ${response.status}`);
    }

    const payload = await response.json().catch(() => null);
    if (!payload || !Array.isArray(payload.foods)) {
      return { suggestions: [] };
    }

    const suggestions = payload.foods
      .map((food, index) => normalizeUsdaSuggestion(food, index))
      .filter(Boolean);

    return { suggestions: suggestions.slice(0, DEFAULT_SUGGESTION_LIMIT) };
  } catch (error) {
    console.warn('USDA ingredient suggestion request failed.', error);
    return null;
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

  const aggregated = [];

  const usdaResult = await fetchUsdaSuggestions(trimmedQuery).catch(() => null);
  if (usdaResult && Array.isArray(usdaResult.suggestions) && usdaResult.suggestions.length > 0) {
    aggregated.push(...usdaResult.suggestions);
  }

  let aiSuggestions = [];
  if (aggregated.length < DEFAULT_SUGGESTION_LIMIT && process.env.OPENAI_API_KEY) {
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
      aiSuggestions = rawSuggestions
        .map((item, index) => normalizeAiSuggestion(item, index))
        .filter(Boolean);
    } catch (error) {
      console.warn('OpenAI ingredient suggestion request failed. Falling back to cached results.', error);
    }
  }

  aggregated.push(...aiSuggestions);

  let finalSuggestions = dedupeSuggestions(aggregated).slice(0, DEFAULT_SUGGESTION_LIMIT);

  if (finalSuggestions.length === 0) {
    finalSuggestions = fallbackSuggestions(trimmedQuery);
  }

  return cacheSuggestions(query, { suggestions: finalSuggestions.slice(0, DEFAULT_SUGGESTION_LIMIT) });
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
  const fallback = { url: imageDataUrl, key: null, stored: false };

  let store;
  try {
    store = getStore({ name: process.env.MEAL_PHOTO_STORE || 'meal-photos' });
  } catch (error) {
    console.warn('Netlify Blob storage is not available. Falling back to inline photo URLs.', error);
    return fallback;
  }

  if (!store || typeof store.set !== 'function') {
    console.warn('Netlify Blob storage client is missing required methods. Using inline photo URL.');
    return fallback;
  }

  const key = `meals/${Date.now()}-${Math.random().toString(36).slice(2)}.${extensionFromMime(mimeType)}`;

  try {
    await store.set(key, buffer, {
      visibility: 'public',
      contentType: mimeType,
      metadata: {
        createdAt: new Date().toISOString()
      }
    });

    if (typeof store.getPublicUrl === 'function') {
      const publicUrl = store.getPublicUrl(key);
      if (publicUrl) {
        return { url: publicUrl, key, stored: true };
      }
    }

    console.warn('Meal photo stored but no public URL was returned. Using inline URL.');
  } catch (error) {
    console.warn('Failed to persist meal photo in Netlify Blob storage. Using inline photo URL instead.', error);
    return fallback;
  }

  return fallback;
}

async function analyzeWithOpenAI({ imageDataUrl }) {
  const cacheKey = hashImageDataUrl(imageDataUrl);
  const cached = getCachedAnalysis(cacheKey);
  if (cached) {
    return cached;
  }

  const fallback = ensureNumbers(MOCK_RESPONSE);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn('OPENAI_API_KEY is not configured. Using mock analysis response.');
    return cacheAnalysis(cacheKey, fallback);
  }

  const payload = {
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
  };

  let response;
  try {
    response = await fetchWithTimeout(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      },
      OPENAI_ANALYSIS_TIMEOUT_MS
    );
  } catch (error) {
    console.error('OpenAI meal analysis request failed.', error);
    return cacheAnalysis(cacheKey, fallback);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('OpenAI meal analysis responded with an error.', error);
    return cacheAnalysis(cacheKey, fallback);
  }

  const data = await response.json().catch((error) => {
    console.error('Failed to parse OpenAI analysis response JSON.', error);
    return null;
  });

  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    console.warn('The OpenAI API did not return any analysis content. Falling back to cached data.');
    return cacheAnalysis(cacheKey, fallback);
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    console.error('Failed to parse OpenAI response, falling back to mock data.', error);
    return cacheAnalysis(cacheKey, fallback);
  }

  return cacheAnalysis(cacheKey, ensureNumbers(parsed));
}

function jsonResponse(statusCode, body, event = null, extraHeaders = {}) {
  const origin = event?.headers?.origin || event?.headers?.Origin || '*';
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': origin,
    ...extraHeaders
  };

  if (origin !== '*') {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  const shouldOmitBody = [204, 205, 304].includes(statusCode);
  if (shouldOmitBody) {
    return { statusCode, headers };
  }

  return {
    statusCode,
    headers,
    body: JSON.stringify(body ?? {})
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

async function handleRequest(event) {
  const subPath = resolveSubPath(event);

  const origin = event.headers?.origin || event.headers?.Origin || '*';

  if (event.httpMethod === 'OPTIONS') {
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (origin !== '*') {
      headers['Access-Control-Allow-Credentials'] = 'true';
    }

    return {
      statusCode: 204,
      headers
    };
  }

  const segments = subPath.split('/').filter(Boolean);

  if (subPath === '/auth/register' && event.httpMethod === 'POST') {
    await bootstrap();

    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (error) {
      return jsonResponse(400, { error: 'Invalid request payload.' }, event);
    }

    const username = String(payload.username || '').trim().toLowerCase();
    const password = String(payload.password || '');

    if (username.length < 3) {
      return jsonResponse(400, { error: 'Username must be at least 3 characters long.' }, event);
    }

    if (password.length < 8) {
      return jsonResponse(400, { error: 'Password must be at least 8 characters long.' }, event);
    }

    const existing = await getUserByUsername(username);
    if (existing) {
      return jsonResponse(409, { error: 'Username already exists.' }, event);
    }

    const passwordHash = await hashPassword(password, bcrypt);
    const userId = crypto.randomUUID();
    const { rows } = await query(
      'INSERT INTO users (id, username, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, role',
      [userId, username, passwordHash, 'user']
    );

    const user = rows[0];
    await ensureMeasurementDefaults(user.id);
    const { token, expiresAt } = await createSession(user.id);
    const cookie = serializeSessionCookie(token, expiresAt, isSecureRequest(event));

    return jsonResponse(201, { user }, event, { 'Set-Cookie': cookie });
  }

  if (subPath === '/auth/login' && event.httpMethod === 'POST') {
    await bootstrap();

    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (error) {
      return jsonResponse(400, { error: 'Invalid request payload.' }, event);
    }

    const username = String(payload.username || '').trim().toLowerCase();
    const password = String(payload.password || '');

    if (!username || !password) {
      return jsonResponse(400, { error: 'Username and password are required.' }, event);
    }

    const user = await getUserByUsername(username);
    if (!user) {
      return jsonResponse(401, { error: 'Invalid credentials.' }, event);
    }

    const isValid = await verifyPassword(password, user.password_hash, bcrypt);
    if (!isValid) {
      return jsonResponse(401, { error: 'Invalid credentials.' }, event);
    }

    await ensureMeasurementDefaults(user.id);
    const { token, expiresAt } = await createSession(user.id);
    const cookie = serializeSessionCookie(token, expiresAt, isSecureRequest(event));

    return jsonResponse(
      200,
      { user: { id: user.id, username: user.username, role: user.role } },
      event,
      { 'Set-Cookie': cookie }
    );
  }

  if (subPath === '/auth/logout' && event.httpMethod === 'POST') {
    const cookieHeader = event.headers?.cookie || event.headers?.Cookie;
    const cookies = parseCookies(cookieHeader);
    const token = cookies[SESSION_COOKIE_NAME];
    if (token) {
      await bootstrap();
      await deleteSession(token);
    }

    const clearCookie = serializeClearCookie(isSecureRequest(event));
    return jsonResponse(200, { success: true }, event, { 'Set-Cookie': clearCookie });
  }

  if (subPath === '/auth/me' && event.httpMethod === 'GET') {
    const user = await getAuthenticatedUser(event);
    if (!user) {
      return jsonResponse(401, { error: 'Unauthenticated.' }, event);
    }

    return jsonResponse(200, { user }, event);
  }

  if (segments[0] === 'meals') {
    await bootstrap();
    const auth = await requireUser(event);
    if (auth.response) {
      return auth.response;
    }

    const { user } = auth;

    if (segments.length === 1 && event.httpMethod === 'GET') {
      const limitParam = event.queryStringParameters?.limit;
      const parsedLimit = Number.parseInt(limitParam, 10);
      const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 500)) : null;
      const orderParam = event.queryStringParameters?.order || '-created_at';
      const direction = orderParam.startsWith('-') ? 'DESC' : 'ASC';

      const params = [user.id];
      let sql = `SELECT payload FROM meals WHERE user_id = $1 ORDER BY created_at ${direction}`;
      if (limit) {
        params.push(limit);
        sql += ` LIMIT $${params.length}`;
      }

      const { rows } = await query(sql, params);
      const meals = rows.map((row) => row.payload);
      return jsonResponse(200, { data: meals }, event);
    }

    if (segments.length === 1 && event.httpMethod === 'POST') {
      let payload;
      try {
        payload = JSON.parse(event.body || '{}');
      } catch (error) {
        return jsonResponse(400, { error: 'Invalid request payload.' }, event);
      }

      if (!payload || typeof payload !== 'object') {
        return jsonResponse(400, { error: 'Meal payload is required.' }, event);
      }

      const mealId = `meal_${crypto.randomUUID()}`;
      const normalized = normalizeMealPayload(payload, {
        id: mealId,
        createdDate: payload.created_date || payload.meal_date
      });

      if (!normalized) {
        return jsonResponse(400, { error: 'Meal payload is required.' }, event);
      }

      const createdAt = new Date(normalized.created_date);
      const createdTimestamp = Number.isNaN(createdAt.getTime()) ? new Date() : createdAt;

      try {
        await query(
          'INSERT INTO meals (id, user_id, payload, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
          [mealId, user.id, normalized, createdTimestamp, new Date()]
        );
      } catch (error) {
        console.error('Failed to persist meal for user', user.id, error);
        return jsonResponse(500, { error: 'Unable to save the meal right now. Please try again.' }, event);
      }

      return jsonResponse(201, { data: normalized }, event);
    }

    if (segments.length === 2) {
      const mealId = decodeURIComponent(segments[1]);

      if (event.httpMethod === 'GET') {
        const { rows } = await query(
          'SELECT payload FROM meals WHERE id = $1 AND user_id = $2',
          [mealId, user.id]
        );
        if (rows.length === 0) {
          return jsonResponse(404, { error: 'Meal not found.' }, event);
        }

        return jsonResponse(200, { data: rows[0].payload }, event);
      }

      if (event.httpMethod === 'PUT') {
        const { rows } = await query(
          'SELECT payload FROM meals WHERE id = $1 AND user_id = $2',
          [mealId, user.id]
        );

        if (rows.length === 0) {
          return jsonResponse(404, { error: 'Meal not found.' }, event);
        }

        let updates;
        try {
          updates = JSON.parse(event.body || '{}');
        } catch (error) {
          return jsonResponse(400, { error: 'Invalid request payload.' }, event);
        }

        const existing = rows[0].payload;
        const normalized = normalizeMealPayload(
          { ...existing, ...updates },
          {
            id: existing.id,
            createdDate: updates?.created_date || existing.created_date
          }
        );

        try {
          await query(
            'UPDATE meals SET payload = $1, updated_at = $2 WHERE id = $3 AND user_id = $4',
            [normalized, new Date(), mealId, user.id]
          );
        } catch (error) {
          console.error('Failed to update meal for user', user.id, 'and meal', mealId, error);
          return jsonResponse(500, { error: 'Unable to update the meal right now. Please try again.' }, event);
        }

        return jsonResponse(200, { data: normalized }, event);
      }

      if (event.httpMethod === 'DELETE') {
        await query('DELETE FROM meals WHERE id = $1 AND user_id = $2', [mealId, user.id]);
        return jsonResponse(200, { success: true }, event);
      }
    }
  }

  if (segments[0] === 'diet-plans') {
    await bootstrap();
    const auth = await requireUser(event);
    if (auth.response) {
      return auth.response;
    }

    const { user } = auth;

    if (segments.length === 1 && event.httpMethod === 'GET') {
      const { rows } = await query(
        'SELECT payload, is_active FROM diet_plans WHERE user_id = $1 ORDER BY created_at DESC',
        [user.id]
      );

      const plans = rows.map((row) => ({ ...row.payload, isActive: row.is_active }));
      return jsonResponse(200, { data: plans }, event);
    }

    if (segments.length === 1 && event.httpMethod === 'POST') {
      let payload;
      try {
        payload = JSON.parse(event.body || '{}');
      } catch (error) {
        return jsonResponse(400, { error: 'Invalid request payload.' }, event);
      }

      if (!payload || typeof payload !== 'object') {
        return jsonResponse(400, { error: 'Diet plan payload is required.' }, event);
      }

      const planId = `diet_plan_${crypto.randomUUID()}`;
      const now = new Date();
      const nowIso = now.toISOString();
      const isActive = Boolean(payload.isActive);
      const normalized = {
        ...payload,
        id: planId,
        isActive,
        created_at: nowIso,
        updated_at: nowIso
      };

      await query(
        'INSERT INTO diet_plans (id, user_id, payload, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [planId, user.id, normalized, isActive, now, now]
      );

      if (isActive) {
        await query(
          "UPDATE diet_plans SET is_active = false, payload = jsonb_set(payload, '{isActive}', 'false'::jsonb, true), updated_at = now() WHERE user_id = $1 AND id <> $2",
          [user.id, planId]
        );
      }

      return jsonResponse(201, { data: normalized }, event);
    }

    if (segments.length === 2 && segments[1] === 'active' && event.httpMethod === 'GET') {
      const { rows } = await query(
        'SELECT payload FROM diet_plans WHERE user_id = $1 AND is_active = true ORDER BY updated_at DESC LIMIT 1',
        [user.id]
      );

      if (rows.length === 0) {
        return jsonResponse(200, { data: null }, event);
      }

      return jsonResponse(200, { data: rows[0].payload }, event);
    }

    if (segments.length === 3 && segments[2] === 'activate' && event.httpMethod === 'POST') {
      const planId = decodeURIComponent(segments[1]);

      const { rows } = await query(
        'SELECT id FROM diet_plans WHERE id = $1 AND user_id = $2',
        [planId, user.id]
      );

      if (rows.length === 0) {
        return jsonResponse(404, { error: 'Diet plan not found.' }, event);
      }

      await query(
        "UPDATE diet_plans SET is_active = false, payload = jsonb_set(payload, '{isActive}', 'false'::jsonb, true), updated_at = now() WHERE user_id = $1",
        [user.id]
      );

      await query(
        "UPDATE diet_plans SET is_active = true, payload = jsonb_set(payload, '{isActive}', 'true'::jsonb, true), updated_at = now() WHERE id = $1 AND user_id = $2",
        [planId, user.id]
      );

      const { rows: updated } = await query(
        'SELECT payload FROM diet_plans WHERE id = $1 AND user_id = $2',
        [planId, user.id]
      );

      return jsonResponse(200, { data: updated[0]?.payload || null }, event);
    }

    if (segments.length === 2) {
      const planId = decodeURIComponent(segments[1]);

      if (event.httpMethod === 'GET') {
        const { rows } = await query(
          'SELECT payload, is_active FROM diet_plans WHERE id = $1 AND user_id = $2',
          [planId, user.id]
        );

        if (rows.length === 0) {
          return jsonResponse(404, { error: 'Diet plan not found.' }, event);
        }

        const row = rows[0];
        return jsonResponse(200, { data: { ...row.payload, isActive: row.is_active } }, event);
      }

      if (event.httpMethod === 'PUT') {
        const { rows } = await query(
          'SELECT payload FROM diet_plans WHERE id = $1 AND user_id = $2',
          [planId, user.id]
        );

        if (rows.length === 0) {
          return jsonResponse(404, { error: 'Diet plan not found.' }, event);
        }

        let updates;
        try {
          updates = JSON.parse(event.body || '{}');
        } catch (error) {
          return jsonResponse(400, { error: 'Invalid request payload.' }, event);
        }

        const now = new Date();
        const existing = rows[0].payload;
        const next = {
          ...existing,
          ...updates,
          id: existing.id,
          created_at: existing.created_at,
          updated_at: now.toISOString()
        };
        const isActive = typeof updates.isActive === 'boolean' ? updates.isActive : existing.isActive;
        next.isActive = isActive;

        await query(
          'UPDATE diet_plans SET payload = $1, is_active = $2, updated_at = $3 WHERE id = $4 AND user_id = $5',
          [next, isActive, now, planId, user.id]
        );

        if (isActive) {
          await query(
            "UPDATE diet_plans SET is_active = false, payload = jsonb_set(payload, '{isActive}', 'false'::jsonb, true), updated_at = now() WHERE user_id = $1 AND id <> $2",
            [user.id, planId]
          );
        }

        return jsonResponse(200, { data: next }, event);
      }
    }
  }

  if (segments[0] === 'measurement' && segments[1] === 'layout') {
    await bootstrap();
    const auth = await requireUser(event);
    if (auth.response) {
      return auth.response;
    }

    const { user } = auth;
    await ensureMeasurementDefaults(user.id);

    if (event.httpMethod === 'GET') {
      const { rows } = await query(
        'SELECT positions FROM measurement_layouts WHERE user_id = $1',
        [user.id]
      );

      return jsonResponse(200, { positions: rows[0]?.positions || null }, event);
    }

    if (event.httpMethod === 'PUT') {
      let payload;
      try {
        payload = JSON.parse(event.body || '{}');
      } catch (error) {
        return jsonResponse(400, { error: 'Invalid request payload.' }, event);
      }

      const positions = payload?.positions && typeof payload.positions === 'object' ? payload.positions : payload;

      if (!positions || typeof positions !== 'object') {
        return jsonResponse(400, { error: 'positions object is required.' }, event);
      }

      await query(
        'INSERT INTO measurement_layouts (user_id, positions, updated_at) VALUES ($1, $2, now()) ON CONFLICT (user_id) DO UPDATE SET positions = EXCLUDED.positions, updated_at = EXCLUDED.updated_at',
        [user.id, positions]
      );

      return jsonResponse(200, { positions }, event);
    }
  }

  if (segments[0] === 'measurement' && segments[1] === 'history') {
    await bootstrap();
    const auth = await requireUser(event);
    if (auth.response) {
      return auth.response;
    }

    const { user } = auth;

    if (event.httpMethod === 'GET') {
      const { rows } = await query(
        'SELECT entry FROM measurement_history WHERE user_id = $1 ORDER BY recorded_at DESC',
        [user.id]
      );

      const entries = rows.map((row) => row.entry);
      return jsonResponse(200, { data: entries }, event);
    }

    if (event.httpMethod === 'POST') {
      let entry;
      try {
        entry = JSON.parse(event.body || '{}');
      } catch (error) {
        return jsonResponse(400, { error: 'Invalid request payload.' }, event);
      }

      if (!entry || typeof entry !== 'object') {
        return jsonResponse(400, { error: 'Measurement entry is required.' }, event);
      }

      const id = entry.id && typeof entry.id === 'string' ? entry.id : `measurement_${crypto.randomUUID()}`;
      const recordedAt = entry.recordedAt || new Date().toISOString();
      entry.id = id;
      entry.recordedAt = recordedAt;
      const recordedDate = new Date(recordedAt);
      const timestamp = Number.isNaN(recordedDate.getTime()) ? new Date() : recordedDate;

      await query(
        'INSERT INTO measurement_history (id, user_id, entry, recorded_at) VALUES ($1, $2, $3, $4)',
        [crypto.randomUUID(), user.id, entry, timestamp]
      );

      return jsonResponse(201, { data: entry }, event);
    }
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
}

exports.handler = async function handler(event) {
  try {
    return await handleRequest(event);
  } catch (error) {
    console.error('Unhandled API error:', error);
    return jsonResponse(500, { error: 'Internal server error.' }, event);
  }
};
