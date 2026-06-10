"use strict";
const electron = require("electron");
const CH_FILE_OPEN = "file:open";
const CH_FILE_SAVE = "file:save";
const CH_FILE_HISTORY = "file:history";
const CH_FILE_RESTORE = "file:restore";
const CH_SYNC_STATUS = "sync:status";
const CH_SYNC_TRIGGER = "sync:trigger";
const CH_CONFLICT_LIST = "conflict:list";
const CH_CONFLICT_DETAIL = "conflict:detail";
const CH_CONFLICT_RESOLVE = "conflict:resolve";
const CH_PEER_LIST = "peer:list";
const CH_PEER_CONNECT = "peer:connect";
const CH_EVT_CONFLICT = "conflict:detected";
const CH_EVT_SYNC_STATUS = "evt:sync-status-changed";
const docuSyncBridge = {
  // ── File Operations ──────────────────────────────────────────────────
  openFile(filePathOrId) {
    return electron.ipcRenderer.invoke(CH_FILE_OPEN, filePathOrId);
  },
  saveFile(fileId, newContent) {
    return electron.ipcRenderer.invoke(CH_FILE_SAVE, fileId, newContent);
  },
  getHistory(fileId) {
    return electron.ipcRenderer.invoke(CH_FILE_HISTORY, fileId);
  },
  restoreVersion(fileId, eventId) {
    return electron.ipcRenderer.invoke(CH_FILE_RESTORE, fileId, eventId);
  },
  // ── Sync Operations ──────────────────────────────────────────────────
  getSyncStatus() {
    return electron.ipcRenderer.invoke(CH_SYNC_STATUS);
  },
  triggerSync() {
    return electron.ipcRenderer.invoke(CH_SYNC_TRIGGER);
  },
  // ── Conflict Resolution ──────────────────────────────────────────────
  resolveConflict(conflictId, winner) {
    return electron.ipcRenderer.invoke(CH_CONFLICT_RESOLVE, conflictId, winner);
  },
  listConflicts() {
    return electron.ipcRenderer.invoke(CH_CONFLICT_LIST);
  },
  getConflictDetail(conflictId) {
    return electron.ipcRenderer.invoke(CH_CONFLICT_DETAIL, conflictId);
  },
  // ── Peer Management ──────────────────────────────────────────────────
  getPeers() {
    return electron.ipcRenderer.invoke(CH_PEER_LIST);
  },
  connectToPeer(address, port) {
    return electron.ipcRenderer.invoke(CH_PEER_CONNECT, address, port);
  },
  // ── Push Event Listeners ─────────────────────────────────────────────
  onConflictDetected(listener) {
    const wrapped = (_event, conflictId, fileId, summary) => {
      listener({ conflictId, fileId, summary });
    };
    electron.ipcRenderer.on(CH_EVT_CONFLICT, wrapped);
    return () => {
      electron.ipcRenderer.off(CH_EVT_CONFLICT, wrapped);
    };
  },
  onSyncStatusChanged(listener) {
    const wrapped = (_event, payload) => {
      listener(payload);
    };
    electron.ipcRenderer.on(CH_EVT_SYNC_STATUS, wrapped);
    return () => {
      electron.ipcRenderer.off(CH_EVT_SYNC_STATUS, wrapped);
    };
  }
};
electron.contextBridge.exposeInMainWorld("docuSync", docuSyncBridge);
