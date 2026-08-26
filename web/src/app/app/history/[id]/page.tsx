'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import {
  Clock, FileEdit, GitMerge, AlertTriangle, RotateCcw, ArrowLeft, Activity, RefreshCw, Scale, FilePlus, Trash2
} from 'lucide-react';
import { uGet, uSet } from '@/lib/userStorage';

interface HistoryEntry {
  eventId: string;
  fileId: string;
  nodeId: string;
  eventType: 'edit' | 'merge' | 'conflict-resolve' | 'restore' | 'delete' | string;
  logicalTimestamp: number;
  payloadPreview: string | null;
  createdAt: string;
  isCompacted: boolean;
}

const EVENT_ICONS: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  'edit': { icon: FileEdit, color: 'var(--acc)', bg: 'var(--acb)', label: 'Edit' },
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
      if (!room || !room.hostIp) {
        throw new Error('No active room connection found. Are you in a session?');
      }

      const filesStr = uGet('files');
      if (filesStr) {
        const files = JSON.parse(filesStr);
        const f = files.find((f: any) => String(f.id) === String(fileId));
        if (f) setFileName(f.name);
      }

      const baseUrl = `http://${room.hostIp}:${room.port || 9000}`;
      const res = await fetch(`${baseUrl}/sync/history?fileId=${fileId}`);
      const result = await res.json();
      
      if (result.success && result.data) {
        const sorted = [...result.data.entries].sort((a: any, b: any) => b.logicalTimestamp - a.logicalTimestamp);
        setEvents(sorted);
      } else {
        throw new Error(result.error || 'Failed to fetch history');
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
  }, [fetchHistory]);

  const handleRestore = async (eventId: string) => {
    setRestoring(prev => ({ ...prev, [eventId]: true }));
    try {
      const roomStr = uGet('current_room');
      const room = roomStr ? JSON.parse(roomStr) : null;
      if (!room || !room.hostIp) {
        throw new Error('No active room connection found.');
      }
      const baseUrl = `http://${room.hostIp}:${room.port || 9000}`;
      
      const res = await fetch(`${baseUrl}/sync/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: Number(fileId), eventId: eventId }) // fixed from commitId
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
         throw new Error(result.error || 'Failed to restore version');
      }

      // Update local storage so EditorPage has the correct content instantly
      try {
        const stored = uGet('files');
        if (stored) {
          const files = JSON.parse(stored);
          const idx = files.findIndex((f: any) => String(f.id) === String(fileId));
          if (idx >= 0 && result.data?.content) {
            files[idx].content = result.data.content;
            files[idx].updatedAt = new Date().toISOString();
            uSet('files', JSON.stringify(files));
          }
        }
      } catch (e) {
        console.error('Failed to update local storage after restore:', e);
      }
      
      // Push the restored content to Matchmaker to keep the server snapshot fresh
      if (room && room.otp && result.data?.content) {
        try {
          await fetch('/api/lobby/doc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              otp: room.otp,
              fileId: String(fileId),
              authorNodeId: 'web-client',
              authorName: 'Web User',
              content: result.data.content,
              vectorClock: result.data.vectorClock || {},
              deltaSize: result.data.content.length,
            })
          });
        } catch (e) {
          console.error('Failed to push restored content to Matchmaker:', e);
        }
      }

      router.push(`/app/editor/${fileId}`);
    } catch (err: any) {
      alert(err.message || String(err));
      setRestoring(prev => ({ ...prev, [eventId]: false }));
    }
  };

  return (
    <PageShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="ds-btn" onClick={() => router.back()}>
            <ArrowLeft size={14} /> Back
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>History</h1>
            <p style={{ fontSize: 13, color: 'var(--t3)', margin: '4px 0 0' }}>
              {fileName || `File ID: ${fileId}`} • {events.length} event{events.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

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
                      
                      {ev.payloadPreview && (
                        <div style={{
                          fontSize: 11, color: 'var(--t2)', marginTop: 8, padding: '6px 8px',
                          background: 'var(--s2)', borderRadius: 6, fontFamily: 'monospace',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}>
                          {ev.payloadPreview}
                        </div>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                          {new Date(ev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'monospace', opacity: 0.7, marginTop: 2 }}>
                          {new Date(ev.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      
                      {ev.eventType === 'delete' ? (
                        <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600, padding: '4px 8px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>
                          🗑️ Deleted
                        </span>
                      ) : (
                        <button 
                          className="ds-btn" 
                          onClick={() => handleRestore(ev.eventId)}
                          disabled={restoring[ev.eventId]}
                          style={{ background: 'transparent', border: '1px solid var(--b2)', padding: '4px 10px', fontSize: 11, fontWeight: 600 }}
                        >
                          {restoring[ev.eventId] ? '⏳ Restoring…' : '⏪ Restore'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
