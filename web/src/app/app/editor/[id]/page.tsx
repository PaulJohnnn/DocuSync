'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { ArrowLeft, Save, RefreshCw, Clock, WifiOff, Wifi } from 'lucide-react';
import dynamic from 'next/dynamic';
import { uGet, uSet } from '@/lib/userStorage';
import { useWebSync } from '@/context/WebSyncContext';
const TipTapEditor = dynamic(() => import('@/components/TipTapEditor'), { ssr: false });
import type { RemoteCursor } from '@/components/TipTapEditor';

// ── Matchmaker URL ─────────────────────────────────────────────────────────
const MATCHMAKER_URL = process.env.NODE_ENV === 'development'
  ? '/api/lobby'
  : 'https://docusync-pnc.vercel.app/api/lobby';

function incrementVectorClock(vcJson: any, targetNodeIndex: number) {
  if (!vcJson || !vcJson.root) return vcJson;
  const clone = JSON.parse(JSON.stringify(vcJson));
  let currentLeaf = 0;
  function traverse(node: any) {
    if (!node.children || node.children.length === 0) {
      if (currentLeaf === targetNodeIndex) node.counter = (node.counter || 0) + 1;
      currentLeaf++;
      return;
    }
    for (const child of node.children) traverse(child);
  }
  traverse(clone.root);
  return clone;
}

