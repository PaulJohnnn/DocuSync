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
    status?: 'online' | 'idle' | 'offline';
    lastActive?: string;
}

export interface PendingRequest {
    id: number;
    name: string;
    email: string;
    date: string;
}

export interface UserRequest {
    id: string;
    name: string;
    email: string;
    requestDate: string;
    status: 'pending' | 'approved' | 'denied';
    password?: string;
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
    size?: number; // byte size for storage calculation
    isStarred?: boolean;
    isOfflineAvailable?: boolean;
    pendingReview?: { previousContent: string; resolvedWith: 'local' | 'server' | 'merge'; resolvedAt: string } | null;
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
    repoName?: string;
}

export interface TrashItem {
    id: number;
    file: FileData;
    repoName: string;
    deletedAt: string;
}

// --- Active editing tracker ---
export interface ActiveEditor {
    fileName: string;
    repoName: string;
    userName: string;
    tabId: string;
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
    | { type: 'FILE_STAR';    repoName: string; fileName: string; isStarred: boolean; senderId: string }
    | { type: 'FILE_EDITING_START'; repoName: string; fileName: string; userName: string; senderId: string }
    | { type: 'FILE_EDITING_STOP';  repoName: string; fileName: string; senderId: string }
    | { type: 'FILE_DELETED_KICK';  repoName: string; fileName: string; senderId: string };

// --- Paul's thesis content ---
const paulContent = `<h2>Introduction</h2><p>Hi I'm Paul... I'm on Cabuyao City... I'm on section CS 402, nice to meet you all groupmates.</p><p>This document is part of our collaborative thesis project, managed through DocuSync. Please feel free to add your sections below.</p>`;

// --- Default content ---
const defaultContent = (name: string) =>
    `<h2>${name}</h2><p>Hi I'm Paul... I'm on Cabuyao City... I'm on section CS 402, nice to meet you all groupmates.</p><p>This document is part of our collaborative thesis project. Begin editing to add your content here.</p>`;

// --- 15 GB limit in bytes ---
const STORAGE_LIMIT_BYTES = 15 * 1024 * 1024 * 1024;

// --- Initial Data ---
const initialReposData: RepositoryData[] = [
    {
        id: 1, name: 'Thesis_Docs', lastSynced: 'Just now', status: 'Up to date', userRole: 'Owner',
        members: [
            { name: 'Paul John Palamara', role: 'Owner', badge: 'amber', status: 'online', lastActive: 'Now' },
            { name: 'User S', role: 'Editor', badge: 'purple', status: 'idle', lastActive: '5 min ago' },
            { name: 'Prof. Davis', role: 'Viewer', badge: 'zinc', status: 'offline', lastActive: '2 hrs ago' },
        ],
        pendingRequests: [
            { id: 101, name: 'David Lee', email: 'david.lee@university.edu', date: '10 min ago' },
            { id: 102, name: 'Dr. Sarah Chen', email: 'schen@university.edu', date: '2 hrs ago' }
        ],
        files: [
            { id: 1, name: 'Chapter_1_Introduction.docx', type: 'word', syncStatus: 'conflict' as SyncStatus, date: 'Mar 22, 2026 13:27', isSyncing: false, content: paulContent, serverContent: 'Chapter 1 — Introduction\n\nThis thesis presents a comparative analysis of document synchronization protocols, with emphasis on Conflict-free Replicated Data Types (CRDTs). Prof. Anderson revised the research scope to include additional case studies from Southeast Asian HEIs.\n\n[Prof. Anderson: Suggest expanding Section 1.2 to cover distributed system failure modes.]', isStarred: false, size: new TextEncoder().encode(paulContent).length },
            { id: 2, name: 'Chapter_2_Review.docx', type: 'word', syncStatus: 'conflict' as SyncStatus, date: 'Mar 22, 2026 12:10', isSyncing: false, content: defaultContent('Chapter 2 — Literature Review'), serverContent: 'Chapter 2 — Literature Review\n\nExisting literature on real-time collaboration traces back to the Operational Transformation model introduced by Ellis & Gibbs (1989). Elena rewrote the OT vs CRDT comparison section with updated 2024 benchmarks.\n\nSmith et al. (2023) demonstrated that CRDT-based systems outperform OT in high-latency environments by up to 34%. Johnson (2022) further confirms this in mobile-first architectures.\n\n[Elena: Added citations — Smith et al. (2023), Johnson (2022), Kleppmann (2020)]', isStarred: false, size: 4200 },
            { id: 5, name: 'Thesis_Abstract.docx', type: 'word', syncStatus: 'conflict' as SyncStatus, date: 'Mar 21, 2026 09:12', isSyncing: false, content: defaultContent('Thesis Abstract'), serverContent: 'Thesis Abstract\n\nHi I\'m Paul... I\'m on Cabuyao City... I\'m on section CS 402, nice to meet you all groupmates.\n\nThis document is part of our collaborative thesis project. Begin editing to add your content here.\n\n[Citations added by Elena: Smith et al. (2023), Johnson (2022)]', isStarred: true, size: 3800 },
        ]
    },
    {
        id: 2, name: 'Research_Collab', lastSynced: '2 hrs ago', status: 'Syncing...', userRole: 'Editor',
        members: [
            { name: 'Dr. Lim', role: 'Owner', badge: 'amber', status: 'online', lastActive: 'Now' },
            { name: 'Paul John Palamara', role: 'Editor', badge: 'purple', status: 'online', lastActive: 'Now' },
            { name: 'Maria Santos', role: 'Editor', badge: 'purple', status: 'idle', lastActive: '10 min ago' },
            { name: 'Prof. Anderson', role: 'Editor', badge: 'purple', status: 'online', lastActive: 'Now' },
            { name: 'Elena Rostova', role: 'Editor', badge: 'purple', status: 'offline', lastActive: '1 hr ago' },
            { name: 'James Cruz', role: 'Viewer', badge: 'zinc', status: 'offline', lastActive: '3 hrs ago' },
        ],
        files: [
            { id: 3, name: 'SDA_Framework.docx', type: 'word', syncStatus: 'conflict' as SyncStatus, date: 'Mar 21, 2026 13:35', isSyncing: false, content: defaultContent('SDA Framework'), serverContent: 'SDA Framework\n\nThe Scalable Document Architecture (SDA) framework defines a layered approach to managing concurrent document edits at enterprise scale. Michael Chang restructured the framework layers to align with ISO 25010 quality standards.\n\nLayer 1 — Data Ingestion\nLayer 2 — Conflict Detection (CRDT Engine)\nLayer 3 — Resolution & Commit\nLayer 4 — Replication & Sync\n\n[Michael: Renamed all layers to match the ISO 25010 taxonomy per Dr. Lim\'s request.]', isStarred: false, size: 5200 },
            { id: 4, name: 'SDA_Data_Analysis.docx', type: 'word', syncStatus: 'conflict' as SyncStatus, date: 'Mar 20, 2026 15:42', isSyncing: false, content: defaultContent('SDA Data Analysis'), serverContent: 'SDA Data Analysis\n\nQuantitative analysis of sync performance was conducted across 5 test nodes. Sarah Jenkins updated the results table with corrected measurement units (ms → μs) and added a new Figure 4 showing latency distribution.\n\nTest Results Summary:\n- Node A: 12μs avg latency\n- Node B: 18μs avg latency  \n- Node C: 9μs avg latency (optimized)\n\n[Sarah: Corrected units from ms to μs throughout. Added Figure 4 latency histogram.]', isStarred: true, size: 6800 },
            { id: 8, name: 'System_Architecture.docx', type: 'word', syncStatus: 'conflict' as SyncStatus, date: 'Mar 19, 2026 09:15', isSyncing: false, content: defaultContent('System Architecture'), serverContent: 'System Architecture\n\nThe DocuSync system architecture follows a peer-to-peer WebRTC mesh topology. Prof. Anderson added a new section on failover handling and Byzantine fault tolerance, referencing the Raft consensus algorithm.\n\nComponents:\n1. WebRTC Signaling Server (Node.js)\n2. Yjs CRDT Engine (client-side)\n3. Supabase Persistence Layer\n4. BroadcastChannel API (same-origin peers)\n\n[Prof. Anderson: Added Section 3.4 — Byzantine Fault Tolerance & Raft Consensus]', isStarred: false, size: 4100 },
            { id: 201, name: 'SDA_Security_Protocol.docx', type: 'word', syncStatus: 'conflict' as SyncStatus, date: 'Mar 18, 2026 11:20', isSyncing: false, content: defaultContent('SDA Security'), serverContent: 'SDA Security Protocol v1.2\n\nSecurity Audit by external team identified 3 moderate vulnerabilities in the peer-discovery phase. Implementing ECDSA signatures for all inbound CRDT updates.\n\n[Admin: Enforce TLS 1.3 across all signaling nodes immediately.]', isStarred: false, size: 3200 },
            { id: 202, name: 'SDA_User_Testing_Results.docx', type: 'word', syncStatus: 'conflict' as SyncStatus, date: 'Mar 17, 2026 14:45', isSyncing: false, content: defaultContent('SDA User Testing'), serverContent: 'SDA User Testing - Phase 2\n\nParticipants reported 15% improvement in merge clarity with the new "Editor Cards" UI. However, mobile latency remains a concern in low-bandwidth regions.\n\n[Researcher A: Suggest adding a low-bandwidth "text-only" mode for rural testing sites.]', isStarred: false, size: 4500 },
            { id: 203, name: 'SDA_Database_Schema.docx', type: 'word', syncStatus: 'conflict' as SyncStatus, date: 'Mar 16, 2026 09:30', isSyncing: false, content: defaultContent('SDA Schema'), serverContent: 'SDA Database Schema (Relational)\n\nShifting from Postgres to a hybrid SurrealDB approach for better performance with distributed graph relations. Updated schema migration scripts to v0.9.\n\n[Dev Team: Verify foreign key constraints on the "File_Versions" table.]', isStarred: true, size: 5800 },
            { id: 204, name: 'SDA_Network_Topology.docx', type: 'word', syncStatus: 'conflict' as SyncStatus, date: 'Mar 15, 2026 16:10', isSyncing: false, content: defaultContent('SDA Topology'), serverContent: 'SDA Network Topology Diagram Metrics\n\nSimulated a 50-node cluster. Average convergence time measured at 240ms. Recommending a DHT-based lookup for repositories with > 100 concurrent editors.\n\n[Ops: Latency spikes detected in Node 7 (Singapore region). Investigate.]', isStarred: false, size: 3900 },
            { id: 205, name: 'SDA_Deployment_Guide.docx', type: 'word', syncStatus: 'conflict' as SyncStatus, date: 'Mar 14, 2026 10:05', isSyncing: false, content: defaultContent('SDA Deployment'), serverContent: 'SDA Deployment Guide v4.0\n\nUpdated Docker Compose configurations for one-click staging setup. Added health-check endpoints for monitoring the CRDT broadcast health.\n\n[Intern: Please update the README with the new .env variable requirements.]', isStarred: false, size: 2800 },
        ]
    },

];

const initialSyncLogs: LogEntry[] = [
    { id: 1, time: '10:00 AM', message: '🚀 DocuSync initialized. CRDT sync engine active. All files up to date.' }
];

// --- Context Definition ---

interface SyncContextType {
    reposData: RepositoryData[];
    syncLogs: LogEntry[];
    trashedFiles: TrashItem[];
    isSupabaseEnabled: boolean;
    // Storage
    currentStorageUsed: number; // bytes (after delta multiplier)
    currentStorageUsedRaw: number; // bytes (actual)
    storageLimitBytes: number;
    deltaSyncEnabled: boolean;
    autoPurgeEnabled: boolean;
    toggleDeltaSync: () => void;
    toggleAutoPurge: () => void;
    // Network state (automatic detection)
    isOnline: boolean;
    // Actions
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
    clearPendingReview: (repoName: string, fileName: string) => void;
    addLog: (message: string) => void;
    // Active editing awareness
    activeEditors: ActiveEditor[];
    notifyEditingStart: (repoName: string, fileName: string, userName: string) => void;
    notifyEditingStop: (repoName: string, fileName: string) => void;
    fileDeletedEvent: { repoName: string; fileName: string } | null;
    clearFileDeletedEvent: () => void;
    // User Requests (Admin)
    pendingUserRequests: UserRequest[];
    requestAccess: (name: string, email: string) => void;
    approveRequest: (id: string, password?: string) => void;
    denyRequest: (id: string) => void;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

// --- Provider ---
export const SyncProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [reposData, setReposData] = useState<RepositoryData[]>(initialReposData);
    const [syncLogs, setSyncLogs] = useState<LogEntry[]>(initialSyncLogs);
    const [trashedFiles, setTrashedFiles] = useState<TrashItem[]>([]);
    const [isHydrated, setIsHydrated] = useState(false);
    const [deltaSyncEnabled, setDeltaSyncEnabled] = useState(true);
    const [autoPurgeEnabled, setAutoPurgeEnabled] = useState(true);
    const [pendingUserRequests, setPendingUserRequests] = useState<UserRequest[]>([]);
    const [activeEditors, setActiveEditors] = useState<ActiveEditor[]>([]);
    const [fileDeletedEvent, setFileDeletedEvent] = useState<{ repoName: string; fileName: string } | null>(null);
    const [isOnline, setIsOnline] = useState(true);

