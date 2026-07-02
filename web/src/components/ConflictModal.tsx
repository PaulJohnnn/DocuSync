'use client';
/**
 * @module ConflictModal
 * Phase 5 conflict resolution modal.
 * Shown when syncState === 'conflict'.
 * Matches Phase 5 diagram: "Data Collision → Escalate to Owner → Accept/Reject → Workspace Updated → Clear Local Cache"
 */
import React, { useState } from 'react';
import { useSyncState } from '@/context/SyncStateContext';

export default function ConflictModal() {
  const { syncState, conflict, resolveConflict } = useSyncState();
  const [resolving, setResolving] = useState<'accept' | 'reject' | null>(null);
  const [resolved, setResolved] = useState(false);

  if (syncState !== 'conflict' || !conflict) return null;

  const handleResolve = async (choice: 'accept' | 'reject') => {
    setResolving(choice);
    await new Promise(res => setTimeout(res, 1200));
    setResolved(true);
    await new Promise(res => setTimeout(res, 1000));
    resolveConflict(choice);
    setResolving(null);
    setResolved(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      padding: '20px',
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 600,
        boxShadow: '0 20px 80px rgba(0,0,0,0.25)',
        animation: 'modalIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          background: 'linear-gradient(135deg, rgba(239,68,68,0.06) 0%, rgba(249,115,22,0.04) 100%)',
          borderBottom: '1px solid rgba(239,68,68,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, background: 'rgba(239,68,68,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>Conflict Detected</h2>
              <p style={{ fontSize: 12, color: '#64748b' }}>
                A data collision was detected in{' '}
                <code style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>
                  {conflict.fileName}
                </code>
                . LWW arbitration could not resolve it automatically.
              </p>
            </div>
          </div>
        </div>

        {/* Conflict context */}
        <div style={{ padding: '16px 24px 0' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
            background: 'rgba(239,68,68,0.04)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.12)',
            marginBottom: 16, fontSize: 12, color: '#dc2626',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Conflict Engine evaluated timestamps — simultaneous edits from <strong style={{ marginLeft: 3 }}>{conflict.peerName}</strong> could not be auto-merged.
          </div>

          {/* Side-by-side diff */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              { label: '📄 Your Version', content: conflict.yourVersion, color: '#4f46e5', bg: 'rgba(79,70,229,0.04)', border: 'rgba(79,70,229,0.15)' },
              { label: `📄 ${conflict.peerName}`, content: conflict.peerVersion, color: '#ea580c', bg: 'rgba(234,88,12,0.04)', border: 'rgba(234,88,12,0.15)' },
            ].map(v => (
              <div key={v.label} style={{
                borderRadius: 10, border: `1.5px solid ${v.border}`,
                background: v.bg, overflow: 'hidden',
              }}>
                <div style={{ padding: '8px 12px', borderBottom: `1px solid ${v.border}`, fontSize: 11, fontWeight: 700, color: v.color }}>
                  {v.label}
                </div>
                <pre style={{
                  margin: 0, padding: '10px 12px', fontSize: 11, lineHeight: 1.6,
                  color: '#374151', fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  maxHeight: 140, overflowY: 'auto', background: 'transparent',
                }}>
                  {v.content}
                </pre>
              </div>
            ))}
          </div>

          {/* Phase 5 flow note */}
          <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 11, color: '#64748b', marginBottom: 16, lineHeight: 1.6 }}>
            <strong style={{ color: '#475569' }}>As document owner, you must decide:</strong>{' '}
            Accept Merge applies the combined peer version. Reject &amp; Keep Mine discards peer changes and updates global workspace state.
          </div>
        </div>

        {/* Resolved state */}
        {resolved && (
          <div style={{ padding: '0 24px 16px', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, color: '#16a34a', fontWeight: 600 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Workspace state updated. Clearing local cache…
            </div>
          </div>
        )}

        {/* Actions */}
        {!resolved && (
          <div style={{ padding: '0 24px 20px', display: 'flex', gap: 10 }}>
            <button
              onClick={() => handleResolve('reject')}
              disabled={!!resolving}
              style={{
                flex: 1, padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                background: resolving === 'reject' ? '#fecaca' : '#fff',
                color: '#dc2626', border: '2px solid #fca5a5', cursor: resolving ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s',
              }}
            >
              {resolving === 'reject' ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
                  </svg>
                  Applying…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  Reject &amp; Keep Mine
                </>
              )}
            </button>
            <button
              onClick={() => handleResolve('accept')}
              disabled={!!resolving}
              style={{
                flex: 1, padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                background: resolving === 'accept' ? '#bbf7d0' : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                color: resolving === 'accept' ? '#166534' : '#fff', border: 'none',
                cursor: resolving ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: resolving ? 'none' : '0 4px 14px rgba(22,163,74,0.3)',
                transition: 'all 0.2s',
              }}
            >
              {resolving === 'accept' ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
                  </svg>
                  Merging…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Accept Merge
                </>
              )}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes modalIn { from{opacity:0;transform:scale(0.92) translateY(16px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}
