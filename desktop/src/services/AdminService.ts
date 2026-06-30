/**
 * @module AdminService
 * Single Responsibility: Admin-specific operations.
 * Stubs backed by IPC channels — to be wired in Phase 2 (Admin Role fix).
 * Created now so AdminPage.tsx can import cleanly without inline fetch logic.
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

const ADMIN_API = 'http://localhost:3000/api/admin';

class AdminService {
  /**
   * Marks an account (by nodeId) as verified in the matchmaker.
   */
  static async verifyAccount(nodeId: string): Promise<void> {
    const res = await fetch(`${ADMIN_API}/verify`, {
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
    const res = await fetch(`${ADMIN_API}/generate`, {
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
    const res = await fetch(`${ADMIN_API}/delete-group`, {
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
      const res = await fetch(`${ADMIN_API}/session-log?limit=${limit}`);
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
      const res = await fetch(`${ADMIN_API}/stats`);
      if (!res.ok) return { rooms: [], users: [], totalRooms: 0, totalUsers: 0 };
      return await res.json();
    } catch {
      return { rooms: [], users: [], totalRooms: 0, totalUsers: 0 };
    }
  }
}

export default AdminService;
