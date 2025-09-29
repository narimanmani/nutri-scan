const { Buffer } = require('buffer');

const ALLOWED_HOSTNAMES = new Set(['wger.de', 'www.wger.de']);
const ALLOWED_PATH_PREFIXES = ['/static/images/muscles/'];
const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function normalizeUrl(input = '') {
  if (!input) {
    return '';
  }

  const trimmed = input.trim();
  const decoded = decodeURIComponent(trimmed);

  if (/^https?:\/\//i.test(decoded)) {
    return decoded;
  }

  if (decoded.startsWith('//')) {
    return `https:${decoded}`;
  }

  const normalizedPath = decoded.startsWith('/') ? decoded : `/${decoded}`;
  return `https://wger.de${normalizedPath}`;
}

function isAllowedUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (!ALLOWED_HOSTNAMES.has(url.hostname)) {
      return false;
    }

    return ALLOWED_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
  } catch {
    return false;
  }
}

async function proxyAsset(targetUrl, method = 'GET') {
  const upstreamResponse = await fetch(targetUrl, {
    method,
    headers: {
      'User-Agent': 'nutri-scan-anatomy-proxy/1.0 (+https://fancy-chaja-f34742.netlify.app)',
      Accept: '*/*',
    },
  });

  if (!upstreamResponse.ok) {
    return {
      statusCode: upstreamResponse.status,
      headers: {
        ...DEFAULT_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: `Upstream request failed with status ${upstreamResponse.status}` }),
    };
  }

  if (method === 'HEAD') {
    return {
      statusCode: 204,
      headers: {
        ...DEFAULT_HEADERS,
        'Cache-Control': upstreamResponse.headers.get('cache-control') || 'public, max-age=86400',
        'Content-Type': upstreamResponse.headers.get('content-type') || 'application/octet-stream',
      },
      body: '',
    };
  }

  const arrayBuffer = await upstreamResponse.arrayBuffer();
  const body = Buffer.from(arrayBuffer).toString('base64');

  return {
    statusCode: 200,
    headers: {
      ...DEFAULT_HEADERS,
      'Cache-Control': upstreamResponse.headers.get('cache-control') || 'public, max-age=86400',
      'Content-Type': upstreamResponse.headers.get('content-type') || 'application/octet-stream',
    },
    body,
    isBase64Encoded: true,
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: DEFAULT_HEADERS,
      body: '',
    };
  }

  const { path: rawPath } = event.queryStringParameters || {};
  const targetUrl = normalizeUrl(rawPath);

  if (!targetUrl || !isAllowedUrl(targetUrl)) {
    return {
      statusCode: 400,
      headers: {
        ...DEFAULT_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Invalid or unsupported asset path.' }),
    };
  }

  try {
    return await proxyAsset(targetUrl, event.httpMethod);
  } catch {
    return {
      statusCode: 502,
      headers: {
        ...DEFAULT_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Failed to load anatomy asset.' }),
    };
  }
};
