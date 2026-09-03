/**
 * @module mockRoomService (Mobile)
 * Phase 3 — Room sync via AsyncStorage.
 * Rooms are stored under user-scoped keys so each account has isolated room data.
 */
// Removed expo-crypto to fix AES module error
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
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

async function loadRooms(): Promise<Room[]> {
  try {
    const raw = await uGet(ROOMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveRooms(rooms: Room[]): Promise<void> {
  await uSet(ROOMS_KEY, JSON.stringify(rooms));
}

async function registerGlobalOTP(otp: string, roomName: string, roomId: string, hostIp?: string, hostPort?: number): Promise<void> {
  try {
    const raw = await uGet(GLOBAL_OTP_KEY);
    const registry: Record<string, any> = raw ? JSON.parse(raw) : {};
    registry[otp] = { name: roomName, id: roomId, hostIp, hostPort, createdAt: new Date().toISOString() };
    await uSet(GLOBAL_OTP_KEY, JSON.stringify(registry));
  } catch { /* ignore */ }
}

async function lookupGlobalOTP(otp: string): Promise<{ name: string; id: string; hostIp?: string; hostPort?: number } | null> {
  try {
    const raw = await uGet(GLOBAL_OTP_KEY);
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

export async function listRooms(): Promise<Room[]> {
  await delay(300);
  return loadRooms();
}

export async function createRoom(name: string): Promise<Room> {
  if (!name.trim()) throw new Error('Room name cannot be empty.');
  let otp = genOTP();
  let isMatchmakerSuccess = false;

  try {
    const MATCHMAKER = process.env.EXPO_PUBLIC_MATCHMAKER_URL || 'https://docusync-dusky.vercel.app/api/lobby';
      
    const res = await fetch(`${MATCHMAKER}/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomName: name.trim(),
        hostNodeId: `mobile-${Date.now()}`,
        hostType: 'mobile'
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
    id: uuidv4(),
    name: name.trim(),
    otp,
    createdAt: new Date().toISOString(),
    peerCount: 1,
    isOwner: true,
    status: 'active',
    lastActivity: new Date().toISOString(),
    fileCount: 0,
  };
  const rooms = await loadRooms();
  await saveRooms([...rooms, room]);
  // Always register so peers can discover hostIp via the OTP registry
  await registerGlobalOTP(otp, room.name, room.id);
  return room;
}

export async function joinRoom(otp: string): Promise<Room> {
  const rooms = await loadRooms();
  const upperOtp = otp.toUpperCase();

  if (upperOtp === 'FAIL01' || otp.length < 5) {
    const err = new Error('Room not found. Check the invite code and try again.');
    (err as any).code = 'ROOM_NOT_FOUND';
    throw err;
  }

  const MATCHMAKER_URL = process.env.EXPO_PUBLIC_MATCHMAKER_URL || 'https://docusync-dusky.vercel.app/api/lobby';

  let apiRoomName: string | null = null;
  let apiHostIp: string | undefined;
  let apiHostPort: number | undefined;
  let apiHostType: 'desktop' | 'web' | 'mobile' = 'desktop';
  let apiMemberCount = 1;

  try {
    const res = await fetch(`${MATCHMAKER_URL}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp: upperOtp, clientNodeId: `mobile-join-${Date.now()}` }),
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

  const globalEntry = await lookupGlobalOTP(upperOtp);
  const roomName = apiRoomName ?? (globalEntry ? globalEntry.name : `Room ${upperOtp.slice(0, 3)}`);
  const targetIp = apiHostIp || globalEntry?.hostIp;
  const targetPort = apiHostPort || globalEntry?.hostPort || 9000;

  const existing = rooms.find(r => r.otp === upperOtp || r.id === otp);
  if (existing) {
    let changed = false;
    if (existing.name !== roomName) { existing.name = roomName; changed = true; }
    if (!existing.hostIp || existing.hostIp !== targetIp) { existing.hostIp = targetIp; changed = true; }
    if (!existing.hostPort || existing.hostPort !== targetPort) { existing.hostPort = targetPort; changed = true; }
    if (changed) await saveRooms(rooms);
    return existing;
  }

  const joined: Room = {
    id: globalEntry?.id ?? uuidv4(),
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
  await saveRooms([...rooms, joined]);
  return joined;
}

export async function deleteRoom(roomId: string): Promise<void> {
  await delay(300);
  const rooms = (await loadRooms()).filter(r => r.id !== roomId);
  await saveRooms(rooms);
}

export async function getRoom(roomId: string): Promise<Room | null> {
  await delay(200);
  return (await loadRooms()).find(r => r.id === roomId) ?? null;
}

const mockRoomService = { listRooms, createRoom, joinRoom, deleteRoom, getRoom };
export default mockRoomService;
