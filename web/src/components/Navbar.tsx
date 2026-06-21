'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useTheme } from './ThemeProvider';
import { Sun, Moon } from 'lucide-react';

function LogoMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect width="28" height="28" rx="8" fill="#4f7df8"/>
      <path d="M7.5 10h13M7.5 14h9M7.5 18h9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="19.5" cy="18.5" r="4.5" fill="#22c55e"/>
    </svg>
  );
}

const NAV_LINKS = [
  { label: 'Features', href: '/home#features' },
  { label: 'Download', href: '/download' },
  { label: 'Metrics',  href: '/metrics' },
  { label: 'GitHub',   href: 'https://github.com/PaulJohnnn/DocuSync', external: true },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  return (
    <>
      <nav style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 clamp(32px, 6vw, 96px)',
        background: 'var(--bg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--b1)',
      }}>
        {/* LEFT — Logo */}
        <Link href="/home" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <LogoMark />
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)', letterSpacing: '-0.01em' }}>DocuSync</span>
        </Link>

        {/* CENTER — Nav links (desktop) */}
        <div className="nav-links-desktop" style={{ display: 'flex', gap: 32 }}>
          {NAV_LINKS.map(l => (
            <Link
              key={l.label}
              href={l.href}
              target={l.external ? '_blank' : undefined}
              rel={l.external ? 'noopener noreferrer' : undefined}
              className="nav-link"
              style={{ fontSize: 13, fontWeight: 500, color: 'var(--t2)', textDecoration: 'none', transition: 'color 0.15s' }}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* RIGHT — CTAs (desktop) */}
        <div className="nav-ctas-desktop" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={toggleTheme} style={{
            background: 'none', border: '1px solid var(--b2)', cursor: 'pointer',
            width: 36, height: 36, color: 'var(--t1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 8, transition: 'background 0.2s',
          }}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <Link href="/download" className="btn-ghost-nav" style={{
            display: 'inline-flex', alignItems: 'center',
            border: '1px solid var(--b2)',
            background: 'transparent', color: 'var(--t1)',
            borderRadius: 8, height: 36, padding: '0 16px',
            fontSize: 13, fontWeight: 500, textDecoration: 'none',
            transition: 'background 0.15s',
          }}>
            Download
          </Link>
          <Link href="/files" className="btn-accent-nav" style={{
            display: 'inline-flex', alignItems: 'center',
            background: 'linear-gradient(135deg, #4f7df8, #7c3aed)', color: '#fff',
            borderRadius: 8, height: 36, padding: '0 16px',
            fontSize: 13, fontWeight: 600, textDecoration: 'none',
            transition: 'opacity 0.15s, transform 0.15s',
            animation: 'pulse-glow 3s ease-in-out infinite',
          }}>
            Open App →
          </Link>
        </div>

        {/* Hamburger (mobile) */}
        <button
          onClick={() => setOpen(true)}
          className="hamburger-btn"
          style={{
            display: 'none',
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 6, color: 'var(--t1)',
          }}
          aria-label="Open menu"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </nav>

      {/* Mobile overlay */}
      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(10,14,24,0.98)',
          backdropFilter: 'blur(20px)',
          display: 'flex', flexDirection: 'column',
          padding: '24px clamp(20px,5vw,64px)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
            <Link href="/home" onClick={() => setOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
              <LogoMark />
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)' }}>DocuSync</span>
            </Link>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t2)', padding: 6 }}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M5 5l12 12M17 5L5 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {NAV_LINKS.map(l => (
              <Link
                key={l.label}
                href={l.href}
                target={l.external ? '_blank' : undefined}
                rel={l.external ? 'noopener noreferrer' : undefined}
                onClick={() => setOpen(false)}
                style={{
                  fontSize: 20, fontWeight: 600, color: 'var(--t1)',
                  textDecoration: 'none', padding: '14px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {l.label}
              </Link>
            ))}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 32 }}>
              <Link href="/download" onClick={() => setOpen(false)} style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                border: '1px solid var(--b2)', background: 'transparent',
                color: 'var(--t1)', borderRadius: 10, height: 48,
                fontSize: 15, fontWeight: 500, textDecoration: 'none',
              }}>Download</Link>
              <Link href="/files" onClick={() => setOpen(false)} style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                background: 'linear-gradient(135deg, #4f7df8, #7c3aed)', color: '#fff', borderRadius: 10, height: 48,
                fontSize: 15, fontWeight: 600, textDecoration: 'none',
              }}>Open App →</Link>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .nav-links-desktop { display: none !important; }
          .nav-ctas-desktop  { display: none !important; }
          .hamburger-btn     { display: flex !important; }
        }
        .nav-link:hover      { color: var(--t1) !important; }
        .btn-ghost-nav:hover  { background: var(--b1) !important; }
        .btn-accent-nav:hover { opacity: 0.9 !important; transform: scale(1.02); }
      `}</style>
    </>
  );
}
