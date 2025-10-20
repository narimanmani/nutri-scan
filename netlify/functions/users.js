const fs = require('fs/promises');
const path = require('path');

const USERS_FILE_PATH = path.join(process.cwd(), 'netlify', 'data', 'users.json');
const DEFAULT_USERS = (() => {
  try {
    // Reuse the same seed data shipped with the client bundle.
    return require('../../src/data/users.json');
  } catch (error) {
    console.warn('Unable to load default users for seeding:', error);
    return [];
  }
})();

function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

async function ensureUsersFile() {
  try {
    await fs.access(USERS_FILE_PATH);
    return;
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      throw error;
    }
  }

  await fs.mkdir(path.dirname(USERS_FILE_PATH), { recursive: true });
  const seed = Array.isArray(DEFAULT_USERS) ? DEFAULT_USERS : [];
  await fs.writeFile(USERS_FILE_PATH, JSON.stringify(seed, null, 2));
}

function normalizeTimestamp(value, fallback) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return fallback || null;
}

function sanitizeRecord(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const username = typeof record.username === 'string' ? record.username.trim().toLowerCase() : '';
  if (!username) {
    return null;
  }

  const passwordHash = typeof record.passwordHash === 'string' ? record.passwordHash.trim() : '';
  if (!passwordHash) {
    return null;
  }

  const displayName = typeof record.displayName === 'string' && record.displayName.trim().length > 0
    ? record.displayName.trim()
    : username;

  const role = record.role === 'admin' ? 'admin' : 'user';
  const createdAt = normalizeTimestamp(record.createdAt, new Date().toISOString());
  const updatedAt = normalizeTimestamp(record.updatedAt, createdAt);
  const lastLoginAt = normalizeTimestamp(record.lastLoginAt, null);

  return {
    username,
    displayName,
    role,
    passwordHash,
    createdAt,
    updatedAt,
    lastLoginAt,
  };
}

async function readUsersFromDisk() {
  await ensureUsersFile();
  try {
    const contents = await fs.readFile(USERS_FILE_PATH, 'utf8');
    const parsed = JSON.parse(contents);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(sanitizeRecord).filter(Boolean);
  } catch (error) {
    console.warn('Unable to read users from disk:', error);
    return [];
  }
}

async function writeUsersToDisk(users) {
  await ensureUsersFile();
  await fs.writeFile(USERS_FILE_PATH, `${JSON.stringify(users, null, 2)}\n`, 'utf8');
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return buildResponse(200, '');
  }

  if (event.httpMethod === 'GET') {
    const users = await readUsersFromDisk();
    return buildResponse(200, { users });
  }

  if (event.httpMethod === 'POST') {
    let payload;
    try {
      payload = event.body ? JSON.parse(event.body) : {};
    } catch (error) {
      return buildResponse(400, { error: 'Invalid JSON payload.' });
    }

    const incoming = Array.isArray(payload?.users) ? payload.users : [];
    if (incoming.length === 0) {
      return buildResponse(400, { error: 'Expected a non-empty list of users to persist.' });
    }

    const sanitized = incoming.map(sanitizeRecord).filter(Boolean);
    if (sanitized.length === 0) {
      return buildResponse(400, { error: 'No valid user records were provided.' });
    }

    sanitized.sort((a, b) => a.username.localeCompare(b.username));
    await writeUsersToDisk(sanitized);

    return buildResponse(200, { users: sanitized });
  }

  return buildResponse(405, { error: 'Method not allowed.' });
};
