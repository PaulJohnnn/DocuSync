import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DocuSync — Hybrid P2P File Synchronization',
  description: 'Four algorithms. Three platforms. Zero data loss. A BS CS thesis project from Pamantasan ng Cabuyao.',
};

// ── Sub-components ────────────────────────────────────────────────────────

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: 'rgba(79,125,248,0.12)', border: '1px solid rgba(79,125,248,0.30)',
      color: '#4f7df8', fontSize: 12, fontWeight: 600,
      borderRadius: 20, padding: '6px 16px', marginBottom: 24,
    }}>
      {children}
    </span>
  );
}

const METRICS = [
  { num: '1.51ms', label: 'Avg Latency' },
  { num: '1,010/s', label: 'Throughput' },
  { num: '100%', label: 'Conflict Detection' },
  { num: '0%', label: 'Data Loss' },
];

const FEATURES = [
  {
    icon: '🗃',
    iconBg: '#4f7df8',
    title: 'Append-Only Event Log',
    algo: 'Log-Based Sync',
    desc: 'Every edit becomes an immutable event. The log never deletes. Zero data loss is guaranteed across all peers.',
    pill: '0% Data Loss',
    pillColor: '#22c55e',
    pillBg: 'rgba(34,197,94,0.12)',
  },
  {
    icon: '🕐',
    iconBg: '#8b5cf6',
    title: 'Causal Ordering',
    algo: 'Vector Clocks',
    desc: 'Tree clock data structures detect concurrent edits across all nodes without any central server.',
    pill: '100% Detection',
    pillColor: '#8b5cf6',
    pillBg: 'rgba(139,92,246,0.12)',
  },
  {
    icon: '⚡',
    iconBg: '#22c55e',
    title: 'Bandwidth Efficient',
    algo: 'Delta Encoding',
    desc: 'Only changed bytes are transmitted. Myers diff algorithm computes the smallest possible delta patch.',
    pill: '1,010 events/sec',
    pillColor: '#22c55e',
    pillBg: 'rgba(34,197,94,0.12)',
  },
  {
    icon: '⚖',
    iconBg: '#f59e0b',
    title: 'Smart Conflict Resolution',
    algo: 'LWW Resolver',
    desc: 'Auto-resolves using logical timestamps. Escalates to file owner when vector clocks are concurrent.',
    pill: '< 100ms resolution',
    pillColor: '#f59e0b',
    pillBg: 'rgba(245,158,11,0.12)',
  },
];

const PLATFORMS = [
  {
    icon: '💻',
    title: 'Desktop App',
    subtitle: 'Windows · macOS · Linux',
    desc: 'Full engine with SQLite database, native file system access, and P2P WebSocket server.',
    features: ['Local SQLite database', 'Native file picker', 'P2P WebSocket server', 'All 4 algorithms'],
    cta: 'Download Now →',
    ctaHref: '/download',
    ctaBg: '#4f7df8',
    accent: 'linear-gradient(90deg, #4f7df8, #8b5cf6)',
    featured: false,
  },
  {
    icon: '🌐',
    title: 'Web App',
    subtitle: 'Any Browser · No Install',
    desc: 'Access DocuSync from any browser. Same hybrid engine, localStorage backend, shareable URL.',
    features: ['No installation needed', 'Works on any device', 'Real-time sync demo', 'Shareable URL'],
    cta: 'Open Web App →',
    ctaHref: 'https://docusync-pnc.vercel.app',
    ctaBg: '#22c55e',
    accent: '#4f7df8',
    featured: true,
    badge: 'LIVE NOW',
  },
  {
    icon: '📱',
    title: 'Mobile App',
    subtitle: 'Android · iOS via Expo Go',
    desc: 'Sync files on the go. React Native with AsyncStorage and real WebSocket P2P connectivity.',
    features: ['expo-document-picker', 'AsyncStorage persistence', 'Touch-optimized UI', 'Same core algorithms'],
    cta: 'Get on Expo Go →',
    ctaHref: 'https://expo.dev/go',
    ctaBg: '#8b5cf6',
    accent: 'linear-gradient(90deg, #8b5cf6, #4f7df8)',
    featured: false,
  },
];

