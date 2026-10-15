'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import Tilt from 'react-parallax-tilt';
import { Monitor, Globe, Smartphone, Download, Check, ArrowRight, ExternalLink, ChevronDown } from 'lucide-react';

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

/**
 * One ink, one accent, and the greys between them.
 *
 * The page used five hues at once -- a red section, an amber one, a
 * purple one, a green one, and a blue headline that animated through a
 * gradient. Each was doing the work a heading should do, so nothing read
 * as more important than anything else. Colour now carries exactly one
 * meaning: this is the thing to click. Everything else is type, rule and
 * space.
 */
const INK = '#0a0a0a';
const INK_2 = '#3f3f46';
const INK_3 = '#71717a';
const LINE = '#e4e4e7';
const LINE_SOFT = '#f4f4f5';
const ACCENT = '#1d4ed8';

// ── Hero backdrop: a real depiction of the masterless P2P mesh, not a
// generic blurred-gradient-blob background. Nodes = devices, lines = the
// mesh topology, traveling dots = actual sync traffic (SVG <animateMotion>,
// not a fake pulse). Kept low-opacity and spread wide so the headline stays
// readable on top of it.
const HERO_NODES = [
  { x: 90, y: 90, r: 6 }, { x: 340, y: 40, r: 5 }, { x: 620, y: 80, r: 7 },
  { x: 860, y: 150, r: 5 }, { x: 1080, y: 70, r: 6 }, { x: 60, y: 340, r: 5 },
  { x: 1150, y: 320, r: 6 }, { x: 260, y: 460, r: 6 }, { x: 950, y: 440, r: 5 },
  { x: 550, y: 500, r: 7 }, { x: 120, y: 560, r: 5 }, { x: 1080, y: 560, r: 5 },
];
const HERO_EDGES: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [4, 6], [5, 7], [6, 8],
  [7, 9], [8, 9], [7, 10], [8, 11], [1, 5], [2, 9], [3, 8],
];
const HERO_NODE_COLORS = ['#18181b', '#3f3f46', '#52525b', '#27272a', '#71717a'];

function HeroMeshBackdrop() {
  return (
    <svg
      viewBox="0 0 1200 620" preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.22, pointerEvents: 'none' }}
    >
      {HERO_EDGES.map(([a, b], i) => {
        const A = HERO_NODES[a], B = HERO_NODES[b];
        return <line key={`e${i}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="rgba(9,9,11,0.10)" strokeWidth="1" />;
      })}
      {HERO_EDGES.map(([a, b], i) => {
        const A = HERO_NODES[a], B = HERO_NODES[b];
        const dur = 3.5 + (i % 5) * 0.6;
        const delay = i * 0.4;
        return (
          <circle key={`p${i}`} r="2.5" fill={HERO_NODE_COLORS[i % HERO_NODE_COLORS.length]}>
            <animateMotion dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" path={`M ${A.x} ${A.y} L ${B.x} ${B.y}`} />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.85;1" dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
          </circle>
        );
      })}
      {HERO_NODES.map((n, i) => (
        <circle key={`n${i}`} cx={n.x} cy={n.y} r={n.r} fill={HERO_NODE_COLORS[i % HERO_NODE_COLORS.length]}>
          <animate attributeName="r" values={`${n.r};${n.r * 1.4};${n.r}`} dur={`${2.5 + i * 0.3}s`} begin={`${i * 0.25}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0.9;0.5" dur={`${2.5 + i * 0.3}s`} begin={`${i * 0.25}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
}

// ── Sub-components ────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode; color?: string }) {
  return (
    <p style={{
      fontSize: 11, fontWeight: 600, color: INK_3, textTransform: 'uppercase',
      letterSpacing: '0.16em', marginBottom: 18,
    }}>{children}</p>
  );
}

function GreenCheck({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: INK_2, marginBottom: 8 }}>
      <Check size={13} color={INK} strokeWidth={2.5} style={{ flexShrink: 0 }} />
      {children}
    </div>
  );
}

// ── Data ──────────────────────────────────────────────────────


