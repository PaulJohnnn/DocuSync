export interface FileEntry { fileName?: string; name?: string; [key: string]: unknown }

export interface Lobby {
  otp: string;
  ip: string;
  port: number;
  nodeId: string;
  roomName?: string;
  files?: FileEntry[];
  createdAt: number;
  peersJoined: number;
}

// Use global to persist Map across Next.js HMR
const globalWithMap = global as typeof globalThis & {
  activeLobbies?: Map<string, Lobby>;
  ipRateLimits?: Map<string, number[]>;
};

if (!globalWithMap.activeLobbies) {
  globalWithMap.activeLobbies = new Map<string, Lobby>();
}
if (!globalWithMap.ipRateLimits) {
  globalWithMap.ipRateLimits = new Map<string, number[]>();
}

export const activeLobbies = globalWithMap.activeLobbies;
export const ipRateLimits = globalWithMap.ipRateLimits;

// TTL: 30 minutes for OTP expiry
const TTL = 30 * 60 * 1000;
// IP Rate Limit Window: 1 hour
const RATE_LIMIT_WINDOW = 60 * 60 * 1000;

export function cleanupLobbies() {
  const now = Date.now();
  for (const [otp, lobby] of Array.from(activeLobbies.entries())) {
    if (now - lobby.createdAt > TTL) {
      activeLobbies.delete(otp);
    }
  }

  for (const [ip, timestamps] of Array.from(ipRateLimits.entries())) {
    const validTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
    if (validTimestamps.length === 0) {
      ipRateLimits.delete(ip);
    } else {
      ipRateLimits.set(ip, validTimestamps);
    }
  }
}
