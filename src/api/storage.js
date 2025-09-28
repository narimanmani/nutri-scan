import mealsSeed from '@/data/meals.json';

const STORAGE_KEY = 'nutri-scan:meals';
let cachedMeals = null;

function generateId() {
  const globalCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function withDefaults(meal) {
  return {
    id: meal.id || `meal_${generateId()}`,
    meal_name: '',
    meal_type: 'lunch',
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
    analysis_notes: '',
    notes: '',
    photo_url: '',
    created_date: new Date().toISOString(),
    ...meal
  };
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
  const newMeal = withDefaults({
    ...meal,
    id: `meal_${generateId()}`,
    created_date: new Date().toISOString()
  });

  meals.unshift(newMeal);
  cachedMeals = meals;
  writeToLocalStorage(meals);
  return newMeal;
}

export async function clearMeals() {
  cachedMeals = hydrateSeedData();
  writeToLocalStorage(cachedMeals);
  return cachedMeals;
}
