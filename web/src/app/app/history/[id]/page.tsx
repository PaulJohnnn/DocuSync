'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import {
  Clock, FileEdit, GitMerge, AlertTriangle, ArrowLeft, Activity, RefreshCw, Scale, FilePlus, Trash2, Undo2, Eye, X
} from 'lucide-react';
import { uGet, uSet } from '@/lib/userStorage';
import { idbGetFile, idbSaveFile } from '@/lib/idb';
import InteractiveConflictEditor from '@/components/InteractiveConflictEditor';
import { diffWords } from 'diff';

function renderDiff(oldText: string, newText: string, isSideBySide: boolean = false) {
  const strip = (html: string) => html ? html.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ') : '';
  const oldClean = strip(oldText);
  const newClean = strip(newText);
  
  if (isSideBySide) {
    return (
      <div style={{ display: 'flex', gap: 16, width: '100%', alignItems: 'stretch' }}>
        <div style={{ flex: 1, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: '1.5', background: 'rgba(16, 185, 129, 0.1)', padding: 16, borderRadius: 8, border: '1px solid #10b981' }}>
          <div style={{ color: '#10b981', fontWeight: 'bold', marginBottom: 8, borderBottom: '1px solid #10b981', paddingBottom: 4 }}>WINNER (LWW Kept)</div>
          {newClean || 'No data'}
        </div>
        <div style={{ flex: 1, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: '1.5', background: 'rgba(239, 68, 68, 0.1)', padding: 16, borderRadius: 8, border: '1px solid #eab308' }}>
          <div style={{ color: '#eab308', fontWeight: 'bold', marginBottom: 8, borderBottom: '1px solid #eab308', paddingBottom: 4 }}>LOSER (Overwritten)</div>
          <span style={{ backgroundColor: 'rgba(234, 179, 8, 0.3)', textDecoration: 'line-through' }}>{oldClean || 'No data'}</span>
        </div>
      </div>
    );
  }

  const diffs = diffWords(newClean, oldClean);
  return (
    <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: '1.5', background: 'var(--b1)', padding: 16, borderRadius: 8 }}>
      {diffs.map((part, index) => {
        const color = part.added ? '#ef4444' : part.removed ? '#10b981' : 'var(--t2)';
        const bg = part.added ? 'rgba(239, 68, 68, 0.15)' : part.removed ? 'rgba(16, 185, 129, 0.15)' : 'transparent';
        const textDecoration = part.added ? 'line-through' : 'none';
        return (
          <span key={index} style={{ color, backgroundColor: bg, padding: part.removed || part.added ? '0 2px' : 0, borderRadius: 2, textDecoration }}>
            {part.value}
          </span>
        );
      })}
    </div>
  );
}

// Helper to strip HTML
function stripHtml(html: string) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

interface HistoryEntry {
  eventId: string;
  fileId: string;
  nodeId: string;
  eventType: 'edit' | 'merge' | 'conflict-resolve' | 'restore' | 'delete' | string;
  logicalTimestamp: number;
  payloadPreview: string | null;
  fullContent?: string;
  createdAt: string;
  isCompacted: boolean;
}

const EVENT_ICONS: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  'edit': { icon: FileEdit, color: 'var(--acc)', bg: 'var(--acb)', label: 'Previous Edit' },
  'session-snapshot': { icon: RefreshCw, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'Previous Edit (Session Save)' },
  'merge': { icon: GitMerge, color: 'var(--pur)', bg: 'rgba(168, 85, 247, 0.15)', label: 'Edit History (LWW Collision)' },
  'conflict-resolve': { icon: Scale, color: 'var(--amb)', bg: 'var(--amb-bg)', label: 'Edit History (Manual)' },
  'restore': { icon: FilePlus, color: 'var(--grn)', bg: 'rgba(16, 185, 129, 0.15)', label: 'Restore' },
  'delete': { icon: Trash2, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', label: 'File Deleted' },
  'offline-replay': { icon: Activity, color: 'var(--tel)', bg: 'rgba(20, 184, 166, 0.15)', label: 'Conflict Edit (Offline Append)' },
};

