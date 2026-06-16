/**
 * @module FilesPage
 * Main file manager — route `/`.
 * 4 metric cards + structured file cards with colored icons.
 * All IPC logic and routing preserved.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useElectronSync } from '@/context/ElectronSyncContext';
import { toast } from 'sonner';
import { FolderOpen, RefreshCw, ChevronRight } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface OpenedFile {
  fileId: number;
  filePath: string;
  contentLength: number;
  extension: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extMeta(ext: string): { label: string; color: string; bg: string } {
  switch (ext.toLowerCase()) {
    case 'md': case 'markdown':
      return { label: 'MD',  color: '#4f7df8', bg: 'rgba(79,125,248,0.15)'  };
    case 'txt': case 'text':
      return { label: 'TXT', color: '#7e8ba8', bg: 'rgba(126,139,168,0.12)' };
    case 'json':
      return { label: 'JS',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  };
    case 'docx': case 'doc':
      return { label: 'DOC', color: '#60a5fa', bg: 'rgba(59,130,246,0.15)'  };
    case 'csv': case 'tsv':
      return { label: 'CSV', color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   };
    case 'xml': case 'html': case 'htm':
      return { label: 'XML', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)'  };
    case 'tex':
      return { label: 'TEX', color: '#fcd34d', bg: 'rgba(245,158,11,0.10)'  };
    default:
      return { label: 'FILE', color: '#3d4a65', bg: 'rgba(61,74,101,0.15)'  };
  }
}

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p;
}

function formatSize(chars: number): string {
  if (chars >= 1024 * 1024) return `${(chars / (1024 * 1024)).toFixed(1)} MB`;
  if (chars >= 1024)         return `${(chars / 1024).toFixed(1)} KB`;
  return `${chars} B`;
}

// ── FileCard ─────────────────────────────────────────────────────────────────

const FileCard: React.FC<{
  file: OpenedFile;
  hasConflict: boolean;
  onClick: () => void;
}> = ({ file, hasConflict, onClick }) => {
  const [fileStatus, setFileStatus] = useState<'syncing' | 'synced'>('syncing');
  const { label, color, bg } = extMeta(file.extension);
  const name = basename(file.filePath);

  useEffect(() => {
    const t = setTimeout(() => setFileStatus('synced'), 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <article
      className="ds-card-clickable"
      onClick={onClick}
      style={{
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid var(--border)',
        background: 'transparent',
        transition: 'background var(--t)',
        borderLeft: hasConflict ? '3px solid var(--red)' : '3px solid transparent',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {/* File type icon */}
      <div style={{
        width: 28, height: 28, borderRadius: 6,
        background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700, color,
        flexShrink: 0,
        marginRight: 16,
      }}>
        {label}
      </div>

      {/* Name */}
      <div style={{ flex: 2, minWidth: 0, paddingRight: 16 }}>
        <div style={{
          fontWeight: 500, fontSize: 13, color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {name}
        </div>
      </div>

      {/* Location (Path) */}
      <div style={{ flex: 2, minWidth: 0, paddingRight: 16 }}>
        <div style={{
          fontSize: 12, color: 'var(--text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {file.filePath}
        </div>
      </div>

      {/* Status */}
      <div style={{ flex: 1.5, minWidth: 0, display: 'flex', alignItems: 'center', paddingRight: 16 }}>
        {hasConflict ? (
          <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 500 }}>⚠ Conflict</span>
        ) : fileStatus === 'syncing' ? (
          <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 500 }}>↻ Syncing</span>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Synced</span>
        )}
      </div>

      {/* Size */}
      <div style={{ width: 80, flexShrink: 0, textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>
        {formatSize(file.contentLength)}
      </div>
    </article>
  );
};

// ── FilesPage ─────────────────────────────────────────────────────────────────

