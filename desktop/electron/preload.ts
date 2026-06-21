/**
 * @module Preload
 *
 * Electron contextBridge preload script for DocuSync.
 *
 * This script runs in an isolated context between the Electron main process
 * and the React renderer. It is the ONLY bridge between privileged Node.js
 * code and the sandboxed renderer.
 *
 * **Security model:**
 * - Raw `ipcRenderer` is NEVER exposed to the renderer. Exposing it would
 *   allow the renderer (and any injected script) to invoke arbitrary IPC
 *   channels, constituting a privilege escalation vulnerability.
 * - Only the explicitly named methods in {@link DocuSyncBridge} are exposed.
 * - Each method is bound to a single, hard-coded IPC channel — the renderer
 *   cannot choose which channel to invoke.
 * - Event listeners are scoped: each `on*` method returns an unsubscribe
 *   function so listeners can be cleaned up without exposing `ipcRenderer.off`.
 *
 * **Usage in renderer (React):**
 * ```ts
 * const status = await window.docuSync.getSyncStatus();
 *
 * const unsub = window.docuSync.onConflictDetected((payload) => {
 *   showConflictDialog(payload);
 * });
 * // Later:
 * unsub(); // removes the listener
 * ```
 *
 * @packageDocumentation
 */

import { ipcRenderer, contextBridge } from 'electron';

// ─────────────────────────────────────────────────────────────────────────────
// IPC Channel Constants
//
// All channel names are declared here as constants so that a typo is a
// compile-time error rather than a silent runtime failure. Each constant
// maps exactly to one `ipcMain.handle(...)` registration in ipc-handlers.ts.
// ─────────────────────────────────────────────────────────────────────────────

const CH_FILE_OPEN       = 'file:open'       as const;
const CH_FILE_SAVE       = 'file:save'       as const;
const CH_FILE_HISTORY    = 'file:history'    as const;
const CH_FILE_RESTORE    = 'file:restore'    as const;
const CH_SYNC_STATUS     = 'sync:status'     as const;
const CH_SYNC_TRIGGER    = 'sync:trigger'    as const;
const CH_CONFLICT_LIST    = 'conflict:list'    as const;
const CH_CONFLICT_DETAIL  = 'conflict:detail'  as const;
const CH_CONFLICT_RESOLVE = 'conflict:resolve' as const;
const CH_PEER_LIST       = 'peer:list'       as const;
const CH_PEER_CONNECT    = 'peer:connect'    as const;
const CH_VAULT_STATUS    = 'vault:get-status' as const;
const CH_VAULT_GENESIS   = 'vault:genesis-init' as const;
const CH_VAULT_UNLOCK    = 'vault:unlock'     as const;
const CH_VAULT_LOCK      = 'vault:lock'       as const;
const CH_VAULT_FACTORY_RESET = 'vault:factory-reset' as const;
const CH_NET_LAN_IP      = 'network:get-lan-ip' as const;

/** Main-to-renderer push channels (one-way, main → renderer). */
const CH_EVT_CONFLICT    = 'conflict:detected'  as const;
const CH_EVT_SYNC_STATUS = 'evt:sync-status-changed' as const;

// ─────────────────────────────────────────────────────────────────────────────
// DocuSyncBridge Interface
//
// This is the public contract exposed to the renderer via window.docuSync.
// It is declared here so it can be re-exported as a .d.ts and used in the
// renderer for full TypeScript type safety without importing Electron.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard IPC response envelope. Every invoke call returns this shape.
 * The renderer MUST check `success` before reading `data`.
 */
export interface IPCResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Payload pushed to the renderer when a conflict is detected by the engine.
 */
export interface ConflictDetectedPayload {
  conflictId: string;
  fileId: number;
  summary: string;
}

/**
 * Payload pushed to the renderer when the sync status changes.
 */
export interface SyncStatusChangedPayload {
  localNodeId: string;
  connectedPeers: string[];
  peerCount: number;
  pendingConflicts: number;
}

/**
 * The complete typed API surface exposed to the React renderer under
 * `window.docuSync`.
 *
 * No method on this interface has access to raw IPC primitives.
 * The renderer cannot call arbitrary channels — it can only call
 * the named functions below.
 */
export interface DocuSyncBridge {
  // ── File Operations ────────────────────────────────────────────────────

  /**
   * Opens a file from disk via the main process.
   * If `filePath` is omitted, a native file-open dialog is shown.
   *
   * @param filePathOrId - Optional absolute path to the file or numeric file ID.
   * @returns IPCResponse containing `{ fileId, filePath, fileName, content, extension, sizeBytes }`.
   */
  openFile(filePathOrId?: string | number): Promise<IPCResponse>;

  /**
   * Saves updated content to an open file, computes a delta, appends
   * an event to the EventLog, and broadcasts a DELTA_PUSH to all peers.
   *
   * @param fileId     - The file ID from a prior `openFile` call.
   * @param newContent - The updated document content.
   * @returns IPCResponse containing `{ fileId, saved, synced, deltaSizeBytes, peersNotified }`.
   */
  saveFile(fileId: number, newContent: string): Promise<IPCResponse>;

