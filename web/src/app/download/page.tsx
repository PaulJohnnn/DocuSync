import Link from 'next/link';
import type { Metadata } from 'next';
import { Monitor, Globe, Smartphone, Download, Check, ArrowRight, ExternalLink, RefreshCw } from 'lucide-react';

/**
 * The current Windows installer.
 *
 * `releases/latest` is resolved by GitHub at request time, so this points
 * at the newest published release without anyone having to edit it. The
 * asset name must match what electron-builder produces
 * (`artifactName: "DocuSync.exe"` in desktop/package.json).
 */
const DESKTOP_DOWNLOAD_URL =
  'https://github.com/PaulJohnnn/DocuSync/releases/latest/download/DocuSync.exe';

export const metadata: Metadata = {
  title: 'Download DocuSync',
  description: 'Download the hybrid P2P file synchronization engine for Desktop, Web, and Mobile.',
};

type Release = { version: string | null; size: string | null; published: string | null };

/**
 * What the Windows card says about the build on offer.
 *
 * Asked of GitHub rather than written here, because a hardcoded label
 * drifts exactly the way the download link did: the page went on saying
 * v1.0.5 while the button correctly served a newer build, which is worse
 * than either being wrong on its own. Revalidated hourly, and each field
 * is simply omitted if the call fails, rather than asserting a stale one.
 */
async function latestRelease(): Promise<Release> {
  const empty: Release = { version: null, size: null, published: null };
  try {
    const res = await fetch(
      'https://api.github.com/repos/PaulJohnnn/DocuSync/releases/latest',
      { next: { revalidate: 3600 }, headers: { Accept: 'application/vnd.github+json' } },
    );
    if (!res.ok) return empty;
    const json = await res.json();
    const tag = typeof json?.tag_name === 'string' && json.tag_name ? json.tag_name : null;
    const asset = Array.isArray(json?.assets)
      ? json.assets.find((a: { name?: string }) => a?.name === 'DocuSync.exe')
      : null;
    const bytes = Number(asset?.size);
    const date = json?.published_at ? new Date(json.published_at) : null;
    return {
      version: tag,
      size: Number.isFinite(bytes) && bytes > 0 ? `${Math.round(bytes / 1048576)} MB` : null,
      // A fixed locale, so the server and the browser never disagree
      // about how the date is spelled.
      published: date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        : null,
    };
  } catch {
    return empty;
  }
}

const PAGE_X = 'clamp(20px,5vw,64px)';

const DESKTOP_INCLUDES = [
  'Local SQLite database, kept on your own machine',
  'Native file picker for opening and saving documents',
  'Peer-to-peer WebSocket server for same-network rooms',
  'Works offline, then reconciles when you reconnect',
];

const WEB_INCLUDES = [
  'Nothing to install — open it and sign in',
  'Share a room with its six-character code',
  'Sits in the same room as the desktop app',
];

const MOBILE_INCLUDES = [
  'Runs inside Expo Go, so no app store review',
  'Touch layout over the same sync engine',
  'Read and edit room documents on the move',
];

/** One step of the install walkthrough. */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <span style={{
        flexShrink: 0, width: 28, height: 28, borderRadius: 99,
        background: 'rgba(79,125,248,0.12)', border: '1px solid rgba(79,125,248,0.30)',
        color: '#4f7df8', fontSize: 13, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{n}</span>
      <div>
        <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--t1)', marginBottom: 4 }}>{title}</p>
        <p style={{ fontSize: 13.5, color: 'var(--t2)', lineHeight: 1.65 }}>{children}</p>
      </div>
    </li>
  );
}

/** A tick-listed feature line, shared by all three cards. */
function Included({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--t2)' }}>
      <Check size={15} color={color} strokeWidth={3} style={{ flexShrink: 0, marginTop: 3 }} />
      <span>{children}</span>
    </li>
  );
}

