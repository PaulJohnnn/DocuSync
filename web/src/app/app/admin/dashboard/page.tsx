'use client';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import mockAuthService, { AuthUser } from '@/lib/mockAuthService';
import { toast } from 'sonner';
import { Activity, Clock, ShieldCheck, UserX, X, Users, Check } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';

export default function AdminDashboardPage() {
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [activeUsers, setActiveUsers] = useState<AuthUser[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [sessionLog, setSessionLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModalState({ isOpen: true, title, message, onConfirm });
  };

  const closeConfirm = () => {
    setConfirmModalState(prev => ({ ...prev, isOpen: false }));
  };
  
  // Delete Group State
  const [deleteOtp, setDeleteOtp] = useState('');
  const [deleting, setDeleting] = useState(false);
  
  // Track previous count to detect new requests
  const prevPendingCount = useRef(0);

  const loadData = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    const [reqs, users, statsRes, logRes] = await Promise.all([
      mockAuthService.getPendingRequests(),
      mockAuthService.getActiveUsers(),
      fetch('/api/admin/stats').then(r => r.json()).catch(() => ({ rooms: [] })),
      fetch('/api/admin/session-log').then(r => r.json()).catch(() => ({ log: [] })),
    ]);
    
    // Check if there are new requests since last load
    if (!isInitial && reqs.length > prevPendingCount.current) {
      const newReq = reqs[reqs.length - 1]; // Assume latest is at the end
      toast.success(`New profile request from ${newReq.email}`);
    }
    prevPendingCount.current = reqs.length;
    
    setPendingRequests(reqs);
    setActiveUsers(users);
    setRooms(statsRes.rooms || []);
    setSessionLog(logRes.log || []);
    if (isInitial) setLoading(false);
  };

  const handleRevoke = async (userId: string) => {
    showConfirm(
      'Revoke Access',
      `Are you sure you want to revoke access for this user?`,
      async () => {
        try {
          await fetch('/api/admin/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'revoke', userId })
          });
          toast.success('User access revoked');
          await loadData();
          closeConfirm();
        } catch (e: any) {
          toast.error(e.message || 'Failed to revoke user');
        }
      }
    );
  };

  const handleRevokeMultiple = async () => {
    if (selectedUserIds.size === 0) return;
    showConfirm(
      'Revoke Multiple Users',
      `Are you sure you want to completely revoke ${selectedUserIds.size} selected user(s)?`,
      async () => {
        try {
          await Promise.all(Array.from(selectedUserIds).map(id => 
            fetch('/api/admin/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'revoke', userId: id })
            })
          ));
          toast.success(`${selectedUserIds.size} users revoked`);
          setSelectedUserIds(new Set());
          await loadData();
          closeConfirm();
        } catch (e) {
          toast.error('Failed to revoke some users');
        }
      }
    );
  };

  const handleDeleteGroup = async () => {
    if (!deleteOtp.trim()) return;
    showConfirm(
      'Terminate Repository',
      `Are you sure you want to forcibly terminate the repository with OTP ${deleteOtp}?`,
      async () => {
        setDeleting(true);
        try {
          const res = await fetch('/api/admin/delete-group', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ otp: deleteOtp })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          toast.success(`Repository ${deleteOtp} terminated`);
          setDeleteOtp('');
          await loadData();
          closeConfirm();
        } catch (e: any) {
          toast.error(e.message || 'Failed to terminate repository');
        } finally {
          setDeleting(false);
        }
      }
    );
  };

  useEffect(() => {
    loadData(true);
    const unsubscribe = mockAuthService.subscribeToDatabaseChanges(() => {
      loadData(false);
    });

    // Register local IP for network discovery
    fetch('/api/local-ip')
      .then(res => res.json())
      .then(data => {
        if (data.ip) {
          fetch('/api/discovery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              workspace: 'admin', 
              ip: data.ip,
              port: window.location.port || '3000'
            })
          }).catch(err => console.error('Failed to broadcast IP to discovery service', err));
        }
      }).catch(err => console.error('Failed to fetch local IP', err));

    return unsubscribe;
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await mockAuthService.approveRequest(id, '123456'); 
      await loadData();
      toast.success('Request approved successfully');
    } catch (e) {
      console.error(e);
      toast.error('Failed to approve request');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await mockAuthService.rejectRequest(id);
      await loadData();
      toast.success('Request denied');
    } catch (e) {
      console.error(e);
    }
  };

  const toggleUserSelection = (id: string) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleResetPin = async (id: string, email: string) => {
    try {
      const pin = await mockAuthService.resetUserPin(id);
      // setResetPinModal({ open: true, email, pin });
      await loadData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to reset PIN');
    }
  };

  const handleClearLogs = async () => {
    showConfirm(
      'Clear Session Logs',
      'Are you sure you want to permanently delete all global session audit logs?',
      async () => {
        try {
          await fetch('/api/admin/session-log', { method: 'DELETE' });
          toast.success('Session logs cleared');
          await loadData();
          closeConfirm();
        } catch (e) {
          toast.error('Failed to clear logs');
        }
      }
    );
  };

  return (
    <div style={{ animation: 'fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)', paddingBottom: 60, maxWidth: 1200, margin: '0 auto' }}>
      <ConfirmModal
        isOpen={confirmModalState.isOpen}
        title={confirmModalState.title}
        message={confirmModalState.message}
        onConfirm={confirmModalState.onConfirm}
        onCancel={closeConfirm}
        confirmText="Confirm"
        cancelText="Cancel"
        isDestructive={true}
      />
      
      {/* Header Section */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
        marginBottom: 40, 
        background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.1), rgba(124, 58, 237, 0.05))',
        padding: '32px 40px', borderRadius: 24,
        border: '1px solid rgba(124, 58, 237, 0.1)',
        boxShadow: '0 10px 40px -10px rgba(79,70,229,0.1)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', padding: 10, borderRadius: 12, boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
              <ShieldCheck color="#fff" size={24} />
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, background: 'linear-gradient(to right, #ffffff, #a5b4fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Access Control
            </h1>
          </div>
          <p style={{ color: '#94a3b8', margin: 0, fontSize: 15, marginLeft: 56 }}>Manage local workspace profiles and device authorization.</p>
        </div>
        
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '12px 24px', textAlign: 'center', minWidth: 120, backdropFilter: 'blur(10px)' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{activeUsers.length}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Active</div>
          </div>
        </div>
      </div>



      <div style={{ display: 'grid', gridTemplateColumns: '1fr', maxWidth: 800, margin: '0 auto', gap: 40 }}>
        
        {/* Active Users Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, margin: 0, color: '#f8fafc' }}>
              <div style={{ background: 'rgba(99,102,241,0.1)', padding: 6, borderRadius: 8 }}>
                <Users size={18} color="#818cf8" />
              </div>
              Active Profiles
            </h2>
            {selectedUserIds.size > 0 && (
              <button
                onClick={handleRevokeMultiple}
                style={{
                  background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.3)',
                  padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s'
                }}
              >
                <UserX size={14} />
                Revoke Selected ({selectedUserIds.size})
              </button>
            )}
          </div>

          <div style={{
            background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 20, 
            overflow: 'hidden', backdropFilter: 'blur(20px)', minHeight: 400,
            boxShadow: '0 20px 40px -20px rgba(0,0,0,0.5)'
          }}>
            {loading ? (
              <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
                <div className="ds-spinner" style={{ width: 32, height: 32, borderTopColor: '#6366f1', margin: '0 auto 16px' }} />
              </div>
            ) : activeUsers.length === 0 ? (
              <div style={{ padding: '80px 40px', textAlign: 'center', color: '#64748b' }}>
                No active users.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {activeUsers.map((u, i) => (
                  <div key={u.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 24px', borderBottom: i === activeUsers.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.04)',
                    transition: 'background 0.2s'
                  }} className="hover-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      {!u.isAdmin && (
                        <div 
                          className={`custom-checkbox ${selectedUserIds.has(u.id) ? 'checked' : ''}`}
                          onClick={() => toggleUserSelection(u.id)}
                        >
                          <svg className="check-icon" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </div>
                      )}
                      <div style={{
                        width: 44, height: 44, borderRadius: 12, 
                        background: u.isAdmin ? 'linear-gradient(135deg, #c084fc, #9333ea)' : 'linear-gradient(135deg, #60a5fa, #2563eb)',
                        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, fontWeight: 700, boxShadow: u.isAdmin ? '0 4px 12px rgba(168,85,247,0.3)' : 'none'
                      }}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: 15, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                          {u.name}
                          {u.isAdmin && (
                            <span style={{ background: 'rgba(168,85,247,0.15)', color: '#d8b4fe', fontSize: 10, padding: '2px 6px', borderRadius: 6, fontWeight: 700, letterSpacing: 0.5, border: '1px solid rgba(168,85,247,0.3)' }}>ADMIN</span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: '#94a3b8' }}>{u.email}</div>
                      </div>
                    </div>
                    {!u.isAdmin && (
                      <div style={{ display: 'flex', gap: 8 }}>

                        <button
                          onClick={() => handleRevoke(u.id)}
                          style={{
                            background: 'transparent', border: 'none', color: '#64748b',
                            width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s'
                          }}
                          className="btn-revoke"
                          title="Revoke Access"
                        >
                          <UserX size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Active Repositories (Rooms) Section ───────────────────────────────────── */}
      <div style={{ marginTop: 40, background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 20, padding: 24, backdropFilter: 'blur(20px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>📁</span> Active Repositories / Rooms ({rooms.length})
          </h2>
        </div>

        {rooms.length === 0 ? (
          <div style={{ padding: '30px 20px', textAlign: 'center', color: '#64748b', fontSize: 14 }}>
            No active repositories on matchmaker.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.5fr 1fr', gap: 12, fontSize: 13, color: '#94a3b8' }}>
            <div style={{ fontWeight: 700, color: '#e2e8f0', paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Room Name</div>
            <div style={{ fontWeight: 700, color: '#e2e8f0', paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>OTP Code</div>
            <div style={{ fontWeight: 700, color: '#e2e8f0', paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Host Node ID</div>
            <div style={{ fontWeight: 700, color: '#e2e8f0', paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Members</div>
            {rooms.map((r, i) => (
              <React.Fragment key={i}>
                <div style={{ color: '#f8fafc', fontWeight: 600 }}>{r.roomName}</div>
                <code style={{ color: '#4ade80', fontFamily: 'monospace' }}>{r.otp}</code>
                <code style={{ color: '#818cf8', fontFamily: 'monospace' }}>{r.hostNodeId?.slice(0, 16)}...</code>
                <div>{r.memberCount} active</div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* ── Terminate Repository by OTP Section ───────────────────────────────────── */}
      <div style={{ marginTop: 24, background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 20, padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f87171', margin: '0 0 8px 0' }}>Terminate Repository (by OTP)</h3>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 16px 0' }}>Enter a 6-character room OTP to immediately dissolve and terminate an active repository across all peers.</p>
        <div style={{ display: 'flex', gap: 12, maxWidth: 450 }}>
          <input
            type="text"
            placeholder="Enter OTP (e.g. A1B2C3)"
            value={deleteOtp}
            onChange={e => setDeleteOtp(e.target.value.toUpperCase())}
            maxLength={6}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 14, fontFamily: 'monospace', textTransform: 'uppercase'
            }}
          />
          <button
            disabled={!deleteOtp.trim() || deleting}
            onClick={handleDeleteGroup}
            style={{
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: !deleteOtp.trim() ? 'rgba(239, 68, 68, 0.2)' : '#ef4444',
              color: '#fff', fontWeight: 600, fontSize: 13, cursor: !deleteOtp.trim() ? 'not-allowed' : 'pointer',
              opacity: !deleteOtp.trim() || deleting ? 0.5 : 1, transition: 'all 0.2s'
            }}
          >
            {deleting ? 'Terminating...' : 'Terminate Group'}
          </button>
        </div>
      </div>

      {/* ── Global Session Audit Log Section ───────────────────────────────────────── */}
      <div style={{ marginTop: 24, background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 20, padding: 24, backdropFilter: 'blur(20px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🛡️</span> Global Session Audit Log
          </h2>
          {sessionLog.length > 0 && (
            <button
              onClick={handleClearLogs}
              style={{
                background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)',
                padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Clear Logs
            </button>
          )}
        </div>
        {sessionLog.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
            No global audit logs recorded yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 250, overflowY: 'auto' }}>
            {sessionLog.map((log, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', fontSize: 12 }}>
                <span style={{ color: '#64748b', minWidth: 80 }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                <code style={{ color: '#818cf8', fontFamily: 'monospace', minWidth: 120 }}>{log.nodeId?.slice(0, 14)}</code>
                <span style={{ fontWeight: 600, color: log.action?.includes('CONFLICT') ? '#fbbf24' : '#e2e8f0', minWidth: 140 }}>{log.action}</span>
                <span style={{ color: '#94a3b8' }}>{log.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .hover-row:hover {
          background: rgba(255,255,255,0.02);
        }
        .btn-reject:hover {
          background: rgba(239,68,68,0.1) !important;
          color: #ef4444 !important;
        }
        .btn-approve:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(34,197,94,0.4) !important;
          filter: brightness(1.1);
        }
        .btn-approve:active {
          transform: translateY(0);
        }
        .btn-revoke:hover {
          background: rgba(239,68,68,0.1) !important;
          color: #ef4444 !important;
        }
        .custom-checkbox {
          width: 20px;
          height: 20px;
          border-radius: 6px;
          border: 2px solid rgba(255, 255, 255, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          background: rgba(255, 255, 255, 0.05);
        }
        .custom-checkbox.checked {
          background: #22c55e;
          border-color: #22c55e;
          transform: scale(1.1);
          box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
        }
        .custom-checkbox:hover {
          border-color: rgba(255, 255, 255, 0.4);
        }
        .custom-checkbox.checked:hover {
          background: #16a34a;
          border-color: #16a34a;
        }
        .check-icon {
          width: 12px;
          height: 12px;
          stroke: transparent;
          stroke-width: 3.5;
          stroke-dasharray: 24;
          stroke-dashoffset: 24;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .custom-checkbox.checked .check-icon {
          stroke: white;
          stroke-dashoffset: 0;
        }
      `}} />
    </div>
  );
}

