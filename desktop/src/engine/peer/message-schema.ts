/**
 * @module MessageSchema
 *
 * TypeScript interfaces and runtime validation for all P2P WebSocket
 * message types in the DocuSync sync engine.
 *
 * Every message that enters the system from a WebSocket connection MUST
 * pass through {@link validateMessage} before any processing occurs.
 * Malformed or unknown messages are rejected immediately — the engine
 * never operates on unvalidated input.
 *
 * **Message taxonomy:**
 *
 * | Type             | Direction      | Purpose                                 |
 * |------------------|----------------|-----------------------------------------|
 * | `PEER_HELLO`     | Bidirectional  | Peer announces itself on connect        |
 * | `PEER_BYE`       | Outgoing       | Peer announces graceful disconnect      |
 * | `DELTA_PUSH`     | Bidirectional  | Push a delta to all peers               |
 * | `DELTA_ACK`      | Reply          | Acknowledge receipt of a delta          |
 * | `SYNC_REQUEST`   | Outgoing       | Request catch-up events after offline   |
 * | `CONFLICT_NOTIFY`| Broadcast      | Notify owner of concurrent edit conflict|
 * | `MERGE_ACCEPT`   | Broadcast      | Owner's chosen conflict resolution      |
 * | `MERGE_REJECT`   | Reply          | Owner rejects a proposed merge          |
 *
 * @packageDocumentation
 */

import type { VectorClockJSON } from '../vector-clock/vector-clock';

// ─────────────────────────────────────────────────────────────────────────────
// Message Type Discriminant
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Union of all valid message type strings.
 *
 * Used as the discriminant field (`type`) in the tagged union
 * {@link PeerMessage}.
 */
export type MessageType =
  | 'PEER_HELLO'
  | 'PEER_BYE'
  | 'PEER_LIST'
  | 'DELTA_PUSH'
  | 'DELTA_ACK'
  | 'SYNC_REQUEST'
  | 'CONFLICT_NOTIFY'
  | 'MERGE_ACCEPT'
  | 'MERGE_REJECT'
  | 'USER_VERIFY'
  | 'USER_VERIFY_RESPONSE'
  | 'CURSOR_UPDATE'
  | 'SESSION_TERMINATED';

/**
 * Set of all recognised message types for O(1) validation.
 * @internal
 */
