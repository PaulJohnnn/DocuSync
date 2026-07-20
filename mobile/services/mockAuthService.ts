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

// On physical device or Android emulator, localhost might need to be specific.
// Next.js web server runs on port 3000 (not 3001).
const API_BASE = Platform.OS === 'web' 
  ? 'http://localhost:3000/api/auth' 
  : 'http://10.127.60.142:3000/api/auth';

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
  
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
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
  return 'verified';
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

const mockAuthService = {
  login,
  requestAccount,
  getCurrentUser,
  logout,
  checkApprovalStatus,
};

export default mockAuthService;
