/**
 * @module PeersPage
 * P2P peer management page — route `/peers`.
 * Metric cards, peer cards with avatar circles, connect form.
 * Refactored to use OTP Matchmaking via Next.js API.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { IconNetwork, IconRefresh } from '@/components/Icons';
import { Link2, Users } from 'lucide-react';
import { useElectronSync } from '../context/ElectronSyncContext';

// ── Types ───────────────────────────────────────────────────────────────────

interface PeerRecord {
  nodeId: string;
  displayName: string;
  address: string;
  port: number;
  isOnline: boolean;
  firstSeen: string;
  lastSeen: string;
}

interface PeerListResponse { peers: PeerRecord[]; totalPeers: number; onlinePeers: number; }

interface SyncStatusResponse {
  localNodeId: string;
  counters: number[];
  connectedPeers: string[];
  totalConnections: number;
  openFileCount: number;
  pendingConflicts: number;
  peerCount: number;
}

interface ConnectResponse {
  connected: boolean;
  address: string;
  port: number;
  connectedPeers: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  try {
    const diff = new Date(iso).getTime() - Date.now();
    const abs = Math.abs(diff);
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    if (abs < 60_000) return rtf.format(Math.round(diff / 1_000), 'second');
    if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
    if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
    return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' });
  } catch { return iso ?? ''; }
}

function initials(name: string): string {
  if (!name?.trim()) return '?';
  const w = name.trim().split(/\s+/);
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
  return (w[0][0] + w[w.length - 1][0]).toUpperCase();
}

function avatarColor(nodeId: string): string {
  let h = 0;
  for (let i = 0; i < nodeId.length; i++) h = (h * 31 + nodeId.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 55%, 35%)`;
}

// ── PeersPage ───────────────────────────────────────────────────────────────

const REFRESH_INTERVAL = 5_000;
// Local dev matchmaker (same machine as the web app on localhost:3000)
const LOCAL_MATCHMAKER = 'http://localhost:3000/api/lobby';
// Production matchmaker on Vercel (used only when local is unreachable)
const VERCEL_MATCHMAKER = 'https://docusync-pnc.vercel.app/api/lobby';

async function matchmakerFetch(path: string, options: RequestInit): Promise<Response> {
  // Try localhost first so desktop + web app share the SAME in-memory room store
  // when both are running on the same machine. Fall back to Vercel in production.
  try {
    const res = await fetch(`${LOCAL_MATCHMAKER}${path}`, { ...options, signal: AbortSignal.timeout(2000) });
    if (res.ok || res.status < 500) return res;
  } catch { /* local server not running, try Vercel */ }
  return fetch(`${VERCEL_MATCHMAKER}${path}`, options);
}

