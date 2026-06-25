/**
 * @module SettingsPage
 * @description Node configuration, system settings, and Live Algorithm Metrics.
 */
import React, { useEffect, useState, useRef } from 'react';
import { useTheme } from '@/context/ThemeContext';
import {
  Moon, Sun, Palette, Database, ShieldAlert, ShieldCheck, Info, Cpu,
  FileText, FileCode, FileJson, FileType as FileTypeIcon, File,
  FileImage, FileSpreadsheet, FileArchive, Settings as SettingsIcon, Lock,
  User, Activity, FolderSync, Zap, Shield, Play, CheckCircle, Trash
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

import { encode } from '@docusync/shared/engine/delta/delta-encoder';
import { VectorClock } from '@docusync/shared/engine/vector-clock/vector-clock';

// ── Data Constants ──────────────────────────────────────────────────────────
const SUPPORTED_TYPES = ['.txt', '.md', '.docx', '.rtf', '.csv', '.json', '.xml', '.html', '.tex'];
const REJECTED_TYPES = ['.png', '.jpg', '.jpeg', '.mp4', '.mp3', '.exe', '.zip'];
const TYPE_HUES: Record<string, number> = {
  '.txt': 210, '.md': 160, '.docx': 220, '.rtf': 190,
  '.csv': 140, '.json': 270, '.xml': 30, '.html': 200, '.tex': 340,
};

// ── Sub-components ──────────────────────────────────────────────────────────
function getExtIcon(ext: string) {
  const norm = ext.replace('.', '').toLowerCase();
  switch (norm) {
    case 'md': case 'txt': case 'rtf': return <FileText size={16} />;
    case 'json': return <FileJson size={16} />;
    case 'docx': case 'doc': return <FileTypeIcon size={16} />;
    case 'csv': case 'tsv': case 'xlsx': case 'xls': return <FileSpreadsheet size={16} />;
    case 'xml': case 'html': case 'tex': case 'js': case 'ts': return <FileCode size={16} />;
    case 'png': case 'jpg': case 'jpeg': return <FileImage size={16} />;
    case 'mp4': case 'mp3': return <FileArchive size={16} />;
    case 'zip': case 'exe': return <FileArchive size={16} />;
    default: return <File size={16} />;
  }
}

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string }> = ({
  icon, title, subtitle,
}) => (
  <div style={{
    padding: '1.2rem 1.5rem',
    borderBottom: '1px solid var(--ds-border)',
    display: 'flex', alignItems: 'center', gap: '0.8rem',
  }}>
    <span style={{ color: 'var(--ds-accent)', display: 'flex', alignItems: 'center', padding: '6px', background: 'var(--ds-accent-bg)', borderRadius: '8px' }}>{icon}</span>
    <div>
      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ds-text)' }}>{title}</div>
      {subtitle && <div style={{ fontSize: '0.85rem', color: 'var(--ds-text3)', marginTop: '2px' }}>{subtitle}</div>}
    </div>
  </div>
);

const ConfigRow: React.FC<{ row: { setting: string; value: string }; index: number }> = ({ row, index }) => (
  <div style={{
    display: 'grid', gridTemplateColumns: '240px 1fr', gap: '1rem',
    padding: '0.8rem 1.5rem', borderBottom: '1px solid var(--ds-border)',
    background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', alignItems: 'center',
  }}>
    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ds-text2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{row.setting}</span>
    <span style={{ fontSize: '0.9rem', color: 'var(--ds-text)', fontWeight: 500, wordBreak: 'break-all' }}>{row.value}</span>
  </div>
);

const ExtTag: React.FC<{ ext: string; rejected?: boolean }> = ({ ext, rejected = false }) => {
  const hue = TYPE_HUES[ext] ?? 220;
  const bg = rejected ? 'var(--ds-red-bg)' : `hsla(${hue},60%,55%,0.15)`;
  const color = rejected ? 'var(--ds-red)' : `hsl(${hue},70%,65%)`;
  const border = rejected ? 'var(--ds-red-border)' : `hsla(${hue},60%,55%,0.3)`;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
      borderRadius: '8px', background: bg, color: color, border: `1px solid ${border}`,
      boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'transform 0.2s ease', cursor: 'default'
    }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
      {getExtIcon(ext)} <span style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'monospace' }}>{ext}</span>
    </div>
  );
};

// ── SettingsPage ─────────────────────────────────────────────────────────────

