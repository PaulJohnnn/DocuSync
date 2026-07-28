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

const LOCAL_ADMIN_API  = 'https://docusync-pnc.vercel.app/api/admin';
const VERCEL_ADMIN_API = 'https://docusync-pnc.vercel.app/api/admin';

async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  try {
    const res = await fetch(`${LOCAL_ADMIN_API}${path}`, {
      ...options,
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok || res.status < 500) return res;
  } catch { /* local server not running — fall through to Vercel */ }
  return fetch(`${VERCEL_ADMIN_API}${path}`, options);
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
