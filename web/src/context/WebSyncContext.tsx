'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { toast } from 'sonner';
import { uGet, uSet } from '@/lib/userStorage';
import { idbGetFile, idbSaveFile } from '@/lib/idb';
import * as mockAuthService from '@/lib/mockAuthService';

export interface PeerInfo {
  id: string;
  address: string;
  port: number;
  status: 'connected' | 'connecting' | 'disconnected';
  latency: number;
  connectedAt?: string;
  displayName?: string;
  openFileId?: string | null;
}

interface WebSyncContextValue {
  peers: PeerInfo[];
  connectToPeer: (address: string, port: number) => void;
  disconnectPeer: (id: string) => void;
  pushCursor: (fileId: string, position: number, nodeIndex: number) => void;
  kickPeer: (targetNodeId: string) => void;
  socket: WebSocket | null;
  /**
   * Declares which file (if any) this client currently has open in the
   * editor, so the room's presence heartbeat can report it — this is what
   * lets a "last editor left this file" history checkpoint be scoped to
   * the actual file, not just "the room emptied out". Pass `null` when
   * leaving the editor.
   */
  setActiveFileId: (fileId: string | number | null) => void;
  /** Tell the server this peer has left the room, immediately. */
  leaveRoom: (otp: string) => void;
}

const WebSyncContext = createContext<WebSyncContextValue>({
  peers: [],
  connectToPeer: () => {},
  disconnectPeer: () => {},
  pushCursor: () => {},
  kickPeer: () => {},
  socket: null,
  setActiveFileId: () => {},
  leaveRoom: () => {},
});

