import mealsSeed from '@/data/meals.json';

const NETLIFY_UPLOAD_ENDPOINT = '/api/upload-photo';

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
