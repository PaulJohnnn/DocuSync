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
  if (import.meta.env.DEV) {
    return 'http://localhost:3000/api/lobby';
  }
  return 'https://docusync-pnc.vercel.app/api/lobby';
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

function registerGlobalOTP(otp: string, roomName: string, roomId: string): void {
  try {
    const raw = uGet(GLOBAL_OTP_KEY);
    const registry: Record<string, { name: string; id: string; createdAt: string }> = raw ? JSON.parse(raw) : {};
    registry[otp] = { name: roomName, id: roomId, createdAt: new Date().toISOString() };
    uSet(GLOBAL_OTP_KEY, JSON.stringify(registry));
  } catch { /* ignore */ }
}

function lookupGlobalOTP(otp: string): { name: string; id: string } | null {
  try {
    const raw = uGet(GLOBAL_OTP_KEY);
    if (!raw) return null;
    const registry: Record<string, { name: string; id: string }> = JSON.parse(raw);
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

    try {
      const MATCHMAKER = getMatchmakerUrl();
      const res = await fetch(`${MATCHMAKER}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: name.trim(),
          hostNodeId: `desktop-${Date.now()}`,
          hostIp: '127.0.0.1',
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
    };
    const rooms = loadRooms();
    saveRooms([...rooms, room]);
    if (!isMatchmakerSuccess) {
      registerGlobalOTP(otp, room.name, room.id);
    }
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
    await delay(900);
    const rooms = loadRooms();
    const upperOtp = otp.toUpperCase();

    if (upperOtp === 'FAIL01' || otp.length < 5) {
      const err = new Error('Room not found. Check the invite code and try again.');
      (err as any).code = 'ROOM_NOT_FOUND';
      throw err;
    }

    // ── Step 1: Always ask the web lobby API for the canonical room name ──
    const MATCHMAKER_URL = getMatchmakerUrl();

    let apiRoomName: string | null = null;
    let apiHostIp: string | undefined;
    let apiHostPort: number | undefined;
    let apiHostType: 'desktop' | 'web' | 'mobile' = 'web';
    let apiMemberCount = 1;

    try {
      const res = await fetch(`${MATCHMAKER_URL}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: upperOtp, clientNodeId: memberNodeId ?? `desktop-${Date.now()}` }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.roomName) {
          apiRoomName = data.roomName;
          apiHostIp = data.hostIp;
          apiHostPort = data.hostPort;
          apiHostType = data.hostType || 'web';
          apiMemberCount = data.memberCount || 1;
        }
      }
    } catch { /* offline – fall through to local lookup */ }

    // ── Step 2: Resolve the room name (API > global OTP > fallback) ──────
    const globalEntry = lookupGlobalOTP(upperOtp);
    const roomName = apiRoomName ?? (globalEntry ? globalEntry.name : `Room ${upperOtp.slice(0, 3)}`);

    // ── Step 3: If already stored locally, update its name and return ─────
    const existing = rooms.find(r => r.otp === upperOtp || r.id === otp);
    if (existing) {
      if (existing.name !== roomName) {
        existing.name = roomName;
        existing.roomName = roomName;
        saveRooms(rooms);
      }
      return existing;
    }

    // ── Step 4: Create a new local entry with the canonical name ──────────
    const joined: Room = {
      id: globalEntry?.id ?? otp,
      name: roomName,
      roomName,
      otp: upperOtp,
      createdAt: new Date().toISOString(),
      peerCount: apiMemberCount,
      isOwner: false,
      status: 'active',
      lastActivity: new Date().toISOString(),
      fileCount: 0,
      hostIp: apiHostIp,
      hostPort: apiHostPort,
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
