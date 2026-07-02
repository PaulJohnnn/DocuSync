'use client';
/**
 * @module OnlineStatusPill
 * Persistent sync-status indicator in the top bar.
 * Shows: Online (green) | Offline (red) | Syncing (amber spin) | Synced (green flash) | Conflict (red)
 */
import React from 'react';
import { useSyncState, type SyncState } from '@/context/SyncStateContext';

const CONFIG: Record<SyncState, { label: string; color: string; bg: string; border: string; spin?: boolean }> = {
  online:   { label: 'Online',     color: '#16a34a', bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.25)' },
  offline:  { label: 'Offline',    color: '#dc2626', bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.25)' },
  syncing:  { label: 'Syncing…',   color: '#d97706', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', spin: true },
  synced:   { label: 'Synced ✓',   color: '#16a34a', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.30)' },
  conflict: { label: '⚠ Conflict', color: '#dc2626', bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.30)' },
};

export default function OnlineStatusPill() {
  const { syncState } = useSyncState();
  const cfg = CONFIG[syncState];

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 20,
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      fontSize: 11, fontWeight: 700, color: cfg.color,
      letterSpacing: '0.01em', userSelect: 'none',
      transition: 'all 0.3s ease',
    }}>
      {cfg.spin ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={cfg.color} strokeWidth="3"
          style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
        </svg>
      ) : (
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0,
          animation: syncState === 'online' ? 'pulse-dot 2s ease-in-out infinite' : undefined,
        }} />
      )}
      {cfg.label}
      <style>{`
        @keyframes pulse-dot {
          0%,100%{opacity:1;transform:scale(1)}
          50%{opacity:0.6;transform:scale(0.8)}
        }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}
