'use client';
import { useEffect, useState } from 'react';
import PageShell from '@/components/PageShell';
import { useTheme } from '@/components/ThemeProvider';
import { Moon, Sun, Palette, Info, Settings as SettingsIcon, User, Trash, BarChart2, Cpu, FolderSync, Database, ShieldCheck, ShieldAlert, FileText, FileCode, FileJson, FileType as FileTypeIcon, File, FileImage, FileSpreadsheet, FileArchive, LogOut } from 'lucide-react';
import { logout } from '@/lib/mockAuthService';

const SUPPORTED_TYPES = ['.txt', '.md', '.docx', '.rtf', '.csv', '.json', '.xml', '.html', '.tex'];
const REJECTED_TYPES = ['.png', '.jpg', '.jpeg', '.mp4', '.mp3', '.exe', '.zip'];
const TYPE_HUES: Record<string, number> = {
  '.txt': 210, '.md': 160, '.docx': 220, '.rtf': 190,
  '.csv': 140, '.json': 270, '.xml': 30, '.html': 200, '.tex': 340,
};

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

const ExtTag: React.FC<{ ext: string; rejected?: boolean }> = ({ ext, rejected = false }) => {
  const hue = TYPE_HUES[ext] ?? 220;
  const bg = rejected ? 'rgba(239, 68, 68, 0.15)' : `hsla(${hue},60%,55%,0.15)`;
  const color = rejected ? 'rgb(239, 68, 68)' : `hsl(${hue},70%,65%)`;
  const border = rejected ? 'rgba(239, 68, 68, 0.3)' : `hsla(${hue},60%,55%,0.3)`;
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


export default function SettingsPage() {
  const [nodeId, setNodeId] = useState<string>('Loading…');
  const [activeTab, setActiveTab] = useState<'account' | 'system' | 'files' | 'about'>('account');
  const CONFIG_ROWS = [
    { setting: 'Node ID',              value: nodeId },
    { setting: 'WS Port',              value: 'N/A (Web Node)' },
    { setting: 'Node Count',           value: 'Auto' },
    { setting: 'Node Index',           value: 'Dynamic' },
    { setting: 'Sync Interval',        value: 'Real-time WebSocket' },
    { setting: 'Max Concurrent Users', value: '15' },
    { setting: 'Conflict Policy',      value: 'LWW + Owner Escalation' },
    { setting: 'Chunk Size',           value: '4MB' },
  ];
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    let id = sessionStorage.getItem('docusync_node_id');
    if (!id) {
      id = `web-${Math.floor(Math.random() * 100000)}`;
      sessionStorage.setItem('docusync_node_id', id);
    }
    setNodeId(id);
  }, []);

  return (
    <PageShell>
      <div style={{ maxWidth: 800, margin: '0 auto', paddingBottom: 40 }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div style={{ padding: 10, background: 'var(--s1)', borderRadius: 12, border: '1px solid var(--b1)' }}>
            <SettingsIcon size={24} style={{ color: 'var(--acc)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Settings</h1>
            <p style={{ fontSize: 13, color: 'var(--t3)', margin: '4px 0 0' }}>Manage appearance and node parameters</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
          
          {/* Left Sidebar Tabs */}
          <div style={{ width: '240px', display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
            <button
              onClick={() => setActiveTab('account')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: activeTab === 'account' ? 'var(--acb)' : 'transparent',
                color: activeTab === 'account' ? 'var(--acc)' : 'var(--t2)',
                fontWeight: activeTab === 'account' ? 600 : 500,
                borderLeft: activeTab === 'account' ? '3px solid var(--acc)' : '3px solid transparent',
                transition: 'all 0.2s',
                textAlign: 'left'
              }}
            >
              <User size={18} /> Account & Appearance
            </button>

            <button
              onClick={() => setActiveTab('system')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: activeTab === 'system' ? 'var(--acb)' : 'transparent',
                color: activeTab === 'system' ? 'var(--acc)' : 'var(--t2)',
                fontWeight: activeTab === 'system' ? 600 : 500,
                borderLeft: activeTab === 'system' ? '3px solid var(--acc)' : '3px solid transparent',
                transition: 'all 0.2s', textAlign: 'left'
              }}
            >
              <Cpu size={18} /> System & Engine
            </button>

            <button
              onClick={() => setActiveTab('files')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: activeTab === 'files' ? 'var(--acb)' : 'transparent',
                color: activeTab === 'files' ? 'var(--acc)' : 'var(--t2)',
                fontWeight: activeTab === 'files' ? 600 : 500,
                borderLeft: activeTab === 'files' ? '3px solid var(--acc)' : '3px solid transparent',
                transition: 'all 0.2s', textAlign: 'left'
              }}
            >
              <FolderSync size={18} /> File Management
            </button>

            <button
              onClick={() => setActiveTab('about')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: activeTab === 'about' ? 'var(--acb)' : 'transparent',
                color: activeTab === 'about' ? 'var(--acc)' : 'var(--t2)',
                fontWeight: activeTab === 'about' ? 600 : 500,
                borderLeft: activeTab === 'about' ? '3px solid var(--acc)' : '3px solid transparent',
                transition: 'all 0.2s',
                textAlign: 'left'
              }}
            >
              <Info size={18} /> About DocuSync
            </button>


          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0, animation: 'fadeIn 0.3s ease' }}>
            
            {activeTab === 'account' && (
              <>
                <section className="ds-card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--b1)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: 'var(--acc)', display: 'flex', alignItems: 'center', padding: 6, background: 'var(--acb)', borderRadius: 8 }}><Palette size={16} /></span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1)' }}>Appearance</div>
                    <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>Customize your Web UI theme</div>
                  </div>
                </div>
                <div style={{ padding: '20px' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px', background: 'var(--s2)', borderRadius: 12, border: '1px solid var(--b1)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {isDark ? <Moon size={20} style={{ color: 'var(--acc)' }} /> : <Sun size={20} style={{ color: 'var(--amb)' }} />}
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>{isDark ? 'Dark Mode' : 'Light Mode'}</div>
                        <div style={{ fontSize: 12, color: 'var(--t3)' }}>Toggle between light and dark aesthetics</div>
                      </div>
                    </div>
                    {/* Bouncing Toggle */}
                    <button
                      onClick={toggleTheme}
                      style={{
                        position: 'relative', width: 44, height: 24, borderRadius: 12,
                        background: isDark ? 'var(--acc)' : 'var(--b2)',
                        border: 'none', cursor: 'pointer', outline: 'none',
                        transition: 'background 0.3s ease'
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: 2, left: isDark ? 22 : 2,
                        width: 20, height: 20, borderRadius: 10,
                        background: '#fff',
                        transition: 'left 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                      }} />
                    </button>
                  </div>
                </div>
              </section>

              <section className="ds-card" style={{ overflow: 'hidden', marginBottom: 24 }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--b1)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: 'var(--red, #ef4444)', display: 'flex', alignItems: 'center', padding: 6, background: 'rgba(239, 68, 68, 0.1)', borderRadius: 8 }}><LogOut size={16} /></span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1)' }}>Account</div>
                    <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>Manage your current session</div>
                  </div>
                </div>
                <div style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'var(--s2)', borderRadius: 12, border: '1px solid var(--b1)' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>Log Out</div>
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>End your current web session safely.</div>
                    </div>
                    <button
                      onClick={() => {
                        logout();
                        window.location.href = '/app/login';
                      }}
                      style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'rgb(239, 68, 68)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                    >
                      Log Out
                    </button>
                  </div>
                </div>
              </section>

              <section className="ds-card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--b1)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: 'var(--red, #ef4444)', display: 'flex', alignItems: 'center', padding: 6, background: 'rgba(239, 68, 68, 0.1)', borderRadius: 8 }}><Trash size={16} /></span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1)' }}>Reset Application Data</div>
                    <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>Clear all local data and restore to a fresh state</div>
                  </div>
                </div>
                <div style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'var(--s2)', borderRadius: 12, border: '1px solid var(--b1)' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>Factory Reset</div>
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>Wipe all settings, sessions, and files locally.</div>
                    </div>
                    <button
                      onClick={() => {
                        if (window.confirm("Are you sure you want to completely wipe DocuSync data? This cannot be undone.")) {
                          localStorage.clear();
                          window.location.reload();
                        }
                      }}
                      style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'rgb(239, 68, 68)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                    >
                      Clear All Data
                    </button>
                  </div>
                </div>
              </section>
              </>
            )}

            {activeTab === 'system' && (
              <section className="ds-card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--b1)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: 'var(--acc)', display: 'flex', alignItems: 'center', padding: 6, background: 'var(--acb)', borderRadius: 8 }}><Database size={16} /></span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1)' }}>Node Configuration</div>
                    <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>Runtime parameters for this DocuSync node</div>
                  </div>
                </div>
                <div style={{ padding: '8px 0' }}>
                  {CONFIG_ROWS.map((row, i) => (
                    <div key={row.setting} style={{
                      display: 'grid', gridTemplateColumns: '240px 1fr', gap: '1rem',
                      padding: '12px 24px', borderBottom: '1px solid var(--b1)',
                      background: i % 2 === 0 ? 'transparent' : 'var(--s2)', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{row.setting}</span>
                      <span style={{ fontSize: '0.9rem', color: 'var(--t1)', fontWeight: 500, wordBreak: 'break-all' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'files' && (
              <>
                <section className="ds-card" style={{ overflow: 'hidden', marginBottom: 24 }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--b1)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ color: 'var(--acc)', display: 'flex', alignItems: 'center', padding: 6, background: 'var(--acb)', borderRadius: 8 }}><ShieldCheck size={16} /></span>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1)' }}>Supported File Types</div>
                      <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>Text-based formats that support delta encoding and sync</div>
                    </div>
                  </div>
                  <div style={{ padding: '24px', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    {SUPPORTED_TYPES.map(ext => <ExtTag key={ext} ext={ext} />)}
                  </div>
                </section>
                <section className="ds-card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--b1)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ color: 'var(--amb)', display: 'flex', alignItems: 'center', padding: 6, background: 'var(--amb-bg)', borderRadius: 8 }}><ShieldAlert size={16} /></span>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1)' }}>Rejected File Types</div>
                      <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>Binary formats — delta encoding not applicable</div>
                    </div>
                  </div>
                  <div style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
                      {REJECTED_TYPES.map(ext => <ExtTag key={ext} ext={ext} rejected />)}
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '16px 20px',
                      borderRadius: '12px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)',
                    }}>
                      <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                      <span style={{ fontSize: '0.9rem', color: 'var(--t2)', lineHeight: 1.6 }}>
                        <strong style={{ color: 'var(--t1)', fontWeight: 600 }}>Reason:</strong>{' '}
                        Binary formats break delta encoding. DocuSync's delta engine operates on UTF-8 text streams. Importing binary files will result in rejection at the file-open stage.
                      </span>
                    </div>
                  </div>
                </section>
              </>
            )}

            {activeTab === 'about' && (
              <section className="ds-card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--b1)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: 'var(--pur)', display: 'flex', alignItems: 'center', padding: 6, background: 'var(--acb)', borderRadius: 8 }}><Info size={16} /></span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1)' }}>About DocuSync</div>
                    <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>System and license details</div>
                  </div>
                </div>
                <div style={{ padding: '32px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--b1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/docusync-icon.png" width={48} height={48} alt="Logo" style={{ display: 'block', borderRadius: 12 }} />
                  </div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>DocuSync Web Edition</h2>
                  <p style={{ fontSize: 14, color: 'var(--t2)', maxWidth: 400, lineHeight: 1.5, marginBottom: 16 }}>
                    A hybrid P2P collaborative document sync engine. This web client operates fully in your browser.
                  </p>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'var(--s2)', borderRadius: 20, border: '1px solid var(--b1)' }}>
                    <span style={{ fontSize: 12, color: 'var(--t3)' }}>Local Node ID:</span>
                  </div>
                </div>
              </section>
            )}



          </div>
        </div>
      </div>
    </PageShell>
  );
}
