'use client';
import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { AlertTriangle, Shield, Check, ArrowLeft, CheckCircle } from 'lucide-react';
import { uGet, uSet } from '@/lib/userStorage';

// ── Word-level diff engine (Ported from Desktop) ──────────────────────────────

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

// ── SplitHtmlDiff ─────────────────────────────────────────────────────────────

const SplitHtmlDiff: React.FC<{
  htmlA: string; htmlB: string;
}> = ({ htmlA, htmlB }) => {
  const { highlightedA, highlightedB, deletedCount, addedCount } = useMemo(
    () => computeWordDiff(htmlA, htmlB), [htmlA, htmlB]
  );
  
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
            <span>Your Local (Offline) Edits</span>
          </div>
          <div style={bodyStyle} dangerouslySetInnerHTML={{ __html: highlightedA }} />
        </div>

        <div style={panelStyle}>
          <div style={headerStyle('#16a34a', 'rgba(34,197,94,0.06)')}>
            <span>Server Updated Version</span>
          </div>
          <div style={bodyStyle} dangerouslySetInnerHTML={{ __html: highlightedB }} />
        </div>
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
        Tip: You can manually copy-paste text from your local edits to the updated version before clicking Accept.
      </div>
    </div>
  );
};

// ── Page Component ────────────────────────────────────────────────────────────

export default function ConflictsPage() {
  const router = useRouter();
  const [conflict, setConflict] = useState<any>(null);

  useEffect(() => {
    const data = localStorage.getItem('docusync_web_conflict');
    if (data) {
      setConflict(JSON.parse(data));
    }
  }, []);

  const resolveAndReturn = (winnerContent: string) => {
    if (!conflict) return;
    
    // Update local storage files with the winner content
    try {
      const stored = uGet('files');
      if (stored) {
        const files = JSON.parse(stored);
        const idx = files.findIndex((f: any) => f.id === conflict.fileId);
        if (idx >= 0) {
          files[idx].content = winnerContent;
          files[idx].updatedAt = new Date().toISOString();
          uSet('files', JSON.stringify(files));
        }
      }
    } catch (e) {
      console.error(e);
    }
    
    localStorage.removeItem('docusync_web_conflict');
    router.push(`/app/editor/${conflict.fileId}`);
  };

  return (
    <PageShell title="Conflicts">
      <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem' }}>
          <button onClick={() => router.back()} className="ds-btn ds-btn-ghost" style={{ padding: 8 }}>
            <ArrowLeft size={16} /> Back
          </button>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Conflict Resolution</h1>
        </div>

        {!conflict ? (
          <div className="ds-empty" style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', padding: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ 
              background: 'rgba(34, 197, 94, 0.1)', 
              color: '#22c55e', 
              padding: '16px', 
              borderRadius: '50%', 
              marginBottom: '20px',
              boxShadow: '0 0 24px rgba(34, 197, 94, 0.2)'
            }}>
              <CheckCircle size={48} strokeWidth={1.5} />
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>All conflicts resolved</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              You do not have any pending local offline conflicts.
            </p>
          </div>
        ) : (
          <>
            <div className="ds-banner ds-banner-amber" style={{ borderRadius: 'var(--r-md)' }}>
              <span style={{ fontSize: '1.1rem' }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Offline edits conflicted with the server</div>
                <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 2, opacity: 0.8 }}>
                  Someone edited this document while you were offline. Review the differences below and choose which version to keep.
                </div>
              </div>
            </div>

            <article className="ds-card" style={{ overflow: 'hidden' }}>
              <div style={{ background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="ds-badge ds-badge-red" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 9 }}>CONFLICT</span>
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>File #{conflict.fileId}</span>
                <AlertTriangle size={14} style={{ color: 'var(--red)' }} />
              </div>

              <div style={{ padding: '14px 16px' }}>
                <SplitHtmlDiff
                  htmlA={conflict.localContent}
                  htmlB={conflict.serverContent}
                />
              </div>

              <div style={{ background: 'var(--bg-sidebar)', borderTop: '1px solid var(--border)', padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="ds-btn ds-btn-ghost" onClick={() => resolveAndReturn(conflict.localContent)} style={{ fontSize: 12, height: 32 }}>
                  <Shield size={13} /> Reject Server (Keep Local)
                </button>
                <div style={{ flex: 1 }}></div>
                <button className="ds-btn ds-btn-success" onClick={() => resolveAndReturn(conflict.serverContent)} style={{ fontSize: 12, height: 32 }}>
                  <Check size={13} /> Accept Server (Discard Local)
                </button>
              </div>
            </article>
          </>
        )}
      </div>
    </PageShell>
  );
}
