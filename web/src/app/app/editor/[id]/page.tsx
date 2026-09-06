'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { ArrowLeft, Clock } from 'lucide-react';
import dynamic from 'next/dynamic';
import { uGet, uSet } from '@/lib/userStorage';
import { useWebSync } from '@/context/WebSyncContext';
import { useSyncState } from '@/context/SyncStateContext';
const TipTapEditor = dynamic(() => import('@/components/TipTapEditor'), { ssr: false });
import type { RemoteCursor } from '@/components/TipTapEditor';
import { toast } from 'sonner';
// ── Matchmaker URL ─────────────────────────────────────────────────────────
const _MATCHMAKER_URL = process.env.NODE_ENV === 'development'
  ? '/api/lobby'
  : '/api/lobby';

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
  const { syncState, registerReconnectCallback } = useSyncState();
  const [file, setFile] = useState<FileRecord | null>(null);
  const [content, setContent] = useState('');

  
  const setContentAndRef = (v: string) => { currentContentRef.current = v; setContent(v); };
  const [_saved, setSaved] = useState(true);
  const [_showSaveConfirm, _setShowSaveConfirm] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatusMsg, setSyncStatusMsg] = useState('Ready');
  const [offlineQueue, setOfflineQueue] = useState(false);
  
  const lastSave = useRef('');
  // Read save timestamp synchronously so the poll guard is active immediately,
  // before any useEffect fires. useRef(fn) does NOT lazy-init like useState.
  const _initSaveTs = typeof window !== 'undefined'
    ? Number(uGet(`docusync_save_ts_${fileId}`) || 0)
    : 0;
  const lastSyncedAt = useRef(_initSaveTs);
  const channelRef = useRef<any>(null);
  const currentContentRef = useRef('');
  const localNodeIdRef = useRef(`web-${Math.floor(Math.random()*10000)}`);
  const _syncDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const _typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const hasPendingChangesRef = useRef(false);
  const isPushingRef = useRef(false);
  const queuedContentRef = useRef<string | null>(null);
  // Same ts for lastLocalSaveTime — the poll guard uses this to block old snapshots
  const lastLocalSaveTime = useRef<number>(_initSaveTs);
  const createInitialWebClock = () => {
    let nodeIndex = 1;
    try {
      // Force alternating assignment between 1 and 2 to guarantee distinct slots for up to 2 tabs.
      const lastAssigned = parseInt(uGet('docusync_last_assigned_index') || '2', 10);
      nodeIndex = lastAssigned === 1 ? 2 : 1;
      uSet('docusync_last_assigned_index', String(nodeIndex));
    } catch {}
    
    // Safety fallback
    if (isNaN(nodeIndex) || nodeIndex < 1 || nodeIndex > 2) {
      nodeIndex = 1;
    }
    return {
      nodeCount: 3,
      nodeIndex,
      root: {
        counter: 0,
        children: [
          { counter: 0, children: [] },
          { counter: 0, children: [] },
          { counter: 0, children: [] }
        ]
      }
    };
  };
  const localVectorClockRef = useRef<any>(createInitialWebClock());

  const { peers, pushCursor } = useWebSync();
  const _connectedPeersCount = peers.filter((p) => p.status === 'connected').length;

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

  // ── Live remote delta listener (WebSockets) ──────────────────────────────
  useEffect(() => {
    const handleDelta = (e: any) => {
      const msg = e.detail;
      const localFileId = Number(fileId);
      if (msg.fileId !== localFileId) return;
      // Ignore reflections of our own edits that arrive late over WebSocket
      if (msg.nodeId === localNodeIdRef.current) return;
      if (msg.authorNodeId === localNodeIdRef.current) return;
      if (isTypingRef.current || hasPendingChangesRef.current) return; // Don't stomp on local typing or pending pushes
      console.log('[APPLY]', 'source:', msg.nodeId, 'my content before:', currentContentRef.current, 'incoming content:', msg.content);
      if (msg.content && msg.content !== currentContentRef.current) {
        isApplyingRemoteRef.current = true;
        lastSyncedAt.current = msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now();
        setContentAndRef(msg.content);
        lastSave.current = msg.content;
        setSaved(true);
        setSyncStatusMsg(`↓ Live Synced`);
        setTimeout(() => { isApplyingRemoteRef.current = false; }, 500);
        if (msg.vectorClockJson) {
          const myIdx = localVectorClockRef.current.nodeIndex;
          localVectorClockRef.current = msg.vectorClockJson;
          localVectorClockRef.current.nodeIndex = myIdx;
        }
        
        try {
          const stored = uGet('files');
          if (stored) {
            const files: FileRecord[] = JSON.parse(stored);
            const idx = files.findIndex(f => f.id === fileId);
            if (idx >= 0) {
              files[idx].content = msg.content;
              files[idx].updatedAt = new Date().toISOString();
              uSet('files', JSON.stringify(files));
            }
          }
        } catch {}
      }
    };
    window.addEventListener('docusync_ws_delta', handleDelta);
    return () => window.removeEventListener('docusync_ws_delta', handleDelta);
  }, [fileId]);

  // ── Remote Conflict Resolution Listeners (WebSockets) ────────────────────
  useEffect(() => {
    const handleResolution = (e: any) => {
      const msg = e.detail;
      const localFileId = Number(fileId);
      if (msg.fileId !== localFileId) return;
      
      console.log('[CONFLICT RESOLVED] Host resolved conflict block. Unlocking local diff barriers.');
      
      // Crucial: Unlock the Web App's pending push state
      hasPendingChangesRef.current = false;
      setSyncStatusMsg('Resolved (by Host)');
      
      // Clear any cached Web UI conflict alerts for this file
      try {
        const stored = uGet('docusync_web_conflicts');
        if (stored) {
          let conflicts = JSON.parse(stored);
          conflicts = conflicts.filter((c: any) => c.fileId !== fileId);
          uSet('docusync_web_conflicts', JSON.stringify(conflicts)); 
        }
      } catch (err) {}
    };

    window.addEventListener('docusync_ws_merge_accept', handleResolution);
    window.addEventListener('docusync_ws_merge_reject', handleResolution);
    return () => {
      window.removeEventListener('docusync_ws_merge_accept', handleResolution);
      window.removeEventListener('docusync_ws_merge_reject', handleResolution);
    };
  }, [fileId]);


  // ── Online/Offline detection ──────────────────────────────────────────────
  useEffect(() => {
    const isActuallyOnline = navigator.onLine;
    const isDevOffline = (window as any).__DOCUSYNC_DEV_OFFLINE__ === true || syncState === 'offline';
    setIsOnline(isActuallyOnline && !isDevOffline);

    const goOnline = () => {
      const devOffline = (window as any).__DOCUSYNC_DEV_OFFLINE__ === true || syncState === 'offline';
      setIsOnline(!devOffline);
      if (!devOffline) {
        console.log('[Online Flusher] Network reconnected! Waiting for user to click Reconnect...');
      }
    };
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [syncState]);

  const updateLocalStorageFile = useCallback((fileIdToUpdate: string, newContent: string) => {
    try {
      const stored = uGet('files');
      if (stored) {
        const files: FileRecord[] = JSON.parse(stored);
        const idx = files.findIndex(f => String(f.id) === String(fileIdToUpdate));
        if (idx >= 0) {
          files[idx].content = newContent;
          files[idx].updatedAt = new Date().toISOString();
          uSet('files', JSON.stringify(files));
        }
      }
    } catch (_e) {}
  }, []);

  // ── Load file from local storage ──────────────────────────────────────────
  useEffect(() => {
    const stored = uGet('files');
    if (!stored) return;
    const files: FileRecord[] = JSON.parse(stored);
    const found = files.find(f => String(f.id) === String(fileId));
    if (found) {
      setFile(found);
      setContentAndRef(found.content);
      lastSave.current = found.content;
      // Restore the last save time so poll won't overwrite with older remote
      const savedTs = uGet(`docusync_save_ts_${fileId}`);
      if (savedTs) {
        const ts = Number(savedTs);
        lastLocalSaveTime.current = ts;
        lastSyncedAt.current = ts;
      }
    }

    const savedNodeId = sessionStorage.getItem('docusync_node_id');
    if (savedNodeId) localNodeIdRef.current = savedNodeId;

    // Strictly rely on the Desktop Host via WebSockets for the canonical snapshot.
  }, [fileId, updateLocalStorageFile]);

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
    // Instantly update local storage representation of the file so rejoining file displays new content
    updateLocalStorageFile(fileId, contentToSave);

    const room = getRoomHostInfo();
    const otp = room?.otp || room?.id;
    if (!room && !otp) {
      setSyncStatusMsg("Room unavailable");
      return;
    }

    if (!navigator.onLine || syncState === 'offline' || (window as any).__DOCUSYNC_DEV_OFFLINE__ === true) {
      setSyncStatusMsg('Offline — queued');
      setOfflineQueue(true);
      return;
    }

    setSyncing(true);
    setSyncStatusMsg('Syncing...');

    try {
      const _deltaSize = new Blob([contentToSave]).size;
      const now = Date.now();
      lastSyncedAt.current = now;

      let directSuccess = false;

      if (room?.hostIp) {
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
              isOfflineReconnect: offlineQueue,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            directSuccess = true;
            if (data.vectorClock) {
              const myIdx = localVectorClockRef.current.nodeIndex;
              localVectorClockRef.current = data.vectorClock;
              localVectorClockRef.current.nodeIndex = myIdx;
            }
            if (data.escalated) {
              const conflict = {
                id: `web-conflict-${Date.now()}`,
                fileId: fileId,
                localContent: contentToSave,
                serverContent: data.serverContent || data.content || '',
                timestamp: Date.now()
              };
              let conflicts = [];
              try {
                const stored = uGet('docusync_web_conflicts');
                if (stored) conflicts = JSON.parse(stored);
              } catch (_e) {}
              conflicts.push(conflict);
              uSet('docusync_web_conflicts', JSON.stringify(conflicts));
              
              setSyncStatusMsg('Conflict Detected! Check menu.');
              if (explicit) {
                toast.error('Offline Conflict Detected! Check menu.', { duration: 6000 });
              }
              setOfflineQueue(false);
              hasPendingChangesRef.current = false;
              return;
            } else {
              if (data.lwwResolved) {
                if (explicit) {
                  toast.success('Conflict resolved using Last-Write-Wins', { duration: 4000 });
                }
              }
              setSyncStatusMsg(`Synced ✓`);
              setOfflineQueue(false);
              console.log('[OfflineQueue] Reset to false after sync');
              hasPendingChangesRef.current = false;
            }
          }
        } catch (_e) {}
      }

      if (!directSuccess) {
        // Fallback to Matchmaker Cloud if local IP is blocked (Mixed Content) or offline
        if (room && otp) {
          try {
            const mmRes = await fetch(`${_MATCHMAKER_URL}/doc`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                otp,
                fileId,
                authorNodeId: localNodeIdRef.current,
                content: contentToSave,
                vectorClock: vectorClockSnapshot,
                committedAt: Date.now()
              }),
            });
            if (mmRes.ok) {
              setSyncStatusMsg(`Cloud Synced ✓`);
              setOfflineQueue(false);
              hasPendingChangesRef.current = false;
              directSuccess = true;
            }
          } catch (e) {
            // Matchmaker also failed
          }
        }
        
        if (!directSuccess) {
          setSyncStatusMsg('Sync failed — queued for retry');
          setOfflineQueue(true);
        }
      }
    } catch (_e) {
      setSyncStatusMsg('Host unavailable');
      setOfflineQueue(true);
    } finally {
      setSyncing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, getRoomHostInfo, getSyncBaseUrl, offlineQueue, syncState, updateLocalStorageFile]);

  // ── Track last accepted seq to avoid re-applying same snapshot ───────────
  const _lastAcceptedSeq = useRef<number>(0);

  // ── Poll Matchmaker for remote updates ───────────────────────────────────
  useEffect(() => {
    const pollDoc = async () => {
      if (!navigator.onLine) return;
      if (isTypingRef.current || hasPendingChangesRef.current) return; // Don't interrupt active typing or pending saves

      // Read room dynamically every tick — the room might be loaded after mount
      const room = getRoomHostInfo();
      if (!room) return;

      // ALWAYS use room.otp (the short Desktop code like "8WUSP2")
      // Do NOT fall back to room.id (which is a UUID, not the OTP)
      const otp = room.otp;
      if (!otp) return;

      try {
        // Step 1: Try direct Desktop host first (faster, real-time)
        if (room.hostIp) {
          try {
            const baseUrl = getSyncBaseUrl(room);
            const vcStr = encodeURIComponent(JSON.stringify(localVectorClockRef.current || {}));
            const res = await fetch(`${baseUrl}/sync/status?fileId=${fileId}&since=${vcStr}`);
            if (res.ok) {
              const data = await res.json();
              if (!data.upToDate && data.content && data.authorNodeId !== localNodeIdRef.current) {
                if (!(isTypingRef.current || hasPendingChangesRef.current) && data.content !== currentContentRef.current) {
                  setContentAndRef(data.content);
                  lastSave.current = data.content;
                  setSaved(true);
                  setSyncStatusMsg('↓ Live synced from host');
                  lastSyncedAt.current = Date.now();
                }
              }
              return; // successfully polled direct host
            }
          } catch {
            // fall through to Matchmaker
          }
        }


      } catch {}
    };

    channelRef.current = setInterval(pollDoc, 500);
    return () => { if (channelRef.current) clearInterval(channelRef.current); };
  }, [fileId, getRoomHostInfo, getSyncBaseUrl]);



  const saveFile = useCallback(async (contentToSave: string, forcePush = false) => {
    if (contentToSave === lastSave.current && !forcePush) return;
    
    if (isPushingRef.current) {
      queuedContentRef.current = contentToSave;
      return;
    }

    isPushingRef.current = true;
    try {
      localVectorClockRef.current = incrementVectorClock(
        localVectorClockRef.current,
        localVectorClockRef.current.nodeIndex
      );
      
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
    // NOTE: Do NOT update lastSyncedAt here — only update it when we receive
    // content from the server. Updating it on save would cause the Matchmaker
    // poll to return 'unchanged' for Desktop edits saved before our save time.

    console.log('[VC SHAPE]', JSON.stringify(localVectorClockRef.current, null, 2));

    console.log('[SEND]', JSON.stringify(localVectorClockRef.current));
    await pushToHost(contentToSave, localVectorClockRef.current, forcePush);
    } finally {
      isPushingRef.current = false;
      if (queuedContentRef.current !== null) {
        const nextContent = queuedContentRef.current;
        queuedContentRef.current = null;
        saveFile(nextContent);
      }
    }
  }, [fileId, pushToHost]);

  const isApplyingRemoteRef = useRef(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleContentChange = useCallback((newContent: string) => {
    if (isApplyingRemoteRef.current) return; // Do not trigger save when applying remote content
    setContentAndRef(newContent);
    setSaved(false);
    isTypingRef.current = true;
    hasPendingChangesRef.current = true;
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      saveFile(newContent);
    }, 1000);
  }, [saveFile]);

  useEffect(() => {
    const handleBeforeUnload = (_e: BeforeUnloadEvent) => {
      saveFile(currentContentRef.current, true);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (hasPendingChangesRef.current) {
        saveFile(currentContentRef.current, true);
      }
    };
  }, [saveFile]);

  useEffect(() => {
    if (isOnline && hasPendingChangesRef.current) {
      saveFile(currentContentRef.current, true);
    }
  }, [isOnline, saveFile]);

  // ── Register real reconnect flush callback with SyncStateContext ─────────
  // OfflineBanner's "Reconnect" button calls context.reconnect(), which calls
  // this function — flushing queued offline edits via the existing pushToHost
  // path with isOfflineReconnect: true already set on offlineQueue state.
  useEffect(() => {
    const flush = async () => {
      hasPendingChangesRef.current = true; // ensure saveFile doesn't short-circuit
      await saveFile(currentContentRef.current, true);
    };
    registerReconnectCallback(flush);
    return () => registerReconnectCallback(null); // clean up on unmount
  }, [registerReconnectCallback, saveFile]);

  useEffect(() => {
    if (!file) return;
    const timer = setTimeout(() => { saveFile(content); }, 300);
    return () => clearTimeout(timer);
  }, [content, file, saveFile]);

  if (!file) return (<PageShell><div style={{ padding: 60 }}>File not found.</div></PageShell>);

  return (
    <>
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
            
            <button className="ds-btn ds-btn-ghost" onClick={() => router.push(`/app/history/${fileId}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={14} /> Conflict History
            </button>

            <button className="ds-btn" onClick={() => {
              const origName = file.name || 'document';
              const ext = origName.split('.').pop()?.toLowerCase() || '';

              if (ext === 'docx' || ext === 'doc') {
                const wordHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset="utf-8"><title>${origName}</title></head><body>${content}</body></html>`;
                const blob = new Blob([wordHtml], { type: 'application/msword' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = origName.replace(/\.docx?$/, '.doc');
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                return;
              }

              const isHtml = ext === 'html' || ext === 'htm';
              let contentForDownload = content;
              if (!isHtml) {
                // Strip TipTap HTML tags so plain-text files don't contain markup
                contentForDownload = content
                  .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
                  .replace(/<br\s*\/?>/gi, '\n')
                  .replace(/<\/h[1-6]>/gi, '\n')
                  .replace(/<\/li>/gi, '\n')
                  .replace(/<\/blockquote>/gi, '\n')
                  .replace(/<\/div>/gi, '\n')
                  .replace(/<\/pre>/gi, '\n')
                  .replace(/<[^>]*>/g, '')
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/&#39;/g, "'")
                  .replace(/&nbsp;/g, ' ')
                  .replace(/\n{3,}/g, '\n\n')
                  .trim();
              }
              const mimeType = isHtml ? 'text/html' : 'text/plain;charset=utf-8';
              const blob = new Blob([contentForDownload], { type: mimeType });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = origName;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}>
              Download
            </button>
            <button className="ds-btn ds-btn-primary" onClick={() => {
              saveFile(content, true);
              if (!isOnline || syncState === 'offline') {
                window.alert('Offline session finalized. Your edits are strictly saved to your local device and will remain queued safely. Please reconnect to sync with the Host.');
              }
              router.push('/app/files');
            }} disabled={syncing}>Done</button>
          </div>
        </div>

        {/* Save Confirm Modal removed */}

        {/* Editor */}
        <div style={{ flex: 1, background: 'var(--bg2)', borderRadius: 12, border: '1px solid var(--b1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <TipTapEditor 
            content={content} 
            onChange={handleContentChange} 
            cursors={Object.values(remoteCursors)}
            onSelectionUpdate={(from, _to) => {
              if (cursorThrottleRef.current) return;
              cursorThrottleRef.current = setTimeout(() => { cursorThrottleRef.current = null; }, 200);
              pushCursor(fileId, from, 1);
            }}
            onUndo={(discardedContent) => {
              try {
                const conflict = {
                  id: `undo-${Date.now()}`,
                  fileId: fileId,
                  localContent: discardedContent,
                  serverContent: content,
                  timestamp: Date.now()
                };
                let conflicts = [];
                const stored = uGet('docusync_web_conflicts');
                if (stored) conflicts = JSON.parse(stored);
                conflicts.push(conflict);
                uSet('docusync_web_conflicts', JSON.stringify(conflicts));
              } catch (e) {}
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
          <span>{(peers?.length || 0) + 1} peers connected</span>
        </div>
      </PageShell>

    </>
  );
}
