export interface Lobby {
  otp: string;
  ip: string;
  port: number;
  nodeId: string;
  createdAt: number;
}

// Use global to persist Map across Next.js HMR
const globalAny = global as any;
if (!globalAny.activeLobbies) {
  globalAny.activeLobbies = new Map<string, Lobby>();
}

export const activeLobbies = globalAny.activeLobbies as Map<string, Lobby>;

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
