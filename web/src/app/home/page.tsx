'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import Tilt from 'react-parallax-tilt';
import { Monitor, Globe, Smartphone } from 'lucide-react';

// ── Scroll animation hook ─────────────────────────────────────
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-in');
          }
        });
      },
      { threshold: 0.1 }
    );
    // Observe all .scroll-hidden children
    el.querySelectorAll('.scroll-hidden').forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, []);
  return ref;
}

// ── Sub-components ────────────────────────────────────────────
function SectionLabel({ children, color = '#4f7df8' }: { children: React.ReactNode; color?: string }) {
  return (
    <p style={{
      fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase',
      letterSpacing: '0.12em', marginBottom: 14,
    }}>{children}</p>
  );
}

function GreenCheck({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t2)', marginBottom: 8 }}>
      <span style={{ color: '#22c55e', flexShrink: 0, fontSize: 15 }}>✓</span> {children}
    </div>
  );
}

// ── Data ──────────────────────────────────────────────────────


const PROBLEMS = [
  {
    color: '#ef4444', bg: 'rgba(239,68,68,0.05)', border: '#ef4444',
    title: 'The Accidental Overwrite',
    types: 'Lost Time & Effort',
    desc: 'You spend hours polishing a document. A teammate opens an older version, clicks "Save", and instantly wipes out all your hard work.',
  },
  {
    color: '#f59e0b', bg: 'rgba(245,158,11,0.05)', border: '#f59e0b',
    title: 'The Duplicate Mess',
    types: 'Cluttered Folders',
    desc: 'To avoid losing work, everyone starts making copies. Before you know it, you are lost in a sea of "Project_Final_v2_John_Copy(1)".',
  },
  {
    color: '#7c3aed', bg: 'rgba(124,58,237,0.05)', border: '#7c3aed',
    title: 'The Offline Panic',
    types: 'No Internet, No Sync',
    desc: 'Your Wi-Fi drops while working on a flight or in a cafe. When you finally reconnect, your local changes clash violently with the cloud.',
  },
];

const ALGORITHMS = [
  {
    num: '01', numColor: 'rgba(79,125,248,0.15)', iconColor: '#4f7df8',
    algo: 'Algorithm 1',
    title: 'Never Lose a Keystroke',
    desc: 'We save every single edit invisibly in the background. Think of it as an infinite "Undo" button. No matter what happens, your work is perfectly preserved.',
    pill: 'Powered by: Log-Based Sync', pillColor: '#4f7df8', pillBg: 'rgba(79,125,248,0.10)',
    metric: '100% Recovery',
  },
  {
    num: '02', numColor: 'rgba(124,58,237,0.15)', iconColor: '#7c3aed',
    algo: 'Algorithm 2',
    title: 'Flawless Collaboration',
    desc: 'DocuSync mathematically tracks exactly who typed what and when. It organizes everything so perfectly that nobody’s work ever steps on anyone else’s toes.',
    pill: 'Powered by: Vector Clocks', pillColor: '#7c3aed', pillBg: 'rgba(124,58,237,0.10)',
    metric: 'Zero Overwrites',
  },
  {
    num: '03', numColor: 'rgba(34,197,94,0.15)', iconColor: '#22c55e',
    algo: 'Algorithm 3',
    title: 'Lightning Fast Syncing',
    desc: 'Instead of uploading your whole document every time you hit save, DocuSync only sends the tiny pieces of text you just changed. It\'s instant.',
    pill: 'Powered by: Delta Encoding', pillColor: '#22c55e', pillBg: 'rgba(34,197,94,0.10)',
    metric: 'Instant Updates',
  },
  {
    num: '04', numColor: 'rgba(245,158,11,0.15)', iconColor: '#f59e0b',
    algo: 'Algorithm 4',
    title: 'Smart Auto-Merge',
    desc: 'If two people manage to edit the exact same word at the exact same millisecond, our intelligent system steps in and safely resolves the clash automatically.',
    pill: 'Powered by: LWW Resolver', pillColor: '#f59e0b', pillBg: 'rgba(245,158,11,0.10)',
    metric: 'No Merge Conflicts',
  },
];

