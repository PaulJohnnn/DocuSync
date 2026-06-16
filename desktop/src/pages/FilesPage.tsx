/**
 * @module FilesPage
 * Main file manager — route `/`.
 * 4 metric cards with gradient top accents + file cards with extension icons.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useElectronSync } from '@/context/ElectronSyncContext';
import { toast } from 'sonner';
import { FolderOpen, RefreshCw, ChevronRight } from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────

interface OpenedFile {
  fileId: number;
  filePath: string;
  contentLength: number;
  extension: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extMeta(ext: string): { icon: string; color: string; bg: string; borderColor: string } {
  switch (ext.toLowerCase()) {
    case 'md': case 'markdown':
      return { icon: 'MD', color: 'var(--accent)',  bg: 'var(--accent-glow)',  borderColor: 'var(--border-accent)' };
    case 'txt': case 'text':
      return { icon: 'TXT', color: 'var(--text-secondary)', bg: 'var(--bg-surface)', borderColor: 'var(--border-default)' };
    case 'json':
      return { icon: 'JS',  color: 'var(--amber)',  bg: 'var(--amber-bg)',     borderColor: 'var(--amber-border)' };
    case 'docx': case 'doc':
      return { icon: 'DOC', color: 'var(--accent)',  bg: 'var(--accent-glow)',  borderColor: 'var(--border-accent)' };
    case 'csv': case 'tsv':
      return { icon: 'CSV', color: 'var(--green)',   bg: 'var(--green-bg)',     borderColor: 'var(--green-border)' };
    case 'xml': case 'html': case 'htm':
      return { icon: 'XML', color: 'var(--purple)',  bg: 'var(--purple-bg)',    borderColor: 'var(--purple-border)' };
    default:
      return { icon: 'FILE', color: 'var(--text-muted)', bg: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
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
  const { icon, color, bg, borderColor } = extMeta(file.extension);
  const name = basename(file.filePath);

  useEffect(() => {
    const t = setTimeout(() => setFileStatus('synced'), 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <article
      className="ds-card ds-card-clickable"
      onClick={onClick}
      style={{
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        borderColor: hasConflict ? 'var(--red-border)' : undefined,
      }}
    >
      {/* Extension icon */}
      <div style={{
        width: 40, height: 40,
        borderRadius: 10,
        background: bg,
        border: `1px solid ${borderColor}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.6rem', fontWeight: 800, color,
        flexShrink: 0,
        letterSpacing: '-0.02em',
        fontFamily: 'monospace',
      }}>
        {icon}
      </div>

      {/* Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 600, fontSize: '0.87rem', color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: 2,
        }}>
          {name}
        </div>
        <div style={{
          fontSize: '0.65rem', color: 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: 'monospace',
        }}>
          {file.filePath}
        </div>
        {/* Tags row */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
          {hasConflict ? (
            <span className="ds-badge ds-badge-red ds-conflict-pulse">⚠ Conflict</span>
          ) : fileStatus === 'syncing' ? (
            <span className="ds-badge ds-badge-amber"><span className="ds-pulse">●</span> Syncing</span>
          ) : (
            <span className="ds-badge ds-badge-green">✓ Synced</span>
          )}
          <span className="ds-badge ds-badge-muted">.{file.extension}</span>
          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{formatSize(file.contentLength)}</span>
        </div>
      </div>

      {/* Chevron */}
      <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    </article>
  );
};

// ── FilesPage ────────────────────────────────────────────────────────────────

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
    } finally {
      setOpening(false);
    }
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

        {/* ── Metric Cards ── */}
        <div className="ds-metrics-grid">
          <div className="ds-metric-card" data-type="files">
            <span className="ds-metric-label">Open Files</span>
            <span className="ds-metric-value">{openedFiles.length}</span>
          </div>
          <div className="ds-metric-card" data-type="peers">
            <span className="ds-metric-label">Peers</span>
            <span className="ds-metric-value" style={{ color: connectedPeers.length > 0 ? 'var(--green)' : undefined }}>
              {connectedPeers.length}
            </span>
          </div>
          <div className="ds-metric-card" data-type="events">
            <span className="ds-metric-label">Sync Status</span>
            <span className="ds-metric-value" style={{ fontSize: '1rem', paddingTop: 4, textTransform: 'capitalize', color: 'var(--accent)' }}>
              {syncStatus ?? '—'}
            </span>
          </div>
          <div className="ds-metric-card" data-type="conflicts">
            <span className="ds-metric-label">Conflicts</span>
            <span className="ds-metric-value" style={{ color: pendingConflicts > 0 ? 'var(--red)' : undefined }}>
              {pendingConflicts}
            </span>
          </div>
        </div>

        {/* ── File List ── */}
        {openedFiles.length === 0 ? (
          <div className="ds-empty ds-card" style={{ minHeight: 320 }}>
            <div className="ds-empty-icon">📂</div>
            <h2 style={{ fontSize: '1.05rem', marginBottom: 8, color: 'var(--text-primary)' }}>
              No files opened yet
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', maxWidth: 360, lineHeight: 1.7, margin: '0 auto 24px' }}>
              Click <strong style={{ color: 'var(--text-primary)' }}>Open File</strong> to begin.
              DocuSync tracks every keystroke using delta encoding and syncs
              across peers via vector clocks.
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
          <div className="ds-files-grid">
            {openedFiles.map((file) => (
              <FileCard
                key={file.fileId}
                file={file}
                hasConflict={conflictQueue.some((c) => c.fileId === file.fileId)}
                onClick={() => handleCardClick(file)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default FilesPage;
