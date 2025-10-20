import { apiGet, apiPost, apiPut, apiDelete } from './httpClient';

const NETLIFY_UPLOAD_ENDPOINT = '/api/upload-photo';
const DEFAULT_MEAL_POLL_INTERVAL = 30000;

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
    id: typeof safe.id === 'string' && safe.id.length > 0 ? safe.id : `ingredient_${index + 1}`,
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
  const ingredients = normalizeIngredients(meal?.ingredients);
  const totals = ingredients.length > 0 ? sumNutrients(ingredients) : null;

  const base = {
    id: meal?.id || '',
    meal_name: meal?.meal_name || '',
    meal_type: meal?.meal_type || 'lunch',
    analysis_notes: meal?.analysis_notes || '',
    notes: meal?.notes || '',
    photo_url: meal?.photo_url || '',
    created_date: meal?.created_date || meal?.meal_date || new Date().toISOString(),
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
      credentials: 'include',
      body: JSON.stringify({ imageDataUrl: photoUrl })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to store the photo on Netlify.');
    }

    const payload = await response.json();
    if (payload?.url) {
      if (payload.stored === false) {
        console.warn('Using inline meal photo URL because blob storage is unavailable.');
      }
      return payload.url;
    }
  } catch (error) {
    console.warn('Falling back to inline photo URL after Netlify upload error:', error);
  }

  return photoUrl;
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

export async function listMeals(order = '-created_at', limit) {
  const params = {};
  if (typeof order === 'string' && order.length > 0) {
    params.order = order;
  }
  if (typeof limit === 'number') {
    params.limit = limit;
  }

  const response = await apiGet('/meals', { params });
  const meals = Array.isArray(response?.data) ? response.data : [];
  return meals.map(withDefaults);
}

export async function createMeal(meal) {
  const photoUrl = await uploadPhotoIfNeeded(meal?.photo_url);
  const response = await apiPost('/meals', { ...meal, photo_url: photoUrl });
  return withDefaults(response?.data || {});
}

export async function getMealById(id) {
  if (!id) {
    return null;
  }

  try {
    const response = await apiGet(`/meals/${encodeURIComponent(id)}`);
    return response?.data ? withDefaults(response.data) : null;
  } catch (error) {
    if (error.status === 404) {
      return null;
    }

    throw error;
  }
}

export async function updateMeal(id, updates = {}) {
  if (!id) {
    throw new Error('An id is required to update a meal.');
  }

  const payload = { ...updates };

  if (typeof updates.photo_url === 'string' && updates.photo_url.length > 0) {
    payload.photo_url = await uploadPhotoIfNeeded(updates.photo_url);
  }

  const response = await apiPut(`/meals/${encodeURIComponent(id)}`, payload);
  return withDefaults(response?.data || {});
}

export async function deleteMeal(id) {
  if (!id) {
    return;
  }

  await apiDelete(`/meals/${encodeURIComponent(id)}`);
}

export function subscribeToMealChanges(listener, { immediate = false, pollInterval = DEFAULT_MEAL_POLL_INTERVAL } = {}) {
  if (typeof listener !== 'function') {
    return () => {};
  }

  let active = true;
  let timeoutId = null;

  const deliverSnapshot = async () => {
    if (!active) {
      return;
    }

    try {
      const meals = await listMeals();
      const snapshot = freezeSnapshot(meals.map((meal) => ({ ...meal })));
      listener(snapshot);
    } catch (error) {
      console.error('Unable to deliver meals snapshot to a listener:', error);
    } finally {
      if (active) {
        timeoutId = setTimeout(deliverSnapshot, pollInterval);
      }
    }
  };

  if (immediate) {
    deliverSnapshot();
  } else {
    timeoutId = setTimeout(deliverSnapshot, pollInterval);
  }

  return () => {
    active = false;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
}

export async function listDietPlans() {
  const response = await apiGet('/diet-plans');
  const plans = Array.isArray(response?.data) ? response.data : [];
  return plans.map((plan) => ({ ...plan }));
}

export async function getDietPlanById(id) {
  if (!id) {
    return null;
  }

  try {
    const response = await apiGet(`/diet-plans/${encodeURIComponent(id)}`);
    return response?.data ? { ...response.data } : null;
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function getActiveDietPlan() {
  const response = await apiGet('/diet-plans/active');
  if (!response?.data) {
    return null;
  }

  return { ...response.data };
}

export async function createDietPlan(plan) {
  const response = await apiPost('/diet-plans', plan);
  return response?.data ? { ...response.data } : null;
}

export async function updateDietPlan(id, updates = {}) {
  if (!id) {
    throw new Error('An id is required to update a diet plan.');
  }

  const response = await apiPut(`/diet-plans/${encodeURIComponent(id)}`, updates);
  return response?.data ? { ...response.data } : null;
}

export async function setActiveDietPlan(id) {
  if (!id) {
    throw new Error('An id is required to set the active diet plan.');
  }

  const response = await apiPost(`/diet-plans/${encodeURIComponent(id)}/activate`);
  return response?.data ? { ...response.data } : null;
}
