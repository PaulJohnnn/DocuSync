/**
 * @module lobbyStore
 * Types for the Next.js Matchmaker API using Upstash Redis.
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

// TTL logic is now handled natively by Redis (EX commands).
