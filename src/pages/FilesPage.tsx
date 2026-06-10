/**
 * @module FilesPage
 * Main file manager page — route `/`.
 * Metric cards + file cards with colored extension icons.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useElectronSync } from '@/context/ElectronSyncContext';
import { toast } from 'sonner';
import { IconFolderOpen, IconRefresh } from '@/components/Icons';

// ── Types ───────────────────────────────────────────────────────────────────

interface OpenedFile {
  fileId: number;
  filePath: string;
  contentLength: number;
  extension: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extMeta(ext: string): { icon: string; color: string; bg: string } {
  switch (ext.toLowerCase()) {
    case 'md': case 'markdown':
      return { icon: 'M', color: 'var(--ds-accent)', bg: 'var(--ds-accent-bg)' };
    case 'txt': case 'text':
      return { icon: 'T', color: 'var(--ds-text2)', bg: 'var(--ds-bg3)' };
    case 'json':
      return { icon: 'J', color: 'var(--ds-amber)', bg: 'var(--ds-amber-bg)' };
    case 'docx': case 'doc':
      return { icon: 'D', color: 'var(--ds-accent)', bg: 'var(--ds-accent-bg)' };
    case 'csv': case 'tsv':
      return { icon: 'C', color: 'var(--ds-green)', bg: 'var(--ds-green-bg)' };
    case 'xml': case 'html': case 'htm':
      return { icon: 'X', color: 'var(--ds-purple)', bg: 'var(--ds-purple-bg)' };
    default:
      return { icon: 'F', color: 'var(--ds-text3)', bg: 'var(--ds-bg3)' };
  }
}

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p;
}

function formatSize(chars: number): string {
  if (chars >= 1024 * 1024) return `${(chars / (1024 * 1024)).toFixed(1)} MB`;
  if (chars >= 1024) return `${(chars / 1024).toFixed(1)} KB`;
  return `${chars} B`;
}

// ── Component ───────────────────────────────────────────────────────────────

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
      {/* Topbar */}
      <div className="ds-topbar">
        <div>
          <span className="ds-topbar-title">Files</span>
          <span className="ds-topbar-subtitle">Open documents for P2P editing</span>
        </div>
        <div className="ds-topbar-actions">
          <button className="ds-btn ds-btn-ghost" onClick={handleSync} disabled={syncing}>
            <span className={syncing ? 'ds-spin' : ''} style={{ display: 'inline-flex' }}>
              <IconRefresh size={14} />
            </span>
            Sync Now
          </button>
          <button className="ds-btn ds-btn-primary" onClick={handleOpenFile} disabled={opening}>
            <IconFolderOpen size={14} />
            {opening ? 'Opening…' : 'Open File'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="ds-main-scroll ds-page-enter">
        {/* Metrics */}
        <div className="ds-metrics-grid">
          <div className="ds-metric-card">
            <span className="ds-metric-label">Open Files</span>
            <span className="ds-metric-value">{openedFiles.length}</span>
          </div>
          <div className="ds-metric-card">
            <span className="ds-metric-label">Peers</span>
            <span className="ds-metric-value" style={{ color: 'var(--ds-green)' }}>{connectedPeers.length}</span>
          </div>
          <div className="ds-metric-card">
            <span className="ds-metric-label">Log Events</span>
            <span className="ds-metric-value" style={{ color: 'var(--ds-accent)' }}>—</span>
          </div>
          <div className="ds-metric-card">
            <span className="ds-metric-label">Conflicts</span>
            <span className="ds-metric-value" style={{ color: pendingConflicts > 0 ? 'var(--ds-red)' : 'var(--ds-text2)' }}>
              {pendingConflicts}
            </span>
          </div>
        </div>

        {/* File Cards */}
        {openedFiles.length === 0 ? (
          <div className="ds-empty" style={{ background: 'var(--ds-surface)', borderRadius: 'var(--ds-radius-lg)', border: '1px solid var(--ds-border)' }}>
            <div className="ds-empty-icon">📂</div>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No files opened yet</h2>
            <p style={{ color: 'var(--ds-text2)', fontSize: '0.82rem', maxWidth: 360, lineHeight: 1.7, margin: '0 auto 1.5rem' }}>
              Click <strong style={{ color: 'var(--ds-text)' }}>Open File</strong> to begin.
              DocuSync will track changes and sync them via delta encoding and vector clocks.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="ds-btn ds-btn-primary" onClick={handleOpenFile}><IconFolderOpen size={14} /> Open File</button>
              <button className="ds-btn ds-btn-ghost" onClick={() => navigate('/peers')}>Manage Peers</button>
            </div>
          </div>
        ) : (
          <div className="ds-files-grid">
            {openedFiles.map((file) => {
              const { icon, color, bg } = extMeta(file.extension);
              const name = basename(file.filePath);
              const hasConflict = conflictQueue.some((c) => c.fileId === file.fileId);
              const [fileStatus, setFileStatus] = useState<'syncing' | 'synced'>('syncing');

              // Simulate status change from syncing → synced
              useEffect(() => {
                const t = setTimeout(() => setFileStatus('synced'), 2000);
                return () => clearTimeout(t);
              }, []);

              return (
                <article
                  key={file.fileId}
                  className="ds-card ds-card-clickable"
                  onClick={() => handleCardClick(file)}
                  style={{ padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                >
                  {/* Extension icon */}
                  <div style={{
                    width: 40, height: 40, borderRadius: 'var(--ds-radius)',
                    background: bg, border: `1px solid ${color}33`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.9rem', fontWeight: 800, color,
                    flexShrink: 0,
                  }}>
                    {icon}
                  </div>

                  {/* Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 600, fontSize: '0.85rem', color: 'var(--ds-text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{name}</div>
                    <div style={{
                      fontSize: '0.68rem', color: 'var(--ds-text3)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontFamily: 'monospace', marginTop: '1px',
                    }}>{file.filePath}</div>
                  </div>

                  {/* Tags */}
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }}>
                    {hasConflict ? (
                      <span className="ds-badge ds-badge-red ds-conflict-pulse">⚠ Conflict</span>
                    ) : fileStatus === 'syncing' ? (
                      <span className="ds-badge ds-badge-amber">● Syncing</span>
                    ) : (
                      <span className="ds-badge ds-badge-green">● Synced</span>
                    )}
                    <span className="ds-badge ds-badge-muted">.{file.extension}</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--ds-text3)' }}>{formatSize(file.contentLength)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

export default FilesPage;
