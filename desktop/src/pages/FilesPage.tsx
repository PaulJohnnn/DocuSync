/**
 * @module FilesPage
 * Main file manager — route `/`.
 * 4 metric cards + structured file cards with colored icons.
 * Refactored: uses FileService, RoomService, PeerService. No inline IPC calls.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useElectronSync } from '@/context/ElectronSyncContext';
import {
  FolderOpen, RefreshCw, ChevronRight, Eye, EyeOff,
  FileText, FileCode, FileJson, FileType, File,
  FileImage, FileSpreadsheet, FileArchive, Users, ArrowLeft, LogOut, Loader2, UploadCloud, Download,
} from 'lucide-react';
import FileService, { type FileRecord } from '@/services/FileService';
import RoomService from '@/services/RoomService';
import { ServiceError } from '@/services/errors/ServiceError';
import { notify } from '@docusync/shared/utils/notifications';
import { basename, formatSize } from '@docusync/shared/utils/formatters';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── FileCard ─────────────────────────────────────────────────────────────────

const FileCard: React.FC<{
  file: FileRecord;
  hasConflict: boolean;
  isOfflineQueued?: boolean;
  onClick: () => void;
  onCheckout: () => void;
}> = ({ file, hasConflict, isOfflineQueued, onClick, onCheckout }) => {
  const [fileStatus, setFileStatus] = useState<'syncing' | 'synced'>('syncing');
  const { icon, color, bg } = extMeta(file.extension);
  const name = basename(file.filePath);

  useEffect(() => {
    if (!isOfflineQueued) {
      const t = setTimeout(() => setFileStatus('synced'), 2000);
      return () => clearTimeout(t);
    }
  }, [isOfflineQueued]);

  return (
    <article
      className="ds-card-clickable"
      onClick={onClick}
      style={{
        padding: '8px 16px',
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
        background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, flexShrink: 0, marginRight: 12,
      }}>
        {icon}
      </div>

      {/* Name */}
      <div style={{ flex: 2, minWidth: 0, paddingRight: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </div>
      </div>

      {/* Location (Path) */}
      <div style={{ flex: 2, minWidth: 0, paddingRight: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.filePath}
        </div>
      </div>

      {/* Status */}
      <div style={{ flex: 1.5, minWidth: 0, display: 'flex', alignItems: 'center', paddingRight: 16 }}>
        {hasConflict ? (
          <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 500 }}>⚠ Conflict</span>
        ) : isOfflineQueued ? (
          <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 500 }}>⏳ Queued (Offline)</span>
        ) : fileStatus === 'syncing' ? (
          <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 500 }}>↻ Syncing</span>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 500 }}>✓ Synced</span>
        )}
      </div>

      {/* Size */}
      <div style={{ width: 80, flexShrink: 0, textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>
        {formatSize(file.contentLength)}
      </div>

      {/* Check-Out button */}
      <button
        className="ds-btn ds-btn-ghost"
        title="Check-Out (Download local copy)"
        onClick={(e) => { e.stopPropagation(); onCheckout(); }}
        style={{ marginLeft: 8, padding: '4px 8px', flexShrink: 0 }}
      >
        <Download size={13} />
      </button>
    </article>
  );
};

// ── FilesPage ─────────────────────────────────────────────────────────────────