export default async function DownloadPage() {
  const { version, size, published } = await latestRelease();

  // The three facts people actually want before clicking: which build,
  // how big, and when it was put there.
  const facts = [version, size, published && `published ${published}`].filter(Boolean) as string[];

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--t1)', minHeight: 'calc(100vh - 64px)', overflowX: 'hidden' }}>

      {/* HERO */}
      <section style={{ padding: `72px ${PAGE_X} 44px`, textAlign: 'center' }}>
        <h1 style={{ fontSize: 'clamp(30px,5vw,44px)', fontWeight: 800, color: 'var(--t1)', marginBottom: 12 }}>
          Download DocuSync
        </h1>
        <p style={{ fontSize: 'clamp(15px,2vw,18px)', color: 'var(--t2)', maxWidth: 560, margin: '0 auto', lineHeight: 1.65 }}>
          The desktop app is the full engine. The web app needs no installation. Both work in the
          same room, on the same documents.
        </p>
      </section>

      {/* THE WINDOWS BUILD — the one most people came for, so it gets the
          width and everything else sits underneath it. */}
      <section style={{ padding: `0 ${PAGE_X} 56px` }}>
        <div style={{
          maxWidth: 1080, margin: '0 auto',
          background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: 20,
          overflow: 'hidden',
        }}>
          <div className="dl-primary" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>

            {/* Left: what it is and the button */}
            <div style={{ padding: 'clamp(28px,4vw,40px)' }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14, marginBottom: 18,
                background: 'rgba(79,125,248,0.12)', border: '1px solid rgba(79,125,248,0.28)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Monitor size={24} color="#4f7df8" />
              </div>

              <h2 style={{ fontSize: 'clamp(22px,3vw,28px)', fontWeight: 700, color: 'var(--t1)', marginBottom: 10 }}>
                DocuSync for Windows
              </h2>

              {facts.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                  {facts.map((f, i) => (
                    <span key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {i > 0 && <span aria-hidden="true" style={{ color: 'var(--t3)' }}>·</span>}
                      <span style={{
                        fontSize: 12.5, fontWeight: 600,
                        color: i === 0 ? '#4f7df8' : 'var(--t3)',
                      }}>{f}</span>
                    </span>
                  ))}
                </div>
              )}

              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'grid', gap: 10 }}>
                {DESKTOP_INCLUDES.map((line) => <Included key={line} color="#4f7df8">{line}</Included>)}
              </ul>

              <Link
                href={DESKTOP_DOWNLOAD_URL}
                className="dl-btn-blue"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  background: '#4f7df8', color: '#fff', borderRadius: 12, height: 52,
                  fontSize: 15.5, fontWeight: 600, textDecoration: 'none',
                  transition: 'background 0.15s ease',
                }}
              >
                <Download size={18} />
                Download for Windows
              </Link>

              <p style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', marginTop: 12, lineHeight: 1.6 }}>
                Windows 10 or 11, 64-bit. macOS and Linux can be built from source.
              </p>
            </div>

            {/* Right: what it looks like */}
            <div className="dl-preview" style={{
              background: 'var(--bg2)', borderLeft: '1px solid var(--b1)',
              display: 'flex', alignItems: 'center', padding: 'clamp(24px,3vw,32px)',
            }}>
              <img
                src="/desktop-preview.png"
                alt="The DocuSync desktop editor, showing a shared document open with the peer panel beside it"
                width={1200}
                height={675}
                style={{
                  width: '100%', height: 'auto', display: 'block',
                  borderRadius: 12, border: '1px solid var(--b1)',
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* INSTALLING IT — the questions people actually ask, including the
          Windows warning, which stops more installs than any missing
          feature does. */}
      <section style={{ padding: `0 ${PAGE_X} 56px` }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', marginBottom: 20 }}>
            Installing it
          </h3>
          <div className="dl-install" style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 20, alignItems: 'start' }}>

            <ol style={{
              listStyle: 'none', padding: 'clamp(22px,3vw,28px)', margin: 0,
              display: 'grid', gap: 22,
              background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: 16,
            }}>
              <Step n={1} title="Download the file">
                DocuSync.exe lands in your Downloads folder. There is no installer wizard — the file
                is the application.
              </Step>
              <Step n={2} title="Let Windows run it">
                The build is not code-signed, so Windows shows a blue &ldquo;Windows protected your
                PC&rdquo; panel. Choose <strong style={{ color: 'var(--t2)' }}>More info</strong>, then{' '}
                <strong style={{ color: 'var(--t2)' }}>Run anyway</strong>.
              </Step>
              <Step n={3} title="Sign in with your DocuSync account">
                The same account as the web app. Your rooms, files and version history are already
                there — nothing has to be moved across.
              </Step>
            </ol>

            <div style={{
              padding: 'clamp(22px,3vw,28px)', borderRadius: 16,
              background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)',
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                <RefreshCw size={17} color="#22c55e" />
                <p style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--t1)' }}>
                  It keeps itself current
                </p>
              </div>
              <p style={{ fontSize: 13.5, color: 'var(--t2)', lineHeight: 1.7 }}>
                The desktop app runs the live DocuSync service rather than a frozen copy of it, so
                improvements reach it as soon as they are published. You download this file once;
                you do not have to download it again each time something changes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* THE OTHER TWO WAYS TO RUN IT */}
      <section style={{ padding: `0 ${PAGE_X} 72px` }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', marginBottom: 20 }}>
            Other ways to run it
          </h3>

          <div className="dl-secondary" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

            {/* Web */}
            <div style={{
              background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: 16,
              padding: 'clamp(22px,3vw,28px)', display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.28)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Globe size={20} color="#22c55e" />
                </div>
                <div>
                  <h4 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t1)' }}>DocuSync Web</h4>
                  <p style={{ fontSize: 12.5, color: '#22c55e', fontWeight: 600 }}>No installation</p>
                </div>
              </div>

              <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 24px', display: 'grid', gap: 9 }}>
                {WEB_INCLUDES.map((line) => <Included key={line} color="#22c55e">{line}</Included>)}
              </ul>

              <Link href="/app/login" className="dl-btn-green" style={{
                marginTop: 'auto',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: '#22c55e', color: '#fff', borderRadius: 10, height: 46,
                fontSize: 14.5, fontWeight: 600, textDecoration: 'none',
                transition: 'background 0.15s ease',
              }}>
                Open the web app
                <ArrowRight size={16} />
              </Link>
            </div>

            {/* Mobile */}
            <div style={{
              background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: 16,
              padding: 'clamp(22px,3vw,28px)', display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.28)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Smartphone size={20} color="#8b5cf6" />
                </div>
                <div>
                  <h4 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t1)' }}>DocuSync Mobile</h4>
                  <p style={{ fontSize: 12.5, color: '#8b5cf6', fontWeight: 600 }}>Android and iOS, via Expo Go</p>
                </div>
              </div>

              <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 20px', display: 'grid', gap: 9 }}>
                {MOBILE_INCLUDES.map((line) => <Included key={line} color="#8b5cf6">{line}</Included>)}
              </ul>

              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <Link href="https://apps.apple.com/us/app/expo-go/id982107779" target="_blank" rel="noopener noreferrer"
                  className="dl-btn-quiet" style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    height: 42, borderRadius: 10, fontSize: 13, fontWeight: 600,
                    background: 'var(--s2)', color: 'var(--t1)', border: '1px solid var(--b1)',
                    textDecoration: 'none', transition: 'background 0.15s ease',
                  }}>
                  App Store
                  <ExternalLink size={13} />
                </Link>
                <Link href="https://play.google.com/store/apps/details?id=host.exp.exponent" target="_blank" rel="noopener noreferrer"
                  className="dl-btn-quiet" style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    height: 42, borderRadius: 10, fontSize: 13, fontWeight: 600,
                    background: 'var(--s2)', color: 'var(--t1)', border: '1px solid var(--b1)',
                    textDecoration: 'none', transition: 'background 0.15s ease',
                  }}>
                  Play Store
                  <ExternalLink size={13} />
                </Link>
              </div>

              <p style={{ marginTop: 'auto', fontSize: 12, color: 'var(--t3)', lineHeight: 1.6 }}>
                Then run{' '}
                <code style={{ background: 'var(--b1)', padding: '2px 6px', borderRadius: 4, color: 'var(--t1)' }}>
                  npx expo start
                </code>{' '}
                in the mobile folder and scan the code it prints.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SYSTEM REQUIREMENTS */}
      <section style={{ padding: `0 ${PAGE_X} 96px` }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', marginBottom: 20 }}>
            System requirements
          </h3>

          <div style={{ overflowX: 'auto', borderRadius: 16, border: '1px solid var(--b1)' }}>
            <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--s1)', borderBottom: '1px solid var(--b1)' }}>
                  {['Platform', 'Operating system', 'RAM', 'Storage'].map((h) => (
                    <th key={h} style={{
                      padding: '14px 24px', fontSize: 11.5, fontWeight: 600, color: 'var(--t3)',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Desktop', 'Windows 10 or 11 · macOS 11+ and Linux from source', '4 GB', '200 MB'],
                  ['Web', 'Chrome, Firefox, Safari or Edge', '—', '—'],
                  ['Mobile', 'Android 8+ or iOS 13+', '2 GB', '50 MB'],
                ].map(([platform, os, ram, storage], i) => (
                  <tr key={platform} style={{ borderBottom: i < 2 ? '1px solid var(--b1)' : undefined }}>
                    <td style={{ padding: '14px 24px', fontSize: 14, color: 'var(--t1)', fontWeight: 600 }}>{platform}</td>
                    <td style={{ padding: '14px 24px', fontSize: 14, color: 'var(--t2)' }}>{os}</td>
                    <td style={{ padding: '14px 24px', fontSize: 14, color: 'var(--t2)' }}>{ram}</td>
                    <td style={{ padding: '14px 24px', fontSize: 14, color: 'var(--t2)' }}>{storage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <style>{`
        .dl-btn-blue:hover  { background: #3d6ef0 !important; }
        .dl-btn-green:hover { background: #16a34a !important; }
        .dl-btn-quiet:hover { background: var(--b1) !important; }

        @media (max-width: 900px) {
          .dl-primary   { grid-template-columns: 1fr !important; }
          .dl-preview   { border-left: none !important; border-top: 1px solid var(--b1) !important; }
          .dl-install   { grid-template-columns: 1fr !important; }
          .dl-secondary { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
