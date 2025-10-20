const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const PRIMARY_USERS_FILE_PATH = path.join(process.cwd(), 'netlify', 'data', 'users.json');
const FALLBACK_USERS_FILE_PATH = path.join(os.tmpdir(), 'nutri-scan', 'users.json');
let usersFilePath = PRIMARY_USERS_FILE_PATH;
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
    await fs.access(usersFilePath);
    return usersFilePath;
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      // If we cannot even stat the path because it is read-only, fall back to a
      // writable temp directory.
      if (shouldFallBack(error)) {
        return switchToFallbackPath();
      }
      throw error;
    }
  }

  try {
    await fs.mkdir(path.dirname(usersFilePath), { recursive: true });
  } catch (error) {
    if (shouldFallBack(error)) {
      return switchToFallbackPath();
    }
    throw error;
  }

  const seed = Array.isArray(DEFAULT_USERS) ? DEFAULT_USERS : [];
  try {
    await fs.writeFile(usersFilePath, JSON.stringify(seed, null, 2));
  } catch (error) {
    if (shouldFallBack(error)) {
      return switchToFallbackPath();
    }
    throw error;
  }

  return usersFilePath;
}

function shouldFallBack(error) {
  return error && (error.code === 'EROFS' || error.code === 'EACCES');
}

async function switchToFallbackPath() {
  if (usersFilePath === FALLBACK_USERS_FILE_PATH) {
    throw new Error('Unable to access writable users datastore.');
  }

  usersFilePath = FALLBACK_USERS_FILE_PATH;
  await fs.mkdir(path.dirname(usersFilePath), { recursive: true });

  const seed = Array.isArray(DEFAULT_USERS) ? DEFAULT_USERS : [];
  await fs.writeFile(usersFilePath, JSON.stringify(seed, null, 2));

  return usersFilePath;
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
  const filePath = await ensureUsersFile();
  try {
    const contents = await fs.readFile(filePath, 'utf8');
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
  const filePath = await ensureUsersFile();
  try {
    await fs.writeFile(filePath, `${JSON.stringify(users, null, 2)}\n`, 'utf8');
  } catch (error) {
    if (shouldFallBack(error)) {
      await switchToFallbackPath();
      await fs.writeFile(usersFilePath, `${JSON.stringify(users, null, 2)}\n`, 'utf8');
      return;
    }
    throw error;
  }
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
