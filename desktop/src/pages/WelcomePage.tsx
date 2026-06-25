import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Network, Zap } from 'lucide-react';

const WelcomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      padding: '2rem',
      textAlign: 'center',
      position: 'relative',
      overflowY: 'auto',
      overflowX: 'hidden'
    }}>
      {/* Background Glow Orbs */}
      <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: '40%', height: '40%', background: 'radial-gradient(circle, rgba(79,125,248,0.15) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(60px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-10%', right: '-5%', width: '50%', height: '50%', background: 'radial-gradient(circle, rgba(34,197,94,0.1) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(60px)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 800 }}>
        <div style={{ marginBottom: '2rem', animation: 'float 6s ease-in-out infinite' }}>
          <img src="/icon.png" alt="DocuSync" width={90} height={90} style={{ borderRadius: 24, boxShadow: '0 8px 32px rgba(79,125,248,0.3)' }} />
        </div>
        
        <h1 style={{ 
          fontSize: '3.5rem', 
          fontWeight: 800, 
          background: 'linear-gradient(135deg, #ffffff 0%, #818cf8 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '1rem',
          letterSpacing: '-0.03em',
          textShadow: '0 4px 30px rgba(129, 140, 248, 0.3)'
        }}>
          Welcome to DocuSync
        </h1>
        
        <p style={{ 
          fontSize: '1.25rem', 
          color: 'var(--text-secondary)', 
          maxWidth: 600, 
          marginBottom: '3.5rem', 
          lineHeight: 1.6,
          fontWeight: 500 
        }}>
          The ultimate decentralized workspace. Experience seamless, peer-to-peer file synchronization with zero cloud reliance. Secure, lightning-fast, and entirely yours.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '4rem', width: '100%', textAlign: 'left' }}>
          {/* Card 1 */}
          <div style={{ 
            background: 'rgba(255, 255, 255, 0.03)', 
            border: '1px solid rgba(255, 255, 255, 0.05)', 
            borderRadius: '16px', 
            padding: '1.5rem',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
            transition: 'transform 0.2s ease, background 0.2s ease',
            cursor: 'default'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(124, 58, 237, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
              <Shield size={20} color="#a78bfa" />
            </div>
            <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.5rem', fontWeight: 600 }}>Local Encryption</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>Your vault is secured with a local PIN. Your files never leave your devices.</p>
          </div>

          {/* Card 2 */}
          <div style={{ 
            background: 'rgba(255, 255, 255, 0.03)', 
            border: '1px solid rgba(255, 255, 255, 0.05)', 
            borderRadius: '16px', 
            padding: '1.5rem',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
            transition: 'transform 0.2s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(34, 197, 94, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
              <Network size={20} color="#4ade80" />
            </div>
            <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.5rem', fontWeight: 600 }}>Peer-to-Peer Sync</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>Sync directly with your other computers on the local network via WebSockets.</p>
          </div>
          
          {/* Card 3 */}
          <div style={{ 
            background: 'rgba(255, 255, 255, 0.03)', 
            border: '1px solid rgba(255, 255, 255, 0.05)', 
            borderRadius: '16px', 
            padding: '1.5rem',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
            transition: 'transform 0.2s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(56, 189, 248, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
              <Zap size={20} color="#7dd3fc" />
            </div>
            <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.5rem', fontWeight: 600 }}>Lightning Fast</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>Hybrid architecture with Vector Clocks and Delta Encoding ensures instant updates.</p>
          </div>
        </div>

        <button
          style={{ 
            padding: '1rem 3rem', 
            fontSize: '1.1rem',
            fontWeight: 600,
            background: 'linear-gradient(135deg, #4f7df8 0%, #3b5bdb 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(79,125,248,0.4)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 12px 28px rgba(79,125,248,0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(79,125,248,0.4)';
          }}
          onClick={() => {
            sessionStorage.setItem('docusync_has_seen_welcome_session', 'true');
            navigate('/');
          }}
        >
          Enter Workspace
        </button>
      </div>
      
      {/* CSS Animation for float */}
      <style>
        {`
          @keyframes float {
            0% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
            100% { transform: translateY(0px); }
          }
        `}
      </style>
    </div>
  );
};

export default WelcomePage;
