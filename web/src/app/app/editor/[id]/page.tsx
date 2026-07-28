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
  
  const setContentAndRef = (v: string) => { currentContentRef.current = v; setContent(v); };
  const [saved, setSaved] = useState(true);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
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
    setSyncStatusMsg('Syncing...');

    try {
      const deltaSize = new Blob([contentToSave]).size;
      const now = Date.now();
      lastSyncedAt.current = now;

      const otp = room.otp || room.id;
      let directSuccess = false;

      if (room.hostIp && room.hostIp !== '127.0.0.1') {
        try {
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
              vectorClock: vectorClockSnapshot,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            directSuccess = true;
            if (data.vectorClock) localVectorClockRef.current = data.vectorClock;
            if (data.escalated) {
              setConflictData({ local: contentToSave, remote: data.serverContent || data.content || '' });
              setSyncStatusMsg('Conflict Detected!');
              return;
            } else {
              setSyncStatusMsg(`Synced ✓`);
              setOfflineQueue(false);
            }
          }
        } catch (e) {}
      }

      if (!directSuccess && otp) {
        try {
          const res = await fetch('/api/lobby/doc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              otp,
              fileId,
              authorNodeId: localNodeIdRef.current,
              authorName: localNodeIdRef.current.slice(0, 8),
              content: contentToSave,
              vectorClock: vectorClockSnapshot,
              deltaSize
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.escalated) {
              setConflictData({ local: contentToSave, remote: data.serverContent || data.content || '' });
              setSyncStatusMsg('Conflict Detected!');
              return;
            }
            setSyncStatusMsg(`Synced ✓`);
            setOfflineQueue(false);
          } else if (res.status === 409) {
            const data = await res.json();
            setSyncStatusMsg('Conflict detected via LWW! Fetching latest...');
            if (data.currentVersion?.content) {
              setContentAndRef(data.currentVersion.content);
              lastSave.current = data.currentVersion.content;
            }
          } else {
            setSyncStatusMsg('Sync failed — queued for retry');
            setOfflineQueue(true);
          }
        } catch (err) {
          setSyncStatusMsg('Host unavailable');
          setOfflineQueue(true);
        }
      } else if (!directSuccess) {
        setSyncStatusMsg('Sync failed — queued for retry');
        setOfflineQueue(true);
      }
    } catch (e) {
      setSyncStatusMsg('Host unavailable');
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
      if (!navigator.onLine) return;
      const otp = room.otp || room.id;
      let polledDirect = false;

      if (room.hostIp && room.hostIp !== '127.0.0.1') {
        try {
          const baseUrl = getSyncBaseUrl(room);
          const vcStr = encodeURIComponent(JSON.stringify(localVectorClockRef.current || {}));
          const url = `${baseUrl}/sync/status?fileId=${fileId}&since=${vcStr}`;
          const res = await fetch(url);
          if (res.ok) {
            polledDirect = true;
            const data = await res.json();

            if (data.upToDate) {
              if (data.vectorClock) localVectorClockRef.current = data.vectorClock;
              return;
            }

            if (!isTypingRef.current) {
              const newContent = data.content;
              const newVc = data.vectorClock;
              if (newContent && newContent !== currentContentRef.current) {
                if (newVc) localVectorClockRef.current = newVc;
                lastSyncedAt.current = Date.now();
                setContentAndRef(newContent);
                lastSave.current = newContent;
                setSaved(true);
                setSyncStatusMsg(`↓ Synced from host`);
                
                try {
                  const stored = uGet('files');
                  if (stored) {
                    const files: FileRecord[] = JSON.parse(stored);
                    const idx = files.findIndex(f => f.id === fileId);
                    if (idx >= 0) {
                      files[idx].content = newContent;
                      files[idx].updatedAt = new Date().toISOString();
                      uSet('files', JSON.stringify(files));
                    }
                  }
                } catch {}
                return;
              }
            }
          }
        } catch {}
      }

      if (!polledDirect && otp) {
        try {
          const res = await fetch(`/api/lobby/doc?otp=${otp}&fileId=${fileId}&since=${lastSyncedAt.current}`);
          if (res.ok) {
            const data = await res.json();
            if (data.unchanged) return;
            if (data.snapshot && data.snapshot.content) {
              if (data.snapshot.authorNodeId === localNodeIdRef.current) return;
              if (!isTypingRef.current && data.snapshot.content !== currentContentRef.current) {
                lastSyncedAt.current = data.snapshot.committedAt || Date.now();
                setContentAndRef(data.snapshot.content);
                lastSave.current = data.snapshot.content;
                setSaved(true);
                setSyncStatusMsg(`↓ Synced from peer`);
                
                try {
                  const stored = uGet('files');
                  if (stored) {
                    const files: FileRecord[] = JSON.parse(stored);
                    const idx = files.findIndex(f => f.id === fileId);
                    if (idx >= 0) {
                      files[idx].content = data.snapshot.content;
                      files[idx].updatedAt = new Date().toISOString();
                      uSet('files', JSON.stringify(files));
                    }
                  }
                } catch {}
              }
            }
          }
        } catch {}
      }
    };

    channelRef.current = setInterval(pollDoc, 4000);
    return () => { if (channelRef.current) clearInterval(channelRef.current); };
  }, [fileId, getRoomHostInfo, getSyncBaseUrl]);

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

  if (!file) return (<PageShell><div style={{ padding: 60 }}>File not found.</div></PageShell>);

  return (
    <>
      {/* Offline Banner outside PageShell if desired, or inside */}
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
            <button className="ds-btn" onClick={async () => { await saveFile(content, true); setShowSaveConfirm(true); }}>Save</button>
            <button className="ds-btn ds-btn-primary" onClick={() => saveFile(content, true)} disabled={syncing}>Sync Now</button>
          </div>
        </div>

        {/* Save Confirm Modal */}
        {showSaveConfirm && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
          }}>
            <div style={{
              background: 'var(--bg-base)', borderRadius: 12, width: '100%', maxWidth: 400,
              padding: 24, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
              border: '1px solid var(--b1)'
            }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 16px 0', color: 'var(--text-primary)' }}>Document Saved</h2>
              <p style={{ fontSize: 14, color: 'var(--t3)', marginBottom: 24 }}>
                Your changes have been saved and synchronized. What would you like to do next?
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button className="ds-btn" onClick={() => setShowSaveConfirm(false)}>Continue Editing</button>
                <button className="ds-btn ds-btn-primary" onClick={() => router.push('/app/files')}>Exit to Room</button>
              </div>
            </div>
          </div>
        )}

        {/* Editor */}
        <div style={{ flex: 1, background: 'var(--bg2)', borderRadius: 12, border: '1px solid var(--b1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <TipTapEditor 
            content={content} 
            onChange={handleContentChange} 
            cursors={Object.values(remoteCursors)}
            onSelectionUpdate={(from, to) => {
              if (cursorThrottleRef.current) return;
              cursorThrottleRef.current = setTimeout(() => { cursorThrottleRef.current = null; }, 200);
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
          <span>{peers?.length || 0} peers connected</span>
        </div>
      </PageShell>

      {/* Conflict Modal */}
      {conflictData && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
        }}>
          <div style={{
            background: 'var(--bg-base)', borderRadius: 12, width: '100%', maxWidth: 1000,
            maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--amber)' }}>⚠️ Conflict Detected</h2>
              <button onClick={() => setConflictData(null)} className="ds-btn ds-btn-ghost">Cancel</button>
            </div>
            
            <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {/* Local */}
              <div style={{ flex: 1, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '8px 16px', background: 'var(--bg-sidebar)', fontSize: 13, fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
                  Local edit (offline)
                </div>
                <div style={{ flex: 1, padding: 24, overflow: 'auto', background: '#fff', color: '#000', fontSize: 14 }}>
                  {(() => {
                    const strip = (s: string) => s.replace(/<[^>]*>?/gm, ' ');
                    const diffs = diffWords(strip(conflictData.remote), strip(conflictData.local));
                    return diffs.map((part, i) => {
                      if (part.removed) return null;
                      return (
                      <span key={i} style={{ 
                        background: part.added ? '#86efac' : 'transparent',
                        color: 'inherit',
                      }}>
                        {part.value}
                      </span>
                    )});
                  })()}
                </div>
                <div style={{ padding: 16, borderTop: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
                   <button className="ds-btn ds-btn-primary" style={{ width: '100%' }} onClick={() => {
                     saveFile(conflictData.local, true);
                     setConflictData(null);
                   }}>
                     Keep Local Edit
                   </button>
                </div>
              </div>
              
              {/* Remote */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '8px 16px', background: 'var(--bg-sidebar)', fontSize: 13, fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
                  Updated version file (online)
                </div>
                <div style={{ flex: 1, padding: 24, overflow: 'auto', background: '#fff', color: '#000', fontSize: 14 }}>
                  {(() => {
                    const strip = (s: string) => s.replace(/<[^>]*>?/gm, ' ');
                    const diffs = diffWords(strip(conflictData.remote), strip(conflictData.local));
                    return diffs.map((part, i) => {
                      if (part.added) return null;
                      return (
                      <span key={i} style={{ 
                        background: part.removed ? '#fca5a5' : 'transparent',
                        textDecoration: part.removed ? 'line-through' : 'none',
                      }}>
                        {part.value}
                      </span>
                    )});
                  })()}
                </div>
                <div style={{ padding: 16, borderTop: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
                   <button className="ds-btn" style={{ width: '100%' }} onClick={() => {
                     setContentAndRef(conflictData.remote);
                     saveFile(conflictData.remote, true);
                     setConflictData(null);
                   }}>
                     Accept Online Version
                   </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
