'use client';
/**
 * @module SyncStateContext (Web)
 * Central sync state machine for Phase 5 offline/sync UI.
 * Swap-in point: replace the DevSyncToggle with real network event listeners.
 *
 * State machine:
 *   online ↔ offline → syncing → synced (auto-merge) | conflict (manual review)
 */
import React, { createContext, useContext, useState, useCallback, useRef, ReactNode, useEffect } from 'react';

export type SyncState = 'online' | 'offline' | 'syncing' | 'synced' | 'conflict';

export interface ConflictInfo {
  fileName: string;
  yourVersion: string;
  peerVersion: string;
  peerName: string;
}

interface SyncStateContextValue {
  syncState: SyncState;
  conflict: ConflictInfo | null;
  pendingEdits: number;           // # of edits queued while offline
  setSyncState: (s: SyncState) => void;
  /**
   * Register a real flush callback for the manual Reconnect button.
   * The editor page calls this on mount so OfflineBanner can trigger the
   * actual saveFile(content, true) flush rather than the dev-only simulator.
   * Pass null to unregister (on editor unmount).
   */
  registerReconnectCallback: (fn: (() => Promise<void>) | null) => void;
  /** Called by OfflineBanner's Reconnect button — real flush if registered, else no-op. */
  reconnect: () => Promise<void>;
  // Dev helpers — kept intact; DevSyncToggle still uses these
  simulateGoOffline: () => void;
  simulateReconnect: () => void;
  simulateConflict: () => void;
  simulateRapidFlicker: () => void;
  resolveConflict: (choice: 'accept' | 'reject') => void;
}

const SyncStateContext = createContext<SyncStateContextValue>({
  syncState: 'online',
  conflict: null,
  pendingEdits: 0,
  setSyncState: () => {},
  registerReconnectCallback: () => {},
  reconnect: async () => {},
  simulateGoOffline: () => {},
  simulateReconnect: () => {},
  simulateConflict: () => {},
  simulateRapidFlicker: () => {},
  resolveConflict: () => {},
});

export function useSyncState() {
  return useContext(SyncStateContext);
}

const MOCK_CONFLICT: ConflictInfo = {
  fileName: 'thesis_chapter3.md',
  yourVersion: `# Chapter 3: Methodology\n\nThis chapter describes the P2P sync protocol...\n\n## Vector Clocks\nWe use Fidge-Mattern vector clocks...`,
  peerVersion: `# Chapter 3: Methodology\n\nThis chapter describes the P2P synchronization engine...\n\n## Vector Clocks\nVector clocks track causal ordering of events...`,
  peerName: 'Alice (Desktop)',
};

