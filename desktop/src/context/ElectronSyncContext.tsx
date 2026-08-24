/**
 * @module ElectronSyncContext
 *
 * Provides real-time P2P sync state to the entire React renderer tree.
 *
 * This context is the Electron-native replacement for the legacy
 * Supabase-backed `SyncContext`. It connects to the DocuSync engine
 * exclusively through the secure `window.docuSync` bridge exposed by
 * `electron/preload.ts` — it never imports Electron directly.
 *
 * **State managed:**
 * - `syncStatus`       — current engine status (idle | syncing | conflict)
 * - `localNodeId`      — UUID of this Electron process as a P2P node
 * - `connectedPeers`   — array of peer node IDs currently online
 * - `vectorClock`      — serialised snapshot of the local vector clock
 * - `pendingConflicts` — count of unresolved conflicts waiting for owner
 *
 * **Push subscriptions (via preload bridge):**
 * - `evt:conflict-detected`  → increments `pendingConflicts`, shows toast
 * - `evt:sync-status-changed` → refreshes peer list and conflict count
 *
 * **Polling:**
 * A 10-second interval polls `sync:status` so the UI stays fresh even
 * without push events (e.g., peer connects while the app is in background).
 *
 * @packageDocumentation
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import type { ConflictDetectedPayload, SyncStatusChangedPayload } from '../../electron/preload';
import { notify } from '@docusync/shared/utils/notifications';
import { uGet, uSet, uRemove } from '../utils/userStorage';
import { WebRTCManager } from '@docusync/shared/engine/WebRTCManager';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * High-level sync state machine states.
 *
 * | State       | Meaning                                            |
 * |-------------|----------------------------------------------------|
 * | `idle`      | Engine running, all files converged.               |
 * | `syncing`   | Delta push / pull in progress with at least 1 peer.|
 * | `conflict`  | At least one unresolved concurrent edit conflict.  |
 * | `offline`   | No peers connected; working locally.               |
 * | `error`     | Engine failed to initialise or IPC call failed.   |
 */
export type SyncState = 'idle' | 'syncing' | 'conflict' | 'offline' | 'error';

/**
 * A pending conflict notification received from the engine.
 */
export interface PendingConflict {
  /** UUID of the conflict record in the SQLite Conflict table. */
  conflictId: string;
  /** File ID the conflict pertains to. */
  fileId: number;
  /** Human-readable description of the conflicting edits. */
  summary: string;
  /** Wall-clock time the notification was received. */
  receivedAt: Date;
}

export interface ConnectedPeerInfo {
  id: string;
  displayName: string;
  address: string;
  port: number;
}

export interface PeerRoom {
  id: string;
  name: string;
  otp?: string;
  isHost?: boolean;
}

/**
 * Shape of the context value exposed to consumer components.
 */