export default function HistoryPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params.id as string;
  const [events, setEvents] = useState<HistoryEntry[]>([]);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [restoring, setRestoring] = useState<Record<string, boolean>>({});
  const [activeConflicts, setActiveConflicts] = useState<any[]>([]);
  const [viewFullEvent, setViewFullEvent] = useState<HistoryEntry | null>(null);
  const [offlineWarning, setOfflineWarning] = useState('');

  const fetchHistory = useCallback(async () => {
    if (fileId === 'all') {
      setErrorMsg('Cannot fetch history for all files from host.');
      setLoading(false);
      return;
    }
    setLoading(true);
    
    try {
      const roomStr = uGet('current_room');
      const room = roomStr ? JSON.parse(roomStr) : null;

      const filesStr = uGet('files');
      if (filesStr) {
        const files = JSON.parse(filesStr);
        const f = files.find((f: any) => String(f.id) === String(fileId));
        if (f) setFileName(f.name);
      }

      let fetchedData = null;
      let hostError = null;

      if (room && room.hostIp) {
        try {
          // Use hostPort (Desktop sync port, e.g. 9000), NOT port (web port, e.g. 3000)
          const syncPort = (room.hostPort && room.hostPort !== 3000 && room.hostPort !== 80 && room.hostPort !== 443) ? room.hostPort : 9000;
          const baseUrl = `http://${room.hostIp}:${syncPort}`;
          const res = await fetch(`${baseUrl}/sync/history?fileId=${fileId}`, {
            headers: { 'X-DocuSync-Token': room.otp }
          });
          if (res.ok) {
            const result = await res.json();
            if (result.success && result.data) {
              fetchedData = result.data.entries;
            }
          }
        } catch (e: any) {
          hostError = e;
        }
      }

      if (!fetchedData && room && room.otp) {
        try {
          const mmRes = await fetch(`/api/lobby/history?otp=${room.otp}&fileId=${fileId}`);
          if (mmRes.ok) {
            const result = await mmRes.json();
            if (result.success && result.data) {
              fetchedData = result.data.entries;
            }
          }
        } catch (e) {
        }
      }

      if (fetchedData) {
        const uniqueMap = new Map();
        fetchedData.forEach((ev: any) => uniqueMap.set(ev.eventId, ev));
        const uniqueData = Array.from(uniqueMap.values());
        const sorted = uniqueData.sort((a: any, b: any) => b.logicalTimestamp - a.logicalTimestamp);
        setEvents(sorted);
        setErrorMsg('');
        setOfflineWarning('');
      } else {
        // Fallback to local offline conflicts
        let localConflicts: HistoryEntry[] = [];
        try {
          const histKey = `docusync_offline_history_${fileId}`;
          const offlineHist = JSON.parse(uGet(histKey) || '[]');
          if (Array.isArray(offlineHist) && offlineHist.length > 0) {
            localConflicts = [...localConflicts, ...offlineHist];
          }
          
          const stored = uGet('docusync_web_conflicts');
          if (stored) {
            const arr = JSON.parse(stored);
            localConflicts = arr
              .filter((c: any) => String(c.fileId) === String(fileId))
              .map((c: any) => ({
                eventId: c.id || `conflict-${c.timestamp}`,
                fileId: c.fileId,
                nodeId: 'local-offline',
                eventType: 'offline-replay',
                logicalTimestamp: c.timestamp,
                payloadPreview: c.localContent,
                fullContent: c.localContent,
                createdAt: new Date(c.timestamp).toISOString(),
                isCompacted: false
              }));
          }
        } catch (_e) {}
        
        if (localConflicts.length > 0) {
          const sorted = localConflicts.sort((a, b) => b.logicalTimestamp - a.logicalTimestamp);
          setEvents(sorted);
          setErrorMsg('');
          setOfflineWarning('Offline mode: Showing locally queued edits only.');
        } else {
          throw new Error(hostError?.message || 'Failed to fetch history from host or cloud, and no offline edits found.');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || String(err));
      console.error('History fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    fetchHistory();
    const checkConflicts = () => {
      try {
        const stored = uGet('docusync_web_conflicts');
        if (stored) {
          const arr = JSON.parse(stored);
          const active = arr.filter((c: any) => String(c.fileId) === String(fileId));
          setActiveConflicts(active);
        } else {
          setActiveConflicts([]);
        }
      } catch (_e) {}
    };
    checkConflicts();
    const iv = setInterval(checkConflicts, 2000);
    return () => clearInterval(iv);
  }, [fetchHistory, fileId]);

  const handleRestore = async (eventId: string, contentToRestore?: string) => {
    setRestoring(prev => ({ ...prev, [eventId]: true }));
    try {
      const roomStr = uGet('current_room');
      const room = roomStr ? JSON.parse(roomStr) : null;
      let finalContent = contentToRestore;

      if (room && room.hostIp) {
        try {
          const syncPort = (room.hostPort && room.hostPort !== 3000 && room.hostPort !== 80 && room.hostPort !== 443) ? room.hostPort : 9000;
          const baseUrl = `http://${room.hostIp}:${syncPort}`;
          const res = await fetch(`${baseUrl}/sync/restore`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-DocuSync-Token': room.otp
            },
            body: JSON.stringify({ fileId: Number(fileId), eventId: eventId })
          });
          const result = await res.json();
          if (res.ok && result.success && result.data?.content) {
            finalContent = result.data.content;
          } else {
            console.error("Restore API failed:", result);
          }
        } catch (fetchErr) {
          console.error("Fetch to /sync/restore failed:", fetchErr);
        }
      }

      if (!finalContent) {
        throw new Error("Failed to fetch. The host is unreachable or did not return the restored content.");
      }

      try {
        const stored = await idbGetFile(String(fileId));
        if (stored) {
          stored.content = finalContent;
          stored.updatedAt = new Date().toISOString();
          await idbSaveFile(stored);
        }
      } catch (e) {}
      
      if (room && room.otp) {
        try {
          await fetch('/api/lobby/doc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              otp: room.otp,
              fileId: String(fileId),
              authorNodeId: 'web-client',
              authorName: 'Web User',
              content: finalContent,
              vectorClock: {},
              isDone: true
            })
          });
        } catch (e) {}
      }

      router.push(`/app/editor/${fileId}`);
    } catch (err: any) {
      alert(err.message || String(err));
      setRestoring(prev => ({ ...prev, [eventId]: false }));
    }
  };

  const resolveAndReturn = async (customPayload: string, conflictIdToRemove: string) => {
    try {
      const stored = await idbGetFile(String(fileId));
      if (stored) {
        stored.content = customPayload;
        stored.updatedAt = new Date().toISOString();
        await idbSaveFile(stored);
      }
    } catch (e) {}
    
    rejectConflict(conflictIdToRemove);
    if (activeConflicts.length <= 1) {
      router.push(`/app/editor/${fileId}`);
    }
  };

  const rejectConflict = (conflictIdToRemove: string) => {
    try {
      const stored = uGet('docusync_web_conflicts');
      if (stored) {
        let arr = JSON.parse(stored);
        arr = arr.filter((c: any) => String(c.fileId) !== String(fileId) || (c.conflictId || c.id) !== conflictIdToRemove);
        uSet('docusync_web_conflicts', JSON.stringify(arr));
        if (arr.length === 0) uSet('docusync_web_conflict', '');
        
        setActiveConflicts(arr.filter((c: any) => String(c.fileId) === String(fileId)));
        
        const roomStr = uGet('current_room');
        const room = roomStr ? JSON.parse(roomStr) : null;
        if (room?.otp) {
          const _WEB_BASE = process.env.NEXT_PUBLIC_MATCHMAKER_URL || 'http://localhost:3000/api/lobby';
          fetch(`${_WEB_BASE}/conflicts?otp=${room.otp}&conflictId=${conflictIdToRemove}`, {
            method: 'DELETE',
          }).catch(() => {});
        }
      }
    } catch (e) {}
  };

  return (
    <PageShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="ds-btn" onClick={() => router.back()}>
            <ArrowLeft size={14} /> Back
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Document History</h1>
            <p style={{ fontSize: 13, color: 'var(--t3)', margin: '4px 0 0' }}>
              {fileName || `File ID: ${fileId}`} • {events.length} event{events.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {activeConflicts.length > 0 && (
        <div style={{ marginBottom: 40, display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {activeConflicts.map((conflict, idx) => (
            <div key={conflict.conflictId || conflict.id || idx}>
              <InteractiveConflictEditor
                fileId={conflict.fileId}
                fileName={fileName}
                payloadA={conflict.localContent}
                payloadB={conflict.serverContent}
                timestamp={new Date(conflict.timestamp)}
                onRestore={() => resolveAndReturn(conflict.localContent, conflict.conflictId || conflict.id)}
                onReject={() => rejectConflict(conflict.conflictId || conflict.id)}
              />
            </div>
          ))}
        </div>
      )}


      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--t3)' }}>
          <RefreshCw size={24} className="spin" style={{ marginBottom: 12, opacity: 0.5, animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: 14 }}>Loading history from Host...</p>
        </div>
      ) : errorMsg ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#ef4444' }}>
          <AlertTriangle size={32} style={{ marginBottom: 12, opacity: 0.8 }} />
          <p style={{ fontSize: 14, fontWeight: 600 }}>Error</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>{errorMsg}</p>
        </div>
      ) : events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--t3)' }}>
          <Clock size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
          <p style={{ fontSize: 14 }}>No events yet</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>Edit a file to start generating history</p>
        </div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 24, paddingBottom: 40 }}>
          {offlineWarning && (
            <div style={{ 
              background: 'var(--amb-bg)', border: '1px solid var(--amb)', 
              color: 'var(--amb)', padding: '12px 16px', borderRadius: 8, 
              marginBottom: 20, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 
            }}>
              <AlertTriangle size={16} />
              {offlineWarning}
            </div>
          )}
          <div style={{ position: 'absolute', left: 11, top: 0, bottom: 0, width: 2, background: 'var(--b1)' }} />

          {events.map((ev, i) => {
            const isLatest = i === 0;
            const evInfo = EVENT_ICONS[ev.eventType] || EVENT_ICONS['edit'];
            const Icon = evInfo.icon;
            
            return (
              <div key={`${ev.eventId}-${i}`} style={{ position: 'relative', marginBottom: 16, opacity: ev.isCompacted ? 0.5 : 1 }}>
                <div style={{
                  position: 'absolute', left: -18, top: 16, width: 16, height: 16, borderRadius: '50%',
                  background: evInfo.bg, border: `2px solid ${evInfo.color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
                }}>
                  <Icon size={8} style={{ color: evInfo.color }} />
                </div>

                <div className="ds-card" style={{ padding: '12px 16px', marginLeft: 8, background: 'var(--s1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>v{events.length - i}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: evInfo.color }}>
                          {evInfo.label || ev.eventType}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--t2)', background: 'var(--b2)', padding: '2px 6px', borderRadius: 12, fontFamily: 'monospace' }}>
                          ts={ev.logicalTimestamp}
                        </span>
                        {isLatest && <span style={{ fontSize: 11, color: 'var(--grn)', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: 12, fontWeight: 600 }}>latest</span>}
                        {ev.isCompacted && <span style={{ fontSize: 11, color: 'var(--t3)', background: 'var(--b1)', padding: '2px 6px', borderRadius: 12 }}>compacted</span>}
                      </div>
                      
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 6 }}>
                        Modified by: <span style={{ fontFamily: 'monospace', color: 'var(--t2)' }}>{ev.nodeId}</span>
                      </div>
                    </div>
                    
                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 500, textAlign: 'right' }}>
                        {new Date(ev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        <br />
                        <span style={{ fontSize: 9 }}>{new Date(ev.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        <button
                          className="ds-btn ds-btn-ghost"
                          onClick={() => setViewFullEvent(ev)}
                          style={{ padding: '6px 10px', fontSize: 11, gap: 4 }}
                        >
                          <Eye size={12} /> View
                        </button>
                        {ev.eventType !== 'merge' && (
                          <button
                            className="ds-btn ds-btn-primary ds-btn-animate"
                            onClick={() => handleRestore(ev.eventId, ev.fullContent)}
                            disabled={restoring[ev.eventId]}
                            style={{ padding: '6px 16px', fontSize: 13, gap: 6 }}
                          >
                            {restoring[ev.eventId] ? 'Restoring...' : 'Restore'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>


                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewFullEvent && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div className="ds-card" style={{
            background: 'var(--bg)', width: '100%', maxWidth: 700, maxHeight: '80vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', border: '1px solid var(--b1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--b1)' }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Snapshot Content</h3>
              <button onClick={() => setViewFullEvent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t2)' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '0 20px', marginTop: 16 }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--t2)', marginBottom: 12 }}>
                Comparing the selected historical version against the <strong>latest version</strong>.
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: '0.8rem', color: 'var(--t3)', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'inline-block', width: 12, height: 12, background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', borderRadius: 2 }}></span> What will be removed from latest</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'inline-block', width: 12, height: 12, background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10b981', borderRadius: 2 }}></span> What will be restored (added)</div>
              </div>
            </div>

            <div style={{ padding: '0 20px 20px', overflowY: 'auto', flex: 1, fontSize: 14, color: 'var(--t1)' }}>
              {events.length > 0 ? renderDiff(viewFullEvent.fullContent || viewFullEvent.payloadPreview || '', events.length > 1 ? events[1].fullContent || events[1].payloadPreview || '' : '', viewFullEvent.eventType === 'merge') : null}
            </div>

            <div style={{ padding: '12px 16px', background: 'var(--amb-bg)', border: '1px solid var(--amb)', color: 'var(--amb)', margin: '0 20px 16px', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <div style={{ flex: 1, fontSize: '0.85rem' }}>
                <strong>Warning:</strong> Restoring this historical version will overwrite the current content of the file. A new "Restore" event will be appended to the history log, preserving this moment.
              </div>
            </div>
            
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--b1)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="ds-btn ds-btn-ghost" onClick={() => setViewFullEvent(null)}>Cancel</button>
              <button
                className="ds-btn ds-btn-primary ds-btn-animate"
                style={{ background: '#10b981', borderColor: '#10b981' }}
                onClick={() => {
                  handleRestore(viewFullEvent.eventId, viewFullEvent.fullContent || viewFullEvent.payloadPreview || '');
                  setViewFullEvent(null);
                }}
              >
                Confirm and Restore
              </button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .ds-btn-animate {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .ds-btn-animate:hover:not(:disabled) {
          transform: translateY(-1px) scale(1.02);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);
        }
        .ds-btn-animate:active:not(:disabled) {
          transform: translateY(0) scale(0.98);
        }
      `}} />
    </PageShell>
  );
}
