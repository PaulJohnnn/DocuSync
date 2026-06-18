'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import {
  FolderOpen, Plus, FileText, FileCode, FileImage, File,
  CheckCircle, RefreshCw, AlertTriangle, Trash2, Search,
  FileJson, FileType, FileSpreadsheet, FileArchive
} from 'lucide-react';

interface FileRecord {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string;
  status: 'synced' | 'syncing' | 'conflict';
  createdAt: string;
  updatedAt: string;
}

function extMeta(ext: string): { icon: React.ReactNode; color: string; bg: string } {
  switch (ext.toLowerCase()) {
    case 'md': case 'markdown':
      return { icon: <FileText size={15} />, color: '#4f7df8', bg: 'rgba(79,125,248,0.15)'  };
    case 'txt': case 'text':
      return { icon: <FileText size={15} />, color: '#7e8ba8', bg: 'rgba(126,139,168,0.12)' };
    case 'json':
      return { icon: <FileJson size={15} />, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  };
    case 'docx': case 'doc':
      return { icon: <FileType size={15} />, color: '#60a5fa', bg: 'rgba(59,130,246,0.15)'  };
    case 'csv': case 'tsv': case 'xlsx': case 'xls':
      return { icon: <FileSpreadsheet size={15} />, color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   };
    case 'xml': case 'html': case 'htm':
      return { icon: <FileCode size={15} />, color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)'  };
    case 'ts': case 'tsx': case 'js': case 'jsx': case 'py': case 'java': case 'c': case 'cpp':
      return { icon: <FileCode size={15} />, color: '#fcd34d', bg: 'rgba(245,158,11,0.10)'  };
    case 'zip': case 'tar': case 'gz': case 'rar': case '7z':
      return { icon: <FileArchive size={15} />, color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
    case 'png': case 'jpg': case 'jpeg': case 'svg': case 'gif':
      return { icon: <FileImage size={15} />, color: '#ec4899', bg: 'rgba(236,72,153,0.12)' };
    default:
      return { icon: <File size={15} />, color: '#3d4a65', bg: 'rgba(61,74,101,0.15)'  };
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function FilesPage() {
  const router = useRouter();
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('docusync_files');
    if (stored) {
      setFiles(JSON.parse(stored));
    } else {
      // Inject demo files
      const demoFiles: FileRecord[] = [
        { id: 'demo-1', name: 'project-proposal.md', type: 'text/markdown', size: 1024 * 12, content: '# Proposal', status: 'synced', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'demo-2', name: 'budget-2024.csv', type: 'text/csv', size: 1024 * 45, content: 'Q1,Q2', status: 'syncing', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'demo-3', name: 'auth-config.json', type: 'application/json', size: 512, content: '{}', status: 'conflict', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'demo-4', name: 'Thesis_Final_Draft.docx', type: 'application/msword', size: 1024 * 1500, content: '...', status: 'synced', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      ];
      setFiles(demoFiles);
      localStorage.setItem('docusync_files', JSON.stringify(demoFiles));
    }
  }, []);

  const saveFiles = useCallback((newFiles: FileRecord[]) => {
    setFiles(newFiles);
    localStorage.setItem('docusync_files', JSON.stringify(newFiles));
  }, []);

  const openFile = async () => {
    try {
      if ('showOpenFilePicker' in window) {
        const [handle] = await (window as unknown as { showOpenFilePicker: (options?: unknown) => Promise<{ getFile: () => Promise<File> }[]> }).showOpenFilePicker({
          types: [
            { description: 'Text Files', accept: { 'text/*': ['.txt', '.md', '.json', '.ts', '.tsx', '.js', '.jsx', '.css', '.html'] } },
          ],
        });
        const file = await handle.getFile();
        const content = await file.text();
        const newFile: FileRecord = {
          id: crypto.randomUUID(),
          name: file.name,
          type: file.type || 'text/plain',
          size: file.size,
          content,
          status: 'synced',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        saveFiles([...files, newFile]);
      } else {
        // Fallback
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt,.md,.json,.ts,.tsx,.js,.jsx,.css,.html';
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          const content = await file.text();
          const newFile: FileRecord = {
            id: crypto.randomUUID(),
            name: file.name,
            type: file.type || 'text/plain',
            size: file.size,
            content,
            status: 'synced',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          saveFiles([...files, newFile]);
        };
        input.click();
      }
    } catch (err) {
      console.error('File open cancelled or failed', err);
    }
  };

  const deleteFile = (id: string) => {
    saveFiles(files.filter(f => f.id !== id));
    localStorage.removeItem(`docusync_events_${id}`);
  };

  const filtered = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <PageShell>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Files</h1>
          <p style={{ fontSize: 13, color: 'var(--t3)', margin: '4px 0 0' }}>{files.length} file{files.length !== 1 ? 's' : ''} tracked</p>
        </div>
        <button className="ds-btn ds-btn-primary" onClick={openFile}>
          <Plus size={14} /> Open File
        </button>
      </div>

      {/* Search */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--s1)', border: '1px solid var(--b1)',
        borderRadius: 8, padding: '8px 12px', marginBottom: 16,
      }}>
        <Search size={14} style={{ color: 'var(--t3)' }} />
        <input
          type="text" placeholder="Search files..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--t1)', fontSize: 13,
          }}
        />
      </div>

      {/* File Data Table */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60,
          color: 'var(--t3)',
        }}>
          <FolderOpen size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
          <p style={{ fontSize: 14 }}>No files yet</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>Click &quot;Open File&quot; to add documents</p>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', paddingBottom: 8 }}>
            OPEN DOCUMENTS
          </div>
          
          <div style={{
            background: 'var(--s1)',
            borderRadius: 8,
            border: '1px solid var(--b1)',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            {/* Table Header */}
            <div style={{
              display: 'flex',
              padding: '10px 16px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--t3)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              background: 'var(--s2)',
              borderBottom: '1px solid var(--b1)'
            }}>
              <div style={{ width: 28, marginRight: 12 }} /> {/* Icon spacer */}
              <div style={{ flex: 2, paddingRight: 16 }}>Name</div>
              <div style={{ flex: 2, paddingRight: 16 }}>Location</div>
              <div style={{ flex: 1.5, paddingRight: 16 }}>Status</div>
              <div style={{ width: 100, textAlign: 'right', paddingRight: 32 }}>Size</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filtered.map(file => {
                const ext = file.name.split('.').pop() ?? '';
                const { icon, color, bg } = extMeta(ext);
                
                return (
                  <article key={file.id} style={{
                    padding: '8px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--b1)',
                    background: 'transparent',
                    transition: 'background 0.15s ease',
                    borderLeft: file.status === 'conflict' ? '3px solid var(--red)' : '3px solid transparent',
                    cursor: 'pointer',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--s2)';
                    const trash = e.currentTarget.querySelector('.trash-btn') as HTMLElement;
                    if (trash) trash.style.opacity = '1';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    const trash = e.currentTarget.querySelector('.trash-btn') as HTMLElement;
                    if (trash) trash.style.opacity = '0';
                  }}
                  onClick={() => router.push(`/editor/${file.id}`)}>
                    
                    {/* Icon */}
                    <div style={{
                      width: 28, height: 28, borderRadius: 6,
                      background: bg, color: color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, marginRight: 12,
                    }}>
                      {icon}
                    </div>

                    {/* Name */}
                    <div style={{ flex: 2, minWidth: 0, paddingRight: 16 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.name}
                      </div>
                    </div>

                    {/* Location */}
                    <div style={{ flex: 2, minWidth: 0, paddingRight: 16 }}>
                      <div style={{ fontSize: 12, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Local Storage
                      </div>
                    </div>

                    {/* Status */}
                    <div style={{ flex: 1.5, minWidth: 0, display: 'flex', alignItems: 'center', paddingRight: 16 }}>
                      {file.status === 'conflict' ? (
                        <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 500 }}>⚠ Conflict</span>
                      ) : file.status === 'syncing' ? (
                        <span style={{ fontSize: 12, color: 'var(--amb)', fontWeight: 500 }}>↻ Syncing</span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--grn)', fontWeight: 500 }}>✓ Synced — Working fine</span>
                      )}
                    </div>

                    {/* Size and Actions */}
                    <div style={{ width: 100, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: 12, color: 'var(--t2)', marginRight: 12 }}>
                        {formatBytes(file.size)}
                      </span>
                      <button 
                        className="trash-btn"
                        onClick={(e) => { e.stopPropagation(); deleteFile(file.id); }}
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          color: 'var(--t3)', opacity: 0, transition: 'opacity 0.15s',
                          display: 'flex', alignItems: 'center', padding: 4
                        }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