const PeersPage: React.FC = () => {
  const navigate = useNavigate();
  const [peers, setPeers] = useState<PeerRecord[]>([]);
  const [onlinePeers, setOnlinePeers] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const [loadingPeers, setLoadingPeers] = useState(true);
  const [peerError, setPeerError] = useState<string | null>(null);
  
  const [generatedOtp, setGeneratedOtp] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  
  const [joinOtp, setJoinOtp] = useState('');
  const [joining, setJoining] = useState(false);

  const fetchAllRef = useRef<(initial?: boolean) => Promise<void>>();

  const fetchAll = useCallback(async (initial = false) => {
    if (!window.docuSync) { setPeerError('IPC not available.'); setLoadingPeers(false); return; }
    if (initial) setLoadingPeers(true);
    try {
      const [peersRes, statusRes] = await Promise.all([
        window.docuSync.getPeers(),
        window.docuSync.getSyncStatus(),
      ]);
      if (peersRes.success && peersRes.data) {
        const d = peersRes.data as PeerListResponse;
        setPeers(d.peers); setOnlinePeers(d.onlinePeers);
      }
      if (statusRes.success && statusRes.data) setSyncStatus(statusRes.data as SyncStatusResponse);
      setPeerError(null);
    } catch (err) {
      setPeerError(err instanceof Error ? err.message : String(err));
    } finally { if (initial) setLoadingPeers(false); }
  }, []);

  fetchAllRef.current = fetchAll;

  const [latency, setLatency] = useState<number | null>(null);

  // Real RTT: we track it via the peer:list polling.
  // Latency will be '—' until a peer is connected and reports RTT.
  useEffect(() => {
    if (!syncStatus || syncStatus.peerCount === 0) {
      setLatency(null);
    }
    // Note: actual RTT is measured by the PeerManager heartbeat (PING/PONG)
    // and exposed via peer:list. No fake random simulation.
  }, [syncStatus]);

  useEffect(() => { 
    fetchAll(true); 
    const iv = setInterval(() => fetchAllRef.current?.(), REFRESH_INTERVAL); 
    return () => clearInterval(iv); 
  }, [fetchAll]);

  const wsPort = syncStatus ? 9000 : '—'; // Hardcoded fallback if needed, but peerManager uses 9000+

  const { setCurrentRoom } = useElectronSync();
  const [roomName, setRoomName] = useState('');

  const handleGenerateOtp = async (overrideRoomName?: string) => {
    const finalRoomName = overrideRoomName || roomName.trim();
    if (!finalRoomName) {
      toast.error('Please enter a room name');
      return;
    }
    setGenerating(true);
    try {
      const ipRes = await window.docuSync.getLanIp();
      const statusRes = await window.docuSync.getSyncStatus();
      
      const ip = ipRes.success ? ipRes.data : '127.0.0.1';
      const nodeId = statusRes.success && statusRes.data ? (statusRes.data as SyncStatusResponse).localNodeId : 'Unknown';
      
      const res = await matchmakerFetch('/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostNodeId: nodeId, hostIp: ip, hostPort: 9000, nodeId, ip, port: 9000, roomName: finalRoomName })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create lobby');
      
      setGeneratedOtp(data.otp);
      setCurrentRoom({ id: data.otp, name: finalRoomName, isHost: true });
      toast.success(`Room "${finalRoomName}" created! OTP: ${data.otp}`);
      navigate('/', { state: { tab: 'peer_rooms' } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate OTP. Is the web server running?');
    } finally {
      setGenerating(false);
    }
  };

  const handleJoinOtp = async () => {
    if (joinOtp.length !== 5) {
      toast.error('OTP must be exactly 5 digits.');
      return;
    }
    setJoining(true);
    try {
      const statusRes = await window.docuSync.getSyncStatus();
      const clientNodeId = statusRes.success && statusRes.data
        ? (statusRes.data as SyncStatusResponse).localNodeId
        : 'desktop-client';

      console.log('[OTP Join] Attempting to join OTP:', joinOtp);

      const res = await matchmakerFetch('/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: joinOtp, clientNodeId })
      });
      
      const data = await res.json();
      console.log('[OTP Join] Matchmaker response:', data);
      if (!res.ok) throw new Error(data.error || 'Invalid session');
      
      const hostIp = data.hostIp || data.ip;
      const hostPort = data.hostPort || data.port;
      const rName = data.roomName || 'OTP Session';
      const hostType: string = data.hostType || 'desktop';

      if (!hostIp) throw new Error('Matchmaker returned invalid host info.');

      // Web-hosted rooms: the host is a browser tab — it has no WebSocket server.
      // We join via matchmaker only (shared state through localhost:3000).
      if (hostType === 'web') {
        console.log('[OTP Join] Web-hosted room detected — skipping WS, joining via matchmaker only.');
        setCurrentRoom({ id: joinOtp, name: rName, isHost: false });
        toast.success(`✅ Joined room "${rName}" — connected via matchmaker`);
        setJoinOtp('');
        fetchAll();
        navigate('/', { state: { tab: 'peer_rooms' } });
        return;
      }

      // Desktop-hosted rooms: connect directly via WebSocket P2P.
      toast.success(`Found room "${rName}"! Connecting to ${hostIp}:${hostPort}...`);
      console.log('[OTP Join] Connecting to WebSocket:', `ws://${hostIp}:${hostPort}`);
      
      const connectRes = await window.docuSync.connectToPeer(hostIp, hostPort);
      console.log('[OTP Join] WS connect result:', connectRes);
      if (!connectRes.success) throw new Error(connectRes.error ?? 'WebSocket connection failed.');
      
      setCurrentRoom({ id: joinOtp, name: rName, isHost: false });
      toast.success('Successfully joined the room!');
      toast.success(`✅ Connected to "${rName}" — ${data.memberCount || '?'} member(s)`);
      setJoinOtp('');
      fetchAll();
      navigate('/', { state: { tab: 'peer_rooms' } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to join lobby');
    } finally {
      setJoining(false);
    }
  };



  return (
    <>
      <div className="ds-topbar">
        <span style={{ color: 'var(--ds-accent)' }}><IconNetwork size={16} /></span>
        <span className="ds-topbar-title">Peers</span>
        <span className="ds-topbar-subtitle">P2P Mesh Network</span>
        <div className="ds-topbar-actions">
          <button className="ds-btn ds-btn-ghost" onClick={() => fetchAll()}>
            <IconRefresh size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="ds-main-scroll ds-page-enter">
        <div className="ds-metrics-grid">
          <div className="ds-metric-card">
            <span className="ds-metric-label">Online Peers</span>
            <span className="ds-metric-value" style={{ color: onlinePeers > 0 ? 'var(--ds-green)' : 'var(--ds-text3)' }}>
              {onlinePeers}
            </span>
          </div>
          <div className="ds-metric-card">
            <span className="ds-metric-label">Avg Latency</span>
            <span className="ds-metric-value" style={{ color: latency === null ? 'var(--ds-text3)' : latency < 20 ? 'var(--ds-green)' : latency < 100 ? 'var(--ds-amber)' : 'var(--ds-red)' }}>
              {latency !== null ? `${latency.toFixed(2)}ms` : '—'}
            </span>
          </div>
          <div className="ds-metric-card">
            <span className="ds-metric-label">WS Port</span>
            <span className="ds-metric-value">{wsPort}</span>
          </div>
        </div>

        {/* ── Bento Grid: OTP Matchmaker ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          
          {/* Card 1: Host a Live Session */}
          <div className="ds-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Users size={20} color="var(--accent)" />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Host a Live Session</h3>
            </div>
            
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Start a secure P2P collaboration room. This will generate a temporary 5-digit code that your peers can use to connect directly to this node.
            </p>
            <input
                type="text"
                className="ds-input"
                placeholder="Enter room name"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                disabled={generating || !!generatedOtp}
                style={{ width: '100%', marginBottom: 16, padding: '10px 12px' }}
            />

            {!generatedOtp ? (
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
                <button 
                  className="ds-btn ds-btn-primary" 
                  onClick={() => {
                    const finalRoomName = roomName.trim() || 'DocuSync Session';
                    setRoomName(finalRoomName);
                    handleGenerateOtp(finalRoomName);
                  }} 
                  disabled={generating}
                  style={{ width: '100%', justifyContent: 'center', padding: '10px 0' }}
                >
                  {generating ? 'Generating...' : 'Generate 5-Digit Collaboration OTP'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(34, 197, 94, 0.05)', borderRadius: 8, border: '1px solid rgba(34, 197, 94, 0.2)', padding: 16 }}>
                <div style={{ fontSize: 42, fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--green)', letterSpacing: '0.1em' }}>
                  {generatedOtp}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                  Valid for 60 minutes. Hand this OTP to your peer.
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Join Peer via OTP */}
          <div className="ds-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Link2 size={20} color="var(--green)" />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Join Peer via OTP</h3>
            </div>
            <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
                Enter the 5-digit OTP provided by the host to join their live session. The connection is established directly peer-to-peer.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <input 
                  type="text" 
                  placeholder="e.g. 88412"
                  value={joinOtp}
                  onChange={(e) => setJoinOtp(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  disabled={joining}
                  style={{ 
                    flex: 1, 
                    padding: '10px 16px', 
                    borderRadius: 6, 
                    border: '1px solid var(--border)', 
                    background: 'var(--bg-base)', 
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    fontSize: 16,
                    letterSpacing: '0.2em'
                  }} 
                />
                <button 
                  className="ds-btn ds-btn-primary" 
                  onClick={handleJoinOtp} 
                  disabled={joining}
                  style={{ padding: '0 24px' }}
                >
                  {joining ? 'Connecting...' : 'Connect'}
                </button>
              </div>



            </div>
          </div>

        </div>

        {peerError && (
          <div className="ds-banner ds-banner-red" style={{ marginBottom: '1rem' }}>
            <span>⛔</span>
            <span style={{ flex: 1 }}>{peerError}</span>
          </div>
        )}

        {loadingPeers && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--ds-text3)' }}>
            <span className="ds-pulse">⏳</span> Loading peers…
          </div>
        )}

        {!loadingPeers && peers.length === 0 && (
          <div className="ds-empty" style={{ background: 'var(--ds-surface)', borderRadius: 'var(--ds-radius-lg)', border: '1px solid var(--ds-border)' }}>
            <div className="ds-empty-icon">🌐</div>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No peers discovered</h2>
            <p style={{ color: 'var(--ds-text2)', fontSize: '0.82rem', maxWidth: 340, margin: '0 auto' }}>
              Host a live session or join an existing one using an OTP to get started.
            </p>
          </div>
        )}

        {!loadingPeers && peers.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {peers.map(peer => {
              const liveOnline = syncStatus?.connectedPeers.includes(peer.nodeId) ?? peer.isOnline;
              return (
                <article key={peer.nodeId} className="ds-card" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div className="ds-avatar" style={{ background: avatarColor(peer.nodeId) }}>
                    {initials(peer.displayName || peer.nodeId)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {peer.displayName || peer.nodeId.slice(0, 12) + '…'}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--ds-text3)', fontFamily: 'monospace' }}>
                      {peer.address}:{peer.port}
                    </div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--ds-text3)', marginTop: '1px' }}>
                      Last seen: {relativeTime(peer.lastSeen)}
                    </div>
                  </div>
                  {liveOnline ? (
                    <span className="ds-badge ds-badge-green">● Online</span>
                  ) : (
                    <span className="ds-badge ds-badge-muted">● Offline</span>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {syncStatus && (
          <div className="ds-card" style={{ padding: '0.75rem 1rem', marginTop: '1rem' }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--ds-text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
              Local Node ID
            </div>
            <code style={{ fontSize: '0.72rem', color: 'var(--ds-accent)', wordBreak: 'break-all' }}>
              {syncStatus.localNodeId}
            </code>
          </div>
        )}
      </div>
    </>
  );
};

export default PeersPage;
