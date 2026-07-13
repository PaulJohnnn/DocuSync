import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PeerInfo {
  id: string;
  address: string;
  port: number;
  status: 'connected' | 'connecting' | 'disconnected';
  latency: number;
  connectedAt?: string;
}

interface MobileSyncContextValue {
  peers: PeerInfo[];
  connectToPeer: (address: string, port: number) => Promise<boolean>;
  disconnectPeer: (id: string) => void;
  pushCursor: (fileId: string, position: number, nodeIndex: number) => void;
  socket: WebSocket | null;
}

const MobileSyncContext = createContext<MobileSyncContextValue>({
  peers: [],
  connectToPeer: async () => false,
  disconnectPeer: () => {},
  pushCursor: () => {},
  socket: null,
});

const PEERS_KEY = 'docusync_mobile_peers';

export function MobileSyncProvider({ children }: { children: ReactNode }) {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(PEERS_KEY).then((stored) => {
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const initial = parsed.map((p: any) => ({ ...p, status: 'disconnected' }));
          setPeers(initial);
          if (initial.length > 0) {
            connectToPeer(initial[0].address, initial[0].port);
          }
        } catch (e) {
          console.error('Failed to parse peers from storage', e);
        }
      }
    });
  }, []);

  const connectToPeer = useCallback((address: string, port: number): Promise<boolean> => {
    return new Promise(async (resolve) => {
      const wsUrl = `ws://${address}:${port}`;
      const peerId = `${address}:${port}`;

      if (socketRef.current?.readyState === WebSocket.OPEN) {
        resolve(true);
        return;
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

        ws.onopen = async () => {
          ws.send(JSON.stringify({ type: 'PEER_HELLO', nodeId: `mobile-client`, displayName: 'DocuSync Mobile' }));
          
          setPeers((prev) => {
            const next = prev.map((p) => (p.id === peerId ? { ...p, status: 'connected' as const, latency: 0 } : p));
            AsyncStorage.setItem(PEERS_KEY, JSON.stringify(next));
            return next;
          });
          resolve(true);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'MERGE_ACCEPT' || msg.type === 'MERGE_REJECT' || msg.type === 'MERGE_RESOLVED') {
              const resolvedBy = msg.resolvedBy || msg.rejectedBy || 'Owner';
              const action = msg.type === 'MERGE_REJECT' || msg.winner === 'A' ? 'rejected' : 'resolved';
              Alert.alert('✅ Conflict Resolved', `Conflict ${action} by ${resolvedBy.slice(0, 8)}. File synced.`);
              import('react-native').then(({ DeviceEventEmitter }) => {
                DeviceEventEmitter.emit('docusync_ws_merge_accept', msg);
                DeviceEventEmitter.emit('docusync_ws_merge_reject', msg);
              });
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
                AsyncStorage.setItem(PEERS_KEY, JSON.stringify(connected));
                return connected;
              });
            }
          } catch (e) {
            console.error('[MobileSync] Failed to parse WS message', e);
          }
        };

        const handleDisconnect = () => {
          setPeers((prev) => {
            const next = prev.map((p) => (p.id === peerId ? { ...p, status: 'disconnected' as const } : p));
            AsyncStorage.setItem(PEERS_KEY, JSON.stringify(next));
            return next;
          });
        };

        ws.onerror = () => {
          handleDisconnect();
          resolve(false);
        };

        ws.onclose = () => {
          handleDisconnect();
          socketRef.current = null;
        };

        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            handleDisconnect();
            resolve(false);
          }
        }, 5000);
      } catch {
        resolve(false);
      }
    });
  }, []);

  const disconnectPeer = useCallback((id: string) => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setPeers((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, status: 'disconnected' as const } : p));
      AsyncStorage.setItem(PEERS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const pushCursor = useCallback((fileId: string | number, position: number, nodeIndex: number) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'CURSOR_UPDATE',
        nodeId: `mobile-client`,
        nodeIndex,
        fileId: Number(fileId),
        position,
        timestamp: new Date().toISOString()
      }));
    }
  }, []);

  return (
    <MobileSyncContext.Provider value={{ peers, connectToPeer, disconnectPeer, pushCursor, socket: socketRef.current }}>
      {children}
    </MobileSyncContext.Provider>
  );
}

export function useMobileSync() {
  return useContext(MobileSyncContext);
}
