'use client';
/**
 * @module OfflineBanner
 * Shown when syncState === 'offline'.
 * Displays "Editing offline — N edits queued locally" and a Reconnect button.
 */
import React from 'react';
import { useSyncState } from '@/context/SyncStateContext';

export default function OfflineBanner() {
  const { syncState, pendingEdits, reconnect } = useSyncState();

  if (syncState !== 'offline') return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '10px 20px', flexWrap: 'wrap',
      background: 'linear-gradient(90deg, rgba(245,158,11,0.12) 0%, rgba(251,191,36,0.08) 100%)',
      borderBottom: '1px solid rgba(245,158,11,0.25)',
      animation: 'slideDown 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: 'rgba(245,158,11,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 6s4-2 11-2 11 2 11 2" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        </div>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
            Editing offline
          </span>
          <span style={{ fontSize: 12, color: '#b45309', marginLeft: 6 }}>
            — {pendingEdits > 0 ? `${pendingEdits} edit${pendingEdits !== 1 ? 's' : ''} queued locally` : 'Changes saved to local cache'}
          </span>
        </div>
      </div>
      <button
        onClick={reconnect}
        style={{
          padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
          background: '#d97706', color: '#fff', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 2px 8px rgba(217,119,6,0.3)',
          whiteSpace: 'nowrap',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
        Reconnect
      </button>
      <style>{`
        @keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}
