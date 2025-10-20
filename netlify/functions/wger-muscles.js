const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const WGER_BASE_URL = 'https://wger.de';
const WGER_MUSCLE_ENDPOINT = `${WGER_BASE_URL}/api/v2/muscle/?limit=200`;

function normalizeNextUrl(nextUrl = '') {
  if (!nextUrl) {
    return '';
  }

  try {
    const parsed = new URL(nextUrl, WGER_BASE_URL);
    parsed.protocol = 'https:';
    parsed.hostname = 'wger.de';
    return parsed.toString();
  } catch (error) {
    return '';
  }
}

async function fetchMusclePage(url, { signal } = {}) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'nutri-scan-muscle-proxy/1.0 (+https://fancy-chaja-f34742.netlify.app)',
    },
    signal,
  });

  if (!response.ok) {
    const error = new Error(`Upstream request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function fetchAllMuscles() {
  const muscles = [];
  let nextUrl = WGER_MUSCLE_ENDPOINT;

  while (nextUrl) {
    const data = await fetchMusclePage(nextUrl);
    muscles.push(...(Array.isArray(data.results) ? data.results : []));
    nextUrl = normalizeNextUrl(data.next);
  }

  return muscles;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: DEFAULT_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const muscles = await fetchAllMuscles();

    return {
      statusCode: 200,
      headers: {
        ...DEFAULT_HEADERS,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
      body: JSON.stringify({ muscles }),
    };
  } catch (error) {
    const statusCode = error?.status >= 400 ? error.status : 502;
    return {
      statusCode,
      headers: {
        ...DEFAULT_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Failed to load muscle catalog.' }),
    };
  }
};
