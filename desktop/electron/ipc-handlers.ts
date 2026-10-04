/**
 * @module IPCHandlers
 *
 * Electron IPC handler registry for the DocuSync main process.
 *
 * This module bridges the Renderer process (React UI) with the sync
 * engine running in the Main process. Every IPC channel exposed through
 * `preload.ts` is registered here as an `ipcMain.handle` handler,
 * ensuring the Renderer can `invoke` engine operations via the
 * contextBridge.
 *
 * **IPC Channel Map:**
 *
 * | Channel            | Direction | Purpose                                 |
 * |--------------------|-----------|-----------------------------------------|
 * | `file:open`        | R → M     | Open a file with extension validation   |
 * | `file:save`        | R → M     | Save file and broadcast delta to peers  |
 * | `file:history`     | R → M     | Get EventLog history for a file         |
 * | `file:restore`     | R → M     | Restore a file to a previous version    |
 * | `sync:status`      | R → M     | Get current sync and peer status        |
 * | `sync:trigger`     | R → M     | Manually trigger sync with all peers    |
 * | `conflict:list`    | R → M     | List all pending conflicts with details |
 * | `conflict:detail`  | R → M     | Get a single conflict's full record     |
 * | `conflict:resolve` | R → M     | Owner resolves a conflict (A or B)      |
 * | `peer:list`        | R → M     | List all known peers and their status   |
 * | `peer:connect`     | R → M     | Connect to a peer by address:port       |
 *
 * **Error handling:** Every handler is wrapped in `try/catch`. Errors
 * are returned as structured `{ success: false, error: string }` objects
 * to the Renderer — the Main process never crashes from IPC failures.
 *
 * @packageDocumentation
 */

import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { PrismaClient } from '@prisma/client';
import { EventLogService, createEventLog } from '../src/engine/log-sync/event-log';
import { encode, validateTextFile } from '../src/engine/delta/delta-encoder';
import { decode } from '../src/engine/delta/delta-decoder';
import { createVectorClock, VectorClock } from '../src/engine/vector-clock/vector-clock';
import { createLWWResolver, LWWResolver } from '../src/engine/lww/lww-resolver';
import { mergeThreeWay } from '../src/engine/lww/line-merge-3way';
import { createPeerManager, PeerManager } from '../src/engine/peer/peer-manager';
import type { PeerMessage } from '../src/engine/peer/message-schema';
import type { VectorClockJSON } from '../src/engine/vector-clock/vector-clock';
// The privilege boundary against the renderer. In production the renderer is
// a remote origin, so every path and name arriving over IPC is untrusted
// input. See electron/security.ts; tests/unit/ipc-security.test.ts exercises
// these exact functions rather than a copy of them.
import { isPathInAllowedDirectory, resolveSafeFileName } from './security';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * File extensions allowed by the `file:open` handler.
 *
 * This is validated before any file I/O occurs. Extensions not in this
 * set are rejected with a descriptive error message.
 */
const ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.txt', '.md', '.json', '.csv', '.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.docx', '.doc', ''
]);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard success response shape for IPC handlers.
 */
interface IPCSuccess<T = unknown> {
  success: true;
  data: T;
}

/**
 * Standard error response shape for IPC handlers.
 */
interface IPCError {
  success: false;
  error: string;
}

/**
 * Union of all IPC response types. Renderers should always check
 * `result.success` before accessing `result.data`.
 */
export type IPCResponse<T = unknown> = IPCSuccess<T> | IPCError;

/**
 * Engine services container — holds all initialised engine modules
 * so IPC handlers can access them.
 */
export interface EngineServices {
  /** Prisma client for database access. */
  prisma: PrismaClient;
  /** Append-only event log service. */
  eventLog: EventLogService;
  /** Local vector clock instance. */
  vectorClock: VectorClock;
  /** LWW conflict resolver. */
  lwwResolver: LWWResolver;
  /** P2P WebSocket peer manager. */
  peerManager: PeerManager;
  /** UUID of this local node. */
  localNodeId: string;
  /** Map of fileId → current file path on disk. */
  openFiles: Map<number, string>;
  /** Map of fileId → current content (in-memory cache). */
  fileContents: Map<number, string>;
  /** Auto-incrementing file ID counter. */
  nextFileId: number;
  /** Pending verification requests. */
  verifyResolvers: Map<string, (allow: boolean) => void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a UUID v4. Uses `crypto.randomUUID()` when available.
 * @internal
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Validates a file extension against the allowed list.
 *
 * @param filePath - Absolute path to the file.
 * @returns `null` if valid, or an error message string if rejected.
 *
 * @internal
 */
function validateExtension(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '' && !ALLOWED_EXTENSIONS.has(ext)) {
    return `Unsupported file type: ${ext || 'none'}. Allowed: ${Array.from(ALLOWED_EXTENSIONS).filter(Boolean).join(', ')}, or no extension`;
  }
  return null;
}

/**
 * The one directory a renderer-supplied path or name may resolve into.
 *
 * Read through a function rather than a constant because `app.getPath` is
 * not available until Electron is ready.
 */
function allowedFileRoot(): string {
  return path.join(app.getPath('downloads'), 'DocuSync');
}

/**
 * Reads a file's bytes as text, or refuses.
 *
 * Node's `readFile(path, 'utf-8')` has no failure mode: bytes that are not
 * valid UTF-8 become U+FFFD and the call succeeds, so a binary file opens as
 * a plausible-looking string that can never be turned back into the file.
 * Since that string is then saved over the original and synced to peers, the
 * damage is permanent and it spreads.
 *
 * The test is the round trip — the decoded text must re-encode to exactly
 * the bytes that came in. It does not depend on the extension, so it also
 * catches a binary file wearing a text name.
 *
 * @throws {Error} If the bytes are not text.
 */
function decodeFileAsText(buffer: Buffer, fileName: string): string {
  if (buffer.includes(0)) {
    throw new Error(
      `'${fileName}' contains binary data (a zero byte) and cannot be opened as a document.`
    );
  }
  const text = buffer.toString('utf-8');
  if (!Buffer.from(text, 'utf-8').equals(buffer)) {
    throw new Error(
      `'${fileName}' is not valid UTF-8 text. It has not been opened, because reading it ` +
      `would have replaced the parts that are not text and the file could not be recovered.`
    );
  }
  return text;
}

/**
 * Converts TipTap HTML output to plain text, preserving paragraph and
 * line-break structure. Used when saving non-HTML files so that raw
 * `<p>` tags don't end up in `.txt`, `.csv`, `.json`, etc.
 *
 * @param html - The HTML string from TipTap's `editor.getHTML()`.
 * @returns Plain text with block boundaries converted to newlines.
 * @internal
 */
function stripHtmlToPlainText(html: string): string {
  return html
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')   // paragraph breaks → newline
    .replace(/<br\s*\/?>/gi, '\n')           // <br> → newline
    .replace(/<\/h[1-6]>/gi, '\n')           // heading closes → newline
    .replace(/<\/li>/gi, '\n')               // list item closes → newline
    .replace(/<\/blockquote>/gi, '\n')       // blockquote closes → newline
    .replace(/<\/div>/gi, '\n')              // div closes → newline
    .replace(/<\/pre>/gi, '\n')              // pre closes → newline
    .replace(/<[^>]*>/g, '')                  // strip all remaining tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')              // collapse excessive newlines
    .trim();
}

/**
 * Returns true if the file extension is an HTML document type.
 * @internal
 */
function isHtmlExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.html' || ext === '.htm';
}

/**
 * Returns true if the file extension is a Word document type.
 * @internal
 */
function isDocxExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.docx' || ext === '.doc';
}

/**
 * Wraps a handler function in try/catch, returning a structured
 * {@link IPCResponse} on both success and failure.
 *
 * @param handler - The async handler to wrap.
 * @returns A function safe to pass to `ipcMain.handle`.
 *
 * @internal
 */
