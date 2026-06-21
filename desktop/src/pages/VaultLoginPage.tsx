import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

/* ─── DocuSync Logo SVG (matches the blue icon) ─────────────────────────── */
const DocuSyncLogo: React.FC<{ size?: number }> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="12" fill="url(#logoGrad)" />
    {/* Document layers */}
    <rect x="10" y="13" width="20" height="24" rx="3" fill="rgba(255,255,255,0.25)" />
    <rect x="13" y="10" width="20" height="24" rx="3" fill="rgba(255,255,255,0.45)" />
    <rect x="16" y="7" width="20" height="24" rx="3" fill="white" />
    {/* Lines on top document */}
    <rect x="20" y="14" width="12" height="2" rx="1" fill="#4f7df8" />
    <rect x="20" y="18" width="9" height="2" rx="1" fill="#4f7df8" opacity="0.7" />
    <rect x="20" y="22" width="11" height="2" rx="1" fill="#4f7df8" opacity="0.5" />
    {/* Sync arrows */}
    <path d="M30 26 Q36 26 36 32 Q36 38 30 38" stroke="#4f7df8" strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M27 35 L30 38 L27 41" stroke="#4f7df8" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <defs>
      <linearGradient id="logoGrad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#3b6ff6" />
        <stop offset="100%" stopColor="#1a47d4" />
      </linearGradient>
    </defs>
  </svg>
);

/* ─── Animated background orbs ──────────────────────────────────────────── */
const BackgroundOrbs: React.FC = () => (
  <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
    <div style={{
      position: 'absolute', top: '-20%', left: '-10%',
      width: 600, height: 600, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(79,125,248,0.12) 0%, transparent 70%)',
      animation: 'orb1 8s ease-in-out infinite',
    }} />
    <div style={{
      position: 'absolute', bottom: '-20%', right: '-10%',
      width: 500, height: 500, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(124,58,237,0.10) 0%, transparent 70%)',
      animation: 'orb2 10s ease-in-out infinite',
    }} />
    <div style={{
      position: 'absolute', top: '40%', right: '20%',
      width: 300, height: 300, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(79,125,248,0.07) 0%, transparent 70%)',
      animation: 'orb3 12s ease-in-out infinite',
    }} />
    {/* Grid pattern */}
    <div style={{
      position: 'absolute', inset: 0,
      backgroundImage: `
        linear-gradient(rgba(79,125,248,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(79,125,248,0.04) 1px, transparent 1px)
      `,
      backgroundSize: '48px 48px',
    }} />
  </div>
);

