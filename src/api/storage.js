import mealsSeed from '@/data/meals.json';
import dietPlansSeed from '@/data/dietPlans.json';
import { getActiveSessionDetails } from '@/lib/session.js';

const NETLIFY_UPLOAD_ENDPOINT = '/api/upload-photo';

const STORAGE_KEY = 'nutri-scan:meals';
const DIET_PLAN_STORAGE_KEY = 'nutri-scan:diet-plans';
const MEAL_STORE_VERSION = 2;
const DIET_PLAN_STORE_VERSION = 2;
const DEFAULT_USER_ID = 'sample_user';

let cachedMealStore = null;
let cachedDietPlanStore = null;
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

function withDefaults(meal, fallbackUserId = DEFAULT_USER_ID) {
  const ingredients = normalizeIngredients(meal.ingredients);
  const totals = ingredients.length > 0 ? sumNutrients(ingredients) : null;

  const base = {
    id: meal.id || `meal_${generateId()}`,
    userId:
      typeof meal.userId === 'string' && meal.userId.trim().length > 0
        ? meal.userId.trim()
        : fallbackUserId,
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
    userId:
      typeof meal.userId === 'string' && meal.userId.trim().length > 0
        ? meal.userId.trim()
        : DEFAULT_USER_ID,
    ingredients: cloneIngredients(meal.ingredients)
  };
}

function cloneMeals(meals) {
  if (!Array.isArray(meals)) {
    return [];
  }

  return meals.map((meal) => cloneMeal(meal)).filter(Boolean);
}

function normalizeUserId(userId) {
  const normalized = typeof userId === 'string' ? userId.trim() : '';
  return normalized.length > 0 ? normalized : DEFAULT_USER_ID;
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

function createEmptyMealStore() {
  return { version: MEAL_STORE_VERSION, users: {} };
}

function normalizeMealArrayForUser(meals, userId) {
  if (!Array.isArray(meals)) {
    return [];
  }

  const normalizedId = normalizeUserId(userId);

  return meals
    .map((meal) => {
      const assignedUserId = normalizeUserId(meal?.userId || normalizedId);
      return withDefaults({ ...meal, userId: assignedUserId }, assignedUserId);
    })
    .filter(Boolean);
}

function normalizeMealStorePayload(payload) {
  const store = createEmptyMealStore();

  if (!payload) {
    return store;
  }

  if (Array.isArray(payload)) {
    store.users[DEFAULT_USER_ID] = normalizeMealArrayForUser(payload, DEFAULT_USER_ID);
    return store;
  }

  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.meals)) {
      store.users[DEFAULT_USER_ID] = normalizeMealArrayForUser(payload.meals, DEFAULT_USER_ID);
    }

    if (payload.users && typeof payload.users === 'object') {
      Object.entries(payload.users).forEach(([userId, meals]) => {
        const normalizedId = normalizeUserId(userId);
        store.users[normalizedId] = normalizeMealArrayForUser(meals, normalizedId);
      });
    }
  }

  if (!store.users[DEFAULT_USER_ID]) {
    store.users[DEFAULT_USER_ID] = [];
  }

  return store;
}

function readMealStoreFromLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);
    return normalizeMealStorePayload(parsed);
  } catch (error) {
    console.warn('Unable to read meals from localStorage:', error);
    return null;
  }
}

function prepareMealsForStorage(meals, { stripInlinePhotos = false } = {}, userId = DEFAULT_USER_ID) {
  if (!Array.isArray(meals)) {
    return [];
  }

  const normalizedId = normalizeUserId(userId);

  return meals.map((meal) => {
    const safeMeal = { ...(typeof meal === 'object' && meal !== null ? meal : {}) };

    if (stripInlinePhotos && typeof safeMeal.photo_url === 'string' && safeMeal.photo_url.startsWith('data:')) {
      safeMeal.photo_url = '';
    }

    safeMeal.userId = normalizeUserId(safeMeal.userId || normalizedId);
    safeMeal.ingredients = cloneIngredients(safeMeal.ingredients);
    return safeMeal;
  });
}

