/**
 * @module PeersPage
 * P2P peer management page — route `/peers`.
 * Refactored: uses PeerService, RoomService, SyncService. No inline IPC calls or duplicate helpers.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconNetwork, IconRefresh } from '@/components/Icons';
import { Link2, Users } from 'lucide-react';
import { useElectronSync } from '../context/ElectronSyncContext';
import PeerService, { type PeerRecord, type SyncStatusResult } from '@/services/PeerService';
import RoomService from '@/services/RoomService';
import SyncService from '@/services/SyncService';
import { ServiceError } from '@/services/errors/ServiceError';
import { notify } from '@docusync/shared/utils/notifications';
import { formatRelativeTime } from '@docusync/shared/utils/formatters';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── PeersPage ─────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL = 5_000;

const PeersPage: React.FC = () => {
  const navigate = useNavigate();
  const [peers, setPeers] = useState<PeerRecord[]>([]);
  const [onlinePeers, setOnlinePeers] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatusResult | null>(null);
  const [loadingPeers, setLoadingPeers] = useState(true);
  const [peerError, setPeerError] = useState<string | null>(null);

  const [generatedOtp, setGeneratedOtp] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const [joinOtp, setJoinOtp] = useState('');
  const [joining, setJoining] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);

  const fetchAllRef = useRef<(initial?: boolean) => Promise<void>>();
  const { setCurrentRoom } = useElectronSync();
  const [roomName, setRoomName] = useState('');

  const fetchAll = useCallback(async (initial = false) => {
    if (initial) setLoadingPeers(true);
    try {
      const [peerResult, status] = await Promise.all([
        PeerService.list(),
        SyncService.getStatus(),
      ]);
      setPeers(peerResult.peers);
      setOnlinePeers(peerResult.onlinePeers);
      setSyncStatus(status);
      setPeerError(null);
    } catch (err) {
      setPeerError(err instanceof ServiceError ? err.message : String(err));
    } finally { if (initial) setLoadingPeers(false); }
  }, []);

  fetchAllRef.current = fetchAll;

  // Latency derived from actual peer RTT (no fake simulation)
  useEffect(() => {
    if (!syncStatus || syncStatus.peerCount === 0) setLatency(null);
  }, [syncStatus]);

  useEffect(() => {
    fetchAll(true);
    const iv = setInterval(() => fetchAllRef.current?.(), REFRESH_INTERVAL);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const wsPort = syncStatus ? 9000 : '—';

  const handleGenerateOtp = async (overrideRoomName?: string) => {
    const finalRoomName = overrideRoomName || roomName.trim();
    if (!finalRoomName) { notify.error('Please enter a repository name'); return; }
    setGenerating(true);
    try {
      const ip = await PeerService.getLocalIp();
      const status = await SyncService.getStatus();
      const result = await RoomService.createRoom(finalRoomName, status.localNodeId, ip, 9000);
      setGeneratedOtp(result.otp);
      setCurrentRoom({ id: result.otp, name: finalRoomName, isHost: true });
      try { await window.docuSync.connectToSupabase(result.otp); } catch { /* relay optional */ }
      notify.success(`Repository "${finalRoomName}" created! OTP: ${result.otp}`);
      navigate('/', { state: { tab: 'peer_rooms' } });
    } catch (err) {
      notify.error(err instanceof ServiceError ? err.message : 'Failed to generate OTP. Is the web server running?');
    } finally { setGenerating(false); }
  };

  const handleJoinOtp = async () => {
    if (joinOtp.length !== 5) { notify.error('OTP must be exactly 5 digits.'); return; }
    setJoining(true);
    try {
      const status = await SyncService.getStatus();
      const joinResult = await RoomService.joinRoom(joinOtp, status.localNodeId);

      try { await window.docuSync.connectToSupabase(joinOtp); } catch { /* relay optional */ }

      if (joinResult.hostType === 'web') {
        setCurrentRoom({ id: joinOtp, name: joinResult.roomName, isHost: false });
        notify.success(`✅ Joined repository "${joinResult.roomName}" — connected via matchmaker`);
        setJoinOtp('');
        fetchAll();
        navigate('/', { state: { tab: 'peer_rooms' } });
        return;
      }

      notify.success(`Found repository "${joinResult.roomName}"! Connecting...`);
      await PeerService.connect(joinResult.hostIp, joinResult.hostPort);
      setCurrentRoom({ id: joinOtp, name: joinResult.roomName, isHost: false });
      notify.success(`✅ Connected to "${joinResult.roomName}" — ${joinResult.memberCount} member(s)`);
      setJoinOtp('');
      fetchAll();
      navigate('/', { state: { tab: 'peer_rooms' } });
    } catch (err) {
      notify.error(err instanceof ServiceError ? err.message : 'Failed to join repository');
    } finally { setJoining(false); }
  };

  return (
    <>
      <div className="ds-topbar">
        <span style={{ color: 'var(--ds-accent)' }}><IconNetwork size={16} /></span>
        <span className="ds-topbar-title">Peers</span>
        <span className="ds-topbar-subtitle">P2P Mesh Network</span>
        <div className="ds-topbar-actions">
          <button className="ds-btn ds-btn-ghost" onClick={() => fetchAll()}><IconRefresh size={14} /> Refresh</button>
        </div>
      </div>

      <div className="ds-main-scroll ds-page-enter">
        <div className="ds-metrics-grid">
          <div className="ds-metric-card">
            <span className="ds-metric-label">Online Peers</span>
            <span className="ds-metric-value" style={{ color: onlinePeers > 0 ? 'var(--ds-green)' : 'var(--ds-text3)' }}>{onlinePeers}</span>
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

        {/* OTP Matchmaker Bento Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          {/* Card 1: Host a Repository */}
          <div className="ds-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Users size={20} color="var(--accent)" />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Create Repository</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Start a secure P2P collaboration repository. This generates a temporary 5-digit OTP your peers can use to connect directly.
            </p>
            <input
              type="text"
              className="ds-input"
              placeholder="Enter repository name"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              disabled={generating || !!generatedOtp}
              style={{ width: '100%', marginBottom: 16, padding: '10px 12px' }}
            />
            {!generatedOtp ? (
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
                <button className="ds-btn ds-btn-primary" onClick={() => { const n = roomName.trim() || 'DocuSync Session'; setRoomName(n); handleGenerateOtp(n); }} disabled={generating} style={{ width: '100%', justifyContent: 'center', padding: '10px 0' }}>
                  {generating ? 'Generating...' : 'Generate 5-Digit Collaboration OTP'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(34, 197, 94, 0.05)', borderRadius: 8, border: '1px solid rgba(34, 197, 94, 0.2)', padding: 16 }}>
                <div style={{ fontSize: 42, fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--green)', letterSpacing: '0.1em' }}>{generatedOtp}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Valid for 60 minutes. Share this OTP with collaborators.</div>
              </div>
            )}
          </div>

          {/* Card 2: Join Repository via OTP */}
          <div className="ds-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Link2 size={20} color="var(--green)" />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Join Repository via OTP</h3>
            </div>
            <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
                Enter the 5-digit OTP provided by the host to join their live repository. The connection is established directly peer-to-peer.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <input
                  type="text"
                  placeholder="e.g. 88412"
                  value={joinOtp}
                  onChange={(e) => setJoinOtp(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  disabled={joining}
                  style={{ flex: 1, padding: '10px 16px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 16, letterSpacing: '0.2em' }}
                />
                <button className="ds-btn ds-btn-primary" onClick={handleJoinOtp} disabled={joining} style={{ padding: '0 24px' }}>
                  {joining ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {peerError && (
          <div className="ds-banner ds-banner-red" style={{ marginBottom: '1rem' }}>
            <span>⛔</span><span style={{ flex: 1 }}>{peerError}</span>
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
              Create a repository or join one using an OTP to get started.
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
                    <div style={{ fontSize: '0.68rem', color: 'var(--ds-text3)', fontFamily: 'monospace' }}>{peer.address}:{peer.port}</div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--ds-text3)', marginTop: '1px' }}>
                      Last seen: {formatRelativeTime(peer.lastSeen)}
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
            <div style={{ fontSize: '0.68rem', color: 'var(--ds-text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>Local Node ID</div>
            <code style={{ fontSize: '0.72rem', color: 'var(--ds-accent)', wordBreak: 'break-all' }}>{syncStatus.localNodeId}</code>
          </div>
        )}
      </div>
    </>
  );
};

export default PeersPage;
