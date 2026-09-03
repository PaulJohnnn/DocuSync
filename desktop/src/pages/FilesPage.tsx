/**
 * @module FilesPage
 * Room workspace — shows files inside the currently entered room.
 * "My Files" tab has been removed. Navigate to Peers to select a room.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useElectronSync } from '@/context/ElectronSyncContext';
import {
  FolderOpen, FileText, FileCode, FileJson, FileType, File,
  FileImage, FileSpreadsheet, FileArchive, LogOut, Loader2, ArrowLeft,
  Trash2, Download,
} from 'lucide-react';
import FileService from '@/services/FileService';
import RoomService from '@/services/RoomService';
import { ServiceError } from '@/services/errors/ServiceError';
import { notify } from '@docusync/shared/utils/notifications';
import { basename, formatSize } from '@docusync/shared/utils/formatters';
import { uRemove } from '@/utils/userStorage';

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
      return { icon: <FileSpreadsheet size={15} />, color: '#22c55e', bg: 'rgba(34,197,94,0.12)'  };
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

// ── FilesPage ─────────────────────────────────────────────────────────────────

const FilesPage: React.FC = () => {
  const navigate = useNavigate();
  const { connectedPeers, currentRoom, setCurrentRoom, matchmakerPeerCount } = useElectronSync();
  const [roomFiles, setRoomFiles] = useState<any[]>([]);
  const [opening, setOpening] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [uploadError, setUploadError] = useState<{ filename: string, reason: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Listen for remote deletes
  useEffect(() => {
    if (!window.docuSync?.onFileDeleted) return;
    const unsub = window.docuSync.onFileDeleted((fileId) => {
      setRoomFiles(prev => prev.filter(f => String(f.fileId ?? f.id) !== String(fileId)));
    });
    return unsub;
  }, []);

  // Poll room files
  useEffect(() => {
    const fetchRoomFiles = async () => {
      if (!currentRoom || currentRoom.id.startsWith('direct-')) return;
      const otp = currentRoom.otp || currentRoom.id;
      
      // Always try to load from cache first
      const cachedStr = localStorage.getItem(`docusync_cached_room_files_${otp}`);
      if (cachedStr && roomFiles.length === 0) {
        try {
          setRoomFiles(JSON.parse(cachedStr));
        } catch (e) {}
      }
      
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return; // skip network if strictly offline
      }

      try {
        const files = await RoomService.listRoomFiles(otp);
        setRoomFiles(files);
        localStorage.setItem(`docusync_cached_room_files_${otp}`, JSON.stringify(files));
      } catch { /* silently ignore */ }
    };
    fetchRoomFiles();
    const iv = setInterval(fetchRoomFiles, 2000);
    return () => clearInterval(iv);
  }, [currentRoom, roomFiles.length]);

  const handleShareToRoom = async () => {
    if (!currentRoom || currentRoom.id.startsWith('direct-')) {
      notify.error('Not in a valid OTP room.');
      return;
    }
    
    try {
      // Direct IPC call ensures native dialog opens flawlessly and securely
      // since the Windows async deadlock was fixed in backend `dialog.showOpenDialog`
      const fileRecord = await window.docuSync.openFile();
      if (!fileRecord.success || !fileRecord.data) {
        throw new Error(fileRecord.error ?? 'File selection cancelled or failed.');
      }
      
      const file = fileRecord.data as any;
      const filename = file.fileName ?? basename(file.filePath);
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      
      const REJECTED_TYPES = ['png', 'jpg', 'jpeg', 'mp4', 'mp3', 'exe', 'zip', 'gif', 'webp', 'bmp', 'ico', 'pdf', 'rar', '7z', 'tar', 'gz', 'dmg', 'iso', 'bin', 'dll', 'so', 'class', 'pyc'];
      if (REJECTED_TYPES.includes(ext)) {
        setUploadError({
          filename,
          reason: `This is a binary file format (.${ext}). DocuSync's collaborative engine requires text-based formats (like Word Documents) to safely stream real-time differences.`
        });
        return;
      }

      setSharing(true);

      const newFile = {
        fileId: file.fileId,
        fileName: filename,
        contentLength: file.sizeBytes ?? file.contentLength ?? 1024,
        content: file.content,
        sharedBy: 'Desktop Node',
        sharedAt: new Date().toISOString(),
      };
      
      await RoomService.shareFileToRoom(currentRoom.otp || currentRoom.id, newFile);
      setRoomFiles(prev => [...prev, newFile]);
      notify.success('File shared to room!');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('cancelled by user') || msg.includes('canceled by user') || msg.includes('File selection cancelled')) {
        return; // Ignore user cancellations
      }
      notify.error(`Failed to share file: ${msg}`);
    } finally {
      setSharing(false);
    }
  };

  const handleOpenRoomFile = useCallback(async (file: any) => {
    if (opening) return;
    setOpening(true);
    try {
      const explicitId = file.fileId ?? file.id;
      
      // Attempt to load locally first (pass name as fallback explicitly for restart-recovery)
      if (explicitId) {
        try {
          const loaded = await window.docuSync.openFile(Number(explicitId), file.fileName || file.name);
          if (loaded.success) {
            notify.success(`Opened: ${basename((loaded.data as any)?.filePath as string)}`);
            navigate(`/editor/${explicitId}`);
            setOpening(false);
            return;
          }
        } catch (e) {
          // Fallback to import if not found locally
        }
      }

      let contentToUse = file.content || '';
      
      // If content in the room file list is empty/stale and we are online, fetch latest snapshot from Matchmaker
      if (!contentToUse && currentRoom && (typeof window !== 'undefined' && navigator.onLine)) {
        const otp = currentRoom.otp || currentRoom.id;
        if (otp) {
          try {
            const _WEB_BASE = (typeof import.meta !== 'undefined' && import.meta.env.VITE_WEB_URL)
              ? import.meta.env.VITE_WEB_URL
              : (typeof import.meta !== 'undefined' && import.meta.env.DEV)
                ? 'http://localhost:3000'
                : 'https://docusync-pnc.vercel.app';
            const res = await fetch(`${_WEB_BASE}/api/lobby/doc?otp=${otp}&fileId=${explicitId}`);
            if (res.ok) {
              const data = await res.json();
              if (data.snapshot?.content) {
                contentToUse = data.snapshot.content;
              }
            }
          } catch (e) {}
        }
      }

      const imported = await FileService.importRoomFile(
        file.fileName || file.name,
        contentToUse,
        explicitId ? Number(explicitId) : undefined,
      );
      notify.success(`Opened: ${basename(imported.filePath)}`);
      navigate(`/editor/${imported.fileId}`);
    } catch (error) {
      if (error instanceof ServiceError) notify.error(error.message);
    } finally { setOpening(false); }
  }, [navigate, currentRoom]);

  const handleDownloadRoomFile = useCallback((file: any) => {
    try {
      const blob = new Blob([file.content || ''], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.fileName || file.name || 'file.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handleDeleteRoomFile = useCallback(async (file: any) => {
    if (!currentRoom || !confirm(`Delete "${file.fileName || file.name}" from room?`)) return;
    try {
      const code = currentRoom.otp || currentRoom.id;
      const targetId = file.fileId || file.id || '';
      const targetName = encodeURIComponent(file.fileName || file.name || '');
      const MATCHMAKER_URL = import.meta.env.VITE_WEB_URL
        ? `${import.meta.env.VITE_WEB_URL}/api/lobby`
        : 'https://docusync-pnc.vercel.app/api/lobby';
      const res = await fetch(`${MATCHMAKER_URL}/files?otp=${code}&fileId=${targetId}&fileName=${targetName}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        if (targetId) {
          try {
            await FileService.deleteFile(Number(targetId));
          } catch (e) {
            console.error('Failed to create local delete event:', e);
          }
        }
        setRoomFiles(prev => prev.filter(f => {
          const idMatch = targetId && String(f.fileId ?? f.id) === String(targetId);
          const nameMatch = (f.fileName || f.name) === decodeURIComponent(targetName);
          return !(idMatch || nameMatch);
        }));
        notify.success('File deleted from room');
      }
    } catch {
      notify.error('Failed to delete file');
    }
  }, [currentRoom]);

  // ── No room → prompt to go to Peers ──────────────────────────────────────
  if (!currentRoom) {
    return (
      <React.Fragment>
        <div className="ds-topbar">
          <span className="ds-topbar-title">Room Workspace</span>
        </div>
        <div className="ds-main-scroll ds-page-enter">
          <div className="ds-empty ds-card" style={{ minHeight: 340, marginTop: 32 }}>
            <div className="ds-empty-icon">📁</div>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
              No room selected
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 360, lineHeight: 1.7, margin: '0 auto 24px' }}>
              Go to <strong style={{ color: 'var(--text-primary)' }}>Peers</strong> and enter a room to see and collaborate in your workspace.
            </p>
            <button className="ds-btn ds-btn-primary" onClick={() => navigate('/peers')}>
              Go to Peers →
            </button>
          </div>
        </div>
      </React.Fragment>
    );
  }

  // ── Room workspace view ───────────────────────────────────────────────────
  return (
    <React.Fragment>
      {/* Topbar */}
      <div className="ds-topbar">
        <button
          className="ds-btn ds-btn-ghost"
          style={{ border: '1px solid var(--border)', marginRight: 8 }}
          onClick={() => navigate('/peers')}
        >
          <ArrowLeft size={13} /> Back
        </button>
        <span className="ds-topbar-title">{currentRoom.name}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(currentRoom.otp || currentRoom.id);
          }}
          title="Copy OTP to clipboard"
          style={{
            background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 20,
            padding: '4px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
            fontFamily: 'monospace', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
          }}>
          <span>OTP: {currentRoom.otp || currentRoom.id}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>

        <div className="ds-topbar-actions" style={{ marginLeft: 'auto' }}>
          <button
            className="ds-btn"
            style={{
              background: 'rgba(239,68,68,0.1)', color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.3)',
            }}
            onClick={() => setShowLeaveConfirm(true)}
          >
            <LogOut size={13} /> Leave Room
          </button>
        </div>
      </div>

      {/* Leave Confirm Modal */}
      {showLeaveConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
            padding: 24, width: 400, maxWidth: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, color: '#ef4444' }}>
              <LogOut size={22} />
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Leave Room?</h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              Are you sure you want to leave <strong>{currentRoom.name}</strong>? You will be disconnected from all peers.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                className="ds-btn ds-btn-ghost"
                style={{ border: '1px solid var(--border)' }}
                onClick={() => setShowLeaveConfirm(false)}
                disabled={isLeaving}
              >
                Cancel
              </button>
              <button
                className="ds-btn"
                style={{ background: '#ef4444', color: 'white', border: 'none', opacity: isLeaving ? 0.7 : 1 }}
                disabled={isLeaving}
                onClick={async () => {
                  setIsLeaving(true);
                  await new Promise(r => setTimeout(r, 600));
                  try { await window.docuSync.terminateSession(); } catch {}
                  setCurrentRoom(null);
                  uRemove('files');
                  uRemove('current_room');
                  setIsLeaving(false);
                  setShowLeaveConfirm(false);
                  navigate('/peers');
                }}
              >
                {isLeaving
                  ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Leaving...</>
                  : 'Yes, Leave Room'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Error Modal */}
      {uploadError && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16,
            padding: '40px 56px', display: 'flex', flexDirection: 'column', alignItems: 'center',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)', width: 480, maxWidth: '90%',
            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: 16, borderRadius: '50%', marginBottom: 16 }}>
              <File style={{ color: '#ef4444' }} size={32} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text-primary)', textAlign: 'center' }}>Incompatible File Type</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 12, marginBottom: 20, textAlign: 'center', lineHeight: 1.6 }}>
              The file <strong>"{uploadError.filename}"</strong> cannot be processed.<br/><br/>
              {uploadError.reason}
            </p>
            <div style={{
              background: 'var(--bg-card-hover)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', display: 'flex', flexDirection: 'column', width: '100%', marginBottom: 24
            }}>
              <strong style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 8 }}>Accepted Formats:</strong>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['.docx', '.doc', '.txt', '.md', '.html', '.json', '.csv'].map(typ => (
                  <span key={typ} style={{ background: 'var(--bg-card)', padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{typ}</span>
                ))}
              </div>
            </div>
            <button className="ds-btn ds-btn-primary" style={{ width: '100%', justifyContent: 'center', height: 44, fontSize: 14 }} onClick={() => setUploadError(null)}>
              Understood
            </button>
          </div>
        </div>
      )}

      {/* Global Sharing/Processing Modal */}
      {sharing && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16,
            padding: '36px 56px', display: 'flex', flexDirection: 'column', alignItems: 'center',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <Loader2 size={48} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)', marginBottom: 20 }} />
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Processing File...</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 8, marginBottom: 0, textAlign: 'center' }}>
              Parsing contents to broadcast to room peers.<br/>Please wait.
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="ds-main-scroll ds-page-enter">

        {/* Active Peers */}
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 10 }}>
          ACTIVE PEERS ({Math.max(connectedPeers.length, Math.max(0, matchmakerPeerCount - 1)) + 1})
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
          {connectedPeers.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 8px' }}>
              No other peers connected
            </div>
          )}
          {connectedPeers.map((p, i) => (
            <div key={i} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20,
              padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 13, color: 'var(--text-primary)',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
              <strong>{p.displayName || p.id?.substring(0, 8) || 'Peer'}</strong>
            </div>
          ))}
        </div>

        {/* Room Files Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 1 }}>
            ROOM FILES ({roomFiles.length})
          </div>
          <button className="ds-btn ds-btn-primary" style={{ fontSize: 12 }} onClick={handleShareToRoom}>
            <FolderOpen size={13} /> Share File
          </button>
        </div>

        {/* File List */}
        {roomFiles.length === 0 ? (
          <div className="ds-card" style={{
            padding: '50px 20px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', minHeight: 180,
          }}>
            <FolderOpen size={36} style={{ color: 'var(--text-muted)', opacity: 0.25, marginBottom: 12 }} />
            <h3 style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>
              No files in this room yet
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 340, textAlign: 'center', lineHeight: 1.6 }}>
              Share a file to make it available to all peers in this room.
            </p>
          </div>
        ) : (
          <div style={{
            background: 'var(--bg-card)', borderRadius: 10,
            border: '1px solid var(--border)', overflow: 'hidden',
          }}>
            {/* Table Header */}
            <div style={{
              display: 'flex', padding: '10px 16px',
              fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
              background: 'var(--bg-card-hover)', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ width: 36, marginRight: 12 }} />
              <div style={{ flex: 3, paddingRight: 16 }}>Name</div>
              <div style={{ flex: 1, paddingRight: 16 }}>Size</div>
              <div style={{ minWidth: 240, textAlign: 'right', paddingRight: 8 }}>Actions</div>
            </div>

            {roomFiles.map((f, i) => {
              const ext = (f.fileName || f.name || '').split('.').pop() ?? '';
              const { icon, color, bg } = extMeta(ext);
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '12px 16px',
                    borderBottom: i < roomFiles.length - 1 ? '1px solid var(--border)' : 'none',
                    transition: 'background 0.15s',
                    opacity: 1,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{
                    width: 34, height: 34, borderRadius: 8, background: bg, color: color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginRight: 12, filter: 'none',
                  }}>
                    {icon}
                  </div>
                  <div style={{ flex: 3, minWidth: 0, paddingRight: 16 }}>
                    <div style={{
                      fontWeight: 600, fontSize: 14, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      textDecoration: 'none',
                    }}>
                      {f.fileName || f.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {`Shared by ${f.sharedBy || 'Peer'}`}
                    </div>
                  </div>
                  <div style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
                    {formatSize(f.contentLength || f.content?.length || 0)}
                  </div>
                  <div style={{ minWidth: 240, display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                    <button
                      onClick={() => handleOpenRoomFile(f)}
                      disabled={opening}
                      style={{
                        background: 'var(--accent)', color: '#fff', border: 'none',
                        borderRadius: 7, padding: '0 14px', height: 32, fontSize: 12,
                        fontWeight: 600, cursor: opening ? 'wait' : 'pointer', whiteSpace: 'nowrap',
                        display: 'inline-flex', alignItems: 'center',
                      }}
                    >
                      {opening ? '...' : 'Open & Edit'}
                    </button>
                        <button
                          onClick={() => handleDownloadRoomFile(f)}
                          style={{
                            background: 'var(--bg-card-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)',
                            borderRadius: 7, padding: '0 12px', height: 32, fontSize: 12,
                            fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                            display: 'inline-flex', alignItems: 'center',
                          }}
                        >
                          Download
                        </button>
                        <button
                          onClick={() => handleDeleteRoomFile(f)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: 7, width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', flexShrink: 0,
                          }}
                          title="Delete file from room"
                        >
                          <Trash2 size={15} />
                        </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </React.Fragment>
  );
};

export default FilesPage;