function prepareMealStoreForStorage(store, options = {}) {
  const payload = { version: MEAL_STORE_VERSION, users: {} };

  Object.entries(store.users || {}).forEach(([userId, meals]) => {
    payload.users[userId] = prepareMealsForStorage(meals, options, userId);
  });

  return payload;
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

function writeMealStoreToLocalStorage(store) {
  if (typeof window === 'undefined') {
    return;
  }

  const attempts = [
    { stripInlinePhotos: false, logFallback: false },
    { stripInlinePhotos: true, logFallback: true },
  ];

  for (const attempt of attempts) {
    try {
      const payload = JSON.stringify(prepareMealStoreForStorage(store, attempt));
      window.localStorage.setItem(STORAGE_KEY, payload);

      if (attempt.logFallback) {
        console.warn(
          'Inline meal photos were removed before saving to keep storage usage within browser limits.',
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

function ensureMealBucket(store, userId) {
  const normalizedId = normalizeUserId(userId);
  if (!Array.isArray(store.users[normalizedId])) {
    store.users[normalizedId] = [];
  }
  return normalizedId;
}

function ensureSampleUserSeed(store) {
  const normalizedId = normalizeUserId(DEFAULT_USER_ID);
  if (!Array.isArray(store.users[normalizedId]) || store.users[normalizedId].length === 0) {
    store.users[normalizedId] = hydrateSeedData(normalizedId);
    return true;
  }
  return false;
}

async function getMealStore() {
  if (!cachedMealStore) {
    const stored = readMealStoreFromLocalStorage();
    cachedMealStore = stored || createEmptyMealStore();
    if (ensureSampleUserSeed(cachedMealStore)) {
      writeMealStoreToLocalStorage(cachedMealStore);
    }
  }

  return cachedMealStore;
}

function buildCombinedMealList(store) {
  const aggregated = [];
  Object.entries(store.users || {}).forEach(([userId, meals]) => {
    if (!Array.isArray(meals)) {
      return;
    }

    const normalizedId = normalizeUserId(userId);
    meals.forEach((meal) => {
      aggregated.push(cloneMeal({ ...meal, userId: normalizeUserId(meal.userId || normalizedId) }));
    });
  });
  return aggregated;
}

function getMealsForSession(store, session = getActiveSessionDetails()) {
  const { userId, role } = session || {};
  if (!userId) {
    return [];
  }

  if (role === 'admin') {
    return buildCombinedMealList(store);
  }

  const normalizedId = normalizeUserId(userId);
  const meals = Array.isArray(store.users[normalizedId]) ? store.users[normalizedId] : [];
  return meals.map((meal) => cloneMeal({ ...meal, userId: normalizedId })).filter(Boolean);
}

function findMealRecord(store, id) {
  if (!id) {
    return null;
  }

  for (const [userId, meals] of Object.entries(store.users || {})) {
    if (!Array.isArray(meals)) {
      continue;
    }

    const index = meals.findIndex((meal) => meal.id === id);
    if (index !== -1) {
      return {
        userId: normalizeUserId(userId),
        index,
        meal: meals[index],
      };
    }
  }

  return null;
}

function createMealsSnapshotForSession(session = getActiveSessionDetails()) {
  if (!cachedMealStore) {
    return freezeSnapshot([]);
  }

  return freezeSnapshot(getMealsForSession(cachedMealStore, session));
}

function notifyMealListeners() {
  const snapshot = createMealsSnapshotForSession();

  mealListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.error('An error occurred in a meal listener callback:', error);
    }
  });
}

function syncCachedMealsFromStorage(rawValue) {
  if (rawValue === null) {
    cachedMealStore = createEmptyMealStore();
    ensureSampleUserSeed(cachedMealStore);
    notifyMealListeners();
    return;
  }

  if (typeof rawValue !== 'string') {
    return;
  }

  try {
    const parsed = JSON.parse(rawValue);
    cachedMealStore = normalizeMealStorePayload(parsed);
    ensureSampleUserSeed(cachedMealStore);
    notifyMealListeners();
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

function normalizePlanArrayForUser(plans, userId) {
  if (!Array.isArray(plans)) {
    return [];
  }

  const normalizedId = normalizeUserId(userId);
  return plans.map((plan, index) => withPlanDefaults({ ...plan, userId: normalizedId }, index, normalizedId));
}

function normalizePlanStorePayload(payload) {
  const store = createEmptyPlanStore();

  if (!payload) {
    return store;
  }

  if (Array.isArray(payload)) {
    store.users[DEFAULT_USER_ID] = normalizePlanArrayForUser(payload, DEFAULT_USER_ID);
    return store;
  }

  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.plans)) {
      store.users[DEFAULT_USER_ID] = normalizePlanArrayForUser(payload.plans, DEFAULT_USER_ID);
    }

    if (payload.users && typeof payload.users === 'object') {
      Object.entries(payload.users).forEach(([userId, plans]) => {
        const normalizedId = normalizeUserId(userId);
        store.users[normalizedId] = normalizePlanArrayForUser(plans, normalizedId);
      });
    }
  }

  if (!store.users[DEFAULT_USER_ID]) {
    store.users[DEFAULT_USER_ID] = [];
  }

  return store;
}

function readPlanStoreFromLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(DIET_PLAN_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);
    return normalizePlanStorePayload(parsed);
  } catch (error) {
    console.warn('Unable to read diet plans from localStorage:', error);
    return null;
  }
}

