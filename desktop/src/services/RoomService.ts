/**
 * @module RoomService
 * Single Responsibility: Matchmaker API (lobby) communication.
 * Wraps all fetch() calls to the Next.js matchmaker and normalises errors.
 * Falls back from localhost to Vercel production automatically.
 */
import { ServiceError } from './errors/ServiceError';

export interface RoomCreateResult {
  otp: string;
  roomName: string;
}

export interface RoomJoinResult {
  hostIp: string;
  hostPort: number;
  roomName: string;
  hostType: 'desktop' | 'web' | 'mobile';
  memberCount: number;
}

export interface RoomStatus {
  otp: string;
  roomName: string;
  memberCount: number;
  filesCount: number;
  peers: Array<{ nodeId: string; isOnline: boolean }>;
}

export interface RoomListResult {
  id: string;
  name: string;
  peersJoined: number;
  filesCount: number;
}

const LOCAL_MATCHMAKER  = 'http://localhost:3000/api/lobby';
const VERCEL_MATCHMAKER = 'https://docusync-pnc.vercel.app/api/lobby';

async function matchmakerFetch(path: string, options: RequestInit = {}): Promise<Response> {
  try {
    const res = await fetch(`${LOCAL_MATCHMAKER}${path}`, {
      ...options,
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok || res.status < 500) return res;
  } catch { /* local server not running — fall through to Vercel */ }
  return fetch(`${VERCEL_MATCHMAKER}${path}`, options);
}

class RoomService {
  /**
   * Creates a new collaboration room and returns the OTP.
   */
  static async createRoom(
    roomName: string,
    hostNodeId: string,
    hostIp: string,
    hostPort: number
  ): Promise<RoomCreateResult> {
    const res = await matchmakerFetch('/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostNodeId, hostIp, hostPort, nodeId: hostNodeId, ip: hostIp, port: hostPort, roomName }),
    });
    const data = await res.json();
    if (!res.ok) throw new ServiceError('RoomService.createRoom', data.error ?? 'Failed to create room.');
    return { otp: data.otp, roomName };
  }

  /**
   * Joins an existing room by OTP and returns host connection info.
   */
  static async joinRoom(otp: string, clientNodeId: string): Promise<RoomJoinResult> {
    const res = await matchmakerFetch('/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp, clientNodeId }),
    });
    const data = await res.json();
    if (!res.ok) throw new ServiceError('RoomService.joinRoom', data.error ?? 'Invalid session or OTP.');
    return {
      hostIp:      data.hostIp || data.ip,
      hostPort:    data.hostPort || data.port,
      roomName:    data.roomName ?? 'OTP Session',
      hostType:    data.hostType ?? 'desktop',
      memberCount: data.memberCount ?? 1,
    };
  }

  /**
   * Polls the room status (members, files) for a given OTP.
   */
  static async pollRoom(otp: string): Promise<RoomStatus | null> {
    try {
      const res = await matchmakerFetch(`/status?otp=${otp}`, { signal: AbortSignal.timeout(3000) } as RequestInit);
      if (!res.ok) return null;
      return await res.json() as RoomStatus;
    } catch {
      return null;
    }
  }

  /**
   * Lists all active public rooms on the matchmaker.
   */
  static async listRooms(): Promise<RoomListResult[]> {
    try {
      const res = await matchmakerFetch('/list');
      if (!res.ok) return [];
      const data = await res.json();
      return (data.rooms ?? []) as RoomListResult[];
    } catch {
      return [];
    }
  }

  /**
   * Lists files shared in a specific room.
   */
  static async listRoomFiles(otp: string): Promise<any[]> {
    try {
      const res = await matchmakerFetch(`/files?otp=${otp}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.files ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Shares a file into a room.
   */
  static async shareFileToRoom(otp: string, file: { fileId: number; fileName: string; filePath: string; contentLength: number; content?: string }): Promise<void> {
    const res = await matchmakerFetch('/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp, file }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ServiceError('RoomService.shareFileToRoom', data.error ?? 'Failed to share file.');
    }
  }
}

export default RoomService;
