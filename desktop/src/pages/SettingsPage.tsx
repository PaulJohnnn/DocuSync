/**
 * @module SettingsPage
 * @description Node configuration and system settings — route `/settings`.
 * Displays node parameters, supported/rejected file types, and application info.
 * Reads the live node ID from the IPC getSyncStatus call; all other values are static.
 */
import React, { useEffect, useState } from 'react';
import { IconDatabase, IconShield, IconAlertTriangle } from '@/components/Icons';

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

/** Section card header. */
const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string }> = ({
  icon, title, subtitle,
}) => (
  <div style={{
    padding: '0.75rem 1rem',
    borderBottom: '1px solid var(--ds-border)',
    display: 'flex', alignItems: 'center', gap: '0.5rem',
  }}>
    <span style={{ color: 'var(--ds-accent)' }}>{icon}</span>
    <div>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--ds-text)' }}>{title}</div>
      {subtitle && <div style={{ fontSize: '0.62rem', color: 'var(--ds-text3)', marginTop: '1px' }}>{subtitle}</div>}
    </div>
  </div>
);

/** Config table row — alternating row background. */
const ConfigRow: React.FC<{ row: ConfigRow; index: number }> = ({ row, index }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: '200px 1fr',
    gap: '0.5rem',
    padding: '0.55rem 1rem',
    borderBottom: '1px solid var(--ds-border)',
    background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
    alignItems: 'center',
  }}>
    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--ds-text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {row.setting}
    </span>
    <code style={{ fontSize: '0.75rem', color: 'var(--ds-text)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
      {row.value}
    </code>
  </div>
);

/** Coloured extension tag. */
const ExtTag: React.FC<{ ext: string; rejected?: boolean }> = ({ ext, rejected = false }) => {
  const hue = TYPE_HUES[ext] ?? 220;
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: '999px',
      fontSize: '0.72rem',
      fontWeight: 700,
      fontFamily: 'monospace',
      background: rejected
        ? 'rgba(239,68,68,0.12)'
        : `hsla(${hue},60%,55%,0.15)`,
      color: rejected
        ? 'var(--ds-red, #ef4444)'
        : `hsl(${hue},70%,65%)`,
      border: `1px solid ${rejected
        ? 'rgba(239,68,68,0.25)'
        : `hsla(${hue},60%,55%,0.3)`}`,
    }}>
      {ext}
    </span>
  );
};

// ── SettingsPage ─────────────────────────────────────────────────────────────

/**
 * SettingsPage — Node configuration, file type support, and application info.
 * Fetches live node ID from IPC on mount; all other values are static config constants.
 */
const SettingsPage: React.FC = () => {
  const [nodeId, setNodeId] = useState<string>('Loading…');

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
        <span style={{ color: 'var(--ds-accent)' }}><IconDatabase size={16} /></span>
        <span className="ds-topbar-title">Settings</span>
        <span className="ds-topbar-subtitle">Node Configuration</span>
      </div>

      <div className="ds-main-scroll ds-page-enter">

        {/* Section 1 — Node Configuration */}
        <div className="ds-card" style={{ overflow: 'hidden', marginBottom: '1rem' }}>
          <SectionHeader
            icon={<IconDatabase size={14} />}
            title="Node Configuration"
            subtitle="Runtime parameters for this DocuSync node"
          />
          <div style={{ padding: '0.25rem 0' }}>
            {CONFIG_ROWS.map((row, i) => (
              <ConfigRow key={row.setting} row={row} index={i} />
            ))}
          </div>
        </div>

        {/* Section 2 — Supported File Types */}
        <div className="ds-card" style={{ overflow: 'hidden', marginBottom: '1rem' }}>
          <SectionHeader
            icon={<IconShield size={14} />}
            title="Supported File Types"
            subtitle="Text-based formats that support delta encoding and sync"
          />
          <div style={{ padding: '0.75rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {SUPPORTED_TYPES.map((ext) => (
              <ExtTag key={ext} ext={ext} />
            ))}
          </div>
        </div>

        {/* Section 3 — Rejected File Types */}
        <div className="ds-card" style={{ overflow: 'hidden', marginBottom: '1rem' }}>
          <SectionHeader
            icon={<IconAlertTriangle size={14} />}
            title="Rejected File Types"
            subtitle="Binary formats — delta encoding not applicable"
          />
          <div style={{ padding: '0.75rem 1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
              {REJECTED_TYPES.map((ext) => (
                <ExtTag key={ext} ext={ext} rejected />
              ))}
            </div>
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
              padding: '0.6rem 0.75rem',
              borderRadius: 'var(--ds-radius-sm)',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
            }}>
              <span style={{ fontSize: '0.75rem' }}>⚠️</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--ds-text2)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--ds-text)' }}>Reason:</strong>{' '}
                Binary formats break delta encoding. DocuSync's delta engine operates on UTF-8
                text streams. Importing binary files will result in rejection at the file-open stage.
              </span>
            </div>
          </div>
        </div>

        {/* Section 4 — About */}
        <div className="ds-card" style={{ overflow: 'hidden', marginBottom: '1rem' }}>
          <SectionHeader
            icon={<IconDatabase size={14} />}
            title="About"
          />
          <div style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{
                width: 40, height: 40, borderRadius: 'var(--ds-radius-sm)',
                background: 'var(--ds-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <IconDatabase size={20} style={{ color: '#fff' }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--ds-text)' }}>
                  DocuSync <span style={{ fontSize: '0.72rem', color: 'var(--ds-text3)', fontWeight: 400 }}>v1.0.0</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--ds-text2)', marginTop: '1px' }}>
                  Hybrid P2P Synchronization Engine
                </div>
              </div>
            </div>
            <a
              href="https://github.com/PaulJohnnn/DocuSync"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                fontSize: '0.72rem', color: 'var(--ds-accent)',
                textDecoration: 'none',
                padding: '4px 10px',
                borderRadius: 'var(--ds-radius-sm)',
                background: 'rgba(79,125,248,0.1)',
                border: '1px solid rgba(79,125,248,0.2)',
              }}
            >
              ⎋ github.com/PaulJohnnn/DocuSync
            </a>
          </div>
        </div>

      </div>
    </>
  );
};

export default SettingsPage;
