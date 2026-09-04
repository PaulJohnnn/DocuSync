'use client';
import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { Shield, ArrowLeft } from 'lucide-react';
import { uGet, uSet, uRemove } from '@/lib/userStorage';
// ── Word-level diff engine (Match Desktop exactly) ────────────────────────────

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

// ── InteractiveConflictEditor (Ported from Desktop) ────────────────────────────

const InteractiveConflictEditor: React.FC<{
  fileId: string;
  payloadA: string;
  payloadB: string;
  timestamp: Date;
  onRestore: () => void;
  onReject: () => void;
  fileName: string;
}> = ({ fileId: _fileId, payloadA, payloadB, timestamp, onRestore, onReject, fileName }) => {
  const { highlightedA } = useMemo(() => computeWordDiff(payloadA, payloadB), [payloadA, payloadB]);

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
    <article className="ds-card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header */}
      <div style={{ background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '-1rem -1rem 0 -1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ds-badge ds-badge-red" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 9 }}>AUTOMATIC MERGE NOTIFICATION</span>
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{fileName}</span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timestamp.toLocaleString()}</span>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        This conflict log was recorded automatically favoring the most recent offline changes using the LWW deterministic resolver. 
        The online version prior to the merge is highlighted in <strong style={{color: '#ca8a04', background: 'rgba(234,179,8,0.2)', padding: '2px 4px', borderRadius: 4}}>yellow</strong> on the left for your reference.
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        <div style={panelStyle}>
          <div style={headerStyle('#ca8a04', 'rgba(234,179,8,0.06)')}>
            <span>Current Online Version</span>
            <span style={{ fontWeight: 400, opacity: 0.8 }}>Read-Only Reference</span>
          </div>
          <div style={bodyStyle} dangerouslySetInnerHTML={{ __html: highlightedA }} />
        </div>

        <div style={{...panelStyle, border: '1px solid var(--accent)', boxShadow: '0 0 0 1px var(--accent)' }}>
          <div style={headerStyle('var(--accent)', 'rgba(16,185,129,0.06)')}>
            <span>Auto-Resolved State</span>
            <span style={{ fontWeight: 400, opacity: 0.8 }}>Read-Only Reference</span>
          </div>
          <div style={{...bodyStyle, background: '#fff', cursor: 'default'}} dangerouslySetInnerHTML={{ __html: payloadB }} />
        </div>
      </div>

      <div style={{ background: 'var(--bg-sidebar)', borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', margin: '0 -1rem -1rem -1rem', gap: '12px' }}>
        <button className="ds-btn ds-btn-ghost" onClick={onReject}>
          <Shield size={13} /> Dismiss Log
        </button>
        <button className="ds-btn ds-btn-primary" onClick={onRestore}>
          Restore version
        </button>
      </div>
    </article>
  );
};

export default InteractiveConflictEditor;