export interface ElectronSyncContextValue {
  /** Current engine state. */
  syncStatus: SyncState;
  /** UUID of this local P2P node. */
  localNodeId: string;
  /** Array of currently connected peers. */
  connectedPeers: ConnectedPeerInfo[];
  /** The current joined room. */
  currentRoom: PeerRoom | null;
  /** Sets the current joined room. */
  setCurrentRoom: (room: PeerRoom | null) => void;
  /** Whether the current user is an Admin */
  isAdmin: boolean;
  /** Set admin status */
  setIsAdmin: (isAdmin: boolean) => void;
  /**
   * Serialised vector clock snapshot from the last `sync:status` poll.
   * `null` if the engine hasn't responded yet.
   */
  vectorClock: Record<string, unknown> | null;
  /** Total count of unresolved conflicts. */
  pendingConflicts: number;
  /**
   * Full list of pending conflict notifications received since the
   * renderer opened. Use this to populate the `/conflicts` page.
   */
  conflictQueue: PendingConflict[];
  /**
   * Manually triggers a sync:status refresh from the engine.
   * Useful for pull-to-refresh UI patterns.
   */
  refreshStatus: () => Promise<void>;
  /**
   * Decrements `pendingConflicts` after the owner resolves a conflict.
   * Called by the ConflictsPage after a successful `resolveConflict` IPC.
   *
   * @param conflictId - UUID of the resolved conflict to remove from the queue.
   */
  markConflictResolved: (conflictId: string) => void;
  /**
   * Number of peers in the current room according to the Redis matchmaker.
   * This reflects cross-device joins (web, mobile, desktop) — unlike
   * `connectedPeers` which only counts active WebSocket connections.
   */
  matchmakerPeerCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

/** Interval for polling sync:status (ms). */
const POLL_INTERVAL_MS = 10_000;

const ElectronSyncContext = createContext<ElectronSyncContextValue | undefined>(
  undefined
);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Provides Electron P2P sync state to the React renderer tree.
 *
 * Place this inside `<ThemeProvider>` but outside any page components.
 *
 * @param children - Child React nodes.
 *
 * @example
 * ```tsx
 * <ThemeProvider>
 *   <ElectronSyncProvider>
 *     <RouterProvider router={router} />
 *   </ElectronSyncProvider>
 * </ThemeProvider>
 * ```
 */
export const ElectronSyncProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [syncStatus, setSyncStatus]       = useState<SyncState>('idle');
  const [localNodeId, setLocalNodeId]     = useState<string>('');
  const [connectedPeers, setConnectedPeers] = useState<ConnectedPeerInfo[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    try {
      return uGet('is_admin') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      uSet('is_admin', isAdmin.toString());
    } catch {
      // ignore
    }
  }, [isAdmin]);

  const [currentRoom, setCurrentRoom] = useState<PeerRoom | null>(() => {
    try {
      const saved = uGet('current_room');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  
  useEffect(() => {
    try {
      if (currentRoom) {
        uSet('current_room', JSON.stringify(currentRoom));
      } else {
        uRemove('current_room');
      }
    } catch {
      // ignore
    }
  }, [currentRoom]);

  const [vectorClock, setVectorClock]     = useState<Record<string, unknown> | null>(null);
  const [pendingConflicts, setPendingConflicts] = useState<number>(0);
  const [conflictQueue, setConflictQueue] = useState<PendingConflict[]>([]);
  const [matchmakerPeerCount, setMatchmakerPeerCount] = useState<number>(0);

  /** Ref so interval callback always reads latest state without re-subscribing. */
  const stateRef = useRef({ pendingConflicts });
  stateRef.current = { pendingConflicts };

  const webRtcRef = useRef<WebRTCManager | null>(null);

  // ── Fetch sync status from engine ────────────────────────────────────────

  /**
   * Calls `sync:status` IPC and updates all derived state.
   *
   * Safe to call repeatedly — errors are caught and reflected in `syncStatus`.
   */
  const refreshStatus = useCallback(async () => {
    // Guard: preload bridge may not be injected in plain browser dev mode.
    if (!window.docuSync) return;

    try {
      const res = await window.docuSync.getSyncStatus();

      if (!res.success || !res.data) {
        setSyncStatus('error');
        return;
      }

      const data = res.data as {
        localNodeId: string;
        vectorClock: Record<string, unknown>;
        connectedPeers: ConnectedPeerInfo[];
        pendingConflicts: number;
      };

      setLocalNodeId(data.localNodeId ?? '');
      setVectorClock(data.vectorClock ?? null);
      setConnectedPeers(data.connectedPeers ?? []);

      // Derive sync state from peer count and conflict count.
      const peers = data.connectedPeers ?? [];
      const conflicts = data.pendingConflicts ?? 0;

      setPendingConflicts(conflicts);

      if (conflicts > 0) {
        setSyncStatus('conflict');
      } else if (peers.length === 0) {
        setSyncStatus('offline');
      } else {
        setSyncStatus('idle');
      }
    } catch {
      setSyncStatus('error');
    }
  }, []);

  // ── Poll matchmaker for offline conflicts ────────────────────────────────
  useEffect(() => {
    const _WEB_BASE = import.meta.env.VITE_WEB_URL
      || (import.meta.env.DEV ? 'http://localhost:3000' : 'https://docusync-pnc.vercel.app');
    const MATCHMAKER_CONFLICTS = `${_WEB_BASE}/api/lobby/conflicts`;

    const pollConflicts = async () => {
      if (typeof window !== 'undefined' && !navigator.onLine) return;
      const roomOtp = currentRoom?.otp || currentRoom?.id;
      if (!roomOtp || roomOtp.startsWith('direct-')) return;
      
      try {
        const res = await fetch(`${MATCHMAKER_CONFLICTS}?otp=${roomOtp}`);
        if (res.ok) {
          const data = await res.json();
          if (data.conflicts && Array.isArray(data.conflicts) && data.conflicts.length > 0) {
            let imported = false;
            for (const conflict of data.conflicts) {
              const result = await window.docuSync?.importConflict(conflict);
              if (result?.success) {
                imported = true;
                // Delete conflict from Matchmaker after successfully importing
                await fetch(`${MATCHMAKER_CONFLICTS}?otp=${roomOtp}&conflictId=${conflict.conflictId}`, {
                  method: 'DELETE'
                }).catch(() => {});
              }
            }
            if (imported) {
              refreshStatus(); // Refresh UI to show red badge
            }
          }
        }
      } catch (e) {
        console.error('Failed to poll Matchmaker conflicts', e);
      }
    };

    pollConflicts();
    const iv = setInterval(pollConflicts, 5_000);
    return () => clearInterval(iv);
  }, [currentRoom, refreshStatus]);

  // ── WebRTC Signaling & Connection ──────────────────────────────────────────
  useEffect(() => {
    if (!currentRoom || !localNodeId) return;
    const roomOtp = currentRoom.otp || currentRoom.id;
    if (roomOtp.startsWith('direct-')) return;

    const _WEB_BASE = import.meta.env.VITE_WEB_URL
      || (import.meta.env.DEV ? 'http://localhost:3000' : 'https://docusync-pnc.vercel.app');
    const MATCHMAKER_SIGNAL = `${_WEB_BASE}/api/lobby/signal`;

    const manager = new WebRTCManager(MATCHMAKER_SIGNAL, roomOtp, localNodeId);
    
    manager.onMessage = (peerId, msg) => {
      window.docuSync?.handlePeerMessage(peerId, JSON.stringify(msg));
    };

    manager.startSignaling();
    webRtcRef.current = manager;

    return () => {
      manager.disconnectAll();
      webRtcRef.current = null;
    };
  }, [currentRoom, localNodeId]);

  // ── Route outgoing peer messages to WebRTC ───────────────────────────────
  useEffect(() => {
    if (!window.docuSync) return;
    return window.docuSync.onSendPeerMessage((peerId, msgStr) => {
      if (webRtcRef.current) {
        try {
          const msg = JSON.parse(msgStr);
          webRtcRef.current.sendTo(peerId, msg);
        } catch {}
      }
    });
  }, []);

  // ── Poll matchmaker for cross-device peer count and WebRTC mesh ──────────
  useEffect(() => {
    const _WEB_BASE = import.meta.env.VITE_WEB_URL
      || (import.meta.env.DEV ? 'http://localhost:3000' : 'https://docusync-pnc.vercel.app');
    const MATCHMAKER = `${_WEB_BASE}/api/lobby`;

    const pollMatchmaker = async () => {
      if (typeof window !== 'undefined' && !navigator.onLine) return;
      const roomOtp = currentRoom?.otp || currentRoom?.id;
      if (!roomOtp || roomOtp.startsWith('direct-')) return;
      try {
        const res = await fetch(`${MATCHMAKER}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otp: roomOtp, nodeId: localNodeId }), // include nodeId to register self
        });
        if (res.ok) {
          const data = await res.json();
          if (typeof data.memberCount === 'number') {
            setMatchmakerPeerCount(data.memberCount);
          }
          if (Array.isArray(data.members) && webRtcRef.current) {
            // WebRTC Mesh logic: To prevent duplicate connections, 
            // only the node with the "greater" ID initiates the offer.
            for (const member of data.members) {
              if (member.nodeId && member.nodeId > localNodeId) {
                webRtcRef.current.connectToPeer(member.nodeId);
              }
            }
          }
        }
      } catch { /* Redis unreachable — keep last known count */ }
    };

    pollMatchmaker();
    const iv = setInterval(pollMatchmaker, 10_000);
    return () => clearInterval(iv);
  }, [currentRoom, localNodeId]);


  // ── Fetch sync status from engine ────────────────────────────────────────

  /**
   * Calls `sync:status` IPC and updates all derived state.
   *
   * Safe to call repeatedly — errors are caught and reflected in `syncStatus`.
   */
  const refreshStatus = useCallback(async () => {
    // Guard: preload bridge may not be injected in plain browser dev mode.
    if (!window.docuSync) return;

    try {
      const res = await window.docuSync.getSyncStatus();

      if (!res.success || !res.data) {
        setSyncStatus('error');
        return;
      }

      const data = res.data as {
        localNodeId: string;
        vectorClock: Record<string, unknown>;
        connectedPeers: ConnectedPeerInfo[];
        pendingConflicts: number;
      };

      setLocalNodeId(data.localNodeId ?? '');
      setVectorClock(data.vectorClock ?? null);
      setConnectedPeers(data.connectedPeers ?? []);

      // Derive sync state from peer count and conflict count.
      const peers = data.connectedPeers ?? [];
      const conflicts = data.pendingConflicts ?? 0;

      setPendingConflicts(conflicts);

      if (conflicts > 0) {
        setSyncStatus('conflict');
      } else if (peers.length === 0) {
        setSyncStatus('offline');
      } else {
        setSyncStatus('idle');
      }
    } catch {
      setSyncStatus('error');
    }
  }, []);

  // ── Polling ───────────────────────────────────────────────────────────────

  useEffect(() => {
    // Initial fetch on mount.
    refreshStatus();

    const interval = setInterval(refreshStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  // ── Push: conflict-detected ───────────────────────────────────────────────

  useEffect(() => {
    if (!window.docuSync) return;

    /**
     * Handles an `evt:conflict-detected` push from the main process.
     *
     * - Adds the conflict to the queue for the ConflictsPage.
     * - Increments `pendingConflicts`.
     * - Transitions `syncStatus` to `'conflict'`.
     */
    const unsub = window.docuSync.onConflictDetected(
      (payload: ConflictDetectedPayload) => {
        const entry: PendingConflict = {
          conflictId: payload.conflictId,
          fileId:     payload.fileId,
          summary:    payload.summary,
          receivedAt: new Date(),
        };

        setConflictQueue((prev) => {
          // Deduplicate: ignore if conflictId already in queue.
          if (prev.some((c) => c.conflictId === entry.conflictId)) return prev;
          return [entry, ...prev];
        });

        setPendingConflicts((prev) => prev + 1);
        setSyncStatus('conflict');

        console.warn(
          `[SyncContext] Conflict detected: ${payload.conflictId} on file ${payload.fileId}`
        );
      }
    );

    return unsub;
  }, []);

  // ── Push: merge-accepted ──────────────────────────────────────────────────
  
  useEffect(() => {
    if (!window.docuSync?.onMergeAccepted) return;

    const unsub = window.docuSync.onMergeAccepted((conflictId, resolvedBy) => {
      notify.success(`Conflict resolved by ${resolvedBy.slice(0, 8)}. File synced.`);
      // Optionally refresh status
      refreshStatus();
    });

    return unsub;
  }, [refreshStatus]);

  // ── Push: sync-status-changed ─────────────────────────────────────────────

  useEffect(() => {
    if (!window.docuSync) return;

    /**
     * Handles `evt:sync-status-changed` push events.
     *
     * Re-fetches full status rather than trusting partial push data,
     * ensuring all derived state stays consistent.
     */
    const unsub = window.docuSync.onSyncStatusChanged(
      (_payload: SyncStatusChangedPayload) => {
        refreshStatus();
      }
    );

    return unsub;
  }, [refreshStatus]);

  // ── Actions ───────────────────────────────────────────────────────────────

  /**
   * Removes a resolved conflict from the queue and decrements the counter.
   *
   * @param conflictId - UUID of the conflict that was resolved.
   */
  const markConflictResolved = useCallback((conflictId: string) => {
    setConflictQueue((prev) => prev.filter((c) => c.conflictId !== conflictId));
    setPendingConflicts((prev) => Math.max(0, prev - 1));
  }, []);

  // ── Push: evt:session-terminated ──────────────────────────────────────────

  useEffect(() => {
    if (!window.docuSync) return;

    const unsubscribe = window.docuSync.onSessionTerminated((reason) => {
      console.log(`[SyncContext] Session terminated: ${reason}`);
      setCurrentRoom(null);
      setConnectedPeers([]);
      setSyncStatus('offline');
    });

    return unsubscribe;
  }, []);

  // ── Push: peer-updated ────────────────────────────────────────────────────

  useEffect(() => {
    if (!window.docuSync?.onPeerUpdated) return;

    const unsubscribe = window.docuSync.onPeerUpdated(() => {
      console.log(`[SyncContext] Peer updated pushed, refreshing...`);
      refreshStatus();
    });

    return unsubscribe;
  }, [refreshStatus]);

  return (
    <ElectronSyncContext.Provider
      value={{
        syncStatus,
        localNodeId,
        connectedPeers,
        currentRoom,
        setCurrentRoom,
        isAdmin,
        setIsAdmin,
        vectorClock,
        pendingConflicts,
        conflictQueue,
        refreshStatus,
        markConflictResolved,
        matchmakerPeerCount,
      }}
    >
      {children}
    </ElectronSyncContext.Provider>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the Electron sync state and helpers from the nearest
 * {@link ElectronSyncProvider}.
 *
 * @throws {Error} If called outside an `ElectronSyncProvider`.
 *
 * @example
 * ```tsx
 * const { syncStatus, pendingConflicts, connectedPeers } = useElectronSync();
 * ```
 */
export function useElectronSync(): ElectronSyncContextValue {
  const ctx = useContext(ElectronSyncContext);
  if (!ctx) {
    throw new Error(
      'useElectronSync must be used within an <ElectronSyncProvider>.'
    );
  }
  return ctx;
}
