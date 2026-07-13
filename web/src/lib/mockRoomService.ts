/**
 * @module mockRoomService (Web)
 * Phase 3 — Cross-platform room sync.
 * Rooms are stored under user-scoped keys so each account has its own room list.
 */

import { uGet, uSet } from './userStorage';

export interface Room {
  id: string;
  name: string;
  otp: string;           // 6-char invite code
  createdAt: string;
  peerCount: number;
  isOwner: boolean;
  status: 'active' | 'idle' | 'inactive';
  /** ISO timestamp of the last file sync activity */
  lastActivity?: string;
  /** Number of files currently in the room */
  fileCount?: number;
  hostIp?: string;
  hostPort?: number;
}

// User-scoped storage keys (resolved at call time)
const ROOMS_KEY = 'rooms';
const GLOBAL_OTP_KEY = 'global_otps';

function genOTP(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function loadRooms(): Room[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = uGet(ROOMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRooms(rooms: Room[]): void {
  if (typeof window === 'undefined') return;
  uSet(ROOMS_KEY, JSON.stringify(rooms));
  window.dispatchEvent(new Event('docusync_rooms_update'));
}

function registerGlobalOTP(otp: string, roomName: string, roomId: string, hostIp = '127.0.0.1', hostPort = 9000): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = uGet(GLOBAL_OTP_KEY);
    const registry: Record<string, any> = raw ? JSON.parse(raw) : {};
    registry[otp] = { name: roomName, id: roomId, hostIp, hostPort, createdAt: new Date().toISOString() };
    uSet(GLOBAL_OTP_KEY, JSON.stringify(registry));
  } catch { /* ignore */ }
}

function lookupGlobalOTP(otp: string): { name: string; id: string; hostIp?: string; hostPort?: number } | null {
  if (typeof window === 'undefined') return null;
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

// ── Service methods ────────────────────────────────────────────────────────

/** List all rooms this device has joined or created, updating with live data from matchmaker. */
export async function listRooms(): Promise<Room[]> {
  const localRooms = loadRooms();
  if (localRooms.length === 0) return [];
  
  try {
    const MATCHMAKER = process.env.NODE_ENV === 'development'
      ? '/api/lobby'
      : 'https://docusync-pnc.vercel.app/api/lobby';
      
    const res = await fetch(`${MATCHMAKER}/list`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.rooms) {
        const liveMap = new Map(data.rooms.map((r: any) => [r.id, r]));
        let changed = false;
        for (const room of localRooms) {
          const live = liveMap.get(room.otp) as any;
          if (live) {
            if (room.peerCount !== live.peersJoined || room.fileCount !== live.filesCount) {
              room.peerCount = live.peersJoined;
              room.fileCount = live.filesCount;
              changed = true;
            }
          }
        }
        if (changed) saveRooms(localRooms);
      }
    }
  } catch { /* offline fallback */ }

  return localRooms;
}

/** Create a new room with the given name. Returns the created room + OTP. */
export async function createRoom(name: string): Promise<Room> {
  if (!name.trim()) throw new Error('Room name cannot be empty.');
  let otp = genOTP();
  let isMatchmakerSuccess = false;

  try {
    const MATCHMAKER = process.env.NODE_ENV === 'development'
      ? '/api/lobby'
      : 'https://docusync-pnc.vercel.app/api/lobby';
      
    const res = await fetch(`${MATCHMAKER}/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomName: name.trim(),
        hostNodeId: `web-${Date.now()}`,
        hostIp: '127.0.0.1',
        hostPort: 9000,
        hostType: 'web'
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
    otp,
    createdAt: new Date().toISOString(),
    peerCount: 1,
    isOwner: true,
    status: 'active',
    lastActivity: new Date().toISOString(),
    fileCount: 0,
    hostIp: '127.0.0.1',
    hostPort: 9000,
  };
  const rooms = loadRooms();
  saveRooms([...rooms, room]);
  // Always register so joiners can discover hostIp via the OTP registry
  registerGlobalOTP(otp, room.name, room.id, room.hostIp, room.hostPort);
  return room;
}

/** Join a room using an OTP. Throws if invalid. */
export async function joinRoom(otp: string): Promise<Room> {
  const rooms = loadRooms();
  const upperOtp = otp.toUpperCase();

  if (upperOtp === 'FAIL01' || otp.length < 5) {
    const err = new Error('Room not found. Check the invite code and try again.');
    (err as any).code = 'ROOM_NOT_FOUND';
    throw err;
  }

  const MATCHMAKER_URL = process.env.NODE_ENV === 'development'
    ? '/api/lobby'
    : 'https://docusync-pnc.vercel.app/api/lobby';

  let apiRoomName: string | null = null;
  let apiHostIp: string | undefined;
  let apiHostPort: number | undefined;
  let apiHostType: 'desktop' | 'web' | 'mobile' = 'desktop';
  let apiMemberCount = 1;

  try {
    const res = await fetch(`${MATCHMAKER_URL}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp: upperOtp, clientNodeId: `web-join-${Date.now()}` }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.roomName) {
        apiRoomName = data.roomName;
        apiHostIp = data.hostIp;
        apiHostPort = data.hostPort;
        apiHostType = data.hostType || 'desktop';
        apiMemberCount = data.memberCount || 1;
      }
    }
  } catch { /* offline – fall through to local lookup */ }

  const globalEntry = lookupGlobalOTP(upperOtp);
  const roomName = apiRoomName ?? (globalEntry ? globalEntry.name : `Room ${upperOtp.slice(0, 3)}`);
  const targetIp = apiHostIp || globalEntry?.hostIp || '127.0.0.1';
  const targetPort = apiHostPort || globalEntry?.hostPort || 9000;

  const existing = rooms.find(r => r.otp === upperOtp || r.id === otp);
  if (existing) {
    let changed = false;
    if (existing.name !== roomName) { existing.name = roomName; changed = true; }
    if (!existing.hostIp || existing.hostIp !== targetIp) { existing.hostIp = targetIp; changed = true; }
    if (!existing.hostPort || existing.hostPort !== targetPort) { existing.hostPort = targetPort; changed = true; }
    if (changed) saveRooms(rooms);
    return existing;
  }

  const joined: Room = {
    id: globalEntry?.id ?? crypto.randomUUID(),
    name: roomName,
    otp: upperOtp,
    createdAt: new Date().toISOString(),
    peerCount: apiMemberCount,
    isOwner: false,
    status: 'active',
    lastActivity: new Date().toISOString(),
    fileCount: 0,
    hostIp: targetIp,
    hostPort: targetPort,
  };
  saveRooms([...rooms, joined]);
  return joined;
}

/** Delete / leave a room by ID. */
export async function deleteRoom(roomId: string): Promise<void> {
  await delay(300);
  const rooms = loadRooms().filter(r => r.id !== roomId);
  saveRooms(rooms);
}

/** Get one room by ID. */
export async function getRoom(roomId: string): Promise<Room | null> {
  await delay(200);
  return loadRooms().find(r => r.id === roomId) ?? null;
}

/** Subscribe to room list changes (cross-tab + same-tab). */
export function subscribeToRoomChanges(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleStorage = (e: StorageEvent) => {
    if (e.key === ROOMS_KEY || e.key === GLOBAL_OTP_KEY) callback();
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener('docusync_rooms_update', callback);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('docusync_rooms_update', callback);
  };
}

const mockRoomService = { listRooms, createRoom, joinRoom, deleteRoom, getRoom, subscribeToRoomChanges };
export default mockRoomService;