interface FileRecord {
  id: string; name: string; type: string; size: number;
  content: string; status: string; createdAt: string; updatedAt: string;
}

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params.id as string;
  const [file, setFile] = useState<FileRecord | null>(null);
  const [content, setContent] = useState('');
  // Mirror every content update into currentContentRef so interval closures stay fresh.
  const setContentAndRef = (v: string) => { currentContentRef.current = v; setContent(v); };
  const [saved, setSaved] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatusMsg, setSyncStatusMsg] = useState('Ready');
  const [escalated, setEscalated] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState(false);
  
  const lastSave = useRef('');
  const lastSyncedAt = useRef(0);
  const channelRef = useRef<any>(null);
  // Always tracks the live content value so the polling closure never reads stale state.
  const currentContentRef = useRef('');
  const localNodeIdRef = useRef(`web-${Math.floor(Math.random()*10000)}`);
  const syncDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const createInitialWebClock = () => ({
    nodeCount: 3,
    nodeIndex: 1,
    root: {
      counter: 0,
      children: [
        { counter: 0, children: [] },
        { counter: 0, children: [] },
        { counter: 0, children: [] }
      ]
    }
  });
  const localVectorClockRef = useRef<any>(createInitialWebClock());

  const { peers, pushCursor } = useWebSync();
  const connectedPeersCount = peers.filter((p) => p.status === 'connected').length;

  // ── Remote Cursors ─────────────────────────────────────────────────────────
  const cursorThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor & { lastUpdate: number }>>({});

  useEffect(() => {
    const handleCursor = (e: any) => {
      const msg = e.detail;
      const localFileId = Number(fileId);
      if (msg.fileId !== localFileId) return;
      const color = msg.nodeIndex === 0 ? '#3b82f6' : msg.nodeIndex === 1 ? '#10b981' : '#f59e0b';
      const displayName = msg.nodeIndex === 0 ? 'Desktop' : msg.nodeIndex === 1 ? 'Web' : 'Mobile';
      setRemoteCursors(prev => ({
        ...prev,
        [msg.nodeId]: {
          nodeId: msg.nodeId,
          displayName,
          color,
          from: msg.position,
          to: msg.position,
          lastUpdate: Date.now()
        }
      }));
    };
    window.addEventListener('docusync_ws_cursor', handleCursor);
    return () => window.removeEventListener('docusync_ws_cursor', handleCursor);
  }, [fileId]);

  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
      setRemoteCursors(prev => {
        const next = { ...prev };
        let changed = false;
        for (const [id, c] of Object.entries(next)) {
          if (now - c.lastUpdate > 5000) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // ── Online/Offline detection ──────────────────────────────────────────────
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      // If we had queued edits, push them now
      if (offlineQueue) {
        pushToHost(content, localVectorClockRef.current, true);
        setOfflineQueue(false);
      }
    };
    const goOffline = () => {
      setIsOnline(false);
      setSyncStatusMsg('Offline — edits saved locally');
    };
    setIsOnline(navigator.onLine);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [offlineQueue, content]);

  // ── Load file from local storage ──────────────────────────────────────────
  useEffect(() => {
    const stored = uGet('files');
    if (!stored) return;
    const files: FileRecord[] = JSON.parse(stored);
    const found = files.find(f => f.id === fileId);
    if (found) {
      setFile(found);
      setContentAndRef(found.content);
      lastSave.current = found.content;
    }

    const savedNodeId = localStorage.getItem('docusync_node_id');
    if (savedNodeId) localNodeIdRef.current = savedNodeId;
  }, [fileId]);

  // ── Get room host info ──────────────────────────────────────────────────
  const getRoomHostInfo = useCallback((): any | null => {
    try {
      const storedRoomStr = uGet('current_room');
      if (!storedRoomStr) return null;
      return JSON.parse(storedRoomStr);
    } catch { return null; }
  }, []);

  const getSyncBaseUrl = useCallback((room: any): string => {
    const ip = room?.hostIp || '127.0.0.1';
    const rawPort = room?.hostPort;
    const port = (rawPort && rawPort !== 3000 && rawPort !== Number(window.location?.port)) ? rawPort : 9000;
    return `http://${ip}:${port}`;
  }, []);

  // ── Push content to Host ──────────────────────────────────────────────────
  const pushToHost = useCallback(async (contentToSave: string, vectorClockSnapshot: Record<string, number>, explicit = false) => {
    const room = getRoomHostInfo();
    if (!room || !room.hostIp) {
      setSyncStatusMsg('Host address missing');
      return;
    }

    if (!navigator.onLine) {
      setSyncStatusMsg('Offline — queued for sync');
      setOfflineQueue(true);
      return;
    }

    setSyncing(true);
    setSyncStatusMsg('Syncing...');

    try {
      const deltaSize = new Blob([contentToSave]).size;
      const now = Date.now();
      lastSyncedAt.current = now;

      console.log('[Web Test] Editing on Web. Local vector clock:', JSON.stringify(vectorClockSnapshot));
      if (typeof window !== 'undefined' && (window as any).__DOCUSYNC_DEV_OFFLINE__) {
        console.log('[Web Test] Simulated Dev Offline Mode active — push deferred');
        setSyncStatusMsg('Offline (Simulated) — queued for sync');
        setOfflineQueue(true);
        setSyncing(false);
        return;
      }
      const baseUrl = getSyncBaseUrl(room);
      const res = await fetch(`${baseUrl}/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          authorNodeId: localNodeIdRef.current,
          authorName: localNodeIdRef.current.slice(0, 8),
          nodeId: localNodeIdRef.current,
          content: contentToSave,
          vectorClock: vectorClockSnapshot, // Fully formed VectorClockJSON
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.vectorClock) {
          localVectorClockRef.current = data.vectorClock;
        }
        if (data.escalated) {
          setEscalated(true);
          setSyncStatusMsg('Conflict — sent to owner for review');
          setTimeout(() => setEscalated(false), 5000);
        } else {
          setSyncStatusMsg(`Synced ✓ (v${data.seq || '?'}) at ${new Date().toLocaleTimeString()}`);
          setOfflineQueue(false);
        }
      } else {
        setSyncStatusMsg('Sync failed — queued for retry');
        setOfflineQueue(true);
      }
    } catch (e) {
      console.error('[Web Sync] Push failed:', e);
      setSyncStatusMsg('Host unavailable — edits saving locally');
      setOfflineQueue(true);
    } finally {
      setSyncing(false);
    }
  }, [fileId, getRoomHostInfo, getSyncBaseUrl]);

  // ── Poll Host for remote updates ─────────────────────────────────────────
  useEffect(() => {
    const room = getRoomHostInfo();
    if (!room || !room.hostIp) return;

    const pollDoc = async () => {
      if (!navigator.onLine || (typeof window !== 'undefined' && (window as any).__DOCUSYNC_DEV_OFFLINE__)) return;
      try {
        const baseUrl = getSyncBaseUrl(room);
        const vcStr = encodeURIComponent(JSON.stringify(localVectorClockRef.current || {}));
        const url = `${baseUrl}/sync/status?fileId=${fileId}&since=${vcStr}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();

        if (data.upToDate) {
          if (lastSyncedAt.current > 0) {
            setSyncStatusMsg(`Last synced ${new Date().toLocaleTimeString()}`);
          }
          if (data.vectorClock) localVectorClockRef.current = data.vectorClock;
          return;
        }

        // If user is actively typing, skip applying remote updates to prevent cursor jumps
        if (isTypingRef.current) return;

        // The desktop host sends 'content' and 'vectorClock'
        const newContent = data.content;
        const newVc = data.vectorClock;
        
        if (newContent && newContent !== currentContentRef.current) {
          // Initialize or update vector clock if Desktop gave us one
          if (newVc) localVectorClockRef.current = newVc;
          
          lastSyncedAt.current = Date.now();
          setContentAndRef(newContent);
          lastSave.current = newContent;
          setSaved(true);
          setSyncStatusMsg(`↓ Synced from host at ${new Date().toLocaleTimeString()}`);

          // Also update local storage so the file list shows latest content
          try {
            const stored = uGet('files');
            if (stored) {
              const files: FileRecord[] = JSON.parse(stored);
              const idx = files.findIndex(f => f.id === fileId);
              if (idx >= 0) {
                files[idx].content = newContent;
                files[idx].updatedAt = new Date().toISOString();
                files[idx].size = new Blob([newContent]).size;
                uSet('files', JSON.stringify(files));
              }
            }
          } catch {}
        }
      } catch {
        // Fetch failed — host is unreachable or down
        setSyncStatusMsg('Host unavailable — edits saving locally');
        // We only set offlineQueue true here if we actually have unsynced edits,
        // but for safety, setting the message gives the user the right visual feedback.
      }
    };

    pollDoc();
    channelRef.current = setInterval(pollDoc, 3000);
    return () => { if (channelRef.current) clearInterval(channelRef.current); };
  // NOTE: `content` intentionally NOT in deps — the poll must run on a stable
  // interval regardless of typing. currentContentRef.current is used instead
  // of the stale closure value for the equality check inside the interval.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, getRoomHostInfo, getSyncBaseUrl]);

  // ── Save locally + push to Host (debounced) ─────────────────────────────
  const saveFile = useCallback(async (contentToSave: string, forcePush = false) => {
    if (contentToSave === lastSave.current && !forcePush) return;

    // Step 1: Increment our vector clock for the local edit
    // Assume Web is nodeIndex 1. The desktop host generates nodeCount=2.
    if (!localVectorClockRef.current || !localVectorClockRef.current.root) {
      localVectorClockRef.current = createInitialWebClock();
    }
    localVectorClockRef.current = incrementVectorClock(localVectorClockRef.current, 1);
    localVectorClockRef.current.nodeIndex = 1; // Mark us as node 1

    // Step 2: Save locally
    const stored = uGet('files');
    if (!stored) return;
    const files: FileRecord[] = JSON.parse(stored);
    const idx = files.findIndex(f => f.id === fileId);
    if (idx >= 0) {
      files[idx].content = contentToSave;
      files[idx].updatedAt = new Date().toISOString();
      files[idx].size = new Blob([contentToSave]).size;
      uSet('files', JSON.stringify(files));
    }

    // Log to local event history
    const events = JSON.parse(localStorage.getItem(`docusync_events_${fileId}`) || '[]');
    events.push({
      id: events.length + 1,
      eventId: crypto.randomUUID(),
      fileId, nodeId: localNodeIdRef.current,
      eventType: 'edit',
      logicalTimestamp: events.length + 1,
      payload: contentToSave.slice(0, 200),
      vectorClock: localVectorClockRef.current,
      timestamp: new Date().toISOString(),
    });
    localStorage.setItem(`docusync_events_${fileId}`, JSON.stringify(events));

    lastSave.current = contentToSave;
    setSaved(true);

    // Step 3: Push to Host
    if (syncDebounce.current) clearTimeout(syncDebounce.current);
    if (forcePush) {
      await pushToHost(contentToSave, localVectorClockRef.current, true);
    } else {
      syncDebounce.current = setTimeout(() => {
        pushToHost(contentToSave, localVectorClockRef.current);
      }, 2000);
    }
  }, [fileId, pushToHost]);

  // ── Handle Editor Change ───────────────────────────────────────────
  const handleContentChange = useCallback((newContent: string) => {
    setContentAndRef(newContent);
    setSaved(false);
    isTypingRef.current = true;
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      isTypingRef.current = false;
    }, 2000);
  }, []);

  // ── Auto-save on content change ───────────────────────────────────────────
  useEffect(() => {
    if (!file) return;
    const timer = setTimeout(() => { saveFile(content); }, 500);
    return () => clearTimeout(timer);
  }, [content, file, saveFile]);

  // ── Explicit Sync Now ─────────────────────────────────────────────────────
  const handleSyncNow = useCallback(async () => {
    await saveFile(content, true);
  }, [content, saveFile]);

  // ── Render ────────────────────────────────────────────────────────────────

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
      {escalated && (
        <div style={{ background: 'var(--bg-warn)', color: '#d97706', padding: '10px 16px', borderRadius: 8, marginBottom: 16 }}>
          Change escalated to room owner for conflict resolution.
        </div>
      )}
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="ds-btn" onClick={async () => { await saveFile(content, true); router.push('/app/files'); }}>
            <ArrowLeft size={14} /> Back
          </button>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>{file.name}</h1>
            <p style={{ fontSize: 11, color: 'var(--t3)', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              {saved ? '✓ Saved' : '● Unsaved'} • 
              {isOnline
                ? (
                  <>
                    <Wifi 
                      size={10} 
                      style={{ color: (offlineQueue || syncStatusMsg.includes('unavailable') || syncStatusMsg.includes('failed')) ? '#f97316' : 'var(--green, #22c55e)' }} 
                    /> 
                    {syncStatusMsg}
                  </>
                )
                : <><WifiOff size={10} style={{ color: '#ef4444' }} /> Offline — edits saved locally</>
              }
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ds-btn" onClick={() => saveFile(content, false)}>
            <Save size={14} /> Save
          </button>
          <button className="ds-btn ds-btn-primary" onClick={handleSyncNow} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? 'ds-spin' : ''} /> {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, background: 'var(--bg2)', borderRadius: 12, border: '1px solid var(--b1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <TipTapEditor 
          content={content} 
          onChange={handleContentChange} 
          cursors={Object.values(remoteCursors)}
          onSelectionUpdate={(from, to) => {
            if (cursorThrottleRef.current) return;
            cursorThrottleRef.current = setTimeout(() => {
              cursorThrottleRef.current = null;
            }, 200);
            pushCursor(fileId, from, 1);
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
          <span><Clock size={10} style={{ marginRight: 4 }} />file: {file.name}</span>
          <span>Δ {new Blob([content]).size} B</span>
          {offlineQueue && <span style={{ color: '#ef4444' }}>⏳ Queued offline</span>}
        </div>
        <span>{connectedPeersCount} peers connected</span>
      </div>
    </PageShell>
  );
}
