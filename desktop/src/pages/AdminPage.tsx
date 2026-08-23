/**
 * @module AdminPage
 * Global Admin dashboard — route `/admin`.
 * Refactored: uses AdminService. No inline fetch logic.
 * Provides global view of all users and rooms via the Next.js matchmaker.
 * Only visible to users with `isAdmin === true`.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Users, RefreshCw, Layers } from 'lucide-react';
import { useElectronSync } from '@/context/ElectronSyncContext';
import AdminService, { type SessionLogEntry, type GenerateAccountResult } from '@/services/AdminService';
import { formatTimestampRelative } from '@docusync/shared/utils/formatters';
import { notify } from '@docusync/shared/utils/notifications';
import mockAuthService, { type AuthUser } from '@/services/mockAuthService';

interface AdminStats {
  rooms: any[];
  users: any[];
  totalRooms: number;
  totalUsers: number;
}

const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin } = useElectronSync();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [sessionLog, setSessionLog] = useState<SessionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [deleteOtp, setDeleteOtp] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedAccount, setGeneratedAccount] = useState<GenerateAccountResult | null>(null);

  const [activeProfiles, setActiveProfiles] = useState<AuthUser[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [revoking, setRevoking] = useState(false);

  const fetchStats = useCallback(async () => {
    const data = await AdminService.getStats();
    setStats(data);
    const log = await AdminService.getSessionLog(10);
    setSessionLog(log);
    const profiles = await mockAuthService.getActiveUsers();
    setActiveProfiles(profiles);
    setLoading(false);
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
          <p style={{ color: 'var(--ds-text3)', fontSize: '0.82rem' }}>Only the Global Admin can access this panel.</p>
          <button className="ds-btn ds-btn-ghost" onClick={() => navigate('/')}>Back to Files</button>
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
          <button className="ds-btn ds-btn-ghost" onClick={fetchStats}><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>

      <div className="ds-main-scroll ds-page-enter">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ds-text3)' }}>
            <span className="ds-pulse">⏳</span> Loading global stats...
          </div>
        ) : (
          <>
            {/* Admin Actions */}
            <div className="ds-card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '1rem 1.25rem', borderBottom: '1px solid var(--ds-border)' }}>
                <ShieldCheck size={18} color="var(--ds-accent)" />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--ds-text)' }}>Admin Actions</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ds-text3)' }}>Provision accounts and manage global groups</div>
                </div>
              </div>
              
              <div style={{ padding: '1.25rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                {/* Generate Account */}
                <div style={{ flex: 1, minWidth: 300 }}>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Generate Verified Account</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--ds-text3)', marginBottom: '1rem' }}>Provision a new Node ID + PIN for external researchers.</p>
                  
                  {generatedAccount ? (
                    <div style={{ background: 'var(--ds-green-bg)', border: '1px solid var(--ds-green)', borderRadius: 'var(--ds-radius-md)', padding: '1rem' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--ds-green)', fontWeight: 600, marginBottom: '0.5rem' }}>Account Generated Successfully</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div><span style={{ fontSize: '0.7rem', color: 'var(--ds-text2)' }}>Node ID: </span><code style={{ fontSize: '0.8rem', color: 'var(--ds-text)' }}>{generatedAccount.nodeId}</code></div>
                        <div><span style={{ fontSize: '0.7rem', color: 'var(--ds-text2)' }}>Temp PIN: </span><code style={{ fontSize: '0.8rem', color: 'var(--ds-text)' }}>{generatedAccount.tempPin}</code></div>
                      </div>
                      <button className="ds-btn ds-btn-ghost" onClick={() => setGeneratedAccount(null)} style={{ marginTop: '0.5rem', fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}>Clear</button>
                    </div>
                  ) : (
                    <button 
                      className="ds-btn ds-btn-primary" 
                      disabled={generating}
                      onClick={async () => {
                        setGenerating(true);
                        try {
                          const res = await AdminService.generateAccount('Researcher');
                          setGeneratedAccount(res);
                          notify.success('Account generated');
                        } catch (err: any) { notify.error(err.message); }
                        finally { setGenerating(false); }
                      }}
                    >
                      {generating ? 'Generating...' : 'Provision New Account'}
                    </button>
                  )}
                </div>

                {/* Delete Group */}
                <div style={{ flex: 1, minWidth: 300 }}>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--ds-red)' }}>Delete Repository (Group)</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--ds-text3)', marginBottom: '1rem' }}>Force-terminate a collaboration group by its OTP.</p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      type="text" 
                      className="ds-input" 
                      placeholder="e.g. 12345" 
                      value={deleteOtp} 
                      onChange={e => setDeleteOtp(e.target.value)} 
                      style={{ flex: 1, fontFamily: 'monospace' }}
                    />
                    <button 
                      className="ds-btn" 
                      style={{ background: 'var(--ds-red)', color: 'white', border: 'none' }}
                      disabled={deleting || deleteOtp.trim().length === 0}
                      onClick={async () => {
                        if (!window.confirm(`Are you sure you want to forcibly delete group ${deleteOtp}?`)) return;
                        setDeleting(true);
                        try {
                          await AdminService.deleteGroup(deleteOtp);
                          notify.success(`Group ${deleteOtp} deleted`);
                          setDeleteOtp('');
                          fetchStats();
                        } catch (err: any) { notify.error(err.message); }
                        finally { setDeleting(false); }
                      }}
                    >
                      {deleting ? 'Deleting...' : 'Terminate Group'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Profile Access Control */}
            <div className="ds-card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--ds-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Users size={18} color="var(--ds-accent)" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--ds-text)' }}>Profile Access Control ({activeProfiles.length})</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--ds-text3)' }}>Manage and revoke user profiles</div>
                  </div>
                </div>
                {selectedUserIds.size > 0 && (
                  <button 
                    className="ds-btn"
                    style={{ background: 'var(--ds-red)', color: 'white', border: 'none', padding: '6px 12px', fontSize: '0.75rem' }}
                    disabled={revoking}
                    onClick={async () => {
                      if (!window.confirm(`Revoke completely ${selectedUserIds.size} selected users?`)) return;
                      setRevoking(true);
                      try {
                        for (const id of Array.from(selectedUserIds)) {
                          await mockAuthService.revokeUser(id);
                        }
                        notify.success(`Revoked ${selectedUserIds.size} users`);
                        setSelectedUserIds(new Set());
                        fetchStats();
                      } catch (err: any) { notify.error(err.message); }
                      finally { setRevoking(false); }
                    }}
                  >
                    {revoking ? 'Revoking...' : `Revoke Selected (${selectedUserIds.size})`}
                  </button>
                )}
              </div>
              {activeProfiles.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--ds-text3)', fontSize: '0.82rem' }}>No active profiles.</div>
              ) : (
                <div>
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {activeProfiles.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 1.25rem', borderBottom: '1px solid var(--ds-border)' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedUserIds.has(p.id)}
                          onChange={() => {
                            const next = new Set(selectedUserIds);
                            if (next.has(p.id)) next.delete(p.id);
                            else next.add(p.id);
                            setSelectedUserIds(next);
                          }}
                          style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--ds-red)' }}
                        />
                        <div style={{
                          width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg, #60a5fa, #2563eb)',
                          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold'
                        }}>
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ds-text)' }}>{p.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--ds-text3)' }}>{p.email}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Registered Users */}
            <div className="ds-card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '1rem 1.25rem', borderBottom: '1px solid var(--ds-border)' }}>
                <Users size={18} color="var(--ds-accent)" />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--ds-text)' }}>Registered Users ({stats?.totalUsers || 0})</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ds-text3)' }}>All users currently tracked by the Matchmaker</div>
                </div>
              </div>
              {(!stats?.users || stats.users.length === 0) ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--ds-text3)', fontSize: '0.82rem' }}>No users recorded yet.</div>
              ) : (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 150px', padding: '8px 1.25rem', fontSize: 11, fontWeight: 600, color: 'var(--ds-text3)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--ds-border)' }}>
                    <span>Node ID</span><span>Status</span><span>Last Active</span>
                  </div>
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {stats.users.map((u: any) => (
                      <div key={u.nodeId} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 150px', padding: '10px 1.25rem', alignItems: 'center', borderBottom: '1px solid var(--ds-border)' }}>
                        <code style={{ fontSize: '0.8rem', color: 'var(--ds-accent)', fontFamily: 'monospace' }}>{u.nodeId}</code>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: u.isOnline ? 'var(--ds-green)' : 'var(--ds-text3)', boxShadow: u.isOnline ? '0 0 5px var(--ds-green)' : 'none' }} />
                          <span style={{ fontSize: '0.8rem', color: u.isOnline ? 'var(--ds-green)' : 'var(--ds-text3)', fontWeight: 500 }}>{u.isOnline ? 'Active' : 'Offline'}</span>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--ds-text2)' }}>{formatTimestampRelative(u.lastActive)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Active Rooms */}
            <div className="ds-card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '1rem 1.25rem', borderBottom: '1px solid var(--ds-border)' }}>
                <Layers size={18} color="var(--ds-accent)" />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--ds-text)' }}>Active Repositories ({stats?.totalRooms || 0})</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ds-text3)' }}>All rooms currently active on the Matchmaker</div>
                </div>
              </div>
              {(!stats?.rooms || stats.rooms.length === 0) ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--ds-text3)', fontSize: '0.82rem' }}>No active repositories.</div>
              ) : (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr 100px', padding: '8px 1.25rem', fontSize: 11, fontWeight: 600, color: 'var(--ds-text3)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--ds-border)' }}>
                    <span>Room Name</span><span>Room OTP</span><span>Host Node</span><span>Members</span>
                  </div>
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {stats.rooms.map((r: any) => (
                      <div key={r.otp} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr 100px', padding: '10px 1.25rem', alignItems: 'center', borderBottom: '1px solid var(--ds-border)' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--ds-text)' }}>{r.roomName}</span>
                        <code style={{ fontSize: '0.8rem', color: 'var(--ds-green)', fontFamily: 'monospace' }}>{r.otp}</code>
                        <code style={{ fontSize: '0.8rem', color: 'var(--ds-accent)', fontFamily: 'monospace' }}>{r.hostNodeId.slice(0, 16)}...</code>
                        <span style={{ fontSize: '0.8rem', color: 'var(--ds-text2)' }}>{r.memberCount} users</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Session Log */}
            <div className="ds-card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '1rem 1.25rem', borderBottom: '1px solid var(--ds-border)' }}>
                <ShieldCheck size={18} color="var(--ds-accent)" />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--ds-text)' }}>Global Session Audit Log</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ds-text3)' }}>Recent actions across all network nodes</div>
                </div>
              </div>
              {sessionLog.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--ds-text3)', fontSize: '0.82rem' }}>No session logs available.</div>
              ) : (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 150px 120px 1fr', padding: '8px 1.25rem', fontSize: 11, fontWeight: 600, color: 'var(--ds-text3)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--ds-border)' }}>
                    <span>Time</span><span>Node ID</span><span>Action</span><span>Detail</span>
                  </div>
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {sessionLog.map((log, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 150px 120px 1fr', padding: '10px 1.25rem', alignItems: 'center', borderBottom: '1px solid var(--ds-border)' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--ds-text3)' }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <code style={{ fontSize: '0.75rem', color: 'var(--ds-accent)', fontFamily: 'monospace' }}>{log.nodeId}</code>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: log.action.includes('CONFLICT') ? 'var(--ds-amber)' : 'var(--ds-text)' }}>{log.action}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--ds-text2)' }}>{log.detail}</span>
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
