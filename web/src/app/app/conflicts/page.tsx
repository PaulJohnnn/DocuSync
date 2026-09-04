'use client';
import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { Shield, ArrowLeft } from 'lucide-react';
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
}> = ({ fileId: _fileId, payloadA, payloadB, timestamp, onManualResolve: _onManualResolve, onReject, fileName }) => {
  const { highlightedA } = useMemo(() => computeWordDiff(payloadA, payloadB), [payloadA, payloadB]);

  const editor = useEditor({
    extensions: [StarterKit],
    content: payloadB,
    editable: false,
  });

  const _handleResolveClick = () => {
    // System enforces deterministic LWW
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
            <span>Your Local Edits (Offline)</span>
            <span style={{ fontWeight: 400, opacity: 0.8 }}>Editable</span>
          </div>
          <div style={{...bodyStyle, background: '#fff', cursor: 'default'}}>
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-sidebar)', borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 -1rem -1rem -1rem' }}>
        <button className="ds-btn ds-btn-ghost" onClick={onReject}>
          <Shield size={13} /> Delete Log
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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
      } catch (_e) {}
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
    } catch (_e) {
      console.error(_e);
    }

    // ── Push resolution to Matchmaker so Desktop & all room peers update ──
    try {
      const storedRoom = uGet('current_room');
      if (storedRoom) {
        const room = JSON.parse(storedRoom);
        const otp = room.otp || room.id;
        
        // Retrieve latest vector clock for the file to properly merge
        let mergedClock = {};
        try {
          const stored = uGet('files');
          if (stored) {
            const files = JSON.parse(stored);
            const file = files.find((f: any) => String(f.id) === String(conflict.fileId));
            if (file && file.vectorClock) mergedClock = { ...file.vectorClock };
          }
        } catch (_e) {}
        
        fetch('/api/lobby/doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            otp,
            fileId: conflict.fileId,
            authorNodeId: 'web-user',
            authorName: 'Web Member (Conflict Resolution)',
            content: winnerContent,
            vectorClock: mergedClock,
            deltaSize: new Blob([winnerContent]).size,
          }),
        }).catch(err => console.error('[Conflict Resolve] Matchmaker push error:', err));
        
        // Push directly to Desktop Host to clear its local conflict queue
        const pushToHostDirectly = async () => {
          try {
            const mmRes = await fetch(`/api/lobby/signal?otp=${otp}`);
            if (mmRes.ok) {
              const mmData = await mmRes.json();
              if (mmData.hostUrl) {
                await fetch(`${mmData.hostUrl}/sync/resolve`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    conflictId: conflict.id,
                    fileId: conflict.fileId,
                    authorNodeId: 'web-user',
                    content: winnerContent,
                    vectorClock: mergedClock,
                    action: 'resolve'
                  })
                }).catch(() => {});
              }
            }
          } catch {}
        };
        pushToHostDirectly();
        
        // Tell Matchmaker to clear the conflict so other peers don't keep it
        fetch(`/api/lobby/conflicts?otp=${otp}&conflictId=${conflict.id}`, { method: 'DELETE' }).catch(() => {});
      }
    } catch (_e) {}

    // ── Record event in History ──
    try {
      const historyStr = uGet('docusync_history') || '[]';
      const history = JSON.parse(historyStr);
      history.unshift({
        id: Date.now(),
        fileName: getFileName(conflict.fileId),
        action: 'Conflict Resolved',
        timestamp: new Date().toLocaleString(),
        resolvedBy: 'Web Member',
        type: 'conflict-resolve',
      });
      uSet('docusync_history', JSON.stringify(history));
    } catch (_e) {}
    
    // Remove from array (also handle backward compat deletion)
    const updatedConflicts = conflicts.filter(c => c.id !== selectedConflictId);
    setConflicts(updatedConflicts);
    uSet('docusync_web_conflicts', JSON.stringify(updatedConflicts));
    uRemove('docusync_web_conflict');
    setSelectedConflictId(null);
  };

  const rejectConflict = () => {
    const conflict = conflicts.find(c => c.id === selectedConflictId);
    if (!conflict) return;
    
    // Record rejection in History
    try {
      const historyStr = uGet('docusync_history') || '[]';
      const history = JSON.parse(historyStr);
      history.unshift({
        id: Date.now(),
        fileName: getFileName(conflict.fileId),
        action: 'Conflict Deleted',
        timestamp: new Date().toLocaleString(),
        resolvedBy: 'Web Member',
        type: 'conflict-delete',
      });
      uSet('docusync_history', JSON.stringify(history));
    } catch (_e) {}

    // Tell Matchmaker and Desktop Host to clear it
    try {
      const storedRoom = uGet('current_room');
      if (storedRoom) {
        const room = JSON.parse(storedRoom);
        const otp = room.otp || room.id;
        
        fetch(`/api/lobby/conflicts?otp=${otp}&conflictId=${conflict.id}`, { method: 'DELETE' }).catch(() => {});
        
        const pushToHostDirectly = async () => {
          try {
            const mmRes = await fetch(`/api/lobby/signal?otp=${otp}`);
            if (mmRes.ok) {
              const mmData = await mmRes.json();
              if (mmData.hostUrl) {
                await fetch(`${mmData.hostUrl}/sync/resolve`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    conflictId: conflict.id,
                    fileId: conflict.fileId,
                    content: '',
                    action: 'reject'
                  })
                }).catch(() => {});
              }
            }
          } catch {}
        };
        pushToHostDirectly();
      }
    } catch (_e) {}

    const updatedConflicts = conflicts.filter(c => c.id !== selectedConflictId);
    setConflicts(updatedConflicts);
    uSet('docusync_web_conflicts', JSON.stringify(updatedConflicts));
    uRemove('docusync_web_conflict');
    setSelectedConflictId(null);
  };

  const _deleteSelectedConflicts = () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} conflict(s)?`)) return;

    try {
      const historyStr = uGet('docusync_history') || '[]';
      const history = JSON.parse(historyStr);
      let now = Date.now();
      
      const storedRoom = uGet('current_room');
      const room = storedRoom ? JSON.parse(storedRoom) : null;
      const otp = room ? (room.otp || room.id) : null;
      
      conflicts.forEach(c => {
        if (selectedIds.includes(c.id)) {
          history.unshift({
            id: now++,
            fileName: getFileName(c.fileId),
            action: 'Conflict Deleted',
            timestamp: new Date().toLocaleString(),
            resolvedBy: 'Web Member',
            type: 'conflict-delete',
          });
          
          if (otp) {
            fetch(`/api/lobby/conflicts?otp=${otp}&conflictId=${c.id}`, { method: 'DELETE' }).catch(() => {});
            const pushToHostDirectly = async () => {
              try {
                const mmRes = await fetch(`/api/lobby/signal?otp=${otp}`);
                if (mmRes.ok) {
                  const mmData = await mmRes.json();
                  if (mmData.hostUrl) {
                    await fetch(`${mmData.hostUrl}/sync/resolve`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        conflictId: c.id,
                        fileId: c.fileId,
                        content: '',
                        action: 'reject'
                      })
                    }).catch(() => {});
                  }
                }
              } catch {}
            };
            pushToHostDirectly();
          }
        }
      });
      uSet('docusync_history', JSON.stringify(history));
    } catch (_e) {}

    const updatedConflicts = conflicts.filter(c => !selectedIds.includes(c.id));
    setConflicts(updatedConflicts);
    uSet('docusync_web_conflicts', JSON.stringify(updatedConflicts));
    if (updatedConflicts.length === 0) {
      uRemove('docusync_web_conflict');
    }
    setSelectedIds([]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === conflicts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(conflicts.map(c => c.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(selectedId => selectedId !== id) : [...prev, id]
    );
  };

  const activeConflict = conflicts.find(c => c.id === selectedConflictId);
  return (
    <PageShell title="Conflicts">
      <div style={{ maxWidth: 1000, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="ds-btn ds-btn-secondary" style={{ padding: '6px 12px' }} onClick={() => router.push('/app/files')}>
              <ArrowLeft size={14} /> Back
            </button>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Conflict Log</h1>
          </div>
          {conflicts.length > 0 && <span className="ds-badge ds-badge-red">{conflicts.length} logs</span>}
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
              <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: 'var(--t2)', marginBottom: 8 }}>All conflicts resolved</h2>
            <p style={{ color: 'var(--t3)', fontSize: 13, maxWidth: 360, margin: '0 auto 24px', lineHeight: 1.7 }}>
              No recorded logs. The LWW resolver will notify you if concurrent edits create a conflict.
            </p>
            <button className="ds-btn ds-btn-primary" onClick={() => router.push('/app/files')}>Back to Files</button>
          </div>
        ) : !selectedConflictId ? (
          <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px', width: 40, textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={conflicts.length > 0 && selectedIds.length === conflicts.length}
                      onChange={toggleSelectAll}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Room Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>File Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Conflict Time</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {conflicts.map((c, i) => (
                  <tr key={c.id || i} style={{ borderBottom: i < conflicts.length - 1 ? '1px solid var(--border)' : 'none', background: selectedIds.includes(c.id) ? 'rgba(239, 68, 68, 0.03)' : 'transparent' }}>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
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
