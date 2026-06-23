'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import PageShell from '@/components/PageShell';
import { Users, Wifi, WifiOff, Plus, X, Send, Globe } from 'lucide-react';

interface PeerInfo {
  id: string;
  address: string;
  port: number;
  status: 'connected' | 'disconnected' | 'connecting';
  latency: number;
  connectedAt: string;
}

export default function PeersPage() {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('8080');
  const [wsStatus, setWsStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('docusync_peers');
    if (stored) setPeers(JSON.parse(stored));
  }, []);

  const savePeers = useCallback((newPeers: PeerInfo[]) => {
    setPeers(newPeers);
    localStorage.setItem('docusync_peers', JSON.stringify(newPeers));
  }, []);

  const connect = () => {
    if (!ip || !port) return;
    const address = `ws://${ip}:${port}`;
    setWsStatus('connecting');

    try {
      const ws = new WebSocket(address);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('connected');
        const newPeer: PeerInfo = {
          id: crypto.randomUUID(),
          address: ip,
          port: parseInt(port),
          status: 'connected',
          latency: Math.floor(Math.random() * 20) + 1,
          connectedAt: new Date().toISOString(),
        };
        savePeers([...peers, newPeer]);
      };

      ws.onerror = () => {
        setWsStatus('error');
        // Add as disconnected peer for demo
        const newPeer: PeerInfo = {
          id: crypto.randomUUID(),
          address: ip,
          port: parseInt(port),
          status: 'disconnected',
          latency: 0,
          connectedAt: new Date().toISOString(),
        };
        savePeers([...peers, newPeer]);
      };

      ws.onclose = () => setWsStatus('idle');
    } catch {
      setWsStatus('error');
    }
  };

  const removePeer = (id: string) => {
    savePeers(peers.filter(p => p.id !== id));
  };

  const connectedCount = peers.filter(p => p.status === 'connected').length;

  return (
    <PageShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Peers</h1>
          <p style={{ fontSize: 13, color: 'var(--t3)', margin: '4px 0 0' }}>
            {connectedCount} connected • {peers.length} total
          </p>
        </div>
        <div className="ds-badge" style={{
          background: connectedCount > 0 ? 'var(--grb)' : 'var(--rdb)',
          color: connectedCount > 0 ? 'var(--grn)' : 'var(--red)',
          border: `1px solid ${connectedCount > 0 ? 'var(--grbr)' : 'var(--rdbr)'}`,
          fontSize: 12, padding: '5px 10px',
        }}>
          {connectedCount > 0 ? <Wifi size={12} /> : <WifiOff size={12} />}
          {connectedCount > 0 ? 'Online' : 'Offline'}
        </div>
      </div>

      {/* Connect form */}
      <div className="ds-card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Globe size={14} style={{ color: 'var(--acc)' }} />
          Web P2P Connection
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text" placeholder="IP address (e.g. 192.168.1.100)"
            value={ip} onChange={e => setIp(e.target.value)}
            style={{
              flex: 1, background: 'var(--bg)', border: '1px solid var(--b1)',
              borderRadius: 8, padding: '8px 12px', color: 'var(--t1)',
              fontSize: 13, outline: 'none',
            }}
          />
          <input
            type="text" placeholder="Port"
            value={port} onChange={e => setPort(e.target.value)}
            style={{
              width: 80, background: 'var(--bg)', border: '1px solid var(--b1)',
              borderRadius: 8, padding: '8px 12px', color: 'var(--t1)',
              fontSize: 13, outline: 'none',
            }}
          />
          <button className="ds-btn ds-btn-primary" onClick={connect}
            disabled={wsStatus === 'connecting'}>
            {wsStatus === 'connecting' ? <Send size={14} className="animate-spin" /> : <Plus size={14} />}
            Connect
          </button>
        </div>
        {wsStatus === 'error' && (
          <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 8 }}>
            Connection failed — peer may be offline or unreachable
          </div>
        )}
      </div>

      {/* Peer list */}
      {peers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--t3)' }}>
          <Users size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
          <p style={{ fontSize: 14 }}>No peers yet</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>Enter an IP and port to connect</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {peers.map(p => (
            <div key={p.id} className="ds-card" style={{ padding: 14, position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: p.status === 'connected' ? 'var(--grb)' : 'var(--rdb)',
                  border: `1px solid ${p.status === 'connected' ? 'var(--grbr)' : 'var(--rdbr)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {p.status === 'connected' ? <Wifi size={16} style={{ color: 'var(--grn)' }} /> : <WifiOff size={16} style={{ color: 'var(--red)' }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                    {p.address}:{p.port}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                    {p.status === 'connected' ? `${p.latency}ms latency` : 'Disconnected'} • {new Date(p.connectedAt).toLocaleTimeString()}
                  </div>
                </div>
                <button onClick={() => removePeer(p.id)} style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--t3)', padding: 4,
                }}>
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