const PLATFORMS = [
  {
    title: 'Desktop App', subtitle: 'Windows · macOS · Linux',
    desc: 'Full Electron app with local SQLite database, native file system access, and P2P WebSocket server. The primary thesis prototype.',
    features: ['Local SQLite database', 'Native OS file picker', 'P2P WebSocket server (port 9000)', 'All 4 algorithms active', 'Offline-first'],
    cta: 'Download for Windows →', ctaHref: '/download', ctaBg: '#4f7df8',
    accent: 'linear-gradient(90deg, #4f7df8, #8b5cf6)', featured: false,
    iconColor: '#4f7df8', glowColor: 'rgba(79,125,248,0.30)', floatDelay: '0s',
  },
  {
    title: 'Web App', subtitle: 'Any Browser · No Install',
    desc: 'Access DocuSync from any browser. Uses localStorage for persistence and browser WebSocket for P2P. Same algorithm engine.',
    features: ['No installation needed', 'Works on any device', 'Real-time sync demo', 'Shareable public URL', 'Always up to date'],
    cta: 'Open Web App →', ctaHref: '/app/welcome', ctaBg: '#22c55e',
    accent: '#4f7df8', featured: true, badge: 'LIVE NOW',
    iconColor: '#22c55e', glowColor: 'rgba(34,197,94,0.30)', floatDelay: '0.5s',
  },
  {
    title: 'Mobile App', subtitle: 'Android · iOS via Expo Go',
    desc: 'React Native app with AsyncStorage persistence and real WebSocket P2P. Touch-optimized UI with the same core algorithm.',
    features: ['Expo Go (no App Store needed)', 'AsyncStorage persistence', 'Touch-optimized interface', 'Same core algorithms', 'Dark theme'],
    cta: 'Get on Expo Go →', ctaHref: 'https://expo.dev/go', ctaBg: '#7c3aed',
    accent: 'linear-gradient(90deg, #7c3aed, #4f7df8)', featured: false,
    iconColor: '#7c3aed', glowColor: 'rgba(124,58,237,0.30)', floatDelay: '1s',
  },
];