  /**
   * Returns the complete append-only EventLog history for a file.
   *
   * @param fileId - The file ID.
   * @returns IPCResponse containing `{ fileId, entries, totalEntries }`.
   */
  getHistory(fileId: number): Promise<IPCResponse>;

  /**
   * Restores a file to a previous version by replaying the EventLog
   * up to and including the specified event.
   *
   * @param fileId  - The file ID.
   * @param eventId - The UUID of the EventLog entry to restore to.
   * @returns IPCResponse containing `{ fileId, restoredToEventId, contentLength }`.
   */
  restoreVersion(fileId: number, eventId: string): Promise<IPCResponse>;

  // ── Sync Operations ────────────────────────────────────────────────────

  /**
   * Returns the current sync status: vector clock, connected peers,
   * open files, and pending conflict count.
   *
   * @returns IPCResponse containing `{ localNodeId, vectorClock, connectedPeers, pendingConflicts }`.
   */
  getSyncStatus(): Promise<IPCResponse>;

  /**
   * Manually triggers a SYNC_REQUEST broadcast to all connected peers
   * for all currently open files.
   *
   * @returns IPCResponse containing `{ filesSynced, peersContacted }`.
   */
  triggerSync(): Promise<IPCResponse>;

  // ── Conflict Resolution ────────────────────────────────────────────────

  /**
   * Resolves a pending conflict. Only the repository owner may call this.
   *
   * @param conflictId - UUID of the conflict to resolve.
   * @param winner     - Which side wins: 'A' (first edit) or 'B' (second edit).
   * @returns IPCResponse containing `{ conflictId, winner, peersNotified }`.
   */
  resolveConflict(conflictId: string, winner: 'A' | 'B'): Promise<IPCResponse>;

  /**
   * Lists all pending (unresolved) conflicts with full detail records
   * including both competing payloads, node IDs, and timestamps.
   *
   * @returns IPCResponse containing `{ conflicts, totalPending }`.
   */
  listConflicts(): Promise<IPCResponse>;

  /**
   * Fetches a single conflict's full record by its UUID.
   *
   * @param conflictId - UUID of the conflict to fetch.
   * @returns IPCResponse containing the full conflict record.
   */
  getConflictDetail(conflictId: string): Promise<IPCResponse>;

  // ── Peer Management ───────────────────────────────────────────────────

  /**
   * Returns all peers from the PeerRegistry with their online/offline status.
   *
   * @returns IPCResponse containing `{ peers, totalPeers, onlinePeers }`.
   */
  getPeers(): Promise<IPCResponse>;

  /**
   * Connects to a peer by IP address and WebSocket port.
   *
   * @param address - IP address or hostname of the peer.
   * @param port    - WebSocket port of the peer.
   * @returns IPCResponse containing `{ connected, address, port, connectedPeers }`.
   */
  connectToPeer(address: string, port: number): Promise<IPCResponse>;

  // ── Vault & Network ──────────────────────────────────────────────────

  getVaultStatus(): Promise<IPCResponse<{ isRegistered: boolean, isUnlocked: boolean, nodeId: string | null }>>;
  genesisInit(pin: string): Promise<IPCResponse<{ nodeId: string }>>;
  unlockVault(pin: string): Promise<IPCResponse<{ success: boolean, nodeId?: string }>>;
  lockVault(): Promise<IPCResponse<{ success: boolean }>>;
  factoryReset(): Promise<IPCResponse<{ success: boolean }>>;
  getLanIp(): Promise<IPCResponse<string>>;

  // ── Push Event Listeners ──────────────────────────────────────────────

  /**
   * Registers a listener for conflict-detected push events from the engine.
   *
   * The main process sends this event when a concurrent write conflict is
   * detected and owner resolution is required.
   *
   * @param listener - Callback receiving the conflict payload.
   * @returns An unsubscribe function — call it to remove the listener.
   *
   * @example
   * ```ts
   * const unsub = window.docuSync.onConflictDetected((payload) => {
   *   showConflictUI(payload.conflictId, payload.summary);
   * });
   * // In cleanup:
   * unsub();
   * ```
   */
  onConflictDetected(
    listener: (payload: ConflictDetectedPayload) => void
  ): () => void;

