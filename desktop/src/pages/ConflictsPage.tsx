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
          ? `<mark style="background:rgba(239,68,68,0.18);color:#ef4444;border-radius:3px;padding:0 3px;text-decoration:line-through">${w}</mark>`
          : w
      ).join(' ');

  const highlightedB = wordsB.length === 0
    ? '<em style="color:var(--text-muted)">(empty)</em>'
    : wordsB.map((w, idx) =>
        addSet.has(idx)
          ? `<mark style="background:rgba(34,197,94,0.18);color:#16a34a;border-radius:3px;padding:0 3px;font-weight:600">${w}</mark>`
          : w
      ).join(' ');

  return { highlightedA, highlightedB, deletedCount: delSet.size, addedCount: addSet.size };
}

function extractNodeId(summary: string, side: 'A' | 'B'): string {
  const match = summary.match(/([a-f0-9-]{8,})\s+vs\s+([a-f0-9-]{8,})/i);
  if (!match) return side === 'A' ? 'node-A' : 'node-B';
  return side === 'A' ? match[1] : match[2];
}

// ── SplitHtmlDiff ─────────────────────────────────────────────────────────────

const SplitHtmlDiff: React.FC<{
  htmlA: string; htmlB: string;
  nodeIdA: string; nodeIdB: string;
  tsA: number; tsB: number;
}> = ({ htmlA, htmlB, nodeIdA, nodeIdB, tsA, tsB }) => {
  const { highlightedA, highlightedB, deletedCount, addedCount } = useMemo(
    () => computeWordDiff(htmlA, htmlB), [htmlA, htmlB]
  );
  const isIdentical = deletedCount === 0 && addedCount === 0;
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
    padding: '12px 14px', flex: 1, overflowY: 'auto', maxHeight: 260,
    fontSize: 12, lineHeight: 1.7, color: 'var(--text-primary)', background: 'var(--bg-card)',
  };

  if (isIdentical) return (
    <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center',
      background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8 }}>
      ✅ Files are identical — no differences detected.
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
        <span style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>
          −{deletedCount} word{deletedCount !== 1 ? 's' : ''} removed (local)
        </span>
        <span style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>
          +{addedCount} word{addedCount !== 1 ? 's' : ''} added (updated)
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={panelStyle}>
          <div style={headerStyle('#ef4444', 'rgba(239,68,68,0.06)')}>
            <span>📱 Your Local Version</span>
            <span style={{ fontWeight: 400, opacity: 0.8 }}>Node: {nodeIdA.slice(0,12)}… · ts={tsA}</span>
          </div>
          <div style={bodyStyle} dangerouslySetInnerHTML={{ __html: highlightedA }} />
        </div>

        <div style={panelStyle}>
          <div style={headerStyle('#16a34a', 'rgba(34,197,94,0.06)')}>
            <span>🌐 Updated Version</span>
            <span style={{ fontWeight: 400, opacity: 0.8 }}>Node: {nodeIdB.slice(0,12)}… · ts={tsB}</span>
          </div>
          <div style={bodyStyle} dangerouslySetInnerHTML={{ __html: highlightedB }} />
        </div>
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
        🔴 Red strikethrough = words in your local version not in the updated file &nbsp;·&nbsp;
        🟢 Green bold = words added in the updated version
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
  const lwwWinner: 'A' | 'B' = conflict.logicalTimestampA >= conflict.logicalTimestampB ? 'A' : 'B';

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
        <SplitHtmlDiff
          htmlA={conflict.payloadA}
          htmlB={conflict.payloadB}
          nodeIdA={conflict.nodeIdA}
          nodeIdB={conflict.nodeIdB}
          tsA={conflict.logicalTimestampA}
          tsB={conflict.logicalTimestampB}
        />
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
  const { conflictQueue, pendingConflicts, markConflictResolved, refreshStatus, currentRoom, localNodeId } = useElectronSync();
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

  const _WEB_BASE = (typeof import.meta !== 'undefined' && import.meta.env.VITE_WEB_URL)
    ? import.meta.env.VITE_WEB_URL
    : (typeof import.meta !== 'undefined' && import.meta.env.DEV)
      ? 'http://localhost:3000'
      : 'https://docusync-pnc.vercel.app';
  const MATCHMAKER = `${_WEB_BASE}/api/lobby`;

  const pushResolutionToMatchmaker = async (conflictId: string, winner: 'A' | 'B') => {
    const detail = details.get(conflictId);
    if (!detail) return;
    
    const otp = currentRoom?.id || currentRoom?.otp;
    if (!otp) return;

    const winnerPayload = winner === 'A' ? detail.payloadA : detail.payloadB;
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

  const handleAccept = useCallback(async (conflictId: string) => {
    setResolving(conflictId, true);
    try {
      await ConflictService.accept(conflictId);
      markConflictResolved(conflictId);
      await pushResolutionToMatchmaker(conflictId, 'B'); // Incoming wins
      notify.success('Change accepted — incoming version applied and synced.');
    } catch (err) {
      notify.error(err instanceof ServiceError ? err.message : String(err));
      setResolving(conflictId, false);
    }
  }, [markConflictResolved, currentRoom, details, localNodeId]);

  const handleReject = useCallback(async (conflictId: string) => {
    setResolving(conflictId, true);
    try {
      await ConflictService.reject(conflictId);
      markConflictResolved(conflictId);
      await pushResolutionToMatchmaker(conflictId, 'A'); // Original wins
      notify.success('Change rejected — original version kept and synced.');
    } catch (err) {
      notify.error(err instanceof ServiceError ? err.message : String(err));
      setResolving(conflictId, false);
    }
  }, [markConflictResolved, currentRoom, details, localNodeId]);

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
