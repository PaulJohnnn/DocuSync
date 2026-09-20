'use client';
import React, { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import mockAuthService from '@/lib/mockAuthService';

// ── DocuSync Logo SVG ─────────────────────────────────────────────────────
const DocuSyncLogo: React.FC<{ size?: number }> = ({ size = 80 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ filter: 'drop-shadow(0px 8px 16px rgba(79, 70, 229, 0.25))' }}>
    <rect width="100" height="100" rx="24" fill="#4f7df8" />
    <rect x="22" y="28" width="56" height="12" rx="6" fill="white" />
    <rect x="22" y="48" width="56" height="12" rx="6" fill="white" />
    <rect x="22" y="68" width="32" height="12" rx="6" fill="white" />
  </svg>
);

// ── Animated P2P Sync Mesh ───────────────────────────────────────────────
// Replaces the old DNA graphic with something that actually depicts what
// this product does: a masterless peer mesh, with data packets genuinely
// traveling between nodes (SVG <animateMotion>, not a faked illusion) and
// each node pulsing independently on its own stagger — not one rigid
// shape bobbing as a single block.
const MESH_NODES = [
  { x: 400, y: 170, r: 9, color: '#6366f1' },
  { x: 600, y: 300, r: 7, color: '#38bdf8' },
  { x: 560, y: 540, r: 8, color: '#a855f7' },
  { x: 340, y: 610, r: 7, color: '#818cf8' },
  { x: 180, y: 470, r: 8, color: '#c084fc' },
  { x: 210, y: 250, r: 7, color: '#38bdf8' },
];
const MESH_EDGES: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 2], [3, 5],
];

const AnimatedSyncMesh: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}>
    <svg viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%', opacity: 0.85 }}>
      <defs>
        <radialGradient id="meshNodeGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a5b4fc" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Mesh edges — the connections a masterless P2P topology relies on */}
      {MESH_EDGES.map(([a, b], i) => {
        const A = MESH_NODES[a], B = MESH_NODES[b];
        return (
          <line
            key={`edge-${i}`}
            x1={A.x} y1={A.y} x2={B.x} y2={B.y}
            stroke="rgba(129,140,248,0.28)" strokeWidth="1.5"
          />
        );
      })}

      {/* Data packets actually traveling along each edge — this is the
          real sync engine's job, drawn literally rather than abstracted. */}
      {MESH_EDGES.map(([a, b], i) => {
        const A = MESH_NODES[a], B = MESH_NODES[b];
        const dur = 2.6 + (i % 4) * 0.5;
        const delay = i * 0.35;
        return (
          <circle key={`packet-${i}`} r="3.5" fill={i % 2 === 0 ? '#38bdf8' : '#c084fc'}>
            <animateMotion
              dur={`${dur}s`}
              begin={`${delay}s`}
              repeatCount="indefinite"
              path={`M ${A.x} ${A.y} L ${B.x} ${B.y}`}
            />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.9;1" dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
          </circle>
        );
      })}

      {/* Nodes — each pulses on its own independent stagger, not as one block */}
      {MESH_NODES.map((n, i) => (
        <g key={`node-${i}`}>
          <circle cx={n.x} cy={n.y} r={22} fill="url(#meshNodeGlow)">
            <animate attributeName="r" values={`${n.r + 10};${n.r + 22};${n.r + 10}`} dur={`${3 + i * 0.4}s`} begin={`${i * 0.3}s`} repeatCount="indefinite" />
          </circle>
          <circle cx={n.x} cy={n.y} r={n.r} fill={n.color}>
            <animate attributeName="r" values={`${n.r};${n.r * 1.25};${n.r}`} dur={`${3 + i * 0.4}s`} begin={`${i * 0.3}s`} repeatCount="indefinite" />
          </circle>
        </g>
      ))}
    </svg>
  </div>
);

// ── Wave SVG (left panel bottom) ──────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const WaveDecor: React.FC = () => (
  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, overflow: 'hidden', lineHeight: 0 }}>
    <svg viewBox="0 0 500 140" preserveAspectRatio="none" style={{ width: '100%', height: 140, display: 'block' }}>
      <path d="M0,80 C80,140 160,20 240,80 S400,140 500,80 L500,140 L0,140 Z" fill="rgba(255,255,255,0.08)" />
      <path d="M0,100 C100,160 200,40 300,100 S440,160 500,100 L500,140 L0,140 Z" fill="rgba(255,255,255,0.05)" />
    </svg>
  </div>
);

