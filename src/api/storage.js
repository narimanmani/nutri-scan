import mealsSeed from '@/data/meals.json';
import dietPlansSeed from '@/data/dietPlans.json';

const NETLIFY_UPLOAD_ENDPOINT = '/api/upload-photo';

const STORAGE_KEY = 'nutri-scan:meals';
const DIET_PLAN_STORAGE_KEY = 'nutri-scan:diet-plans';

let cachedMeals = null;
let cachedDietPlans = null;
const mealListeners = new Set();

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

function cloneIngredients(ingredients) {
  if (!Array.isArray(ingredients)) {
    return [];
  }

  return ingredients.map((ingredient) => ({
    ...(typeof ingredient === 'object' && ingredient !== null ? ingredient : {})
  }));
}

function cloneMeal(meal) {
  if (!meal || typeof meal !== 'object') {
    return null;
  }

  return {
    ...meal,
    ingredients: cloneIngredients(meal.ingredients)
  };
}

function cloneMeals(meals) {
  if (!Array.isArray(meals)) {
    return [];
  }

  return meals.map((meal) => cloneMeal(meal)).filter(Boolean);
}

function freezeSnapshot(snapshot) {
  if (!Array.isArray(snapshot)) {
    return snapshot;
  }

  snapshot.forEach((meal) => {
    if (meal && typeof meal === 'object') {
      Object.freeze(meal);
    }
  });

  return Object.freeze(snapshot);
}

function createMealsSnapshot() {
  const source = Array.isArray(cachedMeals) ? cachedMeals : [];
  return freezeSnapshot(cloneMeals(source));
}

function notifyMealListeners() {
  const snapshot = createMealsSnapshot();

  mealListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.error('An error occurred in a meal listener callback:', error);
    }
  });
}

function prepareMealsForStorage(meals, { stripInlinePhotos = false } = {}) {
  if (!Array.isArray(meals)) {
    return [];
  }

  return meals.map((meal) => {
    const safeMeal = { ...(typeof meal === 'object' && meal !== null ? meal : {}) };

    if (stripInlinePhotos && typeof safeMeal.photo_url === 'string' && safeMeal.photo_url.startsWith('data:')) {
      safeMeal.photo_url = '';
    }

    safeMeal.ingredients = cloneIngredients(safeMeal.ingredients);
    return safeMeal;
  });
}

function isQuotaExceededError(error) {
  if (!error) {
    return false;
  }

  if (error?.name === 'QuotaExceededError') {
    return true;
  }

  const message = String(error?.message || '');
  return message.toLowerCase().includes('quota');
}

function writeToLocalStorage(meals) {
  if (typeof window === 'undefined') {
    return;
  }

  const attempts = [
    { stripInlinePhotos: false, logFallback: false },
    { stripInlinePhotos: true, logFallback: true }
  ];

  for (const attempt of attempts) {
    try {
      const payload = JSON.stringify(prepareMealsForStorage(meals, attempt));
      window.localStorage.setItem(STORAGE_KEY, payload);

      if (attempt.logFallback) {
        console.warn(
          'Inline meal photos were removed before saving to keep storage usage within browser limits.'
        );
      }

      return;
    } catch (error) {
      if (!isQuotaExceededError(error) || attempt.stripInlinePhotos) {
        console.warn('Unable to persist meals to localStorage:', error);
        return;
      }
    }
  }
}

function syncCachedMealsFromStorage(rawValue) {
  if (rawValue === null) {
    cachedMeals = [];
    notifyMealListeners();
    return;
  }

  if (typeof rawValue !== 'string') {
    return;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed)) {
      cachedMeals = parsed.map(withDefaults);
      notifyMealListeners();
    }
  } catch (error) {
    console.warn('Unable to synchronize meals from storage event:', error);
  }
}

if (typeof window !== 'undefined' && !window.__nutriScanMealsStorageListener) {
  window.__nutriScanMealsStorageListener = true;
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      syncCachedMealsFromStorage(event.newValue);
    }
  });
}

function readPlansFromLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(DIET_PLAN_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.warn('Unable to read diet plans from localStorage:', error);
    return null;
  }
}

function writePlansToLocalStorage(plans) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(DIET_PLAN_STORAGE_KEY, JSON.stringify(plans));
  } catch (error) {
    console.warn('Unable to persist diet plans to localStorage:', error);
  }
}

