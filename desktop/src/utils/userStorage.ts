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

/** Read the current logged-in user's ID from sessionStorage. */
function getCurrentUserId(): string {
  if (typeof window === 'undefined') return 'guest';
  try {
    const raw = sessionStorage.getItem('docusync_auth_user');
    if (!raw) return 'guest';
    const user = JSON.parse(raw) as { id?: string };
    return user?.id ?? 'guest';
  } catch {
    return 'guest';
  }
}

/** Build a user-namespaced localStorage key. */
export function userKey(key: string): string {
  return `ds_${getCurrentUserId()}_${key}`;
}

/** localStorage.getItem scoped to the current user. */
export function uGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(userKey(key));
}

/** localStorage.setItem scoped to the current user. */
export function uSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(userKey(key), value);
}

/** localStorage.removeItem scoped to the current user. */
export function uRemove(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(userKey(key));
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
