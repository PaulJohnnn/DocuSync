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
import { createPeerManager, PeerManager } from '../src/engine/peer/peer-manager';
import type { PeerMessage } from '../src/engine/peer/message-schema';
import type { VectorClockJSON } from '../src/engine/vector-clock/vector-clock';

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
      "fileId"           INTEGER  NOT NULL,
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
      "fileId"           INTEGER  NOT NULL,
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
  const peerManager = createPeerManager({
    localNodeId,
    localDisplayName: lanIp,
    nodeCount,
    nodeIndex,
    prisma,
    eventLog,
    getFileContent: async (fileId: number) => {
      return fileContents.get(fileId) ?? '';
    },
    onDeltaApplied: async (fileId, newContent, _eventId, _nodeId, _vcJson) => {
      // Update in-memory cache.
      fileContents.set(fileId, newContent);

      // Write to disk if we have a file path.
      const filePath = openFiles.get(fileId);
      if (filePath) {
        await fs.promises.writeFile(filePath, newContent, 'utf-8');
        console.log(`[IPC] Applied remote delta to ${filePath}`);
      }
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
    nextFileId: 1,
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
        filePath = firstArg as string | undefined;
      }

      // If a valid fileId was provided and is already open, return it immediately.
      if (fileId !== undefined && filePath) {
        const content = fileContents.get(fileId) ?? '';
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
        const result = await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [
            { name: 'Word Documents', extensions: ['docx', 'doc'] },
            {
              name: 'Text & Code Files',
              extensions: ['txt', 'md', 'json', 'csv', 'ts', 'tsx', 'js', 'jsx', 'css', 'html'],
            },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

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

      if (ext === '.docx' || ext === '.doc') {
        // Parse Word documents as plain text using mammoth
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mammoth = require('mammoth');
        const buffer = await fs.promises.readFile(filePath);
        const result = await mammoth.extractRawText({ buffer });
        content = result.value;
        console.log(`[IPC] file:open (docx) → extracted ${content.length} chars from ${filePath}`);
      } else {
        content = await fs.promises.readFile(filePath, 'utf-8');
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
      const { app } = require('electron');
      const docuSyncDir = path.join(app.getPath('downloads'), 'DocuSync');
      if (!fs.existsSync(docuSyncDir)) {
        await fs.promises.mkdir(docuSyncDir, { recursive: true });
      }

      // Handle duplicate names by appending a timestamp or UUID
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      const uniqueName = `${base}_${Date.now()}${ext}`;
      const destPath = path.join(docuSyncDir, uniqueName);

      // Write content to disk
      await fs.promises.writeFile(destPath, content, 'utf-8');

      // Now open it using the same logic as file:open
      const extLower = ext.toLowerCase();
      
      const newFileId = explicitFileId !== undefined ? explicitFileId : services.nextFileId++;
      if (explicitFileId !== undefined && explicitFileId >= services.nextFileId) {
        services.nextFileId = explicitFileId + 1;
      }
      openFiles.set(newFileId, destPath);
      fileContents.set(newFileId, content);

      console.log(`[IPC] file:import-room-file → ${destPath} (fileId=${newFileId})`);

      return {
        fileId: newFileId,
        filePath: destPath,
        fileName: uniqueName,
        content,
        extension: extLower.replace('.', ''),
        contentLength: Buffer.byteLength(content, 'utf-8'),
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

      if (typeof fileId !== 'number' || typeof newContent !== 'string') {
        throw new Error('file:save requires (fileId: number, newContent: string).');
      }

      const filePath = openFiles.get(fileId);
      if (!filePath) {
        throw new Error(`File ID ${fileId} is not open.`);
      }

      const previousContent = fileContents.get(fileId) ?? '';

      // ── Write to disk ───────────────────────────────────────────
      await fs.promises.writeFile(filePath, newContent, 'utf-8');

      // ── Compute delta ───────────────────────────────────────────
      const fileName = path.basename(filePath);

      // Validate text extension before encoding.
      try {
        validateTextFile(fileName);
      } catch {
        // If the encoder rejects it, still save but skip delta sync.
        fileContents.set(fileId, newContent);
        return {
          fileId,
          saved: true,
          synced: false,
          reason: 'File type not eligible for delta sync.',
        };
      }

      const encodeResult = encode(previousContent, newContent, fileName);

      // ── Update in-memory cache ──────────────────────────────────
      fileContents.set(fileId, newContent);

      // ── Increment vector clock ──────────────────────────────────
      vectorClock.increment();
      const vcJson = vectorClock.toJSON();
      const logicalTimestamp = vectorClock.counters[vectorClock.nodeIndex];

      // ── Append to EventLog ──────────────────────────────────────
      const eventId = generateUUID();
      const payload = encodeResult.deltaBase64 ?? JSON.stringify(encodeResult.chunks);

      await eventLog.appendEvent({
        eventId,
        fileId,
        nodeId: localNodeId,
        eventType: 'edit',
        logicalTimestamp,
        vectorClockJson: vcJson,
        payload,
      });

      // ── Broadcast to peers ──────────────────────────────────────
      let peersNotified = 0;
      if (encodeResult.deltaBase64) {
        const pushMsg: PeerMessage = {
          type: 'DELTA_PUSH',
          eventId,
          nodeId: localNodeId,
          fileId,
          deltaBase64: encodeResult.deltaBase64,
          logicalTimestamp,
          vectorClockJson: vcJson,
          timestamp: new Date().toISOString(),
        };
        peersNotified = peerManager.broadcast(pushMsg);
      }

      console.log(
        `[IPC] file:save → ${fileName} (delta=${encodeResult.deltaSizeBytes}B, ` +
          `peers=${peersNotified})`
      );

      return {
        fileId,
        saved: true,
        synced: true,
        deltaSizeBytes: encodeResult.deltaSizeBytes,
        compressionRatio: encodeResult.compressionRatio,
        peersNotified,
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

      return {
        fileId,
        entries: history.map((entry) => ({
          id: entry.id,
          eventId: entry.eventId,
          nodeId: entry.nodeId,
          eventType: entry.eventType,
          logicalTimestamp: entry.logicalTimestamp,
          createdAt: entry.createdAt.toISOString(),
          isCompacted: entry.isCompacted,
          // Omit payload for performance — it can be large.
          payloadPreview: entry.payload.slice(0, 200),
        })),
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
          // If delta decoding fails (e.g., checksum mismatch from
          // different content state), try treating payload as raw content.
          content = event.payload;
        }

        if (event.eventId === targetEventId) break;
      }

      // ── Write restored content to disk ──────────────────────────
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

      return {
        fileId,
        restoredToEventId: targetEventId,
        restoreEventId,
        contentLength: content.length,
      };
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
        where: { status: 'pending' },
        orderBy: { detectedAt: 'asc' },
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

      console.log(`[IPC] conflict:list → ${allConflicts.length} pending conflicts`);

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
        timestamp: new Date().toISOString(),
      };
      const peersNotified = peerManager.broadcast(acceptMsg);

      // ── Update local file ───────────────────────────────────────
      const winnerPayload = winner === 'A' ? conflict.payloadA : conflict.payloadB;
      fileContents.set(conflict.fileId, winnerPayload);

      const filePath = openFiles.get(conflict.fileId);
      if (filePath) {
        await fs.promises.writeFile(filePath, winnerPayload, 'utf-8');
      }

      console.log(
        `[IPC] conflict:resolve → ${conflictId} winner=${winner}, ` +
          `peers=${peersNotified}`
      );

      return {
        conflictId,
        winner,
        resolvedBy: localNodeId,
        peersNotified,
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
    'network:get-lan-ip',
    safeHandler(async () => {
      const nets = os.networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
          if (net.family === 'IPv4' && !net.internal) {
            // Return the first non-internal IPv4 address
            return net.address;
          }
        }
      }
      return '127.0.0.1';
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
      const win = BrowserWindow.getAllWindows()[0];

      const result = await dialog.showSaveDialog(win ?? undefined!, {
        title: 'Download File (Check-out)',
        defaultPath: defaultName,
        filters: [{ name: 'All Files', extensions: ['*'] }],
      });

      if (result.canceled || !result.filePath) {
        throw new Error('Save cancelled by user.');
      }

      await fs.promises.writeFile(result.filePath, content, 'utf-8');

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
    'conflict:list', 'conflict:detail', 'conflict:resolve',
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
