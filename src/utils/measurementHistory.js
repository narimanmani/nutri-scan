const MEASUREMENT_HISTORY_KEY = 'measurementHistoryEntries';
const HISTORY_STORAGE_VERSION = 2;
const DEFAULT_USER_ID = 'sample_user';

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeUserId(userId) {
  const normalized = typeof userId === 'string' ? userId.trim() : '';
  return normalized.length > 0 ? normalized : DEFAULT_USER_ID;
}

function createEmptyStore() {
  return { version: HISTORY_STORAGE_VERSION, users: {} };
}

function normalizeHistoryArray(entries, userId) {
  if (!Array.isArray(entries)) {
    return [];
  }

  const normalizedId = normalizeUserId(userId);
  return entries
    .map((entry) => ({
      ...(typeof entry === 'object' && entry !== null ? entry : {}),
      userId: normalizedId,
    }))
    .filter((entry) => entry && typeof entry === 'object');
}

function normalizeStorePayload(payload) {
  const store = createEmptyStore();

  if (!payload) {
    return store;
  }

  if (Array.isArray(payload)) {
    store.users[DEFAULT_USER_ID] = normalizeHistoryArray(payload, DEFAULT_USER_ID);
    return store;
  }

  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.entries)) {
      store.users[DEFAULT_USER_ID] = normalizeHistoryArray(payload.entries, DEFAULT_USER_ID);
    }

    if (payload.users && typeof payload.users === 'object') {
      Object.entries(payload.users).forEach(([userId, entries]) => {
        const normalizedId = normalizeUserId(userId);
        store.users[normalizedId] = normalizeHistoryArray(entries, normalizedId);
      });
    }
  }

  if (!store.users[DEFAULT_USER_ID]) {
    store.users[DEFAULT_USER_ID] = [];
  }

  return store;
}

function readStore() {
  if (!isBrowser()) {
    return createEmptyStore();
  }

  try {
    const stored = window.localStorage.getItem(MEASUREMENT_HISTORY_KEY);
    if (!stored) {
      return createEmptyStore();
    }

    const parsed = JSON.parse(stored);
    return normalizeStorePayload(parsed);
  } catch (error) {
    console.warn('Failed to load measurement history', error);
    return createEmptyStore();
  }
}

function writeStore(store) {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.setItem(
      MEASUREMENT_HISTORY_KEY,
      JSON.stringify({
        version: HISTORY_STORAGE_VERSION,
        users: store.users || {},
      }),
    );
  } catch (error) {
    console.warn('Failed to save measurement history', error);
  }
}

function ensureUserBucket(store, userId) {
  const normalizedId = normalizeUserId(userId);
  if (!Array.isArray(store.users[normalizedId])) {
    store.users[normalizedId] = [];
  }
  return normalizedId;
}

export function loadMeasurementHistory(userId) {
  if (!userId) {
    return [];
  }

  const normalizedId = normalizeUserId(userId);
  const store = readStore();
  const entries = store.users[normalizedId];
  return Array.isArray(entries) ? [...entries] : [];
}

export function loadAllMeasurementHistory() {
  const store = readStore();
  return Object.entries(store.users).flatMap(([userId, entries]) => {
    if (!Array.isArray(entries)) {
      return [];
    }

    const normalizedId = normalizeUserId(userId);
    return entries.map((entry) => ({
      ...(typeof entry === 'object' && entry !== null ? entry : {}),
      userId: normalizedId,
    }));
  });
}

export function saveMeasurementEntry(entry, userId) {
  if (!userId) {
    throw new Error('A signed-in user is required to save measurement history.');
  }

  const store = readStore();
  const normalizedId = ensureUserBucket(store, userId);
  const record = {
    ...(typeof entry === 'object' && entry !== null ? entry : {}),
    userId: normalizedId,
  };

  store.users[normalizedId] = [record, ...store.users[normalizedId]];
  writeStore(store);
}

export function clearMeasurementHistory(userId) {
  if (!userId) {
    return;
  }

  const store = readStore();
  const normalizedId = normalizeUserId(userId);
  if (!Array.isArray(store.users[normalizedId])) {
    return;
  }

  store.users[normalizedId] = [];
  writeStore(store);
}

export const MEASUREMENT_HISTORY_STORAGE_KEY = MEASUREMENT_HISTORY_KEY;
