const SESSION_KEY = 'nutri-scan:session';

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readSession() {
  if (!isBrowser()) {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(SESSION_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const username = typeof parsed.username === 'string' ? parsed.username.trim() : '';
    if (!username) {
      return null;
    }

    const role = parsed.role === 'admin' ? 'admin' : 'user';
    const displayName = typeof parsed.displayName === 'string' && parsed.displayName.trim().length > 0
      ? parsed.displayName.trim()
      : username;

    return {
      id: username,
      username,
      displayName,
      role,
      lastLoginAt: typeof parsed.lastLoginAt === 'string' ? parsed.lastLoginAt : null,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : null,
    };
  } catch (error) {
    console.warn('Failed to parse stored session', error);
    return null;
  }
}

export function writeSession(session) {
  if (!isBrowser()) {
    return;
  }

  if (!session) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }

  const payload = {
    username: session.username || session.id,
    displayName: session.displayName || session.username || session.id,
    role: session.role === 'admin' ? 'admin' : 'user',
    lastLoginAt: session.lastLoginAt || new Date().toISOString(),
    createdAt: session.createdAt || null,
  };

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

export function clearSession() {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(SESSION_KEY);
}

export function subscribeToSessionChanges(callback) {
  if (typeof callback !== 'function' || !isBrowser()) {
    return () => {};
  }

  const handler = (event) => {
    if (event.key !== SESSION_KEY) {
      return;
    }

    callback(readSession());
  };

  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

export function getActiveSessionDetails() {
  const session = readSession();
  if (!session) {
    return { userId: null, role: 'guest' };
  }

  return { userId: session.id, role: session.role || 'user' };
}
