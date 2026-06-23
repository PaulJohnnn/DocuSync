export interface Lobby {
  otp: string;
  ip: string;
  port: number;
  nodeId: string;
  roomName?: string;
  files?: any[];
  createdAt: number;
}

// Use global to persist Map across Next.js HMR
const globalWithMap = global as typeof globalThis & {
  activeLobbies?: Map<string, Lobby>;
};

if (!globalWithMap.activeLobbies) {
  globalWithMap.activeLobbies = new Map<string, Lobby>();
}

export const activeLobbies = globalWithMap.activeLobbies;

// TTL: 60 minutes
const TTL = 60 * 60 * 1000;

export function cleanupLobbies() {
  const now = Date.now();
  for (const [otp, lobby] of Array.from(activeLobbies.entries())) {
    if (now - lobby.createdAt > TTL) {
      activeLobbies.delete(otp);
    }
  }
}
