'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import {
  FolderOpen, Plus, FileText, FileCode, FileImage, File,
  CheckCircle, RefreshCw, AlertTriangle, Trash2, Search
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

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['md', 'txt'].includes(ext)) return { icon: FileText, color: 'var(--acc)' };
  if (['ts', 'tsx', 'js', 'jsx', 'json', 'css', 'html'].includes(ext)) return { icon: FileCode, color: 'var(--grn)' };
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return { icon: FileImage, color: 'var(--pur)' };
  return { icon: File, color: 'var(--t3)' };
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'synced': return { label: 'Synced', color: 'var(--grn)', bg: 'var(--grb)', border: 'var(--grbr)' };
    case 'syncing': return { label: 'Syncing', color: 'var(--amb)', bg: 'var(--abb)', border: 'var(--abbr)' };
    case 'conflict': return { label: 'Conflict', color: 'var(--red)', bg: 'var(--rdb)', border: 'var(--rdbr)' };
    default: return { label: 'Unknown', color: 'var(--t3)', bg: 'transparent', border: 'var(--b1)' };
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
    if (stored) setFiles(JSON.parse(stored));
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

      {/* File grid */}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {filtered.map(file => {
            const fi = getFileIcon(file.name);
            const Icon = fi.icon;
            const badge = getStatusBadge(file.status);
            return (
              <div key={file.id} className="ds-card" style={{ cursor: 'pointer', position: 'relative' }}
                onClick={() => router.push(`/editor/${file.id}`)}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: `${fi.color}18`, border: `1px solid ${fi.color}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon size={18} style={{ color: fi.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {file.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                      {formatBytes(file.size)} • {new Date(file.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="ds-badge" style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                    {badge.label === 'Synced' && <CheckCircle size={10} />}
                    {badge.label === 'Syncing' && <RefreshCw size={10} />}
                    {badge.label === 'Conflict' && <AlertTriangle size={10} />}
                    {badge.label}
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteFile(file.id); }}
                  style={{
                    position: 'absolute', top: 8, right: 8,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--t3)', opacity: 0, transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '0')}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
