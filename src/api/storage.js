import { get, post, put, del } from './client.js';

const NETLIFY_UPLOAD_ENDPOINT = '/api/upload-photo';

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

let cachedMeals = null;
let cachedDietPlans = null;
const mealListeners = new Set();

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

function generateId() {
  const globalCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function cloneIngredients(ingredients) {
  if (!Array.isArray(ingredients)) {
    return [];
  }
  return ingredients.map((ingredient) => ({ ...(ingredient || {}) }));
}

function normalizeIngredient(ingredient, index = 0) {
  const safe = typeof ingredient === 'object' && ingredient !== null ? { ...ingredient } : {};
  const normalized = {
    id: typeof safe.id === 'string' && safe.id.length > 0 ? safe.id : `ingredient_${generateId()}`,
    name:
      typeof safe.name === 'string' && safe.name.length > 0 ? safe.name : `Ingredient ${index + 1}`,
    unit: canonicalizeUnit(safe.unit),
    amount: Number(safe.amount) || 0
  };

  NUTRIENT_FIELDS.forEach((field) => {
    normalized[field] = Number.isFinite(Number(safe[field])) ? Number(safe[field]) : 0;
  });

  return normalized;
}

function normalizeIngredients(ingredients = []) {
  return Array.isArray(ingredients)
    ? ingredients.map((ingredient, index) => normalizeIngredient(ingredient, index))
    : [];
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

function withMealDefaults(meal) {
  if (!meal || typeof meal !== 'object') {
    return null;
  }

  const base = {
    id: meal.id || `meal_${generateId()}`,
    meal_name: meal.meal_name || meal.name || '',
    meal_type: meal.meal_type || 'lunch',
    analysis_notes: meal.analysis_notes || '',
    notes: meal.notes || '',
    photo_url: meal.photo_url || meal.photoUrl || '',
    created_date: meal.created_date || meal.createdDate || new Date().toISOString(),
    ingredients: normalizeIngredients(meal.ingredients),
    ...meal
  };

  if (!Array.isArray(base.ingredients) || base.ingredients.length === 0) {
    const totals = NUTRIENT_FIELDS.reduce((acc, field) => ({ ...acc, [field]: Number(meal[field]) || 0 }), {});
    base.ingredients = [
      normalizeIngredient(
        {
          name: base.meal_name || 'Meal serving',
          unit: 'serving',
          amount: 1,
          ...totals
        },
        0
      )
    ];
  }

  const totals = sumNutrients(base.ingredients);
  NUTRIENT_FIELDS.forEach((field) => {
    base[field] = Number.isFinite(Number(base[field])) ? Number(base[field]) : totals[field];
  });

  return base;
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

function freezeSnapshot(meals) {
  if (!Array.isArray(meals)) {
    return [];
  }
  return meals.map((meal) => Object.freeze(cloneMeal(meal))).filter(Boolean);
}

function notifyMealListeners() {
  const snapshot = freezeSnapshot(cachedMeals);
  mealListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.error('An error occurred in a meal listener callback:', error);
    }
  });
}

async function uploadPhotoIfNeeded(photoUrl) {
  if (typeof photoUrl !== 'string' || photoUrl.length === 0) {
    return '';
  }

  if (!photoUrl.startsWith('data:')) {
    return photoUrl;
  }

  const response = await fetch(NETLIFY_UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ imageDataUrl: photoUrl })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || 'Failed to store the photo on Netlify.');
  }

  const payload = await response.json();
  return payload?.url || photoUrl;
}

async function fetchMealsFromServer() {
  if (!cachedMeals) {
    const { meals = [] } = await get('/meals');
    cachedMeals = meals.map(withMealDefaults).filter(Boolean);
  }
  return cachedMeals;
}

export function subscribeToMealChanges(listener, { immediate = false } = {}) {
  if (typeof listener !== 'function') {
    return () => {};
  }

  mealListeners.add(listener);

  if (immediate) {
    fetchMealsFromServer()
      .then(() => listener(freezeSnapshot(cachedMeals)))
      .catch((error) => console.error('Unable to deliver the initial meals snapshot to a listener:', error));
  }

  return () => {
    mealListeners.delete(listener);
  };
}