const VALID_MESSAGE_TYPES: ReadonlySet<string> = new Set<MessageType>([
  'PEER_HELLO',
  'PEER_BYE',
  'PEER_LIST',
  'DELTA_PUSH',
  'DELTA_ACK',
  'SYNC_REQUEST',
  'CONFLICT_NOTIFY',
  'MERGE_ACCEPT',
  'MERGE_REJECT',
  'USER_VERIFY',
  'USER_VERIFY_RESPONSE',
  'SESSION_TERMINATED',
  'CURSOR_UPDATE',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Individual Message Interfaces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sent when a peer first connects to announce its presence.
 *
 * The receiving peer registers the sender in its local PeerRegistry
 * (via Prisma) and marks it as online.
 */
export interface PeerHelloMessage {
  /** Message type discriminant. */
  type: 'PEER_HELLO';
  /** UUID of the connecting peer. */
  nodeId: string;
  /** Human-readable name or hostname. */
  displayName: string;
  /** Number of nodes in this peer's vector clock. */
  nodeCount: number;
  /** The peer's vector clock index. */
  nodeIndex: number;
  /** ISO 8601 timestamp of the hello. */
  timestamp: string;
}

/**
 * Sent when a peer is about to gracefully disconnect.
 *
 * The receiving peer marks the sender as offline in the PeerRegistry.
 */
export interface PeerByeMessage {
  /** Message type discriminant. */
  type: 'PEER_BYE';
  /** UUID of the disconnecting peer. */
  nodeId: string;
  /** ISO 8601 timestamp of the goodbye. */
  timestamp: string;
}

/**
 * Broadcasted by the Host when the room's peer list changes.
 */
export interface PeerListMessage {
  type: 'PEER_LIST';
  peers: Array<{
    nodeId: string;
    displayName: string;
    address: string;
    port: number;
  }>;
  timestamp: string;
}

/**
 * Pushes a new document delta (operation) to a peer.
 *
 * On receipt, the peer validates the delta, decodes it, applies it
 * to the local file, and appends an event to the EventLog.
 */
export interface DeltaPushMessage {
  /** Message type discriminant. */
  type: 'DELTA_PUSH';
  /** UUID of this specific push event. */
  eventId: string;
  /** UUID of the sending peer. */
  nodeId: string;
  /** File ID this delta applies to. */
  fileId: number;
  /** Base64-encoded delta string (empty if tombstone). */
  deltaBase64: string;
  /** Raw content used by Web App on restore */
  content?: string;
  /** Classification of the sync event. */
  eventType?: 'edit' | 'restore' | 'delete' | 'merge';
  /** Logical timestamp from the sender's vector clock. */
  logicalTimestamp: number;
  /** Sender's full vector clock snapshot. */
  vectorClockJson: VectorClockJSON;
  /** ISO 8601 timestamp of the push. */
  timestamp: string;
}

/**
 * Acknowledges receipt and successful application of a delta.
 *
 * Sent back to the originator of a DELTA_PUSH so they can confirm
 * convergence.
 */
export interface DeltaAckMessage {
  /** Message type discriminant. */
  type: 'DELTA_ACK';
  /** The eventId of the DELTA_PUSH being acknowledged. */
  eventId: string;
  /** UUID of the acknowledging peer. */
  nodeId: string;
  /** File ID this ack pertains to. */
  fileId: number;
  /** ISO 8601 timestamp of the ack. */
  timestamp: string;
}

/**
 * Requests catch-up events after an offline period.
 *
 * The receiving peer responds with all EventLog entries for the
 * specified file with logicalTimestamp > sinceTimestamp.
 */
export interface SyncRequestMessage {
  /** Message type discriminant. */
  type: 'SYNC_REQUEST';
  /** UUID of the requesting peer. */
  nodeId: string;
  /** File ID to sync. */
  fileId: number;
  /** Exclusive lower bound — events after this timestamp are needed. */
  sinceTimestamp: number;
  /** ISO 8601 timestamp of the request. */
  timestamp: string;
}

/**
 * Notifies the repository owner that a concurrent edit conflict
 * has been detected and requires manual resolution.
 */
export interface ConflictNotifyMessage {
  /** Message type discriminant. */
  type: 'CONFLICT_NOTIFY';
  /** UUID of the conflict record. */
  conflictId: string;
  /** File ID where the conflict occurred. */
  fileId: number;
  /** Event ID of side A. */
  eventIdA: string;
  /** Node ID that produced side A. */
  nodeIdA: string;
  /** Event ID of side B. */
  eventIdB: string;
  /** Node ID that produced side B. */
  nodeIdB: string;
  /** Brief summary of the conflict for UI display. */
  summary: string;
  /** ISO 8601 timestamp of detection. */
  timestamp: string;
}

/**
 * Broadcast by the owner after resolving a conflict.
 *
 * All peers apply the winning payload unconditionally and update
 * their vector clocks to the merged state.
 */
export interface MergeAcceptMessage {
  /** Message type discriminant. */
  type: 'MERGE_ACCEPT';
  /** UUID of the resolved conflict. */
  conflictId: string;
  /** File ID this resolution applies to. */
  fileId: number;
  /** Which side won: 'A' or 'B'. */
  winner: 'A' | 'B';
  /** The winning content payload to apply. */
  winnerPayload: string;
  /** Event ID of the resolution event in the log. */
  resolutionEventId: string;
  /** Node ID of the owner who resolved the conflict. */
  resolvedBy: string;
  /** Logical timestamp of the resolution event. */
  logicalTimestamp: number;
  /** Merged vector clock snapshot after resolution. */
  vectorClockJson: VectorClockJSON;
  /** ISO 8601 timestamp of the resolution. */
  timestamp: string;
}

/**
 * Sent when the owner rejects a proposed merge (e.g., invalid delta,
 * stale conflict, or manual override).
 */
export interface MergeRejectMessage {
  /** Message type discriminant. */
  type: 'MERGE_REJECT';
  /** UUID of the rejected conflict. */
  conflictId: string;
  /** File ID this rejection applies to. */
  fileId: number;
  /** Human-readable reason for rejection. */
  reason: string;
  /** Node ID of the rejecting owner. */
  rejectedBy: string;
  /** ISO 8601 timestamp of the rejection. */
  timestamp: string;
}

/**
 * Sent by a node holding an active connection to verify if a new
 * connection from the same Node ID is legitimate.
 */
export interface UserVerifyMessage {
  /** Message type discriminant. */
  type: 'USER_VERIFY';
  /** Node ID attempting to connect. */
  nodeId: string;
  /** ISO 8601 timestamp of the verification request. */
  timestamp: string;
}

/**
 * Sent by the existing session to respond to a USER_VERIFY.
 * If allow is true, the new connection replaces the old one.
 * If allow is false, the new connection is blocked.
 */
export interface UserVerifyResponseMessage {
  /** Message type discriminant. */
  type: 'USER_VERIFY_RESPONSE';
  /** Node ID attempting to connect. */
  nodeId: string;
  /** Whether the login attempt is allowed. */
  allow: boolean;
  /** ISO 8601 timestamp of the response. */
  timestamp: string;
}

/**
 * Sent by the Admin/Host to cleanly terminate the session.
 */
export interface SessionTerminatedMessage {
  /** Message type discriminant. */
  type: 'SESSION_TERMINATED';
  /** Human-readable reason for termination. */
  reason: string;
  /** ISO 8601 timestamp of the termination. */
  timestamp: string;
}

/**
 * Sent to broadcast a remote cursor's position.
 */
export interface CursorUpdateMessage {
  type: 'CURSOR_UPDATE';
  nodeId: string;
  nodeIndex: number;
  fileId: string;
  position: number;
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tagged Union
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discriminated union of all peer-to-peer WebSocket message types.
 *
 * TypeScript's narrowing on the `type` field gives callers exhaustive
 * type safety in `switch` statements:
 *
 * ```ts
 * switch (msg.type) {
 *   case 'DELTA_PUSH': // msg is DeltaPushMessage
 *   case 'USER_VERIFY_RESPONSE': // msg is UserVerifyResponseMessage
 *     break;
 *   case 'CURSOR_UPDATE': // msg is CursorUpdateMessage
 *     break;
 * }
 * ```
 */

export type PeerMessage =
  | PeerHelloMessage
  | PeerByeMessage
  | PeerListMessage
  | DeltaPushMessage
  | DeltaAckMessage
  | SyncRequestMessage
  | ConflictNotifyMessage
  | MergeAcceptMessage
  | MergeRejectMessage
  | UserVerifyMessage
  | UserVerifyResponseMessage
  | SessionTerminatedMessage
  | CursorUpdateMessage;

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of {@link validateMessage}.
 */
export type ValidationResult =
  | { valid: true; message: PeerMessage }
  | { valid: false; error: string };

/**
 * Required fields for each message type.
 *
 * Each entry maps a field name to its expected `typeof` result.
 * Nested objects are checked for presence only (not deep shape).
 *
 * @internal
 */
const MESSAGE_FIELD_SPECS: Record<MessageType, Record<string, string>> = {
  PEER_HELLO: {
    nodeId: 'string',
    displayName: 'string',
    nodeCount: 'number',
    nodeIndex: 'number',
    timestamp: 'string',
  },
  PEER_BYE: {
    nodeId: 'string',
    timestamp: 'string',
  },
  PEER_LIST: {
    peers: 'object', // Array of objects
    timestamp: 'string',
  },
  DELTA_PUSH: {
    eventId: 'string',
    nodeId: 'string',
    fileId: 'number',
    deltaBase64: 'string',
    logicalTimestamp: 'number',
    vectorClockJson: 'object',
    timestamp: 'string',
  },
  DELTA_ACK: {
    eventId: 'string',
    nodeId: 'string',
    fileId: 'number',
    timestamp: 'string',
  },
  SYNC_REQUEST: {
    nodeId: 'string',
    fileId: 'number',
    sinceTimestamp: 'number',
    timestamp: 'string',
  },
  CONFLICT_NOTIFY: {
    conflictId: 'string',
    fileId: 'number',
    eventIdA: 'string',
    nodeIdA: 'string',
    eventIdB: 'string',
    nodeIdB: 'string',
    summary: 'string',
    timestamp: 'string',
  },
  MERGE_ACCEPT: {
    conflictId: 'string',
    fileId: 'number',
    winner: 'string',
    winnerPayload: 'string',
    resolutionEventId: 'string',
    resolvedBy: 'string',
    logicalTimestamp: 'number',
    vectorClockJson: 'object',
    timestamp: 'string',
  },
  MERGE_REJECT: {
    conflictId: 'string',
    fileId: 'number',
    reason: 'string',
    rejectedBy: 'string',
    timestamp: 'string',
  },
  USER_VERIFY: {
    nodeId: 'string',
    timestamp: 'string',
  },
  USER_VERIFY_RESPONSE: {
    nodeId: 'string',
    allow: 'boolean',
    timestamp: 'string',
  },
  SESSION_TERMINATED: {
    reason: 'string',
    timestamp: 'string',
  },
  CURSOR_UPDATE: {
    nodeId: 'string',
    nodeIndex: 'number',
    fileId: 'string',
    position: 'number',
    timestamp: 'string',
  },
};

/**
 * Validates an incoming WebSocket message against the known message schemas.
 *
 * **Validation steps:**
 *
 * 1. Parse the raw string as JSON.
 * 2. Check that the parsed value is a non-null object.
 * 3. Check that `type` is a known {@link MessageType}.
 * 4. Verify all required fields for that message type are present
 *    and have the correct primitive type.
 * 5. Apply type-specific semantic checks (e.g., `winner` must be
 *    `'A'` or `'B'` for MERGE_ACCEPT).
 *
 * **Security:** This is the first line of defence against malformed or
 * malicious WebSocket payloads. The engine MUST NOT process any message
 * that fails validation.
 *
 * @param raw - The raw string received from the WebSocket `message` event.
 *
 * @returns A {@link ValidationResult} — either `{ valid: true, message }`
 *          with the typed message, or `{ valid: false, error }` with a
 *          human-readable reason.
 *
 * @example
 * ```ts
 * ws.on('message', (data) => {
 *   const result = validateMessage(data.toString());
 *   if (!result.valid) {
 *     console.warn('Rejected:', result.error);
 *     return;
 *   }
 *   handleMessage(result.message); // Fully typed PeerMessage
 * });
 * ```
 */
export function validateMessage(raw: string): ValidationResult {
  // ── Step 1: Parse JSON ────────────────────────────────────────────
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, error: 'Invalid JSON.' };
  }

  // ── Step 2: Must be an object ────────────────────────────────────
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { valid: false, error: 'Message must be a JSON object.' };
  }

  const obj = parsed as Record<string, unknown>;

  // ── Step 3: Check message type ───────────────────────────────────
  if (typeof obj['type'] !== 'string') {
    return { valid: false, error: 'Missing or non-string "type" field.' };
  }

  const msgType = obj['type'] as string;
  if (!VALID_MESSAGE_TYPES.has(msgType)) {
    return {
      valid: false,
      error: `Unknown message type "${msgType}". ` +
        `Expected one of: ${[...VALID_MESSAGE_TYPES].join(', ')}.`,
    };
  }

  // ── Step 4: Validate required fields ─────────────────────────────
  const spec = MESSAGE_FIELD_SPECS[msgType as MessageType];
  for (const [field, expectedType] of Object.entries(spec)) {
    const actual = typeof obj[field];
    if (actual !== expectedType) {
      return {
        valid: false,
        error: `Field "${field}" must be ${expectedType}, got ${actual} ` +
          `in ${msgType} message.`,
      };
    }
  }

  // ── Step 5: Semantic checks ──────────────────────────────────────
  if (msgType === 'MERGE_ACCEPT') {
    const winner = obj['winner'] as string;
    if (winner !== 'A' && winner !== 'B') {
      return {
        valid: false,
        error: `MERGE_ACCEPT "winner" must be "A" or "B", got "${winner}".`,
      };
    }
  }

  if (msgType === 'DELTA_PUSH') {
    const vcj = obj['vectorClockJson'] as Record<string, unknown>;
    if (typeof vcj['nodeCount'] !== 'number' || typeof vcj['nodeIndex'] !== 'number') {
      return {
        valid: false,
        error: 'DELTA_PUSH vectorClockJson must have numeric nodeCount and nodeIndex.',
      };
    }
  }

  if (msgType === 'MERGE_ACCEPT') {
    const vcj = obj['vectorClockJson'] as Record<string, unknown>;
    if (typeof vcj['nodeCount'] !== 'number' || typeof vcj['nodeIndex'] !== 'number') {
      return {
        valid: false,
        error: 'MERGE_ACCEPT vectorClockJson must have numeric nodeCount and nodeIndex.',
      };
    }
  }

  if (msgType === 'PEER_HELLO') {
    const nodeCount = obj['nodeCount'] as number;
    const nodeIndex = obj['nodeIndex'] as number;
    if (nodeCount < 1 || nodeIndex < 0 || nodeIndex >= nodeCount) {
      return {
        valid: false,
        error: `PEER_HELLO nodeIndex (${nodeIndex}) must be in [0, ${nodeCount - 1}].`,
      };
    }
  }

  return { valid: true, message: parsed as PeerMessage };
}

/**
 * Serialises a {@link PeerMessage} to a JSON string for WebSocket
 * transmission.
 *
 * This is a thin wrapper around `JSON.stringify` that provides type
 * safety — callers must pass a valid {@link PeerMessage} union member.
 *
 * @param message - The message to serialise.
 * @returns The JSON string.
 */
export function serialiseMessage(message: PeerMessage): string {
  return JSON.stringify(message);
}