function normalizeMacroTargets(targets = {}) {
  if (!targets || typeof targets !== 'object') {
    return {};
  }

  return Object.entries(targets).reduce((acc, [key, value]) => {
    const normalizedKey = typeof key === 'string' && key.length > 0 ? key.toLowerCase() : key;
    const numericValue = Number(value);
    acc[normalizedKey] = Number.isFinite(numericValue) ? Math.round(numericValue) : 0;
    return acc;
  }, {});
}

function normalizeMealGuidance(entries = []) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry, index) => {
      const safe = typeof entry === 'object' && entry !== null ? entry : {};
      const name = typeof safe.name === 'string' && safe.name.length > 0
        ? safe.name
        : `Meal ${index + 1}`;
      const description = typeof safe.description === 'string' ? safe.description : '';

      if (!name && !description) {
        return null;
      }

      return { name, description };
    })
    .filter(Boolean);
}

function withPlanDefaults(plan, index = 0) {
  const safe = typeof plan === 'object' && plan !== null ? { ...plan } : {};
  const createdAt = typeof safe.created_at === 'string' && safe.created_at.length > 0
    ? safe.created_at
    : typeof safe.createdAt === 'string' && safe.createdAt.length > 0
      ? safe.createdAt
      : new Date().toISOString();

  const updatedAt = typeof safe.updated_at === 'string' && safe.updated_at.length > 0
    ? safe.updated_at
    : new Date().toISOString();

  const macroTargets = normalizeMacroTargets(safe.macroTargets || safe.targets);
  const hasTargets = Object.keys(macroTargets).length > 0;

  const normalized = {
    id:
      typeof safe.id === 'string' && safe.id.length > 0
        ? safe.id
        : `diet_plan_${generateId()}`,
    name:
      typeof safe.name === 'string' && safe.name.length > 0
        ? safe.name
        : `Diet Plan ${index + 1}`,
    goal: typeof safe.goal === 'string' ? safe.goal : '',
    description: typeof safe.description === 'string' ? safe.description : '',
    macroTargets: hasTargets
      ? macroTargets
      : {
          calories: 2000,
          protein: 100,
          carbs: 220,
          fat: 70,
        },
    hydrationTarget: Number.isFinite(Number(safe.hydrationTarget))
      ? Number(safe.hydrationTarget)
      : 8,
    focus: Array.isArray(safe.focus) ? safe.focus.map((item) => String(item)) : [],
    mealGuidance: normalizeMealGuidance(safe.mealGuidance),
    tips: Array.isArray(safe.tips) ? safe.tips.map((item) => String(item)) : [],
    created_at: createdAt,
    updated_at: updatedAt,
    isActive: Boolean(safe.isActive),
    source:
      typeof safe.source === 'string' && safe.source.length > 0
        ? safe.source
        : 'template',
  };

  return normalized;
}

function clonePlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return null;
  }

  return {
    ...plan,
    macroTargets: { ...(plan.macroTargets || {}) },
    focus: Array.isArray(plan.focus) ? [...plan.focus] : [],
    mealGuidance: Array.isArray(plan.mealGuidance)
      ? plan.mealGuidance.map((entry) => ({ ...entry }))
      : [],
    tips: Array.isArray(plan.tips) ? [...plan.tips] : [],
  };
}

function hydrateDietPlanSeed() {
  const hydrated = dietPlansSeed.map((plan, index) =>
    withPlanDefaults(
      {
        ...plan,
        isActive: index === 0,
        source: 'template',
      },
      index,
    ),
  );

  if (!hydrated.some((plan) => plan.isActive) && hydrated.length > 0) {
    hydrated[0] = { ...hydrated[0], isActive: true };
  }

  return hydrated;
}

