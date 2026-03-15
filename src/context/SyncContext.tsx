"use client";

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

// --- Types ---

export type UserRole = 'Owner' | 'Editor' | 'Viewer';
export type SyncStatus = 'synced' | 'syncing...' | 'conflict';

export interface RepoMember {
    name: string;
    role: UserRole;
    badge: string;
}

export interface PendingRequest {
    id: number;
    name: string;
    email: string;
    date: string;
}

export interface FileData {
    id: number;
    name: string;
    type: string;
    syncStatus: SyncStatus;
    date: string;
    isSyncing: boolean;
    content: string;
    serverContent: string;
    isStarred?: boolean;
    isOfflineAvailable?: boolean;
}

export interface RepositoryData {
    id: number;
    name: string;
    lastSynced: string;
    status: string;
    userRole: UserRole;
    members: RepoMember[];
    pendingRequests?: PendingRequest[];
    files: FileData[];
}

export interface LogEntry {
    id: number;
    time: string;
    message: string;
}

export interface TrashItem {
    id: number;
    file: FileData;
    repoName: string;
    deletedAt: string;
}

// --- BroadcastChannel message types ---
type BroadcastMessage =
    | { type: 'FILE_UPDATE';  repoName: string; fileName: string; content: string; senderId: string }
    | { type: 'FILE_UPLOAD';  repoName: string; file: FileData;   senderId: string }
    | { type: 'FILE_DELETE';  repoName: string; fileName: string; senderId: string }
    | { type: 'REPO_DELETE';  repoId: number;                     senderId: string }
    | { type: 'REPO_CREATE';  repo: RepositoryData;               senderId: string }
    | { type: 'FILE_TRASH';   trashItem: TrashItem;               senderId: string }
    | { type: 'FILE_RESTORE'; trashItemId: number; repoName: string; file: FileData; senderId: string }
    | { type: 'FILE_STAR';    repoName: string; fileName: string; isStarred: boolean; senderId: string };

// --- Default content ---
const defaultContent = (name: string) =>
    `# ${name}\n\nThis document is part of the DocuSync repository. Begin editing to add your content here.\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`;

// --- Initial Data ---
const initialReposData: RepositoryData[] = [
    {
        id: 1, name: 'Main-Sync-Repo', lastSynced: 'Just now', status: 'Up to date', userRole: 'Owner',
        members: [
            { name: 'You', role: 'Owner', badge: 'amber' },
            { name: 'User S', role: 'Editor', badge: 'purple' },
            { name: 'Prof. Davis', role: 'Viewer', badge: 'zinc' },
        ],
        pendingRequests: [
            { id: 101, name: 'David Lee', email: 'david.lee@university.edu', date: '10 min ago' },
            { id: 102, name: 'Dr. Sarah Chen', email: 'schen@university.edu', date: '2 hrs ago' }
        ],
        files: [
            { id: 1, name: 'Project_Proposal.docx', type: 'word', syncStatus: 'synced', date: 'Apr 3, 2026 13:27', isSyncing: false, content: defaultContent('Project Proposal'), serverContent: '', isStarred: false },
            { id: 2, name: 'Q3_Report.docx', type: 'word', syncStatus: 'synced', date: 'Apr 3, 2026 13:26', isSyncing: false, content: defaultContent('Q3 Report'), serverContent: '', isStarred: false },
            { id: 5, name: 'Design_System.docx', type: 'word', syncStatus: 'synced', date: 'Apr 5, 2026 09:12', isSyncing: false, content: defaultContent('Design System'), serverContent: '', isStarred: true },
        ]
    },
    {
        id: 2, name: 'Project-Beta-Repo', lastSynced: '2 hrs ago', status: 'Up to date', userRole: 'Editor',
        members: [
            { name: 'Dr. Lim', role: 'Owner', badge: 'amber' },
            { name: 'You', role: 'Editor', badge: 'purple' },
            { name: 'Research Asst. M', role: 'Editor', badge: 'purple' },
            { name: 'Intern K', role: 'Viewer', badge: 'zinc' },
        ],
        files: [
            { id: 3, name: 'Beta_Release_Plan.docx', type: 'word', syncStatus: 'synced', date: 'Apr 4, 2026 13:35', isSyncing: false, content: defaultContent('Beta Release Plan'), serverContent: '', isStarred: false },
            { id: 4, name: 'Beta_Budget_Report.docx', type: 'word', syncStatus: 'synced', date: 'Apr 4, 2026 15:42', isSyncing: false, content: defaultContent('Beta Budget Report'), serverContent: '', isStarred: true },
            { id: 8, name: 'System_Architecture.docx', type: 'word', syncStatus: 'synced', date: 'Apr 2, 2026 09:15', isSyncing: false, content: defaultContent('System Architecture'), serverContent: '', isStarred: false },
            { id: 9, name: 'Database_Documentation.docx', type: 'word', syncStatus: 'synced', date: 'Apr 3, 2026 11:20', isSyncing: false, content: defaultContent('Database Documentation'), serverContent: '', isStarred: false },
        ]
    },
    {
        id: 3, name: 'External-Assets-Repo', lastSynced: '1 day ago', status: 'Up to date', userRole: 'Viewer',
        members: [
            { name: 'Design Team', role: 'Owner', badge: 'amber' },
            { name: 'You', role: 'Viewer', badge: 'zinc' },
        ],
        files: [
            { id: 6, name: 'Brand_Guidelines.docx', type: 'word', syncStatus: 'synced', date: 'Apr 1, 2026 10:00', isSyncing: false, content: defaultContent('Brand Guidelines'), serverContent: '', isStarred: false },
            { id: 7, name: 'Logo_Pack_Guide.docx', type: 'word', syncStatus: 'synced', date: 'Apr 1, 2026 10:05', isSyncing: false, content: defaultContent('Logo Pack Guide'), serverContent: '', isStarred: false },
        ]
    }
];

