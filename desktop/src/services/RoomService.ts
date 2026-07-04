/**
 * @module RoomService (Desktop)
 * Phase 3 — Cross-platform room sync.
 * Uses the SAME localStorage keys as the web mockRoomService so rooms
 * created in the web app are instantly visible in the desktop app
 * (when both run in the same browser / Electron session).
 */

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

// Shared keys — MUST match web/src/lib/mockRoomService.ts
const STORAGE_KEY = 'docusync_mock_rooms';
const GLOBAL_OTP_KEY = 'docusync_global_otps';

function genOTP(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function loadRooms(): Room[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRooms(rooms: Room[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
  window.dispatchEvent(new Event('docusync_rooms_update'));
}

function registerGlobalOTP(otp: string, roomName: string, roomId: string): void {
  try {
    const raw = localStorage.getItem(GLOBAL_OTP_KEY);
    const registry: Record<string, { name: string; id: string; createdAt: string }> = raw ? JSON.parse(raw) : {};
    registry[otp] = { name: roomName, id: roomId, createdAt: new Date().toISOString() };
    localStorage.setItem(GLOBAL_OTP_KEY, JSON.stringify(registry));
  } catch { /* ignore */ }
}

function lookupGlobalOTP(otp: string): { name: string; id: string } | null {
  try {
    const raw = localStorage.getItem(GLOBAL_OTP_KEY);
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
    return loadRooms();
  }

  static async createRoom(name: string): Promise<Room> {
    await delay(800);
    if (!name.trim()) throw new Error('Room name cannot be empty.');
    const otp = genOTP();
    const room: Room = {
      id: crypto.randomUUID(),
      name: name.trim(),
      otp,
      createdAt: new Date().toISOString(),
      peerCount: 1,
      isOwner: true,
      status: 'active',
      lastActivity: new Date().toISOString(),
      fileCount: 0,
    };
    const rooms = loadRooms();
    saveRooms([...rooms, room]);
    registerGlobalOTP(otp, room.name, room.id);
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
   */
  static async joinRoom(otp: string, memberNodeId?: string): Promise<Room> {
    await delay(900);
    const rooms = loadRooms();
    const upperOtp = otp.toUpperCase();

    const existing = rooms.find(r => r.otp === upperOtp || r.id === otp);
    if (existing) return existing;

    const globalEntry = lookupGlobalOTP(upperOtp);

    if (upperOtp === 'FAIL01' || otp.length < 5) {
      const err = new Error('Room not found. Check the invite code and try again.');
      (err as any).code = 'ROOM_NOT_FOUND';
      throw err;
    }

    const roomName = globalEntry ? globalEntry.name : `Room ${upperOtp.slice(0, 3)}`;
    const joined: Room = {
      id: globalEntry?.id ?? otp,
      name: roomName,
      roomName,
      otp: upperOtp,
      createdAt: new Date().toISOString(),
      peerCount: Math.floor(Math.random() * 3) + 2,
      isOwner: false,
      status: 'active',
      lastActivity: new Date().toISOString(),
      fileCount: 0,
      hostType: 'desktop',
    };
    saveRooms([...rooms, joined]);
    return joined;
  }

  /** List files shared to a room (fetches from matchmaker) */
  static async listRoomFiles(roomId: string): Promise<any[]> {
    try {
      const MATCHMAKER = 'https://docu-sync-chi.vercel.app/api/lobby';
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
    try {
      const MATCHMAKER = 'https://docu-sync-chi.vercel.app/api/lobby';
      await fetch(`${MATCHMAKER}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: roomId, file }),
      });
    } catch { /* offline — ignore */ }
  }

  static subscribeToRoomChanges(callback: () => void): () => void {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === GLOBAL_OTP_KEY) callback();
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