function safeHandler<T>(
  handler: (...args: unknown[]) => Promise<T>
): (_event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<IPCResponse<T>> {
  return async (_event, ...args) => {
    try {
      const data = await handler(...args);
      return { success: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[IPC] Handler error:', message);
      return { success: false, error: message };
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine Initialisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The highest logical timestamp held for each author of a file's events.
 *
 * This is what a peer must send to describe what it is missing. A single
 * lower bound cannot: timestamps come from each node's own clock, which
 * counts every file, so two peers that have made the same number of edits
 * stamp their events identically and each concludes the other has nothing
 * new. Per author it is exact, because an author's own timestamps only ever
 * increase.
 */
function highWaterPerNode(
  entries: Array<{ nodeId: string; logicalTimestamp: number }>
): Record<string, number> {
  const high: Record<string, number> = {};
  for (const e of entries) {
    if (high[e.nodeId] === undefined || e.logicalTimestamp > high[e.nodeId]) {
      high[e.nodeId] = e.logicalTimestamp;
    }
  }
  return high;
}

/**
 * Initialises all engine services and returns a container that the
 * IPC handlers reference.
 *
 * This should be called once during app startup, before registering
 * IPC handlers.
 *
 * @param nodeCount - Number of nodes in the P2P network.
 * @param nodeIndex - This node's index (0-based).
 * @param wsPort    - WebSocket port for the peer manager server.
 *
 * @returns A fully initialised {@link EngineServices} container.
 *
 * @example
 * ```ts
 * const services = await initEngine(3, 0, 9000);
 * registerIPCHandlers(services);
 * ```
 */
export async function initEngine(
  nodeCount: number = 3,
  nodeIndex: number = 0,
  wsPort: number = 9000
): Promise<EngineServices> {
  const isPackaged = app.isPackaged;
  
  if (isPackaged) {
    // Tell Prisma where to find the native Windows query engine we packaged in extraResources
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(process.resourcesPath, 'prisma-engine', 'query_engine-windows.dll.node');
  }

  const localNodeId = generateUUID();

  // ── Prisma ──────────────────────────────────────────────────────
  let dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    const path = require('path');
    const dbPath = path.join(app.getPath('userData'), 'docusync.db');
    dbUrl = `file:${dbPath}`;
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
  });
  await prisma.$connect();

  // ── Ensure tables exist (safe for first launch on any machine) ──
  // This is equivalent to `prisma db push` but runs at app startup.
  // We use CREATE TABLE IF NOT EXISTS so it is a no-op on subsequent launches.
  // Column definitions must match schema.prisma exactly.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "LocalVault" (
      "id"        TEXT     NOT NULL PRIMARY KEY,
      "nodeId"    TEXT     NOT NULL UNIQUE,
      "pinHash"   TEXT     NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "event_log" (
      "id"               INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
      "eventId"          TEXT     NOT NULL UNIQUE,
      "fileId"           TEXT     NOT NULL,
      "nodeId"           TEXT     NOT NULL,
      "eventType"        TEXT     NOT NULL,
      "logicalTimestamp" INTEGER  NOT NULL,
      "vectorClockJson"  TEXT     NOT NULL,
      "payload"          TEXT     NOT NULL,
      "createdAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "isCompacted"      BOOLEAN  NOT NULL DEFAULT FALSE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "event_log_fileId_logicalTimestamp_idx"
    ON "event_log" ("fileId", "logicalTimestamp")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "event_log_fileId_isCompacted_idx"
    ON "event_log" ("fileId", "isCompacted")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "conflict" (
      "id"               INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
      "conflictId"       TEXT     NOT NULL UNIQUE,
      "fileId"           TEXT     NOT NULL,
      "eventIdA"         TEXT     NOT NULL,
      "nodeIdA"          TEXT     NOT NULL,
      "vectorClockJsonA" TEXT     NOT NULL,
      "payloadA"         TEXT     NOT NULL,
      "eventIdB"         TEXT     NOT NULL,
      "nodeIdB"          TEXT     NOT NULL,
      "vectorClockJsonB" TEXT     NOT NULL,
      "payloadB"         TEXT     NOT NULL,
      "status"           TEXT     NOT NULL DEFAULT 'pending',
      "winner"           TEXT,
      "resolvedBy"       TEXT,
      "detectedAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "resolvedAt"       DATETIME
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "conflict_fileId_status_idx"
    ON "conflict" ("fileId", "status")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "peer_registry" (
      "id"          INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
      "nodeId"      TEXT     NOT NULL UNIQUE,
      "displayName" TEXT     NOT NULL DEFAULT '',
      "address"     TEXT     NOT NULL,
      "port"        INTEGER  NOT NULL,
      "isOnline"    BOOLEAN  NOT NULL DEFAULT FALSE,
      "firstSeen"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastSeen"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "peer_registry_isOnline_idx"
    ON "peer_registry" ("isOnline")
  `);
  console.log('[Engine] Prisma connected and tables verified.');

  // ── Event Log ──────────────────────────────────────────────────
  const eventLog = createEventLog(prisma);

  // ── Vector Clock ───────────────────────────────────────────────
  const vectorClock = createVectorClock(nodeCount, nodeIndex);

  // ── LWW Resolver ───────────────────────────────────────────────
  const lwwResolver = createLWWResolver(prisma, eventLog);

  // ── In-memory file tracking ────────────────────────────────────
  const openFiles = new Map<number, string>();
  const fileContents = new Map<number, string>();
  
  // Pending verification requests
  const verifyResolvers = new Map<string, (allow: boolean) => void>();

  // Resolve LAN IP for display name
  let lanIp = '127.0.0.1';
  const nets = require('os').networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        lanIp = net.address;
        break;
      }
    }
    if (lanIp !== '127.0.0.1') break;
  }

  // ── Peer Manager ───────────────────────────────────────────────
  /**
   * Asks connected peers for anything this node missed.
   *
   * Reconnection fires `onPeerListChanged` several times in quick succession
   * as sockets settle, and a peer list can also change for reasons unrelated
   * to catch-up. Rather than issue a burst of requests, the work is collapsed
   * into one pass on a short timer.
   *
   * Re-requesting is harmless on its own terms: each reply carries the
   * original `eventId`, and `appendEvent` now returns the stored row instead
   * of inserting a second copy, so a repeated answer cannot duplicate
   * anything. The debounce exists to avoid pointless traffic, not to protect
   * correctness.
   */
  let autoCatchUpTimer: NodeJS.Timeout | null = null;
  function scheduleAutoCatchUp(): void {
    if (autoCatchUpTimer) clearTimeout(autoCatchUpTimer);
    autoCatchUpTimer = setTimeout(() => {
      autoCatchUpTimer = null;
      void runAutoCatchUp();
    }, 1500);
  }

  async function runAutoCatchUp(): Promise<void> {
    try {
      const peers = peerManager.getConnectedPeerIds();
      if (peers.length === 0 || openFiles.size === 0) return;

      let requested = 0;
      for (const [fileId] of openFiles) {
        // Ask from the last event this node actually holds for the file, so
        // the answer contains only what is genuinely missing.
        const history = await eventLog.getHistory(fileId);
        const latestTs = history.length > 0
          ? history[history.length - 1].logicalTimestamp
          : 0;

        peerManager.broadcast({
          type: 'SYNC_REQUEST',
          nodeId: localNodeId,
          fileId,
          sinceTimestamp: latestTs,
          knownPerNode: highWaterPerNode(history),
          timestamp: new Date().toISOString(),
        } as PeerMessage);
        requested++;
      }

      console.log(
        `[IPC] auto catch-up → requested ${requested} file(s) from ${peers.length} peer(s)`
      );
    } catch (err) {
      console.error('[IPC] auto catch-up failed', err);
    }
  }


  const peerManager = createPeerManager({
    localNodeId,
    localDisplayName: lanIp,
    nodeCount,
    nodeIndex,
    prisma,
    eventLog,
    lwwResolver,
    vectorClock,
    getFileContent: async (fileId: number) => {
      return fileContents.get(fileId) ?? '';
    },
    /**
     * Answers a peer's catch-up request after it reconnects.
     *
     * `PeerManager.handleSyncRequest` already received SYNC_REQUEST and looked
     * for this callback, but nothing supplied it — so the request arrived, the
     * guard failed, and the reconnecting peer was never sent anything. The
     * query it needs, `getEventsSince`, existed but had no production caller.
     *
     * Each missed event is replayed as the delta it already is, rather than a
     * full snapshot: the log stores `payload` as the encoded delta, and the
     * receiver reconstructs through `decodeDelta` exactly as it would for a
     * live edit.
     *
     * Each replayed delta also carries the content it was taken against and
     * the content it produced, both rebuilt from this node's own log. Without
     * them, a delta that will not apply has nothing to merge against: the
     * receiver's `resolveConcurrentDelta` needs a common ancestor, and
     * catch-up was the one path that never supplied one. A peer that had also
     * edited while disconnected therefore dropped every replayed event, and
     * two peers that both edited offline stayed permanently divergent —
     * neither one even learning the other's text. Catch-up worked only while
     * exactly one side had moved on. Measured on three instances: after
     * reconnection each peer still held only its own edit, with the same
     * hashes as before the links came up.
     *
     * Only `edit` and `merge` events are replayed. The rest are local
     * bookkeeping or whole-document snapshots: the import baseline exists so
     * this node can rebuild its own history and the receiver logs its own,
     * and replaying a snapshot with content attached would overwrite whatever
     * the receiver had written while disconnected. They were already dropped
     * by the receiver as undecodable deltas, so skipping them explicitly
     * changes nothing except that it is now deliberate.
     *
     * The original author's `nodeId` and `vectorClockJson` are preserved so
     * causality is not rewritten in the receiver's log, and the original
     * `eventId` is reused so a replay that overlaps something already applied
     * is ignored rather than duplicated.
     */
    onSyncRequested: async (
      requesterNodeId: string,
      fileId: number,
      sinceTimestamp: number,
      knownPerNode?: Record<string, number>
    ) => {
      try {
        // Prefer the requester's per-author high-water marks. A single
        // `sinceTimestamp` silently hid the events that mattered most: after
        // both peers edited while disconnected, their two edits carried the
        // same number, so each asked for "events after N" and was told it was
        // already current by the peer holding the event numbered N.
        const allForFile = knownPerNode ? await eventLog.getHistory(fileId) : [];
        const missed = knownPerNode
          ? allForFile.filter(
              (e) =>
                !e.isCompacted &&
                e.logicalTimestamp > (knownPerNode[e.nodeId] ?? -1)
            )
          : await eventLog.getEventsSince(fileId, sinceTimestamp);

        if (missed.length === 0) {
          console.log(
            `[IPC] sync:request from ${requesterNodeId} for file ${fileId} ` +
              `since ts=${sinceTimestamp} → already current`
          );
          return;
        }

        // Rebuild the content before and after each event from the full log,
        // in application order, so every replayed delta can carry its own
        // common ancestor. Folding the whole log is what `file:history`
        // already does; this reuses the same walk.
        const full = await eventLog.getHistory(fileId);
        const before = new Map<string, string>();
        const after = new Map<string, string>();
        let folded = '';
        for (const e of full) {
          before.set(e.eventId, folded);
          if (!e.isCompacted) {
            try {
              if (e.eventType === 'edit' || e.eventType === 'merge') {
                folded = decode(folded, e.payload).content;
              } else {
                folded = e.payload;
              }
            } catch {
              // A gap in the chain. Leave `folded` as it was; the events that
              // depend on it are skipped below rather than sent with a base
              // that would not reproduce them.
            }
          }
          after.set(e.eventId, folded);
        }

        let sent = 0;
        let skipped = 0;
        for (const entry of missed) {
          const isDelta = entry.eventType === 'edit' || entry.eventType === 'merge';
          // A `restore` replays too, re-expressed as the change it made to
          // this file rather than as the snapshot it is stored as. Sent as a
          // snapshot it would overwrite whatever the receiver wrote while it
          // was disconnected; sent as a change against its own ancestor, the
          // receiver merges it region by region, so the rollback arrives and
          // the receiver's concurrent work survives. Anything else is local
          // bookkeeping -- the import baseline, which the receiver has its
          // own copy of -- and is not replayed.
          if (!isDelta && entry.eventType !== 'restore') {
            skipped++;
            continue;
          }

          const baseContent = before.get(entry.eventId);
          const resultContent = after.get(entry.eventId);

          if (!isDelta) {
            // Re-express the snapshot as a delta against the content that
            // preceded it, which is what the merge path needs.
            //
            // An empty predecessor means this snapshot IS the chain's origin
            // -- the baseline an import logs, which is stored as a `restore`
            // so that history and restore can read it. It must never be
            // replayed: the receiver has its own baseline, and applying this
            // one reverts the receiver to the document's original text.
            // Measured: replaying it cost a peer all six of its own edits.
            if (
              typeof baseContent !== 'string' ||
              typeof resultContent !== 'string' ||
              baseContent.length === 0
            ) {
              skipped++;
              continue;
            }
            let restoreDelta: string | undefined;
            try {
              restoreDelta = encode(baseContent, resultContent, 'restore.txt').deltaBase64 ?? undefined;
            } catch {
              restoreDelta = undefined;
            }
            if (!restoreDelta) {
              skipped++;
              continue;
            }
            const ok = peerManager.sendTo(requesterNodeId, {
              type: 'DELTA_PUSH',
              eventId: entry.eventId,
              nodeId: entry.nodeId,
              fileId,
              deltaBase64: restoreDelta,
              baseContent,
              content: resultContent,
              eventType: 'restore',
              logicalTimestamp: entry.logicalTimestamp,
              vectorClockJson: entry.vectorClockJson,
              timestamp: new Date().toISOString(),
            } as PeerMessage);
            if (ok) sent++;
            else break;
            continue;
          }

          // Send the ancestor only when it provably reproduces the event, so a
          // gap in this node's chain cannot hand the receiver a base that
          // would merge the wrong text.
          let verified = false;
          if (typeof baseContent === 'string' && typeof resultContent === 'string') {
            try {
              verified = decode(baseContent, entry.payload).content === resultContent;
            } catch {
              verified = false;
            }
          }

          const ok = peerManager.sendTo(requesterNodeId, {
            type: 'DELTA_PUSH',
            eventId: entry.eventId,
            nodeId: entry.nodeId,
            fileId,
            deltaBase64: entry.payload,
            ...(verified ? { baseContent, content: resultContent } : {}),
            eventType: entry.eventType as 'edit' | 'merge',
            logicalTimestamp: entry.logicalTimestamp,
            vectorClockJson: entry.vectorClockJson,
            timestamp: new Date().toISOString(),
          } as PeerMessage);
          if (ok) sent++;
          else break; // the socket is gone; stop rather than spin
        }

        console.log(
          `[IPC] sync:request from ${requesterNodeId} for file ${fileId} ` +
            `since ts=${sinceTimestamp} → replayed ${sent}/${missed.length} events` +
            (skipped ? ` (${skipped} snapshot/bookkeeping event(s) not replayed)` : '')
        );
      } catch (err) {
        console.error('[IPC] sync:request → failed to replay missed events', err);
      }
    },
    onDeltaApplied: async (fileId, newContent, _eventId, _nodeId, _vcJson, eventType, lwwResolved) => {
      // Handle delete events
      if (eventType === 'delete') {
        BrowserWindow.getAllWindows()[0]?.webContents.send(
          'evt:file-deleted',
          fileId
        );
        return;
      }

      // Update in-memory cache.
      fileContents.set(fileId, newContent);

      // Write to disk if we have a file path.
      const filePath = openFiles.get(fileId);
      if (filePath) {
        await fs.promises.writeFile(filePath, newContent, 'utf-8');
        console.log(`[IPC] Applied remote delta to ${filePath}`);
      }

      // ── Push live update to the Desktop renderer ──────────────────
      // Without this, the editor only picks up changes via the 4-second
      // poll in EditorPage. Sending 'evt:file-updated' lets the editor
      // react immediately as soon as a peer's edit arrives.
      BrowserWindow.getAllWindows()[0]?.webContents.send(
        'evt:file-updated',
        fileId,
        newContent,
        lwwResolved
      );
    },
    onConflictNotified: async (conflictId, fileId, summary) => {
      console.log(
        `[IPC] Conflict detected: ${conflictId} on file ${fileId} — ${summary}`
      );

      // Push the conflict notification to the renderer process so the
      // conflict resolution UI can react immediately. The channel name
      // 'evt:conflict-detected' must match the constant in preload.ts.
      BrowserWindow.getAllWindows()[0]?.webContents.send(
        'conflict:detected',
        conflictId,
        fileId,
        summary
      );
    },
    onMergeAccepted: async (conflictId, fileId, winnerPayload, _vcJson, resolvedByNodeId?: string) => {
      // Update in-memory cache.
      fileContents.set(fileId, winnerPayload);

      // Write to disk if we have a file path.
      const filePath = openFiles.get(fileId);
      if (filePath) {
        await fs.promises.writeFile(filePath, winnerPayload, 'utf-8');
        console.log(`[IPC] Applied merge resolution to ${filePath}`);
      }

      // Notify renderer
      BrowserWindow.getAllWindows()[0]?.webContents.send(
        'evt:merge-accepted',
        conflictId,
        resolvedByNodeId || 'Owner'
      );

      // Tell EditorPage to update its TipTap content immediately
      BrowserWindow.getAllWindows()[0]?.webContents.send(
        'evt:file-updated',
        fileId,
        winnerPayload,
        true // lwwResolved flag so EditorPage applies it immediately
      );
    },
    onUserVerifyRequest: (nodeId: string): Promise<boolean> => {
      return new Promise((resolve) => {
        const reqId = generateUUID();
        // Store the resolver so the IPC handler can call it
        verifyResolvers.set(reqId, resolve);
        
        console.log(`[IPC] Emitting auth:verify-request for node ${nodeId}`);
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
          win.webContents.send('auth:verify-request', reqId, nodeId);
        } else {
          // If no window is open, block the connection
          resolve(false);
          verifyResolvers.delete(reqId);
        }
      });
    },
    onSessionTerminated: (reason: string) => {
      console.log(`[IPC] Session terminated by Admin: ${reason}`);
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.webContents.send('evt:session-terminated', reason);
      }
    },
    onPeerListChanged: () => {
      console.log(`[IPC] Peer list changed, notifying renderer...`);
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.webContents.send('evt:peer-updated');
      }
      // A peer appearing is the moment a reconnection becomes actionable, so
      // catch-up starts here rather than waiting for someone to press a sync
      // button. `sync:trigger` already builds exactly this request; this is
      // the same work, driven by the event instead of by the user.
      scheduleAutoCatchUp();
    },
    onCursorUpdate: (msg) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('evt:cursor-update', msg);
    },
  });

  // Start WebSocket server with port fallback.
  // Try ports wsPort through wsPort+10 to handle EADDRINUSE when a
  // stale process or previous instance still holds the default port.
  const MAX_PORT_RETRIES = 10;
  let boundPort = wsPort;
  let serverStarted = false;

  for (let attempt = 0; attempt <= MAX_PORT_RETRIES; attempt++) {
    const tryPort = wsPort + attempt;
    try {
      await peerManager.startServer(tryPort);
      boundPort = tryPort;
      serverStarted = true;
      break;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isAddrInUse =
        errMsg.includes('EADDRINUSE') ||
        (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EADDRINUSE');

      if (isAddrInUse && attempt < MAX_PORT_RETRIES) {
        console.warn(
          `[Engine] Port ${tryPort} is in use, trying ${tryPort + 1}...`
        );
        continue;
      }
      throw err;
    }
  }

  if (!serverStarted) {
    throw new Error(
      `[Engine] Failed to bind WebSocket server on ports ${wsPort}–${wsPort + MAX_PORT_RETRIES}.`
    );
  }

  console.log(`[Engine] P2P WebSocket server started on port ${boundPort}.`);

  return {
    prisma,
    eventLog,
    vectorClock,
    lwwResolver,
    peerManager,
    localNodeId,
    openFiles,
    fileContents,
    nextFileId: Date.now(),
    verifyResolvers,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC Handler Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers all IPC handlers on `ipcMain`.
 *
 * This function wires the Renderer ↔ Main bridge for all channels
 * defined in `preload.ts`. Each handler delegates to the appropriate
 * engine module and returns a structured {@link IPCResponse}.
 *
 * **Channels registered:**
 * - `file:open` — Open a file with extension validation
 * - `file:save` — Save file and broadcast delta to peers
 * - `file:history` — Get EventLog history for a file
 * - `file:restore` — Restore a file to a previous version
 * - `sync:status` — Get current sync and peer status
 * - `sync:trigger` — Manually trigger sync with all peers
 * - `conflict:list` — List all pending conflicts with full details
 * - `conflict:detail` — Get a single conflict's full record
 * - `conflict:resolve` — Owner resolves a conflict
 * - `peer:list` — List all known peers
 * - `peer:connect` — Connect to a peer
 *
 * @param services - The initialised engine services container.
 *
 * @example
 * ```ts
 * const services = await initEngine(3, 0, 9000);
 * registerIPCHandlers(services);
 * ```
 */
export function registerIPCHandlers(services: EngineServices): void {
  const {
    prisma,
    eventLog,
    vectorClock,
    lwwResolver,
    peerManager,
    localNodeId,
    openFiles,
    fileContents,
    verifyResolvers,
  } = services;

  // ── room:set-token ─────────────────────────────────────────────────
  ipcMain.handle(
    'room:set-token',
    safeHandler(async (...args: unknown[]) => {
      const token = args[0] as string;
      peerManager.setAllowedToken(token);
      return { success: true };
    })
  );

  // ── auth:verify-respond ────────────────────────────────────────────
  ipcMain.handle(
    'auth:verify-respond',
    safeHandler(async (...args: unknown[]) => {
      const reqId = args[0] as string;
      const allow = args[1] as boolean;
      const resolver = verifyResolvers.get(reqId);
      if (resolver) {
        resolver(allow);
        verifyResolvers.delete(reqId);
      }
      return true;
    })
  );

  // ── db:clear (State Isolation) ─────────────────────────────────────
  ipcMain.handle(
    'db:clear',
    safeHandler(async () => {
      console.log('[IPC] db:clear → Wiping all SQLite data for state isolation...');
      await prisma.conflict.deleteMany({});
      await prisma.eventLog.deleteMany({});
      await prisma.peerRegistry.deleteMany({});
      openFiles.clear();
      fileContents.clear();
      return { success: true };
    })
  );

  // ── file:open ──────────────────────────────────────────────────────
  /**
   * Opens a file from disk. Validates the extension against the allowed
   * list before reading. If no `filePath` argument is provided, opens
   * a native file dialog.
   *
   * @param filePath - Optional absolute path. If omitted, a dialog opens.
   * @returns `{ fileId, filePath, content, extension }` on success.
   */
  ipcMain.handle(
    'file:open',
    safeHandler(async (...args: unknown[]) => {
      let fileId: number | undefined;
      let filePath: string | undefined;

      const firstArg = args[0];
      if (typeof firstArg === 'number') {
        fileId = firstArg;
        filePath = openFiles.get(fileId);
      } else if (typeof firstArg === 'string' && /^\d+$/.test(firstArg)) {
        fileId = parseInt(firstArg, 10);
        filePath = openFiles.get(fileId);
      } else {
        // ── Security boundary (Fix 2) ──────────────────────────────────────
        // This branch accepts a direct string path from the renderer. In
        // production the renderer is a remote Vercel origin, so an XSS
        // payload could supply an arbitrary filesystem path here.
        // Reject any path that is not inside the application's designated
        // download directory. Numeric fileId and dialog-picked paths are
        // NOT affected — this guard only applies to renderer-supplied strings.
        if (typeof firstArg === 'string') {
          const allowedRoot = allowedFileRoot();
          if (!isPathInAllowedDirectory(firstArg, allowedRoot)) {
            console.warn('[IPC] file:open rejected renderer-supplied path outside allowed directory.', {
              operation: 'file:open',
              allowedRoot,
              // Log only base-name to limit exposure; full path is NOT logged.
              requestedBase: path.basename(firstArg),
            });
            throw new Error(
              'file:open: path is outside the allowed directory. Use the file dialog to select files.'
            );
          }
        }
        filePath = firstArg as string | undefined;
      }

      // If a valid fileId was provided, look it up locally
      if (fileId !== undefined) {
        if (!filePath) {
          // If in-memory map is lost (e.g. after restart), search the Downloads folder Fallback
          let recoveredPath: string | undefined;
          if (args[1] && typeof args[1] === 'string') {
            const fileName = args[1];
            const docuSyncDir = allowedFileRoot();
            const possiblePath = path.join(docuSyncDir, fileName);
            if (fs.existsSync(possiblePath)) {
              recoveredPath = possiblePath;
              openFiles.set(fileId, possiblePath);
              filePath = possiblePath;
            }
          }
          if (!filePath) {
            throw new Error('File not open locally. File must be imported from the network.');
          }
        }
        
        let content = fileContents.get(fileId) ?? '';
        if (!content && filePath) {
           // Lazily load from disk if map is cold
           if (fs.existsSync(filePath)) {
               content = fs.readFileSync(filePath, 'utf-8');
               fileContents.set(fileId, content);
           }
        }
        
        const ext = path.extname(filePath).toLowerCase();
        return {
          fileId,
          filePath,
          fileName: path.basename(filePath),
          content,
          extension: ext.replace('.', ''),
          contentLength: Buffer.byteLength(content, 'utf-8'),
        };
      }

      // If no path provided, open a file dialog.
      if (!filePath) {
        // Derived from ALLOWED_EXTENSIONS so the dialog can never offer a file
        // that validateExtension will reject a moment later. The "All Files"
        // option was doing exactly that: it let a user pick anything, and the
        // refusal only arrived afterwards as an error.
        const supported = Array.from(ALLOWED_EXTENSIONS)
          .filter(Boolean)
          .map(e => e.replace('.', ''));
        const options: Electron.OpenDialogOptions = {
          properties: ['openFile'],
          filters: [
            { name: 'Supported documents', extensions: supported },
            { name: 'Word Documents', extensions: ['docx', 'doc'] },
            {
              name: 'Text & Code Files',
              extensions: supported.filter(e => e !== 'docx' && e !== 'doc'),
            },
          ],
        };
        console.log('[IPC] file:open → showing open dialog asynchronously (unattached)...');
        // Do NOT pass mainWindow to showOpenDialog because it freezes Windows IPC bridges in async handlers
        const result = await dialog.showOpenDialog(options);
          
        console.log('[IPC] file:open → dialog result:', result);

        if (result.canceled || result.filePaths.length === 0) {
          throw new Error('File open cancelled by user.');
        }

        filePath = result.filePaths[0];
      }

      // ── Extension validation ────────────────────────────────────
      const extError = validateExtension(filePath);
      if (extError) {
        throw new Error(extError);
      }

      // ── Read file content ───────────────────────────────────────
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: "${filePath}".`);
      }

      const ext = path.extname(filePath).toLowerCase();
      let content: string;

      if (ext === '.doc') {
        throw new Error('Legacy .doc files are not supported. Please save the document as .docx and try again.');
      } else if (ext === '.docx') {
        // Parse Word documents preserving HTML structure for TipTap
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mammoth = require('mammoth');
        const buffer = await fs.promises.readFile(filePath);
        if (buffer.length === 0) {
          content = '';
          console.warn(`[IPC] file:open (docx) → file is 0 bytes, treating as empty string to avoid JSZip crash.`);
        } else {
          try {
            const result = await mammoth.convertToHtml({ buffer });
            content = result.value;
            console.log(`[IPC] file:open (docx) → extracted HTML of ${content.length} chars from ${filePath}`);
          } catch (mammothErr: any) {
            console.error('[IPC] Mammoth parsing error. The .docx file is corrupt or zero-byte initialized.', mammothErr);
            throw new Error(`The file '${path.basename(filePath)}' is corrupt or not a valid Word Document. Please select a valid file.`);
          }
        }
      } else if (ext === '.rtf') {
        // Robust RTF parsing: properly strip structural groups by tracking brace depth
        const rawRtf = await fs.promises.readFile(filePath, 'utf-8');
        let extracted = '';
        let i = 0;
        let groupDepth = 0;
        let ignoreDepth = -1;
        const ignoreGroups = ['fonttbl', 'colortbl', 'stylesheet', 'info', 'generator', 'picw', 'pich'];

        while (i < rawRtf.length) {
          const c = rawRtf[i];
          if (c === '{') {
            groupDepth++;
            i++;
            continue;
          }
          if (c === '}') {
            if (ignoreDepth !== -1 && groupDepth === ignoreDepth) {
              ignoreDepth = -1;
            }
            groupDepth--;
            i++;
            continue;
          }
          if (ignoreDepth !== -1 && groupDepth >= ignoreDepth) {
            i++;
            continue;
          }

          if (c === '\\') {
            const next = rawRtf[i + 1];
            if (!next) { i++; continue; }
            if (next === '\\' || next === '{' || next === '}' || next === '~' || next === '-' || next === '_') {
              if (next === '~') extracted += ' ';
              else if (next === '-' || next === '_') extracted += '-';
              else extracted += next;
              i += 2;
              continue;
            }
            if (next === "'") {
              const hex = rawRtf.substring(i + 2, i + 4);
              extracted += String.fromCharCode(parseInt(hex, 16) || 32);
              i += 4;
              continue;
            }
            if (next === '*') {
              if (ignoreDepth === -1) ignoreDepth = groupDepth;
              i += 2;
              continue;
            }

            i++;
            let word = '';
            while (i < rawRtf.length && /[a-zA-Z]/.test(rawRtf[i])) {
              word += rawRtf[i];
              i++;
            }
            while (i < rawRtf.length && /[-0-9]/.test(rawRtf[i])) {
              i++;
            }
            if (i < rawRtf.length && rawRtf[i] === ' ') {
              i++;
            }

            if (ignoreGroups.includes(word)) {
              if (ignoreDepth === -1) ignoreDepth = groupDepth;
            } else if (word === 'par' || word === 'line') {
              extracted += '\n';
            } else if (word === 'tab') {
              extracted += '\t';
            } else if (word === 'emdash' || word === 'endash') {
              extracted += '-';
            }
            continue;
          }

          if (c !== '\r' && c !== '\n') {
            extracted += c;
          }
          i++;
        }
        content = extracted.trim();
        console.log(`[IPC] file:open (rtf) → extracted ${content.length} chars from ${filePath}`);
      } else {
        // `readFile(path, 'utf-8')` decodes whatever bytes it finds and
        // replaces anything that is not valid UTF-8 with U+FFFD. It cannot
        // fail, so a spreadsheet, an archive or an image opened here became
        // a string of replacement characters that was then stored, synced to
        // every peer, and written back over the original on the next save.
        // `validateTextFile` already describes which extensions the engine
        // can read — it was being applied on save but not on open.
        validateTextFile(path.basename(filePath));
        const buffer = await fs.promises.readFile(filePath);
        content = decodeFileAsText(buffer, path.basename(filePath));
      }

      // ── Register in memory ──────────────────────────────────────
      const newFileId = services.nextFileId++;
      openFiles.set(newFileId, filePath);
      fileContents.set(newFileId, content);

      console.log(`[IPC] file:open → ${filePath} (fileId=${newFileId})`);

      return {
        fileId: newFileId,
        filePath,
        fileName: path.basename(filePath),
        content,
        extension: ext,
        contentLength: Buffer.byteLength(content, 'utf-8'),
      };
    })
  );

  // ── file:import-room-file ──────────────────────────────────────────
  /**
   * Imports a file from the matchmaker room into the local system.
   * Saves it to the user's Downloads/DocuSync folder and opens it.
   */
  ipcMain.handle(
    'file:import-room-file',
    safeHandler(async (...args: unknown[]) => {
      const fileName = args[0] as string;
      const content = args[1] as string;
      const explicitFileId = args[2] as number | undefined;

      if (!fileName || typeof content !== 'string') {
        throw new Error('file:import-room-file requires (fileName: string, content: string).');
      }

      // Create DocuSync directory in Downloads if it doesn't exist
      const docuSyncDir = allowedFileRoot();
      if (!fs.existsSync(docuSyncDir)) {
        await fs.promises.mkdir(docuSyncDir, { recursive: true });
      }

      // `fileName` arrives from the renderer, which in production is a remote
      // website. It was joined onto the downloads directory unchecked, so a
      // name that walked upwards — into the user's startup folder, say — sent
      // renderer-supplied content there. It must be a plain file name.
      const destPath = resolveSafeFileName(fileName, docuSyncDir, 'file:import-room-file');

      const newFileId = explicitFileId !== undefined ? explicitFileId : services.nextFileId++;
      if (explicitFileId !== undefined && explicitFileId >= services.nextFileId) {
        services.nextFileId = explicitFileId + 1;
      }

      let finalContent = typeof content === 'string' ? content : '';
      // If content passed is empty but destPath exists on disk with content, preserve disk content
      if (!finalContent && fs.existsSync(destPath)) {
        try {
          const existingDiskContent = await fs.promises.readFile(destPath, 'utf-8');
          if (existingDiskContent) finalContent = existingDiskContent;
        } catch (e) {}
      }
      // Write the file content to disk
      await fs.promises.writeFile(destPath, finalContent, 'utf-8');

      const ext = path.extname(fileName);
      const extLower = ext.toLowerCase();

      openFiles.set(newFileId, destPath);
      fileContents.set(newFileId, finalContent);

      // ── Give the delta chain an origin ──────────────────────────
      // `file:history` and `file:restore` both reconstruct a version by
      // folding deltas from an empty string. An imported room file had no
      // event at all to start from, so the first `edit` delta — computed
      // against this imported content, not against "" — could not decode,
      // and both handlers fell back to treating the undecodable payload as
      // content. History then displayed raw base64 where the document should
      // be, and restore WROTE that base64 into the user's file.
      //
      // A baseline snapshot fixes both at the source. `restore` is the event
      // type both readers already understand as "payload is the full
      // document", so no reader needs to change to recognise it.
      try {
        vectorClock.increment();
        await eventLog.appendEvent({
          eventId: generateUUID(),
          fileId: newFileId,
          nodeId: localNodeId,
          eventType: 'restore',
          logicalTimestamp: vectorClock.counters[vectorClock.nodeIndex],
          vectorClockJson: vectorClock.toJSON(),
          payload: finalContent,
        });
      } catch (baselineErr) {
        // A missing baseline degrades history, not the import itself.
        console.warn(`[IPC] file:import-room-file → could not log baseline:`, baselineErr);
      }

      console.log(`[IPC] file:import-room-file → ${destPath} (fileId=${newFileId})`);

      return {
        fileId: newFileId,
        filePath: destPath,
        fileName,
        content: finalContent,
        extension: extLower.replace('.', ''),
        contentLength: Buffer.byteLength(finalContent, 'utf-8'),
      };
    })
  );

  // ── file:save ──────────────────────────────────────────────────────
  /**
   * Saves updated content to a file, computes a delta against the
   * previous version, appends an `edit` event to the EventLog, and
   * broadcasts a DELTA_PUSH to all connected peers.
   *
   * @param fileId     - The file ID (from `file:open`).
   * @param newContent - The updated document content.
   * @returns `{ fileId, deltaSizeBytes, peersNotified }` on success.
   */
  ipcMain.handle(
    'file:save',
    safeHandler(async (...args: unknown[]) => {
      const fileId = args[0] as number;
      const newContent = args[1] as string;
      const frontendVcJson = args[2] as any;

      if (typeof fileId !== 'number' || typeof newContent !== 'string') {
        throw new Error('file:save requires (fileId: number, newContent: string).');
      }

      const filePath = openFiles.get(fileId);
      if (!filePath) {
        throw new Error(`File ID ${fileId} is not open.`);
      }

      const previousContent = fileContents.get(fileId) ?? '';
      const fileName = path.basename(filePath);

      // Validate text extension before anything.
      try {
        validateTextFile(fileName);
      } catch {
        // For non-standard extensions, we still write the HTML natively so TipTap can 
        // reload it later without losing formatting. We don't strip HTML anymore.
        await fs.promises.writeFile(filePath, newContent, 'utf-8');
        fileContents.set(fileId, newContent);
        return {
          fileId,
          saved: true,
          synced: false,
          reason: 'File type not eligible for delta sync.',
        };
      }

      const eventId = generateUUID();
      const encodeResult = encode(previousContent, newContent, fileName);
      const payload = encodeResult.deltaBase64 ?? JSON.stringify(encodeResult.chunks);

      // ── Arbiter: Vector Clock Comparison ───────────────────────
      const frontendVc = frontendVcJson ? VectorClock.fromJSON(frontendVcJson) : null;
      if (frontendVc) {
        const relation = vectorClock.compare(frontendVc);
        if (relation === 'dominated') {
          // The engine has seen newer remote events than the frontend's clock.
          // This is a concurrent edit.
          const engineVc = VectorClock.fromJSON(vectorClock.toJSON());
          
          // Fetch the latest event for this file from the engine log
          const history = await eventLog.getHistory(fileId);
          const latestEvent = history[history.length - 1];
          
          if (latestEvent) {
            const eventA = {
              eventId,
              fileId,
              nodeId: localNodeId,
              eventType: 'edit',
              logicalTimestamp: frontendVc.counters[frontendVc.nodeIndex] || 1,
              vectorClockJson: frontendVc.toJSON(),
              payload
            };

            const resolveResult = await lwwResolver.resolve(eventA, latestEvent, frontendVc, engineVc);
            
            if (resolveResult.outcome === 'escalated') {
              // The user specifically requested not to show conflicts for LIVE typing.
              // Since this is `file:save` from an active frontend session, it is a live concurrent edit.
              // We DO NOT escalate this to the UI! 
              // We just drop the save. The frontend TipTap editor will receive the remote delta via
              // `sync:delta`, natively merge it using Prosemirror/TipTap logic, and trigger a new save!
              console.log('[IPC] file:save concurrent edit detected. Auto-resolving via frontend TipTap merge instead of escalating.');
              
              // We must delete the pending conflict from the database that lwwResolver just created!
              if (resolveResult.conflictId) {
                 try {
                   await prisma.conflict.delete({ where: { conflictId: resolveResult.conflictId } });
                 } catch (e) {
                   console.error('Failed to cleanup live conflict record:', e);
                 }
              }
              // Removed return: allow it to fall through and broadcast the live edit
            }
          }
        }
      }

      // Everything from here to the broadcast runs on this file’s
      // serialisation chain, so a peer’s delta cannot be applied and logged
      // in the middle of it. See PeerManager.withFileLock.
      const saveOutcome = await peerManager.withFileLock(fileId, async () => {
        // ── Fold in anything a peer applied while this save was in flight ──
        // `previousContent` was captured when the save began. Applying a peer's
        // delta is asynchronous, so it can complete between that capture and
        // this write — and the write would then put this save's content over
        // the top of it, discarding the peer's edit from disk, from the cache
        // and from the delta stored in the log. Measured on two instances: two
        // users edited different lines at the same time and whichever save
        // landed second erased the other user's line completely.
        //
        // Re-reading the cache here detects it, and the same line-granular
        // 3-way merge the peer path uses reconciles the two: lines only the
        // peer touched keep the peer's text, lines only this user touched keep
        // this user's, and a line both changed goes to this user, who is the
        // one actively typing.
        const liveContent = fileContents.get(fileId) ?? '';
        let contentToStore = newContent;
        let foldedPeerEdit = false;
        if (liveContent !== previousContent && liveContent !== newContent) {
          const folded = mergeThreeWay(liveContent, previousContent, newContent, true);
          contentToStore = folded.merged;
          foldedPeerEdit = contentToStore !== newContent;
          if (foldedPeerEdit) {
            console.log(
              `[IPC] file:save → folded in a peer edit applied mid-save ` +
                `(file ${fileId}, ${folded.conflictHunks} contested line(s))`
            );
          }
        }

        // The delta must describe the change from whatever the log and the
        // cache actually hold now, or replaying the log stops reproducing the
        // document. Re-encode against `liveContent` when it moved.
        let effectiveEncode = encodeResult;
        if (contentToStore !== newContent || liveContent !== previousContent) {
          try {
            effectiveEncode = encode(liveContent, contentToStore, fileName);
          } catch {
            // Keep the original encoding rather than fail the save.
          }
        }

        // ── Write to disk ───────────────────────────────────────────
        // We write the raw HTML regardless of extension to prevent TipTap from losing formatting.
        await fs.promises.writeFile(filePath, contentToStore, 'utf-8');

        // ── Update in-memory cache (keep HTML for TipTap/delta engine) ──
        fileContents.set(fileId, contentToStore);

        // Tell the editor what was actually stored, so it is not left showing
        // text that no longer matches the file and re-saving it.
        if (foldedPeerEdit) {
          BrowserWindow.getAllWindows()[0]?.webContents.send(
            'evt:file-updated',
            fileId,
            contentToStore,
            true
          );
        }

        // ── Increment vector clock ──────────────────────────────────
        vectorClock.increment();
        const vcJson = vectorClock.toJSON();
        const logicalTimestamp = vectorClock.counters[vectorClock.nodeIndex];

        // ── Append to EventLog ──────────────────────────────────────
        await eventLog.appendEvent({
          eventId,
          fileId,
          nodeId: localNodeId,
          eventType: 'edit',
          logicalTimestamp,
          vectorClockJson: vcJson,
          payload: effectiveEncode.deltaBase64 ?? payload,
        });

        // ── Broadcast to peers ──────────────────────────────────────
        let peersNotified = 0;
        if (effectiveEncode.deltaBase64) {
          const pushMsg: any = {
            type: 'DELTA_PUSH',
            eventId,
            nodeId: localNodeId,
            fileId,
            deltaBase64: effectiveEncode.deltaBase64,
            content: contentToStore,
            // The base this delta was taken against. A peer whose own content
            // has moved on cannot apply the delta, and without the base its
            // only options were to adopt this whole document or drop the edit
            // — either way one side's untouched regions were lost. With the
            // base it can merge the changed lines and keep both. It is the base
            // this delta was actually encoded against, which is the live
            // content when a peer edit was folded in above.
            baseContent: liveContent !== previousContent ? liveContent : previousContent,
            logicalTimestamp,
            vectorClockJson: vcJson,
            timestamp: new Date().toISOString(),
          };
          peersNotified = peerManager.broadcast(pushMsg);
        }

        return {
          peersNotified,
          deltaSizeBytes: effectiveEncode.deltaSizeBytes,
          compressionRatio: effectiveEncode.compressionRatio,
        };
      });

      console.log(
        `[IPC] file:save → ${fileName} (delta=${saveOutcome.deltaSizeBytes}B, ` +
          `peers=${saveOutcome.peersNotified})`
      );

      return {
        fileId,
        saved: true,
        synced: true,
        deltaSizeBytes: saveOutcome.deltaSizeBytes,
        compressionRatio: saveOutcome.compressionRatio,
        peersNotified: saveOutcome.peersNotified,
        eventId,
      };
    })
  );

  // ── file:history ───────────────────────────────────────────────────
  /**
   * Returns the complete EventLog history for a file, ordered by
   * logicalTimestamp ASC.
   *
   * @param fileId - The file ID to query.
   * @returns Array of EventLogEntry objects.
   */
  ipcMain.handle(
    'file:history',
    safeHandler(async (...args: unknown[]) => {
      const fileId = args[0] as number;

      if (typeof fileId !== 'number') {
        throw new Error('file:history requires (fileId: number).');
      }

      const history = await eventLog.getHistory(fileId);

      console.log(`[IPC] file:history → fileId=${fileId}, entries=${history.length}`);

      let currentContent = '';
      const reconstructedEntries = history.map((entry) => {
        let reconstructed = true;
        if (!entry.isCompacted) {
          try {
            if (entry.eventType === 'edit' || entry.eventType === 'merge') {
              const decodeResult = decode(currentContent, entry.payload);
              currentContent = decodeResult.content;
            } else {
              currentContent = entry.payload;
            }
          } catch {
            // The delta did not apply to the content reconstructed so far, so
            // this version cannot be rebuilt. The payload is an encoded delta,
            // NOT a document — showing it put raw base64 in front of the user
            // where the document should be. Keep the last content that was
            // genuinely reconstructed and mark the entry instead.
            reconstructed = false;
          }
        }

        return {
          id: entry.id,
          eventId: entry.eventId,
          nodeId: entry.nodeId,
          eventType: entry.eventType,
          logicalTimestamp: entry.logicalTimestamp,
          createdAt: entry.createdAt.toISOString(),
          isCompacted: entry.isCompacted,
          payload: currentContent,
          payloadPreview: currentContent.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').slice(0, 200),
          /** False when this version could not be rebuilt from the log. */
          reconstructed,
        };
      });

      return {
        fileId,
        entries: reconstructedEntries,
        totalEntries: history.length,
      };
    })
  );

  // ── file:restore ───────────────────────────────────────────────────
  /**
   * Restores a file to a previous version by replaying the EventLog
   * entry's payload.
   *
   * @param fileId  - The file ID to restore.
   * @param eventId - The eventId of the version to restore to.
   * @returns `{ fileId, restoredToEventId, content }` on success.
   */
  ipcMain.handle(
    'file:restore',
    safeHandler(async (...args: unknown[]) => {
      const fileId = args[0] as number;
      const targetEventId = args[1] as string;

      if (typeof fileId !== 'number' || typeof targetEventId !== 'string') {
        throw new Error('file:restore requires (fileId: number, eventId: string).');
      }

      const filePath = openFiles.get(fileId);
      if (!filePath) {
        throw new Error(`File ID ${fileId} is not open.`);
      }

      // ── Find the target event ───────────────────────────────────
      const history = await eventLog.getHistory(fileId);
      const targetEvent = history.find((e) => e.eventId === targetEventId);
      if (!targetEvent) {
        throw new Error(`Event "${targetEventId}" not found in history for file ${fileId}.`);
      }

      // ── Reconstruct content by replaying from empty ─────────────
      // Walk the history up to and including the target event,
      // applying each delta sequentially.
      let content = '';
      let broken = false;
      for (const event of history) {
        if (event.isCompacted) continue;

        try {
          if (event.eventType === 'edit' || event.eventType === 'merge') {
            const decodeResult = decode(content, event.payload);
            content = decodeResult.content;
          } else if (event.eventType === 'restore') {
            // Restore events carry the full content as payload.
            content = event.payload;
          }
        } catch {
          // The delta did not apply to the content rebuilt so far. The
          // payload is an encoded delta, not a document, so adopting it as
          // content wrote raw base64 JSON into the user's file — a restore
          // that destroyed the document it was asked to recover. Record that
          // the chain is broken and refuse below rather than write garbage.
          broken = true;
        }

        if (event.eventId === targetEventId) break;
      }

      if (broken) {
        throw new Error(
          `Version "${targetEventId}" cannot be rebuilt: the change history for ` +
            `this file has a gap, so restoring it would not reproduce that version. ` +
            `The file on disk has been left unchanged.`
        );
      }

      // ── Write restored content to disk ───────────
      await fs.promises.writeFile(filePath, content, 'utf-8');
      fileContents.set(fileId, content);

      // ── Log the restore event ───────────────────────────────────
      vectorClock.increment();
      const vcJson = vectorClock.toJSON();
      const restoreEventId = generateUUID();

      await eventLog.appendEvent({
        eventId: restoreEventId,
        fileId,
        nodeId: localNodeId,
        eventType: 'restore',
        logicalTimestamp: vectorClock.counters[vectorClock.nodeIndex],
        vectorClockJson: vcJson,
        payload: content,
      });

      console.log(`[IPC] file:restore → fileId=${fileId}, to=${targetEventId}`);

      // ── Broadcast the restore event ─────────────────────────────
      const pushMsg: PeerMessage = {
        type: 'DELTA_PUSH',
        eventId: restoreEventId,
        nodeId: localNodeId,
        fileId,
        deltaBase64: Buffer.from(content).toString('base64'),
        content: content, // Web App expects msg.content for live updates
        eventType: 'restore',
        logicalTimestamp: vectorClock.counters[vectorClock.nodeIndex],
        vectorClockJson: vcJson,
        timestamp: new Date().toISOString(),
      };
      peerManager.broadcast(pushMsg);

      // Notify the frontend of the update
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('evt:file-updated', {
          fileId,
          filePath,
          content,
          updatedAt: new Date().toISOString(),
          eventType: 'restore',
        });
      });

      return {
        fileId,
        restoredToEventId: targetEventId,
        restoreEventId,
        contentLength: content.length,
      };
    })
  );

  // ── file:delete ────────────────────────────────────────────────────
  /**
   * Appends a tombstone 'delete' event to the log and broadcasts it.
   *
   * @param fileId - The file ID to delete.
   * @returns `{ fileId }` on success.
   */
  ipcMain.handle(
    'file:delete',
    safeHandler(async (...args: unknown[]) => {
      const fileId = args[0] as number;

      if (typeof fileId !== 'number') {
        throw new Error('file:delete requires (fileId: number).');
      }

      // Log the delete event
      vectorClock.increment();
      const vcJson = vectorClock.toJSON();
      const deleteEventId = generateUUID();

      const newEvent = await eventLog.appendEvent({
        eventId: deleteEventId,
        fileId,
        nodeId: localNodeId,
        eventType: 'delete',
        logicalTimestamp: vectorClock.counters[vectorClock.nodeIndex],
        vectorClockJson: vcJson,
        payload: '', // Empty payload for tombstone
      });

      try {
        await prisma.conflict.deleteMany({
          where: { fileId: String(fileId) }
        });
        console.log(`[IPC] file:delete → Deleted conflicts for fileId=${fileId}`);
      } catch (err) {
        console.error(`[IPC] file:delete → Failed to delete conflicts:`, err);
      }

      console.log(`[IPC] file:delete → fileId=${fileId}`);

      // Broadcast the deletion to all connected peers
      const message: PeerMessage = {
        type: 'DELTA_PUSH',
        nodeId: localNodeId,
        eventId: newEvent.eventId,
        fileId,
        deltaBase64: newEvent.payload, // Empty
        eventType: 'delete',
        logicalTimestamp: newEvent.logicalTimestamp,
        vectorClockJson: newEvent.vectorClockJson,
        timestamp: new Date().toISOString(),
      };

      peerManager.broadcastToRoom(message);

      return { fileId };
    })
  );

  // ── sync:status ────────────────────────────────────────────────────
  /**
   * Returns the current synchronisation status: vector clock state,
   * connected peers, pending conflicts, and open files.
   *
   * @returns Status object with clock, peers, and conflict info.
   */
  ipcMain.handle(
    'sync:status',
    safeHandler(async () => {
      const connectedPeerIds = peerManager.getConnectedPeerIds();

      // Fetch the actual IP addresses and names from Prisma
      const registeredPeers = await prisma.peerRegistry.findMany({
        where: { nodeId: { in: connectedPeerIds } },
      });

      // Map to full objects
      const connectedPeers = registeredPeers.map(p => ({
        id: p.nodeId,
        displayName: p.displayName,
        address: p.address,
        port: p.port
      }));

      // Count pending conflicts across all open files.
      let pendingConflicts = 0;
      for (const [fileId] of openFiles) {
        const conflicts = await lwwResolver.getPendingConflicts(fileId);
        pendingConflicts += conflicts.length;
      }

      return {
        localNodeId,
        vectorClock: vectorClock.toJSON(),
        counters: [...vectorClock.counters],
        connectedPeers,
        peerCount: connectedPeers.length,
        totalConnections: peerManager.connectionCount,
        openFileCount: openFiles.size,
        pendingConflicts,
      };
    })
  );

  // ── sync:trigger ───────────────────────────────────────────────────
  /**
   * Manually triggers a sync request to all connected peers for all
   * open files. Each peer receives a SYNC_REQUEST message for each
   * open file.
   *
   * @returns `{ filesSynced, peersContacted }` on success.
   */
  ipcMain.handle(
    'sync:trigger',
    safeHandler(async () => {
      const connectedPeers = peerManager.getConnectedPeerIds();
      let filesSynced = 0;

      for (const [fileId] of openFiles) {
        // Get the latest logicalTimestamp for this file.
        const history = await eventLog.getHistory(fileId);
        const latestTs = history.length > 0
          ? history[history.length - 1].logicalTimestamp
          : 0;

        const syncMsg: PeerMessage = {
          type: 'SYNC_REQUEST',
          nodeId: localNodeId,
          fileId,
          sinceTimestamp: latestTs,
          knownPerNode: highWaterPerNode(history),
          timestamp: new Date().toISOString(),
        };

        peerManager.broadcast(syncMsg);
        filesSynced++;
      }

      console.log(
        `[IPC] sync:trigger → ${filesSynced} files, ` +
          `${connectedPeers.length} peers`
      );

      return {
        filesSynced,
        peersContacted: connectedPeers.length,
        peerIds: connectedPeers,
      };
    })
  );

  // ── sync:cursor-push ───────────────────────────────────────────────
  /**
   * Pushes a local cursor update to a specific peer.
   */
  ipcMain.handle(
    'sync:cursor-push',
    safeHandler(async (_, msg: any) => {
      peerManager.sendCursorUpdate(msg);
    })
  );

  // ── conflict:import ────────────────────────────────────────────────
  /**
   * Imports a conflict from the Matchmaker into the local SQLite database.
   */
  ipcMain.handle(
    'conflict:import',
    async (_event: Electron.IpcMainInvokeEvent, data: any) => {
      try {
        const fileIdNum = typeof data.fileId === 'string' ? parseInt(data.fileId, 10) : data.fileId;
        
        // Broadcast to UI
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) {
          win.webContents.send('conflict:detected', {
            conflictId: data.conflictId,
            fileId: fileIdNum,
            summary: `Conflict from Matchmaker (Web App offline edit)`
          });
        }

        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // ── conflict:list ──────────────────────────────────────────────────
  /**
   * Lists all pending (unresolved) conflicts across all open files.
   *
   * Returns full conflict records from the database including both
   * competing payloads, node IDs, vector clocks, and timestamps.
   * This allows the ConflictsPage to render a real side-by-side diff
   * instead of placeholder text.
   *
   * @returns Array of conflict records with full detail.
   */
  ipcMain.handle(
    'conflict:list',
    safeHandler(async () => {
      const allConflicts: Array<{
        conflictId: string;
        fileId: number;
        eventIdA: string;
        nodeIdA: string;
        payloadA: string;
        logicalTimestampA: number;
        eventIdB: string;
        nodeIdB: string;
        payloadB: string;
        logicalTimestampB: number;
        status: string;
        detectedAt: string;
      }> = [];

      // Collect pending conflicts for every open file.
      for (const [fId] of openFiles) {
        const pending = await lwwResolver.getPendingConflicts(fId);
        for (const c of pending) {
          // Extract logical timestamps from the stored vector clocks.
          const tsA = c.vectorClockJsonA?.root?.children?.[0]?.counter ?? 0;
          const tsB = c.vectorClockJsonB?.root?.children?.[0]?.counter ?? 0;

          allConflicts.push({
            conflictId: c.conflictId,
            fileId: Number(c.fileId),
            eventIdA: c.eventIdA,
            nodeIdA: c.nodeIdA,
            payloadA: c.payloadA,
            logicalTimestampA: tsA,
            eventIdB: c.eventIdB,
            nodeIdB: c.nodeIdB,
            payloadB: c.payloadB,
            logicalTimestampB: tsB,
            status: c.status,
            detectedAt: c.detectedAt.toISOString(),
          });
        }
      }

      // Also check for conflicts on files that may not be in openFiles
      // (e.g., conflict was detected via a peer sync for a file not
      // currently open in the editor).
      const allPending = await prisma.conflict.findMany({
        where: { status: { in: ['pending', 'resolved'] } },
        orderBy: { detectedAt: 'desc' },
        take: 50
      });

      for (const row of allPending) {
        // Skip if already collected via the openFiles loop.
        if (allConflicts.some((c) => c.conflictId === row.conflictId)) continue;

        const vcA = JSON.parse(row.vectorClockJsonA);
        const vcB = JSON.parse(row.vectorClockJsonB);
        const tsA = vcA?.root?.children?.[0]?.counter ?? 0;
        const tsB = vcB?.root?.children?.[0]?.counter ?? 0;

        allConflicts.push({
          conflictId: row.conflictId,
          fileId: Number(row.fileId),
          eventIdA: row.eventIdA,
          nodeIdA: row.nodeIdA,
          payloadA: row.payloadA,
          logicalTimestampA: tsA,
          eventIdB: row.eventIdB,
          nodeIdB: row.nodeIdB,
          payloadB: row.payloadB,
          logicalTimestampB: tsB,
          status: row.status,
          detectedAt: row.detectedAt.toISOString(),
        });
      }

      console.log(`[IPC] conflict:list → ${allConflicts.length} conflicts (including auto-resolved notifications)`);

      return {
        conflicts: allConflicts,
        totalPending: allConflicts.length,
      };
    })
  );

  // ── conflict:detail ────────────────────────────────────────────────
  /**
   * Fetches a single conflict record by its UUID, including full
   * payloads, node IDs, and vector clocks.
   *
   * @param conflictId - UUID of the conflict to fetch.
   * @returns Full conflict record.
   */
  ipcMain.handle(
    'conflict:detail',
    safeHandler(async (...args: unknown[]) => {
      const conflictId = args[0] as string;

      if (typeof conflictId !== 'string' || conflictId.length === 0) {
        throw new Error('conflict:detail requires (conflictId: string).');
      }

      const conflict = await lwwResolver.getConflict(conflictId);
      if (!conflict) {
        throw new Error(`Conflict "${conflictId}" not found.`);
      }

      // Extract logical timestamps from vector clocks.
      const tsA = conflict.vectorClockJsonA?.root?.children?.[0]?.counter ?? 0;
      const tsB = conflict.vectorClockJsonB?.root?.children?.[0]?.counter ?? 0;

      console.log(`[IPC] conflict:detail → ${conflictId}`);

      return {
        conflictId: conflict.conflictId,
        fileId: conflict.fileId,
        eventIdA: conflict.eventIdA,
        nodeIdA: conflict.nodeIdA,
        payloadA: conflict.payloadA,
        logicalTimestampA: tsA,
        eventIdB: conflict.eventIdB,
        nodeIdB: conflict.nodeIdB,
        payloadB: conflict.payloadB,
        logicalTimestampB: tsB,
        status: conflict.status,
        winner: conflict.winner,
        resolvedBy: conflict.resolvedBy,
        detectedAt: conflict.detectedAt.toISOString(),
        resolvedAt: conflict.resolvedAt?.toISOString() ?? null,
      };
    })
  );

  // ── conflict:resolve ───────────────────────────────────────────────
  /**
   * Resolves a pending conflict. The owner chooses side A or B, and
   * the winning payload is applied locally and broadcast to all peers.
   *
   * @param conflictId - UUID of the conflict to resolve.
   * @param winner     - 'A' or 'B'.
   * @returns Resolution result with the MERGE_ACCEPT message.
   */
  ipcMain.handle(
    'conflict:resolve',
    safeHandler(async (...args: unknown[]) => {
      const conflictId = args[0] as string;
      const winner = args[1] as 'A' | 'B';

      if (typeof conflictId !== 'string') {
        throw new Error('conflict:resolve requires (conflictId: string, winner: "A"|"B").');
      }
      if (winner !== 'A' && winner !== 'B') {
        throw new Error(`Winner must be "A" or "B", got "${String(winner)}".`);
      }

      // ── Fetch the conflict to get both vector clocks ────────────
      const conflict = await lwwResolver.getConflict(conflictId);
      if (!conflict) {
        throw new Error(`Conflict "${conflictId}" not found.`);
      }

      // ── Merge both clocks and increment ours ────────────────────
      const clockA = VectorClock.fromJSON(conflict.vectorClockJsonA);
      const clockB = VectorClock.fromJSON(conflict.vectorClockJsonB);

      // Create a fresh merged clock: take element-wise max of A and B.
      const mergedClock = VectorClock.fromJSON(conflict.vectorClockJsonA);
      mergedClock.merge(clockB);

      // ── Call autoResolve ────────────────────────────────────────
      const result = await lwwResolver.autoResolve(
        conflictId,
        winner,
        localNodeId,
        mergedClock.toJSON()
      );

      // ── Broadcast MERGE_ACCEPT to all peers ─────────────────────
      const acceptMsg: PeerMessage = {
        ...result.mergeAcceptMessage,
        fileId: Number(result.mergeAcceptMessage.fileId),
        timestamp: new Date().toISOString(),
      };
      const peersNotified = peerManager.broadcast(acceptMsg);

      if (winner === 'A') {
        const rejectMsg: PeerMessage = {
          type: 'MERGE_REJECT',
          conflictId,
          fileId: Number(conflict.fileId),
          reason: 'Owner rejected peer changes and kept original content.',
          rejectedBy: localNodeId,
          timestamp: new Date().toISOString(),
        };
        peerManager.broadcast(rejectMsg);
      }

      const previousContent = fileContents.get(Number(conflict.fileId)) ?? '';

      // ── Update local file ───────────────────────────────────────
      const winnerPayload = winner === 'A' ? conflict.payloadA : conflict.payloadB;
      fileContents.set(Number(conflict.fileId), winnerPayload);

      let filePath = openFiles.get(Number(conflict.fileId));
      if (!filePath) {
        const win = BrowserWindow.getAllWindows()[0];
        const result = await dialog.showSaveDialog(win ?? undefined!, {
          title: 'Save Resolved File',
          defaultPath: `Resolved_Conflict_${conflict.fileId}.txt`
        });
        if (!result.canceled && result.filePath) {
          filePath = result.filePath;
          openFiles.set(Number(conflict.fileId), filePath);
        }
      }

      if (filePath) {
        await fs.promises.writeFile(filePath, winnerPayload, 'utf-8');
      }

      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.webContents.send('evt:file-updated', {
          fileId: Number(conflict.fileId),
          content: winnerPayload
        });
      }

      const encodeResult = encode(previousContent, winnerPayload, 'conflict.txt');

      const deltaPushMsg: any = {
        type: 'DELTA_PUSH',
        fileId: Number(conflict.fileId),
        nodeId: localNodeId,
        deltaBase64: encodeResult.deltaBase64 ?? '',
        logicalTimestamp: mergedClock.counters[mergedClock.nodeIndex] || 1,
        vectorClockJson: mergedClock.toJSON(),
        timestamp: new Date().toISOString(),
        // Extra fields the web app might expect
        content: winnerPayload,
        authorNodeId: localNodeId,
        authorName: 'Host (Resolution)'
      };
      peerManager.broadcast(deltaPushMsg as PeerMessage);

      // Closes the conflict's accounting: the interval since it was
      // escalated is the Conflict Resolution Time the thesis reports, and
      // the escalation entry is released. Neither happened before, so that
      // metric stayed empty however many conflicts were resolved, and the
      // map of open conflicts only ever grew.
      const resolveMs = peerManager.recordConflictResolved(conflictId);

      console.log(
        `[IPC] conflict:resolve → ${conflictId} winner=${winner}, ` +
          `peers=${peersNotified}` + (resolveMs !== null ? `, resolved in ${resolveMs}ms` : '')
      );

      return {
        conflictId,
        winner,
        resolvedBy: localNodeId,
        peersNotified,
        resolveMs,
        fileId: conflict.fileId,
      };
    })
  );

  // ── conflict:resolve-manual ───────────────────────────────────────
  /**
   * Resolves a conflict with a user-provided custom payload.
   *
   * @param conflictId - The UUID of the conflict to resolve.
   * @param customPayload - The manually merged HTML.
   * @returns Resolves when complete.
   */
  ipcMain.handle(
    'conflict:resolve-manual',
    safeHandler(async (...args: unknown[]) => {
      const conflictId = args[0] as string;
      const customPayload = args[1] as string;

      if (typeof conflictId !== 'string' || typeof customPayload !== 'string') {
        throw new Error('conflict:resolve-manual requires (conflictId: string, customPayload: string).');
      }

      console.log(`[IPC] conflict:resolve-manual → resolving ${conflictId} with custom payload`);
      
      const conflict = await lwwResolver.getConflict(conflictId);
      if (!conflict) throw new Error(`Conflict ${conflictId} not found`);

      // Merge clocks
      const clockA = VectorClock.fromJSON(conflict.vectorClockJsonA);
      const clockB = VectorClock.fromJSON(conflict.vectorClockJsonB);
      vectorClock.merge(clockA);
      vectorClock.merge(clockB);
      vectorClock.increment();

      const mergedClockJson = vectorClock.toJSON();

      const result = await lwwResolver.manualResolve(
        conflictId,
        customPayload,
        localNodeId,
        mergedClockJson
      );

      // Broadcast MERGE_ACCEPT to peers
      const acceptMsg: PeerMessage = {
        ...result.mergeAcceptMessage,
        fileId: Number(result.mergeAcceptMessage.fileId),
        timestamp: new Date().toISOString(),
      };
      const peersNotified = peerManager.broadcast(acceptMsg);

      const previousContent = fileContents.get(Number(conflict.fileId)) ?? '';
      
      // Update local file contents
      fileContents.set(Number(conflict.fileId), customPayload);
      
      let filePath = openFiles.get(Number(conflict.fileId));
      if (!filePath) {
        const win = BrowserWindow.getAllWindows()[0];
        const result = await dialog.showSaveDialog(win ?? undefined!, {
          title: 'Save Resolved File',
          defaultPath: `Resolved_Conflict_${conflict.fileId}.txt`
        });
        if (!result.canceled && result.filePath) {
          filePath = result.filePath;
          openFiles.set(Number(conflict.fileId), filePath);
        }
      }

      if (filePath) {
        // We write the customPayload (HTML) directly to disk so TipTap formatting is preserved on reopen
        await fs.promises.writeFile(filePath, customPayload, 'utf-8');
      }

      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.webContents.send('evt:file-updated', {
          fileId: Number(conflict.fileId),
          content: customPayload
        });
      }

      const encodeResult = encode(previousContent, customPayload, 'conflict.txt');

      const deltaPushMsg: any = {
        type: 'DELTA_PUSH',
        fileId: Number(conflict.fileId),
        nodeId: localNodeId,
        deltaBase64: encodeResult.deltaBase64 ?? '',
        logicalTimestamp: 1, // Will be overridden or ignored if vectorClockJson is present
        vectorClockJson: mergedClockJson,
        timestamp: new Date().toISOString(),
        content: customPayload,
        authorNodeId: localNodeId,
        authorName: 'Host (Resolution)'
      };
      peerManager.broadcast(deltaPushMsg as PeerMessage);

      const resolveMs = peerManager.recordConflictResolved(conflictId);

      console.log(`[IPC] conflict:resolve-manual → ${conflictId} peers=${peersNotified}`
        + (resolveMs !== null ? `, resolved in ${resolveMs}ms` : ''));

      return {
        conflictId,
        winner: 'B',
        resolvedBy: localNodeId,
        peersNotified,
        resolveMs,
        fileId: conflict.fileId,
      };
    })
  );

  // ── peer:list ──────────────────────────────────────────────────────
  /**
   * Returns all peers from the PeerRegistry, with their online/offline
   * status.
   *
   * @returns Array of peer records.
   */
  ipcMain.handle(
    'peer:list',
    safeHandler(async () => {
      const peers = await prisma.peerRegistry.findMany({
        orderBy: { lastSeen: 'desc' },
      });

      return {
        peers: peers.map((p) => ({
          nodeId: p.nodeId,
          displayName: p.displayName,
          address: p.address,
          port: p.port,
          isOnline: p.isOnline,
          firstSeen: p.firstSeen.toISOString(),
          lastSeen: p.lastSeen.toISOString(),
        })),
        totalPeers: peers.length,
        onlinePeers: peers.filter((p) => p.isOnline).length,
      };
    })
  );

  // ── peer:connect ───────────────────────────────────────────────────
  /**
   * Connects to a peer at the specified address and port.
   *
   * @param address - IP address or hostname of the peer.
   * @param port    - WebSocket port of the peer.
   * @returns Connection result.
   */
  ipcMain.handle(
    'peer:connect',
    safeHandler(async (...args: unknown[]) => {
      const address = args[0] as string;
      const port = args[1] as number;

      if (typeof address !== 'string' || typeof port !== 'number') {
        throw new Error('peer:connect requires (address: string, port: number).');
      }

      if (port < 1 || port > 65535 || !Number.isInteger(port)) {
        throw new Error(`Invalid port: ${port}. Must be 1–65535.`);
      }

      await peerManager.connectToPeer(address, port);

      console.log(`[IPC] peer:connect → ${address}:${port}`);

      return {
        connected: true,
        address,
        port,
        connectedPeers: peerManager.getConnectedPeerIds(),
      };
    })
  );


  // ── Vault & Identity ────────────────────────────────────────────────
  let isUnlocked = false;

  ipcMain.handle(
    'vault:get-status',
    safeHandler(async () => {
      // @ts-ignore - LocalVault might not be in the types yet due to EPERM error on generate
      const vault = await prisma.localVault.findFirst();
      if (!vault) {
        return { isRegistered: false, isUnlocked: false, nodeId: null };
      }
      return { isRegistered: true, isUnlocked, nodeId: vault.nodeId };
    })
  );

  ipcMain.handle(
    'vault:genesis-init',
    safeHandler(async (...args: unknown[]) => {
      const pin = args[0] as string;
      if (typeof pin !== 'string' || pin.length !== 8) {
        throw new Error('Genesis requires an 8-digit PIN.');
      }
      // @ts-ignore
      const existing = await prisma.localVault.findFirst();
      if (existing) {
        throw new Error('Vault is already initialized.');
      }
      const randomHex1 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const randomHex2 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const nodeId = `Docu-${randomHex1}-${randomHex2}`;
      
      const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
      const vaultId = generateUUID();
      
      // @ts-ignore
      await prisma.localVault.create({
        data: { id: vaultId, nodeId, pinHash }
      });
      
      isUnlocked = true;
      return { nodeId };
    })
  );

  ipcMain.handle(
    'vault:unlock',
    safeHandler(async (...args: unknown[]) => {
      const pin = args[0] as string;
      if (typeof pin !== 'string') {
        throw new Error('Unlock requires a PIN string.');
      }
      // @ts-ignore
      const vault = await prisma.localVault.findFirst();
      if (!vault) {
        throw new Error('Vault not initialized.');
      }
      
      const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
      if (vault.pinHash === pinHash) {
        isUnlocked = true;
        return { success: true, nodeId: vault.nodeId };
      } else {
        return { success: false };
      }
    })
  );

  ipcMain.handle(
    'vault:lock',
    safeHandler(async () => {
      isUnlocked = false;
      return { success: true };
    })
  );

  ipcMain.handle(
    'vault:factory-reset',
    safeHandler(async () => {
      // @ts-ignore
      await prisma.localVault.deleteMany({});
      await prisma.eventLog.deleteMany({});
      await prisma.conflict.deleteMany({});
      isUnlocked = false;
      return { success: true };
    })
  );

  ipcMain.handle(
    'session:terminate',
    safeHandler(async () => {
      // 1. Broadcast termination to all peers
      peerManager.broadcast({
        type: 'SESSION_TERMINATED',
        reason: 'Admin deleted group',
        timestamp: new Date().toISOString(),
      });
      // 2. Shut down our own server gracefully
      await peerManager.shutdown();
      return { success: true };
    })
  );

  // ── file:checkout ──────────────────────────────────────────────────
  /**
   * Saves a physical copy of an open file to a user-chosen path.
   * Logs a CHECK_OUT event to the EventLog.
   *
   * @param fileId - The file ID (from `file:open`).
   * @returns `{ saved: boolean, destPath: string }` on success.
   */
  ipcMain.handle(
    'file:checkout',
    safeHandler(async (...args: unknown[]) => {
      const fileId = args[0] as number;
      if (typeof fileId !== 'number') {
        throw new Error('file:checkout requires (fileId: number).');
      }
      const filePath = openFiles.get(fileId);
      if (!filePath) {
        throw new Error(`File ID ${fileId} is not open.`);
      }
      const content = fileContents.get(fileId) ?? '';
      const defaultName = path.basename(filePath);

      // Block .docx/.doc round-trip — content was extracted as plain text
      // by mammoth on open; writing it back would produce a corrupted file.
      if (isDocxExtension(filePath)) {
        throw new Error(
          'DOCX round-trip saving is not yet supported. ' +
          'The file was converted to plain text when opened. ' +
          'Please save as a .txt file instead, or open the original .docx in Word directly.'
        );
      }

      const win = BrowserWindow.getAllWindows()[0];

      const result = await dialog.showSaveDialog(win ?? undefined!, {
        title: 'Download File (Check-out)',
        defaultPath: defaultName,
        filters: [{ name: 'All Files', extensions: ['*'] }],
      });

      if (result.canceled || !result.filePath) {
        throw new Error('Save cancelled by user.');
      }

      // Strip HTML for non-HTML files to prevent TipTap markup corruption
      const contentToWrite = isHtmlExtension(result.filePath) ? content : stripHtmlToPlainText(content);
      await fs.promises.writeFile(result.filePath, contentToWrite, 'utf-8');

      // Log a CHECK_OUT event
      vectorClock.increment();
      const vcJson = vectorClock.toJSON();
      const logicalTimestamp = vectorClock.counters[vectorClock.nodeIndex];
      const eventId = generateUUID();
      await eventLog.appendEvent({
        eventId,
        fileId,
        nodeId: localNodeId,
        eventType: 'checkout',
        logicalTimestamp,
        vectorClockJson: vcJson,
        payload: JSON.stringify({ destPath: result.filePath }),
      });

      console.log(`[IPC] file:checkout → ${result.filePath}`);
      return { saved: true, destPath: result.filePath };
    })
  );

  // ── admin:get-activity-log ─────────────────────────────────────────
  /**
   * Fetches the last 50 EventLog entries for the Admin Dashboard.
   *
   * @returns `{ entries: ActivityEntry[] }` on success.
   */
  ipcMain.handle(
    'admin:get-activity-log',
    safeHandler(async () => {
      const entries = await prisma.eventLog.findMany({
        orderBy: { logicalTimestamp: 'desc' },
        take: 50,
      });
      return {
        entries: entries.map(e => ({
          id:               e.id,
          eventId:          e.eventId,
          fileId:           e.fileId,
          nodeId:           e.nodeId,
          eventType:        e.eventType,
          logicalTimestamp: e.logicalTimestamp,
          createdAt:        e.createdAt.toISOString(),
        })),
      };
    })
  );



  // ── cache:auto-cleanup ─────────────────────────────────────────────
  /**
   * Deletes compacted EventLog rows older than 30 days when the table
   * exceeds 1000 rows. Safe to call repeatedly.
   *
   * @returns `{ deletedCount, totalBefore, totalAfter }` on success.
   */
  ipcMain.handle(
    'cache:auto-cleanup',
    safeHandler(async () => {
      const totalBefore = await prisma.eventLog.count();
      if (totalBefore <= 1000) {
        return { deletedCount: 0, totalBefore, totalAfter: totalBefore };
      }
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const deleted = await prisma.eventLog.deleteMany({
        where: {
          isCompacted: true,
          createdAt: { lt: cutoff },
        },
      });
      const totalAfter = await prisma.eventLog.count();
      console.log(`[IPC] cache:auto-cleanup → deleted ${deleted.count} rows (${totalBefore} → ${totalAfter}).`);
      return { deletedCount: deleted.count, totalBefore, totalAfter };
    })
  );

  // ── cache:get-size ─────────────────────────────────────────────────
  ipcMain.handle(
    'cache:get-size',
    safeHandler(async () => {
      const count = await prisma.eventLog.count();
      return { rowCount: count };
    })
  );

  // ── network:get-lan-ip ─────────────────────────────────────────────
  ipcMain.handle(
    'network:get-lan-ip',
    safeHandler(async () => {
      const interfaces = os.networkInterfaces();
      let bestIp: string | null = null;
      let fallbackIp: string | null = null;

      for (const devName in interfaces) {
        const iface = interfaces[devName];
        if (!iface) continue;

        const isVirtual = (devName.toLowerCase().includes('vmware') || 
                          devName.toLowerCase().includes('virtual') || 
                          devName.toLowerCase().includes('vethernet') ||
                          devName.toLowerCase().includes('wsl')) && !devName.toLowerCase().includes('direct');
                          
        const isPreferred = devName.toLowerCase().includes('wi-fi') || 
                            devName.toLowerCase().includes('wifi') || 
                            devName.toLowerCase().includes('hotspot') ||
                            devName.toLowerCase().includes('ethernet') ||
                            devName.toLowerCase().includes('local area connection*');

        for (const alias of iface) {
          if (alias.family === 'IPv4' && !alias.internal) {
            if (isPreferred && !isVirtual) {
              bestIp = alias.address;
              break; // Found an ideal adapter
            } else if (!fallbackIp) {
              fallbackIp = alias.address; // Save the first valid IPv4 as a fallback
            }
          }
        }
        if (bestIp) break;
      }
      return bestIp || fallbackIp || '127.0.0.1';
    })
  );

  ipcMain.handle('user:set-name', async (event, name: string) => {
    (services.peerManager as any).config.localDisplayName = name;
    // Broadcast the updated PEER_LIST to all peers
    // Typescript might complain since it's private, but we can cast to any
    (services.peerManager as any).broadcastPeerList();
    return true;
  });

  console.log('[IPC] All handlers registered.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Removes all registered IPC handlers and shuts down engine services.
 *
 * Call this during `app.on('before-quit')` or `app.on('will-quit')`
 * to ensure a clean shutdown of the WebSocket server and Prisma
 * connection.
 *
 * @param services - The engine services container to clean up.
 *
 * @example
 * ```ts
 * app.on('before-quit', async () => {
 *   await cleanupIPCHandlers(services);
 * });
 * ```
 */
export async function cleanupIPCHandlers(services: EngineServices): Promise<void> {
  console.log('[IPC] Cleaning up...');

  // Remove all IPC handlers.
  const channels = [
    'file:open', 'file:save', 'file:history', 'file:restore', 'file:checkout',
    'sync:status', 'sync:trigger',
    'conflict:list', 'conflict:detail', 'conflict:resolve', 'conflict:resolve-manual',
    'peer:list', 'peer:connect',
    'admin:get-activity-log', 'cache:auto-cleanup', 'cache:get-size',
    'session:terminate', 'auth:verify-respond',
    'vault:get-status', 'vault:genesis-init', 'vault:unlock', 'vault:lock', 'vault:factory-reset',
    'network:get-lan-ip',
  ];
  for (const channel of channels) {
    ipcMain.removeHandler(channel);
  }

  // Shut down peer manager (sends PEER_BYE, closes sockets).
  await services.peerManager.shutdown();

  // Disconnect Prisma.
  await services.prisma.$disconnect();

  console.log('[IPC] Cleanup complete.');
}