// ── 6-digit PIN input (exact mockup design) ────────────────────────────────
const SixDigitPin: React.FC<{
  value: string;
  onChange: (v: string) => void;
  showPin: boolean;
  onToggleShow: () => void;
  error?: string;
  shake?: boolean;
}> = ({ value, onChange, showPin, onToggleShow, error, shake }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        border: `1.5px solid ${error ? '#ef4444' : 'var(--border)'}`,
        borderRadius: 12, background: '#f8fafc', padding: '11px 14px',
        cursor: 'text', gap: 10,
        boxShadow: error ? '0 0 0 3px rgba(239,68,68,0.12)' : undefined,
        animation: shake ? 'shake 0.4s ease' : undefined,
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
        onClick={() => inputRef.current?.focus()}
        onFocus={() => inputRef.current?.focus()}
      >
        {/* Lock icon */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={error ? '#ef4444' : '#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>

        {/* 6 PIN slots */}
        <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
          {Array.from({ length: 6 }).map((_, i) => {
            const filled = i < value.length;
            const char = value[i] ?? '';
            return (
              <div key={i} style={{
                width: 30, height: 30,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 7,
                background: filled ? 'rgba(79,70,229,0.07)' : 'rgba(0,0,0,0.025)',
                border: `1.5px solid ${(isFocused && (value.length === i || (value.length === 6 && i === 5))) ? '#4f46e5' : filled ? 'rgba(79,70,229,0.3)' : 'rgba(0,0,0,0.08)'}`,
                boxShadow: (isFocused && (value.length === i || (value.length === 6 && i === 5))) ? '0 0 0 3px rgba(79,70,229,0.2)' : undefined,
                transition: 'all 0.15s',
              }}>
                {filled && (
                  showPin
                    ? <span style={{ fontSize: 15, fontWeight: 700, color: '#3730a3', lineHeight: 1 }}>{char}</span>
                    : <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#3730a3' }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Eye toggle */}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onToggleShow(); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#94a3b8', padding: 3, flexShrink: 0,
            display: 'flex', alignItems: 'center',
          }}
          title={showPin ? 'Hide PIN' : 'Show PIN'}
        >
          {showPin ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>

        {/* Hidden real input */}
        <input
          ref={inputRef}
          type="text"
          maxLength={6}
          value={value}
          onChange={e => onChange(e.target.value.slice(0, 6))}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }}
          autoComplete="one-time-code"
        />
      </div>
    </div>
  );
};

// ── Sign Up form inner ──────────────────────────────────────────────────────
function SignUpForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [approvedPin, setApprovedPin] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [waitTimer, setWaitTimer] = useState(0);

  // New Remodeled Auth States
  const [setupStep, setSetupStep] = useState<'idle' | 'verify' | 'set_password' | 'confirm_password'>('idle');
  const [verifyPinInput, setVerifyPinInput] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordError, setNewPasswordError] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  useEffect(() => {
    if (!success) return;

    let cancelled = false;
    let checkInFlight = false;
    const check = () => {
      if (checkInFlight) return;
      checkInFlight = true;
      mockAuthService.checkApprovalStatus(email)
        .then(pin => { if (pin && !cancelled) setApprovedPin(pin); })
        .finally(() => { checkInFlight = false; });
    };

    // Initial check in case it was instantly approved (rare)
    check();

    // This screen is the single place in the app where a user is actively
    // staring at a timer waiting for something to happen, so it shouldn't
    // depend on the app-wide 2s diff poll noticing a change somewhere in
    // the full users+pending list (which only fires when THAT poll's own
    // cycle lands, and only if something in the whole list changed) —
    // poll this one email's status directly and quickly instead.
    const fastPoll = setInterval(check, 800);

    const unsubscribe = mockAuthService.subscribeToDatabaseChanges(check);

    const timerInterval = setInterval(() => {
      setWaitTimer(prev => prev + 1);
    }, 1000);

    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(fastPoll);
      clearInterval(timerInterval);
    };
  }, [success, email]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setEmailError('Username is required.');
      return;
    }
    setLoading(true);
    try {
      await mockAuthService.requestAccount(email);
      setSuccess(true);
    } catch (err: any) {
      if (err.code === 'EMAIL_ALREADY_USED') setEmailError('This profile is already registered.');
      else if (err.code === 'EMAIL_ALREADY_PENDING') setEmailError('A request for this profile is already pending admin approval.');
      else setEmailError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', animation: 'fadeInUp 0.4s ease' }}>
        {setupStep === 'idle' && (
          <>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            {approvedPin ? (
              <>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: '#166534', marginBottom: 8 }}>Request Approved!</h3>
                <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 16, lineHeight: 1.5 }}>
                  Your profile was approved by the administrator. Use the Access Code below to proceed.
                </p>
                <div style={{
                  background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px',
                  marginBottom: 24, fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '4px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12
                }}>
                  <span>{approvedPin}</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(approvedPin); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    style={{ background: copied ? '#10b981' : 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: copied ? '#fff' : '#64748b', borderRadius: 6, transition: 'all 0.2s', transform: copied ? 'scale(1.1)' : 'none' }}
                    title="Copy PIN"
                  >
                    {copied ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>}
                  </button>
                </div>
                <button
                  onClick={() => setSetupStep('verify')}
                  style={{ padding: '12px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)', width: '100%' }}
                >
                  Continue to Login
                </button>
              </>
            ) : (
                <>
                  <h3 style={{ fontSize: 20, fontWeight: 700, color: '#166534', marginBottom: 8 }}>Request Sent!</h3>
                  <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 24, lineHeight: 1.5 }}>
                    Your profile request for <strong>{email}</strong> has been logged locally. Please contact the device administrator to approve this profile.
                  </p>
                  <div style={{ padding: '16px', background: '#f1f5f9', borderRadius: 12, marginBottom: 24 }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                      {Math.floor(waitTimer / 60)}:{(waitTimer % 60).toString().padStart(2, '0')}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Waiting for Approval</div>
                  </div>
                  {waitTimer > 15 && (
                    <button onClick={() => { setWaitTimer(0); setSuccess(false); }} style={{ background: 'none', border: 'none', color: '#dc2626', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>Cancel & Try Again</button>
                  )}
                </>
            )}
          </>
        )}

        {setupStep === 'verify' && (
          <div style={{ animation: 'fadeInUp 0.3s cubic-bezier(0.16,1,0.3,1)', textAlign: 'left' }}>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 8, marginTop: 0 }}>Verify Access Code</h3>
            <p style={{ fontSize: 13, color: '#475569', marginBottom: 20, lineHeight: 1.6 }}>Please enter the 6-digit access code provided by the administrator to continue.</p>
            <div style={{ marginBottom: 20 }}>
              <SixDigitPin value={verifyPinInput} onChange={v => { setVerifyPinInput(v); setVerifyError(''); }} showPin={true} onToggleShow={() => {}} error={verifyError} shake={!!verifyError} />
              {verifyError && <div style={{ color: '#ef4444', fontSize: 13, marginTop: 6, textAlign: 'center', fontWeight: 600 }}>{verifyError}</div>}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => { setSetupStep('idle'); setVerifyPinInput(''); }} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Go Back</button>
              <button 
                onClick={() => {
                  if (verifyPinInput !== approvedPin) setVerifyError('Incorrect Access Code.');
                  else setSetupStep('set_password');
                }} 
                disabled={verifyPinInput.length < 6}
                style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: verifyPinInput.length === 6 ? '#0f172a' : '#94a3b8', color: '#fff', fontWeight: 600, cursor: verifyPinInput.length === 6 ? 'pointer' : 'not-allowed' }}
              >
                Verify Code
              </button>
            </div>
          </div>
        )}

        {setupStep === 'set_password' && (
           <div style={{ animation: 'fadeInUp 0.3s ease', textAlign: 'left' }}>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 8, marginTop: 0 }}>Set Your Password</h3>
              <p style={{ fontSize: 13, color: '#475569', marginBottom: 20, lineHeight: 1.6 }}>Create a permanent password for this account. You will use this to sign in next time instead of the Access Code.</p>
              
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', border: `1.5px solid ${newPasswordError ? '#ef4444' : 'var(--border)'}`, borderRadius: 12, background: '#f8fafc', overflow: 'hidden' }}>
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={e => { setNewPassword(e.target.value); setNewPasswordError(''); }}
                    placeholder="Enter new password (min. 5 chars)"
                    style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', padding: '14px', fontSize: 15, color: '#0f172a', fontFamily: 'inherit' }}
                  />
                  <button type="button" onClick={() => setShowNewPassword(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 14px', color: '#94a3b8' }}>
                     {showNewPassword ? (
                       <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                     ) : (
                       <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                     )}
                  </button>
                </div>
                {newPasswordError && <div style={{ color: '#ef4444', fontSize: 13, marginTop: 6, fontWeight: 500 }}>{newPasswordError}</div>}
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setSetupStep('verify')} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Go Back</button>
                <button 
                  onClick={() => {
                    if (newPassword.length < 5) setNewPasswordError('Password must be at least 5 characters long.');
                    else setSetupStep('confirm_password');
                  }} 
                  style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)' }}
                >
                  Continue Login
                </button>
              </div>
           </div>
        )}

        {/* ── Confirm Password Modal ────────────────────────────────────── */}
        {setupStep === 'confirm_password' && (
          <div onClick={() => setSetupStep('set_password')} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.15s ease' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#ffffff', borderRadius: 24, padding: '32px', maxWidth: 400, width: '90%', textAlign: 'center', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.3)', animation: 'modalSlideUp 0.25s cubic-bezier(0.16,1,0.3,1)' }}>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 12, marginTop: 0 }}>Are you sure you saved this password?</h3>
              <p style={{ fontSize: 14, color: '#475569', marginBottom: 24, lineHeight: 1.6 }}>You will need this password to log in. Please ensure you have memorized or saved it.</p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setSetupStep('set_password')} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>No, go back</button>
                <button 
                  onClick={async () => {
                    setIsFinishing(true);
                    try {
                      await mockAuthService.setPassword(email, approvedPin!, newPassword);
                      location.href = '/app/files';
                    } catch (err: any) {
                      setNewPasswordError(err.message);
                      setSetupStep('set_password');
                    } finally {
                       setIsFinishing(false);
                    }
                  }} 
                  disabled={isFinishing}
                  style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: isFinishing ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)' }}
                >
                  {isFinishing ? 'Saving...' : 'Yes, proceed'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSignup} noValidate style={{ animation: 'fadeInUp 0.3s ease' }}>
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>
          Desired Local Identifier (Username)
        </label>
        <div style={{
          display: 'flex', alignItems: 'center',
          border: `1.5px solid ${emailError ? '#ef4444' : 'var(--border)'}`,
          borderRadius: 12, background: '#f8fafc',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}>
          <span style={{ paddingLeft: 14, color: '#94a3b8', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </span>
          <input
            type="text"
            value={email}
            placeholder="Enter your username"
            onChange={e => { setEmail(e.target.value.toLowerCase()); if (emailError) setEmailError(''); }}
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              padding: '13px 12px', fontSize: 14, color: '#0f172a', fontFamily: 'inherit',
            }}
          />
        </div>
        {emailError && <p style={{ marginTop: 4, fontSize: 12, color: '#ef4444' }}>{emailError}</p>}
      </div>

      <button
        type="submit"
        disabled={loading}
        style={{
          width: '100%', padding: '15px', borderRadius: 12, fontSize: 15, fontWeight: 700,
          background: loading ? '#a5b4fc' : 'linear-gradient(135deg, #4f46e5 0%, #2952d9 100%)',
          color: '#ffffff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: loading ? 'none' : '0 4px 20px rgba(79,70,229,0.3)',
          marginBottom: 16, transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onMouseEnter={e => { if(!loading) e.currentTarget.style.transform = 'translateY(-2px)'; }}
        onMouseLeave={e => { if(!loading) e.currentTarget.style.transform = 'none'; }}
        onMouseDown={e => { if(!loading) e.currentTarget.style.transform = 'scale(0.98)'; }}
        onMouseUp={e => { if(!loading) e.currentTarget.style.transform = 'translateY(-2px)'; }}
      >
        {loading ? 'Requesting...' : 'Request Local Profile'}
      </button>
      
      <button
        type="button"
        onClick={onBack}
        style={{
          width: '100%', padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 600,
          background: 'var(--bg-card)', color: '#64748b', border: 'none', cursor: 'pointer',
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#334155'; e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.transform = 'none'; }}
        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
        onMouseUp={e => e.currentTarget.style.transform = 'translateY(-1px)'}
      >
        Back
      </button>
    </form>
  );
}

// ── Unlock form inner (needs searchParams) ────────────────────────────────
function UnlockForm({ onSwitchToSignup }: { onSwitchToSignup: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);

  const [renewedPin, setRenewedPin] = useState('');
  const [copied, setCopied] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  // 3-step forgot password flow states
  const [forgotStep, setForgotStep] = useState<'show_code' | 'verify' | 'new_password'>('show_code');
  const [forgotVerifyInput, setForgotVerifyInput] = useState('');
  const [forgotVerifyError, setForgotVerifyError] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotNewPasswordError, setForgotNewPasswordError] = useState('');
  const [showForgotNewPassword, setShowForgotNewPassword] = useState(false);
  const [isFinishingReset, setIsFinishingReset] = useState(false);

  useEffect(() => {
    const prefilled = searchParams.get('email') ?? mockAuthService.getRememberedEmail();
    if (prefilled) {
      setEmail(prefilled);
      setRemember(true);
    }
  }, [searchParams]);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 450);
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    let hasErr = false;
    if (!email) { setEmailError('Username is required.'); hasErr = true; }
    if (pin.length < 5) { setPinError('PIN must be at least 5 characters.'); hasErr = true; }
    if (hasErr) { triggerShake(); return; }

    setEmailError('');
    setPinError('');
    setAuthError('');
    setLoading(true);

    try {
      const user = await mockAuthService.unlockWorkspace(email, pin);
      if (remember) {
        mockAuthService.setRememberedEmail(email);
      } else {
        mockAuthService.clearRememberedEmail();
      }
      setSuccess(true);
      setTimeout(() => {
        if (user.isAdmin) {
          router.push('/app/admin/dashboard');
        } else {
          router.push('/app/files');
        }
      }, 800);
    } catch (err: any) {
      setAuthError(err?.message ?? 'Invalid credentials. Please try again.');
      setPinError('Incorrect PIN');
      setPin('');
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', animation: 'fadeInUp 0.4s ease' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'rgba(34,197,94,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#166534', marginBottom: 8 }}>Workspace Unlocked!</h3>
        <p style={{ fontSize: 13, color: '#4b5563' }}>Redirecting you to your files…</p>
      </div>
    );
  }

  if (renewedPin) {
    // STEP 1: Show the OTP to the user
    if (forgotStep === 'show_code') {
      return (
        <div style={{ textAlign: 'center', padding: '24px 0', animation: 'fadeInUp 0.4s ease' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>Reset Code Issued</h3>
          <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 16, lineHeight: 1.6 }}>Your temporary reset code is shown below. Copy it and keep it safe. It expires in <strong>15 minutes</strong>.</p>
          <div style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px', marginBottom: 24, fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <span>{renewedPin}</span>
            <button onClick={() => { navigator.clipboard.writeText(renewedPin); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ background: copied ? '#10b981' : 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: copied ? '#fff' : '#64748b', borderRadius: 6, transition: 'all 0.2s', transform: copied ? 'scale(1.1)' : 'none' }} title="Copy Code">
              {copied ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
            </button>
          </div>
          <button onClick={() => setForgotStep('verify')} style={{ width: '100%', padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 700, background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
            Continue to Verify Code
          </button>
        </div>
      );
    }

    // STEP 2: Verify the OTP
    if (forgotStep === 'verify') {
      return (
        <div style={{ animation: 'fadeInUp 0.3s ease', textAlign: 'left' }}>
          <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 8, marginTop: 0 }}>Verify Reset Code</h3>
          <p style={{ fontSize: 13, color: '#475569', marginBottom: 20, lineHeight: 1.6 }}>Enter the 6-digit reset code we just gave you to confirm your identity.</p>
          <div style={{ marginBottom: 20 }}>
            <SixDigitPin value={forgotVerifyInput} onChange={v => { setForgotVerifyInput(v); setForgotVerifyError(''); }} showPin={true} onToggleShow={() => {}} error={forgotVerifyError} shake={!!forgotVerifyError} />
            {forgotVerifyError && <div style={{ color: '#ef4444', fontSize: 13, marginTop: 6, textAlign: 'center', fontWeight: 600 }}>{forgotVerifyError}</div>}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => { setForgotStep('show_code'); setForgotVerifyInput(''); }} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Go Back</button>
            <button
              disabled={forgotVerifyInput.length < 6 || isFinishingReset}
              onClick={async () => {
                setIsFinishingReset(true);
                try {
                  await mockAuthService.verifyResetCode(email, forgotVerifyInput);
                  setForgotStep('new_password');
                } catch (err: any) {
                  setForgotVerifyError(err.message || 'Incorrect code.');
                } finally {
                  setIsFinishingReset(false);
                }
              }}
              style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: forgotVerifyInput.length === 6 ? '#0f172a' : '#94a3b8', color: '#fff', fontWeight: 600, cursor: forgotVerifyInput.length === 6 ? 'pointer' : 'not-allowed' }}
            >
              {isFinishingReset ? 'Verifying...' : 'Verify Code'}
            </button>
          </div>
        </div>
      );
    }

    // STEP 3: Set new password
    if (forgotStep === 'new_password') {
      return (
        <div style={{ animation: 'fadeInUp 0.3s ease', textAlign: 'left' }}>
          <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 8, marginTop: 0 }}>Set New Password</h3>
          <p style={{ fontSize: 13, color: '#475569', marginBottom: 20, lineHeight: 1.6 }}>Create a new password for your account. Must be at least 6 characters with 1 special character (e.g. @, !, #).</p>
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', border: `1.5px solid ${forgotNewPasswordError ? '#ef4444' : 'var(--border)'}`, borderRadius: 12, background: '#f8fafc', overflow: 'hidden' }}>
              <input
                type={showForgotNewPassword ? 'text' : 'password'}
                value={forgotNewPassword}
                onChange={e => { setForgotNewPassword(e.target.value); setForgotNewPasswordError(''); }}
                placeholder="Enter new password"
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', padding: '14px', fontSize: 15, color: '#0f172a', fontFamily: 'inherit' }}
              />
              <button type="button" onClick={() => setShowForgotNewPassword(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 14px', color: '#94a3b8' }}>
                {showForgotNewPassword ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
              </button>
            </div>
            {forgotNewPasswordError && <div style={{ color: '#ef4444', fontSize: 13, marginTop: 6, fontWeight: 500 }}>{forgotNewPasswordError}</div>}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setForgotStep('verify')} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Go Back</button>
            <button
              disabled={isFinishingReset}
              onClick={async () => {
                const specialCharRegex = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/;
                if (forgotNewPassword.length < 6 || !specialCharRegex.test(forgotNewPassword)) {
                  setForgotNewPasswordError('Password must be at least 6 characters and include one special character.');
                  return;
                }
                setIsFinishingReset(true);
                try {
                  await mockAuthService.setResetPassword(email, forgotVerifyInput, forgotNewPassword);
                  // Auto-login with new password
                  await mockAuthService.login(email, forgotNewPassword);
                  location.href = '/app/files';
                } catch (err: any) {
                  setForgotNewPasswordError(err.message || 'Failed to set password.');
                } finally {
                  setIsFinishingReset(false);
                }
              }}
              style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: isFinishingReset ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}
            >
              {isFinishingReset ? 'Saving...' : 'Set Password & Login'}
            </button>
          </div>
        </div>
      );
    }
  }

  return (
    <form onSubmit={handleUnlock} noValidate style={{ animation: 'fadeInUp 0.3s ease' }}>
      {/* Username field */}
      <div style={{ marginBottom: 20 }}>
        <label htmlFor="unlock-email" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>
          Local Identifier (Username)
        </label>
        <div style={{
          display: 'flex', alignItems: 'center',
          border: `1.5px solid ${emailError ? '#ef4444' : 'var(--border)'}`,
          borderRadius: 12, background: '#f8fafc',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
          onFocusCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = emailError ? '#ef4444' : '#818cf8'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 3px rgba(129,140,248,0.15)'; }}
          onBlurCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = emailError ? '#ef4444' : 'var(--border)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
        >
          <span style={{ paddingLeft: 14, color: '#94a3b8', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </span>
          <input
            id="unlock-email"
            type="text"
            value={email}
            placeholder="Enter your username"
            onChange={e => { setEmail(e.target.value.toLowerCase()); if (emailError) setEmailError(''); }}
            autoComplete="username"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              padding: '13px 12px', fontSize: 14, color: '#0f172a', fontFamily: 'inherit',
            }}
          />
        </div>
        {emailError && <p style={{ marginTop: 4, fontSize: 12, color: '#ef4444' }}>{emailError}</p>}
      </div>

      {/* Password field */}
      <div style={{ marginBottom: 4 }}>
        <label htmlFor="unlock-password" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>
          Password
        </label>
        <div style={{
          display: 'flex', alignItems: 'center',
          border: `1.5px solid ${pinError ? '#ef4444' : 'var(--border)'}`,
          borderRadius: 12, background: '#f8fafc', overflow: 'hidden',
          boxShadow: shake ? '0 0 0 3px rgba(239,68,68,0.12)' : 'none',
          animation: shake ? 'shake 0.4s ease' : 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
          onFocusCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = pinError ? '#ef4444' : '#818cf8'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 3px rgba(129,140,248,0.15)'; }}
          onBlurCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = pinError ? '#ef4444' : 'var(--border)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
        >
          <span style={{ paddingLeft: 14, color: '#94a3b8', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </span>
          <input
            id="unlock-password"
            type={showPin ? "text" : "password"}
            value={pin}
            placeholder="Enter your password"
            onChange={e => { setPin(e.target.value); if (pinError) setPinError(''); if (authError) setAuthError(''); }}
            autoComplete="current-password"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              padding: '13px 12px', fontSize: 14, color: '#0f172a', fontFamily: 'inherit',
            }}
          />
          <button
            type="button"
            onClick={() => setShowPin(s => !s)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 14px', color: '#94a3b8', display: 'flex', alignItems: 'center' }}
          >
            {showPin ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
            )}
          </button>
        </div>
        {pinError && <p style={{ marginTop: 4, fontSize: 12, color: '#ef4444' }}>{pinError}</p>}
      </div>

      {/* Auth error */}
      {authError && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 16,
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#dc2626', fontSize: 13,
        }}>
          {authError}
        </div>
      )}

      {/* Remember + Forgot PIN row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, marginTop: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#475569' }}>
          <input
            type="checkbox"
            checked={remember}
            onChange={e => setRemember(e.target.checked)}
            style={{ width: 15, height: 15, accentColor: '#4f46e5', cursor: 'pointer' }}
          />
          Remember this device
        </label>
        <button
          type="button"
          onClick={async () => {
            if (!email) {
              setEmailError('Please enter your username first to request a PIN reset.');
              triggerShake();
              return;
            }
            try {
              setLoading(true);
              const newPin = await mockAuthService.forgotAccount(email);
              setRenewedPin(newPin);
            } catch (err: any) {
              setAuthError(err.message || 'Failed to request PIN renewal.');
            } finally {
              setLoading(false);
            }
          }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#4f46e5', fontWeight: 500 }}
        >
          Forgot PIN?
        </button>
      </div>

      {/* Primary CTA — Log In */}
      <button
        type="submit"
        id="unlock-workspace-btn"
        disabled={loading}
        style={{
          width: '100%', padding: '15px', borderRadius: 12,
          fontSize: 15, fontWeight: 700,
          background: loading ? '#a5b4fc' : 'linear-gradient(135deg, #4f46e5 0%, #2952d9 100%)',
          color: '#ffffff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: loading ? 'none' : '0 4px 20px rgba(79,70,229,0.3)',
          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          marginBottom: 24,
        }}
        onMouseEnter={e => { if(!loading) e.currentTarget.style.transform = 'translateY(-2px)'; }}
        onMouseLeave={e => { if(!loading) e.currentTarget.style.transform = 'none'; }}
        onMouseDown={e => { if(!loading) e.currentTarget.style.transform = 'scale(0.98)'; }}
        onMouseUp={e => { if(!loading) e.currentTarget.style.transform = 'translateY(-2px)'; }}
      >
        {loading ? (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>
            Logging in…
          </>
        ) : (
          <>
            Log In
          </>
        )}
      </button>

      {/* Or divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>or</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {/* Secondary CTA — Create Local Profile */}
      <button
        type="button"
        id="create-local-profile-btn"
        onClick={onSwitchToSignup}
        style={{
          width: '100%', padding: '14px', borderRadius: 12,
          fontSize: 15, fontWeight: 600,
          background: 'var(--bg-card)', color: '#1e293b',
          border: '1.5px solid #e2e8f0', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onMouseEnter={e => { (e.currentTarget.style.borderColor = '#818cf8'); (e.currentTarget.style.color = '#4f46e5'); (e.currentTarget.style.transform = 'translateY(-1.5px)'); }}
        onMouseLeave={e => { (e.currentTarget.style.borderColor = 'var(--border)'); (e.currentTarget.style.color = '#1e293b'); (e.currentTarget.style.transform = 'none'); }}
        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
        onMouseUp={e => e.currentTarget.style.transform = 'translateY(-1.5px)'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
          <line x1="12" y1="14" x2="12" y2="20" />
          <line x1="9" y1="17" x2="15" y2="17" />
        </svg>
        Create Local Profile
      </button>
    </form>
  );
}



export default function UnlockWorkspacePage() {
  const [mode, setMode] = useState<'unlock' | 'signup'>('unlock');

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'stretch', justifyContent: 'center',
      background: '#f8fafc',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{
        display: 'flex', flex: 1, width: '100%',
        background: 'var(--bg-card)',
        overflow: 'hidden', position: 'relative'
      }}>
        {/* ── Left panel ──────────────────────────────────────────────── */}
        {/* Hidden below 820px (see .ds-login-left media query) — a decorative
            mesh visual isn't worth half the screen when it pushes the actual
            login form off-frame on a phone. */}
        <div className="ds-login-left" style={{
          flex: '0 0 50%',
          background: 'linear-gradient(160deg, #f5f3ff 0%, #e0e7ff 100%)',
          display: 'flex', flexDirection: 'column',
          position: 'relative', overflow: 'hidden',
          padding: '64px 48px 120px',
        }}>
          {/* Top-left dot grid decoration */}
          <div style={{
            position: 'absolute', top: 32, left: 32, width: 60, height: 80,
            backgroundImage: 'radial-gradient(#cbd5e1 2px, transparent 2px)',
            backgroundSize: '12px 12px', opacity: 0.8
          }} />

          {/* Center content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
            <div style={{ marginBottom: 24 }}>
              <DocuSyncLogo size={88} />
            </div>

            <h1 style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', marginBottom: 16, textAlign: 'center' }}>
              Login to <span style={{ color: '#4f46e5' }}>DocuSync</span>
            </h1>

            {/* shield divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', marginBottom: 20, width: 120 }}>
              <div style={{ flex: 1, height: 1.5, background: 'rgba(79,70,229,0.2)' }} />
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <div style={{ flex: 1, height: 1.5, background: 'rgba(79,70,229,0.2)' }} />
            </div>

            <p style={{ fontSize: 15, color: '#334155', lineHeight: 1.6, textAlign: 'center', maxWidth: 300, fontWeight: 500 }}>
              A decentralized collaborative workspace powered by peer-to-peer synchronization.
              Your files remain under your control with no centralized cloud dependency.
            </p>
          </div>

          {/* ── Pristine Animated DNA / Network Mesh Background (No Text) ── */}
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes spinRingSlow {
              from { transform: translate(-50%, -50%) rotate(0deg); }
              to { transform: translate(-50%, -50%) rotate(360deg); }
            }
            @keyframes spinRingReverse {
              from { transform: translate(-50%, -50%) rotate(360deg); }
              to { transform: translate(-50%, -50%) rotate(0deg); }
            }
          `}} />

          {/* Glowing Ambient Backdrop */}
          <div style={{
            position: 'absolute', top: '-15%', right: '-15%',
            width: 450, height: 450, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.22) 0%, transparent 70%)',
            filter: 'blur(50px)', zIndex: 0, pointerEvents: 'none'
          }} />
          <div style={{
            position: 'absolute', bottom: '-10%', left: '-10%',
            width: 500, height: 500, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(168,85,247,0.18) 0%, transparent 70%)',
            filter: 'blur(60px)', zIndex: 0, pointerEvents: 'none'
          }} />

          {/* Rotating Concentric Orbital Rings */}
          <div style={{
            position: 'absolute', top: '48%', left: '50%',
            width: 440, height: 440, borderRadius: '50%',
            border: '1.5px dashed rgba(99,102,241,0.15)',
            pointerEvents: 'none', zIndex: 0,
            animation: 'spinRingSlow 55s linear infinite'
          }} />
          <div style={{
            position: 'absolute', top: '48%', left: '50%',
            width: 600, height: 600, borderRadius: '50%',
            border: '1px solid rgba(99,102,241,0.08)',
            pointerEvents: 'none', zIndex: 0,
            animation: 'spinRingReverse 75s linear infinite'
          }} />

          {/* Animated P2P Sync Mesh — see AnimatedSyncMesh above */}
          <AnimatedSyncMesh />

          {/* Bottom decorative wave */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, zIndex: 1, opacity: 0.6 }}>
            <svg viewBox="0 0 500 120" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
              <path d="M0,40 C150,100 350,0 500,40 L500,120 L0,120 Z" fill="rgba(199,210,254,0.4)" />
              <path d="M0,60 C200,120 400,20 500,60 L500,120 L0,120 Z" fill="rgba(165,180,252,0.3)" />
            </svg>
          </div>
        </div>

        {/* ── Right panel ─────────────────────────────────────────────── */}
        <div className="ds-login-right" style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '80px', background: 'var(--bg-card)',
        }}>
          <div style={{ width: '100%', maxWidth: 480 }}>
            {/* Header */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
              {mode === 'signup' && (
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: '#eef2ff', color: '#4f46e5',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" y1="8" x2="19" y2="14" />
                    <line x1="16" y1="11" x2="22" y2="11" />
                  </svg>
                </div>
              )}
              <div>
                <h2 style={{ fontSize: 26, fontWeight: 800, color: 'var(--t1)', lineHeight: 1.2, marginBottom: 6 }}>
                  {mode === 'signup' ? 'Create Local Profile' : 'Log In'}
                </h2>
                <p style={{ fontSize: 14, color: 'var(--t2)', lineHeight: 1.5 }}>
                  {mode === 'signup' ? 'Request a local profile to begin collaborating securely.' : 'Access your local encrypted workspace to begin collaborating securely.'}
                </p>
              </div>
            </div>

            <Suspense fallback={<div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Loading…</div>}>
              {mode === 'unlock' ? (
                <UnlockForm onSwitchToSignup={() => setMode('signup')} />
              ) : (
                <SignUpForm onBack={() => setMode('unlock')} />
              )}
            </Suspense>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        
        input:-webkit-autofill,
        input:-webkit-autofill:hover, 
        input:-webkit-autofill:focus, 
        input:-webkit-autofill:active {
            -webkit-box-shadow: 0 0 0 30px #f8fafc inset !important;
            -webkit-text-fill-color: #0f172a !important;
            border-radius: 0 !important;
        }

        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-6px)}
          40%{transform:translateX(6px)}
          60%{transform:translateX(-4px)}
          80%{transform:translateX(4px)}
        }
        @media (max-width: 820px) {
          /* The previous rule here ([style*="flex: 0 0 50%"]) matched on
             literal inline-style text — fragile, and it never actually
             fired: the form was still getting cut off on real phone
             widths. Target real classes instead. */
          .ds-login-left { display: none !important; }
          .ds-login-right { flex: 1 !important; padding: 40px 24px !important; }
        }
        @media (max-width: 420px) {
          .ds-login-right { padding: 28px 16px !important; }
        }
      `}} />
    </div>
  );
}
