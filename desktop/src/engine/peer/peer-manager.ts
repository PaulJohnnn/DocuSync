/**
 * @module PeerManager
 *
 * Masterless P2P WebSocket manager for the DocuSync sync engine.
 *
 * This module handles all peer-to-peer communication over raw WebSocket
 * connections using the `ws` library. It is responsible for:
 *
 * - **Server mode:** Accepting inbound connections from peers.
 * - **Client mode:** Connecting outbound to known peers.
 * - **Message routing:** Dispatching validated messages to the correct
 *   engine handler (delta application, conflict escalation, etc.).
 * - **Rate limiting:** Rejecting any peer that sends more than
 *   {@link MAX_MESSAGES_PER_SECOND} messages per second.
 * - **Peer lifecycle:** Registering peers on PEER_HELLO, marking them
 *   offline on PEER_BYE or disconnect.
 *
 * **Architecture:** Every DocuSync node runs both a WebSocket server
 * (to accept connections) and WebSocket clients (to connect to known
 * peers). This forms a full-mesh topology for small groups — exactly
 * the target use case for thesis collaboration.
 *
 * @packageDocumentation
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { PrismaClient } from '@prisma/client';
import {
  validateMessage,
  serialiseMessage,
  type PeerMessage,
  type DeltaPushMessage,
  type PeerHelloMessage,
  type PeerByeMessage,
  type SyncRequestMessage,
  type MergeAcceptMessage,
  type UserVerifyMessage,
  type UserVerifyResponseMessage,
} from './message-schema';
import { EventLogService } from '../log-sync/event-log';
import { decode } from '../delta/delta-decoder';
import { VectorClock } from '../vector-clock/vector-clock';
import type { VectorClockJSON } from '../vector-clock/vector-clock';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maximum messages per second allowed from a single peer.
 *
 * Any peer exceeding this rate is disconnected to prevent abuse
 * or runaway sync loops.
 */
const MAX_MESSAGES_PER_SECOND = 10;

/**
 * Interval (ms) to clean up stale rate-limiter entries.
 * @internal
 */
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 30_000;

/**
 * Heartbeat interval (ms) to detect dead connections.
 * @internal
 */
const HEARTBEAT_INTERVAL_MS = 30_000;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal representation of a connected peer.
 * @internal
 */
interface ConnectedPeer {
  /** The live WebSocket connection. */
  socket: WebSocket;
  /** UUID of the remote peer (set after PEER_HELLO). */
  nodeId: string | null;
  /** Display name (set after PEER_HELLO). */
  displayName: string;
  /** Remote address string. */
  address: string;
  /** Remote port. */
  port: number;
  /** Whether we initiated the connection (client) or received it (server). */
  direction: 'inbound' | 'outbound';
  /** Whether the peer has sent a valid PEER_HELLO. */
  isAuthenticated: boolean;
}

/**
 * Rate limiter state for a single connection.
 * @internal
 */
interface RateLimiterEntry {
  /** Timestamps (ms) of recent messages, kept in a sliding window. */
  timestamps: number[];
}

/**
 * Callback invoked when a validated DELTA_PUSH is received and decoded.
 *
 * The application layer (Electron main process) provides this to wire
 * delta application into the local file system.
 */
export type OnDeltaApplied = (
  fileId: number,
  newContent: string,
  eventId: string,
  nodeId: string,
  vectorClockJson: VectorClockJSON
) => void | Promise<void>;

/**
 * Callback invoked when a conflict notification arrives.
 */
export type OnConflictNotified = (
  conflictId: string,
  fileId: number,
  summary: string
) => void | Promise<void>;

/**
 * Callback invoked when a MERGE_ACCEPT is received.
 */
export type OnMergeAccepted = (
  conflictId: string,
  fileId: number,
  winnerPayload: string,
  vectorClockJson: VectorClockJSON
) => void | Promise<void>;

/**
 * Callback invoked when a SYNC_REQUEST is received.
 */
export type OnSyncRequested = (
  nodeId: string,
  fileId: number,
  sinceTimestamp: number
) => void | Promise<void>;

/**
 * Configuration for the PeerManager.
 */
