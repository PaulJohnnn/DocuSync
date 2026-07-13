'use client';
/**
 * @module DevSyncToggle
 * Developer tool for Phase 5 to manually trigger network states and conflicts.
 * Renders a small floating control panel in the bottom right.
 */
import React, { useState } from 'react';
import { useSyncState } from '@/context/SyncStateContext';

export default function DevSyncToggle() {
  const { syncState, simulateGoOffline, simulateReconnect, simulateConflict, simulateRapidFlicker } = useSyncState();
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
      boxShadow: '0 8px 30px rgba(0,0,0,0.12)', overflow: 'hidden',
      maxWidth: 280, width: '100%', fontFamily: "'Inter', sans-serif",
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', padding: '10px 14px', background: '#f8fafc', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 12, fontWeight: 700, color: '#475569',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 9.36l-7.1 7.1a1 1 0 0 1-1.41 0l-1.41-1.41a1 1 0 0 1 0-1.41l7.1-7.1a6 6 0 0 1 9.36-7.94l-3.77 3.77z" />
          </svg>
          Phase 5 Dev Tools
        </span>
        <span style={{ color: '#94a3b8' }}>{open ? '▼' : '▲'}</span>
      </button>

      {open && (
        <div style={{ padding: '14px', borderTop: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Simulate Network Events
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={simulateGoOffline}
              disabled={syncState === 'offline' || syncState === 'conflict'}
              style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: '#fff', color: '#dc2626', border: '1px solid #fecaca',
                cursor: (syncState === 'offline' || syncState === 'conflict') ? 'not-allowed' : 'pointer',
                opacity: (syncState === 'offline' || syncState === 'conflict') ? 0.5 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" /><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" /><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" /><path d="M10.71 5.05A16 16 0 0 1 22.58 9" /><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              </svg>
              Drop Connection
            </button>

            <button
              onClick={simulateReconnect}
              disabled={syncState !== 'offline'}
              style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: '#fff', color: '#d97706', border: '1px solid #fcd34d',
                cursor: syncState !== 'offline' ? 'not-allowed' : 'pointer',
                opacity: syncState !== 'offline' ? 0.5 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Reconnect (Auto-Merge)
            </button>

            <button
              onClick={simulateConflict}
              disabled={syncState === 'conflict'}
              style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: '#fff', color: '#ea580c', border: '1px solid #fdba74',
                cursor: syncState === 'conflict' ? 'not-allowed' : 'pointer',
                opacity: syncState === 'conflict' ? 0.5 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Force Sync Conflict
            </button>

            <button
              onClick={simulateRapidFlicker}
              style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                background: '#6366f1', color: '#fff', border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 4px rgba(99,102,241,0.2)'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Rapid Flicker Test (Off → Pulse → Off)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
