/**
 * @module lobbyStore
 * Types for the Next.js Matchmaker API using Upstash Redis.
 */

/**
 * One file shared into a room.
 *
 * `fileId` is assigned once, by the server, and never changes for the life
 * of the room — see the comment in /api/lobby/files. `version` counts the
 * uploads that have landed on that id.
 */
export interface RoomFile {
  fileId?: string | number;
  id?: string | number;
  fileName?: string;
  name?: string;
  content?: string;
  version?: number;
  isDeleted?: boolean;
  deletedAt?: string;
  firstSharedAt?: number;
  updatedAt?: number;
  sharedBy?: string;
  sharedByNodeId?: string;
  sharedAt?: string;
  [key: string]: unknown;
}

/**
 * Who may edit one file while it is locked.
 *
 * This is deliberately separate from `LobbyEntry.isLocked`, which locks the
 * ROOM against new members joining. The panel asked for something different:
 * a lock on a document, naming the participants still allowed to type in it.
 * Only the room host can set either.
 */
export interface FileLock {
  locked: boolean;
  /**
   * Node ids that may still edit while locked. The host is always permitted
   * and is not required to appear here. Empty means host-only; everyone else
   * gets read-only access, which is the "allow viewing only for selected
   * participants" half of the request.
   */
  allowedNodeIds: string[];
  /**
   * Whether opening the file at all is restricted to chosen people.
   *
   * Deliberately separate from `locked`, which is about typing. A
   * supervisor's comments can be readable by everyone and editable by
   * nobody; a draft chapter can be hidden from the rest of the group
   * entirely. Those are different questions and the answer to one does
   * not imply the other.
   */
  openRestricted?: boolean;
  /** Node ids that may open it while `openRestricted`. */
  openNodeIds?: string[];
  lockedBy: string;
  lockedAt: number;
}

export interface LobbyEntry {
  otp: string;
  roomName: string;
  hostNodeId: string;
  /**
   * The ACCOUNT that owns this room, written when it is created.
   *
   * `hostNodeId` identifies a browser, not a person. The owner opening
   * their own room on a second machine, or in the desktop app, arrives
   * with a different node id and could only be recognised by looking up
   * the original one's presence record -- which expires five minutes
   * after that browser is closed. After which nobody was the owner of
   * the room, including its owner: no badge, no controls, and the
   * server refusing to change the code.
   *
   * Optional because rooms created before this did not record it; those
   * still fall back to the node id and the presence lookup.
   */
  hostAccountId?: string;
  hostIp: string;
  hostPort: number;
  /** 'desktop' | 'web' | 'mobile' — indicates whether host has a real WS server */
  hostType?: 'desktop' | 'web' | 'mobile';
  algorithm?: 'lww' | 'ot';
  createdAt: number;
  expiresAt: number;
  members: string[];
  peersJoined: number;
  files?: RoomFile[];
  isLocked?: boolean;
  /** Per-file edit permissions, keyed by `String(fileId)`. Host-set only. */
  fileLocks?: Record<string, FileLock>;
  /**
   * The six characters people type to join. Normally identical to `otp`,
   * which stays fixed for the room's whole life because every document key
   * (`doc_snapshot:<otp>:<fileId>` and friends) is derived from it. Rotating
   * only the join code lets a code expire without moving a single byte of
   * document state — see /api/lobby/join and the rotation in /api/lobby/heartbeat.
   */
  joinCode?: string;
  /** When the current `joinCode` stops being accepted. */
  joinCodeExpiresAt?: number;
  /** Node ids the host has kicked — heartbeat refuses to re-register them
   * and tells their own client to leave (see /api/lobby/kick). */
  kickedNodeIds?: string[];
  /** @deprecated kept for backwards compat with old create route */
  ip?: string;
  /** @deprecated */
  port?: number;
  /** @deprecated */
  nodeId?: string;
}

/**
 * Whether `nodeId` may type in `fileId` right now.
 *
 * Lives here, not in the lock route, because the editor and the sync path
 * must agree. A client that merely hides its toolbar is a suggestion rather
 * than a lock, so /api/lobby/doc calls this on every write and refuses the
 * ones it denies.
 */
export function canEditFile(
  lobby: LobbyEntry,
  fileId: string | number,
  nodeId: string | null | undefined
): boolean {
  const lock = lobby.fileLocks?.[String(fileId)];
  if (!lock || !lock.locked) return true;
  if (!nodeId) return false;
  // The host always keeps the keys to their own room, so a lock can never be
  // set in a way that locks everybody out with no way back.
  if (nodeId === lobby.hostNodeId) return true;
  return (lock.allowedNodeIds || []).includes(nodeId);
}

/**
 * Whether this person may open the file at all.
 *
 * Mirrors `canEditFile`: unrestricted means yes, the host always may,
 * and otherwise it is whoever was named. Kept here beside it so the two
 * rules cannot drift apart.
 */
export function canOpenFile(
  lobby: LobbyEntry,
  fileId: string | number,
  nodeId: string | null | undefined
): boolean {
  const lock = lobby.fileLocks?.[String(fileId)];
  if (!lock || !lock.openRestricted) return true;
  if (!nodeId) return false;
  if (nodeId === lobby.hostNodeId) return true;
  return (lock.openNodeIds || []).includes(nodeId);
}

/**
 * Is this person the owner of this room?
 *
 * In order of how much they can be trusted: the account recorded on the
 * room itself, which does not expire; the node that created it, which
 * only matches on that one machine; and finally the owner's presence
 * record, which is all an older room has and which lapses once they
 * close the browser.
 *
 * Takes the presence record rather than fetching it, so the callers
 * that already hold one do not read it twice.
 */
export function isRoomOwner(
  lobby: LobbyEntry,
  nodeId: string | null | undefined,
  accountId?: string | null,
  hostPresence?: { accountId?: string | null } | null,
): boolean {
  if (!!nodeId && lobby.hostNodeId === nodeId) return true;
  if (accountId && lobby.hostAccountId && lobby.hostAccountId === String(accountId)) return true;
  if (accountId && hostPresence?.accountId && hostPresence.accountId === String(accountId)) return true;
  return false;
}

export interface UserPresence {
  nodeId: string;
  lastActive: number;
  ip?: string;
}

// TTL logic is now handled natively by Redis (EX commands).