    const tabId = useRef<string>(
        typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2)
    );
    const channelRef = useRef<BroadcastChannel | null>(null);
    const reposDataRef = useRef(reposData);
    const trashedFilesRef = useRef(trashedFiles);
    useEffect(() => { reposDataRef.current = reposData; }, [reposData]);
    useEffect(() => { trashedFilesRef.current = trashedFiles; }, [trashedFiles]);

    // --- Storage Computation ---
    const currentStorageUsedRaw = reposData.reduce((total, repo) =>
        total + repo.files.reduce((s, f) => {
            // Use stored size if available, else estimate from content length
            const bytes = f.size ?? new TextEncoder().encode(f.content || '').length;
            return s + bytes;
        }, 0)
    , 0);

    // Delta sync: only 15% footprint if enabled
    const currentStorageUsed = deltaSyncEnabled
        ? Math.round(currentStorageUsedRaw * 0.15)
        : currentStorageUsedRaw;

    const toggleDeltaSync = () => setDeltaSyncEnabled(prev => !prev);
    const toggleAutoPurge = () => setAutoPurgeEnabled(prev => !prev);

    // ---------- Step 1: Hydrate from localStorage / Supabase ----------
    useEffect(() => {
        const hydrate = async () => {
            if (isSupabaseConfigured && supabase) {
                try {
                    const { data: dbRepos } = await supabase.from('repositories').select('*');
                    const { data: dbFiles } = await supabase.from('files').select('*');
                    
                    if (dbRepos && dbRepos.length > 0) {
                        const mappedRepos = dbRepos.map(r => ({
                            id: r.id,
                            name: r.name,
                            lastSynced: r.last_synced || 'Just now',
                            status: r.status || 'Up to date',
                            userRole: r.user_role || 'Owner',
                            members: r.members || [],
                            files: (dbFiles || []).filter(f => f.repo_id === r.id).map(f => ({
                                id: f.id,
                                name: f.name,
                                type: f.type,
                                syncStatus: f.sync_status,
                                date: f.date,
                                isSyncing: f.is_syncing,
                                content: f.content,
                                serverContent: f.server_content,
                                size: f.size,
                                isStarred: f.is_starred,
                                pendingReview: f.pending_review
                            }))
                        }));
                        setReposData(mappedRepos as RepositoryData[]);
                        setIsHydrated(true);
                        return; // Successfully hydrated from DB, skip local storage
                    }
                } catch (e) {
                    console.error('Supabase hydration failed, falling back to local', e);
                }
            }

            try {
                const DATA_VERSION = 'v6-member-status';
                const storedVersion = localStorage.getItem('docusync_data_version');

                // If version mismatch, wipe all cached state and start fresh with new initial data
                if (storedVersion !== DATA_VERSION) {
                    localStorage.removeItem('docusync_repos');
                    localStorage.removeItem('docusync_logs');
                    localStorage.removeItem('docusync_trash');
                    localStorage.setItem('docusync_data_version', DATA_VERSION);
                    setIsHydrated(true);
                    return;
                }

                const storedRepos  = localStorage.getItem('docusync_repos');
                const storedLogs   = localStorage.getItem('docusync_logs');
                const storedTrash  = localStorage.getItem('docusync_trash');
                const storedDelta  = localStorage.getItem('docusync_delta_sync');
                const storedPurge  = localStorage.getItem('docusync_auto_purge');
                const storedUserRequests = localStorage.getItem('docusync_user_requests');

                if (storedRepos) {
                    const parsed = JSON.parse(storedRepos) as RepositoryData[];
                    const hasOldNames = parsed.some(r => r.name === 'Main-Sync-Repo' || r.name === 'Project-Beta-Repo' || r.name === 'External-Assets-Repo');
                    if (!hasOldNames) setReposData(parsed);
                }
                if (storedLogs)  setSyncLogs(JSON.parse(storedLogs));
                if (storedTrash) setTrashedFiles(JSON.parse(storedTrash));
                if (storedDelta !== null) setDeltaSyncEnabled(JSON.parse(storedDelta));
                if (storedPurge !== null) setAutoPurgeEnabled(JSON.parse(storedPurge));
                if (storedUserRequests) setPendingUserRequests(JSON.parse(storedUserRequests));
            } catch (e) {
                console.error('Failed to hydrate state from localStorage', e);
            }
            setIsHydrated(true);
        };
        hydrate();
    }, []);

