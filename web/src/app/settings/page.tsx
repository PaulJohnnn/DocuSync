'use client';
import { useEffect, useState } from 'react';
import PageShell from '@/components/PageShell';
import { useTheme } from '@/components/ThemeProvider';
import { Moon, Sun, Palette, Info, FileText, FileCode, FileJson, FileType as FileTypeIcon, File, FileImage, FileSpreadsheet, FileArchive, Settings as SettingsIcon } from 'lucide-react';

const SUPPORTED_TYPES = ['.txt', '.md', '.docx', '.rtf', '.csv', '.json', '.xml', '.html', '.tex'];
const REJECTED_TYPES = ['.png', '.jpg', '.jpeg', '.mp4', '.mp3', '.exe', '.zip'];

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

export default function SettingsPage() {
  const [nodeId, setNodeId] = useState<string>('Loading…');
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    let id = localStorage.getItem('docusync_node_id');
    if (!id) id = 'unknown-node';
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* Appearance */}
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

          {/* About */}
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
                <img src="/docusync-logo.svg" width={48} height={48} alt="Logo" style={{ display: 'block' }} />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>DocuSync Web Edition</h2>
              <p style={{ fontSize: 14, color: 'var(--t2)', maxWidth: 400, lineHeight: 1.5, marginBottom: 16 }}>
                A hybrid P2P collaborative document sync engine. This web client operates fully in your browser.
              </p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'var(--s2)', borderRadius: 20, border: '1px solid var(--b1)' }}>
                <span style={{ fontSize: 12, color: 'var(--t3)' }}>Local Node ID:</span>
                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: 'var(--acc)' }}>{nodeId}</span>
              </div>
            </div>
          </section>

        </div>
      </div>
    </PageShell>
  );
}
