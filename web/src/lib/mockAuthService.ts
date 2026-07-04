/**
 * @module mockAuthService
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

const SESSION_KEY = 'docusync_auth_user';
const API_BASE = '/api/auth';

// ── Polling logic for reactivity ─────────────────────────────────────────
let _usersHash = '';
let _pendingHash = '';

async function pollDatabase() {
  if (typeof window === 'undefined') return;
  try {
    const res = await fetch(`${API_BASE}?action=sync`);
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
    }
  } catch (_err) {
    // Ignore polling errors
  }
}

if (typeof window !== 'undefined') {
  setInterval(pollDatabase, 2000);
  pollDatabase(); // Initial fetch
}

// ── Auth methods ───────────────────────────────────────────────────────────

export async function login(email: string, pin: string): Promise<AuthUser> {
  const res = await fetch(API_BASE, {
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
  const res = await fetch(API_BASE, {
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

export function getCurrentUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const data = sessionStorage.getItem(SESSION_KEY);
  return data ? JSON.parse(data) : null;
}

export function getRememberedEmail(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('docusync_remembered_email') ?? '';
}

export function setRememberedEmail(email: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('docusync_remembered_email', email);
}

export function clearRememberedEmail(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('docusync_remembered_email');
}

export function logout() {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = '/app/unlock';
  }
}

export async function unlockWorkspace(email: string, pin: string): Promise<AuthUser> {
  return login(email, pin);
}

// ── Admin operations ───────────────────────────────────────────────────────

export async function getPendingRequests(): Promise<Array<{ id: string, email: string, requestedAt: string }>> {
  try {
    const res = await fetch(`${API_BASE}?action=sync`);
    if (res.ok) {
      const data = await res.json();
      return data.pending || [];
    }
    return [];
  } catch {
    return [];
  }
}

export async function getActiveUsers(): Promise<AuthUser[]> {
  try {
    const res = await fetch(`${API_BASE}?action=sync`);
    if (res.ok) {
      const data = await res.json();
      return (data.users || []).filter((u: AuthUser & { status: string; isAdmin: boolean; pin: string }) => u.status === 'active' && !u.isAdmin).map((u: AuthUser & { pin: string }) => {
        const { pin: _pin, ...safe } = u;
        return safe;
      });
    }
    return [];
  } catch {
    return [];
  }
}

export async function checkApprovalStatus(email: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}?action=sync`);
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

export async function approveRequest(reqId: string, _assignedPin?: string): Promise<string> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'approve', reqId })
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Approval failed');
  }
  pollDatabase();
  return data.pin;
}

export async function rejectRequest(reqId: string): Promise<void> {
  await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'deny', reqId })
  });
  pollDatabase();
}

export async function revokeUser(_userId: string): Promise<void> {
  // Not implemented on backend yet but can be added
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
  getCurrentUser,
  getRememberedEmail,
  setRememberedEmail,
  clearRememberedEmail,
  logout,
  unlockWorkspace,
  getPendingRequests,
  getActiveUsers,
  checkApprovalStatus,
  approveRequest,
  rejectRequest,
  revokeUser,
  subscribeToDatabaseChanges,
};

export default mockAuthService;
