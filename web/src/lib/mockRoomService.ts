/**
 * @module mockRoomService (Web)
 * Phase 3 — Cross-platform room sync.
 * Rooms are stored under user-scoped keys so each account has its own room list.
 */

import { uGet, uSet } from './userStorage';
import { getCurrentUser } from './mockAuthService';

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
  /** Whether this room is starred/favourited by the user */
  starred?: boolean;
  algorithm?: 'lww' | 'ot';
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

function registerGlobalOTP(otp: string, roomName: string, roomId: string, hostIp?: string, hostPort?: number): void {
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

/**
 * Address recorded as the room's peer host when the room is created from
 * the web.
 *
 * A browser cannot listen for connections — only the desktop app runs the
 * peer server on port 9000 — so this address is not a real host. It is kept
 * because `POST /api/lobby/create` rejects a room with no `hostIp` (400),
 * and the room record is what every peer looks up by invite code.
 *
 * The client must therefore NOT treat it as a reachable peer: see
 * `getSyncBaseUrl` in the editor, which refuses an address that is really
 * just this web app, so sync goes straight to the cloud relay instead of
 * paying a failed-connection timeout on every push and poll.
 */
function getWebHostIp(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return hostname;
    }
  }
  return '127.0.0.1';
}

// ── Service methods ────────────────────────────────────────────────────────

/** List all rooms this device has joined or created, updating with live data from matchmaker. */
export async function listRooms(): Promise<Room[]> {
  const localRooms = loadRooms();
  if (localRooms.length === 0) return [];
  
  try {
    const MATCHMAKER = process.env.NODE_ENV === 'development'
      ? '/api/lobby'
      : '/api/lobby';
      
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
export async function createRoom(name: string, algorithm: 'lww' | 'ot' = 'lww'): Promise<Room> {
  if (!name.trim()) throw new Error('Room name cannot be empty.');
  let otp = genOTP();
  let _isMatchmakerSuccess = false;

  try {
    const MATCHMAKER = process.env.NODE_ENV === 'development'
      ? '/api/lobby'
      : '/api/lobby';
      
    const res = await fetch(`${MATCHMAKER}/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomName: name.trim(),
        // This used to be a fresh `web-${Date.now()}` thrown away right
        // after creation — completely disconnected from this device's real,
        // persistent node id (the one every other call — heartbeat, lock,
        // kick — actually authenticates with). The server stores whatever
        // it's given here as the room's permanent hostNodeId, so every
        // later "am I the owner" check (e.g. POST /api/lobby/lock) failed
        // with 403 for literally every room ever created through this flow.
        hostNodeId: uGet('node_id') || `web-${Date.now()}`,
        // The account, so the owner is still the owner on their other
        // machine, in the desktop app, and after this browser is closed.
        hostAccountId: getCurrentUser()?.id ?? null,
        hostIp: getWebHostIp(),
        hostPort: 9000,
        hostType: 'web',
        algorithm
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.otp) {
        otp = data.otp;
        _isMatchmakerSuccess = true;
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
    hostIp: getWebHostIp(),
    hostPort: 9000,
    algorithm
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
  const upperOtp = otp.toUpperCase().trim();

  if (upperOtp === 'FAIL01' || upperOtp.length < 5) {
    const err = new Error('A room code is six characters.');
    (err as any).code = 'ROOM_NOT_FOUND';
    (err as any).reason = 'not_found';
    throw err;
  }

  const urlsToTry = Array.from(new Set([
    '/api/lobby',
    '/api/lobby'
  ]));

  let apiData: any = null;
  let matchmakerSuccess = false;
  let matchmakerError: string | null = null;
  /** Which kind of refusal it was, so the screen can say the right thing. */
  let matchmakerReason: string | null = null;

  for (const baseUrl of urlsToTry) {
    try {
      const res = await fetch(`${baseUrl}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: upperOtp, memberNodeId: `web-join-${Date.now()}` }),
        signal: AbortSignal.timeout(3000)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.roomName) {
        apiData = data;
        matchmakerSuccess = true;
        break;
      } else if (res.status === 404 || res.status === 410 || data.error) {
        matchmakerError = data.error || `No room is using the code ${upperOtp}.`;
        matchmakerReason = data.reason || null;
        break;
      }
    } catch {
      // try next
    }
  }

  if (matchmakerError) {
    const err = new Error(matchmakerError);
    // Carried through so the join screen can distinguish "closed" from
    // "no such room" instead of calling everything a missing room.
    (err as any).code = 'ROOM_NOT_FOUND';
    (err as any).reason = matchmakerReason;
    throw err;
  }

  const globalEntry = lookupGlobalOTP(upperOtp);

  if (!matchmakerSuccess && !globalEntry) {
    const existingLocal = rooms.find(r => r.otp === upperOtp || r.id === otp);
    if (!existingLocal) {
      const err = new Error(`No room is using the code ${upperOtp}.`);
      (err as any).code = 'ROOM_NOT_FOUND';
      (err as any).reason = 'not_found';
      throw err;
    }
  }

  /**
   * The room's id, which is not necessarily the code that was typed.
   *
   * They are the same until the code is replaced, and after that they
   * are not. Storing the typed code as the room's id was the bug behind
   * "we changed the code and now nobody can get in": the join itself
   * succeeded, and then every request afterwards -- the file list, the
   * documents, the presence heartbeat -- asked about a room under the
   * CODE instead of the room. Nothing was there, and the heartbeat's
   * self-heal then created an empty one at that name, so the person
   * ended up alone in a room that looked right and was not.
   *
   * The server returns the id for exactly this reason. Use it.
   */
  const resolvedOtp: string = apiData?.otp || upperOtp;
  const roomName = apiData?.roomName ?? (globalEntry ? globalEntry.name : `Room ${upperOtp}`);
  const targetIp = apiData?.hostIp || globalEntry?.hostIp;
  const targetPort = apiData?.hostPort || globalEntry?.hostPort || 9000;
  const apiMemberCount = apiData?.memberCount || 1;
  const algorithm = apiData?.algorithm || 'lww';

  // Matched on the room's id as well as on what was typed, so rejoining
  // with a newly issued code updates the room already held rather than
  // adding a second entry for the same place.
  const existing = rooms.find(r => r.otp === resolvedOtp || r.otp === upperOtp || r.id === otp);
  if (existing) {
    existing.name = roomName;
    existing.otp = resolvedOtp;
    existing.hostIp = targetIp;
    existing.hostPort = targetPort;
    saveRooms(rooms);
    return existing;
  }

  const joined: Room = {
    id: globalEntry?.id ?? crypto.randomUUID(),
    name: roomName,
    otp: resolvedOtp,
    createdAt: new Date().toISOString(),
    peerCount: apiMemberCount,
    isOwner: false,
    status: 'active',
    lastActivity: new Date().toISOString(),
    fileCount: 0,
    hostIp: targetIp || getWebHostIp(),
    hostPort: targetPort,
    algorithm
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

/** Toggle the starred state of a room by ID. */
export function toggleStar(roomId: string): void {
  const rooms = loadRooms();
  const room = rooms.find(r => r.id === roomId);
  if (room) {
    room.starred = !room.starred;
    saveRooms(rooms);
  }
}

const mockRoomService = { listRooms, createRoom, joinRoom, deleteRoom, getRoom, subscribeToRoomChanges, toggleStar };
export default mockRoomService;

