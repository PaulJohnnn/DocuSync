/**
 * @module PeerManager
 *
 * This file is the Network Manager for DocuSync.
 * 
 * It runs a background WebSocket server to allow other computers and phones
 * to connect directly to this machine without needing a central cloud server.
 * 
 * What it does:
 * - Server: Listens for incoming connections from friends.
 * - Client: Connects outwards to other friends.
 * - Messenger: Receives text changes from peers and sends your changes to them.
 * - Security: Kicks out any peer that tries to spam too many messages.
 * 
 * Architecture: By having every computer act as both a server and a client,
 * they form a "full-mesh network". This is perfect for small groups collaborating
 * on a thesis because if one person's internet drops, the others stay connected!
 */

import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import * as crypto from 'crypto';
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
  type SessionTerminatedMessage,
} from './message-schema';
import type { SyncEvent } from '../lww/lww-resolver';
import { mergeConcurrentEdit } from '../lww/line-merge';
import {
  mergeThreeWay,
  attributeAgainstBase,
  lineDiffers,
  gapDiffers,
} from '../lww/line-merge-3way';

import { EventLogService } from '../log-sync/event-log';
import { decode as decodeDelta } from '../delta/delta-decoder';
import { encode as encodeDelta } from '../delta/delta-encoder';
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
 * Increased to 50 to allow reliable 10Hz benchmarking with JS setInterval burstiness.
 */
const MAX_MESSAGES_PER_SECOND = 50;

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
  vectorClockJson: VectorClockJSON,
  eventType?: 'edit' | 'restore' | 'delete' | 'merge',
  lwwResolved?: boolean
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
  vectorClockJson: VectorClockJSON,
  resolvedByNodeId?: string
) => void | Promise<void>;

/**
 * Callback invoked when a SYNC_REQUEST is received.
 */