const SettingsPage: React.FC = () => {
  const [nodeId, setNodeId] = useState<string>('Loading…');
  const [activeTab, setActiveTab] = useState<'account' | 'system' | 'files' | 'about'>('account');
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  // Cache management state
  const [cacheRowCount, setCacheRowCount] = useState<number | null>(null);
  const [cleanupResult, setCleanupResult] = useState<{ deletedCount: number; totalAfter: number } | null>(null);
  const [cleaningUp, setCleaningUp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!window.docuSync) return;
      try {
        const res = await window.docuSync.getSyncStatus();
        if (!cancelled && res.success && res.data) setNodeId((res.data as any).localNodeId);
      } catch {}
      // Also fetch cache size
      try {
        const cs = await (window.docuSync as any).getCacheSize?.();
        if (!cancelled && cs?.success) setCacheRowCount((cs.data as any).rowCount);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const handleCacheCleanup = async () => {
    setCleaningUp(true);
    try {
      const res = await (window.docuSync as any).cacheAutoCleanup?.();
      if (res?.success) {
        setCleanupResult({ deletedCount: res.data.deletedCount, totalAfter: res.data.totalAfter });
        setCacheRowCount(res.data.totalAfter);
      }
    } catch (err) {
      console.error('Cache cleanup failed:', err);
    } finally {
      setCleaningUp(false);
    }
  };



  const CONFIG_ROWS = [
    { setting: 'Node ID',              value: nodeId },
    { setting: 'WS Port',              value: '9000' },
    { setting: 'Node Count',           value: '3' },
    { setting: 'Node Index',           value: '0' },
    { setting: 'Sync Interval',        value: '300–500ms' },
    { setting: 'Max Concurrent Users', value: '15' },
    { setting: 'Conflict Policy',      value: 'LWW + Owner Escalation' },
    { setting: 'Chunk Size',           value: '4MB' },
  ];

  return (
    <>
      <div className="ds-topbar">
        <span style={{ color: 'var(--ds-accent)' }}><SettingsIcon size={20} /></span>
        <span className="ds-topbar-title" style={{ fontSize: '1.25rem' }}>Settings</span>
        <span className="ds-topbar-subtitle" style={{ fontSize: '0.9rem' }}>Preferences & Engine</span>
      </div>

      <div className="ds-main-scroll ds-page-enter" style={{ display: 'flex', gap: '2rem', padding: '1.5rem', alignItems: 'flex-start' }}>
        
        {/* Left Sidebar Tabs */}
        <div style={{ width: '240px', display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
          {['account', 'system', 'files', 'about'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: activeTab === tab ? 'var(--ds-accent-bg)' : 'transparent',
                color: activeTab === tab ? 'var(--ds-accent)' : 'var(--ds-text2)',
                fontWeight: activeTab === tab ? 600 : 500,
                borderLeft: activeTab === tab ? '3px solid var(--ds-accent)' : '3px solid transparent',
                transition: 'all 0.2s', textAlign: 'left'
              }}
            >
              {tab === 'account' && <><User size={18} /> Account & Appearance</>}
              {tab === 'system' && <><Cpu size={18} /> System & Engine</>}
              {tab === 'files' && <><FolderSync size={18} /> File Management</>}
              {tab === 'about' && <><Info size={18} /> About DocuSync</>}
            </button>
          ))}
        </div>

        {/* Right Content Area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          
          {activeTab === 'account' && (
            <div className="ds-page-enter">
              <div className="ds-card" style={{ overflow: 'hidden', marginBottom: '1.5rem' }}>
                <SectionHeader icon={<Palette size={14} />} title="Appearance" subtitle="Customise the interface theme" />
                <div style={{ padding: '1.2rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--ds-text)' }}>Theme Mode</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--ds-text3)', marginTop: '4px' }}>Switch between premium light and dark themes</div>
                  </div>
                  <button
                    onClick={toggleTheme}
                    style={{
                      position: 'relative', width: '64px', height: '32px', borderRadius: '99px',
                      background: isDark ? 'var(--ds-accent)' : '#d1d5db', border: 'none', cursor: 'pointer',
                      transition: 'background 0.3s ease', padding: 0, display: 'flex', alignItems: 'center',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute', left: isDark ? '34px' : '2px', width: '28px', height: '28px',
                        borderRadius: '50%', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                        transition: 'left 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', color: isDark ? 'var(--ds-accent)' : '#f59e0b'
                      }}
                    >
                      {isDark ? <Moon size={14} /> : <Sun size={14} />}
                    </div>
                  </button>
                </div>
              </div>

              <div className="ds-card" style={{ overflow: 'hidden', marginBottom: '1.5rem' }}>
                <SectionHeader icon={<Lock size={14} />} title="Account" subtitle="Manage your local vault session" />
                <div style={{ padding: '1.2rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--ds-text)' }}>Lock Repository</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--ds-text3)', marginTop: '4px' }}>Log out and securely lock your local vault</div>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const res = await window.docuSync.lockVault();
                        if (res.success) window.location.hash = '/vault-login';
                      } catch (err) { console.error('Failed to lock vault', err); }
                    }}
                    style={{
                      background: 'var(--ds-red-bg)', border: '1px solid var(--ds-red-border)',
                      color: 'var(--ds-red)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                      fontWeight: 600, fontSize: '0.85rem'
                    }}
                  >
                    Lock Vault
                  </button>
                </div>
              </div>

              <div className="ds-card" style={{ overflow: 'hidden', marginBottom: '1.5rem' }}>
                <SectionHeader icon={<Trash size={14} />} title="Reset Application Data" subtitle="Clear all local data and restore to a fresh state" />
                <div style={{ padding: '1.2rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--ds-text)' }}>Factory Reset</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--ds-text3)', marginTop: '4px' }}>Wipe all settings, sessions, and files locally.</div>
                  </div>
                  <button
                    onClick={() => {
                      if (window.confirm("Are you sure you want to completely wipe DocuSync data? This cannot be undone.")) {
                        localStorage.clear();
                        window.location.reload();
                      }
                    }}
                    style={{
                      background: 'var(--ds-red-bg)', border: '1px solid var(--ds-red-border)',
                      color: 'var(--ds-red)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                      fontWeight: 600, fontSize: '0.85rem'
                    }}
                  >
                    Clear All Data
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'system' && (
            <div className="ds-page-enter">
              <div className="ds-card" style={{ overflow: 'hidden', marginBottom: '1.5rem' }}>
                <SectionHeader icon={<Database size={18} />} title="Node Configuration" subtitle="Runtime parameters for this DocuSync node" />
                <div style={{ padding: '0.5rem 0' }}>
                  {CONFIG_ROWS.map((row, i) => <ConfigRow key={row.setting} row={row} index={i} />)}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'files' && (
            <div className="ds-page-enter">
              <div className="ds-card" style={{ overflow: 'hidden', marginBottom: '1.5rem' }}>
                <SectionHeader icon={<ShieldCheck size={18} />} title="Supported File Types" subtitle="Text-based formats that support delta encoding and sync" />
                <div style={{ padding: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.8rem' }}>
                  {SUPPORTED_TYPES.map(ext => <ExtTag key={ext} ext={ext} />)}
                </div>
              </div>
              <div className="ds-card" style={{ overflow: 'hidden', marginBottom: '1.5rem' }}>
                <SectionHeader icon={<ShieldAlert size={18} />} title="Rejected File Types" subtitle="Binary formats — delta encoding not applicable" />
                <div style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', marginBottom: '1.25rem' }}>
                    {REJECTED_TYPES.map(ext => <ExtTag key={ext} ext={ext} rejected />)}
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: '0.8rem', padding: '1rem 1.25rem',
                    borderRadius: 'var(--ds-radius-lg)', background: 'var(--ds-red-bg)', border: '1px solid var(--ds-red-border)',
                  }}>
                    <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                    <span style={{ fontSize: '0.9rem', color: 'var(--ds-text2)', lineHeight: 1.6 }}>
                      <strong style={{ color: 'var(--ds-text)', fontWeight: 600 }}>Reason:</strong>{' '}
                      Binary formats break delta encoding. DocuSync's delta engine operates on UTF-8 text streams. Importing binary files will result in rejection at the file-open stage.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}



          {activeTab === 'about' && (
            <div className="ds-page-enter">
              {/* Cache Management */}
              <div className="ds-card" style={{ overflow: 'hidden', marginBottom: '2rem' }}>
                <SectionHeader icon={<Database size={18} />} title="Cache Management" subtitle="Auto-prune compacted EventLog rows" />
                <div style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ds-text3)', marginBottom: 4 }}>EventLog Rows</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: cacheRowCount !== null && cacheRowCount > 1000 ? 'var(--ds-amber)' : 'var(--ds-green)' }}>
                        {cacheRowCount !== null ? cacheRowCount.toLocaleString() : '—'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--ds-text3)', marginTop: 2 }}>Auto-cleanup fires at &gt;1000 rows</div>
                    </div>
                    {cleanupResult && (
                      <div>
                        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ds-text3)', marginBottom: 4 }}>Last Cleanup</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ds-green)' }}>
                          -{cleanupResult.deletedCount}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--ds-text3)', marginTop: 2 }}>rows deleted &rarr; {cleanupResult.totalAfter.toLocaleString()} remain</div>
                      </div>
                    )}
                  </div>
                  <button
                    className="ds-btn ds-btn-ghost"
                    onClick={handleCacheCleanup}
                    disabled={cleaningUp}
                    style={{ fontSize: '0.85rem', padding: '8px 16px', border: '1px solid var(--ds-border)' }}
                  >
                    {cleaningUp ? '⏳ Running cleanup…' : '🗑️ Run Cache Cleanup Now'}
                  </button>
                  <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--ds-text3)', lineHeight: 1.6 }}>
                    Deletes compacted EventLog entries older than 30 days when the table exceeds 1,000 rows.
                    This runs automatically on every app startup.
                  </div>
                </div>
              </div>

              {/* About */}
              <div className="ds-card" style={{ overflow: 'hidden', marginBottom: '2rem' }}>
                <SectionHeader icon={<Info size={18} />} title="About" />
                <div style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <img src="/icon.png" width={56} height={56} alt="Logo" style={{ display: 'block', borderRadius: 14 }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--ds-text)' }}>DocuSync</div>
                      <div style={{ fontSize: '0.95rem', color: 'var(--ds-text2)', marginTop: '4px' }}>Hybrid P2P Synchronization Engine</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
};

export default SettingsPage;