/* ─── Loading Screen ─────────────────────────────────────────────────────── */
const LoadingScreen: React.FC = () => {
  const [dots, setDots] = useState('');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const dotInterval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 400);
    const progInterval = setInterval(() => {
      setProgress(p => Math.min(p + Math.random() * 8, 90));
    }, 200);
    return () => { clearInterval(dotInterval); clearInterval(progInterval); };
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: '#070b14',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 32,
    }}>
      <BackgroundOrbs />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        {/* Pulsing logo */}
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'absolute', inset: -16,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(79,125,248,0.25) 0%, transparent 70%)',
            animation: 'pulse-ring 2s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', inset: -8,
            borderRadius: 20,
            border: '1px solid rgba(79,125,248,0.3)',
            animation: 'fade-ring 2s ease-in-out infinite',
          }} />
          <div style={{
            animation: 'logo-float 3s ease-in-out infinite',
            filter: 'drop-shadow(0 0 20px rgba(79,125,248,0.4))',
          }}>
            <DocuSyncLogo size={64} />
          </div>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #ffffff 0%, #a5b4fc 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            marginBottom: 6,
          }}>DocuSync</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Initializing Secure Vault{dots}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ width: 280 }}>
          <div style={{
            height: 3, background: 'rgba(255,255,255,0.08)',
            borderRadius: 99, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 99,
              background: 'linear-gradient(90deg, #4f7df8, #818cf8)',
              width: `${progress}%`,
              transition: 'width 0.3s ease',
              boxShadow: '0 0 10px rgba(79,125,248,0.6)',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em' }}>LOADING ENGINE</span>
            <span style={{ fontSize: 10, color: 'rgba(79,125,248,0.7)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(progress)}%</span>
          </div>
        </div>

        {/* Status chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {['P2P Engine', 'SQLite DB', 'Vector Clocks', 'LWW Resolver'].map((label, i) => (
            <div key={label} style={{
              fontSize: 10, padding: '3px 10px', borderRadius: 99,
              background: progress > (i + 1) * 20 ? 'rgba(79,125,248,0.2)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${progress > (i + 1) * 20 ? 'rgba(79,125,248,0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: progress > (i + 1) * 20 ? '#818cf8' : 'rgba(255,255,255,0.3)',
              transition: 'all 0.5s ease',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: progress > (i + 1) * 20 ? '#4f7df8' : 'rgba(255,255,255,0.2)',
                display: 'inline-block',
                boxShadow: progress > (i + 1) * 20 ? '0 0 6px #4f7df8' : 'none',
              }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ─── PIN Dot Display ────────────────────────────────────────────────────── */
const PinDots: React.FC<{ value: string; shake: boolean }> = ({ value, shake }) => (
  <div style={{
    display: 'flex', gap: 10, justifyContent: 'center',
    animation: shake ? 'shake 0.4s cubic-bezier(.36,.07,.19,.97) both' : 'none',
  }}>
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} style={{
        width: 12, height: 12, borderRadius: '50%',
        background: i < value.length ? '#4f7df8' : 'rgba(255,255,255,0.1)',
        border: `2px solid ${i < value.length ? '#4f7df8' : 'rgba(255,255,255,0.15)'}`,
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
  const [showResetModal, setShowResetModal] = useState(false);
  const [cardVisible, setCardVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await window.docuSync.getVaultStatus();
        if (res.success && res.data) {
          if (res.data.isUnlocked) {
            navigate('/');
            return;
          } else if (!res.data.isRegistered) {
            setStatus('genesis');
            const pin = Math.floor(10000000 + Math.random() * 90000000).toString();
            setGeneratedPin(pin);
          } else {
            setStatus('locked');
            setNodeId(res.data.nodeId);
          }
          setTimeout(() => setCardVisible(true), 50);
        }
      } catch {
        toast.error('Failed to query vault status.');
        setStatus('genesis');
        const pin = Math.floor(10000000 + Math.random() * 90000000).toString();
        setGeneratedPin(pin);
        setTimeout(() => setCardVisible(true), 50);
      }
    }
    checkStatus();
  }, [navigate]);

  // Auto-focus PIN input when locked screen appears
  useEffect(() => {
    if (status === 'locked' && cardVisible) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [status, cardVisible]);

  const handleGenesis = async () => {
    try {
      const res = await window.docuSync.genesisInit(generatedPin);
      if (res.success && res.data) {
        toast.success(`Vault created! Node: ${res.data.nodeId}`);
        navigate('/');
      } else {
        toast.error(res.error || 'Genesis failed.');
      }
    } catch {
      toast.error('Genesis init error.');
    }
  };

  const handleUnlock = async () => {
    if (pinInput.length !== 8) return;
    try {
      const res = await window.docuSync.unlockVault(pinInput);
      if (res.success && res.data?.success) {
        toast.success(`Welcome back, ${res.data.nodeId}`);
        navigate('/');
      } else {
        triggerShake();
        setPinInput('');
        toast.error('Invalid PIN — try again');
      }
    } catch {
      triggerShake();
      toast.error('Unlock error.');
    }
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleFactoryReset = async () => {
    try {
      const res = await window.docuSync.factoryReset();
      if (res.success) {
        setShowResetModal(false);
        setPinInput('');
        setStatus('genesis');
        const newPin = Math.floor(10000000 + Math.random() * 90000000).toString();
        setGeneratedPin(newPin);
        toast.success('Node wiped. A new identity has been created.');
      } else {
        toast.error('Factory reset failed.');
      }
    } catch {
      toast.error('Factory reset error.');
    }
  };

  // Show loading screen
  if (status === 'loading') return <LoadingScreen />;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: '#070b14',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <BackgroundOrbs />

      {/* Global animations */}
      <style>{`
        @keyframes orb1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(40px, 30px) scale(1.1); }
        }
        @keyframes orb2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-30px, -20px) scale(1.05); }
        }
        @keyframes orb3 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(20px, -40px); }
        }
        @keyframes logo-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes pulse-ring {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.08); }
        }
        @keyframes fade-ring {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-8px); }
          30% { transform: translateX(8px); }
          45% { transform: translateX(-6px); }
          60% { transform: translateX(6px); }
          75% { transform: translateX(-4px); }
          90% { transform: translateX(4px); }
        }
        @keyframes card-in {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pin-bounce {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        .vault-card {
          animation: card-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .pin-input-hidden {
          position: absolute;
          opacity: 0;
          width: 1px;
          height: 1px;
          pointer-events: none;
        }
      `}</style>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 480, padding: '0 24px' }}>

        {/* ── GENESIS SCREEN ── */}
        {status === 'genesis' && (
          <div className="vault-card" style={{
            background: 'rgba(13,20,38,0.9)',
            border: '1px solid rgba(79,125,248,0.2)',
            borderRadius: 24,
            padding: '40px 40px 36px',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}>
            {/* Logo + title */}
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{
                display: 'inline-flex', marginBottom: 20, position: 'relative',
                animation: 'logo-float 3s ease-in-out infinite',
                filter: 'drop-shadow(0 0 24px rgba(79,125,248,0.5))',
              }}>
                <div style={{
                  position: 'absolute', inset: -12, borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(79,125,248,0.2) 0%, transparent 70%)',
                  animation: 'pulse-ring 2.5s ease-in-out infinite',
                }} />
                <DocuSyncLogo size={60} />
              </div>
              <div style={{
                fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em',
                background: 'linear-gradient(135deg, #ffffff 0%, #a5b4fc 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                marginBottom: 8,
              }}>Zero-Trust Setup</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                DocuSync is fully peer-to-peer. No servers, no cloud.<br/>Your node identity is secured by this PIN.
              </div>
            </div>

            {/* PIN display */}
            <div style={{
              background: 'rgba(79,125,248,0.06)',
              border: '1px solid rgba(79,125,248,0.25)',
              borderRadius: 16, padding: '20px 24px',
              marginBottom: 20, textAlign: 'center',
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em',
                color: 'rgba(79,125,248,0.7)', marginBottom: 10,
              }}>Your Security PIN</div>
              <div style={{
                fontSize: 38, fontFamily: 'monospace', fontWeight: 700,
                letterSpacing: '0.15em',
                background: 'linear-gradient(135deg, #fff 0%, #818cf8 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                {generatedPin.slice(0, 4)}-{generatedPin.slice(4)}
              </div>
            </div>

            {/* Warning */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              background: 'rgba(220,38,38,0.08)',
              border: '1px solid rgba(220,38,38,0.2)',
              borderRadius: 12, padding: '12px 14px', marginBottom: 24,
            }}>
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⚠️</span>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, margin: 0 }}>
                <strong style={{ color: 'rgba(255,255,255,0.9)' }}>Write this down now.</strong> There is no cloud password recovery — your PIN is the only way to unlock this node.
              </p>
            </div>

            {/* CTA Button */}
            <button onClick={handleGenesis} style={{
              width: '100%', height: 50,
              background: 'linear-gradient(135deg, #4f7df8 0%, #3b6ff6 100%)',
              border: 'none', borderRadius: 12, cursor: 'pointer',
              fontSize: 15, fontWeight: 700, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 4px 20px rgba(79,125,248,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
              transition: 'all 0.2s',
              fontFamily: 'inherit',
            }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <span>🔐</span> Secure Vault &amp; Create Node
            </button>
          </div>
        )}

        {/* ── LOCKED SCREEN ── */}
        {status === 'locked' && (
          <div className="vault-card" style={{
            background: 'rgba(13,20,38,0.9)',
            border: '1px solid rgba(79,125,248,0.2)',
            borderRadius: 24,
            padding: '40px 40px 36px',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}>
            {/* Logo */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{
                display: 'inline-flex', marginBottom: 20, position: 'relative',
                animation: 'logo-float 3s ease-in-out infinite',
                filter: 'drop-shadow(0 0 24px rgba(79,125,248,0.5))',
              }}>
                <div style={{
                  position: 'absolute', inset: -12, borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(79,125,248,0.2) 0%, transparent 70%)',
                  animation: 'pulse-ring 2.5s ease-in-out infinite',
                }} />
                <DocuSyncLogo size={60} />
              </div>
              <div style={{
                fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em',
                background: 'linear-gradient(135deg, #ffffff 0%, #a5b4fc 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                marginBottom: 8,
              }}>Vault Locked</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
                Welcome back, <span style={{ color: '#818cf8', fontWeight: 600 }}>{nodeId}</span>
              </div>
            </div>

            {/* PIN dots */}
            <div style={{ marginBottom: 20 }}>
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
                if (v.length === 8) {
                  // Auto-submit when 8 digits entered
                  setTimeout(() => {
                    // trigger unlock with the new value directly
                    window.docuSync.unlockVault(v).then(res => {
                      if (res.success && res.data?.success) {
                        toast.success(`Welcome back, ${res.data.nodeId}`);
                        navigate('/');
                      } else {
                        setShake(true);
                        setTimeout(() => setShake(false), 500);
                        setPinInput('');
                        toast.error('Invalid PIN — try again');
                        setTimeout(() => inputRef.current?.focus(), 100);
                      }
                    });
                  }, 100);
                }
              }}
              onKeyDown={e => { if (e.key === 'Enter' && pinInput.length === 8) handleUnlock(); }}
              autoFocus
            />

            {/* Clickable PIN pad area */}
            <div
              onClick={() => inputRef.current?.focus()}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${shake ? 'rgba(220,38,38,0.5)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 12, padding: '14px 20px',
                textAlign: 'center', cursor: 'text', marginBottom: 20,
                fontSize: 12, color: 'rgba(255,255,255,0.3)',
                transition: 'border-color 0.2s',
              }}
            >
              {pinInput.length === 0
                ? 'Click here and type your 8-digit PIN'
                : pinInput.length < 8
                  ? `${8 - pinInput.length} digit${8 - pinInput.length !== 1 ? 's' : ''} remaining`
                  : 'Verifying…'}
            </div>

            {/* Unlock button */}
            <button
              onClick={handleUnlock}
              disabled={pinInput.length !== 8}
              style={{
                width: '100%', height: 50,
                background: pinInput.length === 8
                  ? 'linear-gradient(135deg, #4f7df8 0%, #3b6ff6 100%)'
                  : 'rgba(255,255,255,0.05)',
                border: `1px solid ${pinInput.length === 8 ? 'transparent' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 12, cursor: pinInput.length === 8 ? 'pointer' : 'not-allowed',
                fontSize: 15, fontWeight: 700,
                color: pinInput.length === 8 ? '#fff' : 'rgba(255,255,255,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: pinInput.length === 8 ? '0 4px 20px rgba(79,125,248,0.4)' : 'none',
                transition: 'all 0.2s',
                fontFamily: 'inherit',
              }}
            >
              🔓 Decrypt Local Repository
            </button>

            {/* Forgot PIN */}
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button
                onClick={() => setShowResetModal(true)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontSize: 12, color: 'rgba(255,255,255,0.3)',
                  textDecoration: 'underline', fontFamily: 'inherit',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
              >
                Forgot PIN?
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── FACTORY RESET MODAL ── */}
      {showResetModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: 'rgba(13,20,38,0.98)',
            border: '1px solid rgba(220,38,38,0.3)',
            borderRadius: 20, padding: '36px 32px',
            maxWidth: 420, width: '100%',
            boxShadow: '0 32px 64px rgba(0,0,0,0.8)',
            animation: 'card-in 0.3s ease both',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(220,38,38,0.12)',
                border: '1px solid rgba(220,38,38,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', fontSize: 24,
              }}>⚠️</div>
              <div style={{
                fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 12,
              }}>Irreversible Factory Reset</div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, margin: 0 }}>
                Since DocuSync is offline-first, your PIN cannot be recovered.
                <br />
                <strong style={{ color: '#ef4444' }}>ALL local documents and sync history will be permanently erased.</strong>
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowResetModal(false)}
                style={{
                  flex: 1, height: 46, borderRadius: 10, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600,
                  fontFamily: 'inherit', transition: 'all 0.2s',
                }}
              >Cancel</button>
              <button
                onClick={handleFactoryReset}
                style={{
                  flex: 1, height: 46, borderRadius: 10, cursor: 'pointer',
                  background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  border: 'none',
                  color: '#fff', fontSize: 13, fontWeight: 700,
                  fontFamily: 'inherit',
                  boxShadow: '0 4px 16px rgba(220,38,38,0.4)',
                }}
              >WIPE NODE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VaultLoginPage;