// ── Page ──────────────────────────────────────────────────────
export default function HomePage() {
  const pageRef = useScrollReveal();

  return (
    <div ref={pageRef} style={{ background: 'var(--bg)', color: 'var(--t1)', overflowX: 'hidden' }}>

      {/* ══════════════════════════════════════════════════════════
          SECTION 1 — HERO
      ══════════════════════════════════════════════════════════ */}
      <section style={{
        minHeight: 'calc(100vh - 64px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        textAlign: 'center',
        padding: '80px clamp(20px,5vw,64px) 60px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Grid bg */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: `
            linear-gradient(rgba(79,125,248,0.03) 1px, transparent 1px),
            linear-gradient(90deg,rgba(79,125,248,0.03) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }} />

        {/* Animated orbs */}
        <div style={{
          position: 'absolute', top: '20%', left: '10%',
          width: 400, height: 400, borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle,rgba(79,125,248,0.15),transparent)',
          filter: 'blur(40px)',
          animation: 'float 6s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', top: '40%', right: '10%',
          width: 380, height: 380, borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle,rgba(124,58,237,0.15),transparent)',
          filter: 'blur(40px)',
          animation: 'float 8s ease-in-out infinite reverse',
        }} />
        <div style={{
          position: 'absolute', bottom: '15%', left: '40%',
          width: 340, height: 340, borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle,rgba(34,197,94,0.10),transparent)',
          filter: 'blur(40px)',
          animation: 'float 7s ease-in-out 2s infinite',
        }} />

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 900, width: '100%' }}>


          {/* Headline */}
          <h1 className="hero-headline" style={{
            fontSize: 'clamp(32px,6vw,68px)',
            fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em',
            marginBottom: 24, color: 'var(--t1)',
            animation: 'fadeInUp 0.8s ease 0.3s both',
          }}>
            Hybrid P2P<br />
            <span style={{
              background: 'linear-gradient(135deg,#4f7df8,#7c3aed,#22c55e)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundSize: '200%', animation: 'gradient-shift 4s ease infinite',
            }}>
              File Synchronization
            </span>
          </h1>

          {/* Description Removed */}
          <div style={{ height: 24 }} />

          {/* CTA Buttons */}
          <div className="hero-ctas" style={{
            display: 'flex', gap: 14, flexWrap: 'wrap',
            justifyContent: 'center', marginBottom: 28,
            animation: 'fadeInUp 0.8s ease 0.5s both',
          }}>
            <Link href="/download" className="btn-hero-primary" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'linear-gradient(135deg,#4f7df8,#3d6ef0)',
              color: '#fff', borderRadius: 12, height: 52, padding: '0 32px',
              fontSize: 16, fontWeight: 600, textDecoration: 'none',
              boxShadow: '0 8px 32px rgba(79,125,248,0.40)',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}>
              ⬇ Download for Windows
            </Link>
            <Link href="/app/welcome" className="btn-hero-ghost">
              Try Web App →
            </Link>
            <Link href="https://github.com/PaulJohnnn/DocuSync" target="_blank" rel="noopener noreferrer"
              className="btn-hero-text" style={{
                display: 'inline-flex', alignItems: 'center',
                color: 'var(--t2)', fontSize: 15, fontWeight: 500,
                textDecoration: 'none', padding: '0 8px', height: 52,
              }}>
              GitHub ↗
            </Link>
          </div>

          {/* Platform pills */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            flexWrap: 'wrap', justifyContent: 'center', marginBottom: 64,
            animation: 'fadeInUp 0.8s ease 0.6s both',
          }}>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>Available on:</span>
            {['Windows', 'macOS', 'Linux', 'Web', 'Android'].map(p => (
              <span key={p} style={{
                fontSize: 11, fontWeight: 500, color: 'var(--t2)',
                background: 'var(--s1)',
                border: '1px solid var(--b1)',
                borderRadius: 99, padding: '4px 12px',
              }}>{p}</span>
            ))}
          </div>


        </div>

        {/* Scroll indicator */}
        <div style={{
          position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          color: 'var(--t3)', fontSize: 20, animation: 'bounce 2s ease-in-out infinite',
        }}>↓</div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 2 — THE PROBLEM
      ══════════════════════════════════════════════════════════ */}
      <section style={{ background: 'var(--bg2)', padding: '100px clamp(20px,5vw,64px)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div className="scroll-hidden" style={{ textAlign: 'center', marginBottom: 56 }}>
            <SectionLabel color="#ef4444">THE PROBLEM</SectionLabel>
            <h2 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 700, color: 'var(--t1)', marginBottom: 16 }}>
              Collaboration Shouldn&apos;t Mean Compromise
            </h2>
            <p style={{ fontSize: 16, color: 'var(--t2)', maxWidth: 580, margin: '0 auto', lineHeight: 1.7 }}>
              Are you tired of constantly creating &quot;File_Final_v2_Copy&quot; just to avoid losing your work? 
              Traditional cloud storage wasn&apos;t built for true real-time, offline-friendly teamwork.
            </p>
          </div>

          <div className="problem-grid scroll-hidden" style={{
            display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20,
          }}>
            {PROBLEMS.map((p, i) => (
              <div key={p.title} className="scroll-hidden problem-card" style={{
                background: p.bg,
                border: `1px solid ${p.border}22`,
                borderLeft: `3px solid ${p.border}`,
                borderRadius: 16, padding: '28px 24px',
                transition: 'transform 0.2s ease',
                animationDelay: `${i * 100}ms`,
              }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', marginBottom: 8 }}>{p.title}</h3>
                <p style={{
                  fontSize: 11, color: p.color, fontWeight: 600,
                  fontFamily: 'monospace', letterSpacing: '0.05em', marginBottom: 12,
                }}>{p.types}</p>
                <p style={{ fontSize: 14, color: 'var(--t2)', lineHeight: 1.7 }}>{p.desc}</p>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 48 }} className="scroll-hidden">
            <p style={{ fontSize: 20, fontWeight: 600, color: '#4f7df8' }}>
              DocuSync solves all three ↓
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 3 — FOUR ALGORITHMS
      ══════════════════════════════════════════════════════════ */}
      <section id="features" style={{ background: 'var(--bg)', padding: '100px clamp(20px,5vw,64px)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="scroll-hidden" style={{ textAlign: 'center', marginBottom: 60 }}>
            <SectionLabel>THE SOLUTION</SectionLabel>
            <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 700, color: 'var(--t1)', marginBottom: 14 }}>
              Four Smart Tools. One Seamless Experience.
            </h2>
            <p style={{ fontSize: 16, color: 'var(--t2)', maxWidth: 520, margin: '0 auto' }}>
              We&apos;ve hidden complex thesis-level technology behind a beautifully simple interface. Here&apos;s how DocuSync protects your work effortlessly.
            </p>
          </div>

          <div className="algo-grid" style={{
            display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 20,
          }}>
            {ALGORITHMS.map((a, i) => (
              <div key={a.title} className="algo-card scroll-hidden" style={{
                background: 'var(--s1)',
                border: '1px solid var(--b1)',
                borderRadius: 20, padding: '32px',
                transition: 'border-color 0.3s ease, background 0.3s ease, transform 0.3s ease',
                position: 'relative', overflow: 'hidden',
                animationDelay: `${i * 100}ms`,
              }}>
                <div style={{
                  position: 'absolute', top: 16, right: 20,
                  fontSize: 64, fontWeight: 800, color: a.numColor,
                  lineHeight: 1, userSelect: 'none', pointerEvents: 'none',
                }}>{a.num}</div>
                <p style={{ fontSize: 11, fontWeight: 600, color: a.iconColor, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  {a.algo}
                </p>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', marginBottom: 12 }}>{a.title}</h3>
                <p style={{ fontSize: 14, color: 'var(--t2)', lineHeight: 1.75, marginBottom: 20 }}>{a.desc}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    background: a.pillBg, color: a.pillColor,
                    borderRadius: 99, padding: '4px 12px', fontSize: 11, fontWeight: 600,
                  }}>✓ {a.pill}</span>
                  <span style={{ fontSize: 12, color: 'var(--t3)', fontWeight: 500 }}>→ {a.metric}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 4 — LIVE DEMO PREVIEW
      ══════════════════════════════════════════════════════════ */}
      <section style={{ background: 'var(--bg2)', padding: '100px clamp(20px,5vw,64px)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div className="scroll-hidden" style={{ textAlign: 'center', marginBottom: 48 }}>
            <SectionLabel>LIVE DEMO</SectionLabel>
            <h2 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 700, color: 'var(--t1)', marginBottom: 14 }}>
              See It In Action
            </h2>
            <p style={{ fontSize: 16, color: 'var(--t2)' }}>
              Try the live web version right in your browser. No installation needed.
            </p>
          </div>

          <div className="scroll-hidden" style={{ animation: 'float 6s ease-in-out infinite' }}>
            {/* Browser chrome */}
            <div style={{
              border: '1px solid var(--b1)',
              borderRadius: 16, overflow: 'hidden',
              boxShadow: '0 24px 80px rgba(0,0,0,0.60)',
            }}>
              {/* Title bar */}
              <div style={{
                background: 'var(--bg3)', padding: '10px 16px',
                display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: '1px solid var(--b1)',
              }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['#ef4444','#f59e0b','#22c55e'].map(c => (
                    <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
                  ))}
                </div>
                <div style={{
                  flex: 1, maxWidth: 340, margin: '0 auto',
                  background: 'var(--s1)', borderRadius: 6,
                  padding: '4px 12px', fontSize: 11, color: 'var(--t3)',
                  textAlign: 'center', border: '1px solid var(--b1)',
                }}>
                  🔒 docusync-dusky.vercel.app/app/files
                </div>
              </div>
              {/* App iframe */}
              <iframe
                src="/app/files?demo=true"
                style={{ width: '100%', height: 500, border: 'none', display: 'block' }}
                title="DocuSync Live Demo"
              />
            </div>
          </div>

          <div className="scroll-hidden" style={{ textAlign: 'center', marginTop: 32 }}>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 5 — THREE PLATFORMS
      ══════════════════════════════════════════════════════════ */}
      <section id="download" style={{ background: 'var(--bg)', padding: '100px clamp(20px,5vw,64px)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="scroll-hidden" style={{ textAlign: 'center', marginBottom: 56 }}>
            <SectionLabel>PLATFORMS</SectionLabel>
            <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 700, color: 'var(--t1)', marginBottom: 14 }}>
              One Engine. Three Platforms.
            </h2>
            <p style={{ fontSize: 16, color: 'var(--t2)' }}>
              The same hybrid algorithm runs on Desktop, Web, and Mobile.
            </p>
          </div>

          {/* Float keyframes injected inline */}
          <style>{`
            @keyframes ds-float {
              0%, 100% { transform: translateY(0px); }
              50% { transform: translateY(-8px); }
            }
          `}</style>

          <div className="platforms-grid" style={{
            display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20,
          }}>
            {PLATFORMS.map((p, i) => {
              const PlatformIcon = i === 0 ? Monitor : i === 1 ? Globe : Smartphone;
              return (
                <Tilt
                  key={p.title}
                  tiltMaxAngleX={8}
                  tiltMaxAngleY={8}
                  glareEnable={true}
                  glareMaxOpacity={0.08}
                  glareColor={p.iconColor}
                  glarePosition="all"
                  scale={1.02}
                  style={{ borderRadius: 20 }}
                >
                  <div
                    className="scroll-hidden platform-card"
                    style={{
                      background: 'var(--s1)',
                      border: p.featured ? '2px solid #4f7df8' : '1px solid var(--b1)',
                      borderRadius: 20, overflow: 'hidden',
                      display: 'flex', flexDirection: 'column',
                      position: 'relative',
                      boxShadow: p.featured ? `0 0 40px rgba(79,125,248,0.18)` : 'none',
                      transition: 'box-shadow 0.3s ease',
                      animationDelay: `${i * 120}ms`,
                      height: '100%',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow = `0 0 30px ${p.glowColor}`;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow = p.featured ? '0 0 40px rgba(79,125,248,0.18)' : 'none';
                    }}
                  >
                    {/* Top accent bar */}
                    {!p.featured && <div style={{ height: 3, background: p.accent }} />}

                    {/* Featured badge */}
                    {p.featured && p.badge && (
                      <div style={{
                        position: 'absolute', top: 16, right: 16,
                        background: '#22c55e', color: '#fff',
                        fontSize: 10, fontWeight: 700, borderRadius: 99,
                        padding: '4px 12px', letterSpacing: '0.06em',
                      }}>{p.badge}</div>
                    )}

                    <div style={{ padding: '28px 28px 20px', flex: 1 }}>
                      {/* Floating platform icon */}
                      <div style={{
                        width: 56, height: 56,
                        borderRadius: 16,
                        background: `${p.iconColor}18`,
                        border: `1px solid ${p.iconColor}30`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: 20,
                        animation: `ds-float 3s ease infinite`,
                        animationDelay: p.floatDelay,
                      }}>
                        <PlatformIcon size={28} color={p.iconColor} />
                      </div>

                      <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>{p.title}</h3>
                      <p style={{ fontSize: 12, color: p.iconColor, fontWeight: 600, marginBottom: 14 }}>{p.subtitle}</p>
                      <p style={{ fontSize: 14, color: 'var(--t2)', lineHeight: 1.7, marginBottom: 20 }}>{p.desc}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {p.features.map(f => <GreenCheck key={f}>{f}</GreenCheck>)}
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
                        }} className="platform-cta"
                      >
                        {p.cta}
                      </Link>
                    </div>
                  </div>
                </Tilt>
              );
            })}
          </div>
        </div>
      </section>



      {/* ── Responsive & hover styles ── */}
      <style>{`
        .btn-hero-primary:hover  { transform: translateY(-2px) !important; box-shadow: 0 12px 40px rgba(79,125,248,0.50) !important; }
        .btn-hero-ghost:hover    { background: var(--b1) !important; transform: translateY(-2px) !important; }
        .btn-hero-text:hover     { color: var(--t1) !important; text-decoration: underline !important; }
        .algo-card:hover         { border-color: rgba(79,125,248,0.30) !important; background: rgba(79,125,248,0.04) !important; transform: translateY(-6px) !important; }
        .problem-card:hover      { transform: translateY(-4px) !important; }
        .platform-card:hover     { transform: translateY(-6px) !important; }
        .platform-cta:hover      { opacity: 0.85 !important; }
        .metrics-btn:hover       { background: rgba(79,125,248,0.16) !important; }
        .open-app-btn:hover      { background: #3d6ef0 !important; }
        .researcher-card:hover   { border-color: rgba(79,125,248,0.30) !important; transform: translateY(-3px) !important; }
        .metric-card:hover       { border-color: rgba(79,125,248,0.30) !important; background: rgba(79,125,248,0.06) !important; transform: translateY(-4px) !important; }
        .cta-primary:hover       { background: #3d6ef0 !important; }
        .cta-ghost:hover         { background: rgba(255,255,255,0.06) !important; }
        .cta-text-link:hover     { color: var(--t1) !important; }

        @media (max-width: 900px) {
          .platforms-grid { grid-template-columns: 1fr !important; max-width: 480px !important; margin: 0 auto !important; }
          .algo-grid      { grid-template-columns: 1fr !important; }
          .problem-grid   { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
