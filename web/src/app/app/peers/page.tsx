'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import mockRoomService, { type Room } from '@/lib/mockRoomService';

// ── View state machine ────────────────────────────────────────────────────
// list → create_name → create_generating → create_success → workspace
// list → join_otp → join_loading → join_success | join_error

type View =
  | 'list'
  | 'create_name'
  | 'create_generating'
  | 'create_success'
  | 'join_otp'
  | 'join_loading'
  | 'join_success'
  | 'join_error';

// ── OTP display (tap-to-copy) ─────────────────────────────────────────────
const OtpDisplay: React.FC<{ otp: string }> = ({ otp }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(otp).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      title="Click to copy invite code"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        width: '100%', padding: '16px 20px', borderRadius: 14, cursor: 'pointer',
        background: copied ? 'rgba(34,197,94,0.08)' : 'rgba(79,70,229,0.06)',
        border: `1.5px dashed ${copied ? '#22c55e' : '#818cf8'}`,
        transition: 'all 0.2s',
      }}
    >
      <span style={{
        fontSize: 28, fontWeight: 800, letterSpacing: '0.25em',
        color: copied ? '#15803d' : '#3730a3', fontFamily: 'monospace',
      }}>
        {otp}
      </span>
      {copied ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      <span style={{ fontSize: 12, color: copied ? '#16a34a' : '#6366f1', fontWeight: 600 }}>
        {copied ? 'Copied!' : 'Tap to copy'}
      </span>
    </button>
  );
};

// ── OTP join input (6 big boxes) ──────────────────────────────────────────
const OtpInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  error?: string;
}> = ({ value, onChange, error }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const chars = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

  return (
    <div>
      <div
        style={{
          display: 'flex', gap: 8, justifyContent: 'center', cursor: 'text',
          padding: '4px 0',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{
            width: 48, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 10,
            background: i < chars.length ? 'rgba(79,70,229,0.07)' : '#f8fafc',
            border: `2px solid ${error ? '#ef4444' : i < chars.length ? '#818cf8' : '#e2e8f0'}`,
            fontSize: 20, fontWeight: 800, color: '#3730a3', fontFamily: 'monospace',
            transition: 'all 0.15s',
          }}>
            {chars[i] ?? ''}
          </div>
        ))}
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        maxLength={6}
        onChange={e => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }}
        autoComplete="off"
        autoFocus
      />
      {error && <p style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: '#ef4444' }}>{error}</p>}
    </div>
  );
};

// ── Spinner ───────────────────────────────────────────────────────────────
const Spinner: React.FC<{ color?: string }> = ({ color = '#4f46e5' }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
  </svg>
);

