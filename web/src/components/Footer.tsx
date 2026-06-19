import Link from 'next/link';

function LogoMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
      <rect width="28" height="28" rx="7" fill="#4f7df8"/>
      <path d="M7 10h14M7 14h10M7 18h12" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="21" cy="18" r="3.5" fill="#22c55e"/>
    </svg>
  );
}

const FOOTER_LINKS = {
  App: [
    { label: 'Files',     href: '/' },
    { label: 'Editor',    href: '/editor/demo' },
    { label: 'Conflicts', href: '/conflicts' },
    { label: 'Metrics',   href: '/metrics' },
  ],
  Download: [
    { label: 'Windows',  href: '/download' },
    { label: 'Web App',  href: 'https://docusync-pnc.vercel.app', external: true },
    { label: 'Mobile',   href: 'https://expo.dev/go', external: true },
    { label: 'GitHub',   href: 'https://github.com/PaulJohnnn/DocuSync', external: true },
  ],
};

export default function Footer() {
  return (
    <footer style={{
      background: '#080c14',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      padding: 'clamp(32px,5vw,48px) clamp(20px,5vw,64px) 32px',
    }}>
      {/* Top row */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        flexWrap: 'wrap', gap: 40, marginBottom: 40,
      }}>
        {/* Brand */}
        <div>
          <Link href="/home" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 10 }}>
            <LogoMark />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#eef0f8' }}>DocuSync</span>
          </Link>
          <p style={{ fontSize: 12, color: '#4d5f85', maxWidth: 240, lineHeight: 1.6 }}>
            Hybrid P2P File Synchronization Engine.<br />
            BS CS Thesis · Pamantasan ng Cabuyao · 2026
          </p>
        </div>

        {/* Link columns */}
        <div style={{ display: 'flex', gap: 56, flexWrap: 'wrap' }}>
          {Object.entries(FOOTER_LINKS).map(([col, links]) => (
            <div key={col}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#4d5f85', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                {col}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {links.map(l => (
                  <Link
                    key={l.label}
                    href={l.href}
                    target={'external' in l && l.external ? '_blank' : undefined}
                    rel={'external' in l && l.external ? 'noopener noreferrer' : undefined}
                    style={{ fontSize: 13, color: '#7e8ba8', textDecoration: 'none', transition: 'color 0.15s' }}
                    className="footer-link"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom row */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingTop: 24,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 12,
      }}>
        <p style={{ fontSize: 12, color: '#3d4a65' }}>
          © 2026 Pamantasan ng Cabuyao · BS Computer Science · Paul John G. Palamara
        </p>
        <p style={{ fontSize: 12, color: '#3d4a65' }}>
          ISO/IEC 25010:2023 Compliant · 72/72 Tests Passed
        </p>
      </div>

      <style>{`.footer-link:hover { color: #eef0f8 !important; }`}</style>
    </footer>
  );
}
