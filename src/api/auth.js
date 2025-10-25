import defaultUsersSeed from '@/data/users.json';
import { clearSession, readSession, writeSession } from '@/lib/session.js';

const USERS_KEY = 'nutri-scan:users';
const USER_DATA_VERSION = 1;
const USERS_API_ENDPOINT = '/.netlify/functions/users';
const DEFAULT_USERS = Array.isArray(defaultUsersSeed) ? defaultUsersSeed : [];

export const AUTH_PROVIDERS = {
  PASSWORD: 'password',
  GOOGLE: 'google',
};

let cachedStorePromise;

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

async function getCrypto() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }

  try {
    const nodeCrypto = await import('crypto');
    if (nodeCrypto?.webcrypto?.subtle) {
      return nodeCrypto.webcrypto;
    }
  } catch (error) {
    console.warn('Falling back to insecure password storage:', error);
  }

  return null;
}

async function hashPassword(password) {
  const crypto = await getCrypto();
  if (!crypto?.subtle || typeof TextEncoder === 'undefined') {
    return password;
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function sanitizeUsername(value = '') {
  return value.trim().toLowerCase();
}

function sanitizeDisplayName(value = '', fallback = '') {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return fallback || value.trim();
  }
  return trimmed.replace(/\s+/g, ' ').replace(/^[a-z]/, (match) => match.toUpperCase());
}

function toStoreRecord(record, { fallbackCreatedAt = null } = {}) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const username = sanitizeUsername(record.username);
  if (!username) {
    return null;
  }

  const authProvider = record.authProvider === AUTH_PROVIDERS.GOOGLE ? AUTH_PROVIDERS.GOOGLE : AUTH_PROVIDERS.PASSWORD;

  let passwordHash = '';
  if (authProvider === AUTH_PROVIDERS.PASSWORD) {
    passwordHash =
      typeof record.passwordHash === 'string' && record.passwordHash.trim().length > 0
        ? record.passwordHash.trim()
        : '';
    if (!passwordHash) {
      return null;
    }
  } else {
    passwordHash =
      typeof record.passwordHash === 'string' && record.passwordHash.trim().length > 0
        ? record.passwordHash.trim()
        : `google-oauth:${username}`;
  }

  const createdAtRaw =
    typeof record.createdAt === 'string' && record.createdAt.trim().length > 0
      ? record.createdAt
      : fallbackCreatedAt || new Date().toISOString();
  const updatedAtRaw =
    typeof record.updatedAt === 'string' && record.updatedAt.trim().length > 0
      ? record.updatedAt
      : createdAtRaw;

  return {
    username,
    displayName: sanitizeDisplayName(record.displayName, username),
    role: record.role === 'admin' ? 'admin' : 'user',
    passwordHash,
    authProvider,
    createdAt: createdAtRaw,
    updatedAt: updatedAtRaw,
    lastLoginAt:
      typeof record.lastLoginAt === 'string' && record.lastLoginAt.trim().length > 0
        ? record.lastLoginAt
        : null,
  };
}

function serializeStore(store) {
  return Object.entries(store.users || {}).map(([username, record]) => ({
    username,
    displayName: record.displayName,
    role: record.role === 'admin' ? 'admin' : 'user',
    passwordHash: record.passwordHash,
    authProvider: record.authProvider === AUTH_PROVIDERS.GOOGLE ? AUTH_PROVIDERS.GOOGLE : AUTH_PROVIDERS.PASSWORD,
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || record.createdAt || null,
    lastLoginAt: record.lastLoginAt || null,
  }));
}

async function fetchUsersFromApi() {
  if (typeof fetch !== 'function') {
    return null;
  }

  try {
    const response = await fetch(USERS_API_ENDPOINT, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const candidates = Array.isArray(payload?.users) ? payload.users : payload;
    if (!Array.isArray(candidates)) {
      return null;
    }

    const fetched = candidates
      .map((candidate) => toStoreRecord(candidate))
      .filter(Boolean)
      .reduce(
        (acc, record) => {
          acc.users[record.username] = record;
          return acc;
        },
        { version: USER_DATA_VERSION, users: {} },
      );

    return fetched;
  } catch (error) {
    console.warn('Unable to read users from JSON store:', error);
    return null;
  }
}

async function persistUsersToApi(store) {
  if (typeof fetch !== 'function') {
    return;
  }

  const payload = serializeStore(store);
  if (payload.length === 0) {
    return;
  }

  try {
    await fetch(USERS_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users: payload }),
    });
  } catch (error) {
    console.warn('Unable to persist users to JSON store:', error);
  }
}

