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
  'edit': { icon: FileEdit, color: 'var(--acc)', bg: 'var(--acb)', label: 'Edit' },
  'session-snapshot': { icon: RefreshCw, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'Session Checkpoint' },
  'merge': { icon: GitMerge, color: 'var(--pur)', bg: 'rgba(168, 85, 247, 0.15)', label: 'Merge' },
  'conflict-resolve': { icon: Scale, color: 'var(--amb)', bg: 'var(--amb-bg)', label: 'Conflict Resolved' },
  'restore': { icon: FilePlus, color: 'var(--grn)', bg: 'rgba(16, 185, 129, 0.15)', label: 'Restore' },
  'delete': { icon: Trash2, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', label: 'File Deleted' },
  'offline-replay': { icon: Activity, color: 'var(--tel)', bg: 'rgba(20, 184, 166, 0.15)', label: 'Offline Replay' },
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
  const [activeConflict, setActiveConflict] = useState<any>(null);
  const [viewFullEvent, setViewFullEvent] = useState<HistoryEntry | null>(null);

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
          const baseUrl = `http://${room.hostIp}:${room.port || 9000}`;
          const res = await fetch(`${baseUrl}/sync/history?fileId=${fileId}`);
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
        const sorted = [...fetchedData].sort((a: any, b: any) => b.logicalTimestamp - a.logicalTimestamp);
        setEvents(sorted);
        setErrorMsg('');
      } else {
        throw new Error(hostError?.message || 'Failed to fetch history from host or cloud.');
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
          const conflict = arr.find((c: any) => String(c.fileId) === String(fileId));
          setActiveConflict(conflict || null);
        } else {
          setActiveConflict(null);
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
          const baseUrl = `http://${room.hostIp}:${room.port || 9000}`;
          const res = await fetch(`${baseUrl}/sync/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: Number(fileId), eventId: eventId })
          });
          const result = await res.json();
          if (res.ok && result.success && result.data?.content) {
            finalContent = result.data.content;
          }
        } catch (_e) {}
      }

      if (!finalContent) {
        throw new Error("Could not retrieve full content to restore.");
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

  const resolveAndReturn = async (customPayload: string) => {
    try {
      const stored = await idbGetFile(String(fileId));
      if (stored) {
        stored.content = customPayload;
        stored.updatedAt = new Date().toISOString();
        await idbSaveFile(stored);
      }
    } catch (e) {}
    
    rejectConflict();
    router.push(`/app/editor/${fileId}`);
  };

  const rejectConflict = () => {
    try {
      const stored = uGet('docusync_web_conflicts');
      if (stored) {
        let arr = JSON.parse(stored);
        arr = arr.filter((c: any) => String(c.fileId) !== String(fileId));
        uSet('docusync_web_conflicts', JSON.stringify(arr));
        if (arr.length === 0) uSet('docusync_web_conflict', '');
      }
    } catch (e) {}
    setActiveConflict(null);
  };

  return (
    <PageShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="ds-btn" onClick={() => router.back()}>
            <ArrowLeft size={14} /> Back
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Conflict History</h1>
            <p style={{ fontSize: 13, color: 'var(--t3)', margin: '4px 0 0' }}>
              {fileName || `File ID: ${fileId}`} • {events.length} event{events.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {activeConflict && (
        <div style={{ marginBottom: 40 }}>
          <InteractiveConflictEditor
            fileId={activeConflict.fileId}
            fileName={fileName}
            payloadA={activeConflict.localContent}
            payloadB={activeConflict.serverContent}
            timestamp={new Date(activeConflict.timestamp)}
            onRestore={() => resolveAndReturn(activeConflict.localContent)}
            onReject={rejectConflict}
          />
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
                        Node: <span style={{ fontFamily: 'monospace', color: 'var(--t2)' }}>{ev.nodeId.slice(0, 12)}…</span>
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
                        <button
                          className="ds-btn ds-btn-primary ds-btn-animate"
                          onClick={() => handleRestore(ev.eventId, ev.fullContent)}
                          disabled={restoring[ev.eventId]}
                          style={{ padding: '6px 12px', fontSize: 12, gap: 6 }}
                        >
                          {restoring[ev.eventId] ? (
                            <RefreshCw size={12} className="spin" />
                          ) : (
                            <Undo2 size={12} />
                          )}
                          Restore
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{
                    marginTop: 12, padding: 12, background: 'var(--b1)', borderRadius: 8,
                    fontSize: 13, color: 'var(--t2)', overflowX: 'auto',
                    border: '1px solid var(--b2)', wordBreak: 'break-word'
                  }}>
                    {stripHtml(ev.fullContent || ev.payloadPreview || '')}
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
            background: 'var(--bg-card)', width: '100%', maxWidth: 700, maxHeight: '80vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--b1)' }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Snapshot Content</h3>
              <button onClick={() => setViewFullEvent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t2)' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: 20, overflowY: 'auto', flex: 1, fontSize: 14, color: 'var(--t1)', lineHeight: 1.6 }}>
              <div dangerouslySetInnerHTML={{ __html: viewFullEvent.fullContent || '' }} />
            </div>
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--b1)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="ds-btn ds-btn-ghost" onClick={() => setViewFullEvent(null)}>Close</button>
              <button
                className="ds-btn ds-btn-primary ds-btn-animate"
                onClick={() => {
                  handleRestore(viewFullEvent.eventId, viewFullEvent.fullContent);
                  setViewFullEvent(null);
                }}
              >
                <Undo2 size={14} /> Restore This Version
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