const initialSyncLogs: LogEntry[] = [
    { id: 1, time: '10:00 AM', message: 'System initialized. All files up to date.' }
];

// --- Context Definition ---

interface SyncContextType {
    reposData: RepositoryData[];
    syncLogs: LogEntry[];
    trashedFiles: TrashItem[];
    isSupabaseEnabled: boolean;
    createRepository: (name: string) => void;
    deleteRepository: (repoId: number) => void;
    deleteFile: (repoName: string, fileName: string) => void;
    trashFile: (repoName: string, fileName: string) => void;
    restoreFile: (trashItemId: number) => void;
    permanentlyDeleteFile: (trashItemId: number) => void;
    emptyTrash: () => void;
    toggleStar: (repoName: string, fileName: string) => void;
    broadcastFileUpdate: (repoName: string, fileName: string, content: string) => void;
    uploadFile: (repoName: string, file: Omit<FileData, 'id' | 'syncStatus' | 'isSyncing'>) => void;
    simulateConflict: (repoName: string) => void;
    saveFileContent: (repoName: string, fileName: string, newContent: string, originalContent: string) => void;
    resolveConflict: (repoName: string, fileName: string, resolutionType: 'local' | 'server' | 'merge', finalContent: string) => void;
    addLog: (message: string) => void;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

// --- Provider ---
export const SyncProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [reposData, setReposData] = useState<RepositoryData[]>(initialReposData);
    const [syncLogs, setSyncLogs] = useState<LogEntry[]>(initialSyncLogs);
    const [trashedFiles, setTrashedFiles] = useState<TrashItem[]>([]);
    const [isHydrated, setIsHydrated] = useState(false);

