/**
 * @module RoomService (Desktop)
 * Phase 3 — Cross-platform room sync.
 * Uses user-scoped localStorage keys so each account has isolated room data.
 */

import { uGet, uSet } from '../utils/userStorage';

export interface Room {
  id: string;
  name: string;
  otp: string;
  createdAt: string;
  peerCount: number;
  isOwner: boolean;
  status: 'active' | 'idle' | 'inactive';
  lastActivity?: string;
  fileCount?: number;
  // Phase 3 matchmaker fields (populated when joining via Redis OTP)
  roomName?: string;
  hostNodeId?: string;
  hostIp?: string;
  hostPort?: number;
  hostType?: 'desktop' | 'web' | 'mobile';
}

// User-scoped storage keys (resolved at call time via userStorage)
const ROOMS_KEY = 'rooms';
const GLOBAL_OTP_KEY = 'global_otps';

function genOTP(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function getMatchmakerUrl(): string {
  if (import.meta.env.VITE_WEB_URL) {
    return `${import.meta.env.VITE_WEB_URL}/api/lobby`;
  }
  // Default to the live matchmaker in all environments (even dev) to avoid localhost routing issues
  return import.meta.env.DEV ? 'http://localhost:3000/api/lobby' : 'https://docusync-pnc.vercel.app/api/lobby';
}

function loadRooms(): Room[] {
  try {
    const raw = uGet(ROOMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRooms(rooms: Room[]): void {
  uSet(ROOMS_KEY, JSON.stringify(rooms));
  window.dispatchEvent(new Event('docusync_rooms_update'));
}

function registerGlobalOTP(otp: string, roomName: string, roomId: string, hostIp?: string, hostPort?: number): void {
  try {
    const raw = uGet(GLOBAL_OTP_KEY);
    const registry: Record<string, any> = raw ? JSON.parse(raw) : {};
    registry[otp] = { name: roomName, id: roomId, hostIp, hostPort, createdAt: new Date().toISOString() };
    uSet(GLOBAL_OTP_KEY, JSON.stringify(registry));
  } catch { /* ignore */ }
}

function lookupGlobalOTP(otp: string): { name: string; id: string; hostIp?: string; hostPort?: number } | null {
  try {
    const raw = uGet(GLOBAL_OTP_KEY);
    if (!raw) return null;
    const registry: Record<string, any> = JSON.parse(raw);
    return registry[otp.toUpperCase()] ?? null;
  } catch {
    return null;
  }
}

function delay(ms = 600): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
}

class RoomService {
  static async listRooms(): Promise<Room[]> {
    await delay(300);
    const rooms = loadRooms();
    // Refresh room names from the web lobby so they stay in sync
    try {
      const MATCHMAKER = getMatchmakerUrl();
      const res = await fetch(`${MATCHMAKER}/list`);
      if (res.ok) {
        const data = await res.json();
        const lobbyRooms: Array<{ otp: string; name?: string; roomName?: string; peersJoined?: number }> = data.rooms || [];
        let changed = false;
        for (const lr of lobbyRooms) {
          const canonical = lr.roomName || lr.name;
          if (!canonical) continue;
          const local = rooms.find(r => r.otp === lr.otp || r.otp === lr.otp?.toUpperCase());
          if (local && local.name !== canonical) {
            local.name = canonical;
            local.roomName = canonical;
            changed = true;
          }
        }
        if (changed) saveRooms(rooms);
      }
    } catch { /* offline */ }
    return rooms;
  }

  static async createRoom(name: string): Promise<Room> {
    if (!name.trim()) throw new Error('Room name cannot be empty.');
    let otp = genOTP();
    let isMatchmakerSuccess = false;
    
    let hostIp: string | undefined;
    if (typeof window !== 'undefined' && (window as any).docuSync && (window as any).docuSync.getLanIp) {
      try {
        const res = await (window as any).docuSync.getLanIp();
        if (res && res.success === true && typeof res.data === 'string') {
          hostIp = res.data;
        } else if (res && typeof res === 'string') { // Fallback if it directly returns string
          hostIp = res;
        } else if (res && res.success === false && res.error) {
          throw new Error(res.error);
        }
      } catch (e: any) {
        throw new Error(e.message || 'No network connection detected — connect to Wi-Fi or Ethernet to host a room.');
      }
    }

    try {
      const MATCHMAKER = getMatchmakerUrl();
      const res = await fetch(`${MATCHMAKER}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: name.trim(),
          hostNodeId: `desktop-${Date.now()}`,
          hostIp: hostIp,
          hostPort: 9000,
          hostType: 'desktop'
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.otp) {
          otp = data.otp;
          isMatchmakerSuccess = true;
        }
      }
    } catch {
      // Offline fallback
    }

    const room: Room = {
      id: crypto.randomUUID(),
      name: name.trim(),
      roomName: name.trim(),
      otp,
      createdAt: new Date().toISOString(),
      peerCount: 1,
      isOwner: true,
      status: 'active',
      lastActivity: new Date().toISOString(),
      fileCount: 0,
      hostType: 'desktop',
      hostIp: hostIp,
      hostPort: 9000,
    };
    const rooms = loadRooms();
    saveRooms([...rooms, room]);
    registerGlobalOTP(otp, room.name, room.id, room.hostIp, room.hostPort);
    return room;
  }




  static async deleteRoom(roomId: string): Promise<void> {
    await delay(300);
    const rooms = loadRooms().filter(r => r.id !== roomId);
    saveRooms(rooms);
  }

  static async getRoom(roomId: string): Promise<Room | null> {
    await delay(200);
    return loadRooms().find(r => r.id === roomId) ?? null;
  }

  /**
   * joinRoom — overloaded to accept an optional memberNodeId
   * used by the FilesPage "Join Repository" flow (Phase 3 live)
   * Always queries the web lobby API first so the room name is consistent
   * across all platforms.
   */
  static async joinRoom(otp: string, memberNodeId?: string): Promise<Room> {
    await delay(500);
    const rooms = loadRooms();
    const upperOtp = otp.toUpperCase().trim();

    if (upperOtp === 'FAIL01' || upperOtp.length < 5) {
      const err = new Error('Room not found. Check the invite code and try again.');
      (err as any).code = 'ROOM_NOT_FOUND';
      throw err;
    }

    const nodeId = memberNodeId ?? `desktop-${Date.now()}`;
    const urlsToTry = Array.from(new Set([
      getMatchmakerUrl(),
      'http://localhost:3000/api/lobby',
      'https://docusync-pnc.vercel.app/api/lobby',
    ]));

    let apiData: any = null;
    let matchmakerSuccess = false;
    let matchmakerError: string | null = null;

    for (const baseUrl of urlsToTry) {
      try {
        const res = await fetch(`${baseUrl}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otp: upperOtp, memberNodeId: nodeId, clientNodeId: nodeId }),
          signal: AbortSignal.timeout(3000),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.roomName) {
          apiData = data;
          matchmakerSuccess = true;
          break;
        } else if (res.status === 404 || res.status === 410 || data.error) {
          matchmakerError = data.error || `Room not found. No active room with OTP "${upperOtp}".`;
          break; // Matchmaker explicitly confirmed room does not exist
        }
      } catch {
        // Network error on this endpoint, try next URL
      }
    }

    if (matchmakerError) {
      const err = new Error(matchmakerError);
      (err as any).code = 'ROOM_NOT_FOUND';
      throw err;
    }

    const globalEntry = lookupGlobalOTP(upperOtp);

    // If matchmaker didn't succeed AND no local entry exists, throw room not found
    if (!matchmakerSuccess && !globalEntry) {
      const existingLocal = rooms.find(r => r.otp === upperOtp || r.id === otp);
      if (!existingLocal) {
        const err = new Error(`Room not found. No active room with OTP "${upperOtp}". Ask the host to generate a new code.`);
        (err as any).code = 'ROOM_NOT_FOUND';
        throw err;
      }
    }

    const roomName = apiData?.roomName ?? (globalEntry ? globalEntry.name : `Room ${upperOtp}`);
    const targetIp = apiData?.hostIp || globalEntry?.hostIp;
    const targetPort = apiData?.hostPort || globalEntry?.hostPort || 9000;
    const apiHostType = apiData?.hostType || 'web';
    const apiMemberCount = apiData?.memberCount || 1;

    const existing = rooms.find(r => r.otp === upperOtp || r.id === otp);
    if (existing) {
      existing.name = roomName;
      existing.roomName = roomName;
      existing.hostIp = targetIp;
      existing.hostPort = targetPort;
      saveRooms(rooms);
      return existing;
    }

    const joined: Room = {
      id: globalEntry?.id ?? upperOtp,
      name: roomName,
      roomName,
      otp: upperOtp,
      createdAt: new Date().toISOString(),
      peerCount: apiMemberCount,
      isOwner: false,
      status: 'active',
      lastActivity: new Date().toISOString(),
      fileCount: 0,
      hostIp: targetIp,
      hostPort: targetPort,
      hostType: apiHostType,
    };
    saveRooms([...rooms, joined]);
    return joined;
  }

  /** List files shared to a room (fetches from matchmaker) */
  static async listRoomFiles(roomId: string): Promise<any[]> {
    try {
      const MATCHMAKER = getMatchmakerUrl();
      const res = await fetch(`${MATCHMAKER}/files?otp=${encodeURIComponent(roomId)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.files || [];
    } catch {
      return [];
    }
  }

  /** Share a file into a room by posting it to the matchmaker */
  static async shareFileToRoom(roomId: string, file: Record<string, unknown>): Promise<void> {
    const MATCHMAKER = getMatchmakerUrl();
    const res = await fetch(`${MATCHMAKER}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp: roomId, file }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(`Failed to upload to room: ${data.error || 'Server error'}. Please rejoin.`);
    }
  }

  static subscribeToRoomChanges(callback: () => void): () => void {
    const handleStorage = (e: StorageEvent) => {
      if (e.key && (e.key.endsWith('_rooms') || e.key.endsWith('_global_otps'))) callback();
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('docusync_rooms_update', callback);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('docusync_rooms_update', callback);
    };
  }
}

export default RoomService;
