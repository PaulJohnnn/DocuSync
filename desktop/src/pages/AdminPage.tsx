/**
 * @module AdminPage
 * Global Admin dashboard — route `/admin`.
 *
 * Provides a global view of all users and rooms active on the Next.js matchmaker.
 * Only visible to users with `isAdmin === true`.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ShieldCheck, Users, RefreshCw, Layers } from 'lucide-react';
import { useElectronSync } from '@/context/ElectronSyncContext';

interface GlobalRoom {
  otp: string;
  roomName: string;
  hostNodeId: string;
  memberCount: number;
  createdAt: number;
  expiresAt: number;
}

interface GlobalUser {
  nodeId: string;
  lastActive: number;
  isOnline: boolean;
  ip: string;
}

interface AdminStats {
  rooms: GlobalRoom[];
  users: GlobalUser[];
  totalRooms: number;
  totalUsers: number;
}

function relTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString();
}

const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin } = useElectronSync();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:3000/api/admin/stats');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('[AdminPage] Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const iv = setInterval(fetchStats, 10_000);
    return () => clearInterval(iv);
  }, [fetchStats]);

  if (!isAdmin) {
    return (
      <div className="ds-main-scroll">
        <div className="ds-empty">
          <div className="ds-empty-icon">🔒</div>
          <h2 style={{ fontSize: '1rem' }}>Admin access restricted</h2>
          <p style={{ color: 'var(--ds-text3)', fontSize: '0.82rem' }}>
            Only the Global Admin can access this panel.
          </p>
          <button className="ds-btn ds-btn-ghost" onClick={() => navigate('/')}>
            Back to Files
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="ds-topbar">
        <span style={{ color: 'var(--ds-accent)' }}><ShieldCheck size={16} /></span>
        <span className="ds-topbar-title">Admin Dashboard</span>
        <span className="ds-topbar-subtitle">Global Network Overview</span>
        <div className="ds-topbar-actions">
          <button className="ds-btn ds-btn-ghost" onClick={fetchStats}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="ds-main-scroll ds-page-enter">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ds-text3)' }}>
            <span className="ds-pulse">⏳</span> Loading global stats...
          </div>
        ) : (
          <>
            <div className="ds-card" style={{ marginBottom: '1.5rem' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '1rem 1.25rem', borderBottom: '1px solid var(--ds-border)',
              }}>
                <Users size={18} color="var(--ds-accent)" />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--ds-text)' }}>
                    Registered Users ({stats?.totalUsers || 0})
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ds-text3)' }}>
                    All users currently tracked by the Matchmaker
                  </div>
                </div>
              </div>

              {(!stats?.users || stats.users.length === 0) ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--ds-text3)', fontSize: '0.82rem' }}>
                  No users recorded yet.
                </div>
              ) : (
                <div>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 120px 150px',
                    padding: '8px 1.25rem', fontSize: 11, fontWeight: 600,
                    color: 'var(--ds-text3)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--ds-border)',
                  }}>
                    <span>Node ID</span>
                    <span>Status</span>
                    <span>Last Active</span>
                  </div>
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {stats.users.map(u => (
                      <div
                        key={u.nodeId}
                        style={{
                          display: 'grid', gridTemplateColumns: '1fr 120px 150px',
                          padding: '10px 1.25rem', alignItems: 'center',
                          borderBottom: '1px solid var(--ds-border)',
                        }}
                      >
                        <code style={{ fontSize: '0.8rem', color: 'var(--ds-accent)', fontFamily: 'monospace' }}>
                          {u.nodeId}
                        </code>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                            background: u.isOnline ? 'var(--ds-green)' : 'var(--ds-text3)',
                            boxShadow: u.isOnline ? '0 0 5px var(--ds-green)' : 'none',
                          }} />
                          <span style={{ fontSize: '0.8rem', color: u.isOnline ? 'var(--ds-green)' : 'var(--ds-text3)', fontWeight: 500 }}>
                            {u.isOnline ? 'Active' : 'Offline'}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--ds-text2)' }}>
                          {relTime(u.lastActive)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="ds-card" style={{ marginBottom: '1.5rem' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '1rem 1.25rem', borderBottom: '1px solid var(--ds-border)',
              }}>
                <Layers size={18} color="var(--ds-accent)" />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--ds-text)' }}>
                    Active Rooms ({stats?.totalRooms || 0})
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ds-text3)' }}>
                    All rooms currently active on the Matchmaker
                  </div>
                </div>
              </div>

              {(!stats?.rooms || stats.rooms.length === 0) ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--ds-text3)', fontSize: '0.82rem' }}>
                  No active rooms.
                </div>
              ) : (
                <div>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 120px 1fr 100px',
                    padding: '8px 1.25rem', fontSize: 11, fontWeight: 600,
                    color: 'var(--ds-text3)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--ds-border)',
                  }}>
                    <span>Room Name</span>
                    <span>Room OTP</span>
                    <span>Host Node</span>
                    <span>Members</span>
                  </div>
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {stats.rooms.map(r => (
                      <div
                        key={r.otp}
                        style={{
                          display: 'grid', gridTemplateColumns: '1fr 120px 1fr 100px',
                          padding: '10px 1.25rem', alignItems: 'center',
                          borderBottom: '1px solid var(--ds-border)',
                        }}
                      >
                        <span style={{ fontSize: '0.8rem', color: 'var(--ds-text)' }}>
                          {r.roomName}
                        </span>
                        <code style={{ fontSize: '0.8rem', color: 'var(--ds-green)', fontFamily: 'monospace' }}>
                          {r.otp}
                        </code>
                        <code style={{ fontSize: '0.8rem', color: 'var(--ds-accent)', fontFamily: 'monospace' }}>
                          {r.hostNodeId.slice(0, 16)}...
                        </code>
                        <span style={{ fontSize: '0.8rem', color: 'var(--ds-text2)' }}>
                          {r.memberCount} users
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default AdminPage;
