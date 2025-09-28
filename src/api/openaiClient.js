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
      analysis_notes: { type: 'string', description: 'Short narrative explaining the analysis and assumptions.' }
    },
    required: ['meal_name', 'calories']
  }
};

const NUMERIC_FIELDS = [
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

const MOCK_RESPONSE = {
  meal_name: 'Grilled Chicken Salad',
  calories: 520,
  protein: 46,
  carbs: 32,
  fat: 22,
  fiber: 8,
  sugar: 9,
  sodium: 720,
  potassium: 980,
  calcium: 140,
  iron: 3.2,
  vitamin_c: 42,
  vitamin_a: 750,
  analysis_notes:
    'Estimated values based on grilled chicken breast with mixed greens, cherry tomatoes, avocado, and a light vinaigrette.'
};

function ensureNumbers(payload) {
  const result = { ...payload };

  NUMERIC_FIELDS.forEach((field) => {
    if (field in result) {
      const parsed = Number(result[field]);
      result[field] = Number.isFinite(parsed) ? parsed : 0;
    } else {
      result[field] = 0;
    }
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