    const tabId = useRef<string>(
        typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2)
    );
    const channelRef = useRef<BroadcastChannel | null>(null);
    const reposDataRef = useRef(reposData);
    const trashedFilesRef = useRef(trashedFiles);
    useEffect(() => { reposDataRef.current = reposData; }, [reposData]);
    useEffect(() => { trashedFilesRef.current = trashedFiles; }, [trashedFiles]);

    // ---------- Step 1: Hydrate from localStorage ----------
    useEffect(() => {
        try {
            const storedRepos  = localStorage.getItem('docusync_repos');
            const storedLogs   = localStorage.getItem('docusync_logs');
            const storedTrash  = localStorage.getItem('docusync_trash');
            if (storedRepos) setReposData(JSON.parse(storedRepos));
            if (storedLogs)  setSyncLogs(JSON.parse(storedLogs));
            if (storedTrash) setTrashedFiles(JSON.parse(storedTrash));
        } catch (e) {
            console.error('Failed to hydrate state from localStorage', e);
        }
        setIsHydrated(true);
    }, []);

    // ---------- Step 2: Persist on every change ----------
    useEffect(() => {
        if (!isHydrated) return;
        try {
            localStorage.setItem('docusync_repos',  JSON.stringify(reposData));
            localStorage.setItem('docusync_logs',   JSON.stringify(syncLogs));
            localStorage.setItem('docusync_trash',  JSON.stringify(trashedFiles));
        } catch (e) {
            console.error('Failed to persist state to localStorage', e);
        }
    }, [reposData, syncLogs, trashedFiles, isHydrated]);

    // ---------- Step 3: BroadcastChannel (cross-tab) ----------
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const channel = new BroadcastChannel('docusync_channel');
        channelRef.current = channel;

        channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
            const msg = event.data;
            if (!msg || msg.senderId === tabId.current) return;

            switch (msg.type) {
                case 'FILE_UPDATE':
                    setReposData(prev => prev.map(r => r.name !== msg.repoName ? r : {
                        ...r,
                        files: r.files.map(f => f.name !== msg.fileName ? f : {
                            ...f, serverContent: msg.content, syncStatus: 'conflict' as SyncStatus,
                        })
                    }));
                    setSyncLogs(prev => [{
                        id: Date.now(),
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        message: `⚡ Real-time conflict: '${msg.fileName}' was edited in another window. Resolution required.`
                    }, ...prev]);
                    break;
                case 'FILE_UPLOAD':
                    setReposData(prev => prev.map(r => r.name !== msg.repoName ? r : {
                        ...r, files: r.files.some(f => f.name === msg.file.name) ? r.files : [msg.file, ...r.files]
                    }));
                    break;
                case 'FILE_DELETE':
                    setReposData(prev => prev.map(r =>
                        r.name === msg.repoName ? { ...r, files: r.files.filter(f => f.name !== msg.fileName) } : r
                    ));
                    break;
                case 'REPO_DELETE':
                    setReposData(prev => prev.filter(r => r.id !== msg.repoId));
                    break;
                case 'REPO_CREATE':
                    setReposData(prev => prev.some(r => r.id === msg.repo.id) ? prev : [msg.repo, ...prev]);
                    break;
                case 'FILE_TRASH':
                    setReposData(prev => prev.map(r =>
                        r.name === msg.trashItem.repoName
                            ? { ...r, files: r.files.filter(f => f.name !== msg.trashItem.file.name) }
                            : r
                    ));
                    setTrashedFiles(prev => [msg.trashItem, ...prev]);
                    break;
                case 'FILE_RESTORE':
                    setTrashedFiles(prev => prev.filter(t => t.id !== msg.trashItemId));
                    setReposData(prev => prev.map(r =>
                        r.name === msg.repoName ? { ...r, files: [msg.file, ...r.files] } : r
                    ));
                    break;
                case 'FILE_STAR':
                    setReposData(prev => prev.map(r =>
                        r.name !== msg.repoName ? r : {
                            ...r,
                            files: r.files.map(f => f.name === msg.fileName ? { ...f, isStarred: msg.isStarred } : f)
                        }
                    ));
                    break;
            }
        };

        return () => { channel.close(); channelRef.current = null; };
    }, []);

    // ---------- Supabase Realtime (when credentials are set) ----------
    useEffect(() => {
        if (!isSupabaseConfigured || !supabase) return;

        const subscription = supabase
            .channel('docusync-db-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'files' }, () => {
                addLog('🔄 Supabase: File change detected. Refreshing...');
                // In a full implementation, you'd re-fetch the updated file data here
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'repositories' }, () => {
                addLog('🔄 Supabase: Repository change detected. Refreshing...');
            })
            .subscribe();

        return () => { supabase.removeChannel(subscription); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---------- Helpers ----------
    const post = (msg: BroadcastMessage) => channelRef.current?.postMessage(msg);

    const addLog = (message: string) => {
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setSyncLogs(prev => [{ id: Date.now(), time: now, message }, ...prev]);
    };

    // ---------- Actions ----------

    const createRepository = (name: string) => {
        if (!name.trim()) return;
        const newRepo: RepositoryData = {
            id: Date.now(),
            name: name.trim(),
            lastSynced: 'Just now',
            status: 'Up to date',
            userRole: 'Owner',
            members: [{ name: 'You', role: 'Owner', badge: 'amber' }],
            files: []
        };
        setReposData(prev => [newRepo, ...prev]);
        addLog(`Repository '${name.trim()}' created successfully.`);
        post({ type: 'REPO_CREATE', repo: newRepo, senderId: tabId.current });
    };

    const deleteRepository = (repoId: number) => {
        const repo = reposData.find(r => r.id === repoId);
        setReposData(prev => prev.filter(r => r.id !== repoId));
        if (repo) {
            addLog(`Repository '${repo.name}' and all its files have been permanently deleted.`);
            post({ type: 'REPO_DELETE', repoId, senderId: tabId.current });
        }
    };

    // Hard delete (kept for broadcast compatibility)
    const deleteFile = (repoName: string, fileName: string) => {
        setReposData(prev =>
            prev.map(r =>
                r.name === repoName
                    ? { ...r, files: r.files.filter(f => f.name !== fileName) }
                    : r
            )
        );
        addLog(`File '${fileName}' deleted from '${repoName}'.`);
        post({ type: 'FILE_DELETE', repoName, fileName, senderId: tabId.current });
    };

    // Soft delete → Trash
    const trashFile = (repoName: string, fileName: string) => {
        const repo = reposDataRef.current.find(r => r.name === repoName);
        const file = repo?.files.find(f => f.name === fileName);
        if (!file) return;

        const trashItem: TrashItem = {
            id: Date.now(),
            file,
            repoName,
            deletedAt: new Date().toLocaleString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: false
            })
        };

        setReposData(prev =>
            prev.map(r =>
                r.name === repoName
                    ? { ...r, files: r.files.filter(f => f.name !== fileName) }
                    : r
            )
        );
        setTrashedFiles(prev => [trashItem, ...prev]);
        addLog(`'${fileName}' moved to Trash from '${repoName}'.`);
        post({ type: 'FILE_TRASH', trashItem, senderId: tabId.current });
    };

    const restoreFile = (trashItemId: number) => {
        const item = trashedFilesRef.current.find(t => t.id === trashItemId);
        if (!item) return;
        setTrashedFiles(prev => prev.filter(t => t.id !== trashItemId));
        setReposData(prev =>
            prev.map(r =>
                r.name === item.repoName
                    ? { ...r, files: [item.file, ...r.files] }
                    : r
            )
        );
        addLog(`'${item.file.name}' restored from Trash to '${item.repoName}'.`);
        post({ type: 'FILE_RESTORE', trashItemId, repoName: item.repoName, file: item.file, senderId: tabId.current });
    };

    const permanentlyDeleteFile = (trashItemId: number) => {
        const item = trashedFilesRef.current.find(t => t.id === trashItemId);
        if (!item) return;
        setTrashedFiles(prev => prev.filter(t => t.id !== trashItemId));
        addLog(`'${item.file.name}' permanently deleted.`);
    };

    const emptyTrash = () => {
        const count = trashedFilesRef.current.length;
        setTrashedFiles([]);
        addLog(`Trash emptied — ${count} file(s) permanently deleted.`);
    };

    const toggleStar = (repoName: string, fileName: string) => {
        let newIsStarred = false;
        setReposData(prev => prev.map(r => {
            if (r.name !== repoName) return r;
            return {
                ...r,
                files: r.files.map(f => {
                    if (f.name !== fileName) return f;
                    newIsStarred = !f.isStarred;
                    return { ...f, isStarred: !f.isStarred };
                })
            };
        }));
        post({ type: 'FILE_STAR', repoName, fileName, isStarred: newIsStarred, senderId: tabId.current });
    };

    const uploadFile = (repoName: string, fileInfo: Omit<FileData, 'id' | 'syncStatus' | 'isSyncing'>) => {
        const newFile: FileData = {
            ...fileInfo,
            id: Date.now(),
            syncStatus: 'synced',
            isSyncing: false,
            content: fileInfo.content || defaultContent(fileInfo.name),
            serverContent: '',
            isStarred: false,
        };
        setReposData(prev =>
            prev.map(r =>
                r.name === repoName
                    ? { ...r, files: [newFile, ...r.files] }
                    : r
            )
        );
        addLog(`File '${fileInfo.name}' uploaded to '${repoName}'.`);
        post({ type: 'FILE_UPLOAD', repoName, file: newFile, senderId: tabId.current });
    };

    const simulateConflict = (repoName: string) => {
        setReposData(prev => {
            const next = prev.map(r => {
                if (r.name !== repoName || r.files.length === 0) return r;
                const syncedFiles = r.files.filter(f => f.syncStatus === 'synced');
                if (syncedFiles.length === 0) return r;
                const count = Math.min(syncedFiles.length, Math.floor(Math.random() * 2) + 1);
                const shuffled = [...syncedFiles].sort(() => 0.5 - Math.random()).slice(0, count);
                const conflictIds = new Set(shuffled.map(f => f.id));
                return {
                    ...r,
                    files: r.files.map(f =>
                        conflictIds.has(f.id)
                            ? { ...f, syncStatus: 'conflict' as SyncStatus, serverContent: '[Simulated remote edit — use BroadcastChannel for real conflicts]' }
                            : f
                    )
                };
            });
            const repo = next.find(r => r.name === repoName);
            const conflictCount = repo?.files.filter(f => f.syncStatus === 'conflict').length ?? 0;
            addLog(`Incoming edit collision detected on ${conflictCount} file(s) in '${repoName}'. Manual resolution required.`);
            return next;
        });
    };

    const saveFileContent = (repoName: string, fileName: string, newContent: string, originalContent: string) => {
        setReposData(prev =>
            prev.map(r =>
                r.name === repoName
                    ? {
                        ...r,
                        files: r.files.map(f =>
                            f.name === fileName
                                ? { ...f, content: newContent, serverContent: originalContent, syncStatus: 'conflict' as SyncStatus }
                                : f
                        )
                    }
                    : r
            )
        );
        addLog(`'${fileName}' saved. Conflict check opened — review your changes vs. the original.`);
        post({ type: 'FILE_UPDATE', repoName, fileName, content: newContent, senderId: tabId.current });
    };

    const broadcastFileUpdate = (repoName: string, fileName: string, content: string) => {
        post({ type: 'FILE_UPDATE', repoName, fileName, content, senderId: tabId.current });
    };

    const resolveConflict = (repoName: string, fileName: string, resolutionType: 'local' | 'server' | 'merge', finalContent: string) => {
        setReposData(prev =>
            prev.map(r =>
                r.name === repoName
                    ? {
                        ...r,
                        files: r.files.map(f =>
                            f.name === fileName
                                ? { ...f, content: finalContent, serverContent: '', syncStatus: 'synced' as SyncStatus, isSyncing: false }
                                : f
                        )
                    }
                    : r
            )
        );
        const actionLabel = resolutionType === 'local' ? 'Kept Local Version' : resolutionType === 'server' ? 'Kept Server Version' : 'Auto-Merged Versions';
        addLog(`Conflict resolved in '${fileName}' (${actionLabel}). File is now synchronized.`);
    };

    if (!isHydrated) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-2 border-amber-500/40 border-t-amber-500 rounded-full animate-spin" />
                    <p className="text-zinc-400 text-sm font-medium">Loading DocuSync...</p>
                </div>
            </div>
        );
    }

    return (
        <SyncContext.Provider value={{
            reposData,
            syncLogs,
            trashedFiles,
            isSupabaseEnabled: isSupabaseConfigured,
            createRepository,
            deleteRepository,
            deleteFile,
            trashFile,
            restoreFile,
            permanentlyDeleteFile,
            emptyTrash,
            toggleStar,
            broadcastFileUpdate,
            uploadFile,
            simulateConflict,
            saveFileContent,
            resolveConflict,
            addLog,
        }}>
            {children}
        </SyncContext.Provider>
    );
};

// --- Custom Hook ---
export const useSyncContext = () => {
    const context = useContext(SyncContext);
    if (!context) throw new Error('useSyncContext must be used within a SyncProvider');
    return context;
};