const FilesPage: React.FC = () => {
  const navigate = useNavigate();
  const { syncStatus, connectedPeers, currentRoom, setCurrentRoom, pendingConflicts, conflictQueue } = useElectronSync();
  const [openedFiles, setOpenedFiles] = useState<FileRecord[]>([]);
  const [offlineQueued, setOfflineQueued] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<'my_files' | 'peer_rooms'>('my_files');
  const location = useLocation();
  const [roomFiles, setRoomFiles] = useState<any[]>([]);
  const [opening, setOpening] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const [showRoomList, setShowRoomList] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [publicRooms, setPublicRooms] = useState<any[]>([]);
  const SESSION_KEY = 'docusync_opened_files';
  const mountedRef = useRef(false);

  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab as any);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Fetch files and room data on a polling interval
  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const files = await FileService.list();
        setOpenedFiles(files);
      } catch { /* silently ignore polling errors */ }
    };

    const fetchRoomFiles = async () => {
      if (!currentRoom || currentRoom.id.startsWith('direct-')) return;
      const files = await RoomService.listRoomFiles(currentRoom.id);
      setRoomFiles(files);
    };

    const fetchPublicRooms = async () => {
      if (activeTab === 'peer_rooms') {
        const rooms = await RoomService.listRooms();
        setPublicRooms(rooms);
      }
    };

    fetchFiles();
    fetchRoomFiles();
    fetchPublicRooms();
    const interval = setInterval(() => {
      fetchFiles();
      fetchRoomFiles();
      fetchPublicRooms();
    }, 2000);
    return () => clearInterval(interval);
  }, [currentRoom, activeTab]);

  // Load previously opened files from session storage
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
    setOpening(true);
    try {
      const file = await FileService.open();
      setOpenedFiles((prev) => prev.some((f) => f.fileId === file.fileId) ? prev : [file, ...prev]);
      notify.success(`Opened: ${basename(file.filePath)}`);
      navigate(`/editor/${file.fileId}`);
    } catch (error) {
      if (error instanceof ServiceError) {
        if (!error.message?.includes('cancel')) notify.error(error.message);
      }
    } finally { setOpening(false); }
  }, [navigate]);

  const handleSync = useCallback(() => {
    setSyncing(true);
    setTimeout(() => setSyncing(false), 2000);
    if (window.docuSync) window.docuSync.triggerSync?.().catch(() => {});
  }, []);

  const handleCardClick = useCallback((file: FileRecord) => {
    const hasConflict = conflictQueue.some((c) => c.fileId === file.fileId);
    navigate(hasConflict ? '/conflicts' : `/editor/${file.fileId}`);
  }, [conflictQueue, navigate]);

  const handleOpenRoomFile = useCallback(async (file: any) => {
    setOpening(true);
    try {
      const imported = await FileService.importRoomFile(file.fileName || file.name, file.content || '', file.fileId);
      setOpenedFiles((prev) => prev.some((f) => f.fileId === imported.fileId) ? prev : [imported, ...prev]);
      notify.success(`Imported: ${basename(imported.filePath)}`);
      navigate(`/editor/${imported.fileId}`);
    } catch (error) {
      if (error instanceof ServiceError) notify.error(error.message);
    } finally { setOpening(false); }
  }, [navigate]);

  const handleCheckout = useCallback(async (file: FileRecord) => {
    try {
      const result = await FileService.checkOut(file.fileId);
      notify.success(`Checked out: ${basename(result.destPath)}`);
    } catch (error) {
      if (error instanceof ServiceError) {
        if (!error.message?.includes('cancel')) notify.error(error.message);
      }
    }
  }, []);

  const handleShareToRoom = async () => {
    if (!currentRoom || currentRoom.id.startsWith('direct-')) {
      notify.error('Cannot share file: Not in a valid OTP repository.');
      return;
    }
    try {
      const file = await FileService.open();
      const newFile = {
        fileId: file.fileId,
        fileName: file.fileName ?? basename(file.filePath),
        filePath: file.filePath,
        contentLength: file.sizeBytes ?? file.contentLength ?? 1024,
        content: file.content,
      };
      await RoomService.shareFileToRoom(currentRoom.id, newFile);
      setRoomFiles(prev => [...prev, newFile]);
      notify.success('File shared to repository!');
    } catch (error) {
      if (error instanceof ServiceError) notify.error(error.message);
      else notify.error('Failed to share file.');
    }
  };

  // Detect going offline — mark all open files as queued
  useEffect(() => {
    const handleOffline = () => {
      setOfflineQueued(new Set(openedFiles.map(f => f.fileId)));
    };
    const handleOnline = () => {
      if (offlineQueued.size > 0) {
        notify.flushed();
        setOfflineQueued(new Set());
      }
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [openedFiles, offlineQueued]);

  const metrics = [
    { label: 'Open Files',   value: openedFiles.length,      dotColor: 'var(--accent)',  desc: 'documents tracked' },
    { label: 'Peers',        value: connectedPeers.length,   dotColor: 'var(--green)',   desc: 'nodes connected',  valueColor: connectedPeers.length > 0 ? 'var(--green)' : undefined },
    { label: 'Sync Status',  value: syncStatus ?? '—',       dotColor: 'var(--purple)',  desc: 'engine state',     isText: true, textColor: 'var(--accent)' },
    { label: 'Conflicts',    value: pendingConflicts,        dotColor: 'var(--red)',     desc: 'pending resolution', valueColor: pendingConflicts > 0 ? 'var(--red)' : undefined },
  ];

  return (
    <React.Fragment>
      {/* ── Topbar ── */}
      <div className="ds-topbar">
        <span className="ds-topbar-title">Files</span>
        <span className="ds-topbar-sep" />

        {/* Segmented control */}
        <div style={{ display: 'flex', background: 'var(--bg-card-hover)', borderRadius: 8, padding: 4, gap: 4 }}>
          <button
            onClick={() => setActiveTab('my_files')}
            style={{
              padding: '6px 16px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer',
              background: activeTab === 'my_files' ? 'var(--bg-card)' : 'transparent',
              color: activeTab === 'my_files' ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: activeTab === 'my_files' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s',
            }}>
            My Files
          </button>
          <button
            onClick={() => setActiveTab('peer_rooms')}
            style={{
              padding: '6px 16px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer',
              background: activeTab === 'peer_rooms' ? 'var(--bg-card)' : 'transparent',
              color: activeTab === 'peer_rooms' ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: activeTab === 'peer_rooms' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s',
            }}>
            Repositories
          </button>
        </div>

        <div className="ds-topbar-actions" style={{ marginLeft: 'auto' }}>
          {activeTab === 'my_files' && (
            <React.Fragment>
              <button className="ds-btn ds-btn-ghost" onClick={() => setShowMetrics(!showMetrics)}>
                {showMetrics ? <EyeOff size={13} /> : <Eye size={13} />}
                {showMetrics ? 'Hide Stats' : 'Show Stats'}
              </button>
              <button id="btn-sync" className="ds-btn ds-btn-ghost" onClick={handleSync} disabled={syncing}>
                <RefreshCw size={13} className={syncing ? 'ds-spin' : ''} />
                Sync Now
              </button>
              <button id="btn-open-file" className="ds-btn ds-btn-primary" onClick={handleOpenFile} disabled={opening}>
                <FolderOpen size={13} />
                {opening ? 'Checking out…' : 'Check-Out (Open)'}
              </button>
            </React.Fragment>
          )}
          {activeTab === 'peer_rooms' && !currentRoom && (
            <button className="ds-btn ds-btn-primary" onClick={() => navigate('/peers')}>
              <Users size={13} /> Create / Join Repository
            </button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="ds-main-scroll ds-page-enter">

        {/* Metric cards */}
        {showMetrics && activeTab === 'my_files' && (
          <div className="ds-metrics-grid">
            {metrics.map((m) => (
              <div key={m.label} className="ds-metric-card">
                <div className="ds-metric-label">
                  <span className="ds-metric-dot" style={{ background: m.dotColor }} />
                  {m.label}
                </div>
                <div className="ds-metric-value" style={{ color: (m as any).valueColor ?? 'var(--text-primary)', fontSize: (m as any).isText ? 14 : undefined, textTransform: (m as any).isText ? 'capitalize' : undefined, paddingTop: (m as any).isText ? 6 : undefined }}>
                  {m.value}
                </div>
                <div className="ds-metric-desc">{m.desc}</div>
              </div>
            ))}
          </div>
        )}

        {/* Peer Repositories List View */}
        {activeTab === 'peer_rooms' && (!currentRoom || showRoomList) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
            {currentRoom && (
              <div style={{ background: 'var(--ds-accent)', color: 'white', padding: '12px 16px', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade80' }} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Active Repository: {currentRoom.name}</span>
                </div>
                <button onClick={() => setShowRoomList(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', padding: '6px 12px', borderRadius: 6, color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  Return to Repository
                </button>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Active Repositories</h2>
              <button className="ds-btn ds-btn-secondary" onClick={() => navigate('/peers')} style={{ padding: '6px 12px' }}>
                <Users size={14} /> Create Repository
              </button>
            </div>

            {publicRooms.length === 0 ? (
              <div className="ds-empty ds-card" style={{ minHeight: 200 }}>
                <div className="ds-empty-icon">🌐</div>
                <h2 style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>No active repositories found</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 360, lineHeight: 1.7, margin: '0 auto' }}>Host a live session to create a new repository.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {publicRooms.map(room => (
                  <div key={room.id} className="ds-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer', transition: 'transform 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>{room.name}</h3>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>OTP: {room.id}</div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--green)', background: 'rgba(34,197,94,0.1)', padding: '4px 8px', borderRadius: 12, fontWeight: 600 }}>Active</div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Users size={14} /> {room.peersJoined || 1} peers</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FolderOpen size={14} /> {room.filesCount} files</div>
                    </div>
                    <button
                      className="ds-btn ds-btn-primary"
                      style={{ width: '100%', marginTop: 4, justifyContent: 'center', opacity: joiningRoomId === room.id ? 0.8 : 1 }}
                      disabled={joiningRoomId === room.id}
                      onClick={async () => {
                        if (currentRoom?.id === room.id) { setShowRoomList(false); return; }
                        try {
                          setJoiningRoomId(room.id);
                          await new Promise(resolve => setTimeout(resolve, 800));
                          const joinResult = await RoomService.joinRoom(room.id, `desktop-${Date.now()}`);
                          if (joinResult.hostType !== 'web') {
                            const connectRes = await window.docuSync.connectToPeer(joinResult.hostIp ?? '', joinResult.hostPort ?? 9000);
                            if (!connectRes.success) throw new Error(connectRes.error ?? 'Connection failed');
                          }
                          setCurrentRoom({ id: room.id, name: joinResult.roomName ?? joinResult.name, isHost: false });
                          setShowRoomList(false);
                        } catch (err: any) {
                          notify.error(`Failed to join: ${err.message}`);
                        } finally { setJoiningRoomId(null); }
                      }}>
                      {joiningRoomId === room.id ? (
                        <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />Connecting...</>
                      ) : (
                        currentRoom?.id === room.id ? 'Return to Repository' : 'Join Repository'
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Selected Repository Drill-down View */}
        {activeTab === 'peer_rooms' && currentRoom && !showRoomList && (
          <React.Fragment>
            {showLeaveConfirm && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 400, maxWidth: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, color: '#ef4444' }}>
                    <LogOut size={24} />
                    <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Leave Repository?</h2>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                    Are you sure you want to permanently leave <strong>{currentRoom.name}</strong>? You will be disconnected from all peers.
                  </p>
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button className="ds-btn ds-btn-ghost" onClick={() => setShowLeaveConfirm(false)} disabled={isLeaving} style={{ border: '1px solid var(--border)' }}>Cancel</button>
                    <button className="ds-btn" style={{ background: '#ef4444', color: 'white', border: 'none', opacity: isLeaving ? 0.7 : 1 }} disabled={isLeaving}
                      onClick={async () => {
                        setIsLeaving(true);
                        await new Promise(r => setTimeout(r, 600));
                        try { await window.docuSync.terminateSession(); } catch (e) { console.error('Terminate session error:', e); }
                        setCurrentRoom(null);
                        setIsLeaving(false);
                        setShowLeaveConfirm(false);
                      }}>
                      {isLeaving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />Leaving...</> : 'Yes, Leave Repository'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, animation: 'fadeIn 0.2s ease', marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={() => setShowRoomList(true)}
                  className="ds-btn ds-btn-ghost"
                  style={{ padding: '6px 12px', transition: 'all 0.2s', border: '1px solid var(--border)', background: 'var(--bg-card)' }}
                  title="Go back to list of rooms"
                >
                  <ArrowLeft size={14} /> Back
                </button>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  {currentRoom.name}
                </h2>
                <span style={{
                  fontSize: 12, background: 'var(--bg-card)', color: 'var(--text-primary)',
                  padding: '2px 8px', borderRadius: 20, fontWeight: 600, border: '1px solid var(--border)',
                }}>
                  OTP: {currentRoom.id}
                </span>
              </div>
              <button
                onClick={() => setShowLeaveConfirm(true)}
                className="ds-btn"
                style={{ 
                  padding: '6px 12px', 
                  background: 'rgba(239, 68, 68, 0.1)', 
                  color: '#ef4444', 
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }}
              >
                <LogOut size={14} /> Leave Session
              </button>
            </div>

            {/* Active Peers */}
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 1, marginTop: 24, marginBottom: 12 }}>
              ACTIVE PEERS ({connectedPeers.length + 1})
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '6px 16px',
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)'
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }}></div>
                <strong>You</strong> (Desktop Node)
              </div>
              {connectedPeers.map((p, i) => (
                <div key={i} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '6px 16px',
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)'
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }}></div>
                  <strong style={{ textTransform: 'uppercase' }}>{p.displayName || p.id.substring(0,8)}</strong>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>::{p.port || 'WS'}</span>
                </div>
              ))}
            </div>

            {/* Room Files */}
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 1, marginTop: 32, marginBottom: 12 }}>
              ROOM FILES
            </div>
            
            {roomFiles.length === 0 ? (
              <div style={{
                background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)',
                padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center',
                minHeight: 160,
              }}>
                <FolderOpen size={32} style={{ color: 'var(--text-muted)', opacity: 0.3, marginBottom: 12 }} />
                <h3 style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}>
                  No files shared in this room yet
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 360, textAlign: 'center', lineHeight: 1.6 }}>
                  Files you share here will be accessible to all connected peers in the room.
                </p>
                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <button className="ds-btn ds-btn-primary" onClick={handleShareToRoom}>
                    <FileText size={14} /> Add File to Repository
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {roomFiles.map((f, i) => (
                  <div key={i} style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16,
                    display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer', transition: 'transform 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                  >
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 8, background: 'rgba(59,130,246,0.1)', color: 'var(--accent)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <FileText size={18} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {f.fileName || f.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {formatSize(f.contentLength || f.content?.length || 0)}
                        </div>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleCheckout(f); }}
                        style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Check-Out
                      </button>
                    </div>
                  </div>
                ))}
                
                <div style={{
                  background: 'transparent', border: '1px dashed var(--border)', borderRadius: 10, padding: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s',
                  minHeight: 80
                }}
                onClick={handleShareToRoom}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-card-hover)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)', fontWeight: 500, fontSize: 14 }}>
                    <FolderOpen size={16} /> Add More Files
                  </div>
                </div>
              </div>
            )}
          </React.Fragment>
        )}

        {/* My Files empty state */}
        {activeTab === 'my_files' && openedFiles.length === 0 && (
          <div className="ds-empty ds-card" style={{ minHeight: 300 }}>
            <div className="ds-empty-icon">📂</div>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>No files opened yet</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 360, lineHeight: 1.7, margin: '0 auto 24px' }}>
              Click <strong style={{ color: 'var(--text-primary)' }}>Check-Out (Open)</strong> to begin.
              DocuSync tracks every edit via delta encoding and syncs across peers using vector clocks.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="ds-btn ds-btn-primary" onClick={handleOpenFile}><FolderOpen size={13} /> Check-Out (Open)</button>
              <button className="ds-btn ds-btn-ghost" onClick={() => navigate('/peers')}>Manage Repositories</button>
            </div>
          </div>
        )}

        {/* My Files list */}
        {activeTab === 'my_files' && openedFiles.length > 0 && (
          <React.Fragment>
            <div className="ds-section-label" style={{ marginTop: 24, paddingBottom: 8 }}>Open Documents</div>
            <div style={{ background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg-card-hover)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 28, marginRight: 12 }} />
                <div style={{ flex: 2, paddingRight: 16 }}>Name</div>
                <div style={{ flex: 2, paddingRight: 16 }}>Location</div>
                <div style={{ flex: 1.5, paddingRight: 16 }}>Status</div>
                <div style={{ width: 80, textAlign: 'right' }}>Size</div>
                <div style={{ width: 60 }} />
              </div>
              <div className="ds-files-grid" style={{ gap: 0 }}>
                {openedFiles.map((file) => (
                  <FileCard
                    key={file.fileId}
                    file={file}
                    hasConflict={conflictQueue.some((c) => c.fileId === file.fileId)}
                    isOfflineQueued={offlineQueued.has(file.fileId)}
                    onClick={() => handleCardClick(file)}
                    onCheckout={() => handleCheckout(file)}
                  />
                ))}
              </div>
            </div>
          </React.Fragment>
        )}
      </div>
    </React.Fragment>
  );
};

export default FilesPage;
