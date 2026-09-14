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
import ConfirmModal from '@/components/ConfirmModal';

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

  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModalState({ isOpen: true, title, message, onConfirm });
  };

  const closeConfirm = () => {
    setConfirmModalState(prev => ({ ...prev, isOpen: false }));
  };

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
      <ConfirmModal
        isOpen={confirmModalState.isOpen}
        title={confirmModalState.title}
        message={confirmModalState.message}
        onConfirm={confirmModalState.onConfirm}
        onCancel={closeConfirm}
        confirmText="Confirm"
        cancelText="Cancel"
        isDestructive={true}
      />
      <div style={{ width: '100%', maxWidth: 1100, paddingBottom: 60, alignSelf: 'flex-start', paddingTop: 30, paddingLeft: 24, paddingRight: 24 }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ds-text)', margin: 0 }}>Settings</h1>
            <p style={{ fontSize: 13, color: 'var(--ds-text3)', margin: '4px 0 0' }}>Manage parameters and preferences</p>
          </div>
          <button onClick={handleCacheCleanup} disabled={cleaningUp} style={{ 
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', 
            borderRadius: 8, border: '1px solid var(--ds-border)', background: 'var(--ds-surface)', 
            cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--ds-text)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}>
            <Database size={14} /> {cleaningUp ? 'Pruning…' : 'Sync / Prune EventLog'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '3rem', alignItems: 'flex-start' }}>
          
          {/* Left Sidebar */}
          <div style={{ width: '280px', flexShrink: 0, position: 'sticky', top: 20 }}>
            <div style={{ background: 'var(--ds-surface)', borderRadius: 16, border: '1px solid var(--ds-border)', padding: 16, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {['account', 'system', 'files', 'about'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                      borderRadius: '999px', border: 'none', cursor: 'pointer',
                      background: activeTab === tab ? 'rgba(79, 70, 229, 0.08)' : 'transparent',
                      color: activeTab === tab ? 'rgb(79, 70, 229)' : 'var(--ds-text2)',
                      fontWeight: activeTab === tab ? 600 : 500,
                      transition: 'all 0.2s', textAlign: 'left', fontSize: 14
                    }}
                  >
                    {tab === 'account' && <><User size={18} /> Account & Appearance</>}
                    {tab === 'system' && <><Cpu size={18} /> System & Engine</>}
                    {tab === 'files' && <><FolderSync size={18} /> File Management</>}
                    {tab === 'about' && <><Info size={18} /> About DocuSync</>}
                  </button>
                ))}
              </div>
            </div>
          </div>

        {/* Right Content Area */}
        <div style={{ flex: 1, minWidth: 0, animation: 'fadeIn 0.3s ease' }}>
          
          {activeTab === 'account' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

              {/* Profile */}
              <div style={{ background: 'var(--ds-surface)', borderRadius: 16, border: '1px solid var(--ds-border)', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div style={{ padding: '20px 24px' }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ds-text)', margin: 0 }}>Profile & Local Identity</h2>
                  <p style={{ fontSize: 13, color: 'var(--ds-text3)', margin: '4px 0 24px' }}>Manage your profile information and UI preferences.</p>
                  
                  <div style={{ background: 'var(--ds-surface)', borderRadius: 12, border: '1px solid var(--ds-border)', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                      <div style={{ position: 'relative' }}>
                        <div style={{ width: 64, height: 64, borderRadius: 16, background: '#4f46e5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700 }}>
                          D
                        </div>
                        <div style={{ position: 'absolute', bottom: -4, right: -4, width: 20, height: 20, background: '#10b981', borderRadius: '50%', border: '4px solid var(--ds-surface)' }} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ds-text)' }}>Local User</div>
                          <div style={{ background: 'rgba(79, 70, 229, 0.1)', color: 'rgb(79, 70, 229)', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>Local Node Owner</div>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--ds-text3)', marginBottom: 2 }}>@{nodeId}</div>
                        <div style={{ fontSize: 13, color: 'var(--ds-text2)' }}>Decentralized workspace accessible by peers.</div>
                      </div>
                    </div>
                    <button style={{ background: '#4f46e5', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: '999px', cursor: 'pointer', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 2px 4px rgba(79,70,229,0.3)' }}>
                      Edit Profile
                    </button>
                  </div>

                  <div style={{ marginTop: 32 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ds-text)', margin: 0 }}>Credentials & Security</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--ds-accent-bg)', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: 'var(--ds-text3)' }}>
                          <Lock size={12} /> Locked
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', fontSize: 12, fontWeight: 600 }}>
                        <ShieldCheck size={14} /> Zero Cloud Dependency
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 24 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ds-text2)', marginBottom: 8 }}>Local Identifier (Username)</label>
                        <div style={{ position: 'relative' }}>
                          <input type="text" readOnly value={nodeId} style={{ width: '100%', background: 'var(--ds-accent-bg)', border: '1px solid var(--ds-border)', borderRadius: 12, padding: '12px 16px', fontSize: 14, color: 'var(--ds-text2)', outline: 'none' }} />
                          <Lock size={16} style={{ position: 'absolute', right: 16, top: 14, color: 'var(--ds-text3)' }} />
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ds-text2)', marginBottom: 8 }}>6-Digit Security PIN</label>
                        <div style={{ position: 'relative' }}>
                          <input type="password" readOnly value="******" style={{ width: '100%', background: 'var(--ds-accent-bg)', border: '1px solid var(--ds-border)', borderRadius: 12, padding: '12px 16px', fontSize: 14, color: 'var(--ds-text2)', outline: 'none', letterSpacing: 4 }} />
                          <Lock size={16} style={{ position: 'absolute', right: 16, top: 14, color: 'var(--ds-text3)' }} />
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Appearance */}
              <div style={{ background: 'var(--ds-surface)', borderRadius: 16, border: '1px solid var(--ds-border)', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div style={{ padding: '20px 24px' }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ds-text)', margin: 0 }}>Appearance</h2>
                  <p style={{ fontSize: 13, color: 'var(--ds-text3)', margin: '4px 0 24px' }}>Customize your UI aesthetics.</p>
                  
                  <div style={{ background: 'var(--ds-accent-bg)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ padding: 10, background: '#fff', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <Sun size={20} style={{ color: '#f59e0b' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ds-text)' }}>Light Mode</div>
                        <div style={{ fontSize: 13, color: 'var(--ds-text3)', marginTop: 2 }}>Toggle between light and dark aesthetics.</div>
                      </div>
                    </div>
                    <button
                      onClick={toggleTheme}
                      style={{
                        position: 'relative', width: 44, height: 24, borderRadius: 12,
                        background: isDark ? '#4f46e5' : '#d1d5db',
                        border: 'none', cursor: 'pointer', outline: 'none',
                        transition: 'background 0.3s ease'
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: 2, left: isDark ? 22 : 2,
                        width: 20, height: 20, borderRadius: 10,
                        background: '#fff',
                        transition: 'left 0.3s ease',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                      }} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Account Session */}
              <div style={{ background: 'var(--ds-surface)', borderRadius: 16, border: '1px solid var(--ds-border)', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div style={{ padding: '20px 24px' }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ds-text)', margin: 0 }}>Account Session</h2>
                  <p style={{ fontSize: 13, color: 'var(--ds-text3)', margin: '4px 0 24px' }}>Manage your current active session.</p>
                  
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 24, borderBottom: '1px solid var(--ds-border)' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ds-text)' }}>Lock Repository</div>
                      <div style={{ fontSize: 13, color: 'var(--ds-text3)', marginTop: 2 }}>Log out and securely lock your local vault</div>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          const res = await window.docuSync.lockVault();
                          if (res.success) window.location.hash = '/vault-login';
                        } catch (err) {}
                      }}
                      style={{ background: 'var(--ds-surface)', border: '1px solid var(--ds-border)', color: 'var(--ds-text)', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                    >
                      Log Out
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 24 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#ef4444' }}>Clear Cache</div>
                      <div style={{ fontSize: 13, color: 'var(--ds-text3)', marginTop: 2 }}>Wipe local cache, settings, and sessions.</div>
                    </div>
                    <button
                      onClick={() => {
                        showConfirm("Clear Cache", "Are you sure you want to clear your local DocuSync cache?", () => {
                          localStorage.clear(); window.location.reload();
                        });
                      }}
                      style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#ef4444', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
                    >
                      Clear Cache
                    </button>
                  </div>
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
