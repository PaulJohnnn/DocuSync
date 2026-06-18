/**
 * @module SettingsPage
 * @description Node configuration and system settings — route `/settings`.
 * Displays node parameters, supported/rejected file types, and application info.
 * Reads the live node ID from the IPC getSyncStatus call; all other values are static.
 */
import React, { useEffect, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import {
  Moon, Sun, Palette, Database, ShieldAlert, ShieldCheck, Info, Cpu,
  FileText, FileCode, FileJson, FileType as FileTypeIcon, File,
  FileImage, FileSpreadsheet, FileArchive, Settings as SettingsIcon
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface SyncStatusResponse {
  localNodeId: string;
  counters: number[];
  connectedPeers: string[];
  totalConnections: number;
  openFileCount: number;
  pendingConflicts: number;
  peerCount: number;
}

interface ConfigRow {
  setting: string;
  value: string;
}

// ── Data ─────────────────────────────────────────────────────────────────────

/** Supported document file extensions. */
const SUPPORTED_TYPES = ['.txt', '.md', '.docx', '.rtf', '.csv', '.json', '.xml', '.html', '.tex'];

/** Binary/unsupported file extensions. */
const REJECTED_TYPES = ['.png', '.jpg', '.jpeg', '.mp4', '.mp3', '.exe', '.zip'];

/** Hue map for supported type tag colours. */
const TYPE_HUES: Record<string, number> = {
  '.txt': 210, '.md': 160, '.docx': 220, '.rtf': 190,
  '.csv': 140, '.json': 270, '.xml': 30, '.html': 200, '.tex': 340,
};

// ── Sub-components ───────────────────────────────────────────────────────────

/** Helper to get icon for file extension */
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

/** Section card header. */
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

/** Config table row — alternating row background. */
const ConfigRow: React.FC<{ row: ConfigRow; index: number }> = ({ row, index }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: '240px 1fr',
    gap: '1rem',
    padding: '0.8rem 1.5rem',
    borderBottom: '1px solid var(--ds-border)',
    background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
    alignItems: 'center',
  }}>
    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ds-text2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {row.setting}
    </span>
    <span style={{ fontSize: '0.9rem', color: 'var(--ds-text)', fontWeight: 500, wordBreak: 'break-all' }}>
      {row.value}
    </span>
  </div>
);

/** Coloured extension tag with Icon. */
const ExtTag: React.FC<{ ext: string; rejected?: boolean }> = ({ ext, rejected = false }) => {
  const hue = TYPE_HUES[ext] ?? 220;
  const bg = rejected ? 'var(--ds-red-bg)' : `hsla(${hue},60%,55%,0.15)`;
  const color = rejected ? 'var(--ds-red)' : `hsl(${hue},70%,65%)`;
  const border = rejected ? 'var(--ds-red-border)' : `hsla(${hue},60%,55%,0.3)`;

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '6px 12px',
      borderRadius: '8px',
      background: bg,
      color: color,
      border: `1px solid ${border}`,
      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      transition: 'transform 0.2s ease',
      cursor: 'default'
    }}
    onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
    onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
    >
      {getExtIcon(ext)}
      <span style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'monospace' }}>
        {ext}
      </span>
    </div>
  );
};

// ── SettingsPage ─────────────────────────────────────────────────────────────

/**
 * SettingsPage — Node configuration, file type support, and application info.
 * Fetches live node ID from IPC on mount; all other values are static config constants.
 */
