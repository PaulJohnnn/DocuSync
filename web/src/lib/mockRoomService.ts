/**
 * @module mockRoomService (Web)
 * Phase 3 — Cross-platform room sync.
 * Rooms are stored in localStorage under a SHARED key so that any OTP code
 * created on Web can be joined on Desktop (same browser), and vice-versa.
 *
 * Mobile uses AsyncStorage with the same key format; bridging across
 * native/web requires the same OTP to be typed in manually, which is the
 * intended UX for a P2P sync demo.
 */

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
}

// ── Shared storage key — same key used by Desktop RoomService ──────────────
const STORAGE_KEY = 'docusync_mock_rooms';
// Global OTP registry — allows cross-device join simulation within same browser
const GLOBAL_OTP_KEY = 'docusync_global_otps';

function genOTP(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function loadRooms(): Room[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRooms(rooms: Room[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
  // Notify other components (same-tab)
  window.dispatchEvent(new Event('docusync_rooms_update'));
}

function registerGlobalOTP(otp: string, roomName: string, roomId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(GLOBAL_OTP_KEY);
    const registry: Record<string, { name: string; id: string; createdAt: string }> = raw ? JSON.parse(raw) : {};
    registry[otp] = { name: roomName, id: roomId, createdAt: new Date().toISOString() };
    localStorage.setItem(GLOBAL_OTP_KEY, JSON.stringify(registry));
  } catch { /* ignore */ }
}

function lookupGlobalOTP(otp: string): { name: string; id: string } | null {
  if (typeof window === 'undefined') return null;
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

// ── Service methods ────────────────────────────────────────────────────────

/** List all rooms this device has joined or created. */
export async function listRooms(): Promise<Room[]> {
  await delay(300);
  return loadRooms();
}

/** Create a new room with the given name. Returns the created room + OTP. */
export async function createRoom(name: string): Promise<Room> {
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
  // Register the OTP globally so other tabs/platforms can join
  registerGlobalOTP(otp, room.name, room.id);
  return room;
}

/** Join a room using an OTP. Throws if invalid. */
export async function joinRoom(otp: string): Promise<Room> {
  await delay(900);
  const rooms = loadRooms();
  const upperOtp = otp.toUpperCase();

  // Already have this room locally
  const existing = rooms.find(r => r.otp === upperOtp);
  if (existing) return existing;

  // Check global OTP registry (cross-tab created rooms)
  const globalEntry = lookupGlobalOTP(upperOtp);

  // Hard fail
  if (upperOtp === 'FAIL01' || otp.length < 6) {
    const err = new Error('Room not found. Check the invite code and try again.');
    (err as any).code = 'ROOM_NOT_FOUND';
    throw err;
  }

  // If not in global registry, simulate finding a remote room
  const roomName = globalEntry ? globalEntry.name : `Room ${upperOtp.slice(0, 3)}`;
  const joined: Room = {
    id: globalEntry?.id ?? crypto.randomUUID(),
    name: roomName,
    otp: upperOtp,
    createdAt: new Date().toISOString(),
    peerCount: Math.floor(Math.random() * 3) + 2,
    isOwner: false,
    status: 'active',
    lastActivity: new Date().toISOString(),
    fileCount: 0,
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
    if (e.key === STORAGE_KEY || e.key === GLOBAL_OTP_KEY) callback();
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