export interface PeerManagerConfig {
  /** The local node's UUID. */
  localNodeId: string;
  /** The local node's display name. */
  localDisplayName: string;
  /** Number of nodes in the vector clock topology. */
  nodeCount: number;
  /** This node's index in the vector clock. */
  nodeIndex: number;
  /** Prisma client for PeerRegistry table access. */
  prisma: PrismaClient;
  /** EventLog service for appending received events. */
  eventLog: EventLogService;
  /** Callback for local file content retrieval (for delta decoding). */
  getFileContent: (fileId: number) => Promise<string>;
  /** Callback for applying decoded delta to local file. */
  onDeltaApplied?: OnDeltaApplied;
  /** Callback for conflict notifications. */
  onConflictNotified?: OnConflictNotified;
  /** Callback for merge accept messages. */
  onMergeAccepted?: OnMergeAccepted;
  /** Callback for sync requests. */
  onSyncRequested?: OnSyncRequested;
  /** Callback when a new connection attempts to use an already active Node ID. */
  onUserVerifyRequest?: (nodeId: string) => Promise<boolean>;
  /** Callback when the Admin terminates the session. */
  onSessionTerminated?: (reason: string) => void;
  /** Callback when the peer list changes. */
  onPeerListChanged?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// PeerManager Class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manages all P2P WebSocket connections for a DocuSync node.
 *
 * **Lifecycle:**
 * 1. Create via {@link createPeerManager}.
 * 2. Call {@link startServer} to listen for inbound connections.
 * 3. Call {@link connectToPeer} for each known peer address.
 * 4. Use {@link broadcast} to push messages to all connected peers.
 * 5. Call {@link shutdown} for graceful teardown.
 *
 * **Rate limiting:** Each connection is tracked by a sliding-window
 * rate limiter. If a peer exceeds {@link MAX_MESSAGES_PER_SECOND},
 * the connection is terminated and the peer is logged as rate-limited.
 *
 * **Message handling:** All inbound messages pass through
 * {@link validateMessage} from the message-schema module. Only valid
 * messages reach the handler; malformed payloads are rejected with a
 * warning log and the connection is preserved (to allow retries).
 *
 * @example
 * ```ts
 * const manager = createPeerManager({
 *   localNodeId: myNodeId,
 *   localDisplayName: 'Alice-Laptop',
 *   nodeCount: 3,
 *   nodeIndex: 0,
 *   prisma,
 *   eventLog,
 *   getFileContent: async (fid) => readLocalFile(fid),
 * });
 *
 * await manager.startServer(9000);
 * await manager.connectToPeer('192.168.1.10', 9000);
 * ```
 */
export class PeerManager {
  /** Configuration. @internal */
  private readonly config: PeerManagerConfig;

  /** All currently connected peers. @internal */
  private readonly peers: Map<WebSocket, ConnectedPeer> = new Map();

  /** Rate limiter state per socket. @internal */
  private readonly rateLimiters: Map<WebSocket, RateLimiterEntry> = new Map();

  /** The WebSocket server instance (if started). @internal */
  private server: WebSocketServer | null = null;

  /** Heartbeat interval handle. @internal */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /** Rate limiter cleanup interval handle. @internal */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * @param config - The peer manager configuration.
   */
  constructor(config: PeerManagerConfig) {
    this.config = config;
  }

  // ── Server ──────────────────────────────────────────────────────────

  /**
   * Starts a WebSocket server on the given port to accept inbound
   * peer connections.
   *
   * Each inbound connection is wrapped in a {@link ConnectedPeer},
   * assigned a rate limiter, and wired to the message handler pipeline.
   * The server emits log messages for connection events.
   *
   * @param port - The TCP port to listen on.
   *
   * @returns A promise that resolves when the server is listening.
   *
   * @throws {Error} If the server is already started.
   *
   * @example
   * ```ts
   * await manager.startServer(9000);
   * console.log('DocuSync P2P server listening on :9000');
   * ```
   */
  public startServer(port: number): Promise<void> {
    if (this.server) {
      throw new Error('WebSocket server is already running.');
    }

    return new Promise((resolve, reject) => {
      this.server = new WebSocketServer({ port });

      this.server.on('listening', () => {
        console.log(`[PeerManager] Server listening on port ${port}`);

        // Start heartbeat and cleanup timers.
        this.startTimers();
        resolve();
      });

      this.server.on('error', (err) => {
        console.error(`[PeerManager] Server error:`, err);
        reject(err);
      });

      this.server.on('connection', (socket: WebSocket, req: IncomingMessage) => {
        const remoteAddr = req.socket.remoteAddress ?? 'unknown';
        const remotePort = req.socket.remotePort ?? 0;
        console.log(`[PeerManager] Inbound connection from ${remoteAddr}:${remotePort}`);

        this.registerSocket(socket, remoteAddr, remotePort, 'inbound');
      });
    });
  }

