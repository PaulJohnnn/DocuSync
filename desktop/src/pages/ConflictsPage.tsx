/**
 * @module ConflictsPage
 * Conflict resolution hub — route `/conflicts`.
 * Refactored: uses ConflictService. No inline IPC calls.
 * Buttons renamed Accept / Reject per manuscript spec.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useElectronSync, type PendingConflict } from '@/context/ElectronSyncContext';
import { IconAlertTriangle, IconRefresh, IconArrowLeft, IconShield, IconZap, IconCheck } from '@/components/Icons';
import ConflictService, { type ConflictRecord } from '@/services/ConflictService';
import { ServiceError } from '@/services/errors/ServiceError';
import { notify } from '@docusync/shared/utils/notifications';

// ── Types ────────────────────────────────────────────────────────────────────

interface ConflictDetail extends Omit<ConflictRecord, 'detectedAt'> {
  summary: string;
  detectedAt: Date;
  resolving: boolean;
}

interface DiffLine {
  type: 'equal' | 'delete' | 'insert';
  text: string;
  lineNumA: number | null;
  lineNumB: number | null;
}

// ── Diff Engine ───────────────────────────────────────────────────────────────

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

// ── DiffView ──────────────────────────────────────────────────────────────────

const DiffView: React.FC<{ lines: DiffLine[] }> = ({ lines }) => {
  if (lines.length === 0) return (
    <div style={{ padding: '1rem', color: 'var(--ds-text3)', fontSize: '0.8rem', textAlign: 'center' }}>No differences — files are identical.</div>
  );
  const sideA = lines.filter(l => l.type === 'equal' || l.type === 'delete');
  const sideB = lines.filter(l => l.type === 'equal' || l.type === 'insert');
  return (
    <div className="ds-diff-container">
      <div className="ds-diff-side">
        <div className="ds-diff-header" style={{ color: 'var(--ds-red)', background: 'var(--ds-red-bg)' }}>Side A — Original</div>
        {sideA.map((line, i) => <div key={i} className={`ds-diff-line ${line.type === 'delete' ? 'ds-diff-line-del' : ''}`}>{line.text || '\u00A0'}</div>)}
      </div>
      <div className="ds-diff-side">
        <div className="ds-diff-header" style={{ color: 'var(--ds-green)', background: 'var(--ds-green-bg)' }}>Side B — Incoming</div>
        {sideB.map((line, i) => <div key={i} className={`ds-diff-line ${line.type === 'insert' ? 'ds-diff-line-ins' : ''}`}>{line.text || '\u00A0'}</div>)}
      </div>
    </div>
  );
};

// ── ConflictCard ──────────────────────────────────────────────────────────────

const ConflictCard: React.FC<{
  conflict: ConflictDetail;
  onAccept: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}> = ({ conflict, onAccept, onReject }) => {
  const diffLines = useMemo(() => lineDiff(conflict.payloadA, conflict.payloadB), [conflict.payloadA, conflict.payloadB]);
  const lwwWinner: 'A' | 'B' = conflict.logicalTimestampA >= conflict.logicalTimestampB ? 'A' : 'B';
  const delCount = diffLines.filter(l => l.type === 'delete').length;
  const insCount = diffLines.filter(l => l.type === 'insert').length;

  return (
    <article className="ds-card" style={{ overflow: 'hidden', opacity: conflict.resolving ? 0.6 : 1 }}>
      {/* Card header */}
      <div style={{ background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ds-badge ds-badge-red" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 9 }}>CONFLICT</span>
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>File #{conflict.fileId}</span>
          <IconAlertTriangle size={14} style={{ color: 'var(--red)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{conflict.detectedAt.toLocaleString()}</span>
          <code style={{ fontSize: 10, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', padding: '2px 7px', borderRadius: 4 }}>{conflict.conflictId.slice(0, 10)}…</code>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <span className="ds-badge ds-badge-red">−{delCount} deleted</span>
          <span className="ds-badge ds-badge-green">+{insCount} added</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div style={{ background: 'var(--red-light)', border: '1px solid var(--red-border)', borderRadius: 8, padding: '6px 10px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Original · Node A</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conflict.nodeIdA}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>ts={conflict.logicalTimestampA}</div>
          </div>
          <div style={{ background: 'var(--green-light)', border: '1px solid var(--green-border)', borderRadius: 8, padding: '6px 10px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Incoming · Node B</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conflict.nodeIdB}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>ts={conflict.logicalTimestampB}</div>
          </div>
        </div>
        <DiffView lines={diffLines} />
      </div>

      {/* Action bar — Accept / Reject (manuscript terminology) */}
      <div style={{ background: 'var(--bg-sidebar)', borderTop: '1px solid var(--border)', padding: '10px 16px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="ds-btn ds-btn-ghost" disabled={conflict.resolving} onClick={() => onReject(conflict.conflictId)} style={{ fontSize: 12, height: 32 }}>
          <IconShield size={13} /> Reject (Keep Original)
        </button>
        <button
          className="ds-btn"
          disabled={conflict.resolving}
          onClick={() => lwwWinner === 'B' ? onAccept(conflict.conflictId) : onReject(conflict.conflictId)}
          title={`LWW Auto: Side ${lwwWinner} wins`}
          style={{ fontSize: 12, height: 32, background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--border-accent)' }}
        >
          <IconZap size={13} /> ⚡ LWW Auto
          <span style={{ fontSize: 9, background: 'rgba(79,125,248,0.25)', borderRadius: 3, padding: '0 4px', marginLeft: 2 }}>→ {lwwWinner}</span>
        </button>
        <button className="ds-btn ds-btn-success" disabled={conflict.resolving} onClick={() => onAccept(conflict.conflictId)} style={{ fontSize: 12, height: 32 }}>
          <IconCheck size={13} /> Accept (Apply Incoming)
        </button>
        {conflict.resolving && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>Resolving…</span>}
      </div>
    </article>
  );
};

// ── ConflictsPage ─────────────────────────────────────────────────────────────

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

  const handleAccept = useCallback(async (conflictId: string) => {
    setResolving(conflictId, true);
    try {
      await ConflictService.accept(conflictId);
      markConflictResolved(conflictId);
      notify.success('Change accepted — incoming version applied.');
    } catch (err) {
      notify.error(err instanceof ServiceError ? err.message : String(err));
      setResolving(conflictId, false);
    }
  }, [markConflictResolved]);

  const handleReject = useCallback(async (conflictId: string) => {
    setResolving(conflictId, true);
    try {
      await ConflictService.reject(conflictId);
      markConflictResolved(conflictId);
      notify.success('Change rejected — original version kept.');
    } catch (err) {
      notify.error(err instanceof ServiceError ? err.message : String(err));
      setResolving(conflictId, false);
    }
  }, [markConflictResolved]);

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
          <div className="ds-banner ds-banner-amber" style={{ borderRadius: '0 var(--r-md) var(--r-md) 0' }}>
            <span style={{ fontSize: '1.1rem' }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{pendingConflicts} conflict{pendingConflicts !== 1 ? 's' : ''} require your review</div>
              <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 2, opacity: 0.8 }}>As the document owner, Accept or Reject each change before it propagates to peers.</div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {sorted.length === 0 && (
          <div className="ds-empty" style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>All conflicts resolved</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 360, margin: '0 auto 24px', lineHeight: 1.7 }}>
              No pending conflicts. The LWW resolver will notify you if concurrent edits create a conflict.
            </p>
            <button className="ds-btn ds-btn-primary" onClick={() => navigate('/')}>Back to Files</button>
          </div>
        )}

        {/* Conflict cards */}
        {sorted.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {sorted.map(c => (
              <ConflictCard
                key={c.conflictId}
                conflict={c}
                onAccept={handleAccept}
                onReject={handleReject}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default ConflictsPage;
