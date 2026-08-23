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
  return 'https://docusync-pnc.vercel.app/api/auth';
}

const API_BASE_STATIC = import.meta.env.VITE_WEB_URL
  ? `${import.meta.env.VITE_WEB_URL}/api/auth`
  : (import.meta.env.DEV ? 'http://localhost:3000/api/auth' : 'https://docusync-pnc.vercel.app/api/auth');


// ── Polling logic for reactivity ─────────────────────────────────────────
let _usersHash = '';
let _pendingHash = '';

async function pollDatabase() {
  if (typeof window === 'undefined') return;
  try {
    const res = await fetch(`${getApiBase()}?action=sync`);
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

      const sessionStr = sessionStorage.getItem(SESSION_KEY);
      if (sessionStr) {
        try {
          const user = JSON.parse(sessionStr);
          if (user && user.id) {
            const stillExists = (data.users || []).find((u: any) => u.id === user.id && u.status === 'active');
            if (!stillExists) {
              console.warn('[mockAuthService] Account deleted or revoked. Logging out.');
              if (typeof window !== 'undefined') window.alert("Your account has been deleted by an administrator.");
              logout();
            }
          }
        } catch { }
      }
    }
  } catch (err) {
    // Ignore polling errors
  }
}

if (typeof window !== 'undefined') {
  setInterval(pollDatabase, 2000);
  pollDatabase(); // Initial fetch
}

// ── Auth methods ───────────────────────────────────────────────────────────

export async function login(email: string, pin: string): Promise<AuthUser> {
  const res = await fetch(getApiBase(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', email, pin })
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Invalid login');
  }
  
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
    sessionStorage.setItem('docusync_has_seen_welcome_session', 'true');
  }
  return data.user;
}

export async function requestAccount(email: string): Promise<'verified'> {
  const res = await fetch(getApiBase(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'request', email }),
    signal: AbortSignal.timeout(5000)
  }).catch(() => {
    throw new Error('Network timeout: Cannot connect to the Web App Admin. Make sure the laptop is running the Web App and the IP address is correct.');
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
  await fetch(getApiBase(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cancel_request', email })
  }).catch(() => {});
  pollDatabase();
}

export async function getActiveUsers(): Promise<AuthUser[]> {
  try {
    const res = await fetch(`${getApiBase()}?action=sync`);
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
  await fetch(getApiBase(), {
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
    const res = await fetch(`${getApiBase()}?action=sync`);
    if (res.ok) {
      const data = await res.json();
      const user = (data.users || []).find((u: any) => u.email.toLowerCase() === email.toLowerCase());
      if (user && user.status === 'active') return user.pin;
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

const mockAuthService = {
  login,
  requestAccount,
  cancelRequest,
  revokeUser,
  getActiveUsers,
  getCurrentUser,
  logout,
  checkApprovalStatus,
  subscribeToDatabaseChanges,
};

export default mockAuthService;
