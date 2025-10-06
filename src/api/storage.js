const NETLIFY_UPLOAD_ENDPOINT = '/api/upload-photo';
const API_BASE_PATH = '/api';

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
  if (!meal || typeof meal !== 'object') {
    return withDefaults({});
  }

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

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

async function fetchJson(path, options = {}) {
  const { method = 'GET', body, headers = {} } = options;
  let requestBody = body;
  const requestHeaders = { ...headers };

  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    requestBody = JSON.stringify(body);
    if (!requestHeaders['Content-Type']) {
      requestHeaders['Content-Type'] = 'application/json';
    }
  }

  let response;
  try {
    response = await fetch(`${API_BASE_PATH}${path}`, {
      method,
      headers: requestHeaders,
      body: requestBody
    });
  } catch (networkError) {
    console.error(`Network error while calling ${path}:`, networkError);
    const error = new ApiError(
      `Unable to reach the server for ${path}: ${networkError.message}`,
      0,
      null
    );
    error.cause = networkError;
    throw error;
  }

  const text = await response.text();

  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (parseError) {
      console.error(`Failed to parse JSON response from ${path}:`, parseError, text);
      const error = new ApiError(
        `Received invalid JSON from ${path}: ${parseError.message}`,
        response.status,
        { raw: text }
      );
      error.cause = parseError;
      throw error;
    }
  }

  if (!response.ok) {
    const messageParts = [];
    if (payload?.error && typeof payload.error === 'string') {
      messageParts.push(payload.error);
    }

    const detailMessage = payload?.details?.message;
    if (detailMessage && typeof detailMessage === 'string') {
      messageParts.push(detailMessage);
    }

    if (messageParts.length === 0) {
      messageParts.push(`Request to ${path} failed with status ${response.status}.`);
    }

    throw new ApiError(messageParts.join(' — '), response.status, payload ?? { raw: text });
  }

  return payload;
}

function sortMeals(meals, order = '-created_date') {
  const sortValue = typeof order === 'string' && order.length > 0 ? order : '-created_date';
  const direction = sortValue.startsWith('-') ? -1 : 1;
  const key = sortValue.replace('-', '') || 'created_date';

  const safeMeals = Array.isArray(meals) ? [...meals] : [];
  safeMeals.sort((a, b) => {
    const aValue = new Date(a[key] || a.created_date || 0).getTime();
    const bValue = new Date(b[key] || b.created_date || 0).getTime();
    return (aValue - bValue) * direction;
  });

  return safeMeals;
}

async function refreshMealsCache({ notify = true } = {}) {
  const payload = await fetchJson(`/meals?ts=${Date.now()}`);
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  cachedMeals = sortMeals(rows.map((meal) => withDefaults(meal)), '-created_date');
  if (notify) {
    notifyMealListeners();
  }
  return cachedMeals;
}

async function loadMeals({ force = false, notify = false } = {}) {
  if (!cachedMeals || force) {
    return refreshMealsCache({ notify });
  }

  return cachedMeals;
}

function insertMealIntoCache(meal) {
  const normalized = withDefaults(meal);
  const existing = Array.isArray(cachedMeals) ? [...cachedMeals] : [];
  const filtered = existing.filter((item) => item?.id !== normalized.id);
  filtered.push(normalized);
  cachedMeals = sortMeals(filtered, '-created_date');
  notifyMealListeners();
  return normalized;
}

function removeMealFromCache(id) {
  if (!id || !Array.isArray(cachedMeals)) {
    return false;
  }

  const nextMeals = cachedMeals.filter((meal) => meal?.id !== id);

  if (nextMeals.length === cachedMeals.length) {
    return false;
  }

  cachedMeals = nextMeals;
  notifyMealListeners();
  return true;
}

