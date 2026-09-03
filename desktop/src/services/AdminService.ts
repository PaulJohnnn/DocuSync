/**
 * @module AdminService
 * Single Responsibility: Admin-specific operations.
 * Stubs backed by IPC channels — wired in Phase 2 (Admin Role fix).
 */
import { ServiceError } from './errors/ServiceError';

export interface SessionLogEntry {
  timestamp: number;
  nodeId: string;
  action: string;
  detail?: string;
}

export interface GenerateAccountResult {
  nodeId: string;
  tempPin: string;
}

const getAdminUrl = () => {
  if (import.meta.env.VITE_WEB_URL) {
    return `${import.meta.env.VITE_WEB_URL}/api/admin`;
  }
  // Default to the live admin API in all environments
  return import.meta.env.DEV ? 'http://localhost:3000/api/admin' : 'https://docusync-dusky.vercel.app/api/admin';
};

async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  try {
    const res = await fetch(`${getAdminUrl()}${path}`, {
      ...options,
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok || res.status < 500) return res;
  } catch { /* if local fails and we want to fallback, we can, but we shouldn't mix if they forced an IP */ }
  // Only fallback to Vercel if VITE_WEB_URL was NOT explicitly set
  if (!import.meta.env.VITE_WEB_URL) {
    return fetch(`https://docusync-dusky.vercel.app/api/admin${path}`, options);
  }
  throw new Error('Admin API request failed');
}

class AdminService {
  /**
   * Marks an account (by nodeId) as verified in the matchmaker.
   */
  static async verifyAccount(nodeId: string): Promise<void> {
    const res = await adminFetch('/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ServiceError('AdminService.verifyAccount', data.error ?? 'Verification failed.');
    }
  }

  /**
   * Provisions a new account and returns a temporary Node ID + PIN.
   */
  static async generateAccount(displayName: string): Promise<GenerateAccountResult> {
    const res = await adminFetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ServiceError('AdminService.generateAccount', data.error ?? 'Account generation failed.');
    return { nodeId: data.nodeId, tempPin: data.tempPin };
  }

  /**
   * Deletes a group (room) by its OTP from the matchmaker.
   */
  static async deleteGroup(otp: string): Promise<void> {
    const res = await adminFetch('/delete-group', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ServiceError('AdminService.deleteGroup', data.error ?? 'Delete group failed.');
    }
  }

  /**
   * Retrieves the system session activity log (read-only).
   */
  static async getSessionLog(limit = 50): Promise<SessionLogEntry[]> {
    try {
      const res = await adminFetch(`/session-log?limit=${limit}`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.log ?? []) as SessionLogEntry[];
    } catch {
      return [];
    }
  }

  /**
   * Fetches global stats (rooms, users) for the admin dashboard.
   */
  static async getStats(): Promise<{ rooms: any[]; users: any[]; totalRooms: number; totalUsers: number }> {
    try {
      const res = await adminFetch('/stats');
      if (!res.ok) return { rooms: [], users: [], totalRooms: 0, totalUsers: 0 };
      return await res.json();
    } catch {
      return { rooms: [], users: [], totalRooms: 0, totalUsers: 0 };
    }
  }
}

export default AdminService;
