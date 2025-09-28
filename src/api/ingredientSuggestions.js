const API_BASES = ['/.netlify/functions/api', '/api'];

function buildUrl(base, path) {
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${normalizedBase}${path}`;
}

async function postJson(path, payload) {
  let lastError;

  for (const base of API_BASES) {
    try {
      const response = await fetch(buildUrl(base, path), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        return data?.data;
      }

      if (response.status !== 404) {
        const error = await response.json().catch(() => ({}));
        const message = error?.error || 'Request failed.';
        throw new Error(message);
      }

      lastError = new Error('Not found');
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Request failed.');
}

export async function fetchIngredientSuggestions(query) {
  const payload = { type: 'suggestions', query };
  const result = await postJson('/ingredient-suggestions', payload);
  return Array.isArray(result?.suggestions) ? result.suggestions : [];
}

export async function estimateIngredientNutrition({ ingredientName, amount, unit }) {
  const payload = { type: 'estimate', ingredientName, amount, unit };
  const result = await postJson('/ingredient-suggestions', payload);
  return result || null;
}
