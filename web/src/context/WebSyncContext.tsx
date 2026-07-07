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

export interface PeerInfo {
  id: string;
  address: string;
  port: number;
  status: 'connected' | 'connecting' | 'disconnected';
  latency: number;
  connectedAt?: string;
}

interface WebSyncContextValue {
  peers: PeerInfo[];
  connectToPeer: (address: string, port: number) => void;
  disconnectPeer: (id: string) => void;
  socket: WebSocket | null;
}

const WebSyncContext = createContext<WebSyncContextValue>({
  peers: [],
  connectToPeer: () => {},
  disconnectPeer: () => {},
  socket: null,
});

export function WebSyncProvider({ children }: { children: ReactNode }) {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

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

  const connectToPeer = useCallback((address: string, port: number) => {
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
        console.log(`[WebSync] ✅ WS connection established to ${wsUrl}! Sending PEER_HELLO...`);
        ws.send(JSON.stringify({ type: 'PEER_HELLO', nodeId: `web-client-${Date.now()}`, displayName: 'DocuSync Web', nodeCount: 3, nodeIndex: 1, timestamp: new Date().toISOString() }));
        
        setPeers((prev) => {
          const updated = prev.map((p) => (p.id === peerId ? { ...p, status: 'connected' as const, latency: 0 } : p));
          localStorage.setItem('docusync_peers', JSON.stringify(updated));
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
        } catch (e) {
          console.error('[WebSync] Failed to parse WS message', e);
        }
      };

      ws.onerror = (err) => {
        console.warn(`[WebSync] ❌ WS connection failed to ${wsUrl}`, err);
        setPeers((prev) => {
          const updated = prev.map((p) => (p.id === peerId ? { ...p, status: 'disconnected' as const } : p));
          localStorage.setItem('docusync_peers', JSON.stringify(updated));
          return updated;
        });
      };

      ws.onclose = () => {
        console.warn('[WebSync] WS connection closed');
        setPeers((prev) => {
          const updated = prev.map((p) => (p.id === peerId ? { ...p, status: 'disconnected' as const } : p));
          localStorage.setItem('docusync_peers', JSON.stringify(updated));
          return updated;
        });
        socketRef.current = null;
      };
    } catch {
      console.warn('[WebSync] WS not supported in this context');
    }
  }, []);

  const disconnectPeer = useCallback((id: string) => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setPeers((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, status: 'disconnected' as const } : p));
      localStorage.setItem('docusync_peers', JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <WebSyncContext.Provider value={{ peers, connectToPeer, disconnectPeer, socket: socketRef.current }}>
      {children}
    </WebSyncContext.Provider>
  );
}

export function useWebSync() {
  return useContext(WebSyncContext);
}
