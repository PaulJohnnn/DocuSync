'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import {
  Clock, FileEdit, GitMerge, AlertTriangle, RotateCcw, ArrowLeft, Activity
} from 'lucide-react';

interface EventRecord {
  id: number;
  eventId: string;
  fileId: string;
  nodeId: string;
  eventType: string;
  logicalTimestamp: number;
  payload: string;
  createdAt: string;
}

const EVENT_ICONS: Record<string, { icon: any; color: string }> = {
  'edit': { icon: FileEdit, color: 'var(--acc)' },
  'merge': { icon: GitMerge, color: 'var(--grn)' },
  'conflict-resolve': { icon: AlertTriangle, color: 'var(--amb)' },
  'restore': { icon: RotateCcw, color: 'var(--pur)' },
  'offline-replay': { icon: Activity, color: 'var(--tel)' },
};

export default function HistoryPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params.id as string;
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    if (fileId === 'all') {
      // Aggregate all events from all files
      const filesStr = localStorage.getItem('docusync_files');
      if (!filesStr) return;
      const files = JSON.parse(filesStr);
      const allEvents: EventRecord[] = [];
      for (const f of files) {
        const evStr = localStorage.getItem(`docusync_events_${f.id}`);
        if (evStr) {
          const evts = JSON.parse(evStr);
          allEvents.push(...evts.map((e: any) => ({ ...e, fileName: f.name })));
        }
      }
      allEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setEvents(allEvents);
      setFileName('All Files');
    } else {
      const evStr = localStorage.getItem(`docusync_events_${fileId}`);
      if (evStr) {
        const evts = JSON.parse(evStr);
        evts.sort((a: EventRecord, b: EventRecord) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setEvents(evts);
      }
      const filesStr = localStorage.getItem('docusync_files');
      if (filesStr) {
        const files = JSON.parse(filesStr);
        const f = files.find((f: any) => f.id === fileId);
        if (f) setFileName(f.name);
      }
    }
  }, [fileId]);

  const restore = (event: EventRecord) => {
    if (fileId === 'all') return;
    const stored = localStorage.getItem('docusync_files');
    if (!stored) return;
    const files = JSON.parse(stored);
    const idx = files.findIndex((f: any) => f.id === fileId);
    if (idx >= 0) {
      files[idx].content = event.payload;
      files[idx].updatedAt = new Date().toISOString();
      localStorage.setItem('docusync_files', JSON.stringify(files));
      router.push(`/editor/${fileId}`);
    }
  };

  return (
    <PageShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="ds-btn" onClick={() => router.push('/')}>
            <ArrowLeft size={14} /> Back
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>History</h1>
            <p style={{ fontSize: 13, color: 'var(--t3)', margin: '4px 0 0' }}>
              {fileName} • {events.length} event{events.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--t3)' }}>
          <Clock size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
          <p style={{ fontSize: 14 }}>No events yet</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>Edit a file to start generating history</p>
        </div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 24 }}>
          {/* Timeline line */}
          <div style={{
            position: 'absolute', left: 11, top: 0, bottom: 0,
            width: 2, background: 'var(--b1)',
          }} />

          {events.map((ev, i) => {
            const evInfo = EVENT_ICONS[ev.eventType] || EVENT_ICONS['edit'];
            const Icon = evInfo.icon;
            return (
              <div key={`${ev.eventId}-${i}`} style={{
                position: 'relative', marginBottom: 12,
              }}>
                {/* Timeline dot */}
                <div style={{
                  position: 'absolute', left: -18, top: 14,
                  width: 16, height: 16, borderRadius: '50%',
                  background: `${evInfo.color}20`, border: `2px solid ${evInfo.color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 1,
                }}>
                  <Icon size={8} style={{ color: evInfo.color }} />
                </div>

                <div className="ds-card" style={{ padding: 12, marginLeft: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', textTransform: 'capitalize' }}>
                          {ev.eventType.replace('-', ' ')}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'monospace' }}>
                          ts:{ev.logicalTimestamp}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                        {new Date(ev.createdAt).toLocaleString()} • Node: {ev.nodeId.slice(0, 8)}...
                      </div>
                      {ev.payload && (
                        <div style={{
                          fontSize: 11, color: 'var(--t2)', marginTop: 6,
                          padding: '6px 8px', background: 'var(--bg)',
                          borderRadius: 6, fontFamily: 'monospace',
                          maxHeight: 60, overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {ev.payload.slice(0, 150)}...
                        </div>
                      )}
                    </div>
                    {fileId !== 'all' && (
                      <button className="ds-btn" onClick={() => restore(ev)} style={{ flexShrink: 0 }}>
                        <RotateCcw size={12} /> Restore
                      </button>
                    )}
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
