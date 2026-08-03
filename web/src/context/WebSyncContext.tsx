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
import * as mockAuthService from '@/lib/mockAuthService';

export interface PeerInfo {
  id: string;
  address: string;
  port: number;
  status: 'connected' | 'connecting' | 'disconnected';
  latency: number;
  connectedAt?: string;
  displayName?: string;
}

interface WebSyncContextValue {
  peers: PeerInfo[];
  connectToPeer: (address: string, port: number) => void;
  disconnectPeer: (id: string) => void;
  pushCursor: (fileId: string, position: number, nodeIndex: number) => void;
  socket: WebSocket | null;
}

const WebSyncContext = createContext<WebSyncContextValue>({
  peers: [],
  connectToPeer: () => {},
  disconnectPeer: () => {},
  pushCursor: () => {},
  socket: null,
});

export function WebSyncProvider({ children }: { children: ReactNode }) {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  
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
    const wsUrl = `ws://${address}:${port}`;
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
            window.dispatchEvent(new CustomEvent('docusync_ws_merge_accept', { detail: msg }));
            window.dispatchEvent(new CustomEvent('docusync_ws_merge_reject', { detail: msg }));
          }
          if (msg.type === 'DELTA_PUSH') {
            console.log('[WebSync] 📥 Received DELTA_PUSH from', msg.nodeId);
            window.dispatchEvent(new CustomEvent('docusync_ws_delta', { detail: msg }));
          }
          if (msg.type === 'CURSOR_UPDATE') {
            window.dispatchEvent(new CustomEvent('docusync_ws_cursor', { detail: msg }));
          }
          if (msg.type === 'PEER_LIST') {
            setPeers((prev) => {
              const connected = msg.peers.map((p: any) => ({
                id: p.nodeId,
                address: p.address,
                port: p.port,
                status: 'connected' as const,
                latency: 0,
                connectedAt: new Date().toISOString(),
                displayName: p.displayName
              }));
              uSet('peers', JSON.stringify(connected));
              return connected;
            });
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
  }, [localNodeId]);

  return (
    <WebSyncContext.Provider value={{ peers, connectToPeer, disconnectPeer, pushCursor, socket: socketRef.current }}>
      {children}
    </WebSyncContext.Provider>
  );
}

export function useWebSync() {
  return useContext(WebSyncContext);
}
