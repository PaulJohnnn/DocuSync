'use client';
import { useState, useEffect, useCallback } from 'react';
import PageShell from '@/components/PageShell';
import { Wifi, WifiOff, Link2, Users, X, Copy, CheckCircle } from 'lucide-react';

// ── Central Matchmaker URL ─────────────────────────────────────────────────────
// All platforms hit this single URL. In production this is the Vercel deployment.
// In local dev it falls back to localhost:3000 (same machine).
const MATCHMAKER_URL =
  typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? 'https://docusync-pnc.vercel.app/api/lobby'
    : '/api/lobby';

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
  hostIp?: string;
  hostPort?: number;
  memberCount?: number;
}

export default function PeersPage() {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [otp, setOtp] = useState('');
  const [joining, setJoining] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [generating, setGenerating] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<RoomInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [joinError, setJoinError] = useState('');

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

  // ── HOST: Register room with real matchmaker API ───────────────────────────
  const generateOtp = async () => {
    if (!roomName.trim()) {
      alert('Please enter a room name first.');
      return;
    }
    setGenerating(true);
    try {
      // Web app doesn't have a real WS server, so we act as coordinator only.
      // The host IP shown is the web server address — desktop peers join via
      // the WS address returned by the matchmaker.
      const res = await fetch(`${MATCHMAKER_URL}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostNodeId: `web-${crypto.randomUUID()}`,
          hostIp: window.location.hostname || 'localhost',
          hostPort: 9000,
          roomName: roomName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create room');

      setGeneratedOtp(data.otp);
      const room: RoomInfo = { id: data.otp, name: roomName.trim(), memberCount: 1 };
      setCurrentRoom(room);
      localStorage.setItem('docusync_current_room', JSON.stringify(room));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate OTP');
    } finally {
      setGenerating(false);
    }
  };

  // ── JOIN: Look up room in matchmaker and connect WS ───────────────────────
  const handleJoinOtp = async () => {
    if (!otp || otp.length !== 5) return;
    setJoining(true);
    setJoinError('');
    try {
      const res = await fetch(`${MATCHMAKER_URL}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otp,
          clientNodeId: `web-${crypto.randomUUID()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join room');

      const { hostIp, hostPort, roomName: rName, memberCount } = data;

      // Try WebSocket connection to the host's desktop WS server
      const wsUrl = `ws://${hostIp}:${hostPort}`;
      console.log('[OTP Join] Connecting to host WS:', wsUrl);

      const room: RoomInfo = {
        id: otp,
        name: rName || 'OTP Session',
        hostIp,
        hostPort,
        memberCount,
      };
      setCurrentRoom(room);
      localStorage.setItem('docusync_current_room', JSON.stringify(room));
      alert('Successfully joined the room!');

      // Add peer to list
      const newPeer: PeerInfo = {
        id: `${hostIp}:${hostPort}`,
        address: hostIp,
        port: hostPort,
        status: 'connecting',
        latency: 0,
        connectedAt: new Date().toISOString(),
      };
      savePeers([...peers, newPeer]);

      // Attempt WS connection (browser env)
      try {
        const ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'PEER_HELLO', nodeId: `web-client`, displayName: 'DocuSync Web' }));
          newPeer.status = 'connected';
          newPeer.latency = 0;
          savePeers([...peers, newPeer]);
          console.log('[OTP Join] ✅ WS connected to', wsUrl);
        };
        ws.onerror = () => {
          console.warn('[OTP Join] WS connection failed (host may be offline or on different network)');
          setPeers(prev => {
            const next = prev.map(p => p.id === newPeer.id ? { ...p, status: 'disconnected' as const } : p);
            localStorage.setItem('docusync_peers', JSON.stringify(next));
            return next;
          });
        };
        ws.onclose = () => {
          console.warn('[OTP Join] WS connection closed');
          setPeers(prev => {
            const next = prev.map(p => p.id === newPeer.id ? { ...p, status: 'disconnected' as const } : p);
            localStorage.setItem('docusync_peers', JSON.stringify(next));
            return next;
          });
        };
      } catch {
        console.warn('[OTP Join] WS not supported in this context');
      }

      setOtp('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid OTP';
      setJoinError(msg);
    } finally {
      setJoining(false);
    }
  };

  const copyOtp = () => {
    if (generatedOtp) {
      navigator.clipboard.writeText(generatedOtp).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const removePeer = (id: string) => {
    savePeers(peers.filter(p => p.id !== id));
  };

  const leaveRoom = () => {
    setCurrentRoom(null);
    setGeneratedOtp('');
    setRoomName('');
    localStorage.removeItem('docusync_current_room');
  };

  const connectedCount = peers.filter(p => p.status === 'connected').length;

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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {currentRoom && (
            <button
              onClick={leaveRoom}
              style={{ fontSize: 12, padding: '5px 10px', background: 'var(--rdb)', color: 'var(--red)', border: '1px solid var(--rdbr)', borderRadius: 6, cursor: 'pointer' }}
            >
              Leave Room
            </button>
          )}
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
      </div>

      {/* Connected Room Indicator */}
      {currentRoom && (
        <div style={{
          background: 'rgba(34,197,94,0.08)',
          border: '1px solid rgba(34,197,94,0.25)',
          borderRadius: 12, padding: '14px 18px',
          marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', flexShrink: 0, boxShadow: '0 0 6px #22c55e' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>
              ✅ Connected to Room: &quot;{currentRoom.name}&quot;
            </div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
              OTP: <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--grn)' }}>{currentRoom.id}</span>
              {currentRoom.hostIp && (
                <span> • Host: {currentRoom.hostIp}:{currentRoom.hostPort}</span>
              )}
              {currentRoom.memberCount && (
                <span> • {currentRoom.memberCount} member{currentRoom.memberCount !== 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── OTP Matchmaker ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>

        {/* Card 1: Host */}
        <div className="ds-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Users size={20} color="var(--acc)" />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--t1)' }}>Host a Live Session</h3>
          </div>
          <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16 }}>
            Generate a secure 5-digit code and share it with peers to join this session.
          </p>
          <input
            type="text"
            placeholder="Enter room name (e.g. paulpy)"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            disabled={!!generatedOtp}
            style={{
              width: '100%', marginBottom: 16, padding: '10px 12px',
              background: 'var(--bg2)', border: '1px solid var(--b2)',
              borderRadius: 8, color: 'var(--t1)', outline: 'none', boxSizing: 'border-box',
            }}
          />

          {!generatedOtp ? (
            <button
              className="ds-btn ds-btn-primary"
              onClick={generateOtp}
              disabled={generating || !roomName.trim()}
              style={{ width: '100%', justifyContent: 'center', padding: '10px 0' }}
            >
              {generating ? 'Registering...' : 'Generate 5-Digit Collaboration OTP'}
            </button>
          ) : (
            <div style={{
              display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', background: 'rgba(34, 197, 94, 0.05)',
              borderRadius: 8, border: '1px solid rgba(34, 197, 94, 0.2)', padding: 16, gap: 8,
            }}>
              <div style={{ fontSize: 48, fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--grn)', letterSpacing: '0.15em' }}>
                {generatedOtp}
              </div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                Valid for 60 minutes. Share this OTP with peers.
              </div>
              <button
                onClick={copyOtp}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 12px', background: 'transparent', border: '1px solid var(--b2)', borderRadius: 6, cursor: 'pointer', color: 'var(--t2)' }}
              >
                {copied ? <CheckCircle size={12} color="var(--grn)" /> : <Copy size={12} />}
                {copied ? 'Copied!' : 'Copy OTP'}
              </button>
            </div>
          )}
        </div>

        {/* Card 2: Join */}
        <div className="ds-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Link2 size={20} color="var(--grn)" />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--t1)' }}>Join Peer via OTP</h3>
          </div>
          <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 24 }}>
              Enter the 5-digit OTP from the host to join their live session.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <input
                type="text"
                placeholder="e.g. 88412"
                value={otp}
                onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 5)); setJoinError(''); }}
                disabled={joining}
                onKeyDown={(e) => e.key === 'Enter' && otp.length === 5 && handleJoinOtp()}
                style={{
                  flex: 1, padding: '10px 16px', borderRadius: 6,
                  border: `1px solid ${joinError ? 'var(--red)' : 'var(--b2)'}`,
                  background: 'var(--bg2)', color: 'var(--t1)',
                  fontFamily: 'monospace', fontSize: 18, letterSpacing: '0.2em',
                }}
              />
              <button
                className="ds-btn ds-btn-primary"
                onClick={handleJoinOtp}
                disabled={joining || otp.length !== 5}
                style={{ padding: '0 24px' }}
              >
                {joining ? 'Connecting...' : 'Connect'}
              </button>
            </div>
            {joinError && (
              <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>⚠ {joinError}</p>
            )}
          </div>
        </div>

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
                    {p.status} • {new Date(p.connectedAt).toLocaleTimeString()}
                  </div>
                </div>
                <button onClick={() => removePeer(p.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 4 }}>
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
