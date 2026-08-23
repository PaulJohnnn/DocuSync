/**
 * @module ConflictsPage
 * Conflict resolution hub — route `/conflicts`.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useElectronSync, type PendingConflict } from '@/context/ElectronSyncContext';
import { IconAlertTriangle, IconRefresh, IconArrowLeft, IconShield, IconCheck, IconZap } from '@/components/Icons';
import ConflictService, { type ConflictRecord } from '@/services/ConflictService';
import { ServiceError } from '@/services/errors/ServiceError';
import { notify } from '@docusync/shared/utils/notifications';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

// ── Types ────────────────────────────────────────────────────────────────────

interface ConflictDetail extends Omit<ConflictRecord, 'detectedAt'> {
  summary: string;
  detectedAt: Date;
  resolving: boolean;
}

// ── Word-level diff engine ────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function computeWordDiff(htmlA: string, htmlB: string) {
  const wordsA = stripHtml(htmlA).split(/\s+/).filter(Boolean);
  const wordsB = stripHtml(htmlB).split(/\s+/).filter(Boolean);
  const m = wordsA.length, n = wordsB.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = wordsA[i-1] === wordsB[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1]);
  const delSet = new Set<number>(), addSet = new Set<number>();
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (wordsA[i-1] === wordsB[j-1]) { i--; j--; }
    else if (dp[i-1][j] >= dp[i][j-1]) { delSet.add(--i); }
    else { addSet.add(--j); }
  }
  while (i > 0) delSet.add(--i);
  while (j > 0) addSet.add(--j);

  const highlightedA = wordsA.length === 0
    ? '<em style="color:var(--text-muted)">(empty)</em>'
    : wordsA.map((w, idx) =>
        delSet.has(idx)
          ? `<mark style="background:rgba(234,179,8,0.25);color:#ca8a04;border-radius:3px;padding:0 3px;font-weight:600">${w}</mark>`
          : w
      ).join(' ');

  return { highlightedA, diffCount: delSet.size };
}

function extractNodeId(summary: string, side: 'A' | 'B'): string {
  const match = summary.match(/([a-f0-9-]{8,})\s+vs\s+([a-f0-9-]{8,})/i);
  if (!match) return side === 'A' ? 'node-A' : 'node-B';
  return side === 'A' ? match[1] : match[2];
}

// ── InteractiveConflictEditor ─────────────────────────────────────────────────

const InteractiveConflictEditor: React.FC<{
  conflict: ConflictDetail;
  onManualResolve: (id: string, customPayload: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}> = ({ conflict, onManualResolve, onReject }) => {
  const { highlightedA } = useMemo(() => computeWordDiff(conflict.payloadA, conflict.payloadB), [conflict.payloadA, conflict.payloadB]);

  const editor = useEditor({
    extensions: [StarterKit],
    content: conflict.payloadB,
  });

  const handleResolveClick = () => {
    if (window.confirm('Are you sure you want to save this merged file? This will overwrite the live document and resolve the conflict.')) {
      const html = editor?.getHTML() || '';
      onManualResolve(conflict.conflictId, html);
    }
  };

  const panelStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
    border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
  };
  const headerStyle = (color: string, bg: string): React.CSSProperties => ({
    padding: '7px 12px', fontSize: 11, fontWeight: 700,
    color, background: bg, borderBottom: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', gap: 2,
  });
  const bodyStyle: React.CSSProperties = {
    padding: '12px 14px', flex: 1, overflowY: 'auto', maxHeight: 360, minHeight: 260,
    fontSize: 12, lineHeight: 1.7, color: 'var(--text-primary)', background: 'var(--bg-card)',
  };

  return (
    <article className="ds-card" style={{ overflow: 'hidden', opacity: conflict.resolving ? 0.6 : 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header */}
      <div style={{ background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '-1rem -1rem 0 -1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ds-badge ds-badge-red" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 9 }}>CONFLICT RESOLUTION</span>
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>File #{conflict.fileId}</span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{conflict.detectedAt.toLocaleString()}</span>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        Your local edits (while offline) are highlighted in <strong style={{color: '#ca8a04', background: 'rgba(234,179,8,0.2)', padding: '2px 4px', borderRadius: 4}}>yellow</strong>. 
        Copy and paste any text you want to keep into the editable pane on the right, then click Resolve & Save.
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        <div style={panelStyle}>
          <div style={headerStyle('#ca8a04', 'rgba(234,179,8,0.06)')}>
            <span>Local Edits (Offline)</span>
            <span style={{ fontWeight: 400, opacity: 0.8 }}>Read-Only Reference</span>
          </div>
          <div style={bodyStyle} dangerouslySetInnerHTML={{ __html: highlightedA }} />
        </div>

        <div style={{...panelStyle, border: '1px solid var(--accent)', boxShadow: '0 0 0 1px var(--accent)' }}>
          <div style={headerStyle('var(--accent)', 'rgba(16,185,129,0.06)')}>
            <span>Current Online Version</span>
            <span style={{ fontWeight: 400, opacity: 0.8 }}>Editable</span>
          </div>
          <div style={{...bodyStyle, background: '#fff', cursor: 'text'}}>
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-sidebar)', borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 -1rem -1rem -1rem' }}>
        <button className="ds-btn ds-btn-ghost" disabled={conflict.resolving} onClick={() => onReject(conflict.conflictId)}>
          <IconShield size={13} /> Delete Conflict
        </button>
        <button className="ds-btn ds-btn-success" disabled={conflict.resolving} onClick={handleResolveClick} style={{ padding: '6px 24px' }}>
          <IconCheck size={14} /> Resolve & Save
        </button>
      </div>
    </article>
  );
};

