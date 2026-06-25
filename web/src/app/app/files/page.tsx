'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import {
  FolderOpen, Plus, FileText, FileCode, FileImage, File,
  Trash2, Search, FileJson, FileType, FileSpreadsheet, FileArchive, Users,
  ArrowLeft, LogOut, Loader2
} from 'lucide-react';
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
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'files' | 'rooms'>('files');
  const [publicRooms, setPublicRooms] = useState<any[]>([]);
  const [connectedPeers, setConnectedPeers] = useState<any[]>([]);
  const [roomFiles, setRoomFiles] = useState<any[]>([]);
  const [roomTick, setRoomTick] = useState(0);
  const [showRoomList, setShowRoomList] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('docusync_files');
    if (stored) {
      setFiles(JSON.parse(stored));
    } else {
      setFiles([]);
    }

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tab') === 'peer_rooms') {
        setActiveTab('rooms');
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);

  useEffect(() => {
    const fetchPeers = () => {
      const stored = localStorage.getItem('docusync_peers');
      if (stored) {
        setConnectedPeers(JSON.parse(stored));
      }
    };
    fetchPeers();
    const interval = setInterval(fetchPeers, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const MATCHMAKER_URL = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
      ? 'https://docusync-pnc.vercel.app/api/lobby'
      : '/api/lobby';

    if (activeTab === 'rooms') {
      fetch(`${MATCHMAKER_URL}/list`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setPublicRooms(data.rooms || []);
          }
        })
        .catch(err => console.error('Failed to fetch rooms', err));
        
      const storedRoom = typeof window !== 'undefined' ? localStorage.getItem('docusync_current_room') : null;
      if (storedRoom) {
        try {
          const r = JSON.parse(storedRoom);
          fetch(`${MATCHMAKER_URL}/files?otp=${r.id}`)
            .then(res => res.json())
            .then(data => {
              if (data.success) setRoomFiles(data.files || []);
            });
        } catch {}
      }
    }
  }, [activeTab, roomTick]);
  const saveFiles = useCallback((newFiles: FileRecord[]) => {
    setFiles(newFiles);
    localStorage.setItem('docusync_files', JSON.stringify(newFiles));
  }, []);

  const handleDownloadRoomFile = async (f: any) => {
    if (!f.content) {
      alert("Error: This file was shared without content, or the content is unavailable.");
      return;
    }
    
    // 1. Save to Local App Storage
    const newFile: FileRecord = {
      id: f.fileId?.toString() || crypto.randomUUID(),
      name: f.fileName || f.name || 'SharedFile.txt',
      type: 'text/plain',
      size: f.contentLength || f.content.length,
      content: f.content,
      status: 'synced',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveFiles([...files.filter(existing => existing.id !== newFile.id), newFile]);
    
    // 2. Native Device Download
    try {
      const blob = new Blob([f.content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = newFile.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to trigger native download', err);
    }
    
    alert(`File "${newFile.name}" downloaded to your local files!`);
  };

  const handleShareToRoom = async (isFolder: boolean = false) => {
    try {
      const storedRoom = localStorage.getItem('docusync_current_room');
      if (!storedRoom) return;
      const r = JSON.parse(storedRoom);

      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      if (isFolder) {
        input.webkitdirectory = true;
      } else {
        input.accept = '*/*'; // Allow all files, we'll let the user decide
      }
      
      input.onchange = async (e) => {
        const selectedFiles = (e.target as HTMLInputElement).files;
        if (!selectedFiles || selectedFiles.length === 0) return;
        
        const MATCHMAKER_URL = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
          ? 'https://docusync-pnc.vercel.app/api/lobby'
          : '/api/lobby';

        const newRoomFiles = [...roomFiles];
        const newLocalFiles = [];
        let sharedCount = 0;

        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          // Skip large binary files or files starting with . (like .DS_Store)
          if (file.name.startsWith('.') || file.size > 5 * 1024 * 1024) continue;
          
          try {
            let content = '';
            if (file.name.toLowerCase().endsWith('.docx')) {
              const formData = new FormData();
              formData.append('file', file);
              const parseRes = await fetch('/api/parse-docx', { method: 'POST', body: formData });
              const parseData = await parseRes.json();
              if (parseData.text) {
                content = parseData.text;
              } else {
                continue; // Skip if parsing failed
              }
            } else {
              content = await file.text();
            }

            const newFile = {
              fileId: Date.now() + i,
              fileName: file.webkitRelativePath || file.name,
              filePath: file.webkitRelativePath || 'Local Web Storage',
              contentLength: file.size,
              content: content,
            };

            await fetch(`${MATCHMAKER_URL}/files`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ otp: r.id, file: newFile })
            });
            
            newRoomFiles.push(newFile);
            
            // Dual-Action: Also save to local 'My Files'
            const localFileRecord: FileRecord = {
              id: newFile.fileId.toString(),
              name: newFile.fileName,
              type: file.type || 'text/plain',
              size: newFile.contentLength,
              content: newFile.content,
              status: 'synced',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            newLocalFiles.push(localFileRecord);
            sharedCount++;
          } catch (err) {
            console.error('Failed to read/share file:', file.name, err);
          }
        }
        
        if (sharedCount > 0) {
          setRoomFiles(newRoomFiles);
          saveFiles([...files, ...newLocalFiles]);
          alert(`Successfully shared ${sharedCount} file(s) to room and added to My Files!`);
        } else {
          alert('No valid text files were shared. Skipping binaries or large files.');
        }
      };
      input.click();
    } catch (err) {
      console.error('Failed to share to room', err);
      alert('Failed to share to room');
    }
  };

  const openFile = async () => {
    try {
      if ('showOpenFilePicker' in window) {
        const [handle] = await (window as unknown as { showOpenFilePicker: (options?: unknown) => Promise<{ getFile: () => Promise<File> }[]> }).showOpenFilePicker({
          types: [
            { description: 'Supported Files', accept: { '*/*': ['.txt', '.md', '.json', '.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.docx', '.csv'] } },
          ],
        });
        const file = await handle.getFile();
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (!['txt', 'md', 'json', 'csv', 'docx'].includes(ext)) {
          alert("Error: Binary file detected. DocuSync's delta engine only supports UTF-8 plain text files and .docx.");
          return;
        }

        let content = '';
        if (ext === 'docx') {
          const formData = new FormData();
          formData.append('file', file);
          const parseRes = await fetch('/api/parse-docx', { method: 'POST', body: formData });
          const parseData = await parseRes.json();
          if (parseData.text) content = parseData.text;
          else {
            alert('Failed to extract text from .docx file.');
            return;
          }
        } else {
          content = await file.text();
        }

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
        router.push(`/app/editor/${newFile.id}`);
      } else {
        // Fallback
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt,.md,.json,.ts,.tsx,.js,.jsx,.css,.html';
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          const ext = file.name.split('.').pop()?.toLowerCase() || '';
          if (!['txt', 'md', 'json', 'csv'].includes(ext)) {
            alert("Error: Binary file detected. DocuSync's delta engine only supports UTF-8 plain text files (.txt, .md).");
            return;
          }
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
          router.push(`/app/editor/${newFile.id}`);
        };
        input.click();
      }
    } catch (err) {
      console.error('File open cancelled or failed', err);
    }
  };

  const createNewFile = () => {
    const newFile: FileRecord = {
      id: crypto.randomUUID(),
      name: 'untitled.md',
      type: 'text/markdown',
      size: 0,
      content: '',
      status: 'synced',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveFiles([...files, newFile]);
    router.push(`/app/editor/${newFile.id}`);
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ds-btn ds-btn-secondary" onClick={createNewFile}>
            <Plus size={14} /> New File
          </button>
          <button className="ds-btn ds-btn-primary" onClick={openFile}>
            <FolderOpen size={14} /> Open File
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--s1)', borderRadius: 10, padding: 4, border: '1px solid var(--b1)', width: 'fit-content' }}>
        {(['files', 'rooms'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '7px 18px', fontSize: 13, fontWeight: 600,
              borderRadius: 7, border: 'none', cursor: 'pointer',
              background: activeTab === tab ? 'var(--acc)' : 'transparent',
              color: activeTab === tab ? '#fff' : 'var(--t2)',
              transition: 'all 0.15s ease',
            }}
          >
            {tab === 'files' ? 'My Files' : 'Peer Rooms'}
          </button>
        ))}
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

      {/* Content Area */}
      {activeTab === 'rooms' ? (() => {
        const storedRoom = typeof window !== 'undefined' ? localStorage.getItem('docusync_current_room') : null;
        const currentRoom = storedRoom ? JSON.parse(storedRoom) as { id: string; name: string; hostIp?: string; hostPort?: number; memberCount?: number } : null;

        if (!currentRoom || showRoomList) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {currentRoom && (
                <div style={{
                  background: 'var(--acc)', color: 'white', padding: '12px 16px', borderRadius: 8,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)', marginBottom: 8,
                  animation: 'fadeIn 0.3s ease'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade80' }} />
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Active Session: {currentRoom.name}</span>
                  </div>
                  <button 
                    onClick={() => setShowRoomList(false)}
                    style={{ background: 'rgba(255,255,255,0.2)', border: 'none', padding: '6px 12px', borderRadius: 6, color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'background 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                  >
                    Return to Room
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--t1)', margin: 0 }}>Active Peer Rooms</h2>
                <button className="ds-btn ds-btn-secondary" onClick={() => router.push('/app/peers')} style={{ padding: '6px 12px' }}>
                  <Plus size={14} /> Host New Room
                </button>
              </div>
              
              {publicRooms.length === 0 ? (
                <div style={{
                  background: 'var(--s1)', borderRadius: 12, border: '1px solid var(--b1)',
                  padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  minHeight: 200,
                }}>
                  <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>🌐</div>
                  <h2 style={{ fontSize: 16, fontWeight: 500, color: 'var(--t2)', marginBottom: 8 }}>
                    No active rooms found
                  </h2>
                  <p style={{ color: 'var(--t3)', fontSize: 13, maxWidth: 360, lineHeight: 1.7, textAlign: 'center', margin: '0 auto' }}>
                    Host a live session to create a new room.
                  </p>
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: 16
                }}>
                  {publicRooms.map(room => (
                    <div key={room.id} style={{
                      background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: 10, padding: 20,
                      display: 'flex', flexDirection: 'column', gap: 12, transition: 'transform 0.15s', cursor: 'pointer'
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--t1)', margin: '0 0 4px' }}>{room.name}</h3>
                          <div style={{ fontSize: 12, color: 'var(--t3)', fontFamily: 'monospace' }}>OTP: {room.id}</div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--grn)', background: 'rgba(34,197,94,0.1)', padding: '4px 8px', borderRadius: 12, fontWeight: 600 }}>Active</div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--t2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Users size={14} /> {room.peersJoined || 1} peers</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FolderOpen size={14} /> {room.filesCount} files</div>
                      </div>
                      
                      <button 
                        className="ds-btn ds-btn-primary" 
                        style={{ width: '100%', marginTop: 4, justifyContent: 'center', opacity: joiningRoomId === room.id ? 0.8 : 1 }} 
                        disabled={joiningRoomId === room.id}
                        onClick={async () => {
                          if (currentRoom?.id === room.id) {
                            setShowRoomList(false);
                            return;
                          }
                          const MATCHMAKER_URL = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
                            ? 'https://docusync-pnc.vercel.app/api/lobby'
                            : '/api/lobby';
                          try {
                            setJoiningRoomId(room.id);
                            // Artificial delay for the cool animation effect
                            await new Promise(resolve => setTimeout(resolve, 800));
                            
                            const res = await fetch(`${MATCHMAKER_URL}/join`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ otp: room.id, clientNodeId: `web-${crypto.randomUUID()}` })
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error);
                            const joinedRoom = { id: room.id, name: data.roomName, hostIp: data.hostIp, hostPort: data.hostPort, memberCount: data.memberCount };
                            localStorage.setItem('docusync_current_room', JSON.stringify(joinedRoom));
                            setShowRoomList(false); // In case they were looking at the list while in another room
                            setRoomTick(t => t + 1);
                          } catch (err: any) {
                            alert(`Failed to join: ${err.message}`);
                          } finally {
                            setJoiningRoomId(null);
                          }
                        }}>
                          {joiningRoomId === room.id ? (
                            <>
                              <Loader2 size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                              Connecting...
                            </>
                          ) : (
                            currentRoom?.id === room.id ? 'Return to Room' : 'Join Room'
                          )}
                        </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            
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
                    <LogOut size={24} />
                    <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--t1)' }}>Leave Session?</h2>
                  </div>
                  <p style={{ color: 'var(--t2)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                    Are you sure you want to permanently leave <strong>{currentRoom.name}</strong>? You will be disconnected from all peers and lose access to live files.
                  </p>
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button 
                      className="ds-btn ds-btn-ghost" 
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
                        await new Promise(r => setTimeout(r, 600)); // cool animation delay
                        localStorage.removeItem('docusync_current_room');
                        setIsLeaving(false);
                        setShowLeaveConfirm(false);
                        setRoomTick(t => t + 1);
                      }}
                    >
                      {isLeaving ? <><Loader2 size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} /> Leaving...</> : 'Yes, Leave Session'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Room Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, animation: 'fadeIn 0.2s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={() => setShowRoomList(true)}
                  className="ds-btn ds-btn-secondary"
                  style={{ padding: '6px 12px', transition: 'all 0.2s' }}
                  title="Go back to list of rooms"
                >
                  <ArrowLeft size={14} /> Back
                </button>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--t1)', margin: 0 }}>
                  {currentRoom.name}
                </h2>
                <span style={{
                  fontSize: 12, background: 'var(--s2)', color: 'var(--t1)',
                  padding: '2px 8px', borderRadius: 20, fontWeight: 600, border: '1px solid var(--b1)',
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
            
            {currentRoom.hostIp && (
              <div style={{ fontSize: 12, color: 'var(--t3)', marginLeft: 84 }}>
                Host: {currentRoom.hostIp}:{currentRoom.hostPort}
              </div>
            )}

            {/* Active Peers */}
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', letterSpacing: 1, marginTop: 12 }}>
              ACTIVE PEERS ({connectedPeers.length + 1})
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{
                background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: 20, padding: '6px 16px',
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t1)'
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--grn)' }}></div>
                <strong>You</strong> (Web Node)
              </div>
              {connectedPeers.map((p, i) => (
                <div key={i} style={{
                  background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: 20, padding: '6px 16px',
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t1)'
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.status === 'connected' ? 'var(--grn)' : 'var(--t3)' }}></div>
                  <strong style={{ textTransform: 'uppercase' }}>{p.id.split(':')[0]}</strong>
                  <span style={{ color: 'var(--t3)', fontSize: 11 }}>::{p.port || 'WS'}</span>
                </div>
              ))}
            </div>

            {/* Room Files */}
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', letterSpacing: 1, marginTop: 24 }}>
              ROOM FILES
            </div>
            
            {roomFiles.length === 0 ? (
              <div style={{
                background: 'var(--s1)', borderRadius: 12, border: '1px solid var(--b1)',
                padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center',
                minHeight: 160,
              }}>
                <FolderOpen size={32} style={{ color: 'var(--t3)', opacity: 0.3, marginBottom: 12 }} />
                <h3 style={{ fontSize: 14, fontWeight: 500, color: 'var(--t2)', marginBottom: 8 }}>
                  No files shared in this room yet
                </h3>
                <p style={{ fontSize: 13, color: 'var(--t3)', maxWidth: 360, textAlign: 'center', lineHeight: 1.6 }}>
                  Files you share here will be accessible to all connected peers in the room.
                </p>
                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <button className="ds-btn ds-btn-primary" onClick={() => handleShareToRoom(false)}>
                    <FileText size={14} /> Share Files
                  </button>
                  <button className="ds-btn ds-btn-secondary" onClick={() => handleShareToRoom(true)}>
                    <FolderOpen size={14} /> Share Folder
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {roomFiles.map((f, i) => (
                  <div key={i} style={{
                    background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: 10, padding: 16,
                    display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer', transition: 'transform 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                  >
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 8, background: 'rgba(59,130,246,0.1)', color: 'var(--blu)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <FileText size={18} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {f.fileName || f.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                          {formatBytes(f.contentLength || f.content?.length || 0)}
                        </div>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDownloadRoomFile(f); }}
                        style={{ background: 'var(--acc)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })() : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60,
          color: 'var(--t3)',
        }}>
          <FolderOpen size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
          <p style={{ fontSize: 14 }}>No files yet</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>Click &quot;Open File&quot; to add documents</p>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', paddingBottom: 8 }}>
            OPEN DOCUMENTS
          </div>
          
          <div style={{
            background: 'var(--s1)',
            borderRadius: 8,
            border: '1px solid var(--b1)',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            {/* Table Header */}
            <div style={{
              display: 'flex',
              padding: '10px 16px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--t3)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              background: 'var(--s2)',
              borderBottom: '1px solid var(--b1)'
            }}>
              <div style={{ width: 28, marginRight: 12 }} /> {/* Icon spacer */}
              <div style={{ flex: 2, paddingRight: 16 }}>Name</div>
              <div style={{ flex: 2, paddingRight: 16 }}>Location</div>
              <div style={{ flex: 1.5, paddingRight: 16 }}>Status</div>
              <div style={{ width: 100, textAlign: 'right', paddingRight: 32 }}>Size</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filtered.map(file => {
                const ext = file.name.split('.').pop() ?? '';
                const { icon, color, bg } = extMeta(ext);
                
                return (
                  <article key={file.id} style={{
                    padding: '8px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--b1)',
                    background: 'transparent',
                    transition: 'background 0.15s ease',
                    borderLeft: file.status === 'conflict' ? '3px solid var(--red)' : '3px solid transparent',
                    cursor: 'pointer',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--s2)';
                    const trash = e.currentTarget.querySelector('.trash-btn') as HTMLElement;
                    if (trash) trash.style.opacity = '1';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    const trash = e.currentTarget.querySelector('.trash-btn') as HTMLElement;
                    if (trash) trash.style.opacity = '0';
                  }}
                  onClick={() => router.push(`/app/editor/${file.id}`)}>
                    
                    {/* Icon */}
                    <div style={{
                      width: 28, height: 28, borderRadius: 6,
                      background: bg, color: color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, marginRight: 12,
                    }}>
                      {icon}
                    </div>

                    {/* Name */}
                    <div style={{ flex: 2, minWidth: 0, paddingRight: 16 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.name}
                      </div>
                    </div>

                    {/* Location */}
                    <div style={{ flex: 2, minWidth: 0, paddingRight: 16 }}>
                      <div style={{ fontSize: 12, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Local Storage
                      </div>
                    </div>

                    {/* Status */}
                    <div style={{ flex: 1.5, minWidth: 0, display: 'flex', alignItems: 'center', paddingRight: 16 }}>
                      {file.status === 'conflict' ? (
                        <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 500 }}>⚠ Conflict</span>
                      ) : file.status === 'syncing' ? (
                        <span style={{ fontSize: 12, color: 'var(--amb)', fontWeight: 500 }}>↻ Syncing</span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--grn)', fontWeight: 500 }}>✓ Synced — Working fine</span>
                      )}
                    </div>

                    {/* Size and Actions */}
                    <div style={{ width: 100, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: 12, color: 'var(--t2)', marginRight: 12 }}>
                        {formatBytes(file.size)}
                      </span>
                      <button 
                        className="trash-btn"
                        onClick={(e) => { e.stopPropagation(); deleteFile(file.id); }}
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          color: 'var(--t3)', opacity: 0, transition: 'opacity 0.15s',
                          display: 'flex', alignItems: 'center', padding: 4
                        }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
