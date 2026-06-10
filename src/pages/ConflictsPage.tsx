/**
 * @module ConflictsPage
 * Conflict resolution hub — route `/conflicts`.
 * Amber banner, red-bordered conflict cards, side-by-side diff, 3 action buttons.
 * All IPC logic preserved from original implementation.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useElectronSync, type PendingConflict } from '@/context/ElectronSyncContext';
import { IconAlertTriangle, IconRefresh, IconArrowLeft, IconShield, IconZap, IconCheck } from '@/components/Icons';

// ── Types ───────────────────────────────────────────────────────────────────

interface ConflictDetail {
  conflictId: string;
  fileId: number;
  summary: string;
  nodeIdA: string;
  nodeIdB: string;
  payloadA: string;
  payloadB: string;
  logicalTimestampA: number;
  logicalTimestampB: number;
  detectedAt: Date;
  resolving: boolean;
}

interface DiffLine {
  type: 'equal' | 'delete' | 'insert';
  text: string;
  lineNumA: number | null;
  lineNumB: number | null;
}

// ── Diff Engine ─────────────────────────────────────────────────────────────

function lcs(a: string[], b: string[]): string[] {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1]);
  const result: string[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i-1] === b[j-1]) { result.unshift(a[i-1]); i--; j--; }
    else if (dp[i-1][j] >= dp[i][j-1]) i--;
    else j--;
  }
  return result;
}

function lineDiff(textA: string, textB: string): DiffLine[] {
  const linesA = textA.split('\n'), linesB = textB.split('\n');
  const common = lcs(linesA, linesB);
  const result: DiffLine[] = [];
  let ci = 0, ai = 0, bi = 0, lnA = 1, lnB = 1;
  while (ai < linesA.length || bi < linesB.length) {
    const aLine = linesA[ai], bLine = linesB[bi], cLine = common[ci];
    if (ai < linesA.length && aLine === cLine && bi < linesB.length && bLine === cLine) {
      result.push({ type: 'equal', text: aLine, lineNumA: lnA++, lineNumB: lnB++ }); ai++; bi++; ci++;
    } else if (ai < linesA.length && aLine !== cLine) {
      result.push({ type: 'delete', text: aLine, lineNumA: lnA++, lineNumB: null }); ai++;
    } else if (bi < linesB.length && bLine !== cLine) {
      result.push({ type: 'insert', text: bLine, lineNumA: null, lineNumB: lnB++ }); bi++;
    } else break;
  }
  return result;
}

function extractNodeId(summary: string, side: 'A' | 'B'): string {
  const match = summary.match(/([a-f0-9-]{8,})\s+vs\s+([a-f0-9-]{8,})/i);
  if (!match) return side === 'A' ? 'node-A' : 'node-B';
  return side === 'A' ? match[1] : match[2];
}

// ── Side-by-side DiffView ───────────────────────────────────────────────────

const DiffView: React.FC<{ lines: DiffLine[] }> = ({ lines }) => {
  if (lines.length === 0) return (
    <div style={{ padding: '1rem', color: 'var(--ds-text3)', fontSize: '0.8rem', textAlign: 'center' }}>
      No differences — files are identical.
    </div>
  );

  const sideA = lines.filter(l => l.type === 'equal' || l.type === 'delete');
  const sideB = lines.filter(l => l.type === 'equal' || l.type === 'insert');

  return (
    <div className="ds-diff-container">
      {/* Side A */}
      <div className="ds-diff-side">
        <div className="ds-diff-header" style={{ color: 'var(--ds-red)', background: 'var(--ds-red-bg)' }}>
          Side A — Original
        </div>
        {sideA.map((line, i) => (
          <div key={i} className={`ds-diff-line ${line.type === 'delete' ? 'ds-diff-line-del' : ''}`}>
            {line.text || '\u00A0'}
          </div>
        ))}
      </div>
      {/* Side B */}
      <div className="ds-diff-side">
        <div className="ds-diff-header" style={{ color: 'var(--ds-green)', background: 'var(--ds-green-bg)' }}>
          Side B — Incoming
        </div>
        {sideB.map((line, i) => (
          <div key={i} className={`ds-diff-line ${line.type === 'insert' ? 'ds-diff-line-ins' : ''}`}>
            {line.text || '\u00A0'}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── ConflictCard ────────────────────────────────────────────────────────────

const ConflictCard: React.FC<{
  conflict: ConflictDetail;
  onResolve: (id: string, winner: 'A' | 'B') => Promise<void>;
}> = ({ conflict, onResolve }) => {
  const diffLines = useMemo(() => lineDiff(conflict.payloadA, conflict.payloadB), [conflict.payloadA, conflict.payloadB]);
  const lwwWinner: 'A' | 'B' = conflict.logicalTimestampA >= conflict.logicalTimestampB ? 'A' : 'B';
  const delCount = diffLines.filter(l => l.type === 'delete').length;
  const insCount = diffLines.filter(l => l.type === 'insert').length;

  return (
    <article className="ds-card" style={{
      padding: '1.25rem', opacity: conflict.resolving ? 0.6 : 1,
      border: '1px solid var(--ds-red-border)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--ds-red)' }}><IconAlertTriangle size={16} /></span>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>File #{conflict.fileId}</h3>
            <span className="ds-badge ds-badge-red">Pending</span>
          </div>
          <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.7rem' }}>
            <span style={{ color: 'var(--ds-text3)' }}>Detected: {conflict.detectedAt.toLocaleString()}</span>
            <span style={{ color: 'var(--ds-red)' }}>−{delCount}</span>
            <span style={{ color: 'var(--ds-green)' }}>+{insCount}</span>
          </div>
        </div>
        <code style={{ fontSize: '0.62rem', color: 'var(--ds-text3)', background: 'var(--ds-bg3)', padding: '2px 8px', borderRadius: 'var(--ds-radius-sm)' }}>
          {conflict.conflictId.slice(0, 12)}…
        </code>
      </div>

      {/* Node attribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div style={{ background: 'var(--ds-red-bg)', border: '1px solid var(--ds-red-border)', borderRadius: 'var(--ds-radius-sm)', padding: '0.4rem 0.65rem' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--ds-red)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Side A — Original</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--ds-text2)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conflict.nodeIdA}</div>
          <div style={{ fontSize: '0.62rem', color: 'var(--ds-text3)' }}>ts={conflict.logicalTimestampA}</div>
        </div>
        <div style={{ background: 'var(--ds-green-bg)', border: '1px solid var(--ds-green-border)', borderRadius: 'var(--ds-radius-sm)', padding: '0.4rem 0.65rem' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--ds-green)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Side B — Incoming</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--ds-text2)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conflict.nodeIdB}</div>
          <div style={{ fontSize: '0.62rem', color: 'var(--ds-text3)' }}>ts={conflict.logicalTimestampB}</div>
        </div>
      </div>

      {/* Diff */}
      <div style={{ marginBottom: '1rem' }}>
        <DiffView lines={diffLines} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid var(--ds-border)', paddingTop: '0.75rem' }}>
        <button className="ds-btn ds-btn-ghost" disabled={conflict.resolving} onClick={() => onResolve(conflict.conflictId, 'A')} title="Keep Side A">
          <IconShield size={14} /> Keep Original
        </button>
        <button className="ds-btn ds-btn-primary" disabled={conflict.resolving} onClick={() => onResolve(conflict.conflictId, lwwWinner)}
          title={`LWW: Side ${lwwWinner} wins (ts=${lwwWinner === 'A' ? conflict.logicalTimestampA : conflict.logicalTimestampB})`}>
          <IconZap size={14} /> LWW Auto-Merge
          <span style={{ fontSize: '0.62rem', background: 'rgba(255,255,255,.18)', borderRadius: 3, padding: '0 4px', marginLeft: 2 }}>→ {lwwWinner}</span>
        </button>
        <button className="ds-btn ds-btn-success" disabled={conflict.resolving} onClick={() => onResolve(conflict.conflictId, 'B')} title="Accept Side B">
          <IconCheck size={14} /> Accept Change
        </button>
        {conflict.resolving && <span style={{ fontSize: '0.72rem', color: 'var(--ds-text3)', marginLeft: 'auto' }}>Resolving…</span>}
      </div>
    </article>
  );
};

// ── ConflictsPage ───────────────────────────────────────────────────────────

const ConflictsPage: React.FC = () => {
  const navigate = useNavigate();
  const { conflictQueue, pendingConflicts, markConflictResolved, refreshStatus } = useElectronSync();
  const [details, setDetails] = useState<Map<string, ConflictDetail>>(new Map());

  const buildFallbackDetail = useCallback((conflict: PendingConflict): ConflictDetail => ({
    conflictId: conflict.conflictId, fileId: conflict.fileId, summary: conflict.summary,
    nodeIdA: extractNodeId(conflict.summary, 'A'), nodeIdB: extractNodeId(conflict.summary, 'B'),
    payloadA: '(Could not load original content)', payloadB: '(Could not load incoming content)',
    logicalTimestampA: 0, logicalTimestampB: 1, detectedAt: conflict.receivedAt, resolving: false,
  }), []);

  // Load from DB on mount
  useEffect(() => {
    refreshStatus();
    if (!window.docuSync?.listConflicts) return;
    (async () => {
      try {
        const resp = await window.docuSync.listConflicts();
        if (resp.success && (resp as any).data?.conflicts) {
          const conflicts = (resp as any).data.conflicts as any[];
          setDetails(prev => {
            const next = new Map(prev);
            for (const c of conflicts) {
              if (!next.has(c.conflictId)) {
                next.set(c.conflictId, {
                  conflictId: c.conflictId, fileId: c.fileId,
                  summary: `${c.nodeIdA.slice(0,8)} vs ${c.nodeIdB.slice(0,8)}`,
                  nodeIdA: c.nodeIdA, nodeIdB: c.nodeIdB, payloadA: c.payloadA, payloadB: c.payloadB,
                  logicalTimestampA: c.logicalTimestampA, logicalTimestampB: c.logicalTimestampB,
                  detectedAt: new Date(c.detectedAt), resolving: false,
                });
              }
            }
            return next;
          });
        }
      } catch (err) { console.warn('[ConflictsPage] list failed:', err); }
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
        if (window.docuSync?.getConflictDetail) {
          try {
            const resp = await window.docuSync.getConflictDetail(conflict.conflictId);
            if (!cancelled && resp.success && (resp as any).data) {
              const c = (resp as any).data;
              next.set(conflict.conflictId, {
                conflictId: c.conflictId, fileId: c.fileId, summary: conflict.summary,
                nodeIdA: c.nodeIdA, nodeIdB: c.nodeIdB, payloadA: c.payloadA, payloadB: c.payloadB,
                logicalTimestampA: c.logicalTimestampA ?? 0, logicalTimestampB: c.logicalTimestampB ?? 1,
                detectedAt: new Date(c.detectedAt), resolving: false,
              });
              changed = true; continue;
            }
          } catch { /* fallback */ }
        }
        if (!cancelled) { next.set(conflict.conflictId, buildFallbackDetail(conflict)); changed = true; }
      }
      for (const key of next.keys()) {
        if (!conflictQueue.some(c => c.conflictId === key)) { next.delete(key); changed = true; }
      }
      if (changed && !cancelled) setDetails(next);
    })();
    return () => { cancelled = true; };
  }, [conflictQueue, buildFallbackDetail]);

  const handleResolve = useCallback(async (conflictId: string, winner: 'A' | 'B') => {
    if (!window.docuSync) { toast.error('IPC bridge not available.'); return; }
    setDetails(prev => { const next = new Map(prev); const e = next.get(conflictId); if (e) next.set(conflictId, { ...e, resolving: true }); return next; });
    try {
      const res = await window.docuSync.resolveConflict(conflictId, winner);
      if (!res.success) throw new Error(res.error ?? 'Unknown error.');
      markConflictResolved(conflictId);
      toast.success(`Resolved — ${winner === 'A' ? 'Original kept' : 'Change accepted'}.`);
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
      setDetails(prev => { const next = new Map(prev); const e = next.get(conflictId); if (e) next.set(conflictId, { ...e, resolving: false }); return next; });
    }
  }, [markConflictResolved, details]);

  const sorted = useMemo(() => [...details.values()].sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime()), [details]);

  return (
    <>
      {/* Topbar */}
      <div className="ds-topbar">
        <button className="ds-btn ds-btn-ghost" onClick={() => navigate('/')}><IconArrowLeft size={14} /> Files</button>
        <span className="ds-topbar-title">Conflict Resolution</span>
        {pendingConflicts > 0 && <span className="ds-badge ds-badge-red">{pendingConflicts} pending</span>}
        <div className="ds-topbar-actions">
          <button className="ds-btn ds-btn-ghost" onClick={refreshStatus}><IconRefresh size={14} /> Refresh</button>
        </div>
      </div>

      <div className="ds-main-scroll ds-page-enter" style={{ maxWidth: 900, margin: '0 auto', width: '100%' }}>
        {/* Amber banner */}
        {pendingConflicts > 0 && (
          <div className="ds-banner ds-banner-amber">
            <span style={{ fontSize: '1.1rem' }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{pendingConflicts} conflict{pendingConflicts !== 1 ? 's' : ''} requiring review</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ds-text2)', marginTop: '2px' }}>
                As repository owner, choose a winner for each concurrent edit.
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {sorted.length === 0 && (
          <div className="ds-empty" style={{ background: 'var(--ds-surface)', borderRadius: 'var(--ds-radius-lg)', border: '1px solid var(--ds-border)' }}>
            <div className="ds-empty-icon">✅</div>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No conflicts detected</h2>
            <p style={{ color: 'var(--ds-text2)', fontSize: '0.82rem', maxWidth: 360, margin: '0 auto 1.5rem' }}>
              All files converged. The LWW resolver will notify you if concurrent edits create a conflict.
            </p>
            <button className="ds-btn ds-btn-primary" onClick={() => navigate('/')}>Back to Files</button>
          </div>
        )}

        {/* Conflict cards */}
        {sorted.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {sorted.map(c => <ConflictCard key={c.conflictId} conflict={c} onResolve={handleResolve} />)}
          </div>
        )}
      </div>
    </>
  );
};

export default ConflictsPage;