// ── ConflictsPage ─────────────────────────────────────────────────────────────

const ConflictsPage: React.FC = () => {
  const navigate = useNavigate();
  const { conflictQueue, pendingConflicts, markConflictResolved, refreshStatus, currentRoom, localNodeId } = useElectronSync();
  const [details, setDetails] = useState<Map<string, ConflictDetail>>(new Map());
  const [selectedConflictId, setSelectedConflictId] = useState<string | null>(null);

  const buildFallbackDetail = useCallback((conflict: PendingConflict): ConflictDetail => ({
    conflictId: conflict.conflictId, fileId: conflict.fileId, summary: conflict.summary,
    nodeIdA: extractNodeId(conflict.summary, 'A'), nodeIdB: extractNodeId(conflict.summary, 'B'),
    payloadA: '(Could not load original content)', payloadB: '(Could not load incoming content)',
    logicalTimestampA: 0, logicalTimestampB: 1, detectedAt: conflict.receivedAt, resolving: false,
  }), []);

  // Load from DB on mount
  useEffect(() => {
    refreshStatus();
    (async () => {
      try {
        const conflicts = await ConflictService.list();
        setDetails(prev => {
          const next = new Map(prev);
          for (const c of conflicts) {
            if (!next.has(c.conflictId)) {
              next.set(c.conflictId, {
                ...c,
                summary: `${c.nodeIdA.slice(0,8)} vs ${c.nodeIdB.slice(0,8)}`,
                detectedAt: new Date(c.detectedAt),
                resolving: false,
              });
            }
          }
          return next;
        });
      } catch { /* silently ignore */ }
    })();
  }, []);

  // Hydrate from push queue
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = new Map(details);
      let changed = false;
      for (const conflict of conflictQueue) {
        if (next.has(conflict.conflictId)) continue;
        try {
          const detail = await ConflictService.getDetail(conflict.conflictId);
          if (!cancelled) {
            next.set(conflict.conflictId, { ...detail, summary: conflict.summary, detectedAt: new Date(detail.detectedAt), resolving: false });
            changed = true; continue;
          }
        } catch { /* fallback */ }
        if (!cancelled) { next.set(conflict.conflictId, buildFallbackDetail(conflict)); changed = true; }
      }
      for (const key of next.keys()) {
        if (!conflictQueue.some(c => c.conflictId === key)) { next.delete(key); changed = true; }
      }
      if (changed && !cancelled) setDetails(next);
    })();
    return () => { cancelled = true; };
  }, [conflictQueue, buildFallbackDetail]);

  const setResolving = (conflictId: string, value: boolean) => {
    setDetails(prev => {
      const next = new Map(prev);
      const e = next.get(conflictId);
      if (e) next.set(conflictId, { ...e, resolving: value });
      return next;
    });
  };

  const _WEB_BASE = (typeof import.meta !== 'undefined' && import.meta.env.VITE_WEB_URL)
    ? import.meta.env.VITE_WEB_URL
    : (typeof import.meta !== 'undefined' && import.meta.env.DEV)
      ? 'http://localhost:3000'
      : 'https://docusync-pnc.vercel.app';
  const MATCHMAKER = `${_WEB_BASE}/api/lobby`;

  const pushResolutionToMatchmaker = async (conflictId: string, customPayload?: string) => {
    const detail = details.get(conflictId);
    if (!detail) return;
    
    const otp = currentRoom?.id || currentRoom?.otp;
    if (!otp) return;

    // Use customPayload if manual resolve, else payloadA (for reject)
    const winnerPayload = customPayload !== undefined ? customPayload : detail.payloadA;
    const deltaSize = new Blob([winnerPayload]).size;

    try {
      await fetch(`${MATCHMAKER}/doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otp,
          fileId: detail.fileId,
          authorNodeId: localNodeId || 'host',
          authorName: 'Host (Auto-Merge)',
          content: winnerPayload,
          vectorClock: {},
          deltaSize,
        }),
      });
    } catch (e) {
      console.error('[Matchmaker] Failed to push conflict resolution:', e);
    }
  };

  const handleManualResolve = useCallback(async (conflictId: string, customPayload: string) => {
    setResolving(conflictId, true);
    try {
      const conflict = details.get(conflictId);
      await ConflictService.resolveManual(conflictId, customPayload);
      markConflictResolved(conflictId);
      
      // Push the manual resolution to the web app
      await pushResolutionToMatchmaker(conflictId, customPayload);

      // Auto-reject any older conflicts for this fileId
      if (conflict) {
        const olderConflicts = [...details.values()].filter(c => c.fileId === conflict.fileId && c.conflictId !== conflictId);
        for (const older of olderConflicts) {
          try {
            await ConflictService.reject(older.conflictId);
            markConflictResolved(older.conflictId);
          } catch (e) {
            console.error('Failed to auto-reject older conflict', e);
          }
        }
      }

      notify.success('Conflict resolved and synced.');
      setSelectedConflictId(null);
    } catch (err) {
      notify.error(err instanceof ServiceError ? err.message : String(err));
      setResolving(conflictId, false);
    }
  }, [markConflictResolved, details]);

  const handleReject = useCallback(async (conflictId: string) => {
    setResolving(conflictId, true);
    try {
      const conflict = details.get(conflictId);
      await ConflictService.reject(conflictId);
      markConflictResolved(conflictId);
      
      // Push the rejection (original A wins) to the web app
      await pushResolutionToMatchmaker(conflictId);
      
      if (conflict) {
        const olderConflicts = [...details.values()].filter(c => c.fileId === conflict.fileId && c.conflictId !== conflictId);
        for (const older of olderConflicts) {
          try {
            await ConflictService.reject(older.conflictId);
            markConflictResolved(older.conflictId);
          } catch (e) {
            console.error('Failed to auto-reject older conflict', e);
          }
        }
      }

      notify.success('Conflict deleted.');
      setSelectedConflictId(null);
    } catch (err) {
      notify.error(err instanceof ServiceError ? err.message : String(err));
      setResolving(conflictId, false);
    }
  }, [markConflictResolved, details]);

  // Group by fileId and show only the latest
  const groupedConflicts = useMemo(() => {
    const all = [...details.values()].sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
    const seen = new Set<string>();
    const grouped = [];
    for (const c of all) {
      if (!seen.has(String(c.fileId))) {
        seen.add(String(c.fileId));
        grouped.push(c);
      }
    }
    return grouped;
  }, [details]);

  return (
    <>
      <div className="ds-topbar">
        <button className="ds-btn ds-btn-ghost" onClick={() => navigate('/')}><IconArrowLeft size={14} /> Files</button>
        <span className="ds-topbar-title">Conflict Resolution</span>
        {groupedConflicts.length > 0 && <span className="ds-badge ds-badge-red">{groupedConflicts.length} pending</span>}
        <div className="ds-topbar-actions">
          <button className="ds-btn ds-btn-ghost" onClick={refreshStatus}><IconRefresh size={14} /> Refresh</button>
        </div>
      </div>

      <div className="ds-main-scroll ds-page-enter" style={{ maxWidth: 1000, margin: '0 auto', width: '100%' }}>
        {groupedConflicts.length === 0 && (
          <div className="ds-empty" style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>All conflicts resolved</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 360, margin: '0 auto 24px', lineHeight: 1.7 }}>
              No pending conflicts. The LWW resolver will notify you if concurrent edits create a conflict.
            </p>
            <button className="ds-btn ds-btn-primary" onClick={() => navigate('/')}>Back to Files</button>
          </div>
        )}

        {groupedConflicts.length > 0 && !selectedConflictId && (
          <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Room Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>File Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Conflict Time</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {groupedConflicts.map(c => (
                  <tr key={c.conflictId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px' }}>{currentRoom?.name || currentRoom?.id || 'Local Room'}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 500 }}>File #{c.fileId}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{c.detectedAt.toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button className="ds-btn ds-btn-primary" style={{ padding: '4px 12px', fontSize: 12, height: 'auto' }} onClick={() => setSelectedConflictId(c.conflictId)}>
                        Check
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {groupedConflicts.length > 0 && selectedConflictId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button className="ds-btn ds-btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setSelectedConflictId(null)}>
              <IconArrowLeft size={14} /> Back to List
            </button>
            {(() => {
              const selected = groupedConflicts.find(c => c.conflictId === selectedConflictId);
              return selected ? (
                <InteractiveConflictEditor
                  conflict={selected}
                  onManualResolve={handleManualResolve}
                  onReject={handleReject}
                />
              ) : (
                <div style={{ color: 'var(--red)' }}>Conflict not found or already resolved.</div>
              );
            })()}
          </div>
        )}
      </div>
    </>
  );
};

export default ConflictsPage;
