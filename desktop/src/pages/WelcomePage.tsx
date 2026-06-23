import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Network } from 'lucide-react';

const WelcomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      padding: '2rem',
      textAlign: 'center'
    }}>
      <div style={{ marginBottom: '2rem' }}>
        <img src="/docusync-logo.svg" alt="DocuSync" width={80} height={80} />
      </div>
      
      <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem' }}>
        Welcome to DocuSync
      </h1>
      
      <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', maxWidth: 500, marginBottom: '3rem', lineHeight: 1.6 }}>
        A secure, fully decentralized file synchronization engine. No cloud servers, no subscriptions. Your data syncs directly between your devices.
      </p>

      <div style={{ display: 'flex', gap: '2rem', marginBottom: '4rem', textAlign: 'left', maxWidth: 600 }}>
        <div style={{ flex: 1 }}>
          <Shield size={24} color="var(--accent)" style={{ marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Local Encryption</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>Your vault is secured with a local PIN. Your files never leave your trusted devices.</p>
        </div>
        <div style={{ flex: 1 }}>
          <Network size={24} color="var(--green)" style={{ marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Peer-to-Peer</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>Sync directly with your other computers on the local network using WebSockets.</p>
        </div>
      </div>

      <button
        className="ds-btn ds-btn-primary"
        style={{ padding: '0.8rem 2.5rem', fontSize: '1.1rem' }}
        onClick={() => {
          localStorage.setItem('docusync_has_seen_welcome', 'true');
          navigate('/');
        }}
      >
        Get Started
      </button>
    </div>
  );
};

export default WelcomePage;
