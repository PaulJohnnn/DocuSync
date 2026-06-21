import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Lock, Key, ShieldCheck, AlertTriangle } from 'lucide-react';

export const VaultLoginPage: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'genesis' | 'locked'>('loading');
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [generatedPin, setGeneratedPin] = useState('');
  const [shake, setShake] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await window.docuSync.getVaultStatus();
        if (res.success && res.data) {
          if (res.data.isUnlocked) {
            navigate('/');
          } else if (!res.data.isRegistered) {
            setStatus('genesis');
            // Generate a random 8-digit PIN
            const pin = Math.floor(10000000 + Math.random() * 90000000).toString();
            setGeneratedPin(pin);
          } else {
            setStatus('locked');
            setNodeId(res.data.nodeId);
          }
        }
      } catch (err) {
        toast.error('Failed to query vault status.');
      }
    }
    checkStatus();
  }, [navigate]);

  const handleGenesis = async () => {
    try {
      const res = await window.docuSync.genesisInit(generatedPin);
      if (res.success && res.data) {
        toast.success(`Vault encrypted. Node ID: ${res.data.nodeId}`);
        navigate('/');
      } else {
        toast.error(res.error || 'Genesis failed.');
      }
    } catch (err) {
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
        toast.error('Invalid Cryptographic PIN');
      }
    } catch (err) {
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
        toast.success('Node wiped successfully.');
      } else {
        toast.error('Factory reset failed.');
      }
    } catch (err) {
      toast.error('Factory reset error.');
    }
  };

  if (status === 'loading') {
    return (
      <div className="ds-layout" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="ds-pulse">⏳</span> Loading Secure Vault...
      </div>
    );
  }

  return (
    <div className="ds-layout" style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      background: 'var(--bg-base)',
      height: '100vh',
      width: '100vw'
    }}>
      {/* Dynamic Shake Animation Class definition directly in style for convenience if global CSS doesn't have it */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px); }
          75% { transform: translateX(10px); }
        }
        .shake-anim {
          animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
        }
      `}</style>

      {status === 'genesis' && (
        <div className="ds-card" style={{ maxWidth: 440, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ background: 'rgba(79,125,248,0.15)', padding: 16, borderRadius: '50%', marginBottom: 24 }}>
            <ShieldCheck size={36} color="var(--accent)" />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Zero-Trust Identity Setup</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
            DocuSync operates entirely peer-to-peer. To secure your local repository, we have generated an encrypted vault for this node.
          </p>

          <div style={{ background: 'var(--bg-card-hover)', padding: '16px 32px', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 24 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.05em' }}>Your Security PIN</div>
            <div style={{ fontSize: 32, fontFamily: 'monospace', color: 'var(--text-primary)', letterSpacing: '0.1em', fontWeight: 'bold' }}>
              {generatedPin.slice(0, 4)}-{generatedPin.slice(4)}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', background: 'rgba(239, 68, 68, 0.1)', padding: 12, borderRadius: 6, border: '1px solid rgba(239, 68, 68, 0.3)', marginBottom: 32, textAlign: 'left' }}>
            <AlertTriangle size={18} color="var(--red)" style={{ marginTop: 2, marginRight: 12, flexShrink: 0 }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.5, margin: 0 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Write this down.</strong> Because there is no central server, there is absolutely no cloud password recovery if you lose this PIN.
            </p>
          </div>

          <button className="ds-btn ds-btn-primary" onClick={handleGenesis} style={{ width: '100%', padding: '12px 16px', fontSize: 15, justifyContent: 'center' }}>
            <Lock size={16} /> Secure Vault & Create Node
          </button>
        </div>
      )}

      {status === 'locked' && (
        <div className={`ds-card ${shake ? 'shake-anim' : ''}`} style={{ maxWidth: 400, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: 16, borderRadius: '50%', marginBottom: 24 }}>
            <Lock size={36} color="var(--green)" />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Vault Locked</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 32 }}>
            Welcome back, <strong style={{ color: 'var(--accent)' }}>{nodeId}</strong>
          </p>

          <div style={{ width: '100%', marginBottom: 24 }}>
            <input 
              type="password"
              placeholder="••••••••"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
              autoFocus
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'var(--bg-base)',
                border: `1px solid ${shake ? 'var(--red)' : 'var(--border)'}`,
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontSize: 24,
                fontFamily: 'monospace',
                letterSpacing: '0.2em',
                textAlign: 'center',
                outline: 'none',
                transition: 'border 0.2s',
              }}
              onKeyDown={(e) => { if(e.key === 'Enter') handleUnlock(); }}
            />
          </div>

          <button className="ds-btn ds-btn-primary" onClick={handleUnlock} style={{ width: '100%', padding: '12px 16px', fontSize: 15, justifyContent: 'center' }}>
            <Key size={16} /> Decrypt Local Repository
          </button>

          <button 
            onClick={() => setShowResetModal(true)}
            style={{ 
              marginTop: 16, 
              background: 'transparent', 
              border: 'none', 
              color: 'var(--text-muted)', 
              fontSize: 12, 
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Forgot PIN?
          </button>
        </div>
      )}

      {showResetModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="ds-card" style={{ maxWidth: 400, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', border: '1px solid var(--red)' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: 16, borderRadius: '50%', marginBottom: 24 }}>
              <AlertTriangle size={36} color="var(--red)" />
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Irreversible Factory Reset</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 32, lineHeight: 1.5 }}>
              Because DocuSync is offline-first, your PIN cannot be recovered. To use the app again, you must completely wipe this node. 
              <strong style={{ color: 'var(--red)', display: 'block', marginTop: 8 }}>ALL local documents and offline event logs will be permanently deleted. Are you sure?</strong>
            </p>
            <div style={{ display: 'flex', gap: 12, width: '100%' }}>
              <button className="ds-btn ds-btn-ghost" onClick={() => setShowResetModal(false)} style={{ flex: 1, justifyContent: 'center' }}>
                Cancel
              </button>
              <button className="ds-btn ds-btn-primary" onClick={handleFactoryReset} style={{ flex: 1, justifyContent: 'center', background: 'var(--red)', color: 'white', border: 'none' }}>
                WIPE NODE & START OVER
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VaultLoginPage;
