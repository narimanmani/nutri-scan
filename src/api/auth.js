import { clearSession, readSession, writeSession } from '@/lib/session.js';

const USERS_KEY = 'nutri-scan:users';
const USER_DATA_VERSION = 1;
const DEFAULT_USERS = [
  {
    username: 'sample_user',
    displayName: 'Sample User',
    role: 'user',
    password: 'sampleUser234!@',
  },
  {
    username: 'admin',
    displayName: 'Administrator',
    role: 'admin',
    password: 'adminNutri!234',
  },
];

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

function writeUserStore(store) {
  if (!isBrowser()) {
    return;
  }

  const payload = {
    version: USER_DATA_VERSION,
    users: Object.fromEntries(
      Object.entries(store.users || {}).map(([username, record]) => [username, { ...record }]),
    ),
  };

  window.localStorage.setItem(USERS_KEY, JSON.stringify(payload));
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

    if (!nextStore.users[username]) {
      const now = new Date().toISOString();
      const passwordHash = await hashPassword(seed.password);
      nextStore.users[username] = {
        username,
        displayName: sanitizeDisplayName(seed.displayName, username),
        role: seed.role === 'admin' ? 'admin' : 'user',
        passwordHash,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null,
      };
      didMutate = true;
    }
  }

  if (didMutate) {
    writeUserStore(nextStore);
  }

  return nextStore;
}

async function loadUserStore() {
  if (!cachedStorePromise) {
    cachedStorePromise = (async () => {
      const store = readUserStoreRaw();
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
    passwordHash,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  };

  store.users[normalizedUsername] = record;
  writeUserStore(store);

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

  const passwordHash = await hashPassword(password);
  if (record.passwordHash !== passwordHash) {
    throw new Error('Incorrect password.');
  }

  const now = new Date().toISOString();
  record.lastLoginAt = now;
  record.updatedAt = now;
  writeUserStore(store);

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
