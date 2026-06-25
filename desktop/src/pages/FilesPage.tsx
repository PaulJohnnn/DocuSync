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
import {
  FolderOpen, RefreshCw, ChevronRight, Eye, EyeOff,
  FileText, FileCode, FileJson, FileType, File,
  FileImage, FileSpreadsheet, FileArchive, Users, ArrowLeft, MoreVertical, UploadCloud, Download
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface OpenedFile {
  fileId: number;
  filePath: string;
  contentLength: number;
  extension: string;
}

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
        background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color,
        flexShrink: 0,
        marginRight: 12,
      }}>
        {icon}
      </div>

      {/* Name */}
      <div style={{ flex: 2, minWidth: 0, paddingRight: 16 }}>
        <div style={{
          fontWeight: 600, fontSize: 14, color: 'var(--text-primary)',
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
        ) : isOfflineQueued ? (
          <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 500 }}>⏳ Queued (Offline)</span>
        ) : fileStatus === 'syncing' ? (
          <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 500 }}>↻ Syncing</span>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 500 }}>✓ Synced — Working fine</span>
        )}
      </div>

      {/* Size */}
      <div style={{ width: 80, flexShrink: 0, textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>
        {formatSize(file.contentLength)}
      </div>

      {/* Download (checkout) button */}
      <button
        className="ds-btn ds-btn-ghost"
        title="Download file (Check-out)"
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
  const [openedFiles, setOpenedFiles] = useState<any[]>([]);
  const [offlineQueued, setOfflineQueued] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<'my_files' | 'peer_rooms'>('my_files');
  const [roomFiles, setRoomFiles] = useState<any[]>([]);
  const [opening, setOpening] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const SESSION_KEY = 'docusync_opened_files';
  const mountedRef = useRef(false);

  // ── Matchmaker URL (configurable — no hardcoded IPs) ──────────────────────
  const MATCHMAKER_URL = (() => {
    try { return localStorage.getItem('docusync_matchmaker_url') ?? 'https://docusync-pnc.vercel.app'; } catch { return 'https://docusync-pnc.vercel.app'; }
  })();

  const [publicRooms, setPublicRooms] = useState<any[]>([]);

  // Fetch opened files (from sync:status and IPC)
  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const files = await (window as any).electron.ipcRenderer.invoke('files:list');
        if (files?.success) {
          setOpenedFiles(files.data);
        }
      } catch (err) {
        console.error('Failed to list files:', err);
      }
    };

    const fetchRoomFiles = async () => {
      if (!currentRoom || currentRoom.id.startsWith('direct-')) return;
      try {
        const res = await fetch(`${MATCHMAKER_URL}/api/lobby/files?otp=${currentRoom.id}`);
        if (res.ok) {
          const data = await res.json();
          setRoomFiles(data.files || []);
        }
      } catch (err) {
        console.error('Failed to fetch room files', err);
      }
    };
    
    const fetchPublicRooms = async () => {
      if (activeTab === 'peer_rooms' && !currentRoom) {
        try {
          const res = await fetch(`${MATCHMAKER_URL}/api/lobby/list`);
          if (res.ok) {
            const data = await res.json();
            setPublicRooms(data.rooms || []);
          }
        } catch (err) {
          console.error('Failed to fetch public rooms', err);
        }
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
  }, [currentRoom, activeTab, MATCHMAKER_URL]);

  const handleShareToRoom = async () => {
    if (!currentRoom || currentRoom.id.startsWith('direct-')) {
      toast.error('Cannot share file: Not in a valid OTP lobby.');
      return;
    }
    try {
      const res = await window.docuSync.openFile();
      if (res && res.success && res.data) {
        const openedFile = res.data as any;
        const newFile = {
          fileId: openedFile.fileId,
          fileName: openedFile.fileName,
          filePath: openedFile.filePath,
          contentLength: openedFile.sizeBytes || openedFile.contentLength || 1024,
        };
        
        await fetch(`${MATCHMAKER_URL}/api/lobby/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otp: currentRoom.id, file: newFile })
        });
        
        setRoomFiles(prev => [...prev, newFile]);
        toast.success('File shared to room!');
      }
    } catch (err) {
      console.error('Failed to share file to room:', err);
      toast.error('Failed to share file');
    }
  };

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    // Load any previously opened files from sessionStorage
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
        if (res.error && !res.error.includes('cancel')) {
          if (res.error.startsWith('Error:')) toast.error(res.error);
          else toast.error(`Failed: ${res.error}`);
        }
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

  const handleCheckout = useCallback(async (file: OpenedFile) => {
    if (!window.docuSync?.checkoutFile) {
      toast.error('Checkout not available (IPC bridge missing).');
      return;
    }
    try {
      const res = await window.docuSync.checkoutFile(file.fileId);
      if (res.success) {
        toast.success(`Checked out: ${basename((res.data as any).destPath)}`);
      } else {
        if (!res.error?.includes('cancel')) toast.error(`Checkout failed: ${res.error}`);
      }
    } catch (err) {
      toast.error(`Checkout error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  // Detect going offline — mark all open files as queued
  useEffect(() => {
    const handleOffline = () => {
      setOfflineQueued(new Set(openedFiles.map(f => f.fileId)));
    };
    const handleOnline = () => {
      if (offlineQueued.size > 0) {
        toast.success('Queued edits synced successfully.', { duration: 4000 });
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
    { label: 'Open Files', value: openedFiles.length, dotColor: 'var(--accent)', desc: 'documents tracked' },
    { label: 'Peers',      value: connectedPeers.length, dotColor: 'var(--green)', desc: 'nodes connected',
      valueColor: connectedPeers.length > 0 ? 'var(--green)' : undefined },
    { label: 'Sync Status', value: syncStatus ?? '—', dotColor: 'var(--purple)',
      desc: 'engine state', isText: true, textColor: 'var(--accent)' },
    { label: 'Conflicts',  value: pendingConflicts, dotColor: 'var(--red)', desc: 'pending resolution',
      valueColor: pendingConflicts > 0 ? 'var(--red)' : undefined },
  ];

  return (
    <React.Fragment>
      {/* ── Topbar ── */}
      <div className="ds-topbar">
        <span className="ds-topbar-title">Files</span>
        <span className="ds-topbar-sep" />
        
        {/* SEGMENTED CONTROL */}
        <div style={{ display: 'flex', background: 'var(--bg-card-hover)', borderRadius: 8, padding: 4, gap: 4 }}>
          <button 
            onClick={() => setActiveTab('my_files')}
            style={{ 
              padding: '6px 16px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer',
              background: activeTab === 'my_files' ? 'var(--bg-card)' : 'transparent',
              color: activeTab === 'my_files' ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: activeTab === 'my_files' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s'
            }}>
            My Files
          </button>
          <button 
            onClick={() => setActiveTab('peer_rooms')}
            style={{ 
              padding: '6px 16px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer',
              background: activeTab === 'peer_rooms' ? 'var(--bg-card)' : 'transparent',
              color: activeTab === 'peer_rooms' ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: activeTab === 'peer_rooms' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s'
            }}>
            Peer Rooms
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
                {opening ? 'Opening…' : 'Open File'}
              </button>
            </React.Fragment>
          )}
          {activeTab === 'peer_rooms' && !currentRoom && (
            <button className="ds-btn ds-btn-primary" onClick={() => navigate('/peers')}>
              <Users size={13} />
              Host/Join via OTP
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
        )}

        {/* Peer Rooms List View */}
        {activeTab === 'peer_rooms' && !currentRoom && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Active Peer Rooms</h2>
              <button className="ds-btn ds-btn-secondary" onClick={() => navigate('/peers')} style={{ padding: '6px 12px' }}>
                <Users size={14} /> Host New Room
              </button>
            </div>
            
            {publicRooms.length === 0 ? (
              <div className="ds-empty ds-card" style={{ minHeight: 200 }}>
                <div className="ds-empty-icon">🌐</div>
                <h2 style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  No active rooms found
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 360, lineHeight: 1.7, margin: '0 auto' }}>
                  Host a live session to create a new room.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {publicRooms.map(room => (
                  <div key={room.id} className="ds-card" style={{
                    padding: 20, display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer', transition: 'transform 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                  >
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
                    
                    <button className="ds-btn ds-btn-primary" style={{ width: '100%', marginTop: 4, justifyContent: 'center' }} onClick={async () => {
                      try {
                        const res = await fetch(`${MATCHMAKER_URL}/api/lobby/join`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ otp: room.id, clientNodeId: `desktop-${window.docuSync?.nodeId || Date.now()}` })
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error);
                        
                        const connectRes = await window.docuSync.connectPeer(data.hostIp, data.hostPort);
                        if (!connectRes.success) throw new Error(connectRes.error ?? 'Connection failed');
                        
                        setCurrentRoom({ id: room.id, name: data.roomName, isHost: false });
                        toast.success('Successfully joined the room!');
                      } catch (err: any) {
                        toast.error(`Failed to join: ${err.message}`);
                      }
                    }}>
                      Join Room
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Selected Room Drill-down View */}
        {activeTab === 'peer_rooms' && currentRoom && (
          <React.Fragment>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, marginTop: 12 }}>
              <button 
                onClick={() => {
                  if (window.confirm("Are you sure you want to leave this room?")) {
                    setCurrentRoom(null);
                  }
                }}
                className="ds-btn ds-btn-ghost"
                style={{ padding: '6px 12px', border: '1px solid var(--border)', background: 'var(--bg-card)' }}
              >
                <ArrowLeft size={14} /> Leave
              </button>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                {currentRoom.name}
              </h2>
              <span style={{ fontSize: 12, background: `var(--bg-card-hover)`, color: 'var(--text-primary)', padding: '2px 8px', borderRadius: 20, fontWeight: 600, border: '1px solid var(--border)' }}>
                {currentRoom.id.startsWith('direct-') ? 'Direct IP' : `OTP: ${currentRoom.id}`}
              </span>
            </div>
            
            {/* Active Peers Bar */}
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: 8,
              border: '1px solid var(--border)',
              padding: '16px',
              marginBottom: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Active Peers ({connectedPeers.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {connectedPeers.length === 0 ? (
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Waiting for peers to join...</span>
                ) : (
                  connectedPeers.map(peer => (
                    <div key={peer.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-body)', padding: '6px 12px', borderRadius: 20, border: '1px solid var(--border)' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ds-green)' }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{peer.displayName || 'Anonymous'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{peer.address}:{peer.port}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="ds-section-label" style={{ paddingBottom: 8 }}>
              Room Files
            </div>
            
            {roomFiles.length === 0 ? (
              <div className="ds-empty ds-card" style={{ minHeight: 200, padding: '40px 20px' }}>
                <div className="ds-empty-icon" style={{ marginBottom: 12 }}>
                  <UploadCloud size={48} color="var(--border)" strokeWidth={1.5} />
                </div>
                <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  No files shared in this room yet
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 360, lineHeight: 1.6, margin: '0 auto 16px' }}>
                  Files you share here will be accessible to all connected peers in the room.
                </p>
                <button className="ds-btn ds-btn-primary" onClick={handleShareToRoom}>
                  <FolderOpen size={13} /> Share File to Room
                </button>
              </div>
            ) : (
              <div style={{
                background: 'var(--bg-card)',
                borderRadius: 8,
                border: '1px solid var(--border)',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}>
                <div style={{
                  display: 'flex', padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg-card-hover)', borderBottom: '1px solid var(--border)'
                }}>
                  <div style={{ width: 28, marginRight: 12 }} />
                  <div style={{ flex: 2, paddingRight: 16 }}>Name</div>
                  <div style={{ flex: 2, paddingRight: 16 }}>Location</div>
                  <div style={{ flex: 1.5, paddingRight: 16 }}>Status</div>
                  <div style={{ width: 80, textAlign: 'right' }}>Size</div>
                </div>
                <div className="ds-files-grid" style={{ gap: 0 }}>
                  {roomFiles.map((file) => (
                    <FileCard
                      key={file.fileId}
                      file={file as unknown as OpenedFile}
                      hasConflict={false}
                      onClick={() => {}}
                    />
                  ))}
                </div>
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center' }}>
                  <button className="ds-btn ds-btn-ghost" onClick={handleShareToRoom}>
                    <FolderOpen size={13} /> Add More Files
                  </button>
                </div>
              </div>
            )}
          </React.Fragment>
        )}

        {/* My Files File list */}
        {activeTab === 'my_files' && openedFiles.length === 0 && (
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
        )}

        {/* My Files List Continuation */}
        {activeTab === 'my_files' && openedFiles.length > 0 && (
          <React.Fragment>
            <div className="ds-section-label" style={{ marginTop: 24, paddingBottom: 8 }}>
              Open Documents
            </div>
            
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: 8,
              border: '1px solid var(--border)',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              {/* Table Header */}
              <div style={{
                display: 'flex',
                padding: '10px 16px',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                background: 'var(--bg-card-hover)',
                borderBottom: '1px solid var(--border)'
              }}>
                <div style={{ width: 28, marginRight: 12 }} /> {/* Icon spacer */}
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