function preparePlanStoreForStorage(store) {
  const payload = { version: DIET_PLAN_STORE_VERSION, users: {} };

  Object.entries(store.users || {}).forEach(([userId, plans]) => {
    payload.users[userId] = normalizePlanArrayForUser(plans, userId);
  });

  return payload;
}

function writePlanStoreToLocalStorage(store) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const payload = JSON.stringify(preparePlanStoreForStorage(store));
    window.localStorage.setItem(DIET_PLAN_STORAGE_KEY, payload);
  } catch (error) {
    console.warn('Unable to persist diet plans to localStorage:', error);
  }
}

function ensurePlanBucket(store, userId) {
  const normalizedId = normalizeUserId(userId);
  if (!Array.isArray(store.users[normalizedId])) {
    store.users[normalizedId] = [];
  }
  return normalizedId;
}

function ensurePlanSeedForUser(store, userId) {
  const normalizedId = ensurePlanBucket(store, userId);
  if (store.users[normalizedId].length === 0) {
    store.users[normalizedId] = hydrateDietPlanSeed(normalizedId);
    return true;
  }
  return false;
}

async function getDietPlanStore() {
  if (!cachedDietPlanStore) {
    const stored = readPlanStoreFromLocalStorage();
    cachedDietPlanStore = stored || createEmptyPlanStore();
    let mutated = false;
    mutated = ensurePlanSeedForUser(cachedDietPlanStore, DEFAULT_USER_ID) || mutated;
    if (mutated) {
      writePlanStoreToLocalStorage(cachedDietPlanStore);
    }
  }

  return cachedDietPlanStore;
}

function buildCombinedPlanList(store) {
  const aggregated = [];
  Object.entries(store.users || {}).forEach(([userId, plans]) => {
    if (!Array.isArray(plans)) {
      return;
    }

    plans.forEach((plan) => {
      aggregated.push(clonePlan({ ...plan, userId: normalizeUserId(plan.userId || userId) }));
    });
  });
  return aggregated;
}

