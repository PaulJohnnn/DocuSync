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
        filePath = firstArg as string | undefined;
      }

      // If a valid fileId was provided, look it up locally
      if (fileId !== undefined) {
        if (!filePath) {
          // If in-memory map is lost (e.g. after restart), search the Downloads folder Fallback
          let recoveredPath: string | undefined;
          if (args[1] && typeof args[1] === 'string') {
            const fileName = args[1];
            const docuSyncDir = path.join(app.getPath('downloads'), 'DocuSync');
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
        const options: Electron.OpenDialogOptions = {
          properties: ['openFile'],
          filters: [
            { name: 'Word Documents', extensions: ['docx', 'doc'] },
            {
              name: 'Text & Code Files',
              extensions: ['txt', 'md', 'json', 'csv', 'ts', 'tsx', 'js', 'jsx', 'css', 'html'],
            },
            { name: 'All Files', extensions: ['*'] },
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

      const destPath = path.join(docuSyncDir, fileName);

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

      // ── Write to disk ───────────────────────────────────────────
      // We write the raw HTML regardless of extension to prevent TipTap from losing formatting.
      await fs.promises.writeFile(filePath, newContent, 'utf-8');

      // ── Update in-memory cache (keep HTML for TipTap/delta engine) ──
      fileContents.set(fileId, newContent);

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
        payload,
      });

      // ── Broadcast to peers ──────────────────────────────────────
      let peersNotified = 0;
      if (encodeResult.deltaBase64) {
        const pushMsg: any = {
          type: 'DELTA_PUSH',
          eventId,
          nodeId: localNodeId,
          fileId,
          deltaBase64: encodeResult.deltaBase64,
          content: newContent,
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

      let currentContent = '';
      const reconstructedEntries = history.map((entry) => {
        if (!entry.isCompacted) {
          try {
            if (entry.eventType === 'edit' || entry.eventType === 'merge') {
              const decodeResult = decode(currentContent, entry.payload);
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
          eventId: entry.eventId,
          nodeId: entry.nodeId,
          eventType: entry.eventType,
          logicalTimestamp: entry.logicalTimestamp,
          createdAt: entry.createdAt.toISOString(),
          isCompacted: entry.isCompacted,
          payload: currentContent,
          payloadPreview: currentContent.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').slice(0, 200),
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

      console.log(`[IPC] conflict:resolve-manual → ${conflictId} peers=${peersNotified}`);

      return {
        conflictId,
        winner: 'B',
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