const PROBLEMS = [
  {
    
    title: 'The Accidental Overwrite',
    types: 'Lost Time & Effort',
    desc: 'You spend hours polishing a document. A teammate opens an older version, clicks "Save", and instantly wipes out all your hard work.',
  },
  {
    
    title: 'The Duplicate Mess',
    types: 'Cluttered Folders',
    desc: 'To avoid losing work, everyone starts making copies. Before you know it, you are lost in a sea of "Project_Final_v2_John_Copy(1)".',
  },
  {
    
    title: 'The Offline Panic',
    types: 'No Internet, No Sync',
    desc: 'Your Wi-Fi drops while working on a flight or in a cafe. When you finally reconnect, your local changes clash violently with the cloud.',
  },
];

const ALGORITHMS = [
  {
    num: '01',
    algo: 'Algorithm 1',
    title: 'Never Lose a Keystroke',
    desc: 'We save every single edit invisibly in the background. Think of it as an infinite "Undo" button. No matter what happens, your work is perfectly preserved.',
    pill: 'Powered by: Log-Based Sync', 
    metric: '100% Recovery',
  },
  {
    num: '02',
    algo: 'Algorithm 2',
    title: 'Knows What Happened Before What',
    desc: 'Every device keeps its own logical clock (a Fidge/Mattern vector clock) instead of trusting wall-clock time. Comparing two clocks tells DocuSync — with certainty — whether one edit truly came after another, or whether they happened independently at the same time.',
    pill: 'Powered by: Vector Clocks', 
    metric: '100% Concurrency Detection',
  },
  {
    num: '03',
    algo: 'Algorithm 3',
    title: 'Lightning Fast Syncing',
    desc: 'Instead of uploading your whole document every time you hit save, DocuSync computes the minimal edit script with the Myers O(ND) diff algorithm and sends only what changed, checksummed for integrity.',
    pill: 'Powered by: Delta Encoding', 
    metric: '~1ms Encode Latency',
  },
  {
    num: '04',
    algo: 'Algorithm 4',
    title: 'You Decide, We Never Guess',
    desc: 'When two edits are causally concurrent — neither clock came first — DocuSync flags it as a conflict and escalates to the room owner instead of silently picking a winner. From there it\'s your call: Keep Original, Accept the incoming change, or let Last-Writer-Wins auto-merge by timestamp.',
    pill: 'Powered by: LWW Resolver', 
    metric: 'Owner-Arbitrated',
  },
];

const EVAL_METRICS = [
  { value: '20/20', label: 'System Tests Passed', desc: 'ISO/IEC 25010 functional suite' },
  { value: '100%', label: 'Conflict Detection', desc: '30/30 concurrent vector-clock pairs correctly flagged' },
  { value: '0%', label: 'Data Loss Rate', desc: 'Append-only event log, independently verified' },
  { value: '~1ms', label: 'Avg. Delta Latency', desc: 'Myers diff encode, P95 also 1ms' },
  { value: '1,000/s', label: 'Event Throughput', desc: 'Sustained events per second in the log-based sync engine' },
  { value: '15', label: 'Max Concurrent Nodes', desc: 'Vector clock slot ceiling per room' },
];

/** Resolved by GitHub at request time, so it is always the newest release. */
const DESKTOP_DOWNLOAD_URL =
  'https://github.com/PaulJohnnn/DocuSync/releases/latest/download/DocuSync.exe';

const PLATFORMS = [
  {
    title: 'Desktop App', subtitle: 'Windows · macOS · Linux',
    desc: 'Full Electron app with local SQLite database, native file system access, and P2P WebSocket server. The primary thesis prototype.',
    features: ['Local SQLite database', 'Native OS file picker', 'P2P WebSocket server (port 9000)', 'All 4 algorithms active', 'Offline-first'],
    cta: 'Download for Windows', ctaHref: DESKTOP_DOWNLOAD_URL, ctaBg: INK,
    ctaIcon: 'download' as const,
    ctaNote: 'Windows 10 or 11, 64-bit',
    ctaSecondary: { label: 'Installation guide and other platforms', href: '/download' },
    accent: LINE, featured: false,
    iconColor: INK, floatDelay: '0s',
  },
  {
    title: 'Web App', subtitle: 'Any Browser · No Install',
    desc: 'Access DocuSync from any browser. Uses localStorage for persistence and browser WebSocket for P2P. Same algorithm engine.',
    features: ['No installation needed', 'Works on any device', 'Real-time sync demo', 'Shareable public URL', 'Always up to date'],
    cta: 'Open the web app', ctaHref: '/app/welcome', ctaBg: ACCENT,
    accent: ACCENT, featured: true, badge: 'LIVE',
    iconColor: ACCENT, floatDelay: '0.5s',
  },
  {
    title: 'Mobile App', subtitle: 'Android · iOS via Expo Go',
    desc: 'React Native app with AsyncStorage persistence and real WebSocket P2P. Touch-optimized UI with the same core algorithm.',
    features: ['Expo Go (no App Store needed)', 'AsyncStorage persistence', 'Touch-optimized interface', 'Same core algorithms', 'Dark theme'],
    cta: 'Get Expo Go', ctaHref: 'https://expo.dev/go', ctaBg: INK,
    accent: LINE, featured: false,
    iconColor: INK, floatDelay: '1s',
  },
];