function getPlansForSession(store, session = getActiveSessionDetails()) {
  const { userId, role } = session || {};
  if (!userId) {
    return [];
  }

  if (role === 'admin') {
    return buildCombinedPlanList(store);
  }

  const normalizedId = ensurePlanBucket(store, userId);
  const seeded = ensurePlanSeedForUser(store, normalizedId);
  if (seeded) {
    writePlanStoreToLocalStorage(store);
  }
  return store.users[normalizedId].map((plan) => clonePlan(plan));
}

function findPlanRecord(store, id) {
  if (!id) {
    return null;
  }

  for (const [userId, plans] of Object.entries(store.users || {})) {
    if (!Array.isArray(plans)) {
      continue;
    }

    const index = plans.findIndex((plan) => plan.id === id);
    if (index !== -1) {
      return {
        userId: normalizeUserId(userId),
        index,
        plan: plans[index],
      };
    }
  }

  return null;
}

async function getDietPlans() {
  const store = await getDietPlanStore();
  const session = getActiveSessionDetails();
  return getPlansForSession(store, session);
}

function insertPlanIntoBucket(bucket = [], plan, now) {
  const filtered = bucket.filter((existing) => existing.id !== plan.id);
  if (plan.isActive) {
    const normalized = filtered.map((existing) => ({ ...existing, isActive: false, updated_at: now }));
    return [plan, ...normalized];
  }

  return [plan, ...filtered.map((existing) => ({ ...existing }))];
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

function withPlanDefaults(plan, index = 0, fallbackUserId = DEFAULT_USER_ID) {
  const safe = typeof plan === 'object' && plan !== null ? { ...plan } : {};
  const normalizedUserId = normalizeUserId(safe.userId || fallbackUserId);
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
    userId: normalizedUserId,
  };

  return normalized;
}

function clonePlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return null;
  }

  return {
    ...plan,
    userId: normalizeUserId(plan.userId || DEFAULT_USER_ID),
    macroTargets: { ...(plan.macroTargets || {}) },
    focus: Array.isArray(plan.focus) ? [...plan.focus] : [],
    mealGuidance: Array.isArray(plan.mealGuidance)
      ? plan.mealGuidance.map((entry) => ({ ...entry }))
      : [],
    tips: Array.isArray(plan.tips) ? [...plan.tips] : [],
  };
}

function hydrateDietPlanSeed(userId = DEFAULT_USER_ID) {
  const normalizedId = normalizeUserId(userId);
  const hydrated = dietPlansSeed.map((plan, index) =>
    withPlanDefaults(
      {
        ...plan,
        isActive: index === 0,
        source: 'template',
        userId: normalizedId,
      },
      index,
      normalizedId,
    ),
  );

  if (!hydrated.some((plan) => plan.isActive) && hydrated.length > 0) {
    hydrated[0] = { ...hydrated[0], isActive: true };
  }

  return hydrated;
}

function createEmptyPlanStore() {
  return { version: DIET_PLAN_STORE_VERSION, users: {} };
}

function hydrateSeedData(userId = DEFAULT_USER_ID) {
  const normalizedId = normalizeUserId(userId);
  return mealsSeed.map((meal) => {
    const createdDate =
      meal.created_date ?? (meal.meal_date ? new Date(meal.meal_date).toISOString() : new Date().toISOString());

    return withDefaults(
      {
        ...meal,
        created_date: createdDate,
        userId: normalizedId,
      },
      normalizedId,
    );
  });
}

async function getMealsForCurrentSession() {
  const store = await getMealStore();
  const session = getActiveSessionDetails();
  const meals = getMealsForSession(store, session);
  return { store, session, meals };
}

