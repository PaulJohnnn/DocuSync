'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { ArrowLeft, Save, RefreshCw, Clock, WifiOff, Wifi } from 'lucide-react';
import dynamic from 'next/dynamic';
import { uGet, uSet } from '@/lib/userStorage';
import { useWebSync } from '@/context/WebSyncContext';
import { diffWords } from 'diff';
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
  const [conflictData, setConflictData] = useState<{ local: string; remote: string } | null>(null);
  const [editor, setEditor] = useState<any>(null);
  
  const setContentAndRef = (v: string) => { currentContentRef.current = v; setContent(v); };
  const [saved, setSaved] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatusMsg, setSyncStatusMsg] = useState('Ready');
  const [offlineQueue, setOfflineQueue] = useState(false);
  
  const lastSave = useRef('');
  const lastSyncedAt = useRef(0);
  const channelRef = useRef<any>(null);
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
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

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

  const getRoomHostInfo = useCallback((): any | null => {
    try {
      const storedRoomStr = uGet('current_room');
      if (!storedRoomStr) return null;
      return JSON.parse(storedRoomStr);
    } catch { return null; }
  }, []);

  const getSyncBaseUrl = useCallback((room: any): string => {
    const ip = room?.hostIp;
    if (!ip) throw new Error("Couldn't find host address");
    const rawPort = room?.hostPort;
    const port = (rawPort && rawPort !== 3000 && rawPort !== Number(window.location?.port)) ? rawPort : 9000;
    return `http://${ip}:${port}`;
  }, []);

  // ── Push content to Host ──────────────────────────────────────────────────
  const pushToHost = useCallback(async (contentToSave: string, vectorClockSnapshot: Record<string, number>, explicit = false) => {
    const room = getRoomHostInfo();
    if (!room || !room.hostIp) {
      setSyncStatusMsg("Host unavailable");
      return;
    }

    if (!navigator.onLine) {
      setSyncStatusMsg('Offline — queued');
      setOfflineQueue(true);
      return;
    }

    setSyncing(true);
    try {
      const otp = room.otp || room.id;
      const res = await fetch('/api/lobby/doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otp,
          fileId,
          authorNodeId: localNodeIdRef.current,
          content: contentToSave,
          vectorClock: vectorClockSnapshot,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.escalated) {
          setConflictData({ local: contentToSave, remote: data.serverContent || '' });
          setSyncStatusMsg('Conflict Detected!');
        } else {
          setSyncStatusMsg(`Synced ✓`);
        }
      }
    } catch (e) {
      setSyncStatusMsg('Host unavailable');
      setOfflineQueue(true);
    } finally {
      setSyncing(false);
    }
  }, [fileId, getRoomHostInfo]);

  // ── Poll Host for remote updates ─────────────────────────────────────────
  useEffect(() => {
    const room = getRoomHostInfo();
    if (!room || !room.hostIp) return;

    const pollDoc = async () => {
      if (!navigator.onLine) return;
      const otp = room.otp || room.id;
      try {
        const res = await fetch(`/api/lobby/doc?otp=${otp}&fileId=${fileId}&since=${lastSyncedAt.current}`);
        if (res.ok) {
          const data = await res.json();
          if (data.snapshot && data.snapshot.content && !isTypingRef.current && data.snapshot.content !== currentContentRef.current) {
            setContentAndRef(data.snapshot.content);
            lastSave.current = data.snapshot.content;
            setSaved(true);
            setSyncStatusMsg(`↓ Synced`);
          }
        }
      } catch {}
    };

    channelRef.current = setInterval(pollDoc, 4000);
    return () => { if (channelRef.current) clearInterval(channelRef.current); };
  }, [fileId, getRoomHostInfo]);

  const saveFile = useCallback(async (contentToSave: string, forcePush = false) => {
    if (contentToSave === lastSave.current && !forcePush) return;
    localVectorClockRef.current = incrementVectorClock(localVectorClockRef.current, 1);
    
    const stored = uGet('files');
    if (stored) {
      const files: FileRecord[] = JSON.parse(stored);
      const idx = files.findIndex(f => f.id === fileId);
      if (idx >= 0) {
        files[idx].content = contentToSave;
        files[idx].updatedAt = new Date().toISOString();
        uSet('files', JSON.stringify(files));
      }
    }

    lastSave.current = contentToSave;
    setSaved(true);

    if (syncDebounce.current) clearTimeout(syncDebounce.current);
    if (forcePush) {
      await pushToHost(contentToSave, localVectorClockRef.current, true);
    } else {
      syncDebounce.current = setTimeout(() => {
        pushToHost(contentToSave, localVectorClockRef.current);
      }, 2000);
    }
  }, [fileId, pushToHost]);

  const handleContentChange = useCallback((newContent: string) => {
    setContentAndRef(newContent);
    setSaved(false);
    isTypingRef.current = true;
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => { isTypingRef.current = false; }, 2000);
  }, []);

  useEffect(() => {
    if (!file) return;
    const timer = setTimeout(() => { saveFile(content); }, 500);
    return () => clearTimeout(timer);
  }, [content, file, saveFile]);

  if (!file) return <PageShell><div style={{ padding: 60 }}>File not found.</div></PageShell>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {!isOnline && (
        <div style={{ background: '#f59e0b', color: '#000', padding: '6px 16px', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <WifiOff size={14} /> <span>You are currently offline. Edits saved locally.</span>
        </div>
      )}

      <PageShell>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="ds-btn" onClick={async () => { await saveFile(content, true); router.push('/app/files'); }}>
              <ArrowLeft size={14} /> Back
            </button>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{file.name}</h1>
              <p style={{ fontSize: 11, color: 'var(--t3)' }}>{syncStatusMsg}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ds-btn" onClick={() => saveFile(content, true)}>Save</button>
            <button className="ds-btn ds-btn-primary" onClick={() => saveFile(content, true)} disabled={syncing}>Sync Now</button>
          </div>
        </div>

        <div style={{ flex: 1, background: 'var(--bg2)', borderRadius: 12, border: '1px solid var(--b1)', overflow: 'hidden' }}>
          <TipTapEditor 
            content={content} 
            onChange={handleContentChange} 
            cursors={Object.values(remoteCursors)}
            onEditorInstance={setEditor}
            onSelectionUpdate={(from, to) => {
              if (cursorThrottleRef.current) return;
              cursorThrottleRef.current = setTimeout(() => { cursorThrottleRef.current = null; }, 200);
              pushCursor(fileId, from, 1);
            }}
          />
        </div>
      </PageShell>
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
