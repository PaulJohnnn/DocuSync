'use client';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import mockAuthService, { AuthUser } from '@/lib/mockAuthService';
import { toast } from 'sonner';
import { ShieldCheck, Clock, X, Check, UserX, Activity } from 'lucide-react';

export default function AdminDashboardPage() {
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [activeUsers, setActiveUsers] = useState<AuthUser[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [sessionLog, setSessionLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; title: string; description: string; onConfirm: () => void } | null>(null);

  const showConfirm = useCallback((title: string, description: string, onConfirm: () => void) => {
    setConfirmModal({ open: true, title, description, onConfirm });
  }, []);

  const closeConfirm = useCallback(() => setConfirmModal(null), []);
  
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

  const handleDeleteGroup = async () => {
    if (!deleteOtp.trim()) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/delete-group', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: deleteOtp.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to terminate repository');
      toast.success(`Repository (OTP: ${deleteOtp.toUpperCase()}) terminated successfully`);
      setDeleteOtp('');
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to terminate repository');
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    loadData(true);
    const unsubscribe = mockAuthService.subscribeToDatabaseChanges(() => {
      loadData(false);
    });
    return unsubscribe;
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await mockAuthService.approveRequest(id, '123456'); // Backend generates it, but signature expects pin? Let's just pass undefined if possible, wait mockAuthService signature expects (id: string, dummy?: string)
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

  const handleRevoke = async (id: string) => {
    try {
      await mockAuthService.revokeUser(id);
      await loadData();
      toast.success('User access revoked');
    } catch (e) {
      console.error(e);
    }
  };

  const handleRevokeMultiple = () => {
    showConfirm(
      `Revoke ${selectedUserIds.size} Selected ${selectedUserIds.size === 1 ? 'User' : 'Users'}`,
      `You are about to permanently revoke access for ${selectedUserIds.size} selected ${selectedUserIds.size === 1 ? 'profile' : 'profiles'}. They will need to re-request authorization to rejoin.`,
      async () => {
        try {
          for (const id of Array.from(selectedUserIds)) {
            await mockAuthService.revokeUser(id);
          }
          setSelectedUserIds(new Set());
          await loadData();
          toast.success(`Users revoked successfully`);
        } catch (e) {
          console.error(e);
          toast.error('Failed to revoke some users');
        }
      }
    );
  };

  const toggleUserSelection = (id: string) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ animation: 'fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)', paddingBottom: 60, maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Premium Confirm Modal ───────────────────────────────────────────── */}
      {confirmModal?.open && (
        <div
          onClick={closeConfirm}
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.15s ease',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'linear-gradient(145deg, rgba(15,23,42,0.98) 0%, rgba(30,27,75,0.98) 100%)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 24,
              padding: '32px 36px',
              maxWidth: 460,
              width: '90%',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 40px 80px -20px rgba(0,0,0,0.8), 0 0 60px -20px rgba(239,68,68,0.15)',
              animation: 'modalSlideUp 0.25s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            {/* Icon */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(239,68,68,0.2) 0%, rgba(239,68,68,0.05) 70%)',
                border: '1px solid rgba(239,68,68,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 30px rgba(239,68,68,0.2)',
              }}>
                <UserX size={26} color="#f87171" />
              </div>
            </div>

            {/* Title */}
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#fff', textAlign: 'center', margin: '0 0 10px' }}>
              {confirmModal.title}
            </h2>

            {/* Description */}
            <p style={{ fontSize: 14, color: '#94a3b8', textAlign: 'center', lineHeight: 1.7, margin: '0 0 28px' }}>
              {confirmModal.description}
            </p>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={closeConfirm}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12, fontSize: 14, fontWeight: 600,
                  background: 'rgba(255,255,255,0.05)',
                  color: '#94a3b8',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#94a3b8'; }}
              >
                Cancel
              </button>
              <button
                onClick={() => { confirmModal.onConfirm(); closeConfirm(); }}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12, fontSize: 14, fontWeight: 700,
                  background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  color: '#fff',
                  border: '1px solid rgba(239,68,68,0.4)',
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(239,68,68,0.35)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 28px rgba(239,68,68,0.55)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(239,68,68,0.35)'; e.currentTarget.style.transform = 'none'; }}
              >
                Confirm Revoke
              </button>
            </div>
          </div>

          <style>{`
            @keyframes modalSlideUp {
              from { opacity: 0; transform: scale(0.94) translateY(16px); }
              to   { opacity: 1; transform: scale(1)   translateY(0); }
            }
            @keyframes fadeIn {
              from { opacity: 0; } to { opacity: 1; }
            }
          `}</style>
        </div>
      )}
      
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
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 16, padding: '12px 24px', textAlign: 'center', minWidth: 120, backdropFilter: 'blur(10px)' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: pendingRequests.length > 0 ? '#f87171' : '#fff' }}>{pendingRequests.length}</div>
            <div style={{ fontSize: 12, color: pendingRequests.length > 0 ? '#fca5a5' : '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Pending</div>
          </div>
        </div>
      </div>



      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
        
        {/* Pending Requests Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, margin: 0, color: '#f8fafc' }}>
              <div style={{ background: 'rgba(239,68,68,0.1)', padding: 6, borderRadius: 8 }}>
                <Clock size={18} color="#f87171" />
              </div>
              Pending Requests
              {pendingRequests.length > 0 && (
                <span style={{
                  background: 'linear-gradient(135deg, #ef4444, #b91c1c)', color: '#fff', fontSize: 12, padding: '2px 10px',
                  borderRadius: 99, fontWeight: 800, marginLeft: 4, boxShadow: '0 2px 8px rgba(239,68,68,0.4)'
                }}>
                  {pendingRequests.length}
                </span>
              )}
            </h2>
          </div>

          <div style={{
            background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 20, 
            overflow: 'hidden', backdropFilter: 'blur(20px)', minHeight: 400,
            boxShadow: '0 20px 40px -20px rgba(0,0,0,0.5)'
          }}>
            {loading ? (
              <div style={{ padding: 60, textAlign: 'center', color: '#64748b', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <div className="ds-spinner" style={{ width: 32, height: 32, borderTopColor: '#6366f1' }} />
                <span>Syncing Database...</span>
              </div>
            ) : pendingRequests.length === 0 ? (
              <div style={{ padding: '80px 40px', textAlign: 'center', color: '#64748b', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                  <Activity size={32} color="#475569" strokeWidth={1.5} />
                </div>
                <h3 style={{ margin: '0 0 8px 0', color: '#e2e8f0', fontSize: 18, fontWeight: 600 }}>All Caught Up</h3>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, maxWidth: 260 }}>There are no pending profile requests at this moment.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {pendingRequests.map((req, i) => (
                  <div key={req.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '20px 24px', borderBottom: i === pendingRequests.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.04)',
                    transition: 'background 0.2s', cursor: 'default'
                  }} className="hover-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(245,158,11,0.1))',
                        color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, fontWeight: 700, border: '1px solid rgba(239,68,68,0.2)'
                      }}>
                        {req.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: 15, marginBottom: 4 }}>{req.email}</div>
                        <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={12} />
                          Requested {new Date(req.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => handleReject(req.id)}
                        style={{
                          background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8',
                          width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.2s'
                        }}
                        className="btn-reject"
                        title="Deny Request"
                      >
                        <X size={18} />
                      </button>
                      <button
                        onClick={() => handleApprove(req.id)}
                        style={{
                          background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: 'none', color: '#fff',
                          height: 36, padding: '0 16px', borderRadius: 10, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13,
                          boxShadow: '0 4px 12px rgba(34,197,94,0.3)', transition: 'all 0.2s'
                        }}
                        className="btn-approve"
                      >
                        <Check size={16} strokeWidth={3} />
                        Approve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

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
                      <button
                        onClick={() => {
                          if(confirm(`Revoke access for ${u.email}?`)) handleRevoke(u.id);
                        }}
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
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px 0', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>🛡️</span> Global Session Audit Log
        </h2>
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

// Temporary icon component since Users wasn't imported from lucide-react above
const Users = ({ size, color }: { size: number, color: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  </svg>
);
