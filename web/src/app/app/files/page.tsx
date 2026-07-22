'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import {
  FolderOpen, FileText, FileCode, FileImage, File,
  Trash2, FileJson, FileType, FileSpreadsheet, FileArchive,
  LogOut, Loader2, ArrowLeft
} from 'lucide-react';
import { uGet, uSet, uRemove } from '@/lib/userStorage';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

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

export default function FilesPage() {
  const router = useRouter();
  const [connectedPeers, setConnectedPeers] = useState<any[]>([]);
  const [roomFiles, setRoomFiles] = useState<any[]>([]);
  const [roomTick, setRoomTick] = useState(0);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [localFiles, setLocalFiles] = useState<FileRecord[]>([]);

  const MATCHMAKER_URL = process.env.NODE_ENV === 'development'
    ? '/api/lobby'
    : 'https://docusync-pnc.vercel.app/api/lobby';

  // Load local files for editing
  useEffect(() => {
    const stored = uGet('files');
    if (stored) setLocalFiles(JSON.parse(stored));
  }, []);

  const saveLocalFiles = useCallback((newFiles: FileRecord[]) => {
    setLocalFiles(newFiles);
    uSet('files', JSON.stringify(newFiles));
  }, []);

  // Poll peers
  useEffect(() => {
    const poll = () => {
      const stored = uGet('peers');
      if (stored) setConnectedPeers(JSON.parse(stored));
    };
    poll();
    const iv = setInterval(poll, 2000);
    return () => clearInterval(iv);
  }, []);

  // Load room files whenever room changes or periodically
  useEffect(() => {
    const fetchRoomFiles = () => {
      const storedRoom = uGet('current_room');
      if (!storedRoom) return;
      try {
        const r = JSON.parse(storedRoom);
        fetch(`${MATCHMAKER_URL}/files?otp=${r.otp || r.id}`)
          .then(res => res.json())
          .then(data => { if (data.files) setRoomFiles(data.files || []); })
          .catch(() => {});
      } catch {}
    };
    
    fetchRoomFiles();
    const iv = setInterval(fetchRoomFiles, 2000);
    return () => clearInterval(iv);
  }, []);

  const [currentRoom, setCurrentRoom] = useState<{ id: string; name: string; otp?: string; hostIp?: string; hostPort?: number } | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const s = uGet('current_room');
    if (s) {
      try { setCurrentRoom(JSON.parse(s)); } catch {}
    } else {
      setCurrentRoom(null);
    }
  }, [roomTick]);

  if (!isMounted) return null;

  // Share file to room
  const handleShareToRoom = async (isFolder = false) => {
    const storedRoom = uGet('current_room');
    if (!storedRoom) return;
    const r = JSON.parse(storedRoom);

    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (isFolder) input.webkitdirectory = true;
    else input.accept = '*/*';

    input.onchange = async (e) => {
      document.body.removeChild(input);
      const selectedFiles = (e.target as HTMLInputElement).files;
      if (!selectedFiles || selectedFiles.length === 0) return;

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        if (file.name.startsWith('.') || file.size > 5 * 1024 * 1024) continue;
        try {
          let content = '';
          const ext = file.name.split('.').pop()?.toLowerCase() || '';
          if (ext === 'docx') {
            const formData = new FormData();
            formData.append('file', file);
            const parseRes = await fetch('/api/parse-docx', { method: 'POST', body: formData });
            const parseData = await parseRes.json();
            content = parseData.text || '';
          } else {
            content = await file.text();
          }

          // Save locally
          const fileIdNum = Date.now() + i;
          const newLocalFile: FileRecord = {
            id: fileIdNum.toString(),
            name: file.name,
            type: file.type || 'text/plain',
            size: file.size,
            content,
            status: 'synced',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          saveLocalFiles([...localFiles, newLocalFile]);

          // Share to room
          const res = await fetch(`${MATCHMAKER_URL}/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              otp: r.otp || r.id,
              file: {
                fileId: fileIdNum,
                fileName: newLocalFile.name,
                content,
                contentLength: content.length,
                sharedBy: 'Web Node',
                sharedAt: new Date().toISOString(),
              }
            }),
          });
          if (!res.ok) {
            const data = await res.json();
            alert(`Failed to upload to room: ${data.error || 'Server error'}. Please try rejoining the room.`);
          }
        } catch (err) {
          console.error('Failed to share file', err);
          alert('Failed to share file: ' + String(err));
        }
      }
      setRoomTick(t => t + 1);
    };
    input.style.display = 'none';
    document.body.appendChild(input);
    input.click();
  };

  // Download room file locally and open in editor
  const handleOpenRoomFile = async (f: any) => {
    const newFile: FileRecord = {
      id: f.fileId?.toString() || crypto.randomUUID(),
      name: f.fileName || f.name || 'SharedFile.txt',
      type: 'text/plain',
      size: f.contentLength || f.content?.length || 0,
      content: f.content || '',
      status: 'synced',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveLocalFiles([...localFiles.filter(ex => ex.id !== newFile.id), newFile]);
    router.push(`/app/editor/${newFile.id}`);
  };

  const handleDownloadRoomFile = async (f: any) => {
    try {
      const blob = new Blob([f.content || ''], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = f.fileName || f.name || 'file.txt';
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (err) { console.error(err); }
  };

  const handleDeleteRoomFile = async (f: any) => {
    if (!currentRoom || !confirm(`Delete "${f.fileName || f.name}" from room?`)) return;
    try {
      const code = (currentRoom as any).otp || currentRoom.id;
      const targetId = f.fileId || f.id || '';
      const targetName = encodeURIComponent(f.fileName || f.name || '');
      const res = await fetch(`/api/lobby/files?otp=${code}&fileId=${targetId}&fileName=${targetName}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setRoomTick(t => t + 1);
      } else {
        alert('Failed to delete file.');
      }
    } catch (err) { console.error(err); }
  };

  // ── No room joined ─────────────────────────────────────────────────────────
  if (!currentRoom) {
    return (
      <PageShell>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Room Workspace</h1>
            <p style={{ fontSize: 13, color: 'var(--t3)', margin: '4px 0 0' }}>No room selected</p>
          </div>
        </div>

        <div style={{
          background: 'var(--s1)', borderRadius: 16, border: '1px solid var(--b1)',
          padding: '80px 20px', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', minHeight: 320,
        }}>
          <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.25 }}>📁</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--t1)', marginBottom: 8, textAlign: 'center' }}>
            No room selected
          </h2>
          <p style={{ color: 'var(--t3)', fontSize: 14, maxWidth: 400, lineHeight: 1.7, textAlign: 'center', marginBottom: 24 }}>
            Go to <strong>Peers</strong> and enter a room to see and collaborate in your workspace.
          </p>
          <button
            className="ds-btn ds-btn-primary"
            onClick={() => router.push('/app/peers')}
          >
            Go to Peers →
          </button>
        </div>
      </PageShell>
    );
  }

  // ── Room workspace view ────────────────────────────────────────────────────
  return (
    <PageShell>
      {/* Leave Confirm Modal */}
      {showLeaveConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
          animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            background: 'var(--bg)', border: '1px solid var(--b1)', borderRadius: 12,
            padding: 24, width: 400, maxWidth: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, color: '#ef4444' }}>
              <LogOut size={22} />
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--t1)' }}>Leave Room?</h2>
            </div>
            <p style={{ color: 'var(--t2)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              Are you sure you want to leave <strong>{currentRoom.name}</strong>? You will be disconnected from all peers.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="ds-btn ds-btn-ghost" onClick={() => setShowLeaveConfirm(false)} disabled={isLeaving}>
                Cancel
              </button>
              <button
                className="ds-btn"
                style={{ background: '#ef4444', color: 'white', border: 'none', opacity: isLeaving ? 0.7 : 1 }}
                disabled={isLeaving}
                onClick={async () => {
                  uRemove('current_room');
                  uRemove('files');
                  setLocalFiles([]);
                  setIsLeaving(false);
                  setShowLeaveConfirm(false);
                  setRoomTick(t => t + 1);
                  router.push('/app/peers');
                }}
              >
                {isLeaving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Leaving...</> : 'Yes, Leave Room'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="ds-btn ds-btn-secondary"
            style={{ padding: '6px 12px' }}
            onClick={() => router.push('/app/peers')}
          >
            <ArrowLeft size={14} /> Back
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>{currentRoom.name}</h1>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(currentRoom.otp || currentRoom.id);
              }}
              title="Copy OTP to clipboard"
              style={{
                background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 20,
                padding: '4px 12px', fontSize: 11, fontWeight: 600, color: '#64748b',
                fontFamily: 'monospace', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                marginTop: 4
              }}
            >
              <span>OTP: {currentRoom.otp || currentRoom.id}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
        </div>
        <button
          className="ds-btn"
          style={{
            padding: '6px 14px',
            background: 'rgba(239,68,68,0.1)', color: '#ef4444',
            border: '1px solid rgba(239,68,68,0.3)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.2)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
          onClick={() => setShowLeaveConfirm(true)}
        >
          <LogOut size={14} /> Leave Room
        </button>
      </div>

      {/* Active Peers */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', letterSpacing: 1, marginBottom: 10 }}>
        ACTIVE PEERS ({connectedPeers.length + 1})
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
        <div style={{
          background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: 20, padding: '5px 14px',
          display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--t1)'
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--grn)' }} />
          <strong>You</strong> (Web Node)
        </div>
        {connectedPeers.map((p, i) => (
          <div key={i} style={{
            background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: 20, padding: '5px 14px',
            display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--t1)'
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.status === 'connected' ? 'var(--grn)' : 'var(--t3)' }} />
            <strong>{p.id?.split(':')[0] ?? 'Peer'}</strong>
          </div>
        ))}
      </div>

      {/* Room Files Label + Share Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', letterSpacing: 1 }}>
          ROOM FILES ({roomFiles.length})
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ds-btn ds-btn-primary" style={{ fontSize: 13 }} onClick={() => handleShareToRoom(false)}>
            <FileText size={13} /> Share Files
          </button>
          <button className="ds-btn ds-btn-secondary" style={{ fontSize: 13 }} onClick={() => handleShareToRoom(true)}>
            <FolderOpen size={13} /> Share Folder
          </button>
        </div>
      </div>

      {/* File List */}
      {roomFiles.length === 0 ? (
        <div style={{
          background: 'var(--s1)', borderRadius: 12, border: '1px solid var(--b1)',
          padding: '60px 20px', display: 'flex', flexDirection: 'column',
          alignItems: 'center', minHeight: 200,
        }}>
          <FolderOpen size={40} style={{ color: 'var(--t3)', opacity: 0.25, marginBottom: 12 }} />
          <h3 style={{ fontSize: 15, fontWeight: 500, color: 'var(--t2)', marginBottom: 6 }}>No files in this room yet</h3>
          <p style={{ fontSize: 13, color: 'var(--t3)', maxWidth: 340, textAlign: 'center', lineHeight: 1.6 }}>
            Share a file to make it available to all peers in the room.
          </p>
        </div>
      ) : (
        <div style={{
          background: 'var(--s1)', borderRadius: 10, border: '1px solid var(--b1)', overflow: 'hidden',
        }}>
          {/* Table Header */}
          <div style={{
            display: 'flex', padding: '10px 16px',
            fontSize: 11, fontWeight: 600, color: 'var(--t3)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
            background: 'var(--s2)', borderBottom: '1px solid var(--b1)',
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
                  borderBottom: i < roomFiles.length - 1 ? '1px solid var(--b1)' : 'none',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: 8, background: bg, color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 12,
                }}>
                  {icon}
                </div>
                <div style={{ flex: 3, minWidth: 0, paddingRight: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.fileName || f.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>Shared by {f.sharedBy || 'Peer'}</div>
                </div>
                <div style={{ flex: 1, fontSize: 12, color: 'var(--t2)' }}>
                  {formatBytes(f.contentLength || f.content?.length || 0)}
                </div>
                <div style={{ minWidth: 240, display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button
                    onClick={() => handleOpenRoomFile(f)}
                    style={{
                      background: 'var(--acc)', color: '#fff', border: 'none',
                      borderRadius: 7, padding: '0 14px', height: 32, fontSize: 12,
                      fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                      display: 'inline-flex', alignItems: 'center',
                    }}
                  >
                    Open & Edit
                  </button>
                  <button
                    onClick={() => handleDownloadRoomFile(f)}
                    style={{
                      background: 'var(--s2)', color: 'var(--t1)', border: '1px solid var(--b1)',
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
    </PageShell>
  );
}
