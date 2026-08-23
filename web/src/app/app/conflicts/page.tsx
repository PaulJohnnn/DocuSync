'use client';
import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { Shield, Check, ArrowLeft, CheckCircle } from 'lucide-react';
import { uGet, uSet, uRemove } from '@/lib/userStorage';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

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
  onManualResolve: (customPayload: string) => void;
  onReject: () => void;
  fileName: string;
}> = ({ fileId, payloadA, payloadB, timestamp, onManualResolve, onReject, fileName }) => {
  const { highlightedA } = useMemo(() => computeWordDiff(payloadA, payloadB), [payloadA, payloadB]);

  const editor = useEditor({
    extensions: [StarterKit],
    content: payloadB,
  });

  const handleResolveClick = () => {
    if (window.confirm('Are you sure you want to save this merged file? This will overwrite the live document and resolve the conflict.')) {
      const html = editor?.getHTML() || '';
      onManualResolve(html);
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
    <article className="ds-card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header */}
      <div style={{ background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '-1rem -1rem 0 -1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ds-badge ds-badge-red" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 9 }}>CONFLICT RESOLUTION</span>
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{fileName}</span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timestamp.toLocaleString()}</span>
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
        <button className="ds-btn ds-btn-ghost" onClick={onReject}>
          <Shield size={13} /> Delete Conflict
        </button>
        <button className="ds-btn ds-btn-success" onClick={handleResolveClick} style={{ padding: '6px 24px' }}>
          <Check size={14} /> Resolve & Save
        </button>
      </div>
    </article>
  );
};

// ── Page Component ────────────────────────────────────────────────────────────

export default function ConflictsPage() {
  const router = useRouter();
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [selectedConflictId, setSelectedConflictId] = useState<string | null>(null);

  useEffect(() => {
    const checkConflicts = () => {
      try {
        const data = uGet('docusync_web_conflicts');
        if (data) {
          setConflicts(JSON.parse(data));
        } else {
          // Backward compatibility check for single old conflict
          const old = uGet('docusync_web_conflict');
          if (old) {
            setConflicts([{ ...JSON.parse(old), id: 'legacy' }]);
          }
        }
      } catch (e) {}
    };
    checkConflicts();
    const iv = setInterval(checkConflicts, 2000);
    return () => clearInterval(iv);
  }, []);

  const getFileName = (fileId: string) => {
    try {
      const stored = uGet('files');
      if (stored) {
        const files = JSON.parse(stored);
        const file = files.find((f: any) => String(f.id) === String(fileId));
        return file ? file.name : `File #${fileId}`;
      }
    } catch {}
    return `File #${fileId}`;
  };

  const getRoomName = () => {
    try {
      const stored = uGet('current_room');
      if (stored) {
        const room = JSON.parse(stored);
        return room.name || room.id;
      }
    } catch {}
    return 'Unknown Room';
  };

  const resolveAndReturn = (winnerContent: string) => {
    const conflict = conflicts.find(c => c.id === selectedConflictId);
    if (!conflict) return;
    
    // Update local storage files with the winner content
    try {
      const stored = uGet('files');
      if (stored) {
        const files = JSON.parse(stored);
        const idx = files.findIndex((f: any) => String(f.id) === String(conflict.fileId));
        if (idx >= 0) {
          files[idx].content = winnerContent;
          files[idx].updatedAt = new Date().toISOString();
          uSet('files', JSON.stringify(files));
        }
      }
    } catch (e) {
      console.error(e);
    }
    
    // Remove from array (also handle backward compat deletion)
    const updatedConflicts = conflicts.filter(c => c.id !== selectedConflictId);
    setConflicts(updatedConflicts);
    uSet('docusync_web_conflicts', JSON.stringify(updatedConflicts));
    uRemove('docusync_web_conflict');
    setSelectedConflictId(null);
  };

  const rejectConflict = () => {
    const updatedConflicts = conflicts.filter(c => c.id !== selectedConflictId);
    setConflicts(updatedConflicts);
    uSet('docusync_web_conflicts', JSON.stringify(updatedConflicts));
    uRemove('docusync_web_conflict');
    setSelectedConflictId(null);
  };

  const activeConflict = conflicts.find(c => c.id === selectedConflictId);

  return (
    <PageShell title="Conflicts">
      <div style={{ maxWidth: 1000, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem' }}>
          {selectedConflictId && (
            <button onClick={() => setSelectedConflictId(null)} className="ds-btn ds-btn-ghost" style={{ padding: 8 }}>
              <ArrowLeft size={16} /> Back to List
            </button>
          )}
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Conflict Resolution</h1>
          {conflicts.length > 0 && !selectedConflictId && (
            <span style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
              {conflicts.length} pending
            </span>
          )}
        </div>

        {conflicts.length === 0 ? (
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
        ) : !selectedConflictId ? (
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
                {conflicts.map((c, i) => (
                  <tr key={c.id || i} style={{ borderBottom: i < conflicts.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '12px 16px' }}>{getRoomName()}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 500 }}>{getFileName(c.fileId)}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{new Date(c.timestamp).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button className="ds-btn ds-btn-primary" style={{ padding: '4px 12px', fontSize: 12, height: 'auto' }} onClick={() => setSelectedConflictId(c.id)}>
                        Check
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : activeConflict ? (
          <InteractiveConflictEditor
            fileId={activeConflict.fileId}
            fileName={getFileName(activeConflict.fileId)}
            payloadA={activeConflict.localContent}
            payloadB={activeConflict.serverContent}
            timestamp={new Date(activeConflict.timestamp)}
            onManualResolve={resolveAndReturn}
            onReject={rejectConflict}
          />
        ) : null}
      </div>
    </PageShell>
  );
}
