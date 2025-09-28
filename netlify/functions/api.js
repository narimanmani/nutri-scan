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

const USDA_API_KEY = process.env.USDA_API_KEY;
const USDA_TIMEOUT_MS = Number(process.env.INGREDIENT_API_TIMEOUT_MS || 8000);
const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const USDA_FOOD_URL = 'https://api.nal.usda.gov/fdc/v1/food';
const DEFAULT_SUGGESTION_LIMIT = 7;

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
      vitamin_a: 0
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

async function fetchUsdaSuggestions(query) {
  if (!USDA_API_KEY) {
    return { suggestions: fallbackSuggestions(query) };
  }

  const cached = getCachedSuggestions(query);
  if (cached) {
    return cached;
  }

  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return cacheSuggestions(query, { suggestions: [] });
  }

  const searchUrl = `${USDA_SEARCH_URL}?api_key=${USDA_API_KEY}`;
  const body = {
    query: query.trim(),
    pageSize: 10,
    sortBy: 'dataType.keyword',
    sortOrder: 'desc',
    requireAllWords: false,
    dataType: ['Branded', 'Survey (FNDDS)', 'SR Legacy', 'Foundation']
  };

  try {
    const response = await fetchWithTimeout(
      searchUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      USDA_TIMEOUT_MS
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.warn('USDA ingredient suggestion request returned an error. Using fallback data.', error);
      return cacheSuggestions(query, { suggestions: fallbackSuggestions(query) });
    }

    const data = await response.json();
    const foods = Array.isArray(data?.foods) ? data.foods : [];
    const suggestions = foods
      .map((food) => formatUsdaSuggestion(food))
      .filter(Boolean)
      .slice(0, DEFAULT_SUGGESTION_LIMIT);

    if (suggestions.length === 0) {
      return cacheSuggestions(query, { suggestions: fallbackSuggestions(query) });
    }

    return cacheSuggestions(query, { suggestions });
  } catch (error) {
    console.warn('USDA ingredient suggestion request failed. Using fallback data.', error);
    return cacheSuggestions(query, { suggestions: fallbackSuggestions(query) });
  }
}

function safeRound(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

function gramsFromServing(amount, unit, food) {
  const normalizedUnit = canonicalizeUnit(unit);
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return null;
  }

  if (normalizedUnit === 'g' || normalizedUnit === 'ml') {
    return numericAmount;
  }

  if (normalizedUnit === 'oz') {
    return numericAmount * 28.3495;
  }

  if (normalizedUnit === 'cup') {
    const portion = findPortionGramWeight(food, (text) => text.includes('cup'));
    if (portion) {
      return numericAmount * portion;
    }
    return numericAmount * 240;
  }

  if (normalizedUnit === 'serving') {
    const portion = findPortionGramWeight(food);
    if (portion) {
      return numericAmount * portion;
    }
  }

  return numericAmount * (FALLBACK_UNIT_TO_GRAMS[normalizedUnit] || 1);
}

function findPortionGramWeight(food, matcher) {
  if (!Array.isArray(food?.foodPortions)) {
    return null;
  }

  const predicate = typeof matcher === 'function' ? matcher : () => true;

  for (const portion of food.foodPortions) {
    const description = `${portion.modifier || ''} ${portion.measureUnitAbbreviation || ''} ${portion.portionDescription || ''}`
      .trim()
      .toLowerCase();

    if (!description && matcher) {
      continue;
    }

    if (!matcher || predicate(description)) {
      const weight = Number(portion.gramWeight);
      if (Number.isFinite(weight) && weight > 0) {
        return weight;
      }
    }
  }

  return null;
}

function extractNutrientsFromFood(food) {
  const perGram = {};
  let referenceGrams = null;

  if (food?.labelNutrients && Number.isFinite(Number(food?.servingSize))) {
    const grams = gramsFromServing(food.servingSize, food.servingSizeUnit, food);
    if (Number.isFinite(grams) && grams > 0) {
      referenceGrams = grams;

      const ln = food.labelNutrients;
      if (ln.calories?.value != null) {
        perGram.calories = ln.calories.value / grams;
      }
      if (ln.protein?.value != null) {
        perGram.protein = ln.protein.value / grams;
      }
      if (ln.carbohydrates?.value != null) {
        perGram.carbs = ln.carbohydrates.value / grams;
      }
      if (ln.fat?.value != null) {
        perGram.fat = ln.fat.value / grams;
      }
      if (ln.fiber?.value != null) {
        perGram.fiber = ln.fiber.value / grams;
      }
      if (ln.sugars?.value != null) {
        perGram.sugar = ln.sugars.value / grams;
      }
      if (ln.sodium?.value != null) {
        perGram.sodium = ln.sodium.value / grams;
      }
      if (ln.potassium?.value != null) {
        perGram.potassium = ln.potassium.value / grams;
      }
      if (ln.calcium?.value != null) {
        perGram.calcium = ln.calcium.value / grams;
      }
      if (ln.iron?.value != null) {
        perGram.iron = ln.iron.value / grams;
      }
      if (ln.vitaminC?.value != null) {
        perGram.vitamin_c = ln.vitaminC.value / grams;
      }
      if (ln.vitaminA?.value != null) {
        perGram.vitamin_a = ln.vitaminA.value / grams;
      }
    }
  }

  if (!referenceGrams && Array.isArray(food?.foodNutrients)) {
    const nutrientMap = {
      calories: ['energy'],
      protein: ['protein'],
      carbs: ['carbohydrate, by difference'],
      fat: ['total lipid (fat)'],
      fiber: ['fiber, total dietary'],
      sugar: ['sugars, total', 'sugars, total including nlea'],
      sodium: ['sodium, na'],
      potassium: ['potassium, k'],
      calcium: ['calcium, ca'],
      iron: ['iron, fe'],
      vitamin_c: ['vitamin c, total ascorbic acid'],
      vitamin_a: ['vitamin a, iu', 'vitamin a, rae']
    };

    for (const [field, names] of Object.entries(nutrientMap)) {
      const match = food.foodNutrients.find((nutrient) => {
        const name = nutrient?.nutrientName?.toLowerCase();
        return name && names.includes(name);
      });

      if (match && Number.isFinite(Number(match.amount))) {
        perGram[field] = Number(match.amount) / 100;
      }
    }

    referenceGrams = 100;
  }

  return { perGram, referenceGrams };
}

