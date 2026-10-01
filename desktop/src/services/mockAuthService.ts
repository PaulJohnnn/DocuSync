/**
 * @module mockAuthService (Desktop)
 * Centralized auth backend proxy for Desktop, Web, and Mobile.
 * Uses HTTP fetch to Next.js API.
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  createdAt: string;
  status?: 'active' | 'pending' | 'revoked';
}

export function getDisplayName(user: AuthUser | null | undefined): string {
  if (!user) return 'Guest';
  if (user.name) return user.name;
  if (user.email) {
    const beforeAt = user.email.split('@')[0];
    const noDigits = beforeAt.replace(/\d+$/, '');
    return noDigits.charAt(0).toUpperCase() + noDigits.slice(1);
  }
  return 'Guest';
}

const SESSION_KEY = 'docusync_auth_user';

/**
 * Resolves the base API URL.
 * Priority: localStorage override → VITE_WEB_URL env → localhost (dev) → Vercel (prod)
 * The localStorage key `docusync_server_url` lets Device B specify Device A's LAN IP
 * without needing to rebuild the app (e.g. "http://192.168.1.5:3000").
 */
function getApiBase(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('docusync_server_url');
    if (stored && stored.trim()) return `${stored.trim().replace(/\/$/, '')}/api/auth`;
  }
  if (import.meta.env.VITE_WEB_URL) return `${import.meta.env.VITE_WEB_URL}/api/auth`;
  if (import.meta.env.DEV) return 'http://localhost:3000/api/auth';
  return 'https://docusync-dusky.vercel.app/api/auth';
}

const API_BASE_STATIC = import.meta.env.VITE_WEB_URL
  ? `${import.meta.env.VITE_WEB_URL}/api/auth`
  : (import.meta.env.DEV ? 'http://localhost:3000/api/auth' : 'https://docusync-dusky.vercel.app/api/auth');


async function authFetch(path: string = '', options: RequestInit = {}): Promise<Response> {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    throw new Error('Offline: No network connection.');
  }

  const primary = getApiBase();
  const urlsToTry = [
    `${primary}${path}`,
    `http://localhost:3000/api/auth${path}`,
    `https://docusync-dusky.vercel.app/api/auth${path}`
  ];
  const uniqueUrls = Array.from(new Set(urlsToTry));

  for (const url of uniqueUrls) {
    try {
      const res = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok || res.status < 500) return res;
    } catch {
      // Try next fallback URL
    }
  }
  throw new Error('Network timeout: Cannot connect to the Web App Admin.');
}

// ── Polling logic for reactivity ─────────────────────────────────────────
let _usersHash = '';
let _pendingHash = '';

/**
 * Consecutive polls in which the signed-in account was absent from a roster
 * that actually contained users.
 *
 * The session used to be torn down the instant one poll failed to find the
 * account, with a blocking alert claiming an administrator had revoked it.
 * That ran every two seconds against a response the client does not control,
 * so any single bad read — a cold start, a Redis blip, a truncated or empty
 * payload, a network stall after the machine woke from sleep — signed the
 * user out and accused an administrator of doing it. Leaving the app idle
 * was enough to trigger it, because an idle app still polls.
 *
 * A revocation is a persistent state, so requiring several consecutive polls
 * to agree costs a few seconds in the real case and removes the false one.
 * The desktop polls every 2s, so three strikes is ~6 seconds.
 */
let _missingSelfStreak = 0;
const MISSING_SELF_STRIKES = 3;