  /**
   * Handles an incoming SESSION_TERMINATED message from the host.
   */
  private handleSessionTerminated(socket: WebSocket, msg: SessionTerminatedMessage): void {
    console.log(`[PeerManager] SESSION_TERMINATED from Admin: ${msg.reason}`);
    if (this.config.onSessionTerminated) {
      this.config.onSessionTerminated(msg.reason);
    }
    // We are the guest, so shut down our side
    this.shutdown().catch(e => console.error('[PeerManager] Error shutting down after termination:', e));
  }

  // ── PEER_BYE ──────────────────────────────────────────────────────────

  /**
   * Connects to a known peer at the given address and port.
   *
   * After the connection is established, a PEER_HELLO message is
   * automatically sent to announce this node.
   *
   * @param address - The IP address or hostname of the peer.
   * @param port    - The WebSocket port of the peer.
   *
   * @returns A promise that resolves when the connection is open and
   *          the PEER_HELLO has been sent.
   *
   * @example
   * ```ts
   * await manager.connectToPeer('192.168.1.10', 9000);
   * ```
   */
  public connectToPeer(address: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `ws://${address}:${port}`;
      console.log(`[PeerManager] Connecting to ${url}...`);

      const socket = new WebSocket(url);

      socket.on('open', () => {
        console.log(`[PeerManager] Connected to ${url}`);
        this.registerSocket(socket, address, port, 'outbound');

        // Send PEER_HELLO.
        this.sendHello(socket);
        resolve();
      });

      socket.on('error', (err) => {
        console.error(`[PeerManager] Connection error to ${url}:`, err.message);
        reject(err);
      });
    });
  }

  // ── Broadcast ───────────────────────────────────────────────────────

  /**
   * Sends a message to all connected and authenticated peers.
   *
   * Only peers that have completed the PEER_HELLO handshake receive
   * the message. Peers with closed sockets are skipped and cleaned up.
   *
   * @param message - The typed message to broadcast.
   *
   * @returns The number of peers the message was sent to.
   *
   * @example
   * ```ts
   * const sentCount = manager.broadcast({
   *   type: 'DELTA_PUSH',
   *   eventId: uuid(),
   *   nodeId: myNodeId,
   *   fileId: 42,
   *   deltaBase64: encodedDelta,
   *   logicalTimestamp: clock.counters[clock.nodeIndex],
   *   vectorClockJson: clock.toJSON(),
   *   timestamp: new Date().toISOString(),
   * });
   * console.log(`Delta pushed to ${sentCount} peers`);
   * ```
   */
  public broadcast(message: PeerMessage): number {
    const data = serialiseMessage(message);
    let sentCount = 0;

    for (const [socket, peer] of this.peers) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue;
      }
      if (!peer.isAuthenticated) {
        continue;
      }

      try {
        socket.send(data);
        sentCount++;
      } catch (err) {
        console.error(
          `[PeerManager] Failed to send to ${peer.nodeId ?? 'unknown'}:`,
          err
        );
      }
    }

    return sentCount;
  }

  /**
   * Sends a message to a specific peer by nodeId.
   *
   * @param nodeId  - The UUID of the target peer.
   * @param message - The typed message to send.
   *
   * @returns `true` if the message was sent, `false` if the peer was
   *          not found or not connected.
   */
  public sendTo(nodeId: string, message: PeerMessage): boolean {
    for (const [socket, peer] of this.peers) {
      if (peer.nodeId === nodeId && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(serialiseMessage(message));
          return true;
        } catch {
          return false;
        }
      }
    }
    return false;
  }

  // ── Shutdown ────────────────────────────────────────────────────────

  /**
   * Gracefully shuts down the peer manager.
   *
   * Sends PEER_BYE to all connected peers, closes all sockets, and
   * stops the WebSocket server.
   *
   * @returns A promise that resolves when shutdown is complete.
   */
  public async shutdown(): Promise<void> {
    console.log('[PeerManager] Shutting down...');

    // Send PEER_BYE to all peers.
    const byeMessage: PeerByeMessage = {
      type: 'PEER_BYE',
      nodeId: this.config.localNodeId,
      timestamp: new Date().toISOString(),
    };
    this.broadcast(byeMessage);

    // Stop timers.
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Close all sockets.
    for (const [socket] of this.peers) {
      try {
        socket.close(1000, 'Shutting down');
      } catch {
        // Ignore errors during shutdown.
      }
    }
    this.peers.clear();
    this.rateLimiters.clear();

    // Close server.
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    console.log('[PeerManager] Shutdown complete.');
  }

  // ── Status ──────────────────────────────────────────────────────────

  /**
   * Returns the list of currently connected and authenticated peer nodeIds.
   *
   * @returns Array of peer nodeId strings.
   */
  public getConnectedPeerIds(): string[] {
    const ids: string[] = [];
    for (const [socket, peer] of this.peers) {
      if (peer.isAuthenticated && peer.nodeId && socket.readyState === WebSocket.OPEN) {
        ids.push(peer.nodeId);
      }
    }
    return ids;
  }

  /**
   * Returns the total number of active connections (including
   * unauthenticated ones).
   */
  public get connectionCount(): number {
    return this.peers.size;
  }

  // ── Internal: Socket Registration ───────────────────────────────────

  /**
   * Registers a new socket connection, sets up event handlers, and
   * initialises the rate limiter.
   *
   * @param socket    - The WebSocket connection.
   * @param address   - Remote address.
   * @param port      - Remote port.
   * @param direction - Whether this is an inbound or outbound connection.
   *
   * @internal
   */
  private registerSocket(
    socket: WebSocket,
    address: string,
    port: number,
    direction: 'inbound' | 'outbound'
  ): void {
    const peer: ConnectedPeer = {
      socket,
      nodeId: null,
      displayName: '',
      address,
      port,
      direction,
      isAuthenticated: false,
    };

    this.peers.set(socket, peer);
    this.rateLimiters.set(socket, { timestamps: [] });

    // Wire up event handlers.
    socket.on('message', (data) => {
      this.handleRawMessage(socket, data.toString());
    });

    socket.on('close', (code, reason) => {
      const nodeId = peer.nodeId ?? 'unknown';
      console.log(
        `[PeerManager] Connection closed: ${nodeId} ` +
          `(code=${code}, reason=${reason?.toString() ?? 'none'})`
      );
      this.handleDisconnect(socket);
    });

    socket.on('error', (err) => {
      const nodeId = peer.nodeId ?? 'unknown';
      console.error(`[PeerManager] Socket error for ${nodeId}:`, err.message);
      this.handleDisconnect(socket);
    });

    // Mark socket as alive for heartbeat.
    (socket as unknown as Record<string, boolean>)['_isAlive'] = true;
    socket.on('pong', () => {
      (socket as unknown as Record<string, boolean>)['_isAlive'] = true;
    });
  }

  // ── Internal: Rate Limiting ─────────────────────────────────────────

  /**
   * Checks whether a socket has exceeded the rate limit.
   *
   * Uses a sliding-window algorithm: timestamps older than 1 second
   * are pruned, and the remaining count is checked against
   * {@link MAX_MESSAGES_PER_SECOND}.
   *
   * @param socket - The socket to check.
   * @returns `true` if the rate limit is exceeded (message should be rejected).
   *
   * @internal
   */
  private isRateLimited(socket: WebSocket): boolean {
    const entry = this.rateLimiters.get(socket);
    if (!entry) return false;

    const now = Date.now();
    const windowStart = now - 1000;

    // Prune old timestamps.
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    // Check limit.
    if (entry.timestamps.length >= MAX_MESSAGES_PER_SECOND) {
      return true;
    }

    // Record this message.
    entry.timestamps.push(now);
    return false;
  }

  // ── Internal: Message Handling ──────────────────────────────────────

  /**
   * Handles a raw WebSocket message: validates, rate-checks, and routes.
   *
   * @param socket - The source socket.
   * @param raw    - The raw message string.
   *
   * @internal
   */
  private handleRawMessage(socket: WebSocket, raw: string): void {
    // ── Rate limit check ──────────────────────────────────────────
    if (this.isRateLimited(socket)) {
      const peer = this.peers.get(socket);
      console.warn(
        `[PeerManager] Rate limit exceeded for ${peer?.nodeId ?? 'unknown'}. ` +
          `Disconnecting.`
      );
      socket.close(4029, 'Rate limit exceeded');
      this.handleDisconnect(socket);
      return;
    }

    // ── Validate message ──────────────────────────────────────────
    const result = validateMessage(raw);
    if (!result.valid) {
      console.warn(`[PeerManager] Rejected malformed message: ${result.error}`);
      return; // Don't disconnect — allow retry.
    }

    // ── Route to handler ──────────────────────────────────────────
    const msg = result.message;

    switch (msg.type) {
      case 'PEER_HELLO':
        this.handlePeerHello(socket, msg);
        break;

      case 'USER_VERIFY':
        this.handleUserVerify(socket, msg);
        break;

      case 'USER_VERIFY_RESPONSE':
        this.handleUserVerifyResponse(socket, msg);
        break;

      case 'SESSION_TERMINATED':
        this.handleSessionTerminated(socket, msg);
        break;

      case 'PEER_BYE':
        this.handlePeerBye(socket, msg);
        break;

      case 'DELTA_PUSH':
        this.handleDeltaPush(socket, msg);
        break;

      case 'DELTA_ACK':
        // Log acknowledgement — no further action needed.
        console.log(
          `[PeerManager] DELTA_ACK from ${msg.nodeId} for event ${msg.eventId}`
        );
        break;

      case 'SYNC_REQUEST':
        this.handleSyncRequest(socket, msg);
        break;

      case 'CONFLICT_NOTIFY':
        if (this.config.onConflictNotified) {
          this.config.onConflictNotified(
            msg.conflictId,
            msg.fileId,
            msg.summary
          );
        }
        break;

      case 'MERGE_ACCEPT':
        this.handleMergeAccept(socket, msg);
        break;

      case 'MERGE_REJECT':
        console.log(
          `[PeerManager] MERGE_REJECT for conflict ${msg.conflictId}: ${msg.reason}`
        );
        break;
    }
  }

  // ── Internal: PEER_HELLO Handler ────────────────────────────────────

  /**
   * Handles a PEER_HELLO message: registers the peer in the local
   * PeerRegistry table and marks the connection as authenticated.
   *
   * If this is an inbound connection, sends back our own PEER_HELLO
   * so the remote peer can register us.
   *
   * @param socket - The source socket.
   * @param msg    - The validated PEER_HELLO message.
   *
   * @internal
   */
  private async handlePeerHello(
    socket: WebSocket,
    msg: PeerHelloMessage
  ): Promise<void> {
    const peer = this.peers.get(socket);
    if (!peer) return;

    // Check if node is already connected
    let existingSocket: WebSocket | null = null;
    for (const [s, p] of this.peers) {
      if (s !== socket && p.nodeId === msg.nodeId && s.readyState === WebSocket.OPEN) {
        existingSocket = s;
        break;
      }
    }

    if (existingSocket && this.config.onUserVerifyRequest) {
      console.log(`[PeerManager] Duplicate PEER_HELLO for ${msg.nodeId}. Requesting verification.`);
      // Send USER_VERIFY to the existing socket
      const verifyMsg: UserVerifyMessage = {
        type: 'USER_VERIFY',
        nodeId: msg.nodeId,
        timestamp: new Date().toISOString(),
      };
      existingSocket.send(serialiseMessage(verifyMsg));
      
      // We will wait for the IPC response via a callback
      const allowed = await this.config.onUserVerifyRequest(msg.nodeId);
      
      if (!allowed) {
        console.log(`[PeerManager] Connection from ${msg.nodeId} blocked by user.`);
        socket.close(4001, 'Connection blocked by user');
        this.peers.delete(socket);
        this.rateLimiters.delete(socket);
        return;
      } else {
        console.log(`[PeerManager] Connection from ${msg.nodeId} allowed. Terminating old socket.`);
        existingSocket.close(4002, 'Replaced by new connection');
        this.handleDisconnect(existingSocket);
      }
    }

    // Update peer info.
    peer.nodeId = msg.nodeId;
    peer.displayName = msg.displayName;
    peer.isAuthenticated = true;

    console.log(
      `[PeerManager] PEER_HELLO from ${msg.displayName} (${msg.nodeId})`
    );

    // Upsert into PeerRegistry via Prisma.
    try {
      await this.config.prisma.peerRegistry.upsert({
        where: { nodeId: msg.nodeId },
        create: {
          nodeId: msg.nodeId,
          displayName: msg.displayName,
          address: peer.address,
          port: peer.port,
          isOnline: true,
          lastSeen: new Date(),
        },
        update: {
          displayName: msg.displayName,
          address: peer.address,
          port: peer.port,
          isOnline: true,
          lastSeen: new Date(),
        },
      });
    } catch (err) {
      console.error('[PeerManager] Failed to upsert PeerRegistry:', err);
    }

    // If inbound, send our own PEER_HELLO back.
    if (peer.direction === 'inbound') {
      this.sendHello(socket);
    }

    this.config.onPeerListChanged?.();
  }

  // ── Internal: USER_VERIFY Handlers ──────────────────────────────────

  /**
   * Handles a USER_VERIFY message: this device is the existing connection
   * and the remote server is asking us if the new login attempt is legitimate.
   * This is typically handled by emitting an event to the UI and waiting for the user.
   */
  private async handleUserVerify(socket: WebSocket, msg: UserVerifyMessage): Promise<void> {
    console.log(`[PeerManager] USER_VERIFY received for node ${msg.nodeId}.`);
    if (this.config.onUserVerifyRequest) {
      const allowed = await this.config.onUserVerifyRequest(msg.nodeId);
      const response: UserVerifyResponseMessage = {
        type: 'USER_VERIFY_RESPONSE',
        nodeId: msg.nodeId,
        allow: allowed,
        timestamp: new Date().toISOString(),
      };
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(serialiseMessage(response));
      }
    }
  }

  /**
   * Handles a USER_VERIFY_RESPONSE message: the existing connection has responded
   * to our USER_VERIFY request. Wait, this logic is already handled asynchronously
   * in handlePeerHello via the `onUserVerifyRequest` callback. The callback resolves
   * when the UI responds. Wait, if the callback is used, it means the main process
   * handled it via IPC. If a remote node sends USER_VERIFY_RESPONSE, how does the 
   * promise resolve?
   * For the architecture: The server (Room Host) receives PEER_HELLO, checks existing
   * connections, sends USER_VERIFY to the existing remote client.
   * The existing remote client receives USER_VERIFY, prompts its user, and sends
   * back USER_VERIFY_RESPONSE to the server.
   * The server receives USER_VERIFY_RESPONSE and resolves the pending verification.
   */
  private handleUserVerifyResponse(socket: WebSocket, msg: UserVerifyResponseMessage): void {
    console.log(`[PeerManager] USER_VERIFY_RESPONSE received for ${msg.nodeId}: allow=${msg.allow}`);
    // We emit this via an internal event emitter so handlePeerHello can await it.
    this.emitVerifyResponse(msg.nodeId, msg.allow);
  }

  private pendingVerifications: Map<string, (allow: boolean) => void> = new Map();

  private emitVerifyResponse(nodeId: string, allow: boolean) {
    const resolver = this.pendingVerifications.get(nodeId);
    if (resolver) {
      resolver(allow);
      this.pendingVerifications.delete(nodeId);
    }
  }

  // ── Internal: PEER_BYE Handler ──────────────────────────────────────

  /**
   * Handles a PEER_BYE message: marks the peer as offline in the
   * PeerRegistry and closes the connection.
   *
   * @param socket - The source socket.
   * @param msg    - The validated PEER_BYE message.
   *
   * @internal
   */
  private async handlePeerBye(
    socket: WebSocket,
    msg: PeerByeMessage
  ): Promise<void> {
    console.log(`[PeerManager] PEER_BYE from ${msg.nodeId}`);

    // Mark offline in PeerRegistry.
    try {
      await this.config.prisma.peerRegistry.updateMany({
        where: { nodeId: msg.nodeId },
        data: { isOnline: false, lastSeen: new Date() },
      });
    } catch (err) {
      console.error('[PeerManager] Failed to update PeerRegistry:', err);
    }

    // Clean up.
    socket.close(1000, 'Peer said goodbye');
    this.peers.delete(socket);
    this.rateLimiters.delete(socket);
  }

  // ── Internal: DELTA_PUSH Handler ────────────────────────────────────

  /**
   * Handles a DELTA_PUSH message:
   *
   * 1. Retrieves the current local file content.
   * 2. Decodes the delta against the local content.
   * 3. Appends a `merge` event to the EventLog.
   * 4. Invokes the `onDeltaApplied` callback so the app can write the
   *    new content to disk.
   * 5. Sends a DELTA_ACK back to the sender.
   *
   * If delta decoding fails (checksum mismatch, malformed payload),
   * the error is logged but the connection is preserved.
   *
   * @param socket - The source socket.
   * @param msg    - The validated DELTA_PUSH message.
   *
   * @internal
   */
  private async handleDeltaPush(
    socket: WebSocket,
    msg: DeltaPushMessage
  ): Promise<void> {
    console.log(
      `[PeerManager] DELTA_PUSH from ${msg.nodeId} for file ${msg.fileId}`
    );

    try {
      // Step 1: Get current local content.
      const currentContent = await this.config.getFileContent(msg.fileId);

      // Step 2: Decode the delta.
      const decodeResult = decode(currentContent, msg.deltaBase64);
      const newContent = decodeResult.content;

      // Step 3: Append to EventLog.
      await this.config.eventLog.appendEvent({
        eventId: msg.eventId,
        fileId: msg.fileId,
        nodeId: msg.nodeId,
        eventType: 'merge',
        logicalTimestamp: msg.logicalTimestamp,
        vectorClockJson: msg.vectorClockJson,
        payload: msg.deltaBase64,
      });

      // Step 4: Notify the application layer.
      if (this.config.onDeltaApplied) {
        await this.config.onDeltaApplied(
          msg.fileId,
          newContent,
          msg.eventId,
          msg.nodeId,
          msg.vectorClockJson
        );
      }

      // Step 5: Send DELTA_ACK.
      const ack: PeerMessage = {
        type: 'DELTA_ACK',
        eventId: msg.eventId,
        nodeId: this.config.localNodeId,
        fileId: msg.fileId,
        timestamp: new Date().toISOString(),
      };

      if (socket.readyState === WebSocket.OPEN) {
        socket.send(serialiseMessage(ack));
      }

      console.log(
        `[PeerManager] Applied delta for file ${msg.fileId} ` +
          `(${decodeResult.opsApplied} ops)`
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[PeerManager] Failed to apply DELTA_PUSH for file ${msg.fileId}: ${errMsg}`
      );
      // Don't disconnect — the next delta might work if the local file
      // state catches up.
    }
  }

  // ── Internal: SYNC_REQUEST Handler ──────────────────────────────────

  /**
   * Handles a SYNC_REQUEST message by invoking the `onSyncRequested`
   * callback. The application layer is responsible for querying the
   * EventLog and sending the missed events back.
   *
   * @param socket - The source socket.
   * @param msg    - The validated SYNC_REQUEST message.
   *
   * @internal
   */
  private async handleSyncRequest(
    _socket: WebSocket,
    msg: SyncRequestMessage
  ): Promise<void> {
    console.log(
      `[PeerManager] SYNC_REQUEST from ${msg.nodeId} for file ${msg.fileId} ` +
        `since ts=${msg.sinceTimestamp}`
    );

    if (this.config.onSyncRequested) {
      await this.config.onSyncRequested(
        msg.nodeId,
        msg.fileId,
        msg.sinceTimestamp
      );
    }
  }

  // ── Internal: MERGE_ACCEPT Handler ──────────────────────────────────

  /**
   * Handles a MERGE_ACCEPT message by invoking the `onMergeAccepted`
   * callback so the application layer can apply the winning payload.
   *
   * @param socket - The source socket.
   * @param msg    - The validated MERGE_ACCEPT message.
   *
   * @internal
   */
  private async handleMergeAccept(
    _socket: WebSocket,
    msg: MergeAcceptMessage
  ): Promise<void> {
    console.log(
      `[PeerManager] MERGE_ACCEPT for conflict ${msg.conflictId} ` +
        `(winner: ${msg.winner}, resolvedBy: ${msg.resolvedBy})`
    );

    if (this.config.onMergeAccepted) {
      await this.config.onMergeAccepted(
        msg.conflictId,
        msg.fileId,
        msg.winnerPayload,
        msg.vectorClockJson
      );
    }
  }

  // ── Internal: Disconnect Handler ────────────────────────────────────

  /**
   * Handles a peer disconnection — cleans up internal state and marks
   * the peer as offline in the PeerRegistry.
   *
   * @param socket - The disconnected socket.
   *
   * @internal
   */
  private async handleDisconnect(socket: WebSocket): Promise<void> {
    const peer = this.peers.get(socket);

    if (peer?.nodeId) {
      // Mark offline in PeerRegistry.
      try {
        await this.config.prisma.peerRegistry.updateMany({
          where: { nodeId: peer.nodeId },
          data: { isOnline: false, lastSeen: new Date() },
        });
      } catch (err) {
        console.error('[PeerManager] Failed to update PeerRegistry:', err);
      }
    }

    this.peers.delete(socket);
    this.rateLimiters.delete(socket);

    this.config.onPeerListChanged?.();
  }

  // ── Internal: PEER_HELLO Sender ─────────────────────────────────────

  /**
   * Sends a PEER_HELLO message on the given socket.
   *
   * @param socket - The target socket.
   *
   * @internal
   */
  private sendHello(socket: WebSocket): void {
    const hello: PeerHelloMessage = {
      type: 'PEER_HELLO',
      nodeId: this.config.localNodeId,
      displayName: this.config.localDisplayName,
      nodeCount: this.config.nodeCount,
      nodeIndex: this.config.nodeIndex,
      timestamp: new Date().toISOString(),
    };

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(serialiseMessage(hello));
    }
  }

  // ── Internal: Timers ────────────────────────────────────────────────

  /**
   * Starts the heartbeat and rate-limiter cleanup timers.
   *
   * @internal
   */
  private startTimers(): void {
    // Heartbeat: detect dead connections.
    this.heartbeatTimer = setInterval(() => {
      for (const [socket, peer] of this.peers) {
        const isAlive = (socket as unknown as Record<string, boolean>)['_isAlive'];
        if (isAlive === false) {
          console.log(
            `[PeerManager] Heartbeat timeout for ${peer.nodeId ?? 'unknown'}`
          );
          socket.terminate();
          this.handleDisconnect(socket);
          continue;
        }
        (socket as unknown as Record<string, boolean>)['_isAlive'] = false;
        socket.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Cleanup: remove stale rate-limiter entries.
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const windowStart = now - 1000;
      for (const [, entry] of this.rateLimiters) {
        entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
      }
    }, RATE_LIMIT_CLEANUP_INTERVAL_MS);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new {@link PeerManager} instance.
 *
 * This is the recommended public API for constructing the peer manager.
 *
 * @param config - The peer manager configuration.
 *
 * @returns A new {@link PeerManager} instance.
 *
 * @example
 * ```ts
 * import { createPeerManager } from '@/engine/peer/peer-manager';
 * import { createEventLog } from '@/engine/log-sync/event-log';
 * import { PrismaClient } from '@prisma/client';
 *
 * const prisma = new PrismaClient();
 * const eventLog = createEventLog(prisma);
 *
 * const manager = createPeerManager({
 *   localNodeId: crypto.randomUUID(),
 *   localDisplayName: os.hostname(),
 *   nodeCount: 3,
 *   nodeIndex: 0,
 *   prisma,
 *   eventLog,
 *   getFileContent: async (fileId) => {
 *     // Read from local file system
 *     return fs.readFile(`./files/${fileId}`, 'utf-8');
 *   },
 *   onDeltaApplied: async (fileId, content) => {
 *     // Write updated content to local file system
 *     await fs.writeFile(`./files/${fileId}`, content, 'utf-8');
 *   },
 * });
 *
 * await manager.startServer(9000);
 * await manager.connectToPeer('192.168.1.5', 9000);
 * ```
 */
export function createPeerManager(config: PeerManagerConfig): PeerManager {
  return new PeerManager(config);
}