  /**
   * Registers a listener for sync-status-changed push events from the engine.
   *
   * The main process sends this event whenever a peer connects/disconnects
   * or the vector clock state changes significantly.
   *
   * @param listener - Callback receiving the updated sync status.
   * @returns An unsubscribe function — call it to remove the listener.
   *
   * @example
   * ```ts
   * const unsub = window.docuSync.onSyncStatusChanged((status) => {
   *   updateStatusBar(status.peerCount, status.pendingConflicts);
   * });
   * // In cleanup:
   * unsub();
   * ```
   */
  onSyncStatusChanged(
    listener: (payload: SyncStatusChangedPayload) => void
  ): () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bridge Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Concrete implementation of {@link DocuSyncBridge}.
 *
 * Each method wraps exactly one `ipcRenderer.invoke` call on a hard-coded
 * channel. The renderer has no way to call any other channel.
 *
 * Event listener helpers (`onConflictDetected`, `onSyncStatusChanged`) use
 * a wrapper pattern: the raw Electron `IpcRendererEvent` is stripped out
 * before the user-supplied callback receives the payload. This prevents
 * the renderer from ever holding a reference to an Electron API object.
 */
const docuSyncBridge: DocuSyncBridge = {
  // ── File Operations ──────────────────────────────────────────────────

  openFile(filePathOrId?: string | number): Promise<IPCResponse> {
    return ipcRenderer.invoke(CH_FILE_OPEN, filePathOrId);
  },

  saveFile(fileId: number, newContent: string): Promise<IPCResponse> {
    return ipcRenderer.invoke(CH_FILE_SAVE, fileId, newContent);
  },

  getHistory(fileId: number): Promise<IPCResponse> {
    return ipcRenderer.invoke(CH_FILE_HISTORY, fileId);
  },

  restoreVersion(fileId: number, eventId: string): Promise<IPCResponse> {
    return ipcRenderer.invoke(CH_FILE_RESTORE, fileId, eventId);
  },

  // ── Sync Operations ──────────────────────────────────────────────────

  getSyncStatus(): Promise<IPCResponse> {
    return ipcRenderer.invoke(CH_SYNC_STATUS);
  },

  triggerSync(): Promise<IPCResponse> {
    return ipcRenderer.invoke(CH_SYNC_TRIGGER);
  },

  // ── Conflict Resolution ──────────────────────────────────────────────

  resolveConflict(conflictId: string, winner: 'A' | 'B'): Promise<IPCResponse> {
    return ipcRenderer.invoke(CH_CONFLICT_RESOLVE, conflictId, winner);
  },

  listConflicts(): Promise<IPCResponse> {
    return ipcRenderer.invoke(CH_CONFLICT_LIST);
  },

  getConflictDetail(conflictId: string): Promise<IPCResponse> {
    return ipcRenderer.invoke(CH_CONFLICT_DETAIL, conflictId);
  },

  // ── Peer Management ──────────────────────────────────────────────────

  getPeers(): Promise<IPCResponse> {
    return ipcRenderer.invoke(CH_PEER_LIST);
  },

  connectToPeer(address: string, port: number): Promise<IPCResponse> {
    return ipcRenderer.invoke(CH_PEER_CONNECT, address, port);
  },

  // ── Vault & Network ──────────────────────────────────────────────────

  getVaultStatus(): Promise<IPCResponse<{ isRegistered: boolean, isUnlocked: boolean, nodeId: string | null }>> {
    return ipcRenderer.invoke(CH_VAULT_STATUS) as any;
  },

  genesisInit(pin: string): Promise<IPCResponse<{ nodeId: string }>> {
    return ipcRenderer.invoke(CH_VAULT_GENESIS, pin) as any;
  },

  unlockVault(pin: string): Promise<IPCResponse<{ success: boolean, nodeId?: string }>> {
    return ipcRenderer.invoke(CH_VAULT_UNLOCK, pin) as any;
  },

  lockVault(): Promise<IPCResponse<{ success: boolean }>> {
    return ipcRenderer.invoke(CH_VAULT_LOCK) as any;
  },

  factoryReset(): Promise<IPCResponse<{ success: boolean }>> {
    return ipcRenderer.invoke(CH_VAULT_FACTORY_RESET) as any;
  },

  getLanIp(): Promise<IPCResponse<string>> {
    return ipcRenderer.invoke(CH_NET_LAN_IP) as any;
  },

  // ── Push Event Listeners ─────────────────────────────────────────────

  onConflictDetected(
    listener: (payload: ConflictDetectedPayload) => void
  ): () => void {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      conflictId: string,
      fileId: number,
      summary: string
    ) => {
      listener({ conflictId, fileId, summary });
    };
    ipcRenderer.on(CH_EVT_CONFLICT, wrapped);

    // Return a typed unsubscribe function.
    return () => {
      ipcRenderer.off(CH_EVT_CONFLICT, wrapped);
    };
  },

  onSyncStatusChanged(
    listener: (payload: SyncStatusChangedPayload) => void
  ): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: SyncStatusChangedPayload) => {
      listener(payload);
    };
    ipcRenderer.on(CH_EVT_SYNC_STATUS, wrapped);

    return () => {
      ipcRenderer.off(CH_EVT_SYNC_STATUS, wrapped);
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Expose via contextBridge
//
// `exposeInMainWorld` serialises the bridge object through the context
// boundary. Only plain functions and primitives cross — no Node.js or
// Electron objects leak into the renderer world.
// ─────────────────────────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('docuSync', docuSyncBridge);

// ─────────────────────────────────────────────────────────────────────────────
// Global Type Augmentation
//
// Placed here so that TypeScript in the renderer (src/**) can use
// `window.docuSync` with full type safety by importing this file's types.
// The actual runtime binding is done by contextBridge above.
// ─────────────────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    /** The DocuSync secure IPC bridge. See {@link DocuSyncBridge}. */
    docuSync: DocuSyncBridge;
  }
}