export function subscribeToMealChanges(listener, { immediate = false } = {}) {
  if (typeof listener !== 'function') {
    return () => {};
  }

  mealListeners.add(listener);

  if (immediate) {
    (async () => {
      try {
        await getMealStore();
        listener(createMealsSnapshotForSession());
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
  const { meals } = await getMealsForCurrentSession();
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
  const { store, session } = await getMealsForCurrentSession();
  const { userId } = session;

  if (!userId) {
    throw new Error('You must be signed in to log meals.');
  }

  const normalizedUserId = normalizeUserId(userId);
  ensureMealBucket(store, normalizedUserId);

  const storedPhotoUrl = await uploadPhotoIfNeeded(meal.photo_url);
  const newMeal = withDefaults(
    {
      ...meal,
      id: `meal_${generateId()}`,
      created_date: new Date().toISOString(),
      photo_url: storedPhotoUrl,
      userId: normalizedUserId,
    },
    normalizedUserId,
  );

  store.users[normalizedUserId].unshift(newMeal);
  writeMealStoreToLocalStorage(store);
  notifyMealListeners();
  return cloneMeal(newMeal);
}

export async function getMealById(id) {
  if (!id) {
    return null;
  }

  const store = await getMealStore();
  const session = getActiveSessionDetails();
  const record = findMealRecord(store, id);

  if (!record) {
    return null;
  }

  if (session.role !== 'admin') {
    const normalizedSessionId = normalizeUserId(session.userId);
    if (!session.userId || normalizedSessionId !== record.userId) {
      return null;
    }
  }

  return withDefaults({ ...record.meal }, record.userId);
}

export async function updateMeal(id, updates = {}) {
  if (!id) {
    throw new Error('An id is required to update a meal.');
  }

  const store = await getMealStore();
  const session = getActiveSessionDetails();
  const record = findMealRecord(store, id);

  if (!record) {
    throw new Error('Meal not found.');
  }

  const isAdmin = session.role === 'admin';
  const normalizedSessionId = normalizeUserId(session.userId);
  if (!isAdmin && (!session.userId || normalizedSessionId !== record.userId)) {
    throw new Error('You do not have permission to update this meal.');
  }

  const existing = record.meal;
  const nextPhotoSource =
    typeof updates.photo_url === 'string' && updates.photo_url.length > 0
      ? updates.photo_url
      : existing.photo_url;
  const storedPhotoUrl = await uploadPhotoIfNeeded(nextPhotoSource);

  const requestedUserId = updates.userId ? normalizeUserId(updates.userId) : record.userId;
  if (requestedUserId !== record.userId && !isAdmin) {
    throw new Error('You do not have permission to reassign this meal.');
  }

  ensureMealBucket(store, requestedUserId);

  const updatedMeal = withDefaults(
    {
      ...existing,
      ...updates,
      id: existing.id,
      created_date: existing.created_date,
      photo_url: storedPhotoUrl,
      userId: requestedUserId,
    },
    requestedUserId,
  );

  if (requestedUserId !== record.userId) {
    store.users[record.userId].splice(record.index, 1);
    store.users[requestedUserId].unshift(updatedMeal);
  } else {
    store.users[requestedUserId][record.index] = updatedMeal;
  }

  writeMealStoreToLocalStorage(store);
  notifyMealListeners();
  return cloneMeal(updatedMeal);
}

export async function clearMeals() {
  const store = await getMealStore();
  const session = getActiveSessionDetails();

  if (session.role === 'admin') {
    cachedMealStore = createEmptyMealStore();
    ensureSampleUserSeed(cachedMealStore);
    writeMealStoreToLocalStorage(cachedMealStore);
    notifyMealListeners();
    return createMealsSnapshotForSession(session);
  }

  if (!session.userId) {
    return [];
  }

  const normalizedId = normalizeUserId(session.userId);
  ensureMealBucket(store, normalizedId);
  store.users[normalizedId] = [];
  writeMealStoreToLocalStorage(store);
  notifyMealListeners();
  return [];
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

  return sorted.map((plan) => clonePlan(plan));
}

export async function getDietPlanById(id) {
  if (!id) {
    return null;
  }

  const store = await getDietPlanStore();
  const session = getActiveSessionDetails();
  const record = findPlanRecord(store, id);

  if (!record) {
    return null;
  }

  if (session.role !== 'admin') {
    const normalizedSessionId = normalizeUserId(session.userId);
    if (!session.userId || normalizedSessionId !== record.userId) {
      return null;
    }
  }

  return clonePlan(record.plan);
}

export async function getActiveDietPlan() {
  const store = await getDietPlanStore();
  const session = getActiveSessionDetails();
  const plans = getPlansForSession(store, session);
  const active = plans.find((plan) => plan.isActive);
  return active ? clonePlan(active) : null;
}

export async function createDietPlan(plan) {
  const store = await getDietPlanStore();
  const session = getActiveSessionDetails();

  if (!session.userId) {
    throw new Error('You must be signed in to create a diet plan.');
  }

  const normalizedUserId = ensurePlanBucket(store, session.userId);
  const now = new Date().toISOString();
  const basePlan = {
    ...plan,
    id: `diet_plan_${generateId()}`,
    created_at: now,
    updated_at: now,
    source: plan?.source || 'custom',
    userId: normalizedUserId,
  };

  const normalized = withPlanDefaults(basePlan, store.users[normalizedUserId].length, normalizedUserId);
  store.users[normalizedUserId] = insertPlanIntoBucket(store.users[normalizedUserId], normalized, now);

  writePlanStoreToLocalStorage(store);
  return clonePlan(normalized);
}

export async function updateDietPlan(id, updates = {}) {
  if (!id) {
    throw new Error('An id is required to update a diet plan.');
  }

  const store = await getDietPlanStore();
  const session = getActiveSessionDetails();
  const record = findPlanRecord(store, id);

  if (!record) {
    throw new Error('Diet plan not found.');
  }

  const isAdmin = session.role === 'admin';
  const normalizedSessionId = normalizeUserId(session.userId);
  if (!isAdmin && (!session.userId || normalizedSessionId !== record.userId)) {
    throw new Error('You do not have permission to update this diet plan.');
  }

  const now = new Date().toISOString();
  const existing = record.plan;
  const targetUserId = updates.userId ? normalizeUserId(updates.userId) : record.userId;
  if (targetUserId !== record.userId && !isAdmin) {
    throw new Error('You do not have permission to reassign this diet plan.');
  }

  ensurePlanBucket(store, targetUserId);

  const normalized = withPlanDefaults(
    {
      ...existing,
      ...updates,
      id: existing.id,
      created_at: existing.created_at,
      updated_at: now,
      source: updates.source || existing.source,
      userId: targetUserId,
      isActive: typeof updates.isActive === 'boolean' ? updates.isActive : existing.isActive,
    },
    record.index,
    targetUserId,
  );

  store.users[record.userId] = store.users[record.userId].filter((planItem) => planItem.id !== id);
  store.users[targetUserId] = insertPlanIntoBucket(store.users[targetUserId], normalized, now);

  writePlanStoreToLocalStorage(store);
  return clonePlan(normalized);
}

export async function setActiveDietPlan(id) {
  if (!id) {
    throw new Error('An id is required to set the active diet plan.');
  }

  const store = await getDietPlanStore();
  const session = getActiveSessionDetails();
  const record = findPlanRecord(store, id);

  if (!record) {
    throw new Error('Diet plan not found.');
  }

  const isAdmin = session.role === 'admin';
  const normalizedSessionId = normalizeUserId(session.userId);
  if (!isAdmin && (!session.userId || normalizedSessionId !== record.userId)) {
    throw new Error('You do not have permission to activate this diet plan.');
  }

  const now = new Date().toISOString();
  const bucket = store.users[record.userId].map((plan) => {
    if (plan.id === id) {
      return { ...plan, isActive: true, updated_at: now };
    }
    return { ...plan, isActive: false, updated_at: now };
  });

  store.users[record.userId] = bucket;
  writePlanStoreToLocalStorage(store);
  const active = bucket.find((plan) => plan.id === id) || null;
  return active ? clonePlan(active) : null;
}