const SettingsPage: React.FC = () => {
  const [nodeId, setNodeId] = useState<string>('Loading…');
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  /** Fetch the local node ID once on mount via IPC. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!window.docuSync) { setNodeId('IPC unavailable'); return; }
      try {
        const res = await window.docuSync.getSyncStatus();
        if (!cancelled && res.success && res.data) {
          setNodeId((res.data as SyncStatusResponse).localNodeId);
        }
      } catch {
        if (!cancelled) setNodeId('Error fetching node ID');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** Build config rows dynamically so nodeId is live. */
  const CONFIG_ROWS: ConfigRow[] = [
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
      {/* Topbar */}
      <div className="ds-topbar">
        <span style={{ color: 'var(--ds-accent)' }}><SettingsIcon size={20} /></span>
        <span className="ds-topbar-title" style={{ fontSize: '1.25rem' }}>Settings</span>
        <span className="ds-topbar-subtitle" style={{ fontSize: '0.9rem' }}>Node Configuration</span>
      </div>

      <div className="ds-main-scroll ds-page-enter">

        {/* Section 0 — Appearance */}
        <div className="ds-card" style={{ overflow: 'hidden', marginBottom: '1rem' }}>
          <SectionHeader
            icon={<Palette size={14} />}
            title="Appearance"
            subtitle="Customise the interface theme"
          />
          <div style={{ padding: '1.2rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--ds-text)' }}>
                Theme Mode
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--ds-text3)', marginTop: '4px' }}>
                Switch between premium light and dark themes
              </div>
            </div>
            
            {/* Cool Toggle Button */}
            <button
              onClick={toggleTheme}
              style={{
                position: 'relative',
                width: '64px',
                height: '32px',
                borderRadius: '99px',
                background: isDark ? 'var(--ds-accent)' : '#d1d5db',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.3s ease',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: isDark ? '34px' : '2px',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.1)',
                  transition: 'left 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isDark ? 'var(--ds-accent)' : '#f59e0b'
                }}
              >
                {isDark ? <Moon size={14} /> : <Sun size={14} />}
              </div>
            </button>
          </div>
        </div>

        {/* Section 1 — Node Configuration */}
        <div className="ds-card" style={{ overflow: 'hidden', marginBottom: '1.5rem' }}>
          <SectionHeader
            icon={<Database size={18} />}
            title="Node Configuration"
            subtitle="Runtime parameters for this DocuSync node"
          />
          <div style={{ padding: '0.5rem 0' }}>
            {CONFIG_ROWS.map((row, i) => (
              <ConfigRow key={row.setting} row={row} index={i} />
            ))}
          </div>
        </div>

        {/* Section 2 — Supported File Types */}
        <div className="ds-card" style={{ overflow: 'hidden', marginBottom: '1.5rem' }}>
          <SectionHeader
            icon={<ShieldCheck size={18} />}
            title="Supported File Types"
            subtitle="Text-based formats that support delta encoding and sync"
          />
          <div style={{ padding: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.8rem' }}>
            {SUPPORTED_TYPES.map((ext) => (
              <ExtTag key={ext} ext={ext} />
            ))}
          </div>
        </div>

        {/* Section 3 — Rejected File Types */}
        <div className="ds-card" style={{ overflow: 'hidden', marginBottom: '1.5rem' }}>
          <SectionHeader
            icon={<ShieldAlert size={18} />}
            title="Rejected File Types"
            subtitle="Binary formats — delta encoding not applicable"
          />
          <div style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', marginBottom: '1.25rem' }}>
              {REJECTED_TYPES.map((ext) => (
                <ExtTag key={ext} ext={ext} rejected />
              ))}
            </div>
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.8rem',
              padding: '1rem 1.25rem',
              borderRadius: 'var(--ds-radius-lg)',
              background: 'var(--ds-red-bg)',
              border: '1px solid var(--ds-red-border)',
            }}>
              <span style={{ fontSize: '1.1rem' }}>⚠️</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--ds-text2)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--ds-text)', fontWeight: 600 }}>Reason:</strong>{' '}
                Binary formats break delta encoding. DocuSync's delta engine operates on UTF-8
                text streams. Importing binary files will result in rejection at the file-open stage.
              </span>
            </div>
          </div>
        </div>

        {/* Section 4 — About */}
        <div className="ds-card" style={{ overflow: 'hidden', marginBottom: '2rem' }}>
          <SectionHeader
            icon={<Info size={18} />}
            title="About"
          />
          <div style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{
                width: 56, height: 56,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <img src="/docusync-logo.svg" width={56} height={56} alt="DocuSync Logo" style={{ display: 'block' }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--ds-text)', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  DocuSync <span style={{ fontSize: '0.85rem', color: 'var(--ds-text3)', fontWeight: 500, background: 'var(--ds-bg-base)', padding: '2px 8px', borderRadius: '12px', border: '1px solid var(--ds-border)' }}>v1.0.0</span>
                </div>
                <div style={{ fontSize: '0.95rem', color: 'var(--ds-text2)', marginTop: '4px' }}>
                  Hybrid P2P Synchronization Engine
                </div>
              </div>
            </div>
            <a
              href="https://github.com/PaulJohnnn/DocuSync"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                fontSize: '0.9rem', color: 'var(--ds-accent)',
                textDecoration: 'none',
                padding: '8px 16px',
                borderRadius: 'var(--ds-radius-md)',
                background: 'var(--ds-accent-bg)',
                border: '1px solid var(--ds-accent-border)',
                fontWeight: 500,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--ds-accent)'}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--ds-accent-bg)';
                e.currentTarget.style.color = 'var(--ds-accent)';
              }}
              onMouseEnterCapture={(e) => e.currentTarget.style.color = '#fff'}
            >
              <Cpu size={16} /> github.com/PaulJohnnn/DocuSync
            </a>
          </div>
        </div>

      </div>
    </>
  );
};

export default SettingsPage;
