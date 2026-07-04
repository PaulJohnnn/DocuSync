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
    <circle cx="70" cy="70" r="18" fill="#22c55e" />
  </svg>
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

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        border: `1.5px solid ${error ? '#ef4444' : '#e2e8f0'}`,
        borderRadius: 12, background: '#ffffff', padding: '11px 14px',
        cursor: 'text', gap: 10,
        boxShadow: error ? '0 0 0 3px rgba(239,68,68,0.12)' : undefined,
        animation: shake ? 'shake 0.4s ease' : undefined,
        transition: 'border-color 0.2s',
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
                border: `1.5px solid ${filled ? 'rgba(79,70,229,0.3)' : 'rgba(0,0,0,0.08)'}`,
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

  useEffect(() => {
    if (!success) return;
    
    // Initial check in case it was instantly approved (rare)
    mockAuthService.checkApprovalStatus(email).then(pin => {
      if (pin) setApprovedPin(pin);
    });

    const unsubscribe = mockAuthService.subscribeToDatabaseChanges(() => {
      mockAuthService.checkApprovalStatus(email).then(pin => {
        if (pin) setApprovedPin(pin);
      });
    });
    
    return unsubscribe;
  }, [success, email]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setEmailError('Email is required.');
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
        {approvedPin ? (
          <>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#166534', marginBottom: 8 }}>Request Approved!</h3>
            <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 16, lineHeight: 1.5 }}>
              Your profile has been approved by the administrator. Use the PIN below to log in.
            </p>
            <div style={{
              background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px',
              marginBottom: 24, fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '4px'
            }}>
              {approvedPin}
            </div>
          </>
        ) : (
          <>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#166534', marginBottom: 8 }}>Request Sent!</h3>
            <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 24, lineHeight: 1.5 }}>
              Your profile request for <strong>{email}</strong> has been logged locally. Please contact the device administrator to approve this profile.
            </p>
          </>
        )}
        <button
          onClick={onBack}
          style={{
            padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600,
            background: '#fff', color: '#1e293b', border: '1.5px solid #e2e8f0', cursor: 'pointer'
          }}
        >
          Back to Unlock
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSignup} noValidate style={{ animation: 'fadeInUp 0.3s ease' }}>
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>
          Desired Local Identifier (Email)
        </label>
        <div style={{
          display: 'flex', alignItems: 'center',
          border: `1.5px solid ${emailError ? '#ef4444' : '#e2e8f0'}`,
          borderRadius: 12, background: '#ffffff',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}>
          <span style={{ paddingLeft: 14, color: '#94a3b8', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </span>
          <input
            type="email"
            value={email}
            placeholder="Enter your email"
            onChange={e => { setEmail(e.target.value); if (emailError) setEmailError(''); }}
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
          color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: loading ? 'none' : '0 4px 20px rgba(79,70,229,0.40)',
          marginBottom: 16,
        }}
      >
        {loading ? 'Requesting...' : 'Request Local Profile'}
      </button>
      
      <button
        type="button"
        onClick={onBack}
        style={{
          width: '100%', padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 600,
          background: '#fff', color: '#64748b', border: 'none', cursor: 'pointer',
        }}
      >
        Back to Unlock
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
    if (!email) { setEmailError('Email is required.'); hasErr = true; }
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

  return (
    <form onSubmit={handleUnlock} noValidate>
      {/* Email field */}
      <div style={{ marginBottom: 20 }}>
        <label htmlFor="unlock-email" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>
          Local Identifier (Email)
        </label>
        <div style={{
          display: 'flex', alignItems: 'center',
          border: `1.5px solid ${emailError ? '#ef4444' : '#e2e8f0'}`,
          borderRadius: 12, background: '#ffffff',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
          onFocusCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = emailError ? '#ef4444' : '#818cf8'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 3px rgba(129,140,248,0.15)'; }}
          onBlurCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = emailError ? '#ef4444' : '#e2e8f0'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
        >
          <span style={{ paddingLeft: 14, color: '#94a3b8', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </span>
          <input
            id="unlock-email"
            type="email"
            value={email}
            placeholder="Enter your email"
            onChange={e => { setEmail(e.target.value); if (emailError) setEmailError(''); }}
            autoComplete="email"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              padding: '13px 12px', fontSize: 14, color: '#0f172a', fontFamily: 'inherit',
            }}
          />
        </div>
        {emailError && <p style={{ marginTop: 4, fontSize: 12, color: '#ef4444' }}>{emailError}</p>}
      </div>

      {/* PIN field */}
      <div style={{ marginBottom: 4 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>
          6-Digit Security PIN
        </label>
        <SixDigitPin
          value={pin}
          onChange={v => { setPin(v); if (pinError) setPinError(''); if (authError) setAuthError(''); }}
          showPin={showPin}
          onToggleShow={() => setShowPin(s => !s)}
          error={pinError}
          shake={shake}
        />
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
          onClick={() => setAuthError('PIN reset requires admin contact in local-first mode.')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#4f46e5', fontWeight: 500 }}
        >
          Forgot PIN?
        </button>
      </div>

      {/* Primary CTA — Unlock Workspace */}
      <button
        type="submit"
        id="unlock-workspace-btn"
        disabled={loading}
        style={{
          width: '100%', padding: '15px', borderRadius: 12,
          fontSize: 15, fontWeight: 700,
          background: loading ? '#a5b4fc' : 'linear-gradient(135deg, #4f46e5 0%, #2952d9 100%)',
          color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: loading ? 'none' : '0 4px 20px rgba(79,70,229,0.40)',
          transition: 'all 0.2s', marginBottom: 16,
          letterSpacing: '0.01em',
        }}
        onMouseEnter={e => { if (!loading) (e.currentTarget.style.transform = 'translateY(-1px)'); }}
        onMouseLeave={e => { (e.currentTarget.style.transform = 'translateY(0)'); }}
      >
        {loading ? (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>
            Unlocking…
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Unlock Workspace
          </>
        )}
      </button>

      {/* Or divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>or</span>
        <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
      </div>

      {/* Secondary CTA — Create Local Profile */}
      <button
        type="button"
        id="create-local-profile-btn"
        onClick={onSwitchToSignup}
        style={{
          width: '100%', padding: '14px', borderRadius: 12,
          fontSize: 15, fontWeight: 600,
          background: '#fff', color: '#1e293b',
          border: '1.5px solid #e2e8f0', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => { (e.currentTarget.style.borderColor = '#818cf8'); (e.currentTarget.style.color = '#4f46e5'); }}
        onMouseLeave={e => { (e.currentTarget.style.borderColor = '#e2e8f0'); (e.currentTarget.style.color = '#1e293b'); }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
          <line x1="12" y1="14" x2="12" y2="20" />
          <line x1="9" y1="17" x2="15" y2="17" />
        </svg>
        Create Local Profile
      </button>

      {/* Trust footer */}
      <div style={{
        marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        fontSize: 11, color: '#94a3b8',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        Private &bull; Decentralized &bull; Local-First
      </div>
    </form>
  );
}

// ── Hint card (shows mock credentials) ────────────────────────────────────
const HintCard: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      position: 'fixed', bottom: 20, left: 20, zIndex: 100,
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
      boxShadow: '0 4px 20px rgba(0,0,0,0.1)', overflow: 'hidden',
      maxWidth: 280, fontSize: 12,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '8px 14px', background: '#f8fafc', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 12, fontWeight: 600, color: '#4f46e5',
        }}
      >
        <span>🧪 Mock Credentials (DEV)</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9' }}>
          <div style={{ marginBottom: 6 }}>
            <strong style={{ color: '#64748b' }}>User:</strong>
            <div style={{ fontFamily: 'monospace', background: '#f8fafc', padding: '4px 8px', borderRadius: 6, marginTop: 3 }}>
              alice@docusync.local / PIN: 123456
            </div>
          </div>
          <div>
            <strong style={{ color: '#64748b' }}>Admin:</strong>
            <div style={{ fontFamily: 'monospace', background: '#f8fafc', padding: '4px 8px', borderRadius: 6, marginTop: 3 }}>
              admin / PIN: admin
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

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
        background: '#ffffff',
        overflow: 'hidden', position: 'relative'
      }}>
        {/* ── Left panel ──────────────────────────────────────────────── */}
        <div style={{
          flex: '0 0 50%',
          background: 'linear-gradient(160deg, #f5f3ff 0%, #e0e7ff 100%)',
          display: 'flex', flexDirection: 'column',
          position: 'relative', overflow: 'hidden',
          padding: '64px 48px 48px',
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

          {/* Bottom decorative wave */}
          <div style={{ position: 'absolute', bottom: 60, left: 0, right: 0, height: 120, zIndex: 1, opacity: 0.6 }}>
            <svg viewBox="0 0 500 120" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
              <path d="M0,40 C150,100 350,0 500,40 L500,120 L0,120 Z" fill="rgba(199,210,254,0.4)" />
              <path d="M0,60 C200,120 400,20 500,60 L500,120 L0,120 Z" fill="rgba(165,180,252,0.3)" />
            </svg>
          </div>

          {/* Bottom features row */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            borderTop: '1px solid rgba(148,163,184,0.2)', paddingTop: 20,
            zIndex: 10,
          }}>
            {[
              { icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', title: 'Private', sub: 'Your data stays local', color: '#4f46e5' },
              { icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75', title: 'Decentralized', sub: 'No central server', color: '#0284c7' },
              { icon: 'M18 8A3 3 0 1 0 18 2a3 3 0 0 0 0 6zm-12 8A3 3 0 1 0 6 10a3 3 0 0 0 0 6zm12 8A3 3 0 1 0 18 16a3 3 0 0 0 0 6z M8.5 11.5l7-4 M8.5 14.5l7 4', title: 'Peer-to-Peer', sub: 'Direct device sync', color: '#4f46e5' },
            ].map(f => (
              <div key={f.title} style={{ display: 'flex', gap: 8, flex: 1 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={f.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                  <path d={f.icon} />
                </svg>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{f.title}</div>
                  <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.3 }}>{f.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right panel ─────────────────────────────────────────────── */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '80px', background: '#ffffff',
        }}>
          <div style={{ width: '100%', maxWidth: 480 }}>
            {/* Header */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: '#eef2ff', color: '#4f46e5',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {mode === 'signup' ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" y1="8" x2="19" y2="14" />
                    <line x1="16" y1="11" x2="22" y2="11" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
              </div>
              <div>
                <h2 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', lineHeight: 1.2, marginBottom: 6 }}>
                  {mode === 'signup' ? 'Create Local Profile' : 'Unlock Workspace'}
                </h2>
                <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
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

      <HintCard />

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-6px)}
          40%{transform:translateX(6px)}
          60%{transform:translateX(-4px)}
          80%{transform:translateX(4px)}
        }
        @media(max-width:768px){
          [style*="flex: 0 0 50%"]{display:none!important}
        }
      `}} />
    </div>
  );
}
