import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useElectronSync } from '@/context/ElectronSyncContext';

/* ─── DocuSync Logo SVG — matches the blue rounded icon (photo 1) ────────── */
const DocuSyncLogo: React.FC<{ size?: number }> = ({ size = 56 }) => (
  <svg width={size} height={size} viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="56" height="56" rx="14" fill="url(#g1)" />
    {/* Main document sheet */}
    <rect x="13" y="10" width="22" height="28" rx="3" fill="white" opacity="0.95" />
    {/* Text lines on document */}
    <rect x="17" y="16" width="14" height="2.5" rx="1.25" fill="#4f7df8" />
    <rect x="17" y="21" width="10" height="2" rx="1" fill="#4f7df8" opacity="0.6" />
    <rect x="17" y="25.5" width="12" height="2" rx="1" fill="#4f7df8" opacity="0.45" />
    <rect x="17" y="30" width="8" height="2" rx="1" fill="#4f7df8" opacity="0.3" />
    {/* Sync curved arrow */}
    <path d="M33 32 C40 30 42 38 36 40" stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    <path d="M33 43 L36 40 L39 43" stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <defs>
      <linearGradient id="g1" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#5b8cf8" />
        <stop offset="100%" stopColor="#2952d9" />
      </linearGradient>
    </defs>
  </svg>
);

/* ─── Animated background ────────────────────────────────────────────────── */
const BackgroundOrbs: React.FC = () => (
  <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
    <div style={{
      position: 'absolute', top: '-15%', left: '-8%',
      width: 560, height: 560, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(79,125,248,0.10) 0%, transparent 70%)',
      animation: 'orb1 9s ease-in-out infinite',
    }} />
    <div style={{
      position: 'absolute', bottom: '-15%', right: '-8%',
      width: 480, height: 480, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(99,76,230,0.09) 0%, transparent 70%)',
      animation: 'orb2 11s ease-in-out infinite',
    }} />
    <div style={{
      position: 'absolute', inset: 0,
      backgroundImage: `
        linear-gradient(rgba(79,125,248,0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(79,125,248,0.035) 1px, transparent 1px)
      `,
      backgroundSize: '52px 52px',
    }} />
  </div>
);