export function subscribeToMealChanges(listener, { immediate = false } = {}) {
  if (typeof listener !== 'function') {
    return () => {};
  }

  mealListeners.add(listener);

  if (immediate) {
    (async () => {
      try {
        const hadCache = Array.isArray(cachedMeals);
        await loadMeals({ force: !hadCache, notify: true });
        if (hadCache) {
          listener(createMealsSnapshot());
        }
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
  const meals = await loadMeals();
  const sorted = sortMeals(meals, order);
  return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
}

export async function createMeal(meal) {
  const storedPhotoUrl = await uploadPhotoIfNeeded(meal.photo_url);
  const payload = await fetchJson('/meals', {
    method: 'POST',
    body: {
      meal: {
        ...meal,
        photo_url: storedPhotoUrl
      }
    }
  });

  const saved = payload?.data ? payload.data : null;
  if (!saved) {
    throw new Error('The server did not return the saved meal.');
  }

  const normalized = insertMealIntoCache(saved);
  await refreshMealsCache();
  return normalized;
}

export async function getMealById(id) {
  if (!id) {
    return null;
  }

  if (Array.isArray(cachedMeals)) {
    const cached = cachedMeals.find((meal) => meal.id === id);
    if (cached) {
      return withDefaults(cached);
    }
  }

  try {
    const payload = await fetchJson(`/meals/${encodeURIComponent(id)}`);
    if (!payload?.data) {
      return null;
    }
    const normalized = insertMealIntoCache(payload.data);
    await refreshMealsCache();
    return normalized;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function updateMeal(id, updates = {}) {
  if (!id) {
    throw new Error('An id is required to update a meal.');
  }

  const meals = Array.isArray(cachedMeals) ? cachedMeals : await loadMeals();
  const existing = meals.find((meal) => meal.id === id);

  if (!existing) {
    throw new Error('Meal not found.');
  }

  const nextPhotoSource =
    typeof updates.photo_url === 'string' && updates.photo_url.length > 0
      ? updates.photo_url
      : existing.photo_url;
  const storedPhotoUrl = await uploadPhotoIfNeeded(nextPhotoSource);

  const payload = await fetchJson(`/meals/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: {
      meal: {
        ...updates,
        photo_url: storedPhotoUrl
      }
    }
  });

  const saved = payload?.data ? payload.data : null;
  if (!saved) {
    throw new Error('The server did not return the updated meal.');
  }

  const normalized = insertMealIntoCache(saved);
  await refreshMealsCache();
  return normalized;
}

export async function deleteMeal(id) {
  if (!id) {
    throw new Error('An id is required to delete a meal.');
  }

  await fetchJson(`/meals/${encodeURIComponent(id)}`, { method: 'DELETE' });
  removeMealFromCache(id);
  await refreshMealsCache();
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

async function refreshDietPlanCache() {
  const payload = await fetchJson(`/diet-plans?ts=${Date.now()}`);
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  cachedDietPlans = rows.map((plan, index) => withPlanDefaults(plan, index));
  return cachedDietPlans;
}

async function loadDietPlans({ force = false } = {}) {
  if (!cachedDietPlans || force) {
    await refreshDietPlanCache();
  }

  return cachedDietPlans || [];
}

function sortPlans(plans) {
  const safePlans = Array.isArray(plans) ? [...plans] : [];
  safePlans.sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;

    const aTime = new Date(a.created_at || a.createdAt || 0).getTime();
    const bTime = new Date(b.created_at || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
  return safePlans;
}

async function refreshDietPlans() {
  await refreshDietPlanCache();
  return sortPlans(cachedDietPlans);
}

export async function listDietPlans(options = {}) {
  const plans = await loadDietPlans(options);
  const includeTemplates =
    typeof options.includeTemplates === 'boolean' ? options.includeTemplates : true;
  const filtered = includeTemplates
    ? plans
    : plans.filter((plan) => plan?.source !== 'template');
  return sortPlans(filtered).map(clonePlan);
}

export async function listDietPlanTemplates() {
  const plans = await loadDietPlans();
  return sortPlans(plans.filter((plan) => plan?.source === 'template')).map(clonePlan);
}

export async function getDietPlanById(id) {
  if (!id) {
    return null;
  }

  if (Array.isArray(cachedDietPlans)) {
    const cached = cachedDietPlans.find((plan) => plan.id === id);
    if (cached) {
      return clonePlan(cached);
    }
  }

  try {
    const payload = await fetchJson(`/diet-plans/${encodeURIComponent(id)}`);
    if (!payload?.data) {
      return null;
    }
    await refreshDietPlans();
    return clonePlan(withPlanDefaults(payload.data));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function getActiveDietPlan() {
  const plans = await loadDietPlans();
  const active = plans.find((plan) => plan.isActive);
  return active ? clonePlan(active) : null;
}

export async function createDietPlan(plan) {
  const preparedPlan = {
    ...(typeof plan === 'object' && plan !== null ? plan : {}),
    source:
      typeof plan?.source === 'string' && plan.source.length > 0
        ? plan.source
        : 'custom',
  };

  const payload = await fetchJson('/diet-plans', {
    method: 'POST',
    body: { plan: preparedPlan }
  });

  const saved = payload?.data ? payload.data : null;
  if (!saved) {
    throw new Error('The server did not return the saved plan.');
  }

  await refreshDietPlans();
  return clonePlan(withPlanDefaults(saved));
}

export async function updateDietPlan(id, updates = {}) {
  if (!id) {
    throw new Error('An id is required to update a diet plan.');
  }

  const payload = await fetchJson(`/diet-plans/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: { plan: updates }
  });

  const saved = payload?.data ? payload.data : null;
  if (!saved) {
    throw new Error('The server did not return the updated plan.');
  }

  await refreshDietPlans();
  return clonePlan(withPlanDefaults(saved));
}

export async function setActiveDietPlan(id) {
  if (!id) {
    throw new Error('An id is required to set the active diet plan.');
  }

  const payload = await fetchJson(`/diet-plans/${encodeURIComponent(id)}/activate`, {
    method: 'POST'
  });

  const saved = payload?.data ? payload.data : null;
  if (!saved) {
    throw new Error('The server did not return the active plan.');
  }

  await refreshDietPlans();
  return clonePlan(withPlanDefaults(saved));
}

export async function deleteDietPlan(id) {
  if (!id) {
    throw new Error('An id is required to delete a diet plan.');
  }

  await fetchJson(`/diet-plans/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await refreshDietPlans();
}
