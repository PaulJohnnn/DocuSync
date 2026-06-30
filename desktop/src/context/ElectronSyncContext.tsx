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
import { toast } from 'sonner';

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
      return localStorage.getItem('docusync_is_admin') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('docusync_is_admin', isAdmin.toString());
    } catch {
      // ignore
    }
  }, [isAdmin]);

  const [currentRoom, setCurrentRoom] = useState<PeerRoom | null>(() => {
    try {
      const saved = localStorage.getItem('docusync_current_room');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  
  useEffect(() => {
    try {
      if (currentRoom) {
        localStorage.setItem('docusync_current_room', JSON.stringify(currentRoom));
      } else {
        localStorage.removeItem('docusync_current_room');
      }
    } catch {
      // ignore
    }
  }, [currentRoom]);

  const [vectorClock, setVectorClock]     = useState<Record<string, unknown> | null>(null);
  const [pendingConflicts, setPendingConflicts] = useState<number>(0);
  const [conflictQueue, setConflictQueue] = useState<PendingConflict[]>([]);

  /** Ref so interval callback always reads latest state without re-subscribing. */
  const stateRef = useRef({ pendingConflicts });
  stateRef.current = { pendingConflicts };

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
      toast.success(`Conflict resolved by ${resolvedBy.slice(0, 8)}. File synced.`, {
        icon: '✅',
      });
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