function scaleNutrients(perGram, grams) {
  const result = {
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
    vitamin_a: 0
  };

  Object.entries(perGram || {}).forEach(([key, value]) => {
    if (result.hasOwnProperty(key)) {
      result[key] = safeRound((Number(value) || 0) * grams);
    }
  });

  return result;
}

function formatUsdaSuggestion(food) {
  if (!food || !food.fdcId || !food.description) {
    return null;
  }

  const descriptionParts = [];
  if (food.brandOwner) {
    descriptionParts.push(food.brandOwner);
  } else if (food.brandName) {
    descriptionParts.push(food.brandName);
  }

  if (food.dataType) {
    descriptionParts.push(food.dataType);
  }

  const portionText = food.householdServingFullText || formatServingText(food);
  if (portionText) {
    descriptionParts.push(`Serving: ${portionText}`);
  }

  const typicalUnit = canonicalizeUnit(food.servingSizeUnit) || 'g';
  const examplePortion = portionText || (food.servingSize ? `${food.servingSize} ${food.servingSizeUnit || typicalUnit}` : null);

  return {
    id: String(food.fdcId),
    fdcId: food.fdcId,
    name: titleCase(food.description),
    description: descriptionParts.join(' • ') || undefined,
    typical_unit: typicalUnit,
    example_portion: examplePortion || undefined,
    data_source: 'usda'
  };
}

function formatServingText(food) {
  if (!Number.isFinite(Number(food?.servingSize))) {
    return null;
  }

  const unit = food.servingSizeUnit || '';
  return `${food.servingSize} ${unit}`.trim();
}

function titleCase(text) {
  return text
    ? text
        .toLowerCase()
        .split(' ')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    : text;
}

async function fetchUsdaFoodDetails(fdcId) {
  if (!USDA_API_KEY || !fdcId) {
    return null;
  }

  const url = `${USDA_FOOD_URL}/${fdcId}?api_key=${USDA_API_KEY}`;

  try {
    const response = await fetchWithTimeout(url, {}, USDA_TIMEOUT_MS);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.warn('USDA ingredient detail request returned an error.', error);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn('USDA ingredient detail request failed.', error);
    return null;
  }
}

async function estimateIngredientWithUsda({ ingredientName, amount, unit, fdcId }) {
  const normalizedUnit = canonicalizeUnit(unit);
  const safeAmount = Number(amount) || 0;
  const normalizedName = typeof ingredientName === 'string' ? ingredientName.trim() : '';
  const cacheKey = fdcId ? `${fdcId}|${safeAmount}|${normalizedUnit}` : normalizedName ? `${normalizedName}|${safeAmount}|${normalizedUnit}` : null;

  const cached = getCachedEstimate(cacheKey);
  if (cached) {
    return cached;
  }

  if (safeAmount <= 0) {
    return cacheEstimate(cacheKey, fallbackEstimate({ ingredientName, amount: safeAmount, unit: normalizedUnit }));
  }

  const detail = await fetchUsdaFoodDetails(fdcId);

  if (!detail) {
    return cacheEstimate(cacheKey, fallbackEstimate({ ingredientName, amount: safeAmount, unit: normalizedUnit }));
  }

  const { perGram, referenceGrams } = extractNutrientsFromFood(detail);

  if (!perGram || Object.keys(perGram).length === 0) {
    return cacheEstimate(cacheKey, fallbackEstimate({ ingredientName, amount: safeAmount, unit: normalizedUnit }));
  }

  const grams = gramsFromServing(safeAmount, normalizedUnit, detail) || referenceGrams || safeAmount;
  const nutrients = scaleNutrients(perGram, grams);

  return cacheEstimate(cacheKey, {
    name: detail.description ? titleCase(detail.description) : ingredientName || 'Ingredient',
    amount: safeAmount,
    unit: normalizedUnit,
    ...nutrients
  });
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
        const { ingredientName, amount, unit, fdcId } = payload;

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

        const estimate = await estimateIngredientWithUsda({
          ingredientName,
          amount: numericAmount,
          unit,
          fdcId
        });

        return jsonResponse(200, { data: estimate });
      }

      const { query = '' } = payload;
      const suggestions = await fetchUsdaSuggestions(query);
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