const RESEARCHERS = [
  { name: 'Paul John G. Palamara', role: 'Solo Developer', initials: 'PJ' },
  { name: 'Bajado, John Benedict B.', role: 'Co-Researcher', initials: 'JB' },
  { name: 'Palma, John Lloyd P.', role: 'Co-Researcher', initials: 'JL' },
  { name: 'Venancio, Zyra P.', role: 'Co-Researcher', initials: 'ZV' },
];

// ── Page ──────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div style={{ background: '#0a0e18', color: '#eef0f8', overflowX: 'hidden' }}>
      {/* ── HERO ── */}
      <section id="hero" style={{
        minHeight: 'calc(100vh - 64px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        textAlign: 'center',
        padding: '80px clamp(20px,5vw,64px) 60px',
        position: 'relative',
        backgroundImage: `
          linear-gradient(rgba(79,125,248,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(79,125,248,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
      }}>
        {/* Glow */}
        <div style={{
          position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 600, height: 400, borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(79,125,248,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <Badge>🎓 BS CS Thesis · Pamantasan ng Cabuyao · 2026</Badge>

        <h1 className="hero-headline" style={{
          fontSize: 'clamp(36px,6vw,64px)',
          fontWeight: 800,
          color: '#eef0f8',
          lineHeight: 1.08,
          letterSpacing: '-0.02em',
          marginBottom: 20,
          maxWidth: 800,
        }}>
          Hybrid P2P File<br />
          <span style={{ color: '#4f7df8' }}>Synchronization</span>
        </h1>

        <p style={{ fontSize: 'clamp(16px,2vw,22px)', fontWeight: 400, color: '#7e8ba8', marginBottom: 10 }}>
          Four algorithms. Three platforms. Zero data loss.
        </p>
        <p style={{ fontSize: 16, color: '#4d5f85', maxWidth: 560, margin: '0 auto 40px', lineHeight: 1.7 }}>
          DocuSync combines Log-Based Sync, Vector Clocks, LWW Conflict Resolution, and Delta Encoding
          into one powerful engine — running on Desktop, Web, and Mobile.
        </p>

        {/* CTA Buttons */}
        <div className="hero-ctas" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 32 }}>
          <Link href="/download" className="cta-primary" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: '#4f7df8', color: '#fff',
            borderRadius: 10, height: 50, padding: '0 28px',
            fontSize: 15, fontWeight: 600, textDecoration: 'none',
            transition: 'background 0.15s',
          }}>
            ⬇ Download for Windows
          </Link>
          <Link href="/" className="cta-ghost" style={{
            display: 'inline-flex', alignItems: 'center',
            background: 'transparent', border: '1px solid rgba(255,255,255,0.20)',
            color: '#eef0f8', borderRadius: 10, height: 50, padding: '0 28px',
            fontSize: 15, fontWeight: 500, textDecoration: 'none',
            transition: 'background 0.15s',
          }}>
            Try Web App →
          </Link>
          <Link href="https://github.com/PaulJohnnn/DocuSync" target="_blank" rel="noopener noreferrer"
            className="cta-text-link"
            style={{ display: 'inline-flex', alignItems: 'center', color: '#7e8ba8', fontSize: 14, fontWeight: 500, textDecoration: 'none', padding: '0 8px', height: 50 }}>
            GitHub ↗
          </Link>
        </div>

        {/* Platform pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 60 }}>
          <span style={{ fontSize: 12, color: '#4d5f85' }}>Available on:</span>
          {['Windows', 'macOS', 'Linux', 'Web', 'Android'].map(p => (
            <span key={p} style={{
              fontSize: 11, fontWeight: 500, color: '#7e8ba8',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 99, padding: '4px 12px',
            }}>{p}</span>
          ))}
        </div>

        {/* Metrics row */}
        <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, width: '100%', maxWidth: 780 }}>
          {METRICS.map(m => (
            <div key={m.num} style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12, padding: '20px 16px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#4f7df8', fontVariantNumeric: 'tabular-nums', marginBottom: 6 }}>{m.num}</div>
              <div style={{ fontSize: 11, color: '#4d5f85', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{
        background: '#111827',
        padding: '96px clamp(20px,5vw,64px)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4f7df8', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
            THE HYBRID ALGORITHM
          </p>
          <h2 style={{ fontSize: 'clamp(28px,4vw,40px)', fontWeight: 700, color: '#eef0f8', marginBottom: 14 }}>
            Four Algorithms. One Engine.
          </h2>
          <p style={{ fontSize: 16, color: '#7e8ba8', maxWidth: 500, margin: '0 auto' }}>
            Each algorithm solves a specific problem that others alone cannot.
          </p>
        </div>

        <div className="features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16, maxWidth: 1000, margin: '0 auto' }}>
          {FEATURES.map(f => (
            <div key={f.title} className="feature-card" style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16, padding: '28px 32px',
              transition: 'border-color 0.2s, background 0.2s',
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: `${f.iconBg}22`,
                border: `1px solid ${f.iconBg}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, marginBottom: 16,
              }}>
                {f.icon}
              </div>
              <p style={{ fontSize: 11, fontWeight: 600, color: f.iconBg, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{f.algo}</p>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#eef0f8', marginBottom: 10 }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: '#7e8ba8', lineHeight: 1.7, marginBottom: 16 }}>{f.desc}</p>
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                fontSize: 11, fontWeight: 600, color: f.pillColor,
                background: f.pillBg, borderRadius: 99, padding: '4px 12px',
              }}>
                ✓ {f.pill}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── PLATFORMS ── */}
      <section id="download" style={{ background: '#0a0e18', padding: '96px clamp(20px,5vw,64px)' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <h2 style={{ fontSize: 'clamp(28px,4vw,40px)', fontWeight: 700, color: '#eef0f8', marginBottom: 14 }}>
            Available on Every Platform
          </h2>
          <p style={{ fontSize: 16, color: '#7e8ba8' }}>One hybrid engine. Three apps.</p>
        </div>

        <div className="platforms-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, maxWidth: 1080, margin: '0 auto' }}>
          {PLATFORMS.map(p => (
            <div key={p.title} style={{
              background: 'rgba(255,255,255,0.03)',
              border: p.featured ? '2px solid #4f7df8' : '1px solid rgba(255,255,255,0.08)',
              borderRadius: 20, overflow: 'hidden', position: 'relative',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Accent top bar */}
              {!p.featured && (
                <div style={{ height: 2, background: p.accent }} />
              )}

              {/* Featured badge */}
              {p.featured && p.badge && (
                <div style={{
                  position: 'absolute', top: 16, right: 16,
                  background: '#4f7df8', color: '#fff',
                  fontSize: 10, fontWeight: 700, borderRadius: 99,
                  padding: '3px 10px', letterSpacing: '0.06em',
                }}>
                  {p.badge}
                </div>
              )}

              <div style={{ padding: '28px 28px 24px', flex: 1 }}>
                <div style={{ fontSize: 44, marginBottom: 16 }}>{p.icon}</div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: '#eef0f8', marginBottom: 4 }}>{p.title}</h3>
                <p style={{ fontSize: 12, color: '#4f7df8', fontWeight: 600, marginBottom: 12 }}>{p.subtitle}</p>
                <p style={{ fontSize: 14, color: '#7e8ba8', lineHeight: 1.7, marginBottom: 20 }}>{p.desc}</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                  {p.features.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#7e8ba8' }}>
                      <span style={{ color: '#22c55e', flexShrink: 0 }}>✓</span> {f}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding: '0 28px 28px' }}>
                <Link
                  href={p.ctaHref}
                  target={p.ctaHref.startsWith('http') ? '_blank' : undefined}
                  rel={p.ctaHref.startsWith('http') ? 'noopener noreferrer' : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: p.ctaBg, color: '#fff',
                    borderRadius: 10, height: 44, width: '100%',
                    fontSize: 14, fontWeight: 600, textDecoration: 'none',
                    transition: 'opacity 0.15s',
                  }}
                  className="platform-cta"
                >
                  {p.cta}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── THESIS INFO ── */}
      <section style={{ background: '#111827', padding: '80px clamp(20px,5vw,64px)', textAlign: 'center' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#4f7df8', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20 }}>
          THESIS RESEARCH · 2026
        </p>
        <h2 style={{
          fontSize: 'clamp(20px,3vw,28px)', fontWeight: 600, color: '#eef0f8',
          maxWidth: 700, margin: '0 auto 16px', lineHeight: 1.4,
        }}>
          A Comparative Evaluation of Operational Transformation and Replicated Data Types
          to Hybrid Conflict Resolution Algorithm
        </h2>
        <p style={{ fontSize: 14, color: '#7e8ba8', marginBottom: 48 }}>
          Pamantasan ng Cabuyao · College of Computing Studies · BS CS
        </p>

        {/* Researchers */}
        <div className="researchers-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, maxWidth: 900, margin: '0 auto 48px' }}>
          {RESEARCHERS.map(r => (
            <div key={r.name} style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, padding: '16px 14px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'linear-gradient(135deg, #4f7df8, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, color: '#fff',
              }}>
                {r.initials}
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#eef0f8', marginBottom: 3 }}>{r.name}</p>
                <p style={{ fontSize: 11, color: '#7e8ba8' }}>{r.role}</p>
              </div>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 13, color: '#4d5f85', marginBottom: 20 }}>Evaluation Standard: ISO/IEC 25010:2023</p>
        <Link href="/metrics" style={{
          display: 'inline-flex', alignItems: 'center',
          border: '1px solid rgba(79,125,248,0.40)', color: '#4f7df8',
          background: 'rgba(79,125,248,0.08)',
          borderRadius: 8, height: 40, padding: '0 20px',
          fontSize: 13, fontWeight: 600, textDecoration: 'none',
          transition: 'background 0.15s',
        }} className="metrics-btn">
          View Full Metrics →
        </Link>
      </section>

      {/* Responsive styles */}
      <style>{`
        .cta-primary:hover  { background: #3d6ef0 !important; }
        .cta-ghost:hover    { background: rgba(255,255,255,0.06) !important; }
        .cta-text-link:hover { color: #eef0f8 !important; text-decoration: underline !important; }
        .feature-card:hover { border-color: rgba(79,125,248,0.30) !important; background: rgba(79,125,248,0.05) !important; }
        .platform-cta:hover { opacity: 0.85 !important; }
        .metrics-btn:hover  { background: rgba(79,125,248,0.16) !important; }

        @media (max-width: 900px) {
          .platforms-grid { grid-template-columns: 1fr !important; max-width: 480px !important; }
          .features-grid  { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 768px) {
          .metrics-grid   { grid-template-columns: repeat(2,1fr) !important; }
          .researchers-grid { grid-template-columns: repeat(2,1fr) !important; }
          .hero-ctas      { flex-direction: column !important; align-items: stretch !important; }
          .hero-ctas a    { justify-content: center !important; }
        }
        @media (max-width: 480px) {
          .researchers-grid { grid-template-columns: 1fr !important; }
          .metrics-grid   { grid-template-columns: repeat(2,1fr) !important; }
        }
      `}</style>
    </div>
  );
}
