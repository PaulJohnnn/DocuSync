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

  // Load existing peers from localStorage on mount
  useEffect(() => {
    const stored = uGet('peers');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Only keep connected/connecting, but mark as disconnected initially until reconnected
        const initial = parsed.map((p: any) => ({ ...p, status: 'disconnected' }));
        setPeers(initial);
        // Try to auto-connect to the first one (assuming 1 host for the web app usually)
        if (initial.length > 0) {
          connectToPeer(initial[0].address, initial[0].port);
        }
      } catch (e) {
        console.error('Failed to parse peers from local storage', e);
      }
    }
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

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'PEER_HELLO', nodeId: `web-client`, displayName: 'DocuSync Web' }));
        
        setPeers((prev) => {
          const updated = prev.map((p) => (p.id === peerId ? { ...p, status: 'connected' as const, latency: 0 } : p));
          localStorage.setItem('docusync_peers', JSON.stringify(updated));
          return updated;
        });
        console.log('[WebSync] ✅ WS connected to', wsUrl);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'MERGE_ACCEPT') {
            const resolvedBy = msg.resolvedBy || 'Owner';
            toast.success(`Conflict resolved by ${resolvedBy.slice(0, 8)}. File synced.`, { icon: '✅' });
          }
        } catch (e) {
          console.error('[WebSync] Failed to parse WS message', e);
        }
      };

      ws.onerror = () => {
        console.warn('[WebSync] WS connection failed');
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
