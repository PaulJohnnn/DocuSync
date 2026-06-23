'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Network } from 'lucide-react';

export default function WelcomePage() {
  const router = useRouter();

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '2rem',
      textAlign: 'center'
    }}>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ width: 80, height: 80, borderRadius: 20, background: 'rgba(79,125,248,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', border: '1px solid rgba(79,125,248,0.2)' }}>
          <span style={{ fontSize: 40 }}>📄</span>
        </div>
      </div>
      
      <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--t1)', marginBottom: '1rem' }}>
        Welcome to DocuSync Web
      </h1>
      
      <p style={{ fontSize: '1.1rem', color: 'var(--t2)', maxWidth: 500, marginBottom: '3rem', lineHeight: 1.6 }}>
        A secure, fully decentralized file synchronization engine. No cloud servers, no subscriptions. Your data syncs directly between your devices.
      </p>

      <div style={{ display: 'flex', gap: '2rem', marginBottom: '4rem', textAlign: 'left', maxWidth: 600 }}>
        <div style={{ flex: 1 }}>
          <Shield size={24} color="#7c3aed" style={{ marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1rem', color: 'var(--t1)', marginBottom: '0.5rem' }}>Local Storage</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--t2)', lineHeight: 1.5 }}>Your files are persisted in your browser's local storage and never leave your trusted devices.</p>
        </div>
        <div style={{ flex: 1 }}>
          <Network size={24} color="#22c55e" style={{ marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1rem', color: 'var(--t1)', marginBottom: '0.5rem' }}>Peer-to-Peer</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--t2)', lineHeight: 1.5 }}>Sync directly with your other computers on the local network using WebSockets.</p>
        </div>
      </div>

      <button
        style={{
          padding: '0.8rem 2.5rem',
          fontSize: '1.1rem',
          background: '#4f7df8',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontWeight: 600,
          boxShadow: '0 4px 12px rgba(79,125,248,0.3)',
        }}
        onClick={() => {
          localStorage.setItem('docusync_has_seen_welcome', 'true');
          router.push('/app/files');
        }}
      >
        Get Started
      </button>
    </div>
  );
}
