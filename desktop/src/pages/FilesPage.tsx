/**
 * @module FilesPage
 * Room workspace — shows files inside the currently entered room.
 * "My Files" tab has been removed. Navigate to Peers to select a room.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useElectronSync } from '@/context/ElectronSyncContext';
import {
  FolderOpen, FileText, FileCode, FileJson, FileType, File,
  FileImage, FileSpreadsheet, FileArchive, LogOut, Loader2, ArrowLeft,
} from 'lucide-react';
import FileService from '@/services/FileService';
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

  // Poll room files
  useEffect(() => {
    const fetchRoomFiles = async () => {
      if (!currentRoom || currentRoom.id.startsWith('direct-')) return;
      try {
        const files = await RoomService.listRoomFiles(currentRoom.otp || currentRoom.id);
        setRoomFiles(files);
      } catch { /* silently ignore */ }
    };
    fetchRoomFiles();
    const iv = setInterval(fetchRoomFiles, 2000);
    return () => clearInterval(iv);
  }, [currentRoom]);

  const handleShareToRoom = async () => {
    if (!currentRoom || currentRoom.id.startsWith('direct-')) {
      notify.error('Not in a valid OTP room.');
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
      await RoomService.shareFileToRoom(currentRoom.otp || currentRoom.id, newFile);
      setRoomFiles(prev => [...prev, newFile]);
      notify.success('File shared to room!');
    } catch (error) {
      if (error instanceof ServiceError) notify.error(error.message);
      else notify.error('Failed to share file.');
    }
  };

  const handleOpenRoomFile = useCallback(async (file: any) => {
    setOpening(true);
    try {
      const imported = await FileService.importRoomFile(
        file.fileName || file.name,
        file.content || '',
        file.fileId,
      );
      notify.success(`Opened: ${basename(imported.filePath)}`);
      navigate(`/editor/${imported.fileId}`);
    } catch (error) {
      if (error instanceof ServiceError) notify.error(error.message);
    } finally { setOpening(false); }
  }, [navigate]);

  // ── No room → prompt to go to Peers ──────────────────────────────────────
  if (!currentRoom) {
    return (
      <React.Fragment>
        <div className="ds-topbar">
          <span className="ds-topbar-title">Files</span>
        </div>
        <div className="ds-main-scroll ds-page-enter">
          <div className="ds-empty ds-card" style={{ minHeight: 340, marginTop: 32 }}>
            <div className="ds-empty-icon">📁</div>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
              No room selected
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 360, lineHeight: 1.7, margin: '0 auto 24px' }}>
              Go to <strong style={{ color: 'var(--text-primary)' }}>Peers</strong> and enter a room to see and collaborate on files.
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
          <button className="ds-btn ds-btn-primary" onClick={handleShareToRoom}>
            <FileText size={13} /> Add File to Room
          </button>
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

      {/* Content */}
      <div className="ds-main-scroll ds-page-enter">

        {/* Active Peers */}
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 10 }}>
          ACTIVE PEERS ({Math.max(connectedPeers.length + 1, matchmakerPeerCount)})
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20,
            padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 7,
            fontSize: 13, color: 'var(--text-primary)',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
            <strong>You</strong> (Desktop Node)
          </div>
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
            <FolderOpen size={13} /> Add File to Room
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
              <div style={{ width: 100, textAlign: 'right', paddingRight: 8 }}>Action</div>
            </div>

            {roomFiles.map((f, i) => {
              const ext = (f.fileName || f.name || '').split('.').pop() ?? '';
              const { icon, color, bg } = extMeta(ext);
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '10px 16px',
                    borderBottom: i < roomFiles.length - 1 ? '1px solid var(--border)' : 'none',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 7, background: bg, color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginRight: 12,
                  }}>
                    {icon}
                  </div>
                  <div style={{ flex: 3, minWidth: 0, paddingRight: 16 }}>
                    <div style={{
                      fontWeight: 600, fontSize: 14, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {f.fileName || f.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Shared by {f.sharedBy || 'Peer'}
                    </div>
                  </div>
                  <div style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
                    {formatSize(f.contentLength || f.content?.length || 0)}
                  </div>
                  <div style={{ width: 100, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => handleOpenRoomFile(f)}
                      disabled={opening}
                      style={{
                        background: 'var(--accent)', color: '#fff', border: 'none',
                        borderRadius: 6, padding: '5px 14px', fontSize: 12,
                        fontWeight: 600, cursor: opening ? 'wait' : 'pointer',
                      }}
                    >
                      {opening ? '...' : 'Open & Edit'}
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