export function SyncStateProvider({ children }: { children: ReactNode }) {
  const [syncState, setSyncStateRaw] = useState<SyncState>('online');
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [pendingEdits, setPendingEdits] = useState(0);
  const pendingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Holds the real flush callback registered by the editor page.
  const reconnectCallbackRef = useRef<(() => Promise<void>) | null>(null);

  const setSyncState = useCallback((s: SyncState) => {
    setSyncStateRaw(s);
    if (s !== 'offline') {
      setPendingEdits(0);
      if (pendingTimer.current) clearInterval(pendingTimer.current);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleOffline = () => {
      setSyncStateRaw('offline');
      setPendingEdits(1); // Give it a count of 1 so the UI says "1 edit queued" if they type, or just let page.tsx handle it.
    };
    
    // We intentionally do NOT auto-reconnect on 'online'. 
    // We wait for the user to click the "Reconnect" button in the OfflineBanner, 
    // or we could auto-call reconnect(). Let's auto-call reconnect() after a short delay if they come back online.
    const handleOnline = () => {
      // Small delay to ensure network is fully stable
      setTimeout(() => {
        if (reconnectCallbackRef.current) {
          reconnect();
        } else {
          setSyncStateRaw('online');
        }
      }, 1500);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    // Initial check
    if (!navigator.onLine) {
      handleOffline();
    }

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const registerReconnectCallback = useCallback((fn: (() => Promise<void>) | null) => {
    reconnectCallbackRef.current = fn;
  }, []);

  /**
   * Called by OfflineBanner's "Reconnect" button.
   * If the editor has registered a real flush callback, call it (this triggers
   * saveFile(currentContent, true) with isOfflineReconnect: true via pushToHost).
   * Always clears the dev offline flag and transitions UI state to syncing/online.
   */
  const reconnect = useCallback(async () => {
    if (typeof window !== 'undefined') (window as any).__DOCUSYNC_DEV_OFFLINE__ = false;
    if (pendingTimer.current) clearInterval(pendingTimer.current);
    setSyncStateRaw('syncing');
    setPendingEdits(0);

    let foundOfflineEdits = false;
    try {
      const uGet = (k: string) => {
        try {
          const auth = sessionStorage.getItem('docusync_auth_user');
          const uid = auth ? (JSON.parse(auth).id || 'guest') : 'guest';
          const key = `ds_${uid}_${k}`;
          if (k === 'current_room') return sessionStorage.getItem(key);
          return localStorage.getItem(key);
        } catch { return null; }
      };

      const filesStr = uGet('files');
      const roomStr = uGet('current_room');
      
      if (filesStr && roomStr) {
        const files = JSON.parse(filesStr);
        const room = JSON.parse(roomStr);
        const otp = room.otp || room.id;
        let authNodeId = sessionStorage.getItem('docusync_node_id') || 'web-node';
        
        let needFilesUpdate = false;

        const syncPromises = files.map(async (f: any) => {
          if (f.hasPendingOfflineEdit) {
            foundOfflineEdits = true;
            try {
              const res = await fetch('/api/lobby/doc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  otp,
                  fileId: f.id,
                  authorNodeId: authNodeId,
                  authorName: authNodeId.slice(0, 8),
                  content: f.content,
                  isOfflineReconnect: true
                }),
              });

              if (res.ok) {
                const data = await res.json();
                f.hasPendingOfflineEdit = false;
                needFilesUpdate = true;
                if (data.escalated) {
                  const uSet = (k: string, v: string) => {
                    const uid = sessionStorage.getItem('docusync_auth_user') ? JSON.parse(sessionStorage.getItem('docusync_auth_user')!).id : 'guest';
                    localStorage.setItem(`ds_${uid}_${k}`, v);
                  };
                  const conflict = {
                    id: `web-conflict-${Date.now()}-${f.id}`,
                    fileId: String(f.id),
                    localContent: f.content,
                    serverContent: data.serverContent || data.content || '',
                    timestamp: Date.now()
                  };
                  let conflicts = [];
                  try {
                    const stored = uGet('docusync_web_conflicts');
                    if (stored) conflicts = JSON.parse(stored);
                  } catch (e) {}
                  conflicts.push(conflict);
                  uSet('docusync_web_conflicts', JSON.stringify(conflicts));
                }
              }
            } catch (err) {}
          }
        });

        await Promise.all(syncPromises);

        if (needFilesUpdate) {
          try {
            const auth = sessionStorage.getItem('docusync_auth_user');
            const uid = auth ? (JSON.parse(auth).id || 'guest') : 'guest';
            localStorage.setItem(`ds_${uid}_files`, JSON.stringify(files));
          } catch {}
        }
      }
    } catch (e) {
      console.error('[SyncStateContext] Error flushing offline queue:', e);
    }

    if (reconnectCallbackRef.current) {
      try {
        await reconnectCallbackRef.current();
      } catch (e) {
        console.error('[Reconnect] Flush callback threw:', e);
      }
    }

    setSyncStateRaw('synced');
    setTimeout(() => setSyncStateRaw('online'), foundOfflineEdits ? 1500 : 2500);
  }, []);

  // ── Dev-only helpers — unchanged, still used by DevSyncToggle ──────────────

  const simulateGoOffline = useCallback(() => {
    if (typeof window !== 'undefined') (window as any).__DOCUSYNC_DEV_OFFLINE__ = true;
    setSyncStateRaw('offline');
    setPendingEdits(0);
    if (pendingTimer.current) clearInterval(pendingTimer.current);
    let count = 0;
    pendingTimer.current = setInterval(() => {
      count += 1;
      setPendingEdits(count);
    }, 1800);
  }, []);

  const simulateReconnect = useCallback(() => {
    reconnect();
  }, [reconnect]);

  const simulateRapidFlicker = useCallback(() => {
    if (typeof window !== 'undefined') (window as any).__DOCUSYNC_DEV_OFFLINE__ = true;
    setSyncStateRaw('offline');
    setPendingEdits(1);
    console.log('[Phase 5 Dev Tools] Rapid Flicker Test Step 1: OFFLINE (Type edit 1 now)');

    setTimeout(() => {
      if (typeof window !== 'undefined') (window as any).__DOCUSYNC_DEV_OFFLINE__ = false;
      setSyncStateRaw('syncing');
      console.log('[Phase 5 Dev Tools] Rapid Flicker Test Step 2: BRIEF ONLINE PULSE');

      setTimeout(() => {
        if (typeof window !== 'undefined') (window as any).__DOCUSYNC_DEV_OFFLINE__ = true;
        setSyncStateRaw('offline');
        setPendingEdits(2);
        console.log('[Phase 5 Dev Tools] Rapid Flicker Test Step 3: OFFLINE AGAIN (Type edit 2 now)');

        setTimeout(() => {
          if (typeof window !== 'undefined') (window as any).__DOCUSYNC_DEV_OFFLINE__ = false;
          setSyncStateRaw('synced');
          setPendingEdits(0);
          console.log('[Phase 5 Dev Tools] Rapid Flicker Test Complete: FULLY RECONNECTED');
          setTimeout(() => setSyncStateRaw('online'), 2500);
        }, 4000);
      }, 1000);
    }, 4000);
  }, []);

  const simulateConflict = useCallback(() => {
    if (pendingTimer.current) clearInterval(pendingTimer.current);
    setConflict(MOCK_CONFLICT);
    setSyncStateRaw('conflict');
  }, []);

  const resolveConflict = useCallback((_choice: 'accept' | 'reject') => {
    setConflict(null);
    setSyncStateRaw('synced');
    setTimeout(() => setSyncStateRaw('online'), 3000);
  }, []);

  return (
    <SyncStateContext.Provider value={{
      syncState, conflict, pendingEdits, setSyncState,
      registerReconnectCallback, reconnect,
      simulateGoOffline, simulateReconnect, simulateConflict, simulateRapidFlicker, resolveConflict,
    }}>
      {children}
    </SyncStateContext.Provider>
  );
}
