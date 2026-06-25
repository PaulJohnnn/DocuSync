/**
 * @module lobbyStore
 * Singleton in-memory lobby store for the Next.js Matchmaker API.
 * Uses global to survive Next.js HMR hot-reloads.
 */

export interface LobbyEntry {
  otp: string;
  roomName: string;
  hostNodeId: string;
  hostIp: string;
  hostPort: number;
  /** 'desktop' | 'web' | 'mobile' — indicates whether host has a real WS server */
  hostType?: 'desktop' | 'web' | 'mobile';
  createdAt: number;
  expiresAt: number;
  members: string[];
  peersJoined: number;
  files?: { fileName?: string; name?: string; [key: string]: unknown }[];
  /** @deprecated kept for backwards compat with old create route */
  ip?: string;
  /** @deprecated */
  port?: number;
  /** @deprecated */
  nodeId?: string;
}

export interface UserPresence {
  nodeId: string;
  lastActive: number;
  ip?: string;
}

// Use `global` to persist Map across Next.js HMR without re-initialising
const g = global as typeof globalThis & {
  _docusyncLobbies?: Map<string, LobbyEntry>;
  _docusyncRateLimits?: Map<string, number[]>;
  _docusyncUsers?: Map<string, UserPresence>;
};

if (!g._docusyncLobbies) {
  g._docusyncLobbies = new Map<string, LobbyEntry>();
}
if (!g._docusyncRateLimits) {
  g._docusyncRateLimits = new Map<string, number[]>();
}
if (!g._docusyncUsers) {
  g._docusyncUsers = new Map<string, UserPresence>();
}

export const activeLobbies   = g._docusyncLobbies!;
export const ipRateLimits    = g._docusyncRateLimits!;
export const activeUsers     = g._docusyncUsers!;

/** OTP TTL: 60 minutes */
const TTL = 60 * 60 * 1000;

/** Clean up expired rooms */
export function cleanupLobbies() {
  const now = Date.now();
  for (const [otp, lobby] of Array.from(activeLobbies.entries())) {
    if (now - lobby.createdAt > TTL) {
      activeLobbies.delete(otp);
    }
  }
}

/** Alias exported for legacy imports */
export const lobbyStore = activeLobbies;
