'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import ConfirmModal from '@/components/ConfirmModal';
import {
  FolderOpen, FileText, FileCode, FileImage, File,
  Trash2, FileJson, FileType, FileSpreadsheet, FileArchive,
  LogOut, Loader2, ArrowLeft, Upload
} from 'lucide-react';
import { uGet, uSet, uRemove } from '@/lib/userStorage';
import { idbGetFiles, idbSaveFile, idbDeleteFile } from '@/lib/idb';
import * as mockAuthService from '@/lib/mockAuthService';

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
  const [myName, setMyName] = useState('You');
  const [localNodeId, setLocalNodeId] = useState('');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const user = mockAuthService.getCurrentUser();
      const name = mockAuthService.getDisplayName(user);
      if (name) setMyName(name);
      setLocalNodeId(uGet('node_id') || '');
    }
  }, []);
  const [connectedPeers, setConnectedPeers] = useState<any[]>([]);
  const [roomFiles, setRoomFiles] = useState<any[]>([]);
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModalState({ isOpen: true, title, message, onConfirm });
  };

  const closeConfirm = () => {
    setConfirmModalState(prev => ({ ...prev, isOpen: false }));
  };
  const [roomTick, setRoomTick] = useState(0);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [localFiles, setLocalFiles] = useState<FileRecord[]>([]);

  const MATCHMAKER_URL = process.env.NODE_ENV === 'development'
    ? '/api/lobby'
    : '/api/lobby';

  // Load local files for editing
  useEffect(() => {
    idbGetFiles().then(files => {
      if (files) setLocalFiles(files);
    });
  }, []);

  const saveLocalFiles = useCallback((newFiles: FileRecord[]) => {
    setLocalFiles(newFiles);
    // Note: this function previously saved the entire array. 
    // Now we will rely on individual saves, but for simplicity here we save them all.
    Promise.all(newFiles.map(f => idbSaveFile(f)));
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
        const otp = r.otp || r.id;
        
        // Always try to load from cache first for immediate display (especially if offline)
        const cachedStr = uGet(`docusync_cached_room_files_${otp}`);
        if (cachedStr && roomFiles.length === 0) {
          try {
            setRoomFiles(JSON.parse(cachedStr));
          } catch (_e) {}
        }
        
        // If we are definitely offline (no network at all), skip fetching to avoid throwing
        if (typeof window !== 'undefined' && navigator.onLine === false) {
          return;
        }

        fetch(`${MATCHMAKER_URL}/files?otp=${otp}`)
          .then(res => res.ok ? res.json() : null)
          .then(data => { 
            if (data?.files) {
              setRoomFiles(data.files); 
              uSet(`docusync_cached_room_files_${otp}`, JSON.stringify(data.files));
            }
          })
          .catch(() => {});
      } catch {}
    };
    
    fetchRoomFiles();
    const iv = setInterval(fetchRoomFiles, 2000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomFiles.length]);

  const [currentRoom, setCurrentRoom] = useState<{ id: string; name: string; otp?: string; hostIp?: string; hostPort?: number } | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isPeersOpen, setIsPeersOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [uploadError, setUploadError] = useState<{ filename: string, reason: string } | null>(null);

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

  // Upload file to room
  const handleShareToRoom = async () => {
    const storedRoom = uGet('current_room');
    if (!storedRoom) return;
    const r = JSON.parse(storedRoom);

    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '*/*';

    input.onchange = async (e) => {
      setSharing(true);
      document.body.removeChild(input);
      const selectedFiles = (e.target as HTMLInputElement).files;
      if (!selectedFiles || selectedFiles.length === 0) {
        setSharing(false);
        return;
      }

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        if (file.name.startsWith('.') || file.size > 5 * 1024 * 1024) continue;
        
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const REJECTED_TYPES = ['png', 'jpg', 'jpeg', 'mp4', 'mp3', 'exe', 'zip', 'gif', 'webp', 'bmp', 'ico', 'pdf', 'rar', '7z', 'tar', 'gz', 'dmg', 'iso', 'bin', 'dll', 'so', 'class', 'pyc'];
        if (REJECTED_TYPES.includes(ext)) {
          setUploadError({
            filename: file.name,
            reason: `This is a binary file format (.${ext}). DocuSync's collaborative engine requires text-based formats (like Word Documents) to safely stream real-time differences.`
          });
          continue;
        }

        try {
          let content = '';
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
                sharedBy: myName,
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
      setSharing(false);
    };
    input.style.display = 'none';
    document.body.appendChild(input);
    input.click();
  };

  // Download room file locally and open in editor
  const handleOpenRoomFile = async (f: any) => {
    const fileIdStr = f.fileId?.toString() || f.id?.toString();
    const existing = localFiles.find(ex => ex.id === fileIdStr);
    if (existing) {
      router.push(`/app/editor/${existing.id}`);
      return;
    }
    
    const newFile: FileRecord = {
      id: fileIdStr || crypto.randomUUID(),
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
      const fileIdStr = f.fileId?.toString() || f.id?.toString();
      const existing = localFiles.find(ex => ex.id === fileIdStr);
      const textContent = existing ? existing.content : (f.content || '');
      
      const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = f.fileName || f.name || 'file.txt';
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (err) { console.error(err); }
  };

  const handleDeleteRoomFile = async (f: any) => {
    if (!currentRoom) return;
    showConfirm(
      'Delete Room File',
      `Are you sure you want to delete "${f.fileName || f.name}" from the active room?`,
      async () => {
        try {
          const code = (currentRoom as any).otp || currentRoom.id;
          const targetId = f.fileId || f.id || '';
          const targetName = encodeURIComponent(f.fileName || f.name || '');
          const res = await fetch(`/api/lobby/files?otp=${code}&fileId=${targetId}&fileName=${targetName}`, {
            method: 'DELETE',
          });
          if (res.ok) {
            setRoomTick(t => t + 1);
            closeConfirm();
          } else {
            alert('Failed to delete file.');
          }
        } catch (err) { console.error(err); }
      }
    );
  };

  // ── No room joined ─────────────────────────────────────────────────────────
  if (!currentRoom) {
    return (
      <PageShell>
        <ConfirmModal
          isOpen={confirmModalState.isOpen}
          title={confirmModalState.title}
          message={confirmModalState.message}
          onConfirm={confirmModalState.onConfirm}
          onCancel={closeConfirm}
          confirmText="Confirm"
          cancelText="Cancel"
          isDestructive={true}
        />
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

      {/* Upload Error Modal */}
      {uploadError && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            background: 'var(--bg)', border: '1px solid var(--b1)', borderRadius: 16,
            padding: '40px 56px', display: 'flex', flexDirection: 'column', alignItems: 'center',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)', width: 480, maxWidth: '90%',
            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: 16, borderRadius: '50%', marginBottom: 16 }}>
              <File style={{ color: '#ef4444' }} size={32} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--t1)', textAlign: 'center' }}>Incompatible File Type</h2>
            <p style={{ color: 'var(--t2)', fontSize: 14, marginTop: 12, marginBottom: 20, textAlign: 'center', lineHeight: 1.6 }}>
              The file <strong>&quot;{uploadError.filename}&quot;</strong> cannot be processed.<br/><br/>
              {uploadError.reason}
            </p>
            <div style={{
              background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: 8, padding: '12px 16px', display: 'flex', flexDirection: 'column', width: '100%', marginBottom: 24
            }}>
              <strong style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--t3)', letterSpacing: '0.05em', marginBottom: 8 }}>Accepted Formats:</strong>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['.docx', '.doc', '.txt', '.md', '.html', '.json', '.csv'].map(typ => (
                  <span key={typ} style={{ background: 'var(--s2)', padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>{typ}</span>
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
            background: 'var(--bg)', border: '1px solid var(--b1)', borderRadius: 16,
            padding: '36px 56px', display: 'flex', flexDirection: 'column', alignItems: 'center',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <Loader2 size={48} style={{ animation: 'spin 1s linear infinite', color: 'var(--acc)', marginBottom: 20 }} />
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--t1)' }}>Processing File...</h2>
            <p style={{ color: 'var(--t3)', fontSize: 14, marginTop: 8, marginBottom: 0, textAlign: 'center' }}>
              Parsing contents to broadcast to room peers.<br/>Please wait.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={() => router.push('/app/peers')}
            style={{
              width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--bg-card)', border: '1px solid var(--border)', cursor: 'pointer', color: '#64748b'
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', margin: 0, lineHeight: 1 }}>{currentRoom.name}</h1>
            <button 
              onClick={() => navigator.clipboard.writeText(currentRoom.otp || currentRoom.id)}
              title="Copy OTP to clipboard"
              style={{
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 20,
                padding: '4px 10px', fontSize: 11, fontWeight: 600, color: '#64748b',
                fontFamily: 'monospace', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <span>{currentRoom.otp || currentRoom.id}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
        </div>

        {/* Right side Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Active Users Pill + Dropdown Target */}
          <div style={{ position: 'relative' }}>
            <div 
              onClick={() => setIsPeersOpen(!isPeersOpen)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '4px 12px 4px 4px',
                borderRadius: 20, border: '1px solid var(--b1)', background: 'var(--bg-card)',
                cursor: 'pointer', userSelect: 'none', transition: 'all 0.2s', height: 34
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--s1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 4 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#f1f5f9', color: '#475569', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', zIndex: 3 }}>
                  {(myName[0] || 'U').toUpperCase()}
                </div>
                {connectedPeers.slice(0, 3).map((p, i) => (
                  <div key={i} style={{ width: 24, height: 24, borderRadius: '50%', background: ['#dcfce7', '#ffedd5', '#e0e7ff'][i % 3], color: ['#16a34a', '#ea580c', '#4f46e5'][i % 3], fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', marginLeft: -8, zIndex: 2 - i }}>
                    {(p.displayName?.[0] || 'P').toUpperCase()}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                {connectedPeers.length + 1} connected
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isPeersOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </div>

            {/* Dropdown Menu */}
            {isPeersOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 8,
                background: 'var(--bg)', border: '1px solid var(--b1)', borderRadius: 12,
                boxShadow: '0 10px 25px rgba(0,0,0,0.1)', padding: 8, minWidth: 260, zIndex: 50,
                animation: 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, marginTop: 4, background: 'var(--s1)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--grn)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                      {myName} (You) {(currentRoom as any)?.hostNodeId && localNodeId === (currentRoom as any)?.hostNodeId ? <span style={{ color: '#8b5cf6' }}>(Owner)</span> : ''}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t3)' }}>Online</div>
                  </div>
                </div>
                {connectedPeers.map((p, i) => {
                  const isOnline = p.status === 'connected';
                  const idLower = (p.id || '').toLowerCase();
                  let appName = 'Desktop App'; let appIcon = '💻';
                  if (idLower.includes('web')) { appName = 'Web App'; appIcon = '🌐'; }
                  else if (idLower.includes('mobile')) { appName = 'Mobile App'; appIcon = '📱'; }
                  
                  const isDbOwner = (currentRoom as any)?.hostNodeId && p.id === (currentRoom as any)?.hostNodeId;
                  const defaultName = p.displayName ? p.displayName : isDbOwner ? 'Room Host' : `Peer ${i + 1}`;

                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, marginTop: 4 }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--s1)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: isOnline ? 'var(--grn)' : 'var(--t3)' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{defaultName} {isDbOwner ? <span style={{ color: '#8b5cf6' }}>(Owner)</span> : ''}</div>
                        <div style={{ fontSize: 11, color: 'var(--t3)' }}>{isOnline ? 'Online' : 'Offline'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={() => setShowLeaveConfirm(true)}
            style={{
              padding: '0 14px', height: 34, borderRadius: 8,
              background: 'rgba(239,68,68,0.1)', color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.3)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              transition: 'background 0.15s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
          >
            <LogOut size={14} /> Leave room
          </button>
        </div>
      </div>

      {/* Room Files Label + Share Button */}
      {(() => {
        const activeFiles = roomFiles.filter(f => !f.isDeleted && f.status !== 'deleted');
        return (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', letterSpacing: 1 }}>
                ROOM FILES ({activeFiles.length})
              </div>
              <button 
                className="ds-btn ds-btn-primary" 
                style={{ height: 36, fontSize: 13, padding: '0 16px', borderRadius: 8, background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', boxShadow: '0 2px 6px rgba(37,99,235,0.2)', border: 'none' }} 
                onClick={() => handleShareToRoom()}
              >
                <Upload size={14} style={{ marginRight: 6 }} /> Upload file
              </button>
            </div>

            {/* File List */}
            {activeFiles.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #cbd5e1', padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 200 }}>
                <FolderOpen size={40} style={{ color: 'var(--t3)', opacity: 0.25, marginBottom: 12 }} />
                <h3 style={{ fontSize: 15, fontWeight: 500, color: 'var(--t2)', marginBottom: 6 }}>No files in this room yet</h3>
                <p style={{ fontSize: 13, color: 'var(--t3)', maxWidth: 340, textAlign: 'center', lineHeight: 1.6 }}>
                  Share a file to make it available to all peers in the room.
                </p>
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #cbd5e1', overflow: 'hidden' }}>
                {activeFiles.map((f, i) => {
                  const ext = (f.fileName || f.name || '').split('.').pop() ?? '';
                  const { icon, color, bg } = extMeta(ext);
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex', alignItems: 'center', padding: '16px 20px',
                        borderBottom: i < activeFiles.length - 1 ? '1px solid #e2e8f0' : 'none',
                        transition: 'background 0.15s', height: 72
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 16 }}>
                        {icon}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                          {f.fileName || f.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Shared by {f.sharedBy === 'Web Node' || !f.sharedBy ? myName : (f.sharedBy || 'Peer')}</div>
                      </div>

                      {/* "1 editing" Mock Badge if desired, let's keep it minimal if connected peers exist */}
                      {connectedPeers.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#e0e7ff', padding: '4px 10px', borderRadius: 16, border: '1px solid #c7d2fe', marginRight: 40 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#4338ca' }}>{connectedPeers.length} editing</span>
                        </div>
                      )}

                      <div style={{ width: 60, fontSize: 13, color: '#94a3b8', textAlign: 'right', marginRight: 24, fontWeight: 500 }}>
                        {formatBytes(f.contentLength || f.content?.length || 0)}
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                          onClick={() => handleOpenRoomFile(f)}
                          style={{
                            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', color: '#fff', border: 'none',
                            borderRadius: 8, padding: '0 16px', height: 36, fontSize: 13,
                            fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                            display: 'flex', alignItems: 'center', boxShadow: '0 2px 6px rgba(37,99,235,0.2)'
                          }}
                        >
                          Open & edit
                        </button>
                        <button
                          onClick={() => handleDownloadRoomFile(f)}
                          style={{
                            background: '#fff', color: '#475569', border: '1px solid #cbd5e1',
                            borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', flexShrink: 0,
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        </button>
                        <button
                          onClick={() => handleDeleteRoomFile(f)}
                          style={{
                            background: '#fff', color: '#ef4444', border: '1px solid #cbd5e1',
                            borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', flexShrink: 0,
                          }}
                          title="Delete file from room"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        );
      })()}
    </PageShell>
  );
}

