'use client';
/**
 * @module SyncStateContext (Web)
 * Central sync state machine for Phase 5 offline/sync UI.
 * Swap-in point: replace the DevSyncToggle with real network event listeners.
 *
 * State machine:
 *   online ↔ offline → syncing → synced (auto-merge) | conflict (manual review)
 */
import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';

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
  // Dev helpers
  simulateGoOffline: () => void;
  simulateReconnect: () => void;
  simulateConflict: () => void;
  resolveConflict: (choice: 'accept' | 'reject') => void;
}

const SyncStateContext = createContext<SyncStateContextValue>({
  syncState: 'online',
  conflict: null,
  pendingEdits: 0,
  setSyncState: () => {},
  simulateGoOffline: () => {},
  simulateReconnect: () => {},
  simulateConflict: () => {},
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

  const setSyncState = useCallback((s: SyncState) => {
    setSyncStateRaw(s);
    if (s !== 'offline') {
      setPendingEdits(0);
      if (pendingTimer.current) clearInterval(pendingTimer.current);
    }
  }, []);

  const simulateGoOffline = useCallback(() => {
    setSyncStateRaw('offline');
    setPendingEdits(0);
    // Simulate edits accumulating
    let count = 0;
    if (pendingTimer.current) clearInterval(pendingTimer.current);
    pendingTimer.current = setInterval(() => {
      count += Math.floor(Math.random() * 3) + 1;
      setPendingEdits(count);
    }, 1800);
  }, []);

  const simulateReconnect = useCallback(() => {
    if (pendingTimer.current) clearInterval(pendingTimer.current);
    setSyncStateRaw('syncing');
    setPendingEdits(0);
    // After 2s decide: 70% auto-merge, 30% conflict
    setTimeout(() => {
      const isConflict = Math.random() < 0.35;
      if (isConflict) {
        setConflict(MOCK_CONFLICT);
        setSyncStateRaw('conflict');
      } else {
        setSyncStateRaw('synced');
        setTimeout(() => setSyncStateRaw('online'), 4000);
      }
    }, 2200);
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
      simulateGoOffline, simulateReconnect, simulateConflict, resolveConflict,
    }}>
      {children}
    </SyncStateContext.Provider>
  );
}
