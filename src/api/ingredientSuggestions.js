const API_BASE = '/api/ingredient-suggestions';

async function postJson(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = error?.error || 'Request failed.';
    throw new Error(message);
  }

  const data = await response.json().catch(() => ({}));
  return data?.data;
}

export async function fetchIngredientSuggestions(query) {
  const payload = { type: 'suggestions', query };
  const result = await postJson('', payload);
  return Array.isArray(result?.suggestions) ? result.suggestions : [];
}

export async function estimateIngredientNutrition({ ingredientName, amount, unit }) {
  const payload = { type: 'estimate', ingredientName, amount, unit };
  const result = await postJson('', payload);
  return result || null;
}
