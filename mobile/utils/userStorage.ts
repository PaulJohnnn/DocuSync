/**
 * @module userStorage (Mobile)
 *
 * Provides user-scoped AsyncStorage helpers so that each account
 * gets completely isolated storage.
 *
 * Key format: `@ds/{userId}/{key}`
 *   e.g.  @ds/user-001/current_room
 *         @ds/user-002/files
 *
 * Global keys like node_id, remembered_email, matchmaker_url
 * are intentionally excluded and continue to use raw AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Read the current logged-in user's ID from AsyncStorage. */
async function getCurrentUserId(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem('@docusync/auth_user');
    if (!raw) return 'guest';
    const user = JSON.parse(raw) as { id?: string };
    return user?.id ?? 'guest';
  } catch {
    return 'guest';
  }
}

/** Build a user-namespaced AsyncStorage key. */
export async function userKey(key: string): Promise<string> {
  const uid = await getCurrentUserId();
  return `@ds/${uid}/${key}`;
}

/** AsyncStorage.getItem scoped to the current user. */
export async function uGet(key: string): Promise<string | null> {
  const k = await userKey(key);
  return AsyncStorage.getItem(k);
}

/** AsyncStorage.setItem scoped to the current user. */
export async function uSet(key: string, value: string): Promise<void> {
  const k = await userKey(key);
  return AsyncStorage.setItem(k, value);
}

/** AsyncStorage.removeItem scoped to the current user. */
export async function uRemove(key: string): Promise<void> {
  const k = await userKey(key);
  return AsyncStorage.removeItem(k);
}

/**
 * Clear all user-specific storage for the given user ID.
 * Call this when deleting an account.
 */
export async function clearUserStorage(userId: string): Promise<void> {
  const prefix = `@ds/${userId}/`;
  const allKeys = await AsyncStorage.getAllKeys();
  const toRemove = allKeys.filter(k => k.startsWith(prefix));
  if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove);
}
