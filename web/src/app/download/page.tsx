import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Download DocuSync',
  description: 'Download the hybrid P2P file synchronization engine for Desktop, Web, and Mobile.',
};

export default function DownloadPage() {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--t1)', minHeight: 'calc(100vh - 64px)', overflowX: 'hidden' }}>
      
      {/* ── HERO ── */}
      <section style={{
        padding: '80px clamp(20px,5vw,64px) 60px',
        textAlign: 'center',
        position: 'relative',
        backgroundImage: `
          linear-gradient(rgba(79,125,248,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(79,125,248,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
      }}>
        <div style={{
          position: 'absolute', top: '10%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 500, height: 300, borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(79,125,248,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <h1 style={{ fontSize: 'clamp(32px,5vw,48px)', fontWeight: 800, color: 'var(--t1)', marginBottom: 12 }}>
          Download DocuSync
        </h1>
        <p style={{ fontSize: 'clamp(16px,2vw,20px)', color: 'var(--t2)' }}>
          Choose your platform
        </p>
      </section>

      {/* ── DOWNLOAD CARDS ── */}
      <section style={{ padding: '0 clamp(20px,5vw,64px) 80px' }}>
        <div className="download-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24, maxWidth: 1080, margin: '0 auto' }}>
          
          {/* Card 1: Windows */}
          <div style={{
            background: 'var(--s1)', border: '1px solid var(--b1)',
            borderRadius: 20, padding: 32, display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ fontSize: 56, marginBottom: 20 }}>💻</div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--t1)', marginBottom: 8 }}>DocuSync for Windows</h2>
            <p style={{ fontSize: 13, color: '#4f7df8', fontWeight: 600, marginBottom: 24 }}>v1.0.0 · 2026</p>
            
            <p style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 16 }}>
              Full engine with SQLite database, native file system, and P2P WebSocket server.
            </p>
            <div style={{ fontSize: 13, color: 'var(--t3)', background: 'var(--s1)', padding: '8px 12px', borderRadius: 8, marginBottom: 32 }}>
              <strong style={{ color: 'var(--t2)' }}>Requirements:</strong> Windows 10/11 · 64-bit
            </div>
            
            <div style={{ marginTop: 'auto' }}>
              <Link href="https://github.com/PaulJohnnn/DocuSync/releases/download/v1.0.2/DocuSync-Setup-1.0.2.exe" target="_blank" rel="noopener noreferrer" className="btn-accent" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: '#4f7df8', color: '#fff', borderRadius: 10, height: 48,
                fontSize: 15, fontWeight: 600, textDecoration: 'none', transition: 'background 0.15s',
              }}>
                ⬇ Download .exe
              </Link>
              <p style={{ fontSize: 11, color: 'var(--t3)', textAlign: 'center', marginTop: 12 }}>
                Also available for macOS and Linux via source
              </p>
            </div>
          </div>

          {/* Card 2: Web */}
          <div style={{
            background: 'var(--s1)', border: '2px solid #22c55e',
            borderRadius: 20, padding: 32, display: 'flex', flexDirection: 'column', position: 'relative',
          }}>
            <div style={{ position: 'absolute', top: 16, right: 16, background: '#22c55e', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 99, padding: '3px 10px', letterSpacing: '0.06em' }}>
              ALWAYS UPDATED
            </div>
            <div style={{ fontSize: 56, marginBottom: 20 }}>🌐</div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--t1)', marginBottom: 8 }}>DocuSync Web</h2>
            <p style={{ fontSize: 13, color: '#22c55e', fontWeight: 600, marginBottom: 24 }}>No installation required</p>
            
            <p style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 16 }}>
              Access DocuSync directly from any browser. Uses localStorage backend.
            </p>
            <div style={{ fontSize: 13, color: 'var(--t3)', background: 'var(--s1)', padding: '8px 12px', borderRadius: 8, marginBottom: 32 }}>
              <strong style={{ color: 'var(--t2)' }}>Requirements:</strong> Modern Web Browser
            </div>
            
            <div style={{ marginTop: 'auto' }}>
              <Link href="https://docusync-pnc.vercel.app" target="_blank" rel="noopener noreferrer" className="btn-green" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: '#22c55e', color: '#fff', borderRadius: 10, height: 48,
                fontSize: 15, fontWeight: 600, textDecoration: 'none', transition: 'background 0.15s',
              }}>
                Open Web App →
              </Link>
            </div>
          </div>

          {/* Card 3: Mobile */}
          <div style={{
            background: 'var(--s1)', border: '1px solid var(--b1)',
            borderRadius: 20, padding: 32, display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ fontSize: 56, marginBottom: 20 }}>📱</div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--t1)', marginBottom: 8 }}>DocuSync Mobile</h2>
            <p style={{ fontSize: 13, color: '#8b5cf6', fontWeight: 600, marginBottom: 24 }}>Android & iOS</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
              <div style={{ background: 'var(--s2)', padding: 16, borderRadius: 12, border: '1px solid var(--b1)' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 8 }}>Step 1: Download Expo Go</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Link href="https://apps.apple.com/us/app/expo-go/id982107779" target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: 'center', fontSize: 12, background: 'var(--b1)', color: 'var(--t1)', padding: '6px 0', borderRadius: 6, textDecoration: 'none' }}>App Store</Link>
                  <Link href="https://play.google.com/store/apps/details?id=host.exp.exponent" target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: 'center', fontSize: 12, background: 'var(--b1)', color: 'var(--t1)', padding: '6px 0', borderRadius: 6, textDecoration: 'none' }}>Play Store</Link>
                </div>
              </div>
              <div style={{ background: 'var(--s2)', padding: 16, borderRadius: 12, border: '1px solid var(--b1)', textAlign: 'center' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 8 }}>Step 2: Scan QR Code</p>
                <div style={{ width: 80, height: 80, background: '#fff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, margin: '0 auto' }}>
                  <span style={{ color: '#000' }}>QR</span>
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: 'auto' }}>
              <p style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', lineHeight: 1.5 }}>
                Run <code style={{ background: 'var(--b1)', padding: '2px 6px', borderRadius: 4, color: 'var(--t1)' }}>npx expo start</code> in the mobile/ folder on your laptop
              </p>
            </div>
          </div>

        </div>
      </section>

      {/* ── SYSTEM REQUIREMENTS ── */}
      <section style={{ padding: '0 clamp(20px,5vw,64px) 100px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h3 style={{ fontSize: 20, fontWeight: 600, color: 'var(--t1)', marginBottom: 20, textAlign: 'center' }}>System Requirements</h3>
          
          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--b1)' }}>
            <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--s1)', borderBottom: '1px solid var(--b1)' }}>
                  <th style={{ padding: '16px 24px', fontSize: 12, fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Platform</th>
                  <th style={{ padding: '16px 24px', fontSize: 12, fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>OS</th>
                  <th style={{ padding: '16px 24px', fontSize: 12, fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>RAM</th>
                  <th style={{ padding: '16px 24px', fontSize: 12, fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Storage</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--s1)' }}>
                  <td style={{ padding: '16px 24px', fontSize: 14, color: 'var(--t1)', fontWeight: 500 }}>Desktop</td>
                  <td style={{ padding: '16px 24px', fontSize: 14, color: 'var(--t2)' }}>Windows 10+ / macOS 11+ / Linux</td>
                  <td style={{ padding: '16px 24px', fontSize: 14, color: 'var(--t2)' }}>4GB</td>
                  <td style={{ padding: '16px 24px', fontSize: 14, color: 'var(--t2)' }}>200MB</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--s1)' }}>
                  <td style={{ padding: '16px 24px', fontSize: 14, color: 'var(--t1)', fontWeight: 500 }}>Web</td>
                  <td style={{ padding: '16px 24px', fontSize: 14, color: 'var(--t2)' }}>Chrome / Firefox / Safari / Edge</td>
                  <td style={{ padding: '16px 24px', fontSize: 14, color: 'var(--t2)' }}>-</td>
                  <td style={{ padding: '16px 24px', fontSize: 14, color: 'var(--t2)' }}>-</td>
                </tr>
                <tr>
                  <td style={{ padding: '16px 24px', fontSize: 14, color: 'var(--t1)', fontWeight: 500 }}>Mobile</td>
                  <td style={{ padding: '16px 24px', fontSize: 14, color: 'var(--t2)' }}>Android 8+ / iOS 13+</td>
                  <td style={{ padding: '16px 24px', fontSize: 14, color: 'var(--t2)' }}>2GB</td>
                  <td style={{ padding: '16px 24px', fontSize: 14, color: 'var(--t2)' }}>50MB</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <style>{`
        .btn-accent:hover { background: #3d6ef0 !important; }
        .btn-green:hover { background: #16a34a !important; }
        
        @media (max-width: 900px) {
          .download-grid { grid-template-columns: 1fr !important; max-width: 480px !important; }
        }
      `}</style>
    </div>
  );
}