export type OnSyncRequested = (
  nodeId: string,
  fileId: number,
  sinceTimestamp: number,
  knownPerNode?: Record<string, number>
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
  /** LWWResolver for concurrent HTTP push handling. */
  lwwResolver?: any;
  /** Local VectorClock instance for logical timestamps. */
  vectorClock?: any;
  /** Callback when a new connection attempts to use an already active Node ID. */
  onUserVerifyRequest?: (nodeId: string) => Promise<boolean>;
  /** Callback when the Admin terminates the session. */
  onSessionTerminated?: (reason: string) => void;
  /** Callback when the peer list changes. */
  onPeerListChanged?: () => void;
  /** Callback when a remote cursor update is received. */
  onCursorUpdate?: (msg: import('./message-schema').CursorUpdateMessage) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// PeerManager Class
// ─────────────────────────────────────────────────────────────────────────────

export class PeerManager {
  /** Configuration. @internal */
  private readonly config: PeerManagerConfig;

  /** All currently connected peers. @internal */
  private readonly peers: Map<WebSocket, ConnectedPeer> = new Map();

  /** Rate limiter state per socket. @internal */
  private readonly rateLimiters: Map<WebSocket, RateLimiterEntry> = new Map();

  /** The HTTP server instance serving WebSockets and REST. @internal */
  private httpServer: http.Server | null = null;
  /** The WebSocket server instance (if started). @internal */
  private server: WebSocketServer | null = null;

  /** Heartbeat interval handle. @internal */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /** Rate limiter cleanup interval handle. @internal */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /** Valid token (OTP) for LAN access. @internal */
  private allowedToken: string | null = null;

  /**
   * In-memory session metrics — reset on server start.
   * Exposed via GET /metrics for Web and Mobile clients.
   */
  private _metrics = {
    pushCount: 0,
    pushSuccessCount: 0,
    pushTotalLatencyMs: 0,
    conflictsDetectedThisSession: 0,
    conflictsResolvedThisSession: 0,
    conflictTotalResolveMs: 0,
    /** Timestamp (ms) when a conflict was first escalated, keyed by conflictId. */
    conflictEscalatedAt: new Map<string, number>(),
    sessionStartMs: Date.now(),
  };

  /**
   * @param config - The peer manager configuration.
   */
  constructor(config: PeerManagerConfig) {
    this.config = config;
  }

  // ── Token Management ──────────────────────────────────────────────

  /**
   * Sets the valid OTP/token for this session to authorize LAN requests.
   */
  public setAllowedToken(token: string): void {
    this.allowedToken = token;
    console.log(`[PeerManager] Set allowed token to ${token}`);
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
      this.httpServer = http.createServer((req, res) => {
        this.handleHttpRequest(req, res).catch(e => {
          console.error('[PeerManager] Uncaught HTTP error:', e);
          if (!res.headersSent) {
            res.writeHead(500, {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-DocuSync-Token',
              'Content-Type': 'application/json'
            });
            res.end(JSON.stringify({ error: e?.message || 'Internal error' }));
          }
        });
      });

      this.server = new WebSocketServer({ server: this.httpServer });

      this.httpServer.listen(port, '0.0.0.0', () => {
        console.log(`[PeerManager] Server listening on 0.0.0.0:${port}`);

        // Start heartbeat and cleanup timers.
        this.startTimers();
        resolve();
      });

      this.httpServer.on('error', (err) => {
        console.error(`[PeerManager] Server error:`, err);
        this.server = null; // Clear so retry logic can work
        this.httpServer = null;
        reject(err);
      });

      this.server.on('connection', (socket: WebSocket, req: http.IncomingMessage) => {
        const remoteAddr = req.socket.remoteAddress ?? 'unknown';
        const remotePort = req.socket.remotePort ?? 0;
        console.log(`[PeerManager] Inbound connection from ${remoteAddr}:${remotePort}`);
        
        const url = new URL(req.url || '', `ws://${req.headers.host || 'localhost'}`);
        const wsToken = url.searchParams.get('token');
        if (this.allowedToken && wsToken !== this.allowedToken) {
          console.warn(`[PeerManager] Rejected WS connection: invalid token`);
          socket.close(4001, 'Unauthorized: Invalid token');
          return;
        }

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

  // ── HTTP Sync Endpoints ──────────────────────────────────────────────────
  
  private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      // Every browser push includes X-DocuSync-Token (see the token check
      // right below); leaving it out of the preflight allow-list made the
      // browser reject every request before it ever reached this server,
      // silently forcing all web clients onto the cloud fallback path.
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-DocuSync-Token',
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      
      const reqToken = req.headers['x-docusync-token'] as string;
      if (this.allowedToken && reqToken !== this.allowedToken) {
        res.writeHead(401, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized: Invalid X-DocuSync-Token' }));
        return;
      }
      
      if (url.pathname === '/sync/status' && req.method === 'GET') {
        try {
          const fileId = parseInt(url.searchParams.get('fileId') || '0', 10);
          const sinceStr = url.searchParams.get('since');
          if (!fileId) {
            res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'fileId required' }));
            return;
          }

          let history: any[] = [];
          try {
            history = await this.config.eventLog.getHistory(fileId);
          } catch (e: any) {
            console.warn('[PeerManager] getHistory failed in /sync/status:', e?.message);
          }

          let latestVc = this.config.vectorClock || new VectorClock(2, 0, { counter: 0, children: [{ counter: 0, children: [] }, { counter: 0, children: [] }] });
          let committedAt = 0;
          let authorNodeId = '';
          if (history.length > 0) {
            const latestEvent = history[history.length - 1];
            committedAt = latestEvent.createdAt ? new Date(latestEvent.createdAt).getTime() : 0;
            authorNodeId = latestEvent.nodeId || '';
            try {
              const rawVc = typeof latestEvent.vectorClockJson === 'string'
                ? JSON.parse(latestEvent.vectorClockJson)
                : latestEvent.vectorClockJson;
              latestVc = VectorClock.fromJSON(rawVc);
            } catch {}
          }

          let latestContent = '';
          try {
            latestContent = await this.config.getFileContent(fileId);
          } catch {}

          if (history.length === 0) {
            res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ upToDate: false, content: latestContent, vectorClock: latestVc.toJSON() }));
            return;
          }

          if (!sinceStr || sinceStr === '0') {
            res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ upToDate: false, content: latestContent, vectorClock: latestVc.toJSON() }));
            return;
          }

          let clientVc: VectorClock;
          try {
            clientVc = VectorClock.fromJSON(JSON.parse(decodeURIComponent(sinceStr)));
          } catch {
            res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ upToDate: false, content: latestContent, vectorClock: latestVc.toJSON() }));
            return;
          }

          let relation = 'concurrent';
          try {
            relation = latestVc.compare(clientVc);
          } catch {}

          if (relation === 'dominated' || relation === 'equal') {
            res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ upToDate: true, vectorClock: latestVc.toJSON(), committedAt, authorNodeId }));
          } else {
            res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ upToDate: false, content: latestContent, vectorClock: latestVc.toJSON(), committedAt, authorNodeId }));
          }
          return;
        } catch (statusError: any) {
          console.error('[PeerManager] EXACT /sync/status ERROR:', statusError?.message);
          console.error(statusError?.stack);
          res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: statusError?.message || 'Internal Server Error' }));
          return;
        }
      }

      if (url.pathname === '/sync/push' && req.method === 'POST') {
        let bodyStr = '';
        for await (const chunk of req) bodyStr += chunk;
        let body: any;
        try {
          body = JSON.parse(bodyStr);
        } catch (err: any) {
          res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Malformed JSON payload' }));
          return;
        }

        const fileId = parseInt(body.fileId, 10);
        if (isNaN(fileId) || !fileId) {
          res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Valid fileId required' }));
          return;
        }

        let incomingVc: VectorClock;
        try {
          incomingVc = VectorClock.fromJSON(body.vectorClock);
        } catch (err: any) {
          res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Malformed vectorClock payload: ${err?.message || 'Invalid vector clock'}` }));
          return;
        }

        const delta = body.delta;
        const remoteContent = body.content || '';
        const nodeId = body.nodeId || `client-${Date.now()}`;
        const isOfflineReconnect = body.isOfflineReconnect === true;

        if (!this.config.vectorClock || !this.config.lwwResolver) {
          res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Engine dependencies missing' }));
          return;
        }

        const pushT0 = Date.now();
        this._metrics.pushCount++;
        try {
          // ── Per-slot sender dedup guard ──────────────────────────────────
          const senderNodeIndex = incomingVc.nodeIndex;
          const serverCounters = this.config.vectorClock.counters;
          const incomingCounters = incomingVc.counters;
          const senderSlotOnServer   = serverCounters[senderNodeIndex]   ?? -1;
          const senderSlotIncoming   = incomingCounters[senderNodeIndex] ?? 0;

          const latestEventEarly = await this.config.eventLog.getLatestEvent(fileId);
          const authorNodeIdEarly = latestEventEarly ? latestEventEarly.nodeId : undefined;

          console.log('[RECEIVE]', JSON.stringify(incomingVc), 'server:', JSON.stringify(this.config.vectorClock));
          
          // Only deduplicate if it's REALLY from the same node. If it's a different node,
          // it's a slot collision (e.g. 2 web apps assigned nodeIndex=1). Let it through
          // to be treated as a concurrent edit.
          const isDedup = senderSlotIncoming <= senderSlotOnServer && (!authorNodeIdEarly || authorNodeIdEarly === nodeId);
          console.log('[RECEIVE DEDUP RESULT]', isDedup, 'REASON:', isDedup ? 'senderSlotIncoming <= senderSlotOnServer' : 'not dedup');
          
          if (isDedup) {
            console.log(
              `[PeerManager] Dedup: sender slot [${senderNodeIndex}] incoming=${senderSlotIncoming} ` +
              `<= server=${senderSlotOnServer}. Deduplicated resend, not a conflict.`
            );
            const localContent = await this.config.getFileContent(fileId);
            res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ merged: true, upToDate: true, vectorClock: this.config.vectorClock.toJSON() }));
            return;
          }

          // ── Full-vector comparison for genuine conflict/concurrency detection
          let relation = 'concurrent';
          try {
            relation = this.config.vectorClock.compare(incomingVc);
          } catch {}

          const latestEvent = await this.config.eventLog.getLatestEvent(fileId);
          const authorNodeId = latestEvent ? latestEvent.nodeId : undefined;

          // HACK: If vector math thinks Server dominates or equals Incoming,
          // but they come from entirely different physical nodes (different nodeIds),
          // this means they accidentally shared the same nodeIndex slot (e.g. 2 web tabs).
          // We MUST force them to be 'concurrent' so LWW resolves the text properly
          // instead of mathematically dropping the edit.
          if ((relation === 'dominant' || relation === 'equal') && authorNodeId && authorNodeId !== nodeId) {
            console.log(`[PeerManager] Forcing concurrent due to nodeIndex collision: Server auth=${authorNodeId} vs Incoming auth=${nodeId}`);
            relation = 'concurrent';
          }
          
          const localContent = await this.config.getFileContent(fileId);

          let effectiveRelation = relation;
          if (effectiveRelation === 'dominant') {
            res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ merged: true, upToDate: false, content: localContent, vectorClock: this.config.vectorClock.toJSON() }));
            return;
          } else if (effectiveRelation === 'equal') {
            res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ merged: true, upToDate: true, vectorClock: this.config.vectorClock.toJSON() }));
            return;
          } else if (effectiveRelation === 'dominated' && !isOfflineReconnect) {
            try {
              this.config.vectorClock.merge(incomingVc);
            } catch {}

            let newContent = remoteContent || localContent;
            try {
              if (delta) {
                const decoded = decodeDelta(localContent, delta);
                newContent = decoded.content;
              }
            } catch {}

            if (newContent === localContent) {
              res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ merged: true, upToDate: true, vectorClock: this.config.vectorClock.toJSON() }));
              return;
            }

            const eventId = crypto.randomUUID();
            try {
              await this.config.eventLog.appendEvent({
                eventId,
                fileId,
                nodeId,
                eventType: 'edit', // Record as standard edit (previously 'merge')
                logicalTimestamp: incomingVc.counters[incomingVc.nodeIndex] || 1,
                vectorClockJson: this.config.vectorClock.toJSON(),
                payload: delta || remoteContent || '',
              });
            } catch (evErr: any) {
              console.warn('[PeerManager] appendEvent failed in dominated push:', evErr?.message);
            }

            if (this.config.onDeltaApplied) {
              await this.config.onDeltaApplied(fileId, newContent, eventId, nodeId, this.config.vectorClock.toJSON(), 'merge', true);
            }

            // Relay HTTP push to all connected WebSocket peers
            this.broadcast({
              type: 'DELTA_PUSH',
              eventId,
              nodeId,
              fileId,
              deltaBase64: delta,
              content: newContent,
              logicalTimestamp: incomingVc.counters[incomingVc.nodeIndex] || 1,
              vectorClockJson: this.config.vectorClock.toJSON(),
              timestamp: new Date().toISOString(),
            } as any);

            // Track successful merge latency
            this._metrics.pushSuccessCount++;
            this._metrics.pushTotalLatencyMs += Date.now() - pushT0;
            res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ merged: true, lwwResolved: true, vectorClock: this.config.vectorClock.toJSON() }));
            return;
          } else {
            // concurrent OR forced offline reconnect - escalate
            if (remoteContent === localContent) {
              // Same content, no need to flag conflict
              res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ merged: true, upToDate: true, vectorClock: this.config.vectorClock.toJSON() }));
              return;
            }

            const eventA = {
              eventId: crypto.randomUUID(),
              fileId,
              nodeId: this.config.localNodeId,
              payload: localContent,
              logicalTimestamp: this.config.vectorClock.counters[this.config.vectorClock.nodeIndex] || 1,
              vectorClockJson: this.config.vectorClock.toJSON(),
            };
            const eventB = {
              eventId: crypto.randomUUID(),
              fileId,
              nodeId,
              payload: remoteContent || localContent,
              logicalTimestamp: incomingVc.counters[incomingVc.nodeIndex] || 1,
              vectorClockJson: incomingVc.toJSON(),
            };

            try {
              let resolveResult: any = { outcome: 'escalated' };
              
              if (body.baseContent) {
                console.log(`[PeerManager] Processing Concurrent Edit via line-granular 3-way merge`);

                const existingCommittedAt = latestEvent ? new Date(latestEvent.createdAt).getTime() : 0;
                const incomingCommittedAtForMerge = body.committedAt || Date.now();
                const mergeResult = mergeConcurrentEdit(
                  localContent,
                  body.baseContent,
                  remoteContent || localContent,
                  existingCommittedAt,
                  incomingCommittedAtForMerge
                );

                // Non-overlapping lines/blocks merge automatically (OT-like).
                // Only lines BOTH peers actually touched concurrently were
                // decided by LWW, and only those lines were affected — the
                // rest of the document is untouched either way.
                try { this.config.vectorClock.merge(incomingVc); } catch {}

                if (this.config.onDeltaApplied) {
                  await this.config.onDeltaApplied(fileId, mergeResult.merged, crypto.randomUUID(), this.config.localNodeId, this.config.vectorClock.toJSON(), 'merge', true);
                }

                if (mergeResult.hadConflict) {
                  // Record for audit/history, but resolve automatically —
                  // no manual owner arbitration UI. The conflict is already
                  // scoped to specific line(s), not the whole document.
                  const conflictId = crypto.randomUUID();
                  await this.config.lwwResolver.recordConflict(conflictId, fileId, this.config.localNodeId, nodeId, localContent, remoteContent || localContent, this.config.vectorClock.toJSON(), incomingVc.toJSON());
                  if (this.config.onConflictNotified) {
                    await this.config.onConflictNotified(conflictId, fileId, `${mergeResult.conflictHunks} concurrently-edited line(s) auto-resolved by Last-Write-Wins between ${nodeId} and ${this.config.localNodeId}`);
                  }
                }

                // Broadcast the merge result so online Web Socket clients get it instantly
                this.broadcast({
                  type: 'DELTA_PUSH',
                  eventId: crypto.randomUUID(),
                  nodeId: this.config.localNodeId,
                  fileId,
                  deltaBase64: '',
                  content: mergeResult.merged,
                  logicalTimestamp: this.config.vectorClock.counters[this.config.vectorClock.nodeIndex] || 1,
                  vectorClockJson: this.config.vectorClock.toJSON(),
                  timestamp: new Date().toISOString(),
                } as any);

                this._metrics.pushSuccessCount++;
                this._metrics.pushTotalLatencyMs += Date.now() - pushT0;
                res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  merged: true,
                  // NOTE: `lwwResolved` is also set (inaccurately) by the
                  // plain sequential/"dominated" push path below for any
                  // ordinary non-conflicting edit — don't key UI behavior
                  // off it. `hadConflict` here means an actual concurrent,
                  // overlapping line was just auto-resolved by LWW.
                  hadConflict: mergeResult.hadConflict,
                  conflictHunks: mergeResult.conflictHunks,
                  serverContent: mergeResult.merged,
                  vectorClock: this.config.vectorClock.toJSON(),
                }));
                return;
              } else {
                resolveResult = await this.config.lwwResolver.resolve(eventA, eventB, this.config.vectorClock, incomingVc);
                
                if (resolveResult.outcome === 'escalated' && resolveResult.conflictId) {
                  console.log(`[PeerManager] Intercepting online concurrent edit. Applying silent LWW instead of conflict history.`);
                  
                  try {
                    await this.config.lwwResolver['prisma'].conflict.delete({ where: { conflictId: resolveResult.conflictId } });
                  } catch (e) {}

                  const serverCommittedAt = latestEvent ? new Date(latestEvent.createdAt).getTime() : 0;
                  const incomingCommittedAt = body.committedAt || Date.now();
                  
                  if (incomingCommittedAt >= serverCommittedAt) {
                    // b-wins: Incoming edit wins. Apply it locally exactly like 'dominated'
                    try { this.config.vectorClock.merge(incomingVc); } catch {}
                    let newContent = remoteContent || localContent;
                    if (delta) {
                      try {
                        const decoded = decodeDelta(localContent, delta);
                        newContent = decoded.content;
                      } catch {}
                    }
                    if (this.config.onDeltaApplied) {
                      await this.config.onDeltaApplied(fileId, newContent, crypto.randomUUID(), this.config.localNodeId, this.config.vectorClock.toJSON(), 'merge', true);
                    }

                    // Broadcast the LWW result so online Web Socket clients get it instantly
                    this.broadcast({
                      type: 'DELTA_PUSH',
                      eventId: crypto.randomUUID(),
                      nodeId: this.config.localNodeId,
                      fileId,
                      deltaBase64: '',
                      content: newContent,
                      logicalTimestamp: incomingVc.counters[incomingVc.nodeIndex] || 1,
                      vectorClockJson: this.config.vectorClock.toJSON(),
                      timestamp: new Date().toISOString(),
                    } as any);

                    resolveResult.outcome = 'b-wins'; // Skip 'escalated' block
                  } else {
                    // a-wins: Server edit wins. Do nothing locally (discard incoming)
                    resolveResult.outcome = 'a-wins'; // Skip 'escalated' block
                  }
                  resolveResult.conflictId = null;
                }
              }

              if (resolveResult.outcome === 'escalated') {
                this._metrics.conflictsDetectedThisSession++;
                
                if (resolveResult.conflictId) {
                  this._metrics.conflictEscalatedAt.set(resolveResult.conflictId, Date.now());
                  
                  console.log(`[PeerManager] Escalate conflict ${resolveResult.conflictId} - awaiting manual user resolution in UI`);
                  
                  if (this.config.onConflictNotified) {
                    await this.config.onConflictNotified(
                      resolveResult.conflictId,
                      fileId,
                      `Offline conflict detected between ${nodeId} and ${this.config.localNodeId}`
                    );
                  }
                }
                
                // Return conflict status to the HTTP pusher
                this._metrics.pushSuccessCount++;
                this._metrics.pushTotalLatencyMs += Date.now() - pushT0;
                res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                  merged: false,
                  conflict: true,
                  conflictId: resolveResult.conflictId,
                  serverContent: remoteContent || localContent,
                  vectorClock: this.config.vectorClock.toJSON()
                }));
                return;
              }
            } catch (resolveErr: any) {
              console.warn('[PeerManager] lwwResolver failed in concurrent push:', resolveErr?.message);
            }

            // Non-escalated concurrent — count as success
            this._metrics.pushSuccessCount++;
            this._metrics.pushTotalLatencyMs += Date.now() - pushT0;

            // Relay concurrent HTTP push to WebSocket peers if we have a delta
            if (delta) {
              this.broadcast({
                type: 'DELTA_PUSH',
                eventId: eventB.eventId,
                nodeId,
                fileId,
                deltaBase64: delta,
                content: remoteContent || localContent,
                logicalTimestamp: incomingVc.counters[incomingVc.nodeIndex] || 1,
                vectorClockJson: this.config.vectorClock.toJSON(),
                timestamp: new Date().toISOString(),
              } as any);
            }

            res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ merged: true, lwwResolved: true, vectorClock: this.config.vectorClock.toJSON() }));
            return;
          }
        } catch (pushError: any) {
          console.error('[PeerManager] EXACT /sync/push ERROR:', pushError?.message);
          console.error(pushError?.stack);
          res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: pushError?.message || 'Internal Server Error' }));
          return;
        }
      }

      // ── GET /sync/history ────────────────────────────────────────────────
      if (url.pathname === '/sync/history' && req.method === 'GET') {
        try {
          const fileId = parseInt(url.searchParams.get('fileId') || '', 10);
          if (isNaN(fileId) || !fileId) {
            res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Valid fileId required' }));
            return;
          }
          if (!this.config.eventLog) {
            res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Engine dependencies missing' }));
            return;
          }

          const history = await this.config.eventLog.getHistory(fileId);
          
          let currentContent = '';
          const reconstructedEntries = history.map((entry: any) => {
            if (!entry.isCompacted) {
              try {
                if (entry.eventType === 'edit' || entry.eventType === 'merge') {
                  const decodeResult = decodeDelta(currentContent, entry.payload);
                  currentContent = decodeResult.content;
                } else {
                  currentContent = entry.payload;
                }
              } catch {
                currentContent = entry.payload;
              }
            }
            
            return {
              id: entry.id,
              // The viewer orders and dates every version by what the one
              // machine all peers talk to recorded, never by the author's
              // own clock — otherwise two laptops a few minutes apart print
              // different times for the same version and disagree about
              // which is newest. `seqNo`/`recordedAt` are the names the
              // cloud relay uses for exactly that; the row id and row
              // timestamp are this host's equivalents.
              seqNo: entry.id,
              recordedAt: entry.createdAt.getTime(),
              eventId: entry.eventId,
              nodeId: entry.nodeId,
              eventType: entry.eventType,
              logicalTimestamp: entry.logicalTimestamp,
              createdAt: entry.createdAt.toISOString(),
              isCompacted: entry.isCompacted,
              // The reconstructed document at this point in the log. Without
              // it the viewer had only a 200-character stripped preview to
              // diff and to restore from, so a desktop-hosted room showed a
              // truncated, tagless version of every revision.
              fullContent: currentContent,
              payloadPreview: currentContent.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').slice(0, 200),
            };
          });

          res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            data: {
              fileId,
              entries: reconstructedEntries,
              totalEntries: history.length,
            }
          }));
          return;
        } catch (historyError: any) {
          console.error('[PeerManager] EXACT /sync/history ERROR:', historyError?.message);
          res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: historyError?.message || 'Internal Server Error' }));
          return;
        }
      }

      // ── POST /sync/restore ───────────────────────────────────────────────
      if (url.pathname === '/sync/restore' && req.method === 'POST') {
        let bodyStr = '';
        for await (const chunk of req) bodyStr += chunk;
        let body: any;
        try {
          body = JSON.parse(bodyStr);
        } catch (err: any) {
          res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Malformed JSON payload' }));
          return;
        }

        const fileId = parseInt(body.fileId, 10);
        const targetEventId = body.eventId;

        if (isNaN(fileId) || !fileId || !targetEventId) {
          res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Valid fileId and eventId required' }));
          return;
        }

        if (!this.config.eventLog || !this.config.vectorClock) {
          res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Engine dependencies missing' }));
          return;
        }

        try {
          const history = await this.config.eventLog.getHistory(fileId);
          const targetEvent = history.find((e: any) => e.eventId === targetEventId);
          if (!targetEvent) {
            res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Event not found in history' }));
            return;
          }

          let content = '';
          for (const event of history) {
            if (event.isCompacted) continue;
            try {
              if (event.eventType === 'edit' || event.eventType === 'merge') {
                const decodeResult = decodeDelta(content, event.payload);
                content = decodeResult.content;
              } else if (event.eventType === 'restore') {
                content = event.payload;
              }
            } catch {
              content = event.payload;
            }
            if (event.eventId === targetEventId) break;
          }

          // Generate restore event locally in EventLog
          this.config.vectorClock.increment();
          const vcJson = this.config.vectorClock.toJSON();
          const restoreEventId = crypto.randomUUID();

          await this.config.eventLog.appendEvent({
            eventId: restoreEventId,
            fileId,
            nodeId: this.config.vectorClock.nodeId || 'unknown',
            eventType: 'restore',
            logicalTimestamp: this.config.vectorClock.counters[this.config.vectorClock.nodeIndex],
            vectorClockJson: vcJson,
            payload: content,
          });

          // Trigger local update on Desktop UI
          if (this.config.onDeltaApplied) {
            await this.config.onDeltaApplied(
              fileId,
              content,
              restoreEventId,
              'remote-web',
              vcJson,
              'restore',
              false
            );
          }

          // Broadcast to any other connected Web Apps
          const pushMsg: any = {
            type: 'DELTA_PUSH',
            eventId: restoreEventId,
            nodeId: this.config.vectorClock.nodeId || 'unknown',
            fileId,
            deltaBase64: Buffer.from(content).toString('base64'),
            content: content,
            eventType: 'restore',
            logicalTimestamp: this.config.vectorClock.counters[this.config.vectorClock.nodeIndex],
            vectorClockJson: vcJson,
            timestamp: new Date().toISOString(),
          };
          this.broadcast(pushMsg);

          res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            data: {
              fileId,
              restoredToEventId: targetEventId,
              restoreEventId,
              content,
              vectorClock: vcJson
            }
          }));
          return;
        } catch (restoreError: any) {
          console.error('[PeerManager] EXACT /sync/restore ERROR:', restoreError?.message);
          res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: restoreError?.message || 'Internal Server Error' }));
          return;
        }
      }
      
      // ── GET /metrics ─────────────────────────────────────────────────────
      if (url.pathname === '/metrics' && req.method === 'GET') {
        try {
          const m = this._metrics;
          const sessionDurationMs = Date.now() - m.sessionStartMs;
          const throughputPerMin = sessionDurationMs > 0
            ? Math.round((m.pushCount / sessionDurationMs) * 60000 * 10) / 10
            : 0;
          const avgLatencyMs = m.pushSuccessCount > 0
            ? Math.round((m.pushTotalLatencyMs / m.pushSuccessCount) * 10) / 10
            : null;
          const avgResolveMs = m.conflictsResolvedThisSession > 0
            ? Math.round((m.conflictTotalResolveMs / m.conflictsResolvedThisSession) * 10) / 10
            : null;

          // EventLog row count for conflict detection rate denominator
          let eventLogRows = 0;
          try {
            const history = await this.config.eventLog.getHistory(0);
            eventLogRows = history.length;
          } catch {}

          const payload = {
            // Session counters
            pushCount: m.pushCount,
            pushSuccessCount: m.pushSuccessCount,
            avgPushLatencyMs: avgLatencyMs,
            throughputPerMin,
            conflictsDetectedThisSession: m.conflictsDetectedThisSession,
            conflictsResolvedThisSession: m.conflictsResolvedThisSession,
            avgConflictResolveMs: avgResolveMs,
            eventLogRows,
            // Live state
            connectedPeerCount: this.peers.size,
            pendingConflicts: this.config.vectorClock ? 0 : 0, // derived from host state
            dataLossRate: 0,
            sessionDurationMs,
          };
          res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify(payload));
          return;
        } catch (metricsErr: any) {
          res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: metricsErr?.message || 'Metrics unavailable' }));
          return;
        }
      }

      // ── POST /sync/resolve ───────────────────────────────────────────────
      if (url.pathname === '/sync/resolve' && req.method === 'POST') {
        let bodyStr = '';
        for await (const chunk of req) bodyStr += chunk;
        let body: any;
        try {
          body = JSON.parse(bodyStr);
        } catch (err: any) {
          res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Malformed JSON payload' }));
          return;
        }

        const { conflictId, fileId, content, vectorClock, authorNodeId, action } = body;

        if (!conflictId || !fileId || content === undefined) {
          res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'conflictId, fileId, and content are required' }));
          return;
        }

        try {
          if (action === 'reject') {
            // Mark conflict as rejected in SQLite Database
            await this.config.prisma.conflict.updateMany({
              where: { conflictId },
              data: { status: 'rejected', resolvedAt: new Date() }
            });

            // (Optional) Broadcast MERGE_REJECT if we wanted to tell other peers,
            // but usually rejecting just means dropping it, so peers will ignore it anyway.
            // For now, just succeeding is enough for the Web App.
          } else {
            const stringFileId = String(fileId);
            const numericFileId = Number(fileId);

            // Fetch any LOCAL pending conflicts for this file (Desktop and Matchmaker generate different UUIDs)
            const localConflicts = await this.config.prisma.conflict.findMany({
              where: { fileId: stringFileId, status: 'pending' }
            });
            const effectiveConflictIds = Array.from(new Set([conflictId, ...localConflicts.map((c: any) => c.conflictId)]));

            // Mark conflict as resolved in SQLite Database
            await this.config.prisma.conflict.updateMany({
              where: { conflictId: { in: effectiveConflictIds } },
              data: { status: 'resolved', resolvedAt: new Date() }
            });

            // Add history entry for the resolution
            const resolutionEventId = crypto.randomUUID();
            try {
              await this.config.eventLog.appendEvent({
                eventId: resolutionEventId,
                fileId: numericFileId,
                nodeId: authorNodeId || 'remote',
                eventType: 'conflict-resolve',
                logicalTimestamp: this.config.vectorClock.counters[this.config.vectorClock.nodeIndex] || 1,
                vectorClockJson: vectorClock || this.config.vectorClock.toJSON(),
                payload: content,
              });
            } catch (evErr: any) {
              console.warn('[PeerManager] appendEvent failed in /sync/resolve:', evErr?.message);
            }

            // Trigger the application layer to apply the resolution
            if (this.config.onMergeAccepted) {
              for (const cid of effectiveConflictIds) {
                await this.config.onMergeAccepted(cid, numericFileId, content, vectorClock || {}, authorNodeId || 'remote');
              }
            }

            // Broadcast MERGE_ACCEPT to all other peers so they also resolve it
            const mergeAcceptMsg: any = {
              type: 'MERGE_ACCEPT',
              conflictId,
              fileId: numericFileId,
              winner: 'B', // Treat remote resolution as winning side B
              winnerPayload: content,
              resolutionEventId,
              resolvedBy: authorNodeId || 'remote',
              logicalTimestamp: this.config.vectorClock.counters[this.config.vectorClock.nodeIndex] || 1,
              vectorClockJson: vectorClock || this.config.vectorClock.toJSON(),
              timestamp: new Date().toISOString()
            };
            this.broadcast(mergeAcceptMsg as PeerMessage);
          }

          res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        } catch (resolveError: any) {
          console.error('[PeerManager] /sync/resolve ERROR:', resolveError?.message);
          res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: resolveError?.message || 'Internal Server Error' }));
          return;
        }
      }

      res.writeHead(404, corsHeaders);
      res.end();
    } catch (e: any) {
      console.error('[PeerManager] HTTP error:', e);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
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
  public broadcast(message: PeerMessage, excludeNodeId?: string): number {
    const data = serialiseMessage(message);
    let sentCount = 0;

    for (const [socket, peer] of this.peers) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue;
      }
      if (!peer.isAuthenticated) {
        continue;
      }
      if (excludeNodeId && peer.nodeId === excludeNodeId) {
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
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
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

      case 'CURSOR_UPDATE':
        // Forward to other peers
        this.broadcastToRoom(msg, socket);
        // Forward to local UI
        if (this.config.onCursorUpdate) {
          this.config.onCursorUpdate(msg);
        }
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
    this.broadcastPeerList();
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
  /**
   * Serialises delta application per file.
   *
   * Applying a delta is read-modify-write: the handler reads the file's
   * current content, decodes against it, then writes the result back. Nothing
   * held those steps together, so deltas arriving close in time all read the
   * same content before any of them had written, decoded against a base that
   * was about to be superseded, and were rejected by the checksum guard.
   *
   * It showed up wherever deltas arrive in a burst — a reconnecting peer being
   * sent five missed events applied one and failed four with "Delta checksum
   * mismatch", and two peers saving at the same moment each dropped the
   * other's edit. The deltas were never corrupted; they were simply applied
   * against the wrong base.
   *
   * Chaining per file makes each delta see the result of the one before it.
   * Different files remain independent, so this does not serialise unrelated
   * work, and a failure is contained to its own link rather than stalling the
   * chain.
   */
  private deltaChains: Map<number, Promise<void>> = new Map();

  /**
   * Event ids this node has already applied and relayed, newest last.
   *
   * `applyDeltaPush` forwards every delta on to its other peers so a hub can
   * serve a star topology, excluding only the message's original author. With
   * two peers there is nobody left to forward to and that is enough. With
   * three peers connected to each other it is not: A forwards B's edit to C,
   * C forwards the same message back to A — the author is still B, so neither
   * exclusion applies — and the two keep handing it to each other. Measured
   * on three real instances, one save produced an unbounded exchange of the
   * same event id until the receive-rate limiter closed both links with code
   * 4029, after which the third instance was left with no peers and took no
   * further part in any sync.
   *
   * The duplicate was invisible in the event log because `appendEvent` is
   * idempotent on `eventId`, so nothing was ever stored twice. Only the
   * traffic multiplied. Remembering what has already been forwarded stops
   * the loop after one extra message per edge.
   */
  private seenEvents: Set<string> = new Set();

  /**
   * Runs `task` on this file's serialisation chain: after any delta already
   * being applied to it, and before the next one starts.
   *
   * A local save reads the file's current content, encodes a delta against
   * it, and appends that delta to the log. Applying a peer's delta does the
   * same three things. Interleaved, they produce a log whose newest entry
   * does not describe the document: the save encodes against content the
   * peer's merge then replaces, the merge's event is appended first, and
   * replaying the log afterwards reconstructs the save's text with the
   * peer's edit missing — so version history shows, and restore would
   * recreate, a version that never existed. Measured on two instances with
   * identical hashes on every run.
   *
   * Sharing one chain per file makes the two paths take turns instead.
   */
  public withFileLock<T>(fileId: number, task: () => Promise<T>): Promise<T> {
    const previous = this.deltaChains.get(fileId) ?? Promise.resolve();
    const next = previous.catch(() => { }).then(task);
    this.deltaChains.set(
      fileId,
      next.then(
        () => { },
        () => { }
      )
    );
    return next;
  }

  /** Caps `seenEvents`; a Set iterates in insertion order, so the oldest go. */
  private trimSeenEvents(): void {
    const MAX = 2000;
    const DROP = 500;
    if (this.seenEvents.size <= MAX) return;
    let dropped = 0;
    for (const id of this.seenEvents) {
      this.seenEvents.delete(id);
      if (++dropped >= DROP) break;
    }
  }

  private handleDeltaPush(
    socket: WebSocket,
    msg: DeltaPushMessage
  ): Promise<void> {
    const previous = this.deltaChains.get(msg.fileId) ?? Promise.resolve();
    const next = previous
      .catch(() => { /* a failed predecessor must not block what follows */ })
      .then(() => this.applyDeltaPush(socket, msg));
    this.deltaChains.set(msg.fileId, next.catch(() => { }));
    return next;
  }

  /**
   * Decides whether a delta that failed its checksum is a concurrent edit
   * rather than a corrupt one, and if so resolves it.
   *
   * Returns the content to adopt, or null to let the original failure stand.
   *
   * Three conditions must all hold before this is treated as a conflict, so
   * that genuine corruption is never waved through:
   *
   *   - the clocks are available and compare as `concurrent`, meaning each
   *     side holds an edit the other has not seen. A `dominant`, `dominated`
   *     or `equal` relation is a sequencing problem, not a conflict, and the
   *     original error is the right answer there.
   *   - the message carries the sender's full content. `file:save` includes
   *     it on every broadcast; without it there is nothing to resolve with,
   *     because the delta cannot be decoded against a base we do not have.
   *   - the payload decoded far enough to be structurally valid.
   *
   * The winner follows the engine's existing rule — the higher logical
   * timestamp, with the originating node id breaking an exact tie so that
   * both peers independently reach the same verdict and converge without
   * another round trip.
   */
  /**
   * Which edit last wrote each region of a file, measured against `base`.
   *
   * This is what a contested region must be decided by. Deciding it from the
   * file's highest stamp instead made the verdict depend on what had arrived:
   * a peer whose log did not yet hold both contesting edits compared the
   * wrong pair, and three peers reconciling after all three edited offline
   * ended up permanently disagreeing in about a third of orderings.
   *
   * The log makes this recoverable without storing anything new. A merge
   * event records the ORIGINAL author's `nodeId` and `logicalTimestamp`, not
   * the merging node's, so replaying the log and attributing each event's
   * changes yields the same stamp for a region on every peer that holds that
   * event. Every attribution is taken against the one base, so region
   * indices stay aligned even across insertions and deletions.
   *
   * Returns null if the log cannot be read or replayed, so the caller can
   * fall back to the document-wide comparison rather than guess.
   */
  private async regionStamps(
    fileId: number,
    baseContent: string
  ): Promise<{
    lines: Array<{ ts: number; nodeId: string } | null>;
    gaps: Array<{ ts: number; nodeId: string } | null>;
  } | null> {
    let history: Awaited<ReturnType<EventLogService['getHistory']>>;
    try {
      history = await this.config.eventLog.getHistory(fileId);
    } catch {
      return null;
    }

    const baseAttribution = attributeAgainstBase(baseContent, baseContent);
    const nLines = baseAttribution.replacement.length;
    const lines: Array<{ ts: number; nodeId: string } | null> = new Array(nLines).fill(null);
    const gaps: Array<{ ts: number; nodeId: string } | null> = new Array(nLines + 1).fill(null);

    let previousContent = '';
    let previous = attributeAgainstBase(baseContent, '');

    for (const entry of history) {
      if (entry.isCompacted) continue;

      let nextContent: string;
      try {
        nextContent =
          entry.eventType === 'edit' || entry.eventType === 'merge'
            ? decodeDelta(previousContent, entry.payload).content
            : entry.payload;
      } catch {
        // A gap in the chain. Skip this event rather than attribute its
        // changes to the wrong regions.
        continue;
      }

      const next = attributeAgainstBase(baseContent, nextContent);
      const stamp = { ts: entry.logicalTimestamp, nodeId: entry.nodeId };

      for (let i = 0; i < nLines; i++) {
        if (lineDiffers(previous, next, i)) lines[i] = stamp;
      }
      for (let i = 0; i <= nLines; i++) {
        if (gapDiffers(previous, next, i)) gaps[i] = stamp;
      }

      previousContent = nextContent;
      previous = next;
    }

    return { lines, gaps };
  }

  private async resolveConcurrentDelta(
    msg: DeltaPushMessage,
    currentContent: string,
    _decodeErr: Error
  ): Promise<{ content: string; hadConflict: boolean; conflictHunks: number } | null> {
    const remoteContent = msg.content;
    const baseContent = msg.baseContent;

    // Both the sender's result and the base it was taken against are needed.
    // Without the base there is no common ancestor, so there is no way to
    // tell which lines this peer changed from which lines we changed.
    if (typeof remoteContent !== 'string') return null;
    if (typeof baseContent !== 'string') return null;

    // Integrity gate. Replaying the delta against the sender's OWN base must
    // reproduce the sender's own content; the checksum inside the payload is
    // FNV-1a of exactly that. If it does, the payload is provably intact and
    // the only reason it failed here is that our base has moved on — a
    // genuine concurrent edit. If it does not, the payload really is damaged
    // and the original error stands.
    //
    // This replaces an earlier vector-clock test. The clock is per node and
    // shared across every file, so unrelated saves on other files could make
    // two genuinely concurrent edits compare as `dominant` or `dominated`,
    // and the remote edit was then silently dropped. Verifying the payload
    // against its own base is both local to this file and a stricter
    // corruption check than the clock ever was.
    try {
      const roundTrip = decodeDelta(baseContent, msg.deltaBase64);
      if (roundTrip.content !== remoteContent) return null;
    } catch {
      return null;
    }

    // Who wins a region BOTH sides changed. Resolved from the identity of the
    // edit that last wrote this file locally rather than from the global
    // clock, so the comparison is per file and so a third peer relaying this
    // edit arbitrates the same pair the original two peers did.
    let localTs = this.config.vectorClock?.counters?.[this.config.vectorClock.nodeIndex] ?? 0;
    let localNode = this.config.localNodeId;
    try {
      const history = await this.config.eventLog.getHistory(msg.fileId);
      // The HIGHEST (logicalTimestamp, nodeId) among this file's events, not
      // the one most recently applied.
      //
      // Last-Write-Wins means the highest logical timestamp wins. Taking the
      // last-applied event instead made the comparison depend on arrival
      // order, and arrival order differs per peer: a bystander's edit to
      // another region could be the newest arrival, so one peer compared the
      // incoming edit against that bystander while the two peers actually
      // contesting the region compared against each other. They then chose
      // different winners for the same region and stayed divergent. Measured
      // with three instances reconnecting after editing offline: all three
      // held the right text in every region, but one disagreed on which of
      // the two contesting versions the contested region should carry.
      let best: { logicalTimestamp: number; nodeId: string } | null = null;
      for (const e of history) {
        if (
          !best ||
          e.logicalTimestamp > best.logicalTimestamp ||
          (e.logicalTimestamp === best.logicalTimestamp && e.nodeId > best.nodeId)
        ) {
          best = { logicalTimestamp: e.logicalTimestamp, nodeId: e.nodeId };
        }
      }
      if (best) {
        localTs = best.logicalTimestamp;
        localNode = best.nodeId;
      }
    } catch {
      // Fall back to the clock values above.
    }

    const remoteTs = msg.logicalTimestamp ?? 0;
    const remoteWins =
      remoteTs > localTs || (remoteTs === localTs && msg.nodeId > localNode);

    // Line-granular 3-way merge against the common ancestor. A line only one
    // side changed keeps that side's text; only a region BOTH sides changed
    // is contested, and only that region is decided by the winner above.
    //
    // `mergeThreeWay` rather than `mergeConcurrentEdit`: the latter replays
    // one side's patches onto the other's document, and because it matches
    // hunks at exact offsets, one peer inserting or deleting a line shifts
    // every later line and the other peer's untouched-region edits stop
    // matching and are discarded. Measured on three Electron instances, an
    // insertion on line 2 destroyed an unrelated edit on line 3, a deletion
    // did the same, and a contested line took an uncontested one with it.
    // The base-anchored merge has no offsets to miss. See line-merge-3way.ts.
    // Decide each contested region against the edit that wrote THAT region,
    // not against the file as a whole. `remoteWins` above stays as the
    // fallback for when provenance cannot be established.
    const stamps = await this.regionStamps(msg.fileId, baseContent);
    const incomingStamp = { ts: remoteTs, nodeId: msg.nodeId };
    const decideRegion = stamps
      ? (kind: 'line' | 'gap', index: number): boolean => {
          const localStamp = kind === 'line' ? stamps.lines[index] : stamps.gaps[index];
          if (!localStamp) return remoteWins;
          return (
            incomingStamp.ts > localStamp.ts ||
            (incomingStamp.ts === localStamp.ts && incomingStamp.nodeId > localStamp.nodeId)
          );
        }
      : undefined;

    const merge = mergeThreeWay(
      currentContent,
      baseContent,
      remoteContent,
      remoteWins,
      decideRegion
    );

    console.log(
      `[PeerManager] Concurrent edit on file ${msg.fileId} merged line-wise ` +
        `(local ts=${localTs}, remote ts=${remoteTs} → ` +
        `${remoteWins ? 'remote' : 'local'} wins contested lines); ` +
        `${merge.conflictHunks} contested region(s)`
    );

    return {
      content: merge.merged,
      hadConflict: merge.hadConflict,
      conflictHunks: merge.conflictHunks,
    };
  }

  private async applyDeltaPush(
    socket: WebSocket,
    msg: DeltaPushMessage
  ): Promise<void> {
    console.log(
      `[PeerManager] DELTA_PUSH from ${msg.nodeId} for file ${msg.fileId}`
    );

    // A message that has already been applied and forwarded must not be
    // forwarded again, or a mesh of three or more peers circulates it
    // forever. Acknowledge it so the sender does not treat it as lost, and
    // stop there.
    if (this.seenEvents.has(msg.eventId)) {
      console.log(
        `[PeerManager] Ignoring already-seen event ${msg.eventId} for file ${msg.fileId}`
      );
      this.sendAck(socket, msg);
      return;
    }
    this.seenEvents.add(msg.eventId);
    this.trimSeenEvents();

    try {
      // Handle tombstone delete event
      if (msg.eventType === 'delete') {
        await this.config.eventLog.appendEvent({
          eventId: msg.eventId,
          fileId: msg.fileId,
          nodeId: msg.nodeId,
          eventType: 'delete',
          logicalTimestamp: msg.logicalTimestamp,
          vectorClockJson: msg.vectorClockJson,
          payload: '',
        });

        if (this.config.onDeltaApplied) {
          await this.config.onDeltaApplied(
            msg.fileId,
            '', // Content is empty for delete
            msg.eventId,
            msg.nodeId,
            msg.vectorClockJson,
            'delete'
          );
        }
      } else if (
        msg.eventType === 'restore' &&
        typeof msg.content === 'string' &&
        typeof msg.baseContent !== 'string'
      ) {
        // A LIVE restore: a snapshot of a whole past version, not a change
        // relative to the receiver's content. `file:restore` broadcasts it
        // with `deltaBase64` set to base64 of the content itself rather than
        // to an encoded delta, so decoding it as a delta threw, the error was
        // swallowed by the catch below, and the restore never reached any
        // peer: one user rolled a document back and everyone else kept the
        // newer text. Treated as the snapshot it is, it propagates.
        //
        // A restore replayed by CATCH-UP takes the other branch, because it
        // arrives with `baseContent` and a real delta. Adopting a snapshot
        // wholesale is right when the peers were in step, and wrong after a
        // disconnection: it would overwrite whatever the receiver wrote while
        // it was away. With an ancestor present the rollback is merged like
        // any other change, so it propagates AND the receiver keeps its work.
        await this.config.eventLog.appendEvent({
          eventId: msg.eventId,
          fileId: msg.fileId,
          nodeId: msg.nodeId,
          eventType: 'restore',
          logicalTimestamp: msg.logicalTimestamp,
          vectorClockJson: msg.vectorClockJson,
          payload: msg.content,
        });

        if (this.config.onDeltaApplied) {
          await this.config.onDeltaApplied(
            msg.fileId,
            msg.content,
            msg.eventId,
            msg.nodeId,
            msg.vectorClockJson,
            'restore'
          );
        }

        console.log(
          `[PeerManager] Applied restore for file ${msg.fileId} ` +
            `(${msg.content.length} chars from ${msg.nodeId})`
        );
      } else {
        // Step 1: Get current local content.
        const currentContent = await this.config.getFileContent(msg.fileId);

        // Step 2: Decode the delta.
        //
        // The checksum is FNV-1a of the content the SENDER ended up with, so a
        // mismatch means "applying this to my content did not reproduce yours"
        // — my base differs from theirs. That is true of a corrupted payload
        // and equally true of a perfectly valid edit made concurrently, and
        // the checksum alone cannot tell them apart. Treating both as
        // corruption silently discarded the remote edit whenever two peers
        // typed at the same time.
        //
        // The vector clocks can tell them apart, so they decide. Only a
        // provably concurrent pair takes the alternate path; anything else
        // still fails exactly as before, which keeps integrity checking
        // intact rather than relaxing it.
        let decodeResult: ReturnType<typeof decodeDelta>;
        let newContent: string;
        let merged: { hadConflict: boolean; conflictHunks: number } | null = null;
        try {
          decodeResult = decodeDelta(currentContent, msg.deltaBase64);
          newContent = decodeResult.content;
        } catch (decodeErr) {
          const resolved = await this.resolveConcurrentDelta(
            msg,
            currentContent,
            decodeErr as Error
          );
          if (!resolved) throw decodeErr;
          newContent = resolved.content;
          merged = { hadConflict: resolved.hadConflict, conflictHunks: resolved.conflictHunks };
          decodeResult = { content: resolved.content, opsApplied: 0, checksumValid: true } as any;
        }

        // Step 3: Append to EventLog.
        //
        // On a clean apply the sender's delta is also a valid delta against
        // our content, so it is stored as-is. After a merge it is not: it
        // describes the sender's base, not ours, and replaying it would not
        // reproduce what we actually hold. Re-encoding keeps the log a valid
        // chain for this node, which is what version history and restore
        // replay through.
        let logPayload = msg.deltaBase64;
        if (merged) {
          try {
            const reEncoded = encodeDelta(currentContent, newContent, 'merge.txt');
            if (reEncoded.deltaBase64) logPayload = reEncoded.deltaBase64;
          } catch (encErr) {
            console.warn(
              `[PeerManager] Could not re-encode merged delta for file ${msg.fileId}; ` +
                `storing the sender's payload: ${encErr instanceof Error ? encErr.message : String(encErr)}`
            );
          }
        }

        await this.config.eventLog.appendEvent({
          eventId: msg.eventId,
          fileId: msg.fileId,
          nodeId: msg.nodeId,
          eventType: 'merge',
          logicalTimestamp: msg.logicalTimestamp,
          vectorClockJson: msg.vectorClockJson,
          payload: logPayload,
        });

        // Step 4: Notify the application layer.
        if (this.config.onDeltaApplied) {
          await this.config.onDeltaApplied(
            msg.fileId,
            newContent,
            msg.eventId,
            msg.nodeId,
            msg.vectorClockJson,
            'merge'
          );
        }

        // Step 4b: Record a conflict only for a region both sides changed.
        // A merge where every hunk applied cleanly is not a conflict — the
        // peers edited different parts of the document and both edits are
        // present — so recording one there would report data loss that did
        // not happen.
        if (merged?.hadConflict) {
          try {
            // `escalateToOwner`, not `recordConflict`: the latter is not a
            // method on LWWResolver and never has been, so every call site
            // threw `recordConflict is not a function` into a catch block and
            // no conflict was ever written. The record is what preserves the
            // losing text — both payloads are stored — so without it a
            // contested line was decided with nothing kept to recover from.
            const conflictId = await this.config.lwwResolver.escalateToOwner(
              {
                eventId: crypto.randomUUID(),
                fileId: msg.fileId,
                nodeId: this.config.localNodeId,
                payload: currentContent,
                logicalTimestamp:
                  this.config.vectorClock.counters[this.config.vectorClock.nodeIndex] || 1,
                vectorClockJson: this.config.vectorClock.toJSON(),
              },
              {
                eventId: msg.eventId,
                fileId: msg.fileId,
                nodeId: msg.nodeId,
                payload: msg.content ?? '',
                logicalTimestamp: msg.logicalTimestamp,
                vectorClockJson: msg.vectorClockJson,
              }
            );
            if (this.config.onConflictNotified) {
              await this.config.onConflictNotified(
                conflictId,
                msg.fileId,
                `${merged.conflictHunks} concurrently-edited line(s) auto-resolved by ` +
                  `Last-Write-Wins between ${msg.nodeId} and ${this.config.localNodeId}`
              );
            }
          } catch (cErr) {
            console.warn(
              `[PeerManager] Could not record conflict for file ${msg.fileId}: ` +
                `${cErr instanceof Error ? cErr.message : String(cErr)}`
            );
          }
        }

        console.log(
          `[PeerManager] Applied delta for file ${msg.fileId} ` +
            `(${decodeResult.opsApplied} ops${merged ? `, merged ${merged.conflictHunks} contested region(s)` : ''})`
        );
      }

      // Step 4.5: Relay the incoming delta to all OTHER connected peers (Star Topology Hub)
      this.broadcast(msg, msg.nodeId);

      // Step 5: Send DELTA_ACK.
      this.sendAck(socket, msg);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Applying failed, so this event has NOT been handled — forget it, or a
      // later retry of the same event id would be dismissed as a duplicate
      // and the edit would be lost for good.
      this.seenEvents.delete(msg.eventId);
      console.error(
        `[PeerManager] Failed to apply DELTA_PUSH for file ${msg.fileId}: ${errMsg}`
      );
      // Don't disconnect — the next delta might work if the local file
      // state catches up.
    }
  }

  /** Confirms receipt of a delta to the peer that sent it. */
  private sendAck(socket: WebSocket, msg: DeltaPushMessage): void {
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
        msg.sinceTimestamp,
        msg.knownPerNode
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
        msg.vectorClockJson,
        msg.resolvedBy
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
    this.broadcastPeerList();
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

  // ── Internal: Broadcast ─────────────────────────────────────────────

  /**
   * Broadcasts a message to all connected peers in the room.
   * @param message The message to broadcast.
   * @param excludeSocket Optional socket to exclude (e.g., the sender).
   */
  public broadcastToRoom(message: PeerMessage, excludeSocket?: WebSocket): void {
    const raw = serialiseMessage(message);
    for (const socket of this.peers.keys()) {
      if (socket !== excludeSocket && socket.readyState === WebSocket.OPEN) {
        socket.send(raw);
      }
    }
  }

  /**
   * Pushes a local cursor update to the network.
   */
  public sendCursorUpdate(msg: import('./message-schema').CursorUpdateMessage): void {
    this.broadcastToRoom(msg);
  }

  /**
   * Broadcasts the current peer list to all connected peers.
   */
  private broadcastPeerList(): void {
    const activePeers = [];
    for (const [socket, peer] of this.peers) {
      if (peer.isAuthenticated && peer.nodeId && socket.readyState === WebSocket.OPEN) {
        activePeers.push({
          nodeId: peer.nodeId,
          displayName: peer.displayName || 'Connecting…',
          address: peer.address,
          port: peer.port,
          isHost: false,
        });
      }
    }
    
    // Always include the local host explicitly
    activePeers.push({
      nodeId: this.config.localNodeId,
      displayName: this.config.localDisplayName || 'Desktop',
      address: '127.0.0.1',
      port: 9000,
      isHost: true,
    });

    const msg: import('./message-schema').PeerListMessage = {
      type: 'PEER_LIST',
      peers: activePeers,
      timestamp: new Date().toISOString(),
    };
    this.broadcastToRoom(msg);
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
