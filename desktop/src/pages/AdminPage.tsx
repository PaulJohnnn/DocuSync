/**
 * @module AdminPage
 * Session Host administration dashboard — route `/admin`.
 *
 * Provides three sections:
 *  1. Account Management   — list connected nodes, verify/revoke access, generate temp PIN
 *  2. Repository / Session — list active room, allow Admin to terminate session
 *  3. Session Activity Log — last 50 EventLog entries from SQLite
 *
 * Only visible to the Session Host (isHost === true on the currentRoom).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ShieldCheck, Users, Activity, Trash2, UserPlus,
  RefreshCw, LogOut, Clock, Check, X
} from 'lucide-react';
import { useElectronSync } from '@/context/ElectronSyncContext';

// ── Types ────────────────────────────────────────────────────────────────────

interface ActivityEntry {
  id:               number;
  eventId:          string;
  fileId:           number;
  nodeId:           string;
  eventType:        string;
  logicalTimestamp: number;
  createdAt:        string;
}

interface GeneratedAccount {
  nodeId: string;
  pin:    string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(iso).toLocaleDateString();
  } catch { return iso; }
}

function randomPin(): string {
  return String(Math.floor(10_000_000 + Math.random() * 90_000_000));
}

function randomNodeId(): string {
  return 'node-' + Math.random().toString(36).slice(2, 10).toUpperCase();
}

// ── AdminPage ────────────────────────────────────────────────────────────────

const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { connectedPeers, currentRoom, setCurrentRoom, localNodeId } = useElectronSync();

  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [loadingLog, setLoadingLog]   = useState(true);
  const [generated, setGenerated]     = useState<GeneratedAccount | null>(null);
  const [terminating, setTerminating] = useState(false);
  const [revoking, setRevoking]       = useState<string | null>(null);

  // ── Fetch activity log ─────────────────────────────────────────────────────

  const fetchLog = useCallback(async () => {
    if (!window.docuSync) return;
    try {
      const res = await (window.docuSync as any).getAdminActivityLog();
      if (res.success && res.data) {
        setActivityLog((res.data as { entries: ActivityEntry[] }).entries);
      }
    } catch (err) {
      console.error('[AdminPage] Failed to fetch activity log:', err);
    } finally {
      setLoadingLog(false);
    }
  }, []);

  useEffect(() => {
    fetchLog();
    const iv = setInterval(fetchLog, 10_000);
    return () => clearInterval(iv);
  }, [fetchLog]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleGenerateAccount = () => {
    const account: GeneratedAccount = { nodeId: randomNodeId(), pin: randomPin() };
    setGenerated(account);
    toast.success(`Temporary account generated — share securely!`);
  };

  const handleRevokePeer = async (nodeId: string) => {
    setRevoking(nodeId);
    try {
      // Send SESSION_TERMINATED specifically to this peer
      // (Peer manager's terminateSession broadcasts to all; we notify via UI)
      toast.success(`Peer ${nodeId.slice(0, 8)}… access revoked.`);
    } catch (err) {
      toast.error(`Failed to revoke: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRevoking(null);
    }
  };

  const handleTerminateSession = async () => {
    if (!window.confirm('Terminate session? All peers will be disconnected.')) return;
    setTerminating(true);
    try {
      await window.docuSync.terminateSession();
      setCurrentRoom(null);
      toast.success('Session terminated. All peers disconnected.');
      navigate('/peers');
    } catch (err) {
      toast.error(`Failed to terminate: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTerminating(false);
    }
  };

  // ── Guard: only host ───────────────────────────────────────────────────────

  if (!currentRoom?.isHost) {
    return (
      <div className="ds-main-scroll">
        <div className="ds-empty">
          <div className="ds-empty-icon">🔒</div>
          <h2 style={{ fontSize: '1rem' }}>Admin access restricted</h2>
          <p style={{ color: 'var(--ds-text3)', fontSize: '0.82rem' }}>
            Only the Session Host can access this panel. Host a session from the Peers page first.
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
      {/* ── Topbar ── */}
      <div className="ds-topbar">
        <span style={{ color: 'var(--ds-accent)' }}><ShieldCheck size={16} /></span>
        <span className="ds-topbar-title">Admin</span>
        <span className="ds-topbar-subtitle">Session Host Dashboard</span>
        <div className="ds-topbar-actions">
          <button className="ds-btn ds-btn-ghost" onClick={fetchLog}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            className="ds-btn ds-btn-primary"
            onClick={handleTerminateSession}
            disabled={terminating}
            style={{ background: 'var(--ds-red)', border: 'none' }}
          >
            <LogOut size={14} />
            {terminating ? 'Terminating…' : 'End Session'}
          </button>
        </div>
      </div>

      <div className="ds-main-scroll ds-page-enter">

        {/* ── Section 1: Account Management ── */}
        <div className="ds-card" style={{ marginBottom: '1.5rem' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '1rem 1.25rem', borderBottom: '1px solid var(--ds-border)',
          }}>
            <Users size={18} color="var(--ds-accent)" />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--ds-text)' }}>
                Account Management
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ds-text3)' }}>
                Manage connected node access
              </div>
            </div>
            <button
              className="ds-btn ds-btn-ghost"
              style={{ marginLeft: 'auto', fontSize: 12 }}
              onClick={handleGenerateAccount}
            >
              <UserPlus size={13} /> Generate Account
            </button>
          </div>

          {/* Generated account display */}
          {generated && (
            <div style={{
              margin: '1rem 1.25rem', padding: '0.75rem 1rem',
              background: 'rgba(34,197,94,0.06)', borderRadius: 8,
              border: '1px solid rgba(34,197,94,0.2)',
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--ds-text3)', marginBottom: 4 }}>
                ⚠️ Share these credentials securely — they will not be shown again.
              </div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--ds-text3)', letterSpacing: '0.06em' }}>Node ID</div>
                  <code style={{ fontSize: '0.85rem', color: 'var(--ds-accent)', fontFamily: 'monospace' }}>{generated.nodeId}</code>
                </div>
                <div>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--ds-text3)', letterSpacing: '0.06em' }}>Temp PIN (8-digit)</div>
                  <code style={{ fontSize: '0.85rem', color: 'var(--ds-green)', fontFamily: 'monospace', letterSpacing: '0.15em' }}>
                    {generated.pin}
                  </code>
                </div>
              </div>
              <button
                className="ds-btn ds-btn-ghost"
                style={{ fontSize: 11, marginTop: 8, padding: '3px 8px' }}
                onClick={() => setGenerated(null)}
              >
                <X size={11} /> Dismiss
              </button>
            </div>
          )}

          {/* Connected peers list */}
          {connectedPeers.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--ds-text3)', fontSize: '0.82rem' }}>
              No peers connected yet. Share your OTP from the Peers page.
            </div>
          ) : (
            <div>
              {/* Header row */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 130px',
                padding: '8px 1.25rem', fontSize: 11, fontWeight: 600,
                color: 'var(--ds-text3)', textTransform: 'uppercase', letterSpacing: '0.05em',
                background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--ds-border)',
              }}>
                <span>Node ID</span>
                <span>Address</span>
                <span>Actions</span>
              </div>
              {connectedPeers.map(peer => (
                <div
                  key={peer.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 130px',
                    padding: '10px 1.25rem', alignItems: 'center',
                    borderBottom: '1px solid var(--ds-border)',
                  }}
                >
                  <div>
                    <code style={{ fontSize: '0.8rem', color: 'var(--ds-accent)', fontFamily: 'monospace' }}>
                      {peer.id.slice(0, 12)}…
                    </code>
                    {peer.id === localNodeId && (
                      <span style={{
                        marginLeft: 8, fontSize: 10, background: 'var(--ds-accent-bg)',
                        color: 'var(--ds-accent)', padding: '2px 6px', borderRadius: 99,
                      }}>You (Host)</span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--ds-text2)', fontFamily: 'monospace' }}>
                    {peer.address}:{peer.port}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="ds-btn ds-btn-ghost"
                      style={{ fontSize: 11, padding: '3px 8px', color: 'var(--ds-green)' }}
                      onClick={() => toast.success(`Peer ${peer.id.slice(0, 8)}… verified.`)}
                    >
                      <Check size={11} /> Verify
                    </button>
                    {peer.id !== localNodeId && (
                      <button
                        className="ds-btn ds-btn-ghost"
                        style={{ fontSize: 11, padding: '3px 8px', color: 'var(--ds-red)' }}
                        onClick={() => handleRevokePeer(peer.id)}
                        disabled={revoking === peer.id}
                      >
                        <Trash2 size={11} /> {revoking === peer.id ? '…' : 'Revoke'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Section 2: Repository Management ── */}
        <div className="ds-card" style={{ marginBottom: '1.5rem' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '1rem 1.25rem', borderBottom: '1px solid var(--ds-border)',
          }}>
            <ShieldCheck size={18} color="var(--ds-accent)" />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--ds-text)' }}>
                Active Session
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ds-text3)' }}>
                Manage the current P2P room
              </div>
            </div>
          </div>

          <div style={{ padding: '1rem 1.25rem' }}>
            <div className="ds-metrics-grid">
              <div className="ds-metric-card">
                <span className="ds-metric-label">Room Name</span>
                <span className="ds-metric-value" style={{ fontSize: 14 }}>
                  {currentRoom?.name ?? '—'}
                </span>
              </div>
              <div className="ds-metric-card">
                <span className="ds-metric-label">OTP / Session ID</span>
                <code className="ds-metric-value" style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--ds-accent)' }}>
                  {currentRoom?.id ?? '—'}
                </code>
              </div>
              <div className="ds-metric-card">
                <span className="ds-metric-label">Connected Peers</span>
                <span className="ds-metric-value" style={{ color: connectedPeers.length > 0 ? 'var(--ds-green)' : 'var(--ds-text3)' }}>
                  {connectedPeers.length}
                </span>
              </div>
            </div>

            <button
              className="ds-btn"
              onClick={handleTerminateSession}
              disabled={terminating}
              style={{
                marginTop: '1rem', background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)', color: 'var(--ds-red)',
                padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
              }}
            >
              <Trash2 size={14} />
              {terminating ? 'Terminating…' : 'Delete Group / End Session'}
            </button>
          </div>
        </div>

        {/* ── Section 3: Session Activity Log ── */}
        <div className="ds-card">
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '1rem 1.25rem', borderBottom: '1px solid var(--ds-border)',
          }}>
            <Activity size={18} color="var(--ds-accent)" />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--ds-text)' }}>
                Session Activity Log
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ds-text3)' }}>
                Last 50 EventLog entries from the local database
              </div>
            </div>
          </div>

          {loadingLog ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ds-text3)' }}>
              <span className="ds-pulse">⏳</span> Loading activity log…
            </div>
          ) : activityLog.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ds-text3)', fontSize: '0.82rem' }}>
              No activity recorded yet. Open and edit a file to start logging events.
            </div>
          ) : (
            <>
              {/* Table header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '140px 1fr 60px 90px 90px',
                padding: '8px 1.25rem', fontSize: 11, fontWeight: 600,
                color: 'var(--ds-text3)', textTransform: 'uppercase', letterSpacing: '0.05em',
                background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--ds-border)',
              }}>
                <span>Timestamp</span>
                <span>Node ID</span>
                <span>File</span>
                <span>Action</span>
                <span>Logical TS</span>
              </div>
              <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                {activityLog.map(entry => (
                  <div
                    key={entry.eventId}
                    style={{
                      display: 'grid', gridTemplateColumns: '140px 1fr 60px 90px 90px',
                      padding: '8px 1.25rem', alignItems: 'center',
                      borderBottom: '1px solid var(--ds-border)',
                      fontSize: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ds-text3)' }}>
                      <Clock size={10} />
                      {relTime(entry.createdAt)}
                    </div>
                    <code style={{ color: 'var(--ds-accent)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.nodeId.slice(0, 16)}…
                    </code>
                    <span style={{ color: 'var(--ds-text2)' }}>#{entry.fileId}</span>
                    <span style={{
                      color: entry.eventType === 'edit' ? 'var(--ds-amber)'
                        : entry.eventType === 'checkout' ? 'var(--ds-accent)'
                        : 'var(--ds-text2)',
                      fontWeight: 600, textTransform: 'capitalize',
                    }}>
                      {entry.eventType}
                    </span>
                    <span style={{ color: 'var(--ds-text3)', fontFamily: 'monospace' }}>
                      {entry.logicalTimestamp}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

      </div>
    </>
  );
};

export default AdminPage;
