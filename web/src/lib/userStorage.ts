/**
 * @module userStorage
 *
 * Provides user-scoped localStorage helpers so that each account
 * gets completely isolated storage.
 *
 * Key format: `ds_{userId}_{key}`
 *   e.g.  ds_user-001_current_room
 *         ds_user-002_files
 *
 * Global (non-user-specific) keys like theme, remembered_email,
 * and node_id are intentionally excluded and continue to use the
 * raw localStorage directly.
 */

/**
 * Read the current logged-in user's ID.
 *
 * This used to read sessionStorage alone, which quietly orphaned everything
 * the user owned. sessionStorage is per-tab and is discarded when the browser
 * closes, while the data it namespaces lives in localStorage and persists. So
 * on the next launch — or merely in a second tab — this returned 'guest'
 * before `getCurrentUser()` had restored the session, every `uGet` read the
 * empty `ds_guest_*` namespace, and the workspace came up with no rooms and
 * no files. Worse, any write that followed landed under `ds_guest_*` too,
 * leaving the real `ds_{userId}_*` data stranded.
 *
 * `getCurrentUser()` already falls back to localStorage for exactly this
 * reason; mirroring that here keeps the namespace stable no matter which
 * runs first.
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
