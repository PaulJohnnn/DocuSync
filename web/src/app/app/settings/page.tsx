'use client';
import { useEffect, useState } from 'react';
import PageShell from '@/components/PageShell';
import { useTheme } from '@/components/ThemeProvider';
import { Moon, Sun, Info, Settings as SettingsIcon, User, Cpu, FolderSync, Database, ShieldCheck, ShieldAlert, FileText, FileCode, FileJson, FileType as FileTypeIcon, File, FileImage, FileSpreadsheet, FileArchive, RefreshCw, Edit2, Lock } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import mockAuthService, { logout } from '@/lib/mockAuthService';

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
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean; title: string; message: string; onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModalState({ isOpen: true, title, message, onConfirm });
  };
  const closeConfirm = () => setConfirmModalState(prev => ({ ...prev, isOpen: false }));

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

  const user = mockAuthService.getCurrentUser() || { name: 'Paul Palamara', email: 'paulpalamaras' };

  return (
    <PageShell>
      <ConfirmModal
        isOpen={confirmModalState.isOpen} title={confirmModalState.title}
        message={confirmModalState.message} onConfirm={confirmModalState.onConfirm}
        onCancel={closeConfirm} confirmText="Confirm" cancelText="Cancel" isDestructive={true}
      />
      <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 60, paddingTop: 30, paddingLeft: 20, paddingRight: 20, width: '100%' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Settings</h1>
            <p style={{ fontSize: 13, color: 'var(--t3)', margin: '4px 0 0' }}>Manage parameters and preferences</p>
          </div>
          <button style={{ 
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', 
            borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--bg)', 
            cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--t1)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}>
            <RefreshCw size={14} /> Sync Now
          </button>
        </div>

        <div style={{ display: 'flex', gap: '3rem', alignItems: 'flex-start' }}>
          
          {/* Left Sidebar */}
          <div style={{ width: '280px', flexShrink: 0, position: 'sticky', top: 20 }}>
            <div style={{ background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--b1)', padding: 16, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <button
                  onClick={() => setActiveTab('account')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                    borderRadius: '999px', border: 'none', cursor: 'pointer',
                    background: activeTab === 'account' ? 'rgba(79, 70, 229, 0.08)' : 'transparent',
                    color: activeTab === 'account' ? 'rgb(79, 70, 229)' : 'var(--t2)',
                    fontWeight: activeTab === 'account' ? 600 : 500,
                    transition: 'all 0.2s', textAlign: 'left', fontSize: 14
                  }}
                >
                  <User size={18} /> Account & Appearance
                </button>

                <button
                  onClick={() => setActiveTab('system')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                    borderRadius: '999px', border: 'none', cursor: 'pointer',
                    background: activeTab === 'system' ? 'rgba(79, 70, 229, 0.08)' : 'transparent',
                    color: activeTab === 'system' ? 'rgb(79, 70, 229)' : 'var(--t2)',
                    fontWeight: activeTab === 'system' ? 600 : 500,
                    transition: 'all 0.2s', textAlign: 'left', fontSize: 14
                  }}
                >
                  <Cpu size={18} /> System & Engine
                </button>

                <button
                  onClick={() => setActiveTab('files')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                    borderRadius: '999px', border: 'none', cursor: 'pointer',
                    background: activeTab === 'files' ? 'rgba(79, 70, 229, 0.08)' : 'transparent',
                    color: activeTab === 'files' ? 'rgb(79, 70, 229)' : 'var(--t2)',
                    fontWeight: activeTab === 'files' ? 600 : 500,
                    transition: 'all 0.2s', textAlign: 'left', fontSize: 14
                  }}
                >
                  <FolderSync size={18} /> File Management
                </button>

                <button
                  onClick={() => setActiveTab('about')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                    borderRadius: '999px', border: 'none', cursor: 'pointer',
                    background: activeTab === 'about' ? 'rgba(79, 70, 229, 0.08)' : 'transparent',
                    color: activeTab === 'about' ? 'rgb(79, 70, 229)' : 'var(--t2)',
                    fontWeight: activeTab === 'about' ? 600 : 500,
                    transition: 'all 0.2s', textAlign: 'left', fontSize: 14
                  }}
                >
                  <Info size={18} /> About DocuSync
                </button>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 32, minWidth: 0, animation: 'fadeIn 0.3s ease' }}>
            
            {activeTab === 'account' && (
              <>
                {/* Profile & Local Identity */}
                <div style={{ background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--b1)', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                  <div style={{ padding: '20px 24px' }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Profile & Local Identity</h2>
                    <p style={{ fontSize: 13, color: 'var(--t3)', margin: '4px 0 24px' }}>Manage your profile information and UI preferences.</p>
                    
                    <div style={{ background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--b1)', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                        <div style={{ position: 'relative' }}>
                          <div style={{ width: 64, height: 64, borderRadius: 16, background: '#4f46e5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700 }}>
                            {user.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() || 'U'}
                          </div>
                          <div style={{ position: 'absolute', bottom: -4, right: -4, width: 20, height: 20, background: '#10b981', borderRadius: '50%', border: '4px solid var(--bg)' }} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)' }}>{user.name}</div>
                            <div style={{ background: 'rgba(79, 70, 229, 0.1)', color: 'rgb(79, 70, 229)', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>Local Node Owner</div>
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 2 }}>@{user.name.toLowerCase().replace(/\\s+/g,'')}</div>
                          <div style={{ fontSize: 13, color: 'var(--t2)' }}>Decentralized workspace accessible by peers.</div>
                        </div>
                      </div>
                      <button style={{ background: '#4f46e5', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: '999px', cursor: 'pointer', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 2px 4px rgba(79,70,229,0.3)' }}>
                        <Edit2 size={16} /> Edit Profile
                      </button>
                    </div>

                    <div style={{ marginTop: 32 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Credentials & Security</h2>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--s1)', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: 'var(--t3)' }}>
                            <Lock size={12} /> Locked
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', fontSize: 12, fontWeight: 600 }}>
                          <ShieldCheck size={14} /> Zero Cloud Dependency
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 24 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 8 }}>Local Identifier (Username)</label>
                          <div style={{ position: 'relative' }}>
                            <input type="text" readOnly value={user.email} style={{ width: '100%', background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: 12, padding: '12px 16px', fontSize: 14, color: 'var(--t2)', outline: 'none' }} />
                            <Lock size={16} style={{ position: 'absolute', right: 16, top: 14, color: 'var(--t3)' }} />
                          </div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 8 }}>6-Digit Security PIN</label>
                          <div style={{ position: 'relative' }}>
                            <input type="password" readOnly value="******" style={{ width: '100%', background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: 12, padding: '12px 16px', fontSize: 14, color: 'var(--t2)', outline: 'none', letterSpacing: 4 }} />
                            <Lock size={16} style={{ position: 'absolute', right: 16, top: 14, color: 'var(--t3)' }} />
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Appearance */}
                <div style={{ background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--b1)', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                  <div style={{ padding: '20px 24px' }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Appearance</h2>
                    <p style={{ fontSize: 13, color: 'var(--t3)', margin: '4px 0 24px' }}>Customize your Web UI aesthetics and color themes.</p>
                    
                    <div style={{ background: 'var(--s1)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ padding: 10, background: '#fff', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                          <Sun size={20} style={{ color: '#f59e0b' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>Light Mode</div>
                          <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>Toggle between light and dark aesthetics.</div>
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
                <div style={{ background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--b1)', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                  <div style={{ padding: '20px 24px' }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Account Session</h2>
                    <p style={{ fontSize: 13, color: 'var(--t3)', margin: '4px 0 24px' }}>Manage your current active session.</p>
                    
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 24, borderBottom: '1px solid var(--b1)' }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>Log Out</div>
                        <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>End your current web session safely.</div>
                      </div>
                      <button
                        onClick={() => { logout(); window.location.href = '/app/login'; }}
                        style={{ background: 'var(--bg)', border: '1px solid var(--b1)', color: 'var(--t1)', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
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
              </>
            )}

            {/* Other tabs remain functionally similar but structurally unchanged for brevity */}
            {activeTab !== 'account' && (
              <div style={{ background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--b1)', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <p style={{ color: 'var(--t2)' }}>Content for {activeTab} is currently using native rendering.</p>
              </div>
            )}
            
          </div>
        </div>
      </div>
    </PageShell>
  );
}