async function pollDatabase() {
  if (typeof window === 'undefined') return;
  if (!navigator.onLine) {
    // Going offline is not evidence about the account. Clear any suspicion so
    // that reconnecting does not resume a streak started before the drop.
    _missingSelfStreak = 0;
    return;
  }
  try {
    const res = await authFetch(`?action=sync&t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      const currentUsersStr = JSON.stringify(data.users || []);
      const currentPendingStr = JSON.stringify(data.pending || []);
      
      let changed = false;
      if (currentUsersStr !== _usersHash) {
        _usersHash = currentUsersStr;
        changed = true;
      }
      if (currentPendingStr !== _pendingHash) {
        _pendingHash = currentPendingStr;
        changed = true;
      }
      if (changed) {
        window.dispatchEvent(new Event('docusync_db_update'));
      }

      const sessionStr = sessionStorage.getItem(SESSION_KEY)
        || localStorage.getItem(SESSION_KEY);
      if (sessionStr) {
        try {
          const user = JSON.parse(sessionStr);
          // Only a payload that actually carries the user list can prove an
          // account is gone. A 200 with a missing or empty `users` array means
          // "we don't know", not "you were revoked" — treating those as proof
          // was the direct cause of the false logout.
          const roster: any[] = Array.isArray(data.users) ? data.users : [];
          if (user && user.id && roster.length > 0) {
            const me = roster.find((u: any) => u.id === user.id);
            const gone = !me || me.status !== 'active';
            _missingSelfStreak = gone ? _missingSelfStreak + 1 : 0;

            if (_missingSelfStreak >= MISSING_SELF_STRIKES) {
              _missingSelfStreak = 0;
              console.warn('[mockAuthService] Account deleted or revoked. Logging out.');
              if (typeof window !== 'undefined') window.alert("Your account has been deleted or revoked by an administrator.");
              logout();
            }
          } else {
            // Nothing was proven this round, so forget any earlier suspicion.
            _missingSelfStreak = 0;
          }
        } catch { }
      }
    } else {
      // A non-OK response is not evidence about the account either.
      _missingSelfStreak = 0;
    }
  } catch (err) {
    // A failed poll proves nothing either, and must not let suspicion carry
    // across an unrelated outage — otherwise two bad-roster reads separated
    // by a network error would still add up to a logout.
    _missingSelfStreak = 0;
  }
}

if (typeof window !== 'undefined') {
  setInterval(pollDatabase, 2000);
  pollDatabase(); // Initial fetch
}

// ── Auth methods ───────────────────────────────────────────────────────────

export async function login(email: string, pin: string): Promise<AuthUser> {
  const res = await authFetch('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', email, pin })
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Invalid login');
  }
  
  if (typeof window !== 'undefined') {
    const prevUserStr = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    let isDifferentUser = true;
    if (prevUserStr) {
      try {
        const prev = JSON.parse(prevUserStr);
        if (prev.id === data.user.id) isDifferentUser = false;
      } catch {}
    }

    if (isDifferentUser) {
      console.log('[Auth] New or different user logging in. Isolation cleanup starting...');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('ds_') || k.startsWith('docusync_') || k === 'files' || k === 'current_room')) {
          localStorage.removeItem(k);
        }
      }
      try {
        if (window.docuSync && window.docuSync.clearDatabase) {
          await window.docuSync.clearDatabase();
        }
      } catch (e) {
        console.error('Failed to wipe database on new user login', e);
      }
    }

    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
    localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
    sessionStorage.setItem('docusync_has_seen_welcome_session', 'true');
  }
  return data.user;
}

export async function requestAccount(email: string): Promise<'verified'> {
  const res = await authFetch('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'request', email })
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    const err = new Error(data.error || 'Request failed');
    (err as any).code = data.error === 'Already registered.' ? 'EMAIL_ALREADY_USED' : 'UNKNOWN';
    throw err;
  }
  pollDatabase();
  return 'verified';
}

export async function cancelRequest(email: string): Promise<void> {
  await authFetch('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cancel_request', email })
  }).catch(() => {});
  pollDatabase();
}

export async function getActiveUsers(): Promise<AuthUser[]> {
  try {
    const res = await authFetch('?action=sync');
    if (res.ok) {
      const data = await res.json();
      return (data.users || []).filter((u: any) => u.status === 'active' && !u.isAdmin).map((u: any) => {
        const { pin: _pin, ...safe } = u;
        return safe;
      });
    }
    return [];
  } catch {
    return [];
  }
}

export async function revokeUser(userId: string): Promise<void> {
  await authFetch('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'revoke', userId })
  });
  pollDatabase();
}

export function getCurrentUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const data = sessionStorage.getItem(SESSION_KEY);
  return data ? JSON.parse(data) : null;
}

export async function logout() {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(SESSION_KEY);
    // The persistent copy written for "remember this device" lives under the
    // same key in localStorage and does not carry the `ds_` prefix, so the
    // loop below never removed it. Logging out left it behind, which meant a
    // session the user had ended could still be read back — and, once the
    // poll began falling back to localStorage, the revocation notice fired a
    // second time against the session it had just torn down.
    localStorage.removeItem(SESSION_KEY);
    // Clear user-scoped localStorage
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('ds_')) {
        localStorage.removeItem(k);
      }
    }
    // Isolate desktop state by wiping SQLite backend
    try {
      if (window.docuSync && window.docuSync.clearDatabase) {
        await window.docuSync.clearDatabase();
      }
    } catch (e) {
      console.error('Failed to wipe database on logout', e);
    }
    window.location.href = '#/vault-login'; // Desktop uses HashRouter
  }
}

export async function checkApprovalStatus(email: string): Promise<string | null> {
  try {
    const res = await authFetch(`?action=claim_pin&email=${encodeURIComponent(email)}&t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'active' && data.pin) return data.pin;
    }
    return null;
  } catch {
    return null;
  }
}

export function subscribeToDatabaseChanges(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('docusync_db_update', callback);
  return () => {
    window.removeEventListener('docusync_db_update', callback);
  };
}

export async function requestPinRenewal(email: string): Promise<string> {
  const res = await authFetch('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'renew_otp', email })
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to request PIN renewal');
  }
  pollDatabase();
  return data.pin;
}

/**
 * Exchanges the one-time access code issued on approval for a permanent
 * password of the user's choosing, and signs them in.
 *
 * The web app has always done this; the desktop never did, so a desktop user
 * kept authenticating with the short code forever while a web user moved on
 * to a real password. Both write to the same server-side field, so without
 * this the two platforms drifted apart on the same account.
 */
export async function setPassword(email: string, pin: string, password: string): Promise<AuthUser> {
  const res = await authFetch('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'set_password', email, pin, password })
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to set password');
  }

  if (typeof window !== 'undefined') {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
    localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
  }
  pollDatabase();
  return data.user;
}

const mockAuthService = {
  login,
  requestAccount,
  cancelRequest,
  revokeUser,
  getActiveUsers,
  getCurrentUser,
  logout,
  checkApprovalStatus,
  requestPinRenewal,
  setPassword,
  subscribeToDatabaseChanges,
};

export default mockAuthService;