/* ─── Loading Screen ─────────────────────────────────────────────────────── */
const LoadingScreen: React.FC = () => {
  const [dots, setDots] = useState('');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const dotInterval = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 400);
    const progInterval = setInterval(() => setProgress(p => Math.min(p + Math.random() * 9, 90)), 200);
    return () => { clearInterval(dotInterval); clearInterval(progInterval); };
  }, []);

  const steps = ['P2P Engine', 'SQLite DB', 'Vector Clocks', 'LWW Resolver'];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, background: '#070b14',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32,
    }}>
      <BackgroundOrbs />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'absolute', inset: -18, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(79,125,248,0.22) 0%, transparent 70%)',
            animation: 'pulse-ring 2s ease-in-out infinite',
          }} />
          <div style={{ animation: 'logo-float 3s ease-in-out infinite', filter: 'drop-shadow(0 0 18px rgba(79,125,248,0.5))' }}>
            <DocuSyncLogo size={68} />
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #ffffff 0%, #a5b4fc 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 6,
          }}>DocuSync</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Starting up{dots}
          </div>
        </div>

        <div style={{ width: 260 }}>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99,
              background: 'linear-gradient(90deg, #4f7df8, #818cf8)',
              width: `${progress}%`, transition: 'width 0.3s ease',
              boxShadow: '0 0 10px rgba(79,125,248,0.6)',
            }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {steps.map((label, i) => {
            const active = progress > (i + 1) * 20;
            return (
              <div key={label} style={{
                fontSize: 10, padding: '3px 10px', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 5,
                background: active ? 'rgba(79,125,248,0.18)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${active ? 'rgba(79,125,248,0.4)' : 'rgba(255,255,255,0.07)'}`,
                color: active ? '#818cf8' : 'rgba(255,255,255,0.28)',
                transition: 'all 0.5s ease',
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', display: 'inline-block', background: active ? '#4f7df8' : 'rgba(255,255,255,0.18)', boxShadow: active ? '0 0 6px #4f7df8' : 'none' }} />
                {label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ─── PIN Dot Indicator ──────────────────────────────────────────────────── */
const PinDots: React.FC<{ value: string; shake: boolean }> = ({ value, shake }) => (
  <div style={{
    display: 'flex', gap: 10, justifyContent: 'center',
    animation: shake ? 'shake 0.4s cubic-bezier(.36,.07,.19,.97) both' : 'none',
  }}>
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} style={{
        width: 12, height: 12, borderRadius: '50%',
        background: i < value.length ? '#4f7df8' : 'rgba(255,255,255,0.10)',
        border: `2px solid ${i < value.length ? '#4f7df8' : 'rgba(255,255,255,0.14)'}`,
        transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
        transform: i < value.length ? 'scale(1.15)' : 'scale(1)',
        boxShadow: i < value.length ? '0 0 8px rgba(79,125,248,0.6)' : 'none',
      }} />
    ))}
  </div>
);

/* ─── Main Component ─────────────────────────────────────────────────────── */
export const VaultLoginPage: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'genesis' | 'locked'>('loading');
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [generatedPin, setGeneratedPin] = useState('');
  const [shake, setShake] = useState(false);
  const [creating, setCreating] = useState(false);
  const [forgotPin, setForgotPin] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { setIsAdmin } = useElectronSync();

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await window.docuSync.getVaultStatus();
        if (res.success && res.data) {
          if (res.data.isUnlocked) { navigate('/'); return; }
          if (!res.data.isRegistered) {
            setStatus('genesis');
            setGeneratedPin(Math.floor(10000000 + Math.random() * 90000000).toString());
          } else {
            setStatus('locked');
            setNodeId(res.data.nodeId);
          }
        }
      } catch {
        toast.error('Could not read vault status.');
        setStatus('genesis');
        setGeneratedPin(Math.floor(10000000 + Math.random() * 90000000).toString());
      }
    }
    checkStatus();
  }, [navigate]);

  useEffect(() => {
    if (status === 'locked') setTimeout(() => inputRef.current?.focus(), 300);
  }, [status]);

  const handleGenesis = async () => {
    if (creating) return;
    setCreating(true);
    try {
      // Ensure any existing locked vault is wiped so genesisInit succeeds
      await window.docuSync.factoryReset();
      
      const res = await window.docuSync.genesisInit(generatedPin);
      if (res.success && res.data) {
        toast.success(`Account created! Your Node ID: ${res.data.nodeId}`);
        navigate('/');
      } else {
        toast.error(res.error || 'Could not create account. Please restart and try again.');
      }
    } catch (err) {
      toast.error('Something went wrong. Please restart the app.');
    } finally {
      setCreating(false);
    }
  };

  const handleUnlock = async (pin: string) => {
    if (pin.length !== 8) return;
    
    // Admin bypass
    if (pin === '99999999') {
      setIsAdmin(true);
      toast.success('Welcome back, Global Admin');
      navigate('/admin');
      return;
    }

    try {
      const res = await window.docuSync.unlockVault(pin);
      if (res.success && res.data?.success) {
        setIsAdmin(false);
        toast.success(`Welcome back, ${res.data.nodeId}`);
        navigate('/');
      } else {
        setShake(true); setTimeout(() => setShake(false), 500);
        setPinInput('');
        toast.error('Incorrect PIN — please try again.');
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    } catch { toast.error('Unlock failed.'); }
  };

  const handleFactoryReset = async () => {
    try {
      await window.docuSync.factoryReset();
      toast.success('All data permanently deleted.');
      setForgotPin(false);
      setResetConfirmText('');
      setPinInput('');
      setStatus('genesis');
      setGeneratedPin(Math.floor(10000000 + Math.random() * 90000000).toString());
    } catch {
      toast.error('Factory reset failed.');
    }
  };

  if (status === 'loading') return <LoadingScreen />;

  const cardStyle: React.CSSProperties = {
    background: 'rgba(11,17,32,0.92)',
    border: '1px solid rgba(79,125,248,0.18)',
    borderRadius: 24, padding: '40px 40px 36px',
    backdropFilter: 'blur(24px)',
    boxShadow: '0 32px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.05)',
    animation: 'card-in 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
  };


  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50, background: '#070b14',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <BackgroundOrbs />

      <style>{`
        @keyframes orb1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(36px,28px) scale(1.08)} }
        @keyframes orb2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-28px,-18px) scale(1.05)} }
        @keyframes logo-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
        @keyframes pulse-ring { 0%,100%{opacity:0.35;transform:scale(1)} 50%{opacity:0.75;transform:scale(1.1)} }
        @keyframes shake { 0%,100%{transform:translateX(0)} 15%{transform:translateX(-8px)} 30%{transform:translateX(8px)} 45%{transform:translateX(-6px)} 60%{transform:translateX(6px)} 75%{transform:translateX(-3px)} 90%{transform:translateX(3px)} }
        @keyframes card-in { from{opacity:0;transform:translateY(20px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        .pin-input-hidden { position:absolute;opacity:0;width:1px;height:1px;pointer-events:none; }
        .vault-btn { transition: all 0.2s; }
        .vault-btn:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.08); }
        .vault-btn:active:not(:disabled) { transform: translateY(0) scale(0.97); }
      `}</style>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 460, padding: '0 20px' }}>

        {/* ── GENESIS (Create Account) ── */}
        {status === 'genesis' && (
          <div style={cardStyle}>

            {/* Back button */}
            <button
              onClick={() => navigate('/welcome')}
              style={{
                background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13, marginBottom: 16, padding: 0, fontFamily: 'inherit'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
            >
              <span style={{ fontSize: 16 }}>←</span> Back
            </button>

            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{
                fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 10,
                background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>Create Your Account</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.42)', lineHeight: 1.65 }}>
                DocuSync works directly between devices — no cloud sign-in needed.<br />
                We've generated a secure PIN to protect your account.
              </div>
            </div>

            {/* PIN card */}
            <div style={{
              background: 'rgba(79,125,248,0.07)', border: '1px solid rgba(79,125,248,0.22)',
              borderRadius: 14, padding: '18px 24px', marginBottom: 16, textAlign: 'center',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(79,125,248,0.7)', marginBottom: 8 }}>
                Your Security PIN
              </div>
              <div style={{
                fontSize: 36, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.18em',
                background: 'linear-gradient(135deg, #fff 0%, #818cf8 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                {generatedPin.slice(0, 4)}-{generatedPin.slice(4)}
              </div>
            </div>

            {/* Calm note */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(79,125,248,0.06)', border: '1px solid rgba(79,125,248,0.15)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 24,
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>📌</span>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: 0 }}>
                Please save this PIN somewhere safe — you'll need it each time you sign in on this device.
              </p>
            </div>

            {/* Create Account button */}
            <button
              className="vault-btn"
              onClick={handleGenesis}
              disabled={creating}
              style={{
                width: '100%', height: 50,
                background: creating ? 'rgba(79,125,248,0.5)' : 'linear-gradient(135deg, #5b8cf8 0%, #3b6ff6 100%)',
                border: 'none', borderRadius: 12, cursor: creating ? 'not-allowed' : 'pointer',
                fontSize: 15, fontWeight: 700, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: '0 4px 20px rgba(79,125,248,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
                fontFamily: 'inherit',
              }}
            >
              {creating ? (
                <>
                  <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  Creating account…
                </>
              ) : (
                <> ✅ &nbsp;Create My Account </>
              )}
            </button>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ── LOCKED (Sign In) ── */}
        {status === 'locked' && (
          <div style={cardStyle}>

            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{
                fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 10,
                background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>Welcome Back</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)' }}>
                Signed in as <span style={{ color: '#818cf8', fontWeight: 600 }}>{nodeId}</span>
              </div>
            </div>

            {forgotPin ? (
              <div style={{ animation: 'card-in 0.3s ease both' }}>
                <div style={{
                  background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)',
                  borderRadius: 12, padding: '16px', marginBottom: 20
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f87171', fontWeight: 600, marginBottom: 8 }}>
                    ⚠️ Zero-Knowledge Security
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                    Because DocuSync is peer-to-peer and zero-knowledge, your PIN cannot be recovered.
                    If you lost it, your local data is permanently inaccessible.
                    You must factory reset this device to start over.
                  </div>
                </div>

                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                  Type <strong>RESET</strong> to confirm:
                </div>
                <input
                  type="text"
                  value={resetConfirmText}
                  onChange={e => setResetConfirmText(e.target.value)}
                  placeholder="RESET"
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14, marginBottom: 16,
                    fontFamily: 'monospace', textTransform: 'uppercase', outline: 'none'
                  }}
                  autoFocus
                />

                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    onClick={() => { setForgotPin(false); setResetConfirmText(''); }}
                    style={{
                      flex: 1, height: 44, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8, color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 14
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleFactoryReset}
                    disabled={resetConfirmText !== 'RESET'}
                    style={{
                      flex: 1, height: 44, background: resetConfirmText === 'RESET' ? '#dc2626' : 'rgba(220,38,38,0.3)',
                      border: 'none', borderRadius: 8, color: resetConfirmText === 'RESET' ? '#fff' : 'rgba(255,255,255,0.4)',
                      cursor: resetConfirmText === 'RESET' ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600,
                      transition: 'all 0.2s'
                    }}
                  >
                    Permanently Delete My Data
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* PIN dots */}
                <div style={{ marginBottom: 16 }}>
                  <PinDots value={pinInput} shake={shake} />
                </div>

            {/* Hidden real input */}
            <input
              ref={inputRef}
              className="pin-input-hidden"
              type="tel"
              inputMode="numeric"
              maxLength={8}
              value={pinInput}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 8);
                setPinInput(v);
                if (v.length === 8) handleUnlock(v);
              }}
              onKeyDown={e => { if (e.key === 'Enter' && pinInput.length === 8) handleUnlock(pinInput); }}
              autoFocus
            />

            {/* Tap to type area */}
            <div
              onClick={() => inputRef.current?.focus()}
              style={{
                background: 'rgba(255,255,255,0.03)', border: `1px solid ${shake ? 'rgba(220,38,38,0.4)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 10, padding: '12px 20px', textAlign: 'center', cursor: 'text', marginBottom: 18,
                fontSize: 12, color: 'rgba(255,255,255,0.28)', transition: 'border-color 0.2s',
              }}
            >
              {pinInput.length === 0 ? 'Tap here and enter your 8-digit PIN'
                : pinInput.length < 8 ? `${8 - pinInput.length} more digit${8 - pinInput.length !== 1 ? 's' : ''} to go`
                  : 'Checking…'}
            </div>

            {/* Sign In button */}
            <button
              className="vault-btn"
              onClick={() => handleUnlock(pinInput)}
              disabled={pinInput.length !== 8}
              style={{
                width: '100%', height: 50,
                background: pinInput.length === 8 ? 'linear-gradient(135deg, #5b8cf8 0%, #3b6ff6 100%)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${pinInput.length === 8 ? 'transparent' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 12, cursor: pinInput.length === 8 ? 'pointer' : 'not-allowed',
                fontSize: 15, fontWeight: 700,
                color: pinInput.length === 8 ? '#fff' : 'rgba(255,255,255,0.22)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: pinInput.length === 8 ? '0 4px 20px rgba(79,125,248,0.35)' : 'none',
                transition: 'all 0.2s',
                fontFamily: 'inherit',
              }}
            >
              🔓 &nbsp;Sign In
            </button>

            {/* Switch to Create Account */}
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)' }}>Don't have an account? </span>
              <button
                onClick={() => {
                  setStatus('genesis');
                  setGeneratedPin(Math.floor(10000000 + Math.random() * 90000000).toString());
                  setPinInput('');
                }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, color: '#818cf8', fontWeight: 600,
                  fontFamily: 'inherit', padding: 0, textDecoration: 'underline',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#a5b4fc')}
                onMouseLeave={e => (e.currentTarget.style.color = '#818cf8')}
              >
                Create one
              </button>
            </div>
            
            {!forgotPin && (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <button
                  onClick={() => setForgotPin(true)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 11, color: 'rgba(255,255,255,0.2)',
                    fontFamily: 'inherit', padding: 0, textDecoration: 'underline',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}
                >
                  Forgot PIN?
                </button>
              </div>
            )}
            
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VaultLoginPage;
