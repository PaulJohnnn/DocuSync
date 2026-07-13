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
const CH_PEER_CONNECT_SUPABASE = 'peer:connect-supabase' as const;
const CH_SYNC_CURSOR_PUSH = 'sync:cursor-push' as const;
const CH_VAULT_STATUS    = 'vault:get-status' as const;
const CH_VAULT_GENESIS   = 'vault:genesis-init' as const;
const CH_VAULT_UNLOCK    = 'vault:unlock'     as const;
const CH_VAULT_LOCK      = 'vault:lock'       as const;
const CH_VAULT_FACTORY_RESET = 'vault:factory-reset' as const;
const CH_NET_LAN_IP      = 'network:get-lan-ip' as const;
const CH_SESSION_TERMINATE = 'session:terminate' as const;
const CH_FILE_CHECKOUT   = 'file:checkout'     as const;
const CH_ADMIN_LOG       = 'admin:get-activity-log' as const;
const CH_CACHE_CLEANUP   = 'cache:auto-cleanup' as const;
const CH_CACHE_SIZE      = 'cache:get-size'     as const;

/** Main-to-renderer push channels (one-way, main → renderer). */
const CH_EVT_CONFLICT    = 'conflict:detected'  as const;
const CH_EVT_MERGE_ACCEPTED = 'evt:merge-accepted' as const;
const CH_EVT_SYNC_STATUS = 'evt:sync-status-changed' as const;
const CH_EVT_AUTH_VERIFY_REQ = 'auth:verify-request' as const;
const CH_AUTH_VERIFY_RESP = 'auth:verify-respond' as const;
const CH_EVT_SESSION_TERMINATED = 'evt:session-terminated' as const;
const EVT_PEER_UPDATED    = 'evt:peer-updated'   as const;
const EVT_CURSOR_UPDATE   = 'evt:cursor-update'  as const;
const CH_EVT_SEND_PEER_MESSAGE = 'evt:send-peer-message' as const;

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
  // ── User Settings ────────────────────────────────────────────────────────

  /**
   * Updates the display name for the local peer.
   *
   * @param name - The new display name.
   */
  setDisplayName(name: string): Promise<IPCResponse>;

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
   * Imports a file from the room memory into the local system.
   *
   * @param fileName - The original file name.
   * @param content - The file content as a string.
   * @returns IPCResponse containing `{ fileId, filePath, fileName, content, extension, sizeBytes }`.
   */
  importRoomFile(fileName: string, content: string, fileId?: number): Promise<IPCResponse>;

  /**
   * Saves updated content to an open file, computes a delta, appends
   * an event to the EventLog, and broadcasts a DELTA_PUSH to all peers.
   *
   * @param fileId     - The file ID from a prior `openFile` call.
   * @param newContent - The updated document content.
   * @returns IPCResponse containing `{ fileId, saved, synced, deltaSizeBytes, peersNotified }`.
   */
  saveFile(fileId: number, newContent: string, vectorClockJson: any): Promise<IPCResponse>;

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
  connectToPeer(address: string, port: number): Promise<IPCResponse<{ connectedPeers: string[] }>>;

  /**
   * Sends a message from the Renderer's WebRTC layer to the Main process PeerManager.
   */
  handlePeerMessage(peerId: string, msgStr: string): Promise<IPCResponse<{ handled: boolean }>>;

  /**
   * Connects to a peer via Supabase Realtime channel.
   * 
   * @param otp - The OTP of the room.
   * @returns IPCResponse containing `{ connected, otp, connectedPeers }`.
   */
  connectToSupabase(otp: string): Promise<IPCResponse>;

  /**
   * Broadcasts the local cursor position.
   */
  pushCursor(msg: any): Promise<IPCResponse<void>>;

  // ── Vault & Network ──────────────────────────────────────────────────

  getVaultStatus(): Promise<IPCResponse<{ isRegistered: boolean, isUnlocked: boolean, nodeId: string | null }>>;
  genesisInit(pin: string): Promise<IPCResponse<{ nodeId: string }>>;
  unlockVault(pin: string): Promise<IPCResponse<{ success: boolean, nodeId?: string }>>;
  lockVault(): Promise<IPCResponse<{ success: boolean }>>;
  factoryReset(): Promise<IPCResponse<{ success: boolean }>>;
  getLanIp(): Promise<IPCResponse<string>>;
  respondVerifyRequest: (reqId: string, nodeId: string, allow: boolean) => Promise<IPCResponse<void>>;

  /**
   * (Admin) Broadcasts a SESSION_TERMINATED event to all peers and closes the connection.
   */
  terminateSession: () => Promise<IPCResponse<void>>;

  /**
   * Saves a physical copy of an open file to a user-chosen path via Save dialog.
   * Logs a CHECK_OUT event to the EventLog.
   */
  checkoutFile: (fileId: number) => Promise<IPCResponse<{ saved: boolean; destPath: string }>>;

  /**
   * Fetches the last 50 EventLog entries for the Admin Dashboard.
   */
  getAdminActivityLog: () => Promise<IPCResponse<{ entries: unknown[] }>>;

  /**
   * Deletes compacted EventLog rows older than 30 days when the table exceeds 1000 rows.
   */
  cacheAutoCleanup: () => Promise<IPCResponse<{ deletedCount: number; totalBefore: number; totalAfter: number }>>;

  /**
   * Returns the current EventLog row count.
   */
  getCacheSize: () => Promise<IPCResponse<{ rowCount: number }>>;

  /**
   * (Admin) Responds to a pending verify request.
   */
  respondToVerifyRequest: (reqId: string, allow: boolean) => Promise<IPCResponse<void>>;

  // ── Push Event Listeners ──────────────────────────────────────────────

  /**
   * Subscribes to conflict detection events pushed from the main process.
   *
   * @param listener - Callback receiving the conflict payload.
   * @returns Unsubscribe function.
   *
   * @example
   * ```ts
   * const unsub = window.docuSync.onConflictDetected((payload) => {
   *   console.log('Conflict on file:', payload.fileId);
   * });
   * // Later: unsub();
   * ```
   */
  onConflictDetected(
    listener: (payload: ConflictDetectedPayload) => void
  ): () => void;

  /**
   * Subscribes to merge acceptance events pushed from the main process.
   * 
   * @param listener - Callback receiving conflictId and resolvedBy
   */
  onMergeAccepted(
    listener: (conflictId: string, resolvedBy: string) => void
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

  /**
   * Registers a listener for new login attempt verification requests.
   * 
   * @param listener - Callback receiving the reqId and nodeId.
   * @returns Unsubscribe function to remove the listener.
   */
  onVerifyRequest: (
    listener: (reqId: string, nodeId: string) => void
  ) => () => void;

  /**
   * Called when the session is terminated.
   */
  onSessionTerminated: (
    callback: (reason: string) => void
  ) => () => void;

  /**
   * Called when the PeerManager wants to send a message to a WebRTC peer.
   */
  onSendPeerMessage: (
    callback: (peerId: string, msgStr: string) => void
  ) => () => void;

  /**
   * Triggered when the peer list updates (e.g. drop connection).
   */
  onPeerUpdated: (
    listener: () => void
  ) => () => void;

  /**
   * Called when a remote cursor update is received.
   */
  onCursorUpdate(
    callback: (msg: any) => void
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
  // ── User Settings ──
  setDisplayName(name: string): Promise<IPCResponse> {
    return ipcRenderer.invoke('user:set-name', name);
  },

  // ── File Operations ──────────────────────────────────────────────────

  openFile(filePathOrId?: string | number): Promise<IPCResponse> {
    return ipcRenderer.invoke(CH_FILE_OPEN, filePathOrId);
  },

  importRoomFile(fileName: string, content: string, fileId?: number): Promise<IPCResponse> {
    return ipcRenderer.invoke('file:import-room-file', fileName, content, fileId);
  },

  saveFile(fileId: number, newContent: string, vectorClockJson: any): Promise<IPCResponse> {
    return ipcRenderer.invoke(CH_FILE_SAVE, fileId, newContent, vectorClockJson);
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

  connectToPeer(address: string, port: number): Promise<IPCResponse<{ connectedPeers: string[] }>> {
    return ipcRenderer.invoke(CH_PEER_CONNECT, address, port);
  },

  connectToSupabase(otp: string): Promise<IPCResponse> {
    return ipcRenderer.invoke(CH_PEER_CONNECT_SUPABASE, otp);
  },

  handlePeerMessage: async (peerId, msgStr) => {
    return await ipcRenderer.invoke('sync:handle-peer-message', peerId, msgStr);
  },

  pushCursor(msg: any): Promise<IPCResponse<void>> {
    return ipcRenderer.invoke(CH_SYNC_CURSOR_PUSH, msg);
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

  respondVerifyRequest(reqId: string, nodeId: string, allow: boolean): Promise<IPCResponse<void>> {
    return ipcRenderer.invoke(CH_AUTH_VERIFY_RESP, reqId, nodeId, allow) as any;
  },

  terminateSession: async () => {
    return ipcRenderer.invoke(CH_SESSION_TERMINATE);
  },

  checkoutFile(fileId: number): Promise<IPCResponse<{ saved: boolean; destPath: string }>> {
    return ipcRenderer.invoke(CH_FILE_CHECKOUT, fileId) as any;
  },

  getAdminActivityLog(): Promise<IPCResponse<{ entries: unknown[] }>> {
    return ipcRenderer.invoke(CH_ADMIN_LOG) as any;
  },

  cacheAutoCleanup(): Promise<IPCResponse<{ deletedCount: number; totalBefore: number; totalAfter: number }>> {
    return ipcRenderer.invoke(CH_CACHE_CLEANUP) as any;
  },

  getCacheSize(): Promise<IPCResponse<{ rowCount: number }>> {
    return ipcRenderer.invoke(CH_CACHE_SIZE) as any;
  },

  respondToVerifyRequest(reqId: string, allow: boolean): Promise<IPCResponse<void>> {
    return ipcRenderer.invoke(CH_AUTH_VERIFY_RESP, reqId, allow) as any;
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

  onMergeAccepted(
    listener: (conflictId: string, resolvedBy: string) => void
  ): () => void {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      conflictId: string,
      resolvedBy: string
    ) => {
      listener(conflictId, resolvedBy);
    };
    ipcRenderer.on(CH_EVT_MERGE_ACCEPTED, wrapped);

    return () => {
      ipcRenderer.off(CH_EVT_MERGE_ACCEPTED, wrapped);
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

  onVerifyRequest(
    listener: (reqId: string, nodeId: string) => void
  ): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, reqId: string, nodeId: string) => {
      listener(reqId, nodeId);
    };
    ipcRenderer.on(CH_EVT_AUTH_VERIFY_REQ, wrapped);

    return () => {
      ipcRenderer.off(CH_EVT_AUTH_VERIFY_REQ, wrapped);
    };
  },

  onSessionTerminated: (callback) => {
    const wrapped = (_event: Electron.IpcRendererEvent, reason: string) => {
      callback(reason);
    };
    ipcRenderer.on(CH_EVT_SESSION_TERMINATED, wrapped);

    return () => {
      ipcRenderer.removeListener(CH_EVT_SESSION_TERMINATED, wrapped);
    };
  },

  onSendPeerMessage: (callback) => {
    const wrapped = (_event: Electron.IpcRendererEvent, peerId: string, msgStr: string) => {
      callback(peerId, msgStr);
    };
    ipcRenderer.on(CH_EVT_SEND_PEER_MESSAGE, wrapped);
    return () => {
      ipcRenderer.removeListener(CH_EVT_SEND_PEER_MESSAGE, wrapped);
    };
  },

  onPeerUpdated(
    listener: () => void
  ): () => void {
    const wrapped = () => {
      listener();
    };
    ipcRenderer.on(EVT_PEER_UPDATED, wrapped);

    return () => {
      ipcRenderer.off(EVT_PEER_UPDATED, wrapped);
    };
  },

  onCursorUpdate(
    callback: (msg: any) => void
  ): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, msg: any) => {
      callback(msg);
    };
    ipcRenderer.on(EVT_CURSOR_UPDATE, wrapped);
    return () => {
      ipcRenderer.removeListener(EVT_CURSOR_UPDATE, wrapped);
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
