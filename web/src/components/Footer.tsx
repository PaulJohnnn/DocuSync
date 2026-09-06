import Link from 'next/link';

function LogoMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
      <rect width="28" height="28" rx="8" fill="#4f7df8"/>
      <path d="M7.5 10h13M7.5 14h9M7.5 18h9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="19.5" cy="18.5" r="4.5" fill="#22c55e"/>
    </svg>
  );
}

const FOOTER_LINKS = {
  Product: [
    { label: 'Download Windows', href: '/download' },
    { label: 'Open Web App', href: '/', external: true },
    { label: 'Expo Mobile App', href: 'https://expo.dev/go', external: true },
  ],
  Resources: [
    { label: 'View Source Code', href: 'https://github.com/PaulJohnnn/DocuSync', external: true },
    { label: 'Thesis Documentation', href: '/metrics' },
  ],
};

export default function Footer() {
  return (
    <footer style={{
      background: 'var(--bg2)',
      borderTop: '1px solid var(--b1)',
      padding: '64px clamp(20px,5vw,64px) 32px',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Top row */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          flexWrap: 'wrap', gap: 64, marginBottom: 64,
        }}>
          {/* Brand */}
          <div style={{ flex: '1 1 300px' }}>
            <Link href="/home" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 16 }}>
              <LogoMark />
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.02em' }}>DocuSync</span>
            </Link>
            <p style={{ fontSize: 14, color: 'var(--t2)', maxWidth: 320, lineHeight: 1.7 }}>
              A high-performance hybrid peer-to-peer file synchronization engine. Built for seamless offline-first collaboration without central servers.
            </p>
          </div>

          {/* Link columns */}
          <div style={{ display: 'flex', gap: 80, flexWrap: 'wrap' }}>
            {Object.entries(FOOTER_LINKS).map(([col, links]) => (
              <div key={col}>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}>
                  {col}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {links.map(l => (
                    <Link
                      key={l.label}
                      href={l.href}
                      target={'external' in l && l.external ? '_blank' : undefined}
                      rel={'external' in l && l.external ? 'noopener noreferrer' : undefined}
                      style={{ fontSize: 14, color: 'var(--t2)', textDecoration: 'none', transition: 'color 0.15s', fontWeight: 500 }}
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
          borderTop: '1px solid var(--b1)',
          paddingTop: 32,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 16,
        }}>
          <p style={{ fontSize: 13, color: 'var(--t3)', fontWeight: 500 }}>
            © 2026 Pamantasan ng Cabuyao · BS Computer Science · Paul John G. Palamara
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 12px #22c55e' }} />
            <p style={{ fontSize: 13, color: 'var(--t3)', fontWeight: 500 }}>
              ISO/IEC 25010:2023 Compliant · 72/72 Tests Passed
            </p>
          </div>
        </div>
      </div>

      <style>{`.footer-link:hover { color: #4f7df8 !important; }`}</style>
    </footer>
  );
}