function readUserStoreRaw() {
  if (!isBrowser()) {
    return { version: USER_DATA_VERSION, users: {} };
  }

  try {
    const stored = window.localStorage.getItem(USERS_KEY);
    if (!stored) {
      return { version: USER_DATA_VERSION, users: {} };
    }

    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') {
      return { version: USER_DATA_VERSION, users: {} };
    }

    if (Array.isArray(parsed)) {
      return {
        version: USER_DATA_VERSION,
        users: parsed.reduce((acc, user) => {
          if (user?.username) {
            acc[user.username] = { ...user };
          }
          return acc;
        }, {}),
      };
    }

    if (parsed.users && typeof parsed.users === 'object') {
      return {
        version: USER_DATA_VERSION,
        users: Object.entries(parsed.users).reduce((acc, [username, record]) => {
          if (username) {
            acc[username] = { ...(record || {}), username };
          }
          return acc;
        }, {}),
      };
    }

    return { version: USER_DATA_VERSION, users: {} };
  } catch (error) {
    console.warn('Failed to parse stored users', error);
    return { version: USER_DATA_VERSION, users: {} };
  }
}

async function writeUserStore(store, { skipRemoteSync = false } = {}) {
  if (isBrowser()) {
    const payload = {
      version: USER_DATA_VERSION,
      users: Object.fromEntries(
        Object.entries(store.users || {}).map(([username, record]) => [username, { ...record }]),
      ),
    };

    window.localStorage.setItem(USERS_KEY, JSON.stringify(payload));
  }

  if (!skipRemoteSync) {
    await persistUsersToApi(store);
  }
}

function toPublicUser(record) {
  if (!record) {
    return null;
  }

  const displayName = sanitizeDisplayName(record.displayName || '', record.username);
  return {
    id: record.username,
    username: record.username,
    displayName,
    role: record.role === 'admin' ? 'admin' : 'user',
    createdAt: record.createdAt || null,
    lastLoginAt: record.lastLoginAt || null,
  };
}

async function ensureSeedUsers(store) {
  const nextStore = { ...store, users: { ...(store.users || {}) } };
  let didMutate = false;

  for (const seed of DEFAULT_USERS) {
    const username = sanitizeUsername(seed.username);
    if (!username) {
      continue;
    }

    if (nextStore.users[username]) {
      continue;
    }

    let record = toStoreRecord(seed, { fallbackCreatedAt: new Date().toISOString() });

    if (!record && typeof seed.password === 'string' && seed.password.length > 0) {
      const passwordHash = await hashPassword(seed.password);
      record = toStoreRecord({ ...seed, passwordHash }, { fallbackCreatedAt: new Date().toISOString() });
    }

    if (!record) {
      continue;
    }

    nextStore.users[username] = record;
    didMutate = true;
  }

  if (didMutate) {
    await writeUserStore(nextStore);
  }

  return nextStore;
}

async function loadUserStore() {
  if (!cachedStorePromise) {
    cachedStorePromise = (async () => {
      let store = readUserStoreRaw();

      const remoteStore = await fetchUsersFromApi();
      if (remoteStore) {
        store = remoteStore;
        await writeUserStore(store, { skipRemoteSync: true });
      }

      return ensureSeedUsers(store);
    })();
  }

  return cachedStorePromise;
}

function assertPasswordStrength(password = '') {
  if (password.length < 8) {
    throw new Error('Choose a password with at least 8 characters.');
  }
}

export async function listUsers() {
  const store = await loadUserStore();
  return Object.values(store.users).map((record) => toPublicUser(record)).filter(Boolean);
}