async function getDietPlans() {
  if (cachedDietPlans) {
    return cachedDietPlans;
  }

  const stored = readPlansFromLocalStorage();
  if (stored && Array.isArray(stored)) {
    const normalized = stored.map((plan, index) => withPlanDefaults(plan, index));

    if (!normalized.some((plan) => plan.isActive) && normalized.length > 0) {
      normalized[0] = { ...normalized[0], isActive: true };
    }

    cachedDietPlans = normalized;
    return cachedDietPlans;
  }

  cachedDietPlans = hydrateDietPlanSeed();
  writePlansToLocalStorage(cachedDietPlans);
  return cachedDietPlans;
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

export function subscribeToMealChanges(listener, { immediate = false } = {}) {
  if (typeof listener !== 'function') {
    return () => {};
  }

  mealListeners.add(listener);

  if (immediate) {
    (async () => {
      try {
        await getMeals();
        listener(createMealsSnapshot());
      } catch (error) {
        console.error('Unable to deliver the initial meals snapshot to a listener:', error);
      }
    })();
  }

  return () => {
    mealListeners.delete(listener);
  };
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
  notifyMealListeners();
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
  notifyMealListeners();
  return updatedMeal;
}

export async function clearMeals() {
  cachedMeals = hydrateSeedData();
  writeToLocalStorage(cachedMeals);
  notifyMealListeners();
  return cachedMeals;
}

export async function listDietPlans() {
  const plans = await getDietPlans();

  const sorted = [...plans].sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;

    const aTime = new Date(a.created_at || a.createdAt || 0).getTime();
    const bTime = new Date(b.created_at || b.createdAt || 0).getTime();
    return bTime - aTime;
  });

  return sorted.map(clonePlan);
}

export async function getDietPlanById(id) {
  if (!id) {
    return null;
  }

  const plans = await getDietPlans();
  const found = plans.find((plan) => plan.id === id);
  return found ? clonePlan(found) : null;
}

export async function getActiveDietPlan() {
  const plans = await getDietPlans();
  const active = plans.find((plan) => plan.isActive);
  return active ? clonePlan(active) : null;
}

export async function createDietPlan(plan) {
  const plans = await getDietPlans();
  const now = new Date().toISOString();
  const basePlan = {
    ...plan,
    id: `diet_plan_${generateId()}`,
    created_at: now,
    updated_at: now,
    source: plan?.source || 'custom',
  };

  const normalized = withPlanDefaults(basePlan, plans.length);

  const nextPlans = normalized.isActive
    ? plans.map((existing) =>
        existing.isActive
          ? { ...existing, isActive: false, updated_at: now }
          : { ...existing },
      )
    : plans.map((existing) => ({ ...existing }));

  const updated = [normalized, ...nextPlans];
  cachedDietPlans = updated;
  writePlansToLocalStorage(updated);
  return clonePlan(normalized);
}

export async function updateDietPlan(id, updates = {}) {
  if (!id) {
    throw new Error('An id is required to update a diet plan.');
  }

  const plans = await getDietPlans();
  const index = plans.findIndex((plan) => plan.id === id);

  if (index === -1) {
    throw new Error('Diet plan not found.');
  }

  const now = new Date().toISOString();
  const existing = plans[index];

  const normalized = withPlanDefaults(
    {
      ...existing,
      ...updates,
      id: existing.id,
      created_at: existing.created_at,
      updated_at: now,
      source: updates.source || existing.source,
      isActive: typeof updates.isActive === 'boolean' ? updates.isActive : existing.isActive,
    },
    index,
  );

  const nextPlans = plans.map((plan) => {
    if (plan.id === id) {
      return normalized;
    }

    if (normalized.isActive && plan.isActive) {
      return { ...plan, isActive: false, updated_at: now };
    }

    return { ...plan };
  });

  cachedDietPlans = nextPlans;
  writePlansToLocalStorage(nextPlans);
  return clonePlan(normalized);
}

export async function setActiveDietPlan(id) {
  if (!id) {
    throw new Error('An id is required to set the active diet plan.');
  }

  const plans = await getDietPlans();
  const now = new Date().toISOString();
  let found = false;

  const nextPlans = plans.map((plan) => {
    if (plan.id === id) {
      found = true;
      return { ...plan, isActive: true, updated_at: now };
    }

    if (plan.isActive) {
      return { ...plan, isActive: false, updated_at: now };
    }

    return { ...plan };
  });

  if (!found) {
    throw new Error('Diet plan not found.');
  }

  cachedDietPlans = nextPlans;
  writePlansToLocalStorage(nextPlans);
  const active = nextPlans.find((plan) => plan.id === id);
  return active ? clonePlan(active) : null;
}