export function WebSyncProvider({ children }: { children: ReactNode }) {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const lastCursorFileIdRef = useRef<string | number | null>(null);
  const activeFileIdRef = useRef<string | number | null>(null);
  const pollPresenceRef = useRef<() => void>(() => {});
  const leaveRoomRef = useRef<(otp: string) => void>(() => {});
  // setInterval fires on a fixed cadence regardless of whether the previous
  // round trip finished — pollCursors alone runs every 1.5s. Against the
  // real shared Redis backend a single call occasionally runs long (cold
  // start, rate limiting, several peers polling at once), and without these
  // guards the overlapping calls stack up and each one adds more load to
  // the same bottleneck, compounding the slowdown instead of it recovering
  // on its own.
  const conflictsInFlightRef = useRef(false);
  const presenceInFlightRef = useRef(false);
  const cursorsInFlightRef = useRef(false);

  const localNodeIdRef = useRef<string>('');
  if (typeof window !== 'undefined' && !localNodeIdRef.current) {
    let nid = uGet('node_id') || '';
    if (!nid) {
      nid = `web-${Math.random().toString(36).substring(2, 9)}-${Date.now()}`;
      uSet('node_id', nid);
    }
    localNodeIdRef.current = nid;
  }
  const localNodeId = localNodeIdRef.current || 'fallback-id';

  // Load existing peers from localStorage on mount and when room changes
  useEffect(() => {
    const checkRoom = () => {
      const s = uGet('current_room');
      if (s) {
        try {
          const room = JSON.parse(s);
          if (room.hostIp && room.hostPort) {
            connectToPeer(room.hostIp, room.hostPort);
          }
        } catch (e) {
          console.error('Failed to parse current_room', e);
        }
      }
    };
    
    checkRoom();
    
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'docusync_user_current_room') checkRoom();
    };
    window.addEventListener('storage', handleStorage);
    // Custom event just in case
    window.addEventListener('docusync_rooms_update', checkRoom);
    
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('docusync_rooms_update', checkRoom);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll for global conflicts from Matchmaker to ensure all peers have same conflict list
  useEffect(() => {
    const pollConflicts = async () => {
      if (conflictsInFlightRef.current) return;
      const s = uGet('current_room');
      if (!s) return;
      conflictsInFlightRef.current = true;
      try {
        const room = JSON.parse(s);
        if (!room.otp) return;
        const _MATCHMAKER_URL = process.env.NEXT_PUBLIC_MATCHMAKER_URL || `${window.location.origin}/api/lobby`;
        const res = await fetch(`${_MATCHMAKER_URL}/conflicts?otp=${room.otp}`);
        if (res.ok) {
          const data = await res.json();
          if (data.conflicts && Array.isArray(data.conflicts)) {
            // Merge with local conflicts, prioritizing server ones
            const localRaw = uGet('docusync_web_conflicts');
            const localConflicts = localRaw ? JSON.parse(localRaw) : [];
            const mergedMap = new Map();
            localConflicts.forEach((c: any) => mergedMap.set(c.conflictId, c));
            data.conflicts.forEach((c: any) => mergedMap.set(c.conflictId, c));
            const mergedArr = Array.from(mergedMap.values()).sort((a: any, b: any) => b.timestamp - a.timestamp).slice(0, 50);
            uSet('docusync_web_conflicts', JSON.stringify(mergedArr));
            window.dispatchEvent(new CustomEvent('docusync_conflicts_update'));
          }
        }
      } catch (_e) {
        // ignore
      } finally {
        conflictsInFlightRef.current = false;
      }
    };

    const pollPresence = async () => {
      if (presenceInFlightRef.current) return;
      const s = uGet('current_room');
      if (!s) return;
      presenceInFlightRef.current = true;
      try {
        const room = JSON.parse(s);
        if (!room.otp) return;
        const _MATCHMAKER_URL = process.env.NEXT_PUBLIC_MATCHMAKER_URL || `${window.location.origin}/api/lobby`;
        const session = mockAuthService.getCurrentUser();
        const displayName = mockAuthService.getDisplayName(session);
        const res = await fetch(`${_MATCHMAKER_URL}/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodeId: localNodeIdRef.current,
            displayName,
            hostedRoom: { otp: room.otp },
            openFileId: activeFileIdRef.current,
          })
        });
        if (res.ok) {
          const data = await res.json();
          // Mirrors the PEER_KICK branch below (the WebSocket path desktop
          // hosts use) — this is the equivalent for a web-hosted room, where
          // the host's kick (see kickPeer) blocklists this node server-side
          // and the very next heartbeat here reports it instead of quietly
          // re-registering.
          if (data.kicked === true) {
            uSet('docusync_kicked', 'true');
            window.location.href = '/app';
            return;
          }
          if (data.activePeers && Array.isArray(data.activePeers)) {
            setPeers((prev) => {
              const connected = data.activePeers.filter((p: any) => p.nodeId !== localNodeIdRef.current).map((p: any) => ({
                id: p.nodeId,
                address: p.ip || '0.0.0.0',
                port: 9000,
                status: 'connected' as const,
                latency: 0,
                connectedAt: new Date(p.lastActive).toISOString(),
                // Real account name from the room's own roster, not a
                // slice of the technical device/node id (e.g. "web-muqm
                // 8en") — that was never meant to be shown to a user. A
                // brand-new peer's very first heartbeat can land before
                // their name has propagated; show a friendly placeholder
                // for that split second rather than raw node-id junk.
                displayName: p.displayName || 'Connecting…',
                openFileId: p.openFileId || null,
              }));
              uSet('peers', JSON.stringify(connected));
              return connected;
            });
          }
        }
      } catch (_e) {
      } finally {
        presenceInFlightRef.current = false;
      }
    };
    pollPresenceRef.current = pollPresence;

    const pollCursors = async () => {
      if (cursorsInFlightRef.current) return;
      const s = uGet('current_room');
      const activeFileId = lastCursorFileIdRef.current;
      if (!s || activeFileId === null) return;
      cursorsInFlightRef.current = true;
      try {
        const room = JSON.parse(s);
        if (!room.otp) return;
        const _MATCHMAKER_URL = process.env.NEXT_PUBLIC_MATCHMAKER_URL || `${window.location.origin}/api/lobby`;
        const res = await fetch(
          `${_MATCHMAKER_URL}/cursors?otp=${room.otp}&nodeId=${localNodeIdRef.current}&fileId=${Number(activeFileId)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.cursors)) {
            data.cursors.forEach((c: any) => {
              window.dispatchEvent(new CustomEvent('docusync_ws_cursor', {
                detail: {
                  fileId: c.fileId,
                  nodeId: c.nodeId,
                  position: c.from,
                  displayName: c.displayName,
                  color: c.color,
                },
              }));
            });
          }
        }
      } catch (_e) {
      } finally {
        cursorsInFlightRef.current = false;
      }
    };

    pollConflicts();
    pollPresence();
    pollCursors();
    const iv = setInterval(pollConflicts, 15000);
    const iv2 = setInterval(pollPresence, 5000);
    const iv3 = setInterval(pollCursors, 1500);

    // Covers a hard tab close / browser quit — the "Leave Room" button
    // handles the explicit case, but a closed tab never runs that click
    // handler at all. Without this, presence relies purely on the
    // 5-minute TTL, which is what made the member count look stuck.
    const handleUnload = () => {
      const s = uGet('current_room');
      if (!s) return;
      try {
        const room = JSON.parse(s);
        if (room.otp) leaveRoomRef.current(room.otp);
      } catch (_e) {}
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(iv); clearInterval(iv2); clearInterval(iv3);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _savePeers = (newPeers: PeerInfo[]) => {
    setPeers(newPeers);
    uSet('peers', JSON.stringify(newPeers));
  };

  const connectToPeer = useCallback((rawAddress: string, rawPort: number) => {
    let address = rawAddress;
    if ((address === '127.0.0.1' || address === 'localhost') && typeof window !== 'undefined') {
      const hn = window.location.hostname;
      if (hn && hn !== 'localhost' && hn !== '127.0.0.1') {
        address = hn;
      }
    }
    const port = (!rawPort || rawPort === 3000) ? 9000 : rawPort;
    const roomStr = uGet('current_room');
    let tokenParam = '';
    if (roomStr) {
      try {
        const room = JSON.parse(roomStr);
        if (room.otp) tokenParam = `?token=${room.otp}`;
      } catch (_e) {}
    }
    const wsUrl = `ws://${address}:${port}${tokenParam}`;
    const peerId = `${address}:${port}`;

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    console.log(`[WebSync] 🌐 Attempting WebSocket connection to: ${wsUrl}`);

    setPeers((prev) => {
      const exists = prev.find((p) => p.id === peerId);
      if (exists) {
        return prev.map((p) => (p.id === peerId ? { ...p, status: 'connecting' } : p));
      }
      return [...prev, { id: peerId, address, port, status: 'connecting', latency: 0, connectedAt: new Date().toISOString() }];
    });

    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      // Expose to window for EditorPage DELTA_PUSH
      (window as any).docusync_socket = ws;

      ws.onopen = () => {
        console.log(`[WebSync] 🔌 WS connection established to ${wsUrl}! Sending PEER_HELLO...`);
        const session = mockAuthService.getCurrentUser();
        const displayName = mockAuthService.getDisplayName(session);
        ws.send(JSON.stringify({ type: 'PEER_HELLO', nodeId: localNodeId, displayName, nodeCount: 3, nodeIndex: 1, timestamp: new Date().toISOString() }));
        
        setPeers((prev) => {
          const updated = prev.map((p) => (p.id === peerId ? { ...p, status: 'connected' as const, latency: 0 } : p));
          uSet('peers', JSON.stringify(updated));
          return updated;
        });
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'MERGE_ACCEPT' || msg.type === 'MERGE_REJECT' || msg.type === 'MERGE_RESOLVED') {
            const resolvedBy = msg.resolvedBy || msg.rejectedBy || 'Owner';
            const action = msg.type === 'MERGE_REJECT' || msg.winner === 'A' ? 'rejected' : 'resolved';
            toast.success(`Conflict ${action} by ${resolvedBy.slice(0, 8)}. File synced.`, { icon: '✅' });
            
            // Instead of deleting it, we prepend a new log entry
            try {
              const stored = uGet('docusync_web_conflicts');
              let conflicts = stored ? JSON.parse(stored) : [];
              
              // We simulate the LWW L-R references since the WS payload is lightweight
              conflicts.unshift({
                conflictId: msg.conflictId || crypto.randomUUID(),
                fileId: msg.fileId,
                status: 'resolved',
                nodeIdA: 'SyncEngine',
                nodeIdB: msg.resolvedBy || 'Local',
                payloadA: '<h3>LWW Auto-Merge Node A</h3><p>Online base version reference point before merge.</p>',
                payloadB: '<h3>LWW Auto-Merge Node B</h3><p>Changes pushed and deterministically accepted by the mesh.</p>',
                detectedAt: new Date().toISOString()
              });
              
              conflicts = conflicts.slice(0, 50); // limit local storage footprint
              uSet('docusync_web_conflicts', JSON.stringify(conflicts));
            } catch (err) {}

            window.dispatchEvent(new CustomEvent('docusync_ws_merge_accept', { detail: msg }));
            window.dispatchEvent(new CustomEvent('docusync_ws_merge_reject', { detail: msg }));
          }
          if (msg.type === 'DELTA_PUSH') {
            console.log('[WebSync] 📥 Received DELTA_PUSH from', msg.nodeId);
            
            // Globally update the file content in local storage so Editor has latest state
            try {
              if (msg.content) {
                idbGetFile(String(msg.fileId)).then(f => {
                  if (f) {
                    f.content = msg.content;
                    f.updatedAt = new Date().toISOString();
                    if (msg.vectorClockJson) f.vectorClock = msg.vectorClockJson;
                    idbSaveFile(f);
                  }
                });
              }
            } catch (err) {}

            window.dispatchEvent(new CustomEvent('docusync_ws_delta', { detail: msg }));
          }
          if (msg.type === 'CURSOR_UPDATE') {
            window.dispatchEvent(new CustomEvent('docusync_ws_cursor', { detail: msg }));
          }
          if (msg.type === 'PEER_LIST') {
            setPeers((_prev) => {
              const connected = msg.peers.map((p: any) => ({
                id: p.nodeId,
                address: p.address,
                port: p.port,
                status: 'connected' as const,
                latency: 0,
                connectedAt: new Date().toISOString(),
                displayName: p.displayName,
                isHost: p.isHost
              }));
              uSet('peers', JSON.stringify(connected));
              return connected;
            });
          }
          if (msg.type === 'PEER_KICK') {
            if (msg.targetNodeId === localNodeId) {
              uSet('docusync_kicked', 'true');
              window.location.href = '/app';
            } else {
               setPeers(prev => prev.filter(p => p.id !== msg.targetNodeId));
            }
          }
        } catch (e) {
          console.error('[WebSync] Failed to parse WS message', e);
        }
      };

      ws.onerror = (err) => {
        console.warn(`[WebSync] ❌ WS connection failed to ${wsUrl}`, err);
        setPeers((prev) => {
          const updated = prev.map((p) => (p.id === peerId ? { ...p, status: 'disconnected' as const } : p));
          uSet('peers', JSON.stringify(updated));
          return updated;
        });
      };

      ws.onclose = () => {
        console.warn('[WebSync] WS connection closed');
        setPeers((prev) => {
          const updated = prev.map((p) => (p.id === peerId ? { ...p, status: 'disconnected' as const } : p));
          uSet('peers', JSON.stringify(updated));
          return updated;
        });
        socketRef.current = null;
      };
    } catch {
      console.warn('[WebSync] WS not supported in this context');
    }
  }, [localNodeId]);

  const disconnectPeer = useCallback((id: string) => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setPeers((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, status: 'disconnected' as const } : p));
      uSet('peers', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const pushCursor = useCallback((fileId: string | number, position: number, nodeIndex: number) => {
    lastCursorFileIdRef.current = fileId;

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'CURSOR_UPDATE',
        nodeId: localNodeId,
        nodeIndex,
        fileId: Number(fileId),
        position,
        timestamp: new Date().toISOString()
      }));
    }

    // Cloud fallback: peers without a reachable P2P host (or with the WS not
    // yet connected) still need to see each other's cursors, so always also
    // publish over the REST matchmaker regardless of WS state.
    const roomStr = uGet('current_room');
    if (roomStr) {
      try {
        const room = JSON.parse(roomStr);
        if (room.otp) {
          const _MATCHMAKER_URL = process.env.NEXT_PUBLIC_MATCHMAKER_URL || `${window.location.origin}/api/lobby`;
          const session = mockAuthService.getCurrentUser();
          fetch(`${_MATCHMAKER_URL}/cursors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              otp: room.otp,
              nodeId: localNodeId,
              displayName: mockAuthService.getDisplayName(session),
              color: nodeIndex === 0 ? '#3b82f6' : nodeIndex === 1 ? '#10b981' : '#f59e0b',
              from: position,
              to: position,
              fileId: Number(fileId),
            }),
          }).catch(() => {});
        }
      } catch (_e) {}
    }
  }, [localNodeId]);

  const kickPeer = useCallback((targetNodeId: string) => {
    // Desktop-hosted rooms have a real WebSocket server to deliver this to,
    // so keep sending it there when available. A web-hosted room has no
    // such socket — socketRef is never opened for one — so PEER_KICK alone
    // silently did nothing for the single most common case (someone using
    // the site, no desktop app involved). The HTTP call below is what
    // actually removes the peer for that case: it blocklists them
    // server-side, and their own next heartbeat picks up the `kicked` flag
    // (see pollPresence) and evicts them.
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'PEER_KICK', targetNodeId, hostNodeId: localNodeId }));
    }
    const s = uGet('current_room');
    if (s) {
      try {
        const room = JSON.parse(s);
        if (room.otp) {
          const _MATCHMAKER_URL = process.env.NEXT_PUBLIC_MATCHMAKER_URL || `${window.location.origin}/api/lobby`;
          fetch(`${_MATCHMAKER_URL}/kick`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ otp: room.otp, nodeId: localNodeId, targetNodeId }),
          }).catch(() => {});
        }
      } catch (_e) {}
    }
    setPeers((prev) => {
      const updated = prev.filter((p) => p.id !== targetNodeId);
      uSet('peers', JSON.stringify(updated));
      return updated;
    });
  }, [localNodeId]);

  const leaveRoom = useCallback((otp: string) => {
    // Explicitly tell the server this peer is gone, instead of relying on
    // its 5-minute presence TTL to expire — that's what made the member
    // count look "stuck" for minutes after someone actually left.
    // sendBeacon (not fetch) because this fires from a page that may be
    // navigating away or closing right now; a normal fetch can get
    // cancelled mid-flight when the page unloads, sendBeacon is
    // guaranteed to be delivered.
    try {
      const _MATCHMAKER_URL = process.env.NEXT_PUBLIC_MATCHMAKER_URL || `${window.location.origin}/api/lobby`;
      const payload = JSON.stringify({ nodeId: localNodeId, leaving: true, hostedRoom: { otp } });
      const blob = new Blob([payload], { type: 'application/json' });
      const sent = navigator.sendBeacon(`${_MATCHMAKER_URL}/heartbeat`, blob);
      if (!sent) {
        fetch(`${_MATCHMAKER_URL}/heartbeat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
      }
    } catch (_e) {}
    activeFileIdRef.current = null;
  }, [localNodeId]);
  leaveRoomRef.current = leaveRoom;

  const setActiveFileId = useCallback((fileId: string | number | null) => {
    activeFileIdRef.current = fileId;
    // Fire immediately (rather than waiting for the next 5s tick) so other
    // peers see this client's arrival/departure from a file promptly —
    // that's what a "last editor left" history checkpoint depends on.
    pollPresenceRef.current();
  }, []);

  return (
    <WebSyncContext.Provider value={{ peers, connectToPeer, disconnectPeer, pushCursor, kickPeer, socket: socketRef.current, setActiveFileId, leaveRoom }}>
      {children}
    </WebSyncContext.Provider>
  );
}

export function useWebSync() {
  return useContext(WebSyncContext);
}
