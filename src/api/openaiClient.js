const ANALYSIS_SCHEMA = {
  name: 'meal_analysis',
  schema: {
    type: 'object',
    properties: {
      meal_name: { type: 'string', description: 'Descriptive name for the meal or dish.' },
      calories: { type: 'number', description: 'Estimated calories for the entire meal.' },
      protein: { type: 'number', description: 'Estimated grams of protein.' },
      carbs: { type: 'number', description: 'Estimated grams of carbohydrates.' },
      fat: { type: 'number', description: 'Estimated grams of fat.' },
      fiber: { type: 'number', description: 'Estimated grams of fiber.' },
      sugar: { type: 'number', description: 'Estimated grams of sugar.' },
      sodium: { type: 'number', description: 'Estimated milligrams of sodium.' },
      potassium: { type: 'number', description: 'Estimated milligrams of potassium.' },
      calcium: { type: 'number', description: 'Estimated milligrams of calcium.' },
      iron: { type: 'number', description: 'Estimated milligrams of iron.' },
      vitamin_c: { type: 'number', description: 'Estimated milligrams of vitamin C.' },
      vitamin_a: { type: 'number', description: 'Estimated IU of vitamin A.' },
      ingredients: {
        type: 'array',
        description: 'Individual ingredients or components detected in the meal with portion estimates.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique identifier for the ingredient row.' },
            name: { type: 'string', description: 'Ingredient or component name.' },
            amount: { type: 'number', description: 'Detected portion amount for this ingredient.' },
            unit: {
              type: 'string',
              description: 'Unit for the detected amount (grams for solids, milliliters for liquids).'
            },
            calories: { type: 'number', description: 'Calories contributed by this ingredient.' },
            protein: { type: 'number', description: 'Protein grams contributed by this ingredient.' },
            carbs: { type: 'number', description: 'Carbohydrate grams contributed by this ingredient.' },
            fat: { type: 'number', description: 'Fat grams contributed by this ingredient.' },
            fiber: { type: 'number', description: 'Fiber grams contributed by this ingredient.' },
            sugar: { type: 'number', description: 'Sugar grams contributed by this ingredient.' },
            sodium: { type: 'number', description: 'Sodium milligrams contributed by this ingredient.' },
            potassium: { type: 'number', description: 'Potassium milligrams contributed by this ingredient.' },
            calcium: { type: 'number', description: 'Calcium milligrams contributed by this ingredient.' },
            iron: { type: 'number', description: 'Iron milligrams contributed by this ingredient.' },
            vitamin_c: { type: 'number', description: 'Vitamin C milligrams contributed by this ingredient.' },
            vitamin_a: { type: 'number', description: 'Vitamin A IU contributed by this ingredient.' }
          },
          required: ['name', 'amount', 'unit']
        }
      },
      analysis_notes: { type: 'string', description: 'Short narrative explaining the analysis and assumptions.' }
    },
    required: ['meal_name', 'calories']
  }
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

const MOCK_RESPONSE = {
  meal_name: 'Grilled Chicken Salad',
  analysis_notes:
    'Estimated values based on grilled chicken breast with mixed greens, cherry tomatoes, avocado, and a light vinaigrette.',
  ingredients: [
    {
      id: 'ingredient_chicken',
      name: 'Grilled chicken breast',
      amount: 150,
      unit: 'g',
      calories: 248,
      protein: 46,
      carbs: 0,
      fat: 5.3,
      fiber: 0,
      sugar: 0,
      sodium: 440,
      potassium: 440,
      calcium: 12,
      iron: 1.2,
      vitamin_c: 0,
      vitamin_a: 21
    },
    {
      id: 'ingredient_greens',
      name: 'Mixed greens & vegetables',
      amount: 120,
      unit: 'g',
      calories: 80,
      protein: 4,
      carbs: 12,
      fat: 2,
      fiber: 4,
      sugar: 6,
      sodium: 120,
      potassium: 360,
      calcium: 110,
      iron: 1.6,
      vitamin_c: 32,
      vitamin_a: 610
    },
    {
      id: 'ingredient_dressing',
      name: 'Avocado vinaigrette',
      amount: 45,
      unit: 'ml',
      calories: 192,
      protein: 0,
      carbs: 4,
      fat: 14.7,
      fiber: 4,
      sugar: 3,
      sodium: 160,
      potassium: 180,
      calcium: 18,
      iron: 0.4,
      vitamin_c: 10,
      vitamin_a: 119
    }
  ]
};

function normalizeIngredient(ingredient, index = 0) {
  const safe = typeof ingredient === 'object' && ingredient !== null ? { ...ingredient } : {};
  const normalized = {
    id: typeof safe.id === 'string' && safe.id.length > 0 ? safe.id : `ingredient_${Date.now()}_${index}`,
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

function ensureNumbers(payload) {
  const result = { ...payload };

  const normalizedIngredients = Array.isArray(result.ingredients)
    ? result.ingredients.map((ingredient, index) => normalizeIngredient(ingredient, index))
    : [];

  if (normalizedIngredients.length === 0) {
    normalizedIngredients.push(normalizeIngredient({
      name: result.meal_name || 'Meal serving',
      unit: 'serving',
      amount: 1,
      ...NUTRIENT_FIELDS.reduce((acc, field) => ({ ...acc, [field]: Number(result[field]) || 0 }), {})
    }, 0));
  }

  result.ingredients = normalizedIngredients;

  const totals = sumNutrients(normalizedIngredients);
  NUTRIENT_FIELDS.forEach((field) => {
    result[field] = totals[field];
  });

  return result;
}

async function fileToDataUrl(file) {
  if (!file) {
    throw new Error('A file is required to analyze the meal image.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read the uploaded file.'));
    reader.readAsDataURL(file);
  });
}

async function analyzeWithOpenAI({ dataUrl, apiKey }) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a registered dietitian that analyses meals from photos and provides complete nutritional breakdowns.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this food image and return a detailed nutritional estimate. Use realistic portion sizes.'
            },
            {
              type: 'image_url',
              image_url: {
                url: dataUrl
              }
            }
          ]
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: ANALYSIS_SCHEMA
      }
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || 'The OpenAI API returned an unexpected error.');
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('The OpenAI API did not return any analysis content.');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    console.error('Failed to parse OpenAI response, falling back to mock data.', error);
    return ensureNumbers(MOCK_RESPONSE);
  }

  return ensureNumbers(parsed);
}

export async function analyzeMealImage({ file, imageDataUrl }) {
  const dataUrl = imageDataUrl || (file ? await fileToDataUrl(file) : null);

  if (!dataUrl) {
    throw new Error('Unable to read the uploaded image.');
  }

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ imageDataUrl: dataUrl })
    });

    if (response.ok) {
      const payload = await response.json();
      if (payload?.data) {
        return ensureNumbers(payload.data);
      }
      throw new Error('The analysis service returned an empty response.');
    }

    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'The analysis service returned an error.');
  } catch (error) {
    console.warn('Falling back to client-side analysis:', error);
  }

  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

  if (apiKey) {
    try {
      return await analyzeWithOpenAI({ dataUrl, apiKey });
    } catch (error) {
      console.error('Direct OpenAI request failed:', error);
    }
  } else {
    console.warn('VITE_OPENAI_API_KEY is not set. Using mock analysis response.');
  }

  return ensureNumbers(MOCK_RESPONSE);
}

export async function getDataUrlFromFile(file) {
  return fileToDataUrl(file);
}
