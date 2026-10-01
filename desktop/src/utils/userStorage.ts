/**
 * @module userStorage
 *
 * Provides user-scoped localStorage helpers so that each account
 * gets completely isolated storage.
 *
 * Key format: `ds_{userId}_{key}`
 *   e.g.  ds_user-001_current_room
 *         ds_user-002_rooms
 *
 * Global (non-user-specific) keys like theme, remembered_email,
 * and node_id continue to use raw localStorage directly.
 */

/**
 * Read the current logged-in user's ID.
 *
 * sessionStorage is per-window and is discarded when the app closes, while
 * the data it namespaces lives in localStorage and persists. Reading only
 * sessionStorage therefore returned 'guest' on the next launch, so every
 * `uGet` hit the empty `ds_guest_*` namespace and the workspace came up with
 * no rooms and no files, with the real `ds_{userId}_*` data left stranded.
 * Falling back to localStorage keeps the namespace stable across restarts.
 */
function getCurrentUserId(): string {
  if (typeof window === 'undefined') return 'guest';
  const read = (store: Storage): string | null => {
    try {
      const raw = store.getItem('docusync_auth_user');
      if (!raw) return null;
      const user = JSON.parse(raw) as { id?: string };
      return user?.id ?? null;
    } catch {
      return null;
    }
  };
  return read(sessionStorage) ?? read(localStorage) ?? 'guest';
}

/** Build a user-namespaced localStorage key. */
export function userKey(key: string): string {
  return `ds_${getCurrentUserId()}_${key}`;
}

/** localStorage.getItem scoped to the current user. */
export function uGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  if (key === 'current_room' || key === 'files') return sessionStorage.getItem(userKey(key));
  return localStorage.getItem(userKey(key));
}

/** localStorage.setItem scoped to the current user. */
export function uSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  if (key === 'current_room' || key === 'files') {
    sessionStorage.setItem(userKey(key), value);
  } else {
    localStorage.setItem(userKey(key), value);
  }
}

/** localStorage.removeItem scoped to the current user. */
export function uRemove(key: string): void {
  if (typeof window === 'undefined') return;
  if (key === 'current_room' || key === 'files') {
    sessionStorage.removeItem(userKey(key));
  } else {
    localStorage.removeItem(userKey(key));
  }
}

/**
 * Clear all user-specific storage for the given user ID.
 * Call this when deleting an account.
 */
export function clearUserStorage(userId: string): void {
  if (typeof window === 'undefined') return;
  const prefix = `ds_${userId}_`;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) keysToRemove.push(k);
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
}
