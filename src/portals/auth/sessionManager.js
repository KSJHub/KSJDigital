const SESSION_KEY = 'ksj_portal_session';
const DEFAULT_SESSION_HOURS = 12;

function getExpiryDate(hours = DEFAULT_SESSION_HOURS) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export function getStoredSession() {
  try {
    const rawSession = window.localStorage.getItem(SESSION_KEY);
    const session = rawSession ? JSON.parse(rawSession) : null;

    if (!session) return null;

    if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
      clearSession();
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function storeSession(session) {
  if (!session) return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
}

export function createPortalSession(user, options = {}) {
  const rememberMe = options.rememberMe !== false;
  return {
    user,
    createdAt: new Date().toISOString(),
    expiresAt: getExpiryDate(rememberMe ? 12 : 2),
    rememberMe,
  };
}

export function getActivePortalUser(fallbackUser) {
  const session = getStoredSession();
  return session?.user ?? fallbackUser;
}

export function getSessionExpiryLabel(session = getStoredSession()) {
  if (!session?.expiresAt) return 'No active session expiry set.';
  return new Date(session.expiresAt).toLocaleString();
}