export async function registerUser({ username, password, displayName }) {
  const normalizedUsername = sanitizeUsername(username);
  if (!normalizedUsername) {
    throw new Error('Enter a username to continue.');
  }

  assertPasswordStrength(password);

  const store = await loadUserStore();
  if (store.users[normalizedUsername]) {
    throw new Error('That username is already registered.');
  }

  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);
  const record = {
    username: normalizedUsername,
    displayName: sanitizeDisplayName(displayName, normalizedUsername),
    role: 'user',
    authProvider: AUTH_PROVIDERS.PASSWORD,
    passwordHash,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  };

  store.users[normalizedUsername] = record;
  await writeUserStore(store);

  const publicUser = toPublicUser(record);
  writeSession({
    ...publicUser,
    username: publicUser.username,
    displayName: publicUser.displayName,
    role: publicUser.role,
    createdAt: publicUser.createdAt,
    lastLoginAt: publicUser.lastLoginAt,
  });

  return publicUser;
}

export async function loginUser({ username, password }) {
  const normalizedUsername = sanitizeUsername(username);
  if (!normalizedUsername) {
    throw new Error('Enter your username.');
  }

  const store = await loadUserStore();
  const record = store.users[normalizedUsername];
  if (!record) {
    throw new Error('No account found with that username.');
  }

  if (record.authProvider === AUTH_PROVIDERS.GOOGLE) {
    throw new Error('Use Google sign-in to access this account.');
  }

  const passwordHash = await hashPassword(password);
  if (record.passwordHash !== passwordHash) {
    throw new Error('Incorrect password.');
  }

  const now = new Date().toISOString();
  record.lastLoginAt = now;
  record.updatedAt = now;
  await writeUserStore(store);

  const publicUser = toPublicUser(record);
  writeSession({
    ...publicUser,
    username: publicUser.username,
    displayName: publicUser.displayName,
    role: publicUser.role,
    createdAt: publicUser.createdAt,
    lastLoginAt: now,
  });

  return publicUser;
}

export async function loginWithGoogleProfile({ email, displayName, sub }) {
  const normalizedEmail = sanitizeUsername(email);
  if (!normalizedEmail) {
    throw new Error('Your Google account did not include a valid email address.');
  }

  const store = await loadUserStore();
  let record = store.users[normalizedEmail];
  const now = new Date().toISOString();

  if (record) {
    if (record.authProvider !== AUTH_PROVIDERS.GOOGLE) {
      throw new Error('An account with this email already exists. Sign in with your password instead.');
    }

    record.displayName = sanitizeDisplayName(displayName, normalizedEmail);
    record.lastLoginAt = now;
    record.updatedAt = now;
  } else {
    record = {
      username: normalizedEmail,
      displayName: sanitizeDisplayName(displayName, normalizedEmail),
      role: 'user',
      authProvider: AUTH_PROVIDERS.GOOGLE,
      passwordHash: `google-oauth:${sub || normalizedEmail}`,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };

    store.users[normalizedEmail] = record;
  }

  await writeUserStore(store);

  const publicUser = toPublicUser(record);
  writeSession({
    ...publicUser,
    username: publicUser.username,
    displayName: publicUser.displayName,
    role: publicUser.role,
    createdAt: publicUser.createdAt,
    lastLoginAt: record.lastLoginAt,
  });

  return publicUser;
}

export async function logoutUser() {
  clearSession();
}

export async function getCurrentUser() {
  const session = readSession();
  if (!session) {
    return null;
  }

  return {
    id: session.id,
    username: session.username,
    displayName: session.displayName,
    role: session.role,
    createdAt: session.createdAt,
    lastLoginAt: session.lastLoginAt,
  };
}

export async function refreshUserSession() {
  const session = readSession();
  if (!session) {
    return null;
  }

  const store = await loadUserStore();
  const record = store.users[session.username];
  if (!record) {
    clearSession();
    return null;
  }

  const publicUser = toPublicUser(record);
  writeSession({
    ...publicUser,
    username: publicUser.username,
    displayName: publicUser.displayName,
    role: publicUser.role,
    createdAt: publicUser.createdAt,
    lastLoginAt: publicUser.lastLoginAt,
  });

  return publicUser;
}

export const USER_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
};
