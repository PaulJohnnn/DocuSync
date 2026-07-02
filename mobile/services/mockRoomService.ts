/**
 * @module mockRoomService (Mobile)
 * Phase 3 — Room sync via AsyncStorage.
 * OTP codes created on Web/Desktop can be joined on Mobile by typing them in.
 * AsyncStorage bridges the data persistence on native.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

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
}

const STORAGE_KEY = '@docusync/mock_rooms';
const GLOBAL_OTP_KEY = '@docusync/global_otps';

function genOTP(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function loadRooms(): Promise<Room[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveRooms(rooms: Room[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
}

async function registerGlobalOTP(otp: string, roomName: string, roomId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(GLOBAL_OTP_KEY);
    const registry: Record<string, { name: string; id: string; createdAt: string }> = raw ? JSON.parse(raw) : {};
    registry[otp] = { name: roomName, id: roomId, createdAt: new Date().toISOString() };
    await AsyncStorage.setItem(GLOBAL_OTP_KEY, JSON.stringify(registry));
  } catch { /* ignore */ }
}

async function lookupGlobalOTP(otp: string): Promise<{ name: string; id: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(GLOBAL_OTP_KEY);
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

export async function listRooms(): Promise<Room[]> {
  await delay(300);
  return loadRooms();
}

export async function createRoom(name: string): Promise<Room> {
  await delay(800);
  if (!name.trim()) throw new Error('Room name cannot be empty.');
  const otp = genOTP();
  const room: Room = {
    id: Crypto.randomUUID(),
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
  await registerGlobalOTP(otp, room.name, room.id);
  return room;
}

export async function joinRoom(otp: string): Promise<Room> {
  await delay(900);
  const rooms = await loadRooms();
  const upperOtp = otp.toUpperCase();

  const existing = rooms.find(r => r.otp === upperOtp);
  if (existing) return existing;

  const globalEntry = await lookupGlobalOTP(upperOtp);

  if (upperOtp === 'FAIL01' || otp.length < 6) {
    const err = new Error('Room not found. Check the invite code and try again.');
    (err as any).code = 'ROOM_NOT_FOUND';
    throw err;
  }

  const roomName = globalEntry ? globalEntry.name : `Room ${upperOtp.slice(0, 3)}`;
  const joined: Room = {
    id: globalEntry?.id ?? Crypto.randomUUID(),
    name: roomName,
    otp: upperOtp,
    createdAt: new Date().toISOString(),
    peerCount: Math.floor(Math.random() * 3) + 2,
    isOwner: false,
    status: 'active',
    lastActivity: new Date().toISOString(),
    fileCount: 0,
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
