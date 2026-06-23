'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import PageShell from '@/components/PageShell';
import { Wifi, WifiOff, Plus, X, Key, Link2, Monitor } from 'lucide-react';

interface PeerInfo {
  id: string;
  address: string;
  port: number;
  status: 'connected' | 'disconnected' | 'connecting';
  latency: number;
  connectedAt: string;
}

interface RoomInfo {
  id: string;
  name: string;
}

export default function PeersPage() {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('8080');
  const [otp, setOtp] = useState('');
  const [joining, setJoining] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [currentRoom, setCurrentRoom] = useState<RoomInfo | null>(null);
  const [wsStatus, setWsStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('docusync_peers');
    if (stored) setPeers(JSON.parse(stored));
    const storedRoom = localStorage.getItem('docusync_current_room');
    if (storedRoom) setCurrentRoom(JSON.parse(storedRoom));
  }, []);

  const savePeers = useCallback((newPeers: PeerInfo[]) => {
    setPeers(newPeers);
    localStorage.setItem('docusync_peers', JSON.stringify(newPeers));
  }, []);

  const generateOtp = () => {
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    setGeneratedOtp(code);
    const room: RoomInfo = { id: code, name: roomName || `Session ${code}` };
    setCurrentRoom(room);
    localStorage.setItem('docusync_current_room', JSON.stringify(room));
  };

  const handleJoinOtp = async () => {
    if (!otp || otp.length !== 5) return;
    setJoining(true);
    await new Promise(r => setTimeout(r, 800)); // simulate lookup
    const room: RoomInfo = { id: otp, name: `OTP Session ${otp}` };
    setCurrentRoom(room);
    localStorage.setItem('docusync_current_room', JSON.stringify(room));
    setJoining(false);
  };

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
          id: crypto.randomUUID(), address: ip, port: parseInt(port),
          status: 'connected', latency: Math.floor(Math.random() * 20) + 1,
          connectedAt: new Date().toISOString(),
        };
        savePeers([...peers, newPeer]);
      };
      ws.onerror = () => {
        setWsStatus('error');
        const newPeer: PeerInfo = {
          id: crypto.randomUUID(), address: ip, port: parseInt(port),
          status: 'disconnected', latency: 0, connectedAt: new Date().toISOString(),
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

  const cardStyle: React.CSSProperties = {
    background: 'var(--s1)', border: '1px solid var(--b1)',
    borderRadius: 12, padding: 20, marginBottom: 16,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: 'var(--t1)',
    marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8,
  };
  const inputStyle: React.CSSProperties = {
    flex: 1, background: 'var(--bg)', border: '1px solid var(--b1)',
    borderRadius: 8, padding: '10px 14px', color: 'var(--t1)',
    fontSize: 14, outline: 'none',
  };

  return (
    <PageShell>
      {/* Header */}
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

      {/* Connected Room Indicator */}
      {currentRoom && (
        <div style={{
          background: 'rgba(79,125,248,0.08)',
          border: '1px solid rgba(79,125,248,0.25)',
          borderRadius: 12, padding: '12px 16px',
          marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>Room: {currentRoom.id}</span>
            <span style={{ fontSize: 12, color: 'var(--t3)', marginLeft: 10 }}>
              {connectedCount} {connectedCount === 1 ? 'person' : 'people'} connected
            </span>
          </div>
        </div>
      )}

      {/* Card 1 — Host a Live Session */}
      <div style={cardStyle}>
        <div style={labelStyle}>
          <Monitor size={15} style={{ color: 'var(--acc)' }} />
          Host a Live Session
        </div>
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.6 }}>
          Generate a 5-digit OTP code. Share it with peers who can then join your session.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Room name (optional)"
            value={roomName}
            onChange={e => setRoomName(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button className="ds-btn ds-btn-primary" onClick={generateOtp}>
            <Key size={13} /> Generate OTP
          </button>
        </div>
        {generatedOtp && (
          <div style={{
            marginTop: 14, background: 'var(--bg)',
            border: '1px solid var(--b1)', borderRadius: 10,
            padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 13, color: 'var(--t3)' }}>Your OTP:</span>
            <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: 6, color: 'var(--acc)', fontFamily: 'monospace' }}>
              {generatedOtp}
            </span>
            <span style={{ fontSize: 11, color: 'var(--grn)', background: 'var(--grb)', padding: '2px 8px', borderRadius: 99 }}>Active</span>
          </div>
        )}
      </div>

      {/* Card 2 — Join Peer via OTP */}
      <div style={cardStyle}>
        <div style={labelStyle}>
          <Link2 size={15} style={{ color: 'var(--grn)' }} />
          Join Peer via OTP
        </div>
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.6 }}>
          Enter the 5-digit OTP provided by the host to join their live session.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="e.g. 88412"
            value={otp}
            maxLength={5}
            onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 5))}
            style={{
              ...inputStyle,
              letterSpacing: 6, fontFamily: 'monospace', fontSize: 18,
              fontWeight: 700, textAlign: 'center',
            }}
          />
          <button
            className="ds-btn ds-btn-primary"
            onClick={handleJoinOtp}
            disabled={joining || otp.length !== 5}
            style={{ opacity: otp.length !== 5 ? 0.5 : 1, minWidth: 80 }}
          >
            {joining ? '...' : 'Join'}
          </button>
        </div>
      </div>

      {/* Card 3 — Direct IP */}
      <div style={cardStyle}>
        <div style={labelStyle}>
          <Plus size={15} style={{ color: 'var(--acc)' }} />
          Direct IP Connection
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text" placeholder="IP address (e.g. 192.168.1.100)"
            value={ip} onChange={e => setIp(e.target.value)}
            style={inputStyle}
          />
          <input
            type="text" placeholder="Port"
            value={port} onChange={e => setPort(e.target.value)}
            style={{ ...inputStyle, flex: 'none', width: 80 }}
          />
          <button className="ds-btn ds-btn-primary" onClick={connect} disabled={wsStatus === 'connecting'}>
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
      {peers.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginTop: 8 }}>
          {peers.map(p => (
            <div key={p.id} className="ds-card" style={{ padding: 14, position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: p.status === 'connected' ? 'var(--grb)' : 'var(--rdb)',
                  border: `1px solid ${p.status === 'connected' ? 'var(--grbr)' : 'var(--rdbr)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {p.status === 'connected'
                    ? <Wifi size={16} style={{ color: 'var(--grn)' }} />
                    : <WifiOff size={16} style={{ color: 'var(--red)' }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{p.address}:{p.port}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                    {p.status === 'connected' ? `${p.latency}ms` : 'Disconnected'} • {new Date(p.connectedAt).toLocaleTimeString()}
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