// ── Room card ─────────────────────────────────────────────────────────────
const RoomCard: React.FC<{
  room: Room;
  onEnter: () => void;
  onDelete: () => void;
}> = ({ room, onEnter, onDelete }) => {
  const [showOtp, setShowOtp] = useState(false);
  const [copied, setCopied] = useState(false);

  const statusColors = {
    active: { bg: 'rgba(34,197,94,0.08)', text: '#16a34a', dot: '#22c55e' },
    idle: { bg: 'rgba(245,158,11,0.08)', text: '#92400e', dot: '#f59e0b' },
    inactive: { bg: 'rgba(156,163,175,0.1)', text: '#6b7280', dot: '#9ca3af' },
  };
  const sc = statusColors[room.status];

  return (
    <div style={{
      background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 14,
      padding: '16px 20px', transition: 'all 0.2s',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    }}
      onMouseEnter={e => { (e.currentTarget.style.borderColor = '#818cf8'); (e.currentTarget.style.boxShadow = '0 4px 16px rgba(79,70,229,0.1)'); }}
      onMouseLeave={e => { (e.currentTarget.style.borderColor = '#e2e8f0'); (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'); }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {/* Room icon */}
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: room.isOwner ? 'rgba(79,70,229,0.1)' : 'rgba(34,197,94,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {room.isOwner ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              )}
            </div>

            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{room.name}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                {room.isOwner ? '👑 You created this' : '🔗 Joined via invite'}
                {' · '}
                {new Date(room.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Status badge */}
            <span style={{
              padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: sc.bg, color: sc.text,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot, display: 'inline-block' }} />
              {room.status}
            </span>

            {/* Peer count */}
            <span style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 3 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              {room.peerCount} peer{room.peerCount !== 1 ? 's' : ''}
            </span>

            {/* OTP chip */}
            <button
              onClick={() => {
                if (!showOtp) { setShowOtp(true); return; }
                navigator.clipboard.writeText(room.otp).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
              }}
              style={{
                padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                background: copied ? 'rgba(34,197,94,0.08)' : 'rgba(79,70,229,0.06)',
                color: copied ? '#16a34a' : '#4f46e5', border: 'none', cursor: 'pointer',
                fontFamily: showOtp ? 'monospace' : 'inherit',
                letterSpacing: showOtp ? '0.1em' : 0,
              }}
            >
              {showOtp ? (copied ? '✓ Copied!' : room.otp) : '🔑 Show code'}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={onEnter}
            style={{
              padding: '7px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600,
              background: 'linear-gradient(135deg, #4f46e5 0%, #2952d9 100%)', color: '#fff',
              border: 'none', cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
            }}
          >
            Enter →
          </button>
          <button
            onClick={onDelete}
            style={{
              width: 34, height: 34, borderRadius: 8, border: '1px solid #fecaca',
              background: '#fff', cursor: 'pointer', color: '#ef4444',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title="Leave / delete room"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────
export default function RoomsPage() {
  const router = useRouter();
  const [view, setView] = useState<View>('list');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [createdRoom, setCreatedRoom] = useState<Room | null>(null);
  const [joinedRoom, setJoinedRoom] = useState<Room | null>(null);

  const [roomName, setRoomName] = useState('');
  const [roomNameError, setRoomNameError] = useState('');

  const [otpInput, setOtpInput] = useState('');
  const [joinError, setJoinError] = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const data = await mockRoomService.listRooms();
      setRooms(data);
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  useEffect(() => {
    loadRooms();
    const unsubscribe = mockRoomService.subscribeToRoomChanges(() => loadRooms());
    return unsubscribe;
  }, [loadRooms]);

  // ── Create flow ──────────────────────────────────────────────────────────
  const handleCreateStart = () => { setRoomName(''); setRoomNameError(''); setView('create_name'); };

  const handleCreateGenerate = async () => {
    if (!roomName.trim()) { setRoomNameError('Please enter a room name.'); return; }
    setRoomNameError('');
    setView('create_generating');
    try {
      const room = await mockRoomService.createRoom(roomName);
      setCreatedRoom(room);
      setRooms(prev => [...prev, room]);
      setView('create_success');
    } catch (err: any) {
      setRoomNameError(err?.message ?? 'Failed to create room.');
      setView('create_name');
    }
  };

  // ── Join flow ────────────────────────────────────────────────────────────
  const handleJoinStart = () => { setOtpInput(''); setJoinError(''); setView('join_otp'); };

  const handleJoinSubmit = async () => {
    if (otpInput.length < 6) { setJoinError('Enter all 6 characters of the invite code.'); return; }
    setJoinError('');
    setView('join_loading');
    try {
      const room = await mockRoomService.joinRoom(otpInput);
      setJoinedRoom(room);
      setRooms(prev => {
        const exists = prev.find(r => r.id === room.id);
        return exists ? prev : [...prev, room];
      });
      setView('join_success');
    } catch (err: any) {
      setJoinError(err?.message ?? 'Room not found.');
      setView('join_error');
    }
  };

  const handleDelete = async (roomId: string) => {
    await mockRoomService.deleteRoom(roomId);
    setRooms(prev => prev.filter(r => r.id !== roomId));
    setDeleteConfirm(null);
  };

  const handleEnterWorkspace = (room: Room) => {
    localStorage.setItem('docusync_current_room', JSON.stringify(room));
    sessionStorage.setItem('docusync_has_seen_welcome_session', 'true');
    router.push('/app/files');
  };

  const cardStyle: React.CSSProperties = {
    background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 18,
    padding: '32px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
    maxWidth: 480, width: '100%', margin: '0 auto',
  };

  // ── Render views ──────────────────────────────────────────────────────────
  const renderView = () => {
    switch (view) {
      // ── LIST ──────────────────────────────────────────────────────────────
      case 'list':
        return (
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Sync Rooms</h2>
                <p style={{ fontSize: 13, color: '#64748b' }}>Create a room or join one with an invite code to start syncing.</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleJoinStart} style={{
                  padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                  background: '#f8fafc', color: '#1e293b', border: '1.5px solid #e2e8f0', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                  Join Room
                </button>
                <button onClick={handleCreateStart} style={{
                  padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  background: 'linear-gradient(135deg, #4f46e5 0%, #2952d9 100%)', color: '#fff',
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 2px 10px rgba(79,70,229,0.3)',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Create Room
                </button>
              </div>
            </div>

            {/* Room list */}
            {loadingRooms ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <Spinner />
                <span style={{ fontSize: 13 }}>Loading your rooms…</span>
              </div>
            ) : rooms.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 24px', color: '#94a3b8' }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%', background: 'rgba(79,70,229,0.06)',
                  border: '2px dashed rgba(79,70,229,0.2)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', margin: '0 auto 20px',
                }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#475569', marginBottom: 8 }}>No rooms yet</h3>
                <p style={{ fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                  Create a room and share the invite code, or join one from another device to start syncing files.
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button onClick={handleJoinStart} style={{ padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: '#f8fafc', color: '#475569', border: '1.5px solid #e2e8f0', cursor: 'pointer' }}>
                    Join with code
                  </button>
                  <button onClick={handleCreateStart} style={{ padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: 'linear-gradient(135deg, #4f46e5 0%, #2952d9 100%)', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 2px 10px rgba(79,70,229,0.3)' }}>
                    + Create Room
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {rooms.map(room => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    onEnter={() => handleEnterWorkspace(room)}
                    onDelete={() => setDeleteConfirm(room.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );

      // ── CREATE: Name input ─────────────────────────────────────────────────
      case 'create_name':
        return (
          <div style={cardStyle}>
            <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 13, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
              ← Back
            </button>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(79,70,229,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Create a Room</h2>
              <p style={{ fontSize: 13, color: '#64748b' }}>Give your sync workspace a name. You&apos;ll share the invite code with peers.</p>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>Room Name</label>
              <input
                autoFocus
                type="text"
                value={roomName}
                onChange={e => { setRoomName(e.target.value); if (roomNameError) setRoomNameError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleCreateGenerate()}
                placeholder="e.g. Thesis Project, Team Alpha…"
                maxLength={40}
                style={{
                  width: '100%', padding: '13px 16px', borderRadius: 12, fontSize: 15, fontWeight: 500,
                  border: `1.5px solid ${roomNameError ? '#ef4444' : '#e2e8f0'}`,
                  outline: 'none', fontFamily: 'inherit', color: '#0f172a',
                  boxSizing: 'border-box',
                }}
                onFocus={e => { e.target.style.borderColor = '#818cf8'; e.target.style.boxShadow = '0 0 0 3px rgba(129,140,248,0.15)'; }}
                onBlur={e => { e.target.style.borderColor = roomNameError ? '#ef4444' : '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
              />
              {roomNameError && <p style={{ marginTop: 4, fontSize: 12, color: '#ef4444' }}>{roomNameError}</p>}
            </div>
            <button onClick={handleCreateGenerate} style={{
              width: '100%', padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 700,
              background: 'linear-gradient(135deg, #4f46e5 0%, #2952d9 100%)', color: '#fff', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 4px 16px rgba(79,70,229,0.35)',
            }}>
              Generate Room →
            </button>
          </div>
        );

      // ── CREATE: Generating spinner ─────────────────────────────────────────
      case 'create_generating':
        return (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 32px' }}>
            <Spinner />
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginTop: 20, marginBottom: 8 }}>Creating Room…</h3>
            <p style={{ fontSize: 13, color: '#64748b' }}>Setting up your shared workspace and generating an invite code.</p>
          </div>
        );

      // ── CREATE: Success + OTP display ──────────────────────────────────────
      case 'create_success':
        return (
          <div style={{ ...cardStyle, animation: 'fadeInUp 0.4s ease' }}>
            {/* Success header */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Room Generated!</h2>
              <p style={{ fontSize: 13, color: '#64748b' }}>
                <strong style={{ color: '#0f172a' }}>{createdRoom?.name}</strong> is ready. Share the invite code below with your peers.
              </p>
            </div>

            {/* OTP */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textAlign: 'center', marginBottom: 8 }}>INVITE CODE / OTP</div>
              {createdRoom && <OtpDisplay otp={createdRoom.otp} />}
            </div>

            {/* Info pills */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
              <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, background: 'rgba(79,70,229,0.06)', color: '#4f46e5', fontWeight: 600 }}>
                👑 You&apos;re the owner
              </span>
              <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, background: 'rgba(34,197,94,0.06)', color: '#16a34a', fontWeight: 600 }}>
                ● Active
              </span>
            </div>

            {/* Instructions */}
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 16px', marginBottom: 24, fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
              📱 Share the 6-character code with peers on Desktop or Mobile. They enter it in <em>Join Room → Use OTP</em> to connect.
            </div>

            {/* CTA */}
            <button onClick={() => createdRoom && handleEnterWorkspace(createdRoom)} style={{
              width: '100%', padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 700,
              background: 'linear-gradient(135deg, #4f46e5 0%, #2952d9 100%)', color: '#fff', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 4px 16px rgba(79,70,229,0.35)', marginBottom: 10,
            }}>
              Enter Workspace →
            </button>
            <button onClick={() => setView('list')} style={{ width: '100%', padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: '#f8fafc', color: '#475569', border: '1.5px solid #e2e8f0', cursor: 'pointer' }}>
              Back to Room List
            </button>
          </div>
        );

      // ── JOIN: OTP input ────────────────────────────────────────────────────
      case 'join_otp':
        return (
          <div style={cardStyle}>
            <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 13, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
              ← Back
            </button>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(79,70,229,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
                </svg>
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Join a Room</h2>
              <p style={{ fontSize: 13, color: '#64748b' }}>Enter the 6-character invite code shared by the room owner.</p>
            </div>
            <div style={{ marginBottom: 20 }}>
              <OtpInput value={otpInput} onChange={setOtpInput} error={joinError} />
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginBottom: 20 }}>
              💡 Try <strong>FAIL01</strong> to simulate a &quot;Room Not Found&quot; error for demo.
            </p>
            <button
              onClick={handleJoinSubmit}
              disabled={otpInput.length < 6}
              style={{
                width: '100%', padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 700,
                background: otpInput.length === 6 ? 'linear-gradient(135deg, #4f46e5 0%, #2952d9 100%)' : '#e2e8f0',
                color: otpInput.length === 6 ? '#fff' : '#94a3b8', border: 'none', cursor: otpInput.length === 6 ? 'pointer' : 'not-allowed',
                boxShadow: otpInput.length === 6 ? '0 4px 16px rgba(79,70,229,0.35)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              Join Room
            </button>
          </div>
        );

      // ── JOIN: Loading ──────────────────────────────────────────────────────
      case 'join_loading':
        return (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 32px' }}>
            <Spinner />
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginTop: 20, marginBottom: 8 }}>Joining Room…</h3>
            <p style={{ fontSize: 13, color: '#64748b' }}>Verifying invite code and connecting to peers.</p>
          </div>
        );

      // ── JOIN: Success ──────────────────────────────────────────────────────
      case 'join_success':
        return (
          <div style={{ ...cardStyle, animation: 'fadeInUp 0.4s ease' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Joined Room!</h2>
              <p style={{ fontSize: 13, color: '#64748b' }}>
                You&apos;re now in <strong style={{ color: '#0f172a' }}>{joinedRoom?.name}</strong> with {joinedRoom?.peerCount} peer{joinedRoom?.peerCount !== 1 ? 's' : ''}.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 24 }}>
              <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, background: 'rgba(34,197,94,0.06)', color: '#16a34a', fontWeight: 600 }}>🔗 Member</span>
              <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, background: 'rgba(34,197,94,0.06)', color: '#16a34a', fontWeight: 600 }}>● Connected</span>
            </div>
            <button onClick={() => joinedRoom && handleEnterWorkspace(joinedRoom)} style={{
              width: '100%', padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 700,
              background: 'linear-gradient(135deg, #4f46e5 0%, #2952d9 100%)', color: '#fff', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 4px 16px rgba(79,70,229,0.35)', marginBottom: 10,
            }}>
              Enter Workspace →
            </button>
            <button onClick={() => setView('list')} style={{ width: '100%', padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: '#f8fafc', color: '#475569', border: '1.5px solid #e2e8f0', cursor: 'pointer' }}>
              Back to Room List
            </button>
          </div>
        );

      // ── JOIN: Error ────────────────────────────────────────────────────────
      case 'join_error':
        return (
          <div style={{ ...cardStyle, animation: 'fadeInUp 0.4s ease' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Room Does Not Exist</h2>
              <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                {joinError || 'No room was found with that invite code. Check the code and try again.'}
              </p>
            </div>
            <div style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 24, fontSize: 12, color: '#dc2626' }}>
              Code <strong style={{ fontFamily: 'monospace', fontSize: 14 }}>{otpInput}</strong> was not found. It may have expired or been deleted.
            </div>
            <button onClick={() => { setOtpInput(''); setJoinError(''); setView('join_otp'); }} style={{
              width: '100%', padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 700,
              background: 'linear-gradient(135deg, #4f46e5 0%, #2952d9 100%)', color: '#fff', border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(79,70,229,0.35)', marginBottom: 10,
            }}>
              Try Again
            </button>
            <button onClick={() => setView('list')} style={{ width: '100%', padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: '#f8fafc', color: '#475569', border: '1.5px solid #e2e8f0', cursor: 'pointer' }}>
              Back to Room List
            </button>
          </div>
        );
    }
  };

  return (
    <PageShell>
      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '28px', maxWidth: 380, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Leave this room?</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
              You&apos;ll lose access to this room&apos;s shared workspace. The room owner can re-invite you later.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#f8fafc', color: '#475569', border: '1.5px solid #e2e8f0', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ flex: 1, padding: '11px', borderRadius: 10, fontSize: 14, fontWeight: 700, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}>
                Leave Room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ padding: '32px 24px', minHeight: '100%', background: '#f8fafc' }}>
        {renderView()}
      </div>

      <style>{`
        @keyframes fadeInUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </PageShell>
  );
}