export async function listMeals(order = '-created_date', limit) {
  const meals = await fetchMealsFromServer();
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
  const storedPhotoUrl = await uploadPhotoIfNeeded(meal.photo_url || meal.photoUrl || '');
  const payload = { ...meal, photo_url: storedPhotoUrl };
  const { meal: created } = await post('/meals', payload);
  const normalized = withMealDefaults(created);
  cachedMeals = [normalized, ...(cachedMeals || [])];
  notifyMealListeners();
  return normalized;
}

export async function getMealById(id) {
  if (!id) {
    return null;
  }
  const meals = await fetchMealsFromServer();
  let found = meals.find((meal) => meal.id === id);
  if (found) {
    return cloneMeal(found);
  }
  const { meal } = await get(`/meals/${id}`);
  if (!meal) {
    return null;
  }
  const normalized = withMealDefaults(meal);
  cachedMeals = [normalized, ...meals];
  return cloneMeal(normalized);
}

export async function updateMeal(id, updates = {}) {
  if (!id) {
    throw new Error('An id is required to update a meal.');
  }
  const meals = await fetchMealsFromServer();
  const existing = meals.find((meal) => meal.id === id);
  if (!existing) {
    throw new Error('Meal not found.');
  }
  const nextPhotoSource =
    typeof updates.photo_url === 'string' && updates.photo_url.length > 0
      ? updates.photo_url
      : existing.photo_url;
  const storedPhotoUrl = await uploadPhotoIfNeeded(nextPhotoSource || '');
  const payload = { ...existing, ...updates, id, photo_url: storedPhotoUrl };
  const { meal } = await put(`/meals/${id}`, payload);
  const normalized = withMealDefaults(meal);
  cachedMeals = meals.map((m) => (m.id === id ? normalized : m));
  notifyMealListeners();
  return normalized;
}

export async function clearMeals() {
  const meals = await fetchMealsFromServer();
  await Promise.all(meals.map((meal) => del(`/meals/${meal.id}`)));
  cachedMeals = [];
  notifyMealListeners();
  return [];
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

async function fetchDietPlansFromServer() {
  if (!cachedDietPlans) {
    const { plans = [] } = await get('/diet-plans');
    cachedDietPlans = plans.map((plan) => ({
      ...plan,
      id: plan.id || `diet_plan_${generateId()}`,
      created_at: plan.created_at || plan.createdAt || new Date().toISOString(),
      updated_at: plan.updated_at || plan.updatedAt || new Date().toISOString(),
      macroTargets: plan.macroTargets || plan.targets || {},
      isActive: Boolean(plan.isActive),
    }));
  }
  return cachedDietPlans;
}

export async function listDietPlans() {
  const plans = await fetchDietPlansFromServer();
  const sorted = [...plans].sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;
    const aTime = new Date(a.created_at || 0).getTime();
    const bTime = new Date(b.created_at || 0).getTime();
    return bTime - aTime;
  });
  return sorted.map(clonePlan);
}

export async function getDietPlanById(id) {
  if (!id) {
    return null;
  }
  const plans = await fetchDietPlansFromServer();
  const found = plans.find((plan) => plan.id === id);
  if (found) {
    return clonePlan(found);
  }
  const { plan } = await get(`/diet-plans/${id}`);
  if (!plan) {
    return null;
  }
  cachedDietPlans = [plan, ...plans];
  return clonePlan(plan);
}

export async function getActiveDietPlan() {
  const plans = await fetchDietPlansFromServer();
  const active = plans.find((plan) => plan.isActive);
  return active ? clonePlan(active) : null;
}

export async function createDietPlan(plan) {
  const { plan: created } = await post('/diet-plans', plan);
  cachedDietPlans = [created, ...(cachedDietPlans || [])];
  return clonePlan(created);
}

export async function updateDietPlan(id, updates = {}) {
  if (!id) {
    throw new Error('An id is required to update a diet plan.');
  }
  const { plan } = await put(`/diet-plans/${id}`, updates);
  const plans = await fetchDietPlansFromServer();
  cachedDietPlans = plans.map((existing) => (existing.id === id ? plan : existing));
  return clonePlan(plan);
}

export async function setActiveDietPlan(id) {
  if (!id) {
    throw new Error('An id is required to set the active diet plan.');
  }
  await post(`/diet-plans/${id}/activate`, {});
  cachedDietPlans = null;
  const plans = await fetchDietPlansFromServer();
  const active = plans.find((plan) => plan.id === id);
  return active ? clonePlan(active) : null;
}