// ── Page ──────────────────────────────────────────────────────
export default function HomePage() {
  const pageRef = useScrollReveal();

  return (
    <div ref={pageRef} style={{ background: '#fff', color: INK, overflowX: 'hidden', position: 'relative' }}>

      {/* Texture.
          A single layer of very fine grain over the whole page. At 3.5%
          it does not read as a pattern; it stops the large white areas
          looking like flat empty screen, which is the difference between
          spare and unfinished. */}
      <div aria-hidden="true" style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.035,
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")",
      }} />

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
            linear-gradient(rgba(9,9,11,0.035) 1px, transparent 1px),
            linear-gradient(90deg,rgba(9,9,11,0.035) 1px, transparent 1px)
          `,
          backgroundSize: '88px 88px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, #000 30%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, #000 30%, transparent 100%)',
        }} />

        {/* The mesh IS the product — replaces the generic blurred-orb
            background every other landing page uses with an actual (if
            stylized) picture of the masterless P2P topology. */}
        <HeroMeshBackdrop />

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 900, width: '100%' }}>


          {/* Headline */}
          {/* Set in ink.
              It used to run through a three-colour gradient on a loop,
              which drew the eye away from the words it was made of. Two
              lines, one weight, one colour -- and the only motion is the
              line itself arriving. */}
          <h1 className="hero-headline" style={{
            fontSize: 'clamp(34px,6.4vw,72px)',
            fontWeight: 600, lineHeight: 1.04, letterSpacing: '-0.035em',
            marginBottom: 26, color: INK,
          }}>
            <span className="hero-line" style={{ display: 'block', animationDelay: '0.05s' }}>Hybrid peer-to-peer</span>
            <span className="hero-line" style={{ display: 'block', animationDelay: '0.14s', color: INK_3 }}>file synchronization</span>
          </h1>

          <p style={{
            fontSize: 'clamp(15px,2vw,18px)', color: INK_2, lineHeight: 1.7,
            maxWidth: 620, margin: '0 auto 28px', animation: 'fadeInUp 0.8s ease 0.4s both',
          }}>
            A masterless peer-to-peer engine that logs every edit, detects concurrent changes with
            vector clocks, and syncs only the bytes that changed — so your team never silently
            overwrites each other&apos;s work, online or off.
          </p>

          {/* CTA Buttons */}
          <div className="hero-ctas" style={{
            display: 'flex', gap: 14, flexWrap: 'wrap',
            justifyContent: 'center', marginBottom: 28,
            animation: 'fadeInUp 0.8s ease 0.5s both',
          }}>
            <Link href="/download" className="btn-hero-primary" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: INK,
              color: '#fff', borderRadius: 2, height: 52, padding: '0 34px',
              fontSize: 16, fontWeight: 600, textDecoration: 'none',
              boxShadow: 'none',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}>
              <Download size={18} />
              Download for Windows
            </Link>
            <Link href="/app/welcome" className="btn-hero-ghost">
              Try the web app
              <ArrowRight size={16} />
            </Link>
            <Link href="https://github.com/PaulJohnnn/DocuSync" target="_blank" rel="noopener noreferrer"
              className="btn-hero-text" style={{
                display: 'inline-flex', alignItems: 'center',
                color: INK_2, fontSize: 15, fontWeight: 500,
                textDecoration: 'none', padding: '0 8px', height: 52,
              }}>
              GitHub
              <ExternalLink size={14} style={{ marginLeft: 6 }} />
            </Link>
          </div>

          {/* Platform pills */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            flexWrap: 'wrap', justifyContent: 'center', marginBottom: 64,
            animation: 'fadeInUp 0.8s ease 0.6s both',
          }}>
            <span style={{ fontSize: 12, color: INK_3 }}>Available on:</span>
            {['Windows', 'macOS', 'Linux', 'Web', 'Android'].map(p => (
              <span key={p} style={{
                fontSize: 11, fontWeight: 500, color: INK_2,
                background: '#fff',
                border: `1px solid ${LINE}`,
                borderRadius: 99, padding: '4px 12px',
              }}>{p}</span>
            ))}
          </div>


        </div>

        {/* Scroll indicator */}
        <div style={{
          position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          color: INK_3, fontSize: 20, animation: 'bounce 2s ease-in-out infinite',
        }}><ChevronDown size={22} /></div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 2 — THE PROBLEM
      ══════════════════════════════════════════════════════════ */}
      <section style={{ background: '#fafafa', padding: '100px clamp(20px,5vw,64px)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div className="scroll-hidden" style={{ textAlign: 'center', marginBottom: 56 }}>
            <SectionLabel>THE PROBLEM</SectionLabel>
            <h2 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 700, color: INK, marginBottom: 16 }}>
              Collaboration Shouldn&apos;t Mean Compromise
            </h2>
            <p style={{ fontSize: 16, color: INK_2, maxWidth: 580, margin: '0 auto', lineHeight: 1.7 }}>
              Are you tired of constantly creating &quot;File_Final_v2_Copy&quot; just to avoid losing your work? 
              Traditional cloud storage wasn&apos;t built for true real-time, offline-friendly teamwork.
            </p>
          </div>

          <div className="problem-grid scroll-hidden" style={{
            display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20,
          }}>
            {PROBLEMS.map((p, i) => (
              <div key={p.title} className="scroll-hidden problem-card" style={{
                borderTop: `1px solid ${LINE}`,
                padding: '28px 24px 28px 0',
                animationDelay: `${i * 90}ms`,
              }}>
                {/* The number does the work the coloured edge was doing,
                    and says something besides. */}
                <p style={{
                  fontSize: 12, fontWeight: 600, color: INK_3, marginBottom: 18,
                  fontVariantNumeric: 'tabular-nums', letterSpacing: '0.08em',
                }}>
                  {String(i + 1).padStart(2, '0')}
                </p>
                <h3 style={{ fontSize: 19, fontWeight: 600, color: INK, marginBottom: 8, letterSpacing: '-0.015em' }}>{p.title}</h3>
                <p style={{
                  fontSize: 11.5, color: INK_3, fontWeight: 500,
                  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14,
                }}>{p.types}</p>
                <p style={{ fontSize: 14.5, color: INK_2, lineHeight: 1.75 }}>{p.desc}</p>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 48 }} className="scroll-hidden">
            <p style={{ fontSize: 20, fontWeight: 600 }}>
              DocuSync solves all three
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 3 — FOUR ALGORITHMS
      ══════════════════════════════════════════════════════════ */}
      <section id="features" style={{ background: '#fff', padding: '100px clamp(20px,5vw,64px)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="scroll-hidden" style={{ textAlign: 'center', marginBottom: 60 }}>
            <SectionLabel>THE SOLUTION</SectionLabel>
            <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 700, color: INK, marginBottom: 14 }}>
              Four Smart Tools. One Seamless Experience.
            </h2>
            <p style={{ fontSize: 16, color: INK_2, maxWidth: 520, margin: '0 auto' }}>
              We&apos;ve hidden complex thesis-level technology behind a beautifully simple interface. Here&apos;s how DocuSync protects your work effortlessly.
            </p>
          </div>

          <div className="algo-grid" style={{
            display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 20,
          }}>
            {ALGORITHMS.map((a, i) => (
              <div key={a.title} className="algo-card scroll-hidden" style={{
                background: '#fff',
                border: `1px solid ${LINE}`,
                borderRadius: 2, padding: '34px 32px',
                transition: 'border-color 0.4s cubic-bezier(0.16,1,0.3,1), transform 0.4s cubic-bezier(0.16,1,0.3,1)',
                position: 'relative', overflow: 'hidden',
                animationDelay: `${i * 90}ms`,
              }}>
                {/* A hairline that draws itself across the top on hover --
                    the one piece of motion each card gets. */}
                <span className="algo-rule" style={{
                  position: 'absolute', top: 0, left: 0, height: 1, width: '100%',
                  background: INK, transformOrigin: 'left', transform: 'scaleX(0)',
                  transition: 'transform 0.5s cubic-bezier(0.16,1,0.3,1)',
                }} />
                <div style={{
                  position: 'absolute', top: 26, right: 30,
                  fontSize: 13, fontWeight: 500, color: LINE,
                  lineHeight: 1, userSelect: 'none', pointerEvents: 'none',
                  fontVariantNumeric: 'tabular-nums', letterSpacing: '0.1em',
                }}>{a.num}</div>
                <p style={{ fontSize: 11, fontWeight: 600, color: INK_3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
                  {a.algo}
                </p>
                <h3 style={{ fontSize: 21, fontWeight: 600, color: INK, marginBottom: 12, letterSpacing: '-0.02em' }}>{a.title}</h3>
                <p style={{ fontSize: 14.5, color: INK_2, lineHeight: 1.75, marginBottom: 22 }}>{a.desc}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingTop: 18, borderTop: `1px solid ${LINE_SOFT}` }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: INK }}>{a.pill}</span>
                  <span style={{ fontSize: 12, color: INK_3 }}>{a.metric}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 3.5 — PROVEN BY THE NUMBERS (real ISO/IEC 25010 results)
      ══════════════════════════════════════════════════════════ */}
      <section style={{ background: '#fafafa', padding: '100px clamp(20px,5vw,64px)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div className="scroll-hidden" style={{ textAlign: 'center', marginBottom: 48 }}>
            <SectionLabel>NOT JUST CLAIMS</SectionLabel>
            <h2 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 700, color: INK, marginBottom: 14 }}>
              Measured, Not Marketed
            </h2>
            <p style={{ fontSize: 16, color: INK_2, maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>
              Every number below comes from the thesis&apos;s own ISO/IEC 25010 evaluation suite —
              20 automated tests across functional suitability, performance, reliability, and compatibility.
            </p>
          </div>

          <div className="metrics-stat-grid scroll-hidden" style={{
            display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16,
          }}>
            {EVAL_METRICS.map((m, i) => (
              <div key={m.label} className="stat-card" style={{
                background: '#fff', border: `1px solid ${LINE}`,
                borderRadius: 2, padding: '28px 24px',
                transition: 'transform 0.4s cubic-bezier(0.16,1,0.3,1), border-color 0.4s',
                animationDelay: `${i * 70}ms`,
              }}>
                <div style={{
                  fontSize: 38, fontWeight: 600, color: INK, lineHeight: 1, marginBottom: 12,
                  fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em',
                }}>
                  {m.value}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginBottom: 6 }}>{m.label}</div>
                <div style={{ fontSize: 12.5, color: INK_3, lineHeight: 1.65 }}>{m.desc}</div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 4 — THREE PLATFORMS
      ══════════════════════════════════════════════════════════ */}
      <section id="download" style={{ background: '#fff', padding: '100px clamp(20px,5vw,64px)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="scroll-hidden" style={{ textAlign: 'center', marginBottom: 56 }}>
            <SectionLabel>PLATFORMS</SectionLabel>
            <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 700, color: INK, marginBottom: 14 }}>
              One Engine. Three Platforms.
            </h2>
            <p style={{ fontSize: 16, color: INK_2 }}>
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
                      background: '#fff',
                      border: `1px solid ${p.featured ? ACCENT : LINE}`,
                      borderRadius: 2, overflow: 'hidden',
                      display: 'flex', flexDirection: 'column',
                      position: 'relative',
                      boxShadow: 'none',
                      transition: 'box-shadow 0.3s ease',
                      animationDelay: `${i * 120}ms`,
                      height: '100%',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = p.featured ? ACCENT : '#d4d4d8';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = p.featured ? ACCENT : LINE;
                    }}
                  >
                    {/* Top accent bar */}
                    {!p.featured && <div style={{ height: 3, background: p.accent }} />}

                    {/* Featured badge */}
                    {p.featured && p.badge && (
                      <div style={{
                        position: 'absolute', top: 16, right: 16,
                        background: ACCENT, color: '#fff',
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

                      <h3 style={{ fontSize: 20, fontWeight: 700, color: INK, marginBottom: 4 }}>{p.title}</h3>
                      <p style={{ fontSize: 12, color: p.iconColor, fontWeight: 600, marginBottom: 14 }}>{p.subtitle}</p>
                      <p style={{ fontSize: 14, color: INK_2, lineHeight: 1.7, marginBottom: 20 }}>{p.desc}</p>
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
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          background: p.ctaBg, color: '#fff',
                          borderRadius: 10, height: 44, width: '100%',
                          fontSize: 14, fontWeight: 600, textDecoration: 'none',
                          transition: 'opacity 0.15s',
                        }} className="platform-cta"
                      >
                        {p.ctaIcon === 'download' ? <Download size={16} /> : null}
                        {p.cta}
                        {p.ctaIcon === 'download' ? null : <ArrowRight size={15} />}
                      </Link>
                      {p.ctaNote && (
                        <p style={{ fontSize: 11.5, color: INK_3, textAlign: 'center', marginTop: 10 }}>
                          {p.ctaNote}
                        </p>
                      )}
                      {p.ctaSecondary && (
                        <Link href={p.ctaSecondary.href} style={{
                          display: 'block', textAlign: 'center', marginTop: 8,
                          fontSize: 12, fontWeight: 500, color: INK_2, textDecoration: 'none',
                        }} className="platform-secondary">
                          {p.ctaSecondary.label}
                        </Link>
                      )}
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
        .btn-hero-primary:hover  { background: #18181b !important; }
        .btn-hero-ghost:hover    { background: var(--b1) !important; transform: translateY(-2px) !important; }
        .btn-hero-text:hover     { color: var(--t1) !important; text-decoration: underline !important; }
        /* ── Motion ──────────────────────────────────────────────
           One easing throughout, and it is a deceleration curve: things
           arrive and settle rather than bounce. Everything is short
           enough to feel like a response and long enough to be read as
           deliberate. */
        .hero-line {
          animation: ds-rise 0.9s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes ds-rise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .algo-card:hover         { border-color: #d4d4d8 !important; transform: translateY(-3px) !important; }
        .algo-card:hover .algo-rule { transform: scaleX(1) !important; }
        .problem-card:hover      { }
        .platform-card:hover     { transform: translateY(-3px) !important; }
        .platform-cta:hover      { opacity: 0.86 !important; }
        .platform-secondary:hover { color: #0a0a0a !important; text-decoration: underline !important; }
        .metrics-btn:hover       { background: #f4f4f5 !important; }
        .open-app-btn:hover      { background: #18181b !important; }
        .researcher-card:hover   { border-color: #d4d4d8 !important; transform: translateY(-2px) !important; }
        .metric-card:hover       { border-color: #d4d4d8 !important; transform: translateY(-2px) !important; }
        .stat-card:hover         { border-color: #d4d4d8 !important; transform: translateY(-3px) !important; }
        .cta-primary:hover       { background: #18181b !important; }
        .cta-ghost:hover         { background: rgba(255,255,255,0.06) !important; }
        .cta-text-link:hover     { color: #0a0a0a !important; }

        @media (prefers-reduced-motion: reduce) {
          .hero-line, .scroll-hidden { animation: none !important; opacity: 1 !important; transform: none !important; }
          .algo-card:hover, .stat-card:hover, .platform-card:hover { transform: none !important; }
        }

        /* There was a stray closing brace here, and it had been here a
           long time. CSS stops at the first thing it cannot parse, so
           every rule after it was dead -- which is why the layout never
           collapsed on a phone however narrow the window got. */
        @media (max-width: 900px) {
          .platforms-grid    { grid-template-columns: 1fr !important; max-width: 480px !important; margin: 0 auto !important; }
          .algo-grid         { grid-template-columns: 1fr !important; }
          .problem-grid      { grid-template-columns: 1fr !important; }
          .metrics-stat-grid { grid-template-columns: repeat(2,1fr) !important; }
        }
        @media (max-width: 520px) {
          .metrics-stat-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