    // ---------- Step 2: Persist on every change ----------
    useEffect(() => {
        if (!isHydrated) return;
        try {
            localStorage.setItem('docusync_repos',      JSON.stringify(reposData));
            localStorage.setItem('docusync_logs',       JSON.stringify(syncLogs));
            localStorage.setItem('docusync_trash',      JSON.stringify(trashedFiles));
            localStorage.setItem('docusync_delta_sync', JSON.stringify(deltaSyncEnabled));
            localStorage.setItem('docusync_auto_purge', JSON.stringify(autoPurgeEnabled));
            localStorage.setItem('docusync_user_requests', JSON.stringify(pendingUserRequests));
        } catch (e) {
            console.error('Failed to persist state to localStorage', e);
        }
    }, [reposData, syncLogs, trashedFiles, isHydrated, deltaSyncEnabled, autoPurgeEnabled, pendingUserRequests]);

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
                case 'FILE_EDITING_START':
                    setActiveEditors(prev => {
                        // Avoid duplicates from the same tab
                        const filtered = prev.filter(e => e.tabId !== msg.senderId || e.fileName !== msg.fileName);
                        return [...filtered, { fileName: msg.fileName, repoName: msg.repoName, userName: msg.userName, tabId: msg.senderId }];
                    });
                    break;
                case 'FILE_EDITING_STOP':
                    setActiveEditors(prev => prev.filter(e => !(e.tabId === msg.senderId && e.fileName === msg.fileName)));
                    break;
                case 'FILE_DELETED_KICK':
                    // If we are editing this file, signal the UI to kick us out
                    setFileDeletedEvent({ repoName: msg.repoName, fileName: msg.fileName });
                    // Clean up active editors for this file
                    setActiveEditors(prev => prev.filter(e => !(e.repoName === msg.repoName && e.fileName === msg.fileName)));
                    break;
            }
        };

        return () => { channel.close(); channelRef.current = null; };
    }, []);

    // ---------- Automatic Online/Offline Detection ----------
    useEffect(() => {
        const handleOffline = () => {
            setIsOnline(false);
            addLog('🔴 Network disconnected. CRDT engine entering offline buffer mode. Edits queued locally.');
        };
        const handleOnline = () => {
            setIsOnline(true);
            addLog('🟢 Network reconnected. CRDT state convergence initiated. Syncing buffered edits...');
        };
        setIsOnline(navigator.onLine);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);
        return () => {
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---------- Supabase Realtime (when credentials are set) ----------
    useEffect(() => {
        if (!isSupabaseConfigured || !supabase) return;

        const subscription = supabase
            .channel('docusync-db-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'files' }, () => {
                addLog('🔄 Supabase: File change detected. Refreshing...');
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'repositories' }, () => {
                addLog('🔄 Supabase: Repository change detected. Refreshing...');
            })
            .subscribe();

        return () => {
            if (supabase) supabase.removeChannel(subscription);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---------- Auto-purge: delete trash items older than 30 days ----------
    useEffect(() => {
        if (!autoPurgeEnabled || !isHydrated) return;
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const expired = trashedFilesRef.current.filter(t => {
            const deletedTime = new Date(t.deletedAt).getTime();
            return !isNaN(deletedTime) && (now - deletedTime) > thirtyDaysMs;
        });
        if (expired.length > 0) {
            setTrashedFiles(prev => prev.filter(t => !expired.some(e => e.id === t.id)));
            addLog(`♻️ Auto-Purge: ${expired.length} item(s) permanently deleted (30-day policy).`);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHydrated, autoPurgeEnabled]);

    // ---------- Helpers ----------
    const post = (msg: BroadcastMessage) => channelRef.current?.postMessage(msg);

    const addLog = (message: string, repoName?: string) => {
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setSyncLogs(prev => [{ id: Date.now(), time: now, message, repoName }, ...prev]);
    };

    // ---------- Actions ----------

    const createRepository = async (name: string) => {
        if (!name.trim()) return;
        const newRepo: RepositoryData = {
            id: Date.now(),
            name: name.trim(),
            lastSynced: 'Just now',
            status: 'Up to date',
            userRole: 'Owner',
            members: [{ name: 'Paul John Palamara', role: 'Owner', badge: 'amber' }],
            files: []
        };
        setReposData(prev => [newRepo, ...prev]);
        addLog(`Repository '${name.trim()}' created successfully.`);
        post({ type: 'REPO_CREATE', repo: newRepo, senderId: tabId.current });

        if (isSupabaseConfigured && supabase) {
            await supabase.from('repositories').insert([{
                id: newRepo.id,
                name: newRepo.name,
                last_synced: newRepo.lastSynced,
                status: newRepo.status,
                user_role: newRepo.userRole,
                members: newRepo.members
            }]);
        }
    };


    const deleteRepository = (repoId: number) => {
        const repo = reposData.find(r => r.id === repoId);
        setReposData(prev => prev.filter(r => r.id !== repoId));
        if (repo) {
            addLog(`Repository '${repo.name}' and all its files have been permanently deleted.`);
            post({ type: 'REPO_DELETE', repoId, senderId: tabId.current });
        }
    };

    const deleteFile = async (repoName: string, fileName: string) => {
        setReposData(prev =>
            prev.map(r =>
                r.name === repoName
                    ? { ...r, files: r.files.filter(f => f.name !== fileName) }
                    : r
            )
        );
        setActiveEditors(prev => prev.filter(e => !(e.repoName === repoName && e.fileName === fileName)));
        addLog(`File '${fileName}' deleted from '${repoName}'.`, repoName);
        post({ type: 'FILE_DELETE', repoName, fileName, senderId: tabId.current });
        post({ type: 'FILE_DELETED_KICK', repoName, fileName, senderId: tabId.current });

        if (isSupabaseConfigured && supabase) {
            const repo = reposDataRef.current.find(r => r.name === repoName);
            if (repo) {
                await supabase.from('files').delete().match({ repo_id: repo.id, name: fileName });
            }
        }
    };

    const trashFile = async (repoName: string, fileName: string) => {
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
        setActiveEditors(prev => prev.filter(e => !(e.repoName === repoName && e.fileName === fileName)));
        setTrashedFiles(prev => [trashItem, ...prev]);
        addLog(`'${fileName}' moved to Trash from '${repoName}'.`, repoName);
        post({ type: 'FILE_TRASH', trashItem, senderId: tabId.current });
        post({ type: 'FILE_DELETED_KICK', repoName, fileName, senderId: tabId.current });

        if (isSupabaseConfigured && supabase) {
            if (repo) {
                await supabase.from('files').delete().match({ repo_id: repo.id, name: fileName });
            }
        }
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

    const uploadFile = async (repoName: string, fileInfo: Omit<FileData, 'id' | 'syncStatus' | 'isSyncing'>) => {
        // Compute projected storage usage
        const fileSize = fileInfo.size ?? new TextEncoder().encode(fileInfo.content || '').length;
        const projected = deltaSyncEnabled
            ? currentStorageUsedRaw + fileSize
            : currentStorageUsedRaw + fileSize;

        if (projected > STORAGE_LIMIT_BYTES) {
            addLog(`⛔ Upload blocked: Storage limit of 15 GB would be exceeded. Free up space first.`);
            return;
        }

        const newFile: FileData = {
            ...fileInfo,
            id: Date.now(),
            syncStatus: 'synced',
            isSyncing: false,
            content: fileInfo.content || defaultContent(fileInfo.name),
            serverContent: '',
            isStarred: false,
            size: fileSize,
        };
        setReposData(prev =>
            prev.map(r =>
                r.name === repoName
                    ? { ...r, files: [newFile, ...r.files] }
                    : r
            )
        );
        post({ type: 'FILE_UPLOAD', repoName, file: newFile, senderId: tabId.current });

        if (isSupabaseConfigured && supabase) {
            const repo = reposDataRef.current.find(r => r.name === repoName);
            if (repo) {
                let storagePath = null;
                if (fileSize > 1000 * 1024) { // over 1MB
                    storagePath = `${repoName}/${newFile.name}`;
                    const blob = new Blob([newFile.content], { type: 'text/plain' });
                    await supabase.storage.from('thesis-docs').upload(storagePath, blob);
                }

                await supabase.from('files').insert([{
                    id: newFile.id,
                    repo_id: repo.id,
                    name: newFile.name,
                    type: newFile.type,
                    sync_status: newFile.syncStatus,
                    date: newFile.date,
                    is_syncing: newFile.isSyncing,
                    content: storagePath ? '[Stored in bucket]' : newFile.content,
                    server_content: newFile.serverContent,
                    size: newFile.size,
                    is_starred: newFile.isStarred,
                    storage_path: storagePath
                }]);
            }
        }
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
                            ? { ...f, syncStatus: 'conflict' as SyncStatus, serverContent: (f.content || '') + ' [Simulated remote edit from Prof. Anderson]' }
                            : f
                    )
                };
            });
            const repo = next.find(r => r.name === repoName);
            const conflictCount = repo?.files.filter(f => f.syncStatus === 'conflict').length ?? 0;
            addLog(`Incoming edit collision detected on ${conflictCount} file(s) in '${repoName}'. Manual resolution required.`, repoName);
            return next;
        });
    };

    const saveFileContent = async (repoName: string, fileName: string, newContent: string, originalContent: string) => {
        const contentSize = new TextEncoder().encode(newContent).length;
        setReposData(prev =>
            prev.map(r =>
                r.name === repoName
                    ? {
                        ...r,
                        files: r.files.map(f =>
                            f.name === fileName
                                ? { ...f, content: newContent, serverContent: originalContent, syncStatus: 'synced' as SyncStatus, size: contentSize }
                                : f
                        )
                    }
                    : r
            )
        );
        addLog(`✅ '${fileName}' saved & synced via CRDT. All collaborators updated.`, repoName);
        post({ type: 'FILE_UPDATE', repoName, fileName, content: newContent, senderId: tabId.current });

        if (isSupabaseConfigured && supabase) {
            const repo = reposDataRef.current.find(r => r.name === repoName);
            if (repo) {
                await supabase.from('files').update({
                    content: newContent,
                    server_content: originalContent,
                    sync_status: 'synced',
                    size: contentSize
                }).match({ repo_id: repo.id, name: fileName });
            }
        }
    };

    const broadcastFileUpdate = (repoName: string, fileName: string, content: string) => {
        post({ type: 'FILE_UPDATE', repoName, fileName, content, senderId: tabId.current });
    };

    const notifyEditingStart = (repoName: string, fileName: string, userName: string) => {
        // Add ourselves to local active editors
        setActiveEditors(prev => {
            const filtered = prev.filter(e => e.tabId !== tabId.current || e.fileName !== fileName);
            return [...filtered, { fileName, repoName, userName, tabId: tabId.current }];
        });
        post({ type: 'FILE_EDITING_START', repoName, fileName, userName, senderId: tabId.current });
    };

    const notifyEditingStop = (repoName: string, fileName: string) => {
        setActiveEditors(prev => prev.filter(e => !(e.tabId === tabId.current && e.fileName === fileName)));
        post({ type: 'FILE_EDITING_STOP', repoName, fileName, senderId: tabId.current });
    };

    const clearFileDeletedEvent = () => setFileDeletedEvent(null);

    const resolveConflict = (repoName: string, fileName: string, resolutionType: 'local' | 'server' | 'merge', finalContent: string) => {
        setReposData(prev =>
            prev.map(r =>
                r.name === repoName
                    ? {
                        ...r,
                        files: r.files.map(f =>
                            f.name === fileName
                                ? {
                                    ...f,
                                    content: finalContent,
                                    serverContent: '',
                                    syncStatus: 'synced' as SyncStatus,
                                    isSyncing: false,
                                    pendingReview: {
                                        previousContent: f.content,
                                        resolvedWith: resolutionType,
                                        resolvedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                    },
                                }
                                : f
                        )
                    }
                    : r
            )
        );
        const actionLabel = resolutionType === 'local' ? 'Kept Local Version' : resolutionType === 'server' ? 'Kept Server Version' : 'Auto-Merged Versions';
        addLog(`Conflict resolved in '${fileName}' (${actionLabel}). File is now synchronized.`, repoName);
    };

    const clearPendingReview = (repoName: string, fileName: string) => {
        setReposData(prev =>
            prev.map(r =>
                r.name === repoName
                    ? { ...r, files: r.files.map(f => f.name === fileName ? { ...f, pendingReview: null } : f) }
                    : r
            )
        );
        addLog(`✅ Changes accepted for '${fileName}'. Document is ready for editing.`, repoName);
    };

    const requestAccess = (name: string, email: string) => {
        const newRequest: UserRequest = {
            id: crypto.randomUUID?.() || String(Date.now()),
            name,
            email,
            requestDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            status: 'pending'
        };
        setPendingUserRequests(prev => [newRequest, ...prev]);
        addLog(`📩 New access request from ${name} (${email}).`);
    };

    const approveRequest = (id: string, password?: string) => {
        setPendingUserRequests(prev => prev.map(req => 
            req.id === id ? { ...req, status: 'approved', password } : req
        ));
        const req = pendingUserRequests.find(r => r.id === id);
        if (req) {
            addLog(`✅ Access request approved for ${req.name}.`);
        }
    };

    const denyRequest = (id: string) => {
        const req = pendingUserRequests.find(r => r.id === id);
        setPendingUserRequests(prev => prev.filter(r => r.id !== id));
        if (req) {
            addLog(`❌ Access request denied for ${req.name}.`);
        }
    };

    const computedReposData = reposData.map(repo => {
        if (repo.files.length === 0) return { ...repo, status: 'Up to date' };
        const hasConflict = repo.files.some(f => f.syncStatus === 'conflict');
        const hasSyncing = repo.files.some(f => f.isSyncing || f.syncStatus === 'syncing...');
        return {
            ...repo,
            status: hasConflict ? 'Conflict' : (hasSyncing ? 'Syncing...' : 'Up to date')
        };
    });

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
            reposData: computedReposData,
            syncLogs,
            trashedFiles,
            isSupabaseEnabled: isSupabaseConfigured,
            currentStorageUsed,
            currentStorageUsedRaw,
            storageLimitBytes: STORAGE_LIMIT_BYTES,
            deltaSyncEnabled,
            autoPurgeEnabled,
            toggleDeltaSync,
            toggleAutoPurge,
            isOnline,
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
            clearPendingReview,
            addLog,
            activeEditors,
            notifyEditingStart,
            notifyEditingStop,
            fileDeletedEvent,
            clearFileDeletedEvent,
            pendingUserRequests,
            requestAccess,
            approveRequest,
            denyRequest,
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
