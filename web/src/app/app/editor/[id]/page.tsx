'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { ArrowLeft, Save, RefreshCw, Clock } from 'lucide-react';
import dynamic from 'next/dynamic';
import { uGet, uSet } from '@/lib/userStorage';

const TipTapEditor = dynamic(() => import('@/components/TipTapEditor'), { ssr: false });

interface FileRecord {
  id: string; name: string; type: string; size: number;
  content: string; status: string; createdAt: string; updatedAt: string;
}

const CURSOR_COLORS = [
  '#e05252', '#e07e52', '#d4b84a', '#52aa5e',
  '#4a90d9', '#7c52e0', '#d452b8', '#52c9d4',
];

function colorForNode(nodeId: string): string {
  let hash = 0;
  for (let i = 0; i < nodeId.length; i++) hash = (hash * 31 + nodeId.charCodeAt(i)) | 0;
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params.id as string;
  const [file, setFile] = useState<FileRecord | null>(null);
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState(true);
  const [vcState, setVcState] = useState<number[]>([0, 0, 0]);
  const [deltaSize, setDeltaSize] = useState(0);
  const lastSave = useRef('');
  const lastSyncedAt = useRef(0);
  
  // Realtime Sync state
  const channelRef = useRef<any>(null);
  const cursorPollRef = useRef<any>(null);
  const cursorBroadcastRef = useRef<any>(null);
  const localNodeIdRef = useRef(`web-${Math.floor(Math.random()*10000)}`);
  const [remoteCursors, setRemoteCursors] = useState<any[]>([]);

  useEffect(() => {
    const stored = uGet('files');
    if (!stored) return;
    const files: FileRecord[] = JSON.parse(stored);
    const found = files.find(f => f.id === fileId);
    if (found) {
      setFile(found);
      setContent(found.content);
      lastSave.current = found.content;
    }

    const savedNodeId = localStorage.getItem('docusync_node_id');
    if (savedNodeId) localNodeIdRef.current = savedNodeId;
  }, [fileId]);

  // Connect to Matchmaker /doc polling and pushing
  useEffect(() => {
    const storedRoomStr = uGet('current_room');
    if (!storedRoomStr) return;
    try {
      const room = JSON.parse(storedRoomStr);
      if (room && (room.otp || room.id)) {
        const roomOtp = room.otp || room.id;
        const MATCHMAKER_URL = process.env.NODE_ENV === 'development'
          ? '/api/lobby'
          : 'https://docusync-pnc.vercel.app/api/lobby';

        // Polling interval
        const pollDoc = async () => {
          try {
            const url = `${MATCHMAKER_URL}/doc?otp=${roomOtp}&fileId=${fileId}&since=${lastSyncedAt.current || 0}`;
            const res = await fetch(url);
            if (!res.ok) return;
            const data = await res.json();
            if (data.unchanged || !data.snapshot) return;
            const snap = data.snapshot;
            if (snap.committedAt > (lastSyncedAt.current || 0) && snap.authorNodeId !== localNodeIdRef.current) {
              lastSyncedAt.current = snap.committedAt;
              setContent(snap.content);
              lastSave.current = snap.content;
              setSaved(true);
            }
          } catch {}
        };
        pollDoc();
        channelRef.current = setInterval(pollDoc, 1500); // reuse ref for polling interval

        const pollCursors = async () => {
          try {
            const res = await fetch(`${MATCHMAKER_URL}/cursors?otp=${roomOtp}&nodeId=${encodeURIComponent(localNodeIdRef.current)}&fileId=${fileId}`);
            if (!res.ok) return;
            const data = await res.json();
            setRemoteCursors(data.cursors || []);
          } catch {}
        };
        pollCursors();
        cursorPollRef.current = setInterval(pollCursors, 1000);
      }
    } catch {}
    
    return () => {
      if (channelRef.current) clearInterval(channelRef.current);
      if (cursorPollRef.current) clearInterval(cursorPollRef.current);
      if (cursorBroadcastRef.current) clearTimeout(cursorBroadcastRef.current);
    };
  }, [fileId]);

  // Auto-save every 500ms
  useEffect(() => {
    if (!file) return;
    const iv = setInterval(async () => {
      if (content !== lastSave.current) {
        const stored = uGet('files');
        if (!stored) return;
        const files: FileRecord[] = JSON.parse(stored);
        const idx = files.findIndex(f => f.id === fileId);
        if (idx >= 0) {
          files[idx].content = content;
          files[idx].updatedAt = new Date().toISOString();
          files[idx].size = new Blob([content]).size;
          uSet('files', JSON.stringify(files));

          // Increment VC
          let currentVc = [0, 0, 0];
          setVcState(v => {
            const n = [...v];
            n[0] = n[0] + 1;
            currentVc = n;
            return n;
          });

          // Push to Matchmaker
          const storedRoomStr = uGet('current_room');
          if (storedRoomStr) {
            try {
              const room = JSON.parse(storedRoomStr);
              const roomOtp = room.otp || room.id;
              const MATCHMAKER_URL = process.env.NODE_ENV === 'development'
                ? '/api/lobby'
                : 'https://docusync-pnc.vercel.app/api/lobby';
              const now = Date.now();
              lastSyncedAt.current = now;
              await fetch(`${MATCHMAKER_URL}/doc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  otp: roomOtp,
                  fileId,
                  authorNodeId: localNodeIdRef.current,
                  authorName: localNodeIdRef.current.slice(0, 8),
                  content,
                  vectorClock: { nodeCount: 3, nodeIndex: 0, root: { children: [] }, counters: currentVc },
                  deltaSize: Math.abs(content.length - lastSave.current.length),
                }),
              });
            } catch (e) {
              console.error('[Web Sync] Push failed:', e);
            }
          }

          // Log event
          const events = JSON.parse(localStorage.getItem(`docusync_events_${fileId}`) || '[]');
          events.push({
            id: events.length + 1,
            eventId: crypto.randomUUID(),
            fileId, nodeId: localNodeIdRef.current,
            eventType: 'edit',
            logicalTimestamp: currentVc[0],
            payload: content.slice(0, 200),
            createdAt: new Date().toISOString(),
          });
          localStorage.setItem(`docusync_events_${fileId}`, JSON.stringify(events));

          lastSave.current = content;
          setSaved(true);
        }
      }
    }, 500);
    return () => clearInterval(iv);
  }, [content, file, fileId]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setSaved(false);
  }, []);

  if (!file) {
    return (
      <PageShell>
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--t3)' }}>
          <p>File not found. <button onClick={() => router.push('/app/files')} style={{ color: 'var(--acc)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Go back</button></p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="ds-btn" onClick={() => router.push('/app/files')}>
            <ArrowLeft size={14} /> Back
          </button>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>{file.name}</h1>
            <p style={{ fontSize: 11, color: 'var(--t3)', margin: '2px 0 0' }}>
              {saved ? '✓ Saved' : '● Unsaved'} • Last: {new Date(file.updatedAt).toLocaleTimeString()}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ds-btn" onClick={() => setSaved(true)}>
            <Save size={14} /> Save
          </button>
          <button className="ds-btn ds-btn-primary">
            <RefreshCw size={14} /> Sync Now
          </button>
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, background: 'var(--bg2)', borderRadius: 12, border: '1px solid var(--b1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <TipTapEditor 
          content={content} 
          onChange={handleContentChange} 
          cursors={remoteCursors}
          onSelectionUpdate={(from, to) => {
            if (cursorBroadcastRef.current) clearTimeout(cursorBroadcastRef.current);
            cursorBroadcastRef.current = setTimeout(() => {
              const storedRoomStr = uGet('current_room');
              if (!storedRoomStr) return;
              try {
                const room = JSON.parse(storedRoomStr);
                const roomOtp = room.otp || room.id;
                const MATCHMAKER_URL = process.env.NODE_ENV === 'development'
                  ? '/api/lobby'
                  : 'https://docusync-pnc.vercel.app/api/lobby';
                fetch(`${MATCHMAKER_URL}/cursors`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    otp: roomOtp,
                    nodeId: localNodeIdRef.current,
                    displayName: localNodeIdRef.current.slice(0, 8),
                    color: colorForNode(localNodeIdRef.current),
                    from,
                    to,
                    fileId,
                  }),
                }).catch(() => {});
              } catch {}
            }, 100);
          }}
        />
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 12, padding: '8px 12px',
        background: 'var(--bg2)', border: '1px solid var(--b1)', borderRadius: 8,
        fontSize: 11, color: 'var(--t3)', fontFamily: 'monospace',
      }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <span><Clock size={10} style={{ marginRight: 4 }} />vc [{vcState.join(', ')}]</span>
          <span>Δ {deltaSize} B</span>
        </div>
        <span>0 peers connected</span>
      </div>
    </PageShell>
  );
}
