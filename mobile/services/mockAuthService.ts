/**
 * @module mockAuthService (Mobile)
 * Centralized auth backend proxy for Desktop, Web, and Mobile.
 * Uses HTTP fetch to Next.js API.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  createdAt: string;
  status?: 'active' | 'pending' | 'revoked';
}

const SESSION_KEY = '@docusync/auth_user';

// Dynamic API Base Discovery
let _apiBase: string | null = null;
const DISCOVERY_URL = 'https://docusync-pnc.vercel.app/api/discovery?workspace=admin';

async function getApiBase(): Promise<string> {
  if (_apiBase) return _apiBase;
  
  if (Platform.OS === 'web') {
    _apiBase = 'http://localhost:3000/api/auth';
    return _apiBase;
  }

  try {
    const res = await fetch(DISCOVERY_URL);
    if (!res.ok) throw new Error('Discovery failed');
    const data = await res.json();
    if (data.success && data.ip) {
      const port = data.port || '3000';
      _apiBase = `http://${data.ip}:${port}/api/auth`;
      return _apiBase;
    }
  } catch (err) {
    console.warn('Failed to auto-discover local server IP', err);
  }
  
  // Fallback to localhost if discovery fails entirely
  return 'http://localhost:3000/api/auth';
}

// ── Auth methods ───────────────────────────────────────────────────────────

export async function login(email: string, pin: string): Promise<AuthUser> {
  const apiBase = await getApiBase();
  const res = await fetch(apiBase, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', email, pin })
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Invalid login');
  }
  
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
  return data.user;
}

export async function requestAccount(email: string): Promise<'verified'> {
  const apiBase = await getApiBase();
  const res = await fetch(apiBase, {
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
  return 'verified';
}

export async function cancelRequest(email: string): Promise<void> {
  const apiBase = await getApiBase();
  await fetch(apiBase, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cancel_request', email })
  }).catch(() => {});
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const data = await AsyncStorage.getItem(SESSION_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function logout() {
  await AsyncStorage.removeItem(SESSION_KEY);
}

export async function checkApprovalStatus(email: string): Promise<string | null> {
  try {
    const apiBase = await getApiBase();
    const res = await fetch(`${apiBase}?action=sync`);
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

const mockAuthService = {
  login,
  requestAccount,
  cancelRequest,
  getCurrentUser,
  logout,
  checkApprovalStatus,
};

export default mockAuthService;