const FilesPage: React.FC = () => {
  const navigate = useNavigate();
  const { syncStatus, connectedPeers, pendingConflicts, conflictQueue } = useElectronSync();
  const [openedFiles, setOpenedFiles] = useState<OpenedFile[]>([]);
  const [opening, setOpening] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const SESSION_KEY = 'docusync_opened_files';
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) setOpenedFiles(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(openedFiles)); } catch { /* ignore */ }
  }, [openedFiles]);

  const handleOpenFile = useCallback(async () => {
    if (!window.docuSync) { toast.error('IPC bridge not available.'); return; }
    setOpening(true);
    try {
      const res = await window.docuSync.openFile();
      if (!res.success) {
        if (res.error && !res.error.includes('cancel')) toast.error(`Failed: ${res.error}`);
        return;
      }
      const data = res.data as OpenedFile;
      setOpenedFiles((prev) => prev.some((f) => f.fileId === data.fileId) ? prev : [data, ...prev]);
      toast.success(`Opened: ${basename(data.filePath)}`);
      navigate(`/editor/${data.fileId}`);
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setOpening(false); }
  }, [navigate]);

  const handleSync = useCallback(() => {
    setSyncing(true);
    setTimeout(() => setSyncing(false), 2000);
    if (window.docuSync) window.docuSync.triggerSync?.().catch(() => {});
  }, []);

  const handleCardClick = useCallback((file: OpenedFile) => {
    const hasConflict = conflictQueue.some((c) => c.fileId === file.fileId);
    navigate(hasConflict ? '/conflicts' : `/editor/${file.fileId}`);
  }, [conflictQueue, navigate]);

  const metrics = [
    { label: 'Open Files', value: openedFiles.length, dotColor: 'var(--accent)', desc: 'documents tracked' },
    { label: 'Peers',      value: connectedPeers.length, dotColor: 'var(--green)', desc: 'nodes connected',
      valueColor: connectedPeers.length > 0 ? 'var(--green)' : undefined },
    { label: 'Sync Status', value: syncStatus ?? '—', dotColor: 'var(--purple)',
      desc: 'engine state', isText: true, textColor: 'var(--accent)' },
    { label: 'Conflicts',  value: pendingConflicts, dotColor: 'var(--red)', desc: 'pending resolution',
      valueColor: pendingConflicts > 0 ? 'var(--red)' : undefined },
  ];

  return (
    <>
      {/* ── Topbar ── */}
      <div className="ds-topbar">
        <span className="ds-topbar-title">Files</span>
        <span className="ds-topbar-sep" />
        <span className="ds-topbar-subtitle">Open documents for P2P sync</span>
        <div className="ds-topbar-actions">
          <button id="btn-sync" className="ds-btn ds-btn-ghost" onClick={handleSync} disabled={syncing}>
            <RefreshCw size={13} className={syncing ? 'ds-spin' : ''} />
            Sync Now
          </button>
          <button id="btn-open-file" className="ds-btn ds-btn-primary" onClick={handleOpenFile} disabled={opening}>
            <FolderOpen size={13} />
            {opening ? 'Opening…' : 'Open File'}
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="ds-main-scroll ds-page-enter">

        {/* Metric cards */}
        <div className="ds-metrics-grid">
          {metrics.map((m) => (
            <div key={m.label} className="ds-metric-card">
              <div className="ds-metric-label">
                <span className="ds-metric-dot" style={{ background: m.dotColor }} />
                {m.label}
              </div>
              <div
                className="ds-metric-value"
                style={{
                  color: (m as any).valueColor ?? 'var(--text-primary)',
                  fontSize: (m as any).isText ? 14 : undefined,
                  textTransform: (m as any).isText ? 'capitalize' : undefined,
                  paddingTop: (m as any).isText ? 6 : undefined,
                }}
              >
                {m.value}
              </div>
              <div className="ds-metric-desc">{m.desc}</div>
            </div>
          ))}
        </div>

        {/* File list */}
        {openedFiles.length === 0 ? (
          <div className="ds-empty ds-card" style={{ minHeight: 300 }}>
            <div className="ds-empty-icon">📂</div>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
              No files opened yet
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 360, lineHeight: 1.7, margin: '0 auto 24px' }}>
              Click <strong style={{ color: 'var(--text-primary)' }}>Open File</strong> to begin.
              DocuSync tracks every edit via delta encoding and syncs across peers using vector clocks.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="ds-btn ds-btn-primary" onClick={handleOpenFile}>
                <FolderOpen size={13} /> Open File
              </button>
              <button className="ds-btn ds-btn-ghost" onClick={() => navigate('/peers')}>
                Manage Peers
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="ds-section-label" style={{ marginTop: 24, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              Open Documents
            </div>
            
            {/* Table Header */}
            <div style={{
              display: 'flex',
              padding: '8px 16px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              <div style={{ width: 28, marginRight: 16 }} /> {/* Icon spacer */}
              <div style={{ flex: 2, paddingRight: 16 }}>Name</div>
              <div style={{ flex: 2, paddingRight: 16 }}>Location</div>
              <div style={{ flex: 1.5, paddingRight: 16 }}>Status</div>
              <div style={{ width: 80, textAlign: 'right' }}>Size</div>
            </div>

            <div className="ds-files-grid" style={{ gap: 0 }}>
              {openedFiles.map((file) => (
                <FileCard
                  key={file.fileId}
                  file={file}
                  hasConflict={conflictQueue.some((c) => c.fileId === file.fileId)}
                  onClick={() => handleCardClick(file)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default FilesPage;
