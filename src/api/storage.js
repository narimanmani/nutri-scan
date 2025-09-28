import mealsSeed from '@/data/meals.json';

const NETLIFY_UPLOAD_ENDPOINT = '/api/upload-photo';

const STORAGE_KEY = 'nutri-scan:meals';
let cachedMeals = null;

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

function generateId() {
  const globalCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeIngredient(ingredient, index = 0) {
  const safe = typeof ingredient === 'object' && ingredient !== null ? { ...ingredient } : {};
  const normalized = {
    id: typeof safe.id === 'string' && safe.id.length > 0 ? safe.id : `ingredient_${generateId()}`,
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

function normalizeIngredients(ingredients = []) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return [];
  }

  return ingredients.map((ingredient, index) => normalizeIngredient(ingredient, index));
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

function withDefaults(meal) {
  const ingredients = normalizeIngredients(meal.ingredients);
  const totals = ingredients.length > 0 ? sumNutrients(ingredients) : null;

  const base = {
    id: meal.id || `meal_${generateId()}`,
    meal_name: '',
    meal_type: 'lunch',
    analysis_notes: '',
    notes: '',
    photo_url: '',
    created_date: new Date().toISOString(),
    ...meal,
    ingredients
  };

  NUTRIENT_FIELDS.forEach((field) => {
    const provided = Number(base[field]);
    base[field] = Number.isFinite(provided)
      ? provided
      : totals
        ? totals[field]
        : 0;
  });

  if (totals) {
    NUTRIENT_FIELDS.forEach((field) => {
      base[field] = totals[field];
    });
  }

  if (!Array.isArray(base.ingredients) || base.ingredients.length === 0) {
    base.ingredients = [
      normalizeIngredient(
        {
          name: base.meal_name || 'Meal serving',
          unit: 'serving',
          amount: 1,
          ...NUTRIENT_FIELDS.reduce(
            (acc, field) => ({
              ...acc,
              [field]: Number.isFinite(Number(base[field])) ? Number(base[field]) : 0
            }),
            {}
          )
        },
        0
      )
    ];
  }

  return base;
}

async function uploadPhotoIfNeeded(photoUrl) {
  if (typeof photoUrl !== 'string' || photoUrl.length === 0) {
    return '';
  }

  // Skip uploads for already hosted images.
  if (!photoUrl.startsWith('data:')) {
    return photoUrl;
  }

  try {
    const response = await fetch(NETLIFY_UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ imageDataUrl: photoUrl })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to store the photo on Netlify.');
    }

    const payload = await response.json();
    if (payload?.url) {
      return payload.url;
    }
  } catch (error) {
    console.warn('Falling back to inline photo URL after Netlify upload error:', error);
  }

  return photoUrl;
}

function readFromLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.warn('Unable to read meals from localStorage:', error);
    return null;
  }
}

function writeToLocalStorage(meals) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meals));
  } catch (error) {
    console.warn('Unable to persist meals to localStorage:', error);
  }
}

function hydrateSeedData() {
  return mealsSeed.map((meal) => {
    const createdDate = meal.created_date
      ?? (meal.meal_date ? new Date(meal.meal_date).toISOString() : new Date().toISOString());

    return withDefaults({
      ...meal,
      created_date: createdDate
    });
  });
}

async function getMeals() {
  if (cachedMeals) {
    return cachedMeals;
  }

  const stored = readFromLocalStorage();
  if (stored && Array.isArray(stored)) {
    cachedMeals = stored.map(withDefaults);
    return cachedMeals;
  }

  cachedMeals = hydrateSeedData();
  writeToLocalStorage(cachedMeals);
  return cachedMeals;
}

export async function listMeals(order = '-created_date', limit) {
  const meals = await getMeals();
  const sortValue = typeof order === 'string' && order.length > 0 ? order : '-created_date';
  const direction = sortValue.startsWith('-') ? -1 : 1;
  const key = sortValue.replace('-', '') || 'created_date';

  const sorted = [...meals].sort((a, b) => {
    const aValue = new Date(a[key] || a.created_date || 0).getTime();
    const bValue = new Date(b[key] || b.created_date || 0).getTime();
    return (aValue - bValue) * direction;
  });

  return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
}

export async function createMeal(meal) {
  const meals = await getMeals();
  const storedPhotoUrl = await uploadPhotoIfNeeded(meal.photo_url);
  const newMeal = withDefaults({
    ...meal,
    id: `meal_${generateId()}`,
    created_date: new Date().toISOString(),
    photo_url: storedPhotoUrl
  });

  meals.unshift(newMeal);
  cachedMeals = meals;
  writeToLocalStorage(meals);
  return newMeal;
}

export async function getMealById(id) {
  if (!id) {
    return null;
  }

  const meals = await getMeals();
  const found = meals.find((meal) => meal.id === id);
  return found ? withDefaults(found) : null;
}

export async function updateMeal(id, updates = {}) {
  if (!id) {
    throw new Error('An id is required to update a meal.');
  }

  const meals = await getMeals();
  const index = meals.findIndex((meal) => meal.id === id);

  if (index === -1) {
    throw new Error('Meal not found.');
  }

  const existing = meals[index];
  const nextPhotoSource =
    typeof updates.photo_url === 'string' && updates.photo_url.length > 0
      ? updates.photo_url
      : existing.photo_url;
  const storedPhotoUrl = await uploadPhotoIfNeeded(nextPhotoSource);

  const updatedMeal = withDefaults({
    ...existing,
    ...updates,
    id: existing.id,
    created_date: existing.created_date,
    photo_url: storedPhotoUrl
  });

  meals[index] = updatedMeal;
  cachedMeals = meals;
  writeToLocalStorage(meals);
  return updatedMeal;
}

export async function clearMeals() {
  cachedMeals = hydrateSeedData();
  writeToLocalStorage(cachedMeals);
  return cachedMeals;
}
