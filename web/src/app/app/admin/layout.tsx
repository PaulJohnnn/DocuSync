'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import mockAuthService, { AuthUser } from '@/lib/mockAuthService';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const u = mockAuthService.getCurrentUser();
    setUser(u);
  }, []);

  if (!user) return null;

  if (!user.isAdmin) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0f172a', color: '#f8fafc', fontFamily: "'Inter', sans-serif"
      }}>
        <div style={{
          background: '#1e293b', border: '1px solid #334155', borderRadius: 20,
          padding: '40px', textAlign: 'center', maxWidth: 400
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 8, color: '#f1f5f9' }}>
            Admin access restricted
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 24 }}>
            Only the Global Admin can access this panel.
          </p>
          <button 
            onClick={() => router.push('/app/files')}
            style={{
              background: '#3b82f6', color: 'white', border: 'none',
              padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
            onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
          >
            Back to Files
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: '#0f172a', // Dark theme for Admin
      color: '#f8fafc',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {/* Top Navbar */}
      <header style={{
        height: 64, borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', background: '#020617',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
              <rect width="100" height="100" rx="24" fill="#4f7df8" />
              <rect x="22" y="28" width="56" height="12" rx="6" fill="white" />
              <rect x="22" y="48" width="56" height="12" rx="6" fill="white" />
              <rect x="22" y="68" width="32" height="12" rx="6" fill="white" />
              <circle cx="70" cy="70" r="18" fill="#22c55e" />
            </svg>
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>
            DocuSync Admin Console
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>
            Logged in as <strong style={{ color: '#fff' }}>{user.email}</strong>
          </span>
          <button
            onClick={() => {
              mockAuthService.logout();
              router.push('/app/login');
            }}
            style={{
              background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9',
              padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.2s'

            }}
            onMouseEnter={e => e.currentTarget.style.background = '#334155'}
            onMouseLeave={e => e.currentTarget.style.background = '#1e293b'}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main style={{ flex: 1, padding: '48px 32px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        {children}
      </main>
    </div>
  );
}
