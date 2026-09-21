'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { ArrowLeft, Clock } from 'lucide-react';
import dynamic from 'next/dynamic';
import { uGet, uSet } from '@/lib/userStorage';
import { idbGetFile, idbSaveFile } from '@/lib/idb';
import * as mockAuthService from '@/lib/mockAuthService';
import { useWebSync } from '@/context/WebSyncContext';
import { useSyncState } from '@/context/SyncStateContext';
const TipTapEditor = dynamic(() => import('@/components/TipTapEditor'), { ssr: false });
import type { RemoteCursor } from '@/components/TipTapEditor';
import { toast } from 'sonner';
import { computeSignatureMerge } from '@/engine/delta/signature-merge';

// ── Matchmaker URL ─────────────────────────────────────────────────────────
const _MATCHMAKER_URL = process.env.NODE_ENV === 'development'
  ? '/api/lobby'
  : '/api/lobby';

const ConflictBadge = ({ fileId }: { fileId: string | number }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const updateCount = () => {
      try {
        const storedConflicts = JSON.parse(uGet('docusync_web_conflicts') || '[]');
        const activeConflicts = storedConflicts.filter((c: any) => String(c.fileId) === String(fileId));
        setCount(activeConflicts.length);
      } catch (e) {}
    };
    updateCount();
    window.addEventListener('docusync_conflicts_update', updateCount);
    return () => window.removeEventListener('docusync_conflicts_update', updateCount);
  }, [fileId]);

  if (count === 0) return null;
  return (
    <div style={{
      position: 'absolute', top: -6, right: -6, background: '#ef4444', color: '#fff',
      fontSize: 10, fontWeight: 700, width: 16, height: 16, borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 0 0 2px var(--bg)'
    }}>
      {count}
    </div>
  );
};

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
  const [margin, setMargin] = useState('96');
  const [rawTipTapHtml, setRawTipTapHtml] = useState('');
  
  const currentMarginRef = useRef('96');
  const currentRawHtmlRef = useRef('');

  const setContentAndRef = (v: string) => { 
    currentContentRef.current = v; 
    setContent(v); 
    const match = v.match(/^<div data-margin="([^"]+)">([\s\S]*)<\/div>$/);
    if (match) {
      setMargin(match[1]);
      currentMarginRef.current = match[1];
      setRawTipTapHtml(match[2]);
      currentRawHtmlRef.current = match[2];
    } else {
      setRawTipTapHtml(v);
      currentRawHtmlRef.current = v;
    }
  };
  const [_saved, setSaved] = useState(true);
  const [_showSaveConfirm, _setShowSaveConfirm] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatusMsg, setSyncStatusMsg] = useState('Ready');
  const [offlineQueue, setOfflineQueue] = useState(false);
  const [myName, setMyName] = useState('You');
  const [isPeersOpen, setIsPeersOpen] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<any>(null);
  
  const toggleRoomLock = async () => {
    if (!currentRoom) return;
    try {
      const res = await fetch('/api/lobby/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: currentRoom.otp || currentRoom.id, nodeId: localNodeIdRef.current, isLocked: !currentRoom.isLocked })
      });
      const data = await res.json();
      if (data.success) {
        const u = { ...currentRoom, isLocked: data.isLocked };
        setCurrentRoom(u);
        uSet('current_room', JSON.stringify(u));
      } else {
        alert(data.error);
      }
    } catch {}
  };
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const s = uGet('current_room');
      if (s) {
        try { setCurrentRoom(JSON.parse(s)); } catch {}
      }
      const user = mockAuthService.getCurrentUser();
      const name = mockAuthService.getDisplayName(user);
      if (name) setMyName(name);
    }
  }, []);
  
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
  const pollDocInFlightRef = useRef(false);
  const queuedContentRef = useRef<string | null>(null);
  
  // Track offline baseline for signature merge
  const offlineBaselineRef = useRef<string>('');
  
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

  const { peers, pushCursor, kickPeer, setActiveFileId } = useWebSync();
  const _connectedPeersCount = peers.filter((p) => p.status === 'connected').length;
  // Peers actively editing THIS file specifically — not just connected to
  // the room. A "last editor left" history checkpoint should fire when
  // this drops to 0, regardless of how many other peers are elsewhere in
  // the room (e.g. on the file list, or editing a different file).
  const _othersEditingThisFile = peers.filter((p) => p.status === 'connected' && String(p.openFileId ?? '') === String(fileId)).length;

  // Declare "I'm editing this file" for as long as this page is mounted,
  // so other peers' presence checks (and our own leave-detection below)
  // see accurate per-file editing counts, not just room-wide presence.
  useEffect(() => {
    if (!fileId) return;
    setActiveFileId(fileId);
    return () => setActiveFileId(null);
  }, [fileId, setActiveFileId]);

  // ── Remote Cursors ─────────────────────────────────────────────────────────
  const cursorThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor & { lastUpdate: number }>>({});

  // Announce presence on this file as soon as it's opened — not just on the
  // first click — so the cloud cursor poll starts immediately and peers who
  // are only reading (not yet editing) still see everyone else's cursors.
  useEffect(() => {
    if (!fileId) return;
    pushCursor(fileId, 0, 1);
  }, [fileId, pushCursor]);

  useEffect(() => {
    const handleCursor = (e: any) => {
      const msg = e.detail;
      const localFileId = Number(fileId);
      if (msg.fileId !== localFileId) return;
      const color = msg.color || (msg.nodeIndex === 0 ? '#3b82f6' : msg.nodeIndex === 1 ? '#10b981' : '#f59e0b');
      const displayName = msg.displayName || (msg.nodeIndex === 0 ? 'Desktop' : msg.nodeIndex === 1 ? 'Web' : 'Mobile');
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
        
        // Detect if the incoming payload contains newly appended offline pages
        const oldOfflinePages = (currentContentRef.current.match(/offline-page-break/g) || []).length;
        const newOfflinePages = (msg.content.match(/offline-page-break/g) || []).length;
        if (newOfflinePages > oldOfflinePages) {
          toast.info(`An offline edit by ${msg.authorName || 'a peer'} was appended to a new page at the bottom of the document.`, {
            duration: 8000,
            icon: '📄'
          });
        }

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
        uSet('docusync_offline_base', msg.content);
        
        (async () => {
          try {
            const f = await idbGetFile(fileId);
            if (f) {
              f.content = msg.content;
              f.updatedAt = new Date().toISOString();
              await idbSaveFile(f);
            }
          } catch {}
        })();
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
    const goOffline = () => {
      setIsOnline(false);
      if (currentContentRef.current) {
        uSet('docusync_offline_base', currentContentRef.current);
      }
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [syncState]);

  const updateLocalStorageFile = useCallback(async (fileIdToUpdate: string, newContent: string) => {
    try {
      const f = await idbGetFile(fileIdToUpdate);
      if (f) {
        f.content = newContent;
        f.updatedAt = new Date().toISOString();
        await idbSaveFile(f);
      }
    } catch (_e) {}
  }, []);

  // ── Load file from local storage ──────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const found = await idbGetFile(String(fileId));
        if (found) {
          setFile(found);
          setContentAndRef(found.content || '');
          lastSave.current = found.content || '';
          
          // Restore the last save time so poll won't overwrite with older remote
          const savedTs = uGet(`docusync_save_ts_${fileId}`);
          if (savedTs) {
            const ts = Number(savedTs);
            lastLocalSaveTime.current = ts;
            lastSyncedAt.current = ts;
          }
        }
      } catch (e) {
        console.error("IDB load error:", e);
      }
    })();

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
  const pushToHost = useCallback(async (contentToSave: string, vectorClockSnapshot: Record<string, number>, explicit = false, isSessionEnd = false) => {
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
            headers: { 
              'Content-Type': 'application/json',
              'X-DocuSync-Token': room.otp
            },
            body: JSON.stringify({
              fileId,
              authorNodeId: localNodeIdRef.current,
              authorName: localNodeIdRef.current.slice(0, 8),
              nodeId: localNodeIdRef.current,
              content: contentToSave,
              vectorClock: vectorClockSnapshot,
              isOfflineReconnect: offlineQueue,
              baseContent: uGet('docusync_offline_base'),
              committedAt: Date.now(),
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
            if (data.escalated || data.conflict) {
              const serverContent = data.serverContent || data.content || '';
              const conflict = {
                id: `web-conflict-${Date.now()}`,
                fileId: fileId,
                localContent: contentToSave,
                serverContent: serverContent,
                timestamp: Date.now()
              };
              // Also update IndexedDB
              try {
                const f = await idbGetFile(fileId);
                if (f) {
                  f.content = serverContent;
                  f.updatedAt = new Date().toISOString();
                  await idbSaveFile(f);
                }
              } catch (err) {}
              
              if (room?.otp) {
                try {
                  const _WEB_BASE = process.env.NEXT_PUBLIC_MATCHMAKER_URL || `${window.location.origin}/api/lobby`;
                  fetch(`${_WEB_BASE}/conflicts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      otp: room?.otp,
                      conflictId: conflict.id,
                      fileId: conflict.fileId,
                      localContent: conflict.localContent,
                      serverContent: conflict.serverContent,
                      mergedContent: conflict.serverContent,
                      timestamp: conflict.timestamp
                    })
                  }).catch(() => {});
                } catch (e) {}
              }
              
              // Revert the editor to the stable server state to prevent stomping over it
              if (serverContent && serverContent !== currentContentRef.current) {
                setContentAndRef(serverContent);
                lastSave.current = serverContent;
                setSaved(true);
                // Also update IndexedDB
                try {
                  const f = await idbGetFile(fileId);
                  if (f) {
                    f.content = serverContent;
                    f.updatedAt = new Date().toISOString();
                    await idbSaveFile(f);
                  }
                } catch (err) {}
              }

              setSyncStatusMsg('Conflict Detected! Check menu.');
              // Track conflict count for Web-only Metrics dashboard
              const prevConflictCount = parseInt(localStorage.getItem('web_session_conflict_count') || '0', 10);
              localStorage.setItem('web_session_conflict_count', String(prevConflictCount + 1));
              if (explicit) {
                toast.error('Offline Conflict Detected! Check menu.', { duration: 6000 });
              }
              setOfflineQueue(false);
              hasPendingChangesRef.current = false;
              return;
            } else {
              const mergedContent = data.serverContent;
              if (data.hadConflict) {
                // A genuine same-line conflict was auto-resolved by LWW,
                // scoped to just those line(s) — pull the merged result in
                // so this client sees the same text as everyone else.
                if (typeof mergedContent === 'string' && mergedContent !== currentContentRef.current) {
                  setContentAndRef(mergedContent);
                  lastSave.current = mergedContent;
                }
                toast.success(`Merged automatically — ${data.conflictHunks || 1} overlapping edit(s) resolved by Last-Write-Wins`, { duration: 5000 });
              } else {
                // `lwwResolved` here is set by the plain sequential push
                // path for any ordinary accepted edit, not just real
                // conflicts — keep the old explicit-only toast behavior.
                if (data.lwwResolved && explicit) {
                  toast.success('Conflict resolved using Last-Write-Wins', { duration: 4000 });
                }
                if (typeof mergedContent === 'string' && mergedContent !== contentToSave && mergedContent !== currentContentRef.current) {
                  // Clean auto-merge with another peer's concurrent edit to
                  // a different line — no conflict, but our buffer needs it.
                  setContentAndRef(mergedContent);
                  lastSave.current = mergedContent;
                }
              }
              // Track real push count for Web-only Metrics dashboard
              const prevCount = parseInt(localStorage.getItem('web_session_push_count') || '0', 10);
              localStorage.setItem('web_session_push_count', String(prevCount + 1));
              setSyncStatusMsg(`Synced ✓`);
              setOfflineQueue(false);
              uSet('docusync_offline_base', typeof mergedContent === 'string' ? mergedContent : contentToSave);
              uSet(`docusync_offline_history_${fileId}`, '[]');
              console.log('[OfflineQueue] Reset to false after sync. Base updated.');
              hasPendingChangesRef.current = false;
            }
          } else {
            hasPendingChangesRef.current = false;
          }
        } catch (_e) {}
      }

      if (!directSuccess) {
        // Fallback to Matchmaker Cloud if local IP is blocked (Mixed Content) or offline
        if (room && otp) {
          try {
            // Thesis formula: L = tack - tdispatch, the full round-trip
            // from the moment this device sends an edit to the moment it
            // receives confirmation the server applied it. Measured here,
            // client-side, exactly as the methodology describes — not
            // simulated.
            const tDispatch = performance.now();
            const mmRes = await fetch(`${_MATCHMAKER_URL}/doc`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                otp,
                fileId,
                authorNodeId: localNodeIdRef.current,
                content: contentToSave,
                baseContent: uGet('docusync_offline_base'),
                vectorClock: vectorClockSnapshot,
                committedAt: Date.now(),
                isSessionEnd,
                isDone: explicit,
                isOfflineReconnect: offlineQueue,
                // How many peers (including this one) are connected right
                // now — lets the metrics dashboard compute System
                // Scalability from real solo-vs-multi-user throughput
                // instead of a guess.
                concurrentPeers: _connectedPeersCount + 1,
              }),
            });
            const tAck = performance.now();
            try {
              const samples = JSON.parse(localStorage.getItem('web_session_latency_samples') || '[]');
              samples.push(Math.round(tAck - tDispatch));
              // Keep a rolling window so this stays a "recent" latency
              // figure, not a lifetime average that hides regressions.
              while (samples.length > 100) samples.shift();
              localStorage.setItem('web_session_latency_samples', JSON.stringify(samples));
            } catch (_e) {}
            if (mmRes.ok) {
              const mmData = await mmRes.json().catch(() => null);
              const mergedContent = mmData?.snapshot?.content;

              if (mmData?.hadConflict && typeof mergedContent === 'string') {
                // The server merged this edit against a concurrent one.
                // Non-overlapping parts merged automatically; only the
                // genuinely overlapping hunk(s) were LWW-arbitrated. Pull
                // the merged result into the editor so this client sees
                // the same text as everyone else, and re-base off it.
                if (mergedContent !== currentContentRef.current) {
                  setContentAndRef(mergedContent);
                  lastSave.current = mergedContent;
                }
                uSet('docusync_offline_base', mergedContent);
                toast.success(`Merged automatically — ${mmData.conflictHunks} overlapping edit${mmData.conflictHunks === 1 ? '' : 's'} resolved by Last-Write-Wins`, { duration: 5000 });
              } else {
                uSet('docusync_offline_base', typeof mergedContent === 'string' ? mergedContent : contentToSave);
              }

              setSyncStatusMsg(`Cloud Synced ✓`);
              setOfflineQueue(false);
              uSet(`docusync_offline_history_${fileId}`, '[]');
              hasPendingChangesRef.current = false;
              directSuccess = true;
              // Track push count for Metrics dashboard (cloud path)
              const prevCount = parseInt(localStorage.getItem('web_session_push_count') || '0', 10);
              localStorage.setItem('web_session_push_count', String(prevCount + 1));
            }
          } catch (e) {
            // Matchmaker also failed
          }
        }
        
        if (!directSuccess) {
          setSyncStatusMsg('Sync failed — queued for retry');
          setOfflineQueue(true);
          try {
            const histKey = `docusync_offline_history_${fileId}`;
            const existing = JSON.parse(uGet(histKey) || '[]');
            existing.unshift({
              eventId: crypto.randomUUID(),
              fileId: fileId,
              nodeId: localNodeIdRef.current,
              eventType: 'edit',
              logicalTimestamp: (vectorClockSnapshot as any).root ? (vectorClockSnapshot as any).root.counter : Date.now(),
              payloadPreview: contentToSave,
              fullContent: contentToSave,
              createdAt: new Date().toISOString(),
              isCompacted: false
            });
            uSet(histKey, JSON.stringify(existing.slice(0, 50)));
          } catch(e) {}
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
      // A round trip that runs past the poll interval would otherwise let
      // the next tick fire on top of it, stacking calls against the same
      // backend (same class of issue fixed elsewhere this session).
      if (pollDocInFlightRef.current) return;
      pollDocInFlightRef.current = true;

      // Read room dynamically every tick — the room might be loaded after mount
      const room = getRoomHostInfo();
      if (!room) { pollDocInFlightRef.current = false; return; }

      // ALWAYS use room.otp (the short Desktop code like "8WUSP2")
      // Do NOT fall back to room.id (which is a UUID, not the OTP)
      const otp = room.otp;
      if (!otp) { pollDocInFlightRef.current = false; return; }

      try {
        // Step 1: Try direct Desktop host first (faster, real-time)
        if (room.hostIp) {
          try {
            const baseUrl = getSyncBaseUrl(room);
            const vcStr = encodeURIComponent(JSON.stringify(localVectorClockRef.current || {}));
            const res = await fetch(`${baseUrl}/sync/status?fileId=${fileId}&since=${vcStr}`, {
              headers: { 'X-DocuSync-Token': room.otp }
            });
            if (res.ok) {
              const data = await res.json();
              // Same reasoning as the cloud path below: never skip a snapshot
              // just because the server stamped it with our own node id.
              if (!data.upToDate && data.content) {
                if (!(isTypingRef.current || hasPendingChangesRef.current) && data.content !== currentContentRef.current) {
                  setContentAndRef(data.content);
                  lastSave.current = data.content;
                  setSaved(true);
                  setSyncStatusMsg('↓ Live synced from host');
                  lastSyncedAt.current = Date.now();
                  uSet('docusync_offline_base', data.content);
                } else if ((isTypingRef.current || hasPendingChangesRef.current) && currentContentRef.current !== data.content) {
                  if (room.algorithm === 'ot') {
                    setContentAndRef(data.content);
                    lastSave.current = data.content;
                    setSaved(true);
                    setSyncStatusMsg('Synced via OT ✓');
                    uSet('docusync_offline_base', data.content);
                  } else {
                    // We have offline/pending changes or are typing AND the server has new changes. Conflict!
                    const original = offlineBaselineRef.current || lastSave.current;
                    const merged = computeSignatureMerge(original, data.content, currentContentRef.current, myName);
                    if (merged !== currentContentRef.current) {
                      setContentAndRef(merged);
                      setSyncStatusMsg('Merged Signature Edit ✓');
                      toast.success('Offline edits merged automatically');
                      // Push conflict to Redis so all peers receive it
                      const conflictId = crypto.randomUUID();
                      fetch(`${_MATCHMAKER_URL}/conflicts`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          otp,
                          conflictId,
                          fileId,
                          localContent: currentContentRef.current,
                          serverContent: data.content,
                          mergedContent: merged,
                          timestamp: Date.now()
                        })
                      }).catch(() => {});
                    }
                  }
                }
              }
              return; // successfully polled direct host
            }
          } catch {
            // fall through to Matchmaker
          }
        }

        // Step 2: Fallback to Matchmaker Cloud
        try {
          const mmRes = await fetch(`${_MATCHMAKER_URL}/doc?otp=${otp}&fileId=${fileId}&since=${_lastAcceptedSeq.current}`);
          if (mmRes.ok) {
            const data = await mmRes.json();
            // Deliberately NOT gated on authorNodeId !== ours. A snapshot the
            // server attributes to us can still carry another peer's edit:
            // any push of ours that lands after theirs is 3-way merged with
            // it, and the merged result is stamped with OUR node id. Skipping
            // "our own" snapshots therefore skipped their edit too, and it
            // stayed invisible here until some third write changed the
            // author. The content comparisons below already make a true echo
            // of our own edit a no-op.
            if (!data.upToDate && data.content) {
              if (!(isTypingRef.current || hasPendingChangesRef.current) && data.content !== currentContentRef.current) {
                setContentAndRef(data.content);
                lastSave.current = data.content;
                setSaved(true);
                setSyncStatusMsg('☁ Live synced from cloud');
                _lastAcceptedSeq.current = data.snapshot?.committedAt || Date.now();
                lastSyncedAt.current = Date.now();
              } else if ((isTypingRef.current || hasPendingChangesRef.current) && currentContentRef.current !== data.content) {
                if (room.algorithm === 'ot') {
                  setContentAndRef(data.content);
                  lastSave.current = data.content;
                  setSaved(true);
                  setSyncStatusMsg('Synced via OT ☁');
                  uSet('docusync_offline_base', data.content);
                } else {
                  // Conflict in cloud Matchmaker
                  const original = offlineBaselineRef.current || lastSave.current;
                  const merged = computeSignatureMerge(original, data.content, currentContentRef.current, myName);
                  if (merged !== currentContentRef.current) {
                    setContentAndRef(merged);
                    setSyncStatusMsg('Merged Signature Edit ☁');
                    toast.success('Offline edits merged via cloud');
                    // Push conflict event to Redis via Matchmaker History API
                    const conflictId = crypto.randomUUID();
                    fetch(`${_MATCHMAKER_URL}/conflicts`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        otp,
                        conflictId,
                        fileId,
                        localContent: currentContentRef.current,
                        serverContent: data.content,
                        mergedContent: merged,
                        timestamp: Date.now()
                      })
                    }).catch(() => {});
                  }
                }
              }
            }
          }
        } catch (e) {
          // Both direct and cloud failed
        }
      } catch {
      } finally {
        pollDocInFlightRef.current = false;
      }
    };

    // A web-hosted room (or desktop, which is now just this same web app
    // in an Electron shell — see main.ts loadURL) has no real WebSocket
    // server to deliver live deltas over; that path only ever connects
    // for a desktop-hosted room. This poll is therefore the ONLY sync
    // path two ordinary peers actually have, so its interval is most of
    // the visible lag between one device's keystroke and the other's
    // screen. Each tick is one small Redis read, so 700ms is cheap; it
    // brings the average wait for the next tick from ~1s down to ~350ms.
    // Still nowhere near character-level OT — a peer that is mid-typing
    // deliberately skips applying remote snapshots (see the guard at the
    // top of pollDoc), since a full setContent would clobber their
    // in-progress text.
    channelRef.current = setInterval(pollDoc, 700);
    return () => { if (channelRef.current) clearInterval(channelRef.current); };
  }, [fileId, getRoomHostInfo, getSyncBaseUrl]);



  const saveFile = useCallback(async (contentToSave: string, forcePush = false, isSessionEnd = false) => {
    if (contentToSave === lastSave.current && !forcePush && !isSessionEnd) return;
    
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
          if (contentToSave !== lastSave.current) {
            files[idx].updatedAt = new Date().toISOString();
          }
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
    await pushToHost(contentToSave, localVectorClockRef.current, forcePush, isSessionEnd);
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
    if (isApplyingRemoteRef.current) return;
    const wrapped = `<div data-margin="${currentMarginRef.current}">${newContent}</div>`;
    setContentAndRef(wrapped);
    setSaved(false);
    isTypingRef.current = true;
    hasPendingChangesRef.current = true;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    // Idle debounce before pushing. This window also holds isTypingRef
    // true, which blocks this peer from receiving remote updates — so it
    // is paid twice on every keystroke burst (once before our edit goes
    // out, once before the other side's can come in). 300ms still sits
    // above a fast typist's inter-key gap, so pushes land at natural
    // word/sentence pauses rather than mid-word.
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      saveFile(wrapped);
    }, 300);
  }, [saveFile]);

  const handleMarginChange = useCallback((newMargin: string) => {
    if (isApplyingRemoteRef.current) return;
    const wrapped = `<div data-margin="${newMargin}">${currentRawHtmlRef.current}</div>`;
    setContentAndRef(wrapped);
    setSaved(false);
    isTypingRef.current = true;
    hasPendingChangesRef.current = true;
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      saveFile(wrapped);
    }, 300);
  }, [saveFile]);

  // Kept in refs so the unmount checkpoint below reads live values without
  // having to list them as effect dependencies. Listing them was a real
  // bug: React runs an effect's cleanup every time a dependency changes,
  // not only on unmount, so when the other peer's presence arrived and
  // _othersEditingThisFile flipped 0 → 1 the cleanup ran with the STALE
  // closure value (0) and fired a "session end" push of whatever this
  // client happened to hold — nobody had typed. That stale push got
  // merged server-side with the other peer's newer edit and re-authored
  // the snapshot as ours, which the poll then ignored as an echo (see the
  // author check in pollDoc), so their edit never appeared here.
  const othersEditingRef = useRef(_othersEditingThisFile);
  othersEditingRef.current = _othersEditingThisFile;
  const saveFileRef = useRef(saveFile);
  saveFileRef.current = saveFile;

  useEffect(() => {
    // Session-end (a "Previous Edit" history checkpoint) fires when NO
    // OTHER peer is currently editing this specific file — not merely
    // when the room as a whole is empty. Someone else could still be
    // sitting on the file list or editing a different file in the same
    // room; that shouldn't count as "everyone left this file".
    const handleBeforeUnload = (_e: BeforeUnloadEvent) => {
      saveFileRef.current(currentContentRef.current, true, othersEditingRef.current === 0);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (hasPendingChangesRef.current || othersEditingRef.current === 0) {
        saveFileRef.current(currentContentRef.current, true, othersEditingRef.current === 0);
      }
    };
  }, []);

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

  // Removed redundant 300ms content save effect to prevent continuous sync loop

  if (!file) return (<PageShell><div style={{ padding: 60 }}>File not found.</div></PageShell>);

  return (
    <>
      <PageShell>
        <div className="ds-editor-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="ds-editor-header-left" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button 
              onClick={async () => { await saveFile(content, true); router.push('/app/files'); }}
              style={{
                width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-card)', border: '1px solid var(--border)', cursor: 'pointer', color: '#64748b'
              }}
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0, marginBottom: 2 }}>{file.name}</h1>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  {syncStatusMsg.replace('Synced ✓', 'Synced').replace('☁', '').replace('↓', '').trim()}
                </span>
                <span style={{ color: '#cbd5e1' }}>•</span>
                Edited just now
              </p>
            </div>
          </div>
          
          <div className="ds-editor-header-right" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Active Users Dropdown */}
            <div style={{ position: 'relative' }}>
              <div 
                onClick={() => setIsPeersOpen(!isPeersOpen)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '4px 12px 4px 4px',
                  borderRadius: 20, border: '1px solid var(--b1)', background: 'var(--bg-card)',
                  cursor: 'pointer', userSelect: 'none', transition: 'all 0.2s', height: 34
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--s1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 4 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#f1f5f9', color: '#475569', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', zIndex: 3 }}>
                    {(myName[0] || 'U').toUpperCase()}
                  </div>
                  {peers.filter(p => p.status === 'connected').slice(0, 3).map((p, i) => (
                    <div key={i} style={{ width: 24, height: 24, borderRadius: '50%', background: ['#dcfce7', '#ffedd5', '#e0e7ff'][i % 3], color: ['#16a34a', '#ea580c', '#4f46e5'][i % 3], fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', marginLeft: -8, zIndex: 2 - i }}>
                      {(p.displayName?.[0] || 'P').toUpperCase()}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {_connectedPeersCount + 1} connected
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isPeersOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
              </div>
              
              {/* Dropdown Menu */}
              {isPeersOpen && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 8,
                  background: 'var(--bg)', border: '1px solid var(--b1)', borderRadius: 12,
                  boxShadow: '0 10px 25px rgba(0,0,0,0.1)', padding: 8, minWidth: 260, zIndex: 50,
                  animation: 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, marginTop: 4, background: 'var(--s1)' }}>
                    <div className="ds-presence-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--grn)' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                        {myName} (You) {(currentRoom as any)?.isOwner ? <span style={{ color: '#8b5cf6' }}>(Owner)</span> : ''}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t3)' }}>Online</div>
                    </div>
                  </div>

                  {/* LOCK ROOM BUTTON — was gated on currentRoom.hostNodeId,
                      which is never populated on the client's locally-stored
                      room object (it only ever carries `isOwner`), so this
                      stayed permanently hidden for every room's actual owner.
                      The server independently re-verifies ownership by real
                      nodeId in /api/lobby/lock, so this is purely a display
                      fix. */}
                  {(currentRoom as any)?.isOwner && (
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--b1)' }}>
                       <button onClick={toggleRoomLock} style={{ width: '100%', padding: '6px 0', background: (currentRoom as any)?.isLocked ? '#fef2f2' : '#f8fafc', color: (currentRoom as any)?.isLocked ? '#ef4444' : '#64748b', border: '1px solid ' + ((currentRoom as any)?.isLocked ? '#fca5a5' : '#e2e8f0'), borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: '0.15s' }}>
                         {(currentRoom as any)?.isLocked ? 'Unlock Room (Locked)' : 'Lock Room (Open)'}
                       </button>
                    </div>
                  )}

                  {peers.filter(p => p.status === 'connected').map((p, i) => {
                    const isDbOwner = (currentRoom as any)?.hostNodeId && p.id === (currentRoom as any)?.hostNodeId;
                    const defaultName = p.displayName ? p.displayName : isDbOwner ? 'Room Host' : `Peer ${i + 1}`;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, marginTop: 4 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--s1)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <div className="ds-presence-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--grn)' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{defaultName} {isDbOwner ? <span style={{ color: '#8b5cf6' }}>(Owner)</span> : ''}</div>
                          <div style={{ fontSize: 11, color: 'var(--t3)' }}>Online</div>
                        </div>

                        {/* KICK BUTTON */}
                        {(currentRoom as any)?.isOwner && !isDbOwner && (
                          <button onClick={(e) => { e.stopPropagation(); kickPeer(p.id); }} style={{ padding: '4px 8px', background: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Kick</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {/* Document History per user request */}
              <button 
                onClick={() => router.push(`/app/history/${fileId}`)}
                style={{
                  padding: '0 14px', height: 36, borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: '#fff', color: '#475569', border: '1px solid #cbd5e1', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, position: 'relative',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#94a3b8'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
              >
                <Clock size={15} /> History
                <ConflictBadge fileId={fileId} />
              </button>

              {/* Download button removed as per user request */}

              <button 
                onClick={() => {
                  saveFile(content, true);
                  if (!isOnline || syncState === 'offline') {
                    toast.info('Offline session finalized. Your edits are locally queued.');
                  }
                  router.push('/app/files');
                }} 
                disabled={syncing}
                style={{
                  padding: '0 16px', height: 36, borderRadius: 8, fontSize: 13, fontWeight: 700,
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', color: '#fff', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, opacity: syncing ? 0.7 : 1,
                  boxShadow: '0 2px 6px rgba(37,99,235,0.2)'
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>

        {/* Save Confirm Modal removed */}

        {/* Editor */}
        <div className="ds-editor-page-wrapper" style={{ flex: 1, borderRadius: 12, border: '1px solid var(--b1)' }}>
          <div className="ds-editor-page-view">
            <TipTapEditor 
              content={rawTipTapHtml} 
              onChange={handleContentChange} 
              margin={margin}
              onMarginChange={handleMarginChange}
              onHistoryRequest={() => router.push('/app/history/' + fileId)}
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
                  // Push undo conflict to Redis
                  const roomStr = uGet('current_room');
                  const room = roomStr ? JSON.parse(roomStr) : null;
                  if (room?.otp) {
                    try {
                      const _WEB_BASE = process.env.NEXT_PUBLIC_MATCHMAKER_URL || `${window.location.origin}/api/lobby`;
                      fetch(`${_WEB_BASE}/conflicts`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          otp: room.otp,
                          conflictId: conflict.id,
                          fileId: conflict.fileId,
                          localContent: conflict.localContent,
                          serverContent: conflict.serverContent,
                          mergedContent: conflict.serverContent,
                          timestamp: conflict.timestamp
                        })
                      }).catch(() => {});
                    } catch (e) {}
                  }
                } catch (e) {}
              }}
            />
          </div>
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
