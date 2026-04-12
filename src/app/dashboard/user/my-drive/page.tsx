"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '../../../../components/ThemeToggle';
import {
    Folder, FileText, Clock, Star, Trash2, User,
    CheckCircle2, AlertTriangle, Share2,
    ChevronRight, MoreVertical, Search,
    Activity, RefreshCcw, Database,
    FileIcon, X, Terminal, UploadCloud, FileUp, Wand, LogOut,
    Monitor, Laptop, Lock, Bell, Wifi, Shield, GitMerge,
    Download, WifiOff, Users, Plus, UserPlus, FolderPlus, FilePlus, Settings, Link2, UserCheck, UserX, ChevronLeft,
    Info, Zap, MessageCircle, FileSearch, ListFilter, GripVertical
} from 'lucide-react';
import { useSyncContext, FileData, RepositoryData } from '../../../../context/SyncContext';
import RichTextEditor from '../../../../components/RichTextEditor';
import mammoth from 'mammoth';

export default function UserDashboard() {
    const router = useRouter();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<string>('My Drive');
    const [isOffline, setIsOffline] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const [queueOffline, setQueueOffline] = useState(true);
    const [isLogOpen, setIsLogOpen] = useState(false);
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
    const [currentRepo, setCurrentRepo] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [isCreateRepoOpen, setIsCreateRepoOpen] = useState(false);
    const [newRepoName, setNewRepoName] = useState('');
    const [conflictFile, setConflictFile] = useState<string | null>(null);
    const [isGroupManageOpen, setIsGroupManageOpen] = useState(false);
    const [isInviteExpanded, setIsInviteExpanded] = useState(false);
    const [isJoinRepoOpen, setIsJoinRepoOpen] = useState(false);
    const [joinInviteCode, setJoinInviteCode] = useState('');
    const [isFriendsPanelOpen, setIsFriendsPanelOpen] = useState(false);
    const [friendSearchQuery, setFriendSearchQuery] = useState('');
    const [conflictIndex, setConflictIndex] = useState(0);
    const [resolvedConflicts, setResolvedConflicts] = useState<number[]>([]);
    // Module 2: File Upload
    const [stagedFile, setStagedFile] = useState<{ name: string; content: string; size: number } | null>(null);
    // Module 3: File Editor
    const [editingFile, setEditingFile] = useState<{ name: string; content: string; pendingReview?: { previousContent: string; resolvedWith: 'local' | 'server' | 'merge'; resolvedAt: string } | null } | null>(null);
    const [editorText, setEditorText] = useState('');
    // Always-fresh ref — never stale in closures or modal opens
    const latestEditorTextRef = useRef('');
    useEffect(() => { latestEditorTextRef.current = editorText; }, [editorText]);
    // Module 4: Dynamic conflict content (from editor Save & Quit)
    const [dynamicConflict, setDynamicConflict] = useState<{ localContent: string; serverContent: string; originalContent: string } | null>(null);
    // Module 1: Delete repo confirm
    const [isDeleteRepoOpen, setIsDeleteRepoOpen] = useState(false);
    // Premium delete file modal
    const [deleteFileTarget, setDeleteFileTarget] = useState<{ trashItemId: number; fileName: string } | null>(null);
    // Multi-user editor cards flow
    const [isEditingCardsOpen, setIsEditingCardsOpen] = useState(false);
    const [editingCardsFile, setEditingCardsFile] = useState<{ name: string; content: string; serverContent: string } | null>(null);
    const [reviewingUser, setReviewingUser] = useState<{ name: string; color: string; accentClass: string; content: string; badge: string } | null>(null);
    const [visibleSuggestions, setVisibleSuggestions] = useState<string[]>(['server', 'merge', 'sarah']);
    const [suggestionOrder, setSuggestionOrder] = useState<string[]>(['server', 'merge', 'sarah']);

    const floatAnim = {
        initial: { y: 0 },
        animate: {
            y: [-3, 3, -3],
            transition: { duration: 5, repeat: Infinity, ease: "easeInOut" as const }
        }
    };

    // Body scroll lock — prevent page jump when any modal is open
    const anyModalOpen = isUploadOpen || isLogoutModalOpen || isCreateRepoOpen
        || !!conflictFile || isGroupManageOpen || isJoinRepoOpen
        || !!editingFile || isDeleteRepoOpen || !!deleteFileTarget
        || isEditingCardsOpen || !!reviewingUser;

    useEffect(() => {
        if (anyModalOpen) {
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            document.body.style.overflow = 'hidden';
            document.body.style.paddingRight = scrollbarWidth > 0 ? `${scrollbarWidth}px` : '';
        } else {
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        }
        return () => {
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        };
    }, [anyModalOpen]);


    const navItems = [
        { name: 'Profile', icon: User },
        { name: 'My Drive', icon: Database },
        { name: 'Recent', icon: Clock },
        { name: 'Starred', icon: Star },
        { name: 'Trash', icon: Trash2 },
    ];

    const [autoSync, setAutoSync] = useState(true);
    const [notifications, setNotifications] = useState(true);
    const [userName, setUserName] = useState('DocuSync Demo User');
    const [userEmail, setUserEmail] = useState('user@docusync.edu');
    const [isEditingProfile, setIsEditingProfile] = useState(false);

    useEffect(() => {
        const storedUser = localStorage.getItem('docusync_current_user');
        if (storedUser) {
            const parsed = JSON.parse(storedUser);
            setUserName(parsed.name);
            setUserEmail(parsed.email);
        }
    }, []);

    const {
        reposData,
        syncLogs,
        trashedFiles,
        currentStorageUsed,
        storageLimitBytes,
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
        activeEditors,
        notifyEditingStart,
        notifyEditingStop,
        fileDeletedEvent,
        clearFileDeletedEvent,
        isOnline
    } = useSyncContext();

    // Real latency measurement — pings a tiny request and measures round-trip time
    const [latencyMs, setLatencyMs] = useState<number | null>(null);
    useEffect(() => {
        const measure = async () => {
            if (!isOnline) { setLatencyMs(null); return; }
            try {
                const start = performance.now();
                await fetch('https://www.google.com/favicon.ico', { mode: 'no-cors', cache: 'no-store' });
                const end = performance.now();
                setLatencyMs(Math.round(end - start));
            } catch { setLatencyMs(null); }
        };
        measure();
        const interval = setInterval(measure, 10000);
        return () => clearInterval(interval);
    }, [isOnline]);

    const latencyLabel = latencyMs === null ? '—' : `${latencyMs}ms`;
    const latencyColor = latencyMs === null ? 'text-zinc-400' : latencyMs < 150 ? 'text-green-500' : latencyMs < 400 ? 'text-amber-500' : 'text-red-500';

    // Alias for the logged-in user name
    const activeUserName = userName;

    // Determine if current user is the owner of the active repo (for approval gating)
    const currentRepoData = reposData.find(r => r.name === currentRepo);
    const isRepoOwner = currentRepoData?.userRole === 'Owner';

    // Owner-delete-warning: when Owner tries to trash a file being edited
    const [ownerDeleteWarning, setOwnerDeleteWarning] = useState<{ repoName: string; fileName: string; editingUsers: string[] } | null>(null);
    // File-deleted-kick modal: shown to editors when Owner deletes their file
    const [fileDeletedKick, setFileDeletedKick] = useState<{ fileName: string } | null>(null);

    // Confirm Trash File: generic confirmation before soft-deleting any file
    const [confirmTrashFile, setConfirmTrashFile] = useState<{ repoName: string; fileName: string } | null>(null);

    // Notify context when we start/stop editing
    useEffect(() => {
        if (editingFile && currentRepo) {
            notifyEditingStart(currentRepo, editingFile.name, activeUserName);
            return () => {
                notifyEditingStop(currentRepo, editingFile.name);
            };
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editingFile?.name, currentRepo]);

    // Detect FILE_DELETED_KICK event — kick the editor out
    useEffect(() => {
        if (fileDeletedEvent && editingFile && currentRepo) {
            if (fileDeletedEvent.repoName === currentRepo && fileDeletedEvent.fileName === editingFile.name) {
                setEditingFile(null);
                setEditorText('');
                setFileDeletedKick({ fileName: fileDeletedEvent.fileName });
                clearFileDeletedEvent();
            } else {
                clearFileDeletedEvent();
            }
        } else if (fileDeletedEvent) {
            clearFileDeletedEvent();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fileDeletedEvent]);

    const formatBytes = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(3)} GB`;
    };
    const storagePercent = Math.min(100, (currentStorageUsed / storageLimitBytes) * 100);

    const getFileIconColors = (type: string) => {
        return 'from-blue-500/20 to-blue-600/20 text-blue-500 border-blue-500/30';
    };

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 transition-colors duration-300 font-sans relative overflow-hidden flex">
            {/* Interactive Animated Ambient Orbs Background */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                {/* Light Mode Glow */}
                <motion.div 
                    animate={{ x: [0, 50, -30, 0], y: [0, -40, 60, 0], scale: [1, 1.1, 0.9, 1] }} 
                    transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
                    className="absolute -top-40 left-10 w-[60vw] h-[50vw] rounded-full bg-amber-500/5 blur-[100px] dark:hidden" 
                />
                
                {/* Dark Mode Ambient Orbs */}
                <motion.div 
                    animate={{ rotate: 360, scale: [1, 1.2, 0.9, 1] }} 
                    transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                    className="hidden dark:block absolute -top-40 -left-20 w-[60vw] h-[60vw] rounded-full bg-gradient-to-br from-amber-500/10 to-transparent blur-[120px]" 
                />
                <motion.div 
                    animate={{ x: [0, -100, 50, 0], y: [0, 80, -60, 0], scale: [0.8, 1.1, 0.9, 0.8] }} 
                    transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                    className="hidden dark:block absolute top-1/3 -right-20 w-[40vw] h-[50vw] rounded-full bg-gradient-to-tl from-purple-600/10 to-transparent blur-[100px]" 
                />
                <div className="hidden dark:block absolute top-0 inset-x-0 h-[600px] bg-gradient-to-b from-zinc-900/80 via-zinc-950/20 to-transparent" />
            </div>

            {/* ═══════════ OFFLINE / RECONNECTION BANNER ═══════════ */}
            <AnimatePresence>
                {!isOnline && (
                    <motion.div
                        key="offline-banner"
                        initial={{ y: -80, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -80, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                        className="fixed top-0 left-0 right-0 z-[999] bg-gradient-to-r from-red-600 via-red-500 to-rose-600 text-white shadow-[0_4px_30px_rgba(239,68,68,0.5)]"
                    >
                        <div className="flex items-center justify-center gap-3 px-6 py-3 text-sm font-semibold">
                            <WifiOff size={16} className="animate-pulse flex-shrink-0" />
                            <span>
                                You are <strong>offline</strong> — CRDT engine is buffering your edits locally.
                                All changes will automatically sync when connection is restored.
                            </span>
                            <span className="ml-2 px-2 py-0.5 rounded-full bg-white/20 border border-white/30 text-[10px] font-black uppercase tracking-widest">
                                CRDT Active
                            </span>
                        </div>
                    </motion.div>
                )}
                {isOnline && latencyMs !== null && latencyMs > 1000 && (
                    <motion.div
                        key="high-latency-banner"
                        initial={{ y: -80, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -80, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                        className="fixed top-0 left-0 right-0 z-[999] bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white shadow-[0_4px_30px_rgba(245,158,11,0.4)]"
                    >
                        <div className="flex items-center justify-center gap-3 px-6 py-3 text-sm font-semibold">
                            <Activity size={16} className="flex-shrink-0" />
                            <span>
                                High latency detected: <strong>{latencyMs}ms</strong> — Delta Sync is active to keep performance smooth on slow connections.
                            </span>
                            <span className="ml-2 px-2 py-0.5 rounded-full bg-white/20 border border-white/30 text-[10px] font-black uppercase tracking-widest">
                                Delta Active
                            </span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══════════ USER SIDEBAR (Amber) ═══════════ */}
            <AnimatePresence>
                {(isSidebarOpen || (typeof window !== 'undefined' && window.innerWidth >= 1024)) && (
                    <motion.div 
                        initial={{ x: -260 }}
                        animate={{ x: 0 }}
                        exit={{ x: -260 }}
                        className="fixed lg:relative z-[100] lg:z-10 w-64 h-full border-r border-white/5 dark:border-white/5 bg-white/90 dark:bg-zinc-950/95 backdrop-blur-3xl px-5 py-8 flex flex-col shadow-[20px_0_60px_rgba(0,0,0,0.4)] lg:shadow-none"
                    >
                        <div className="flex items-center justify-between mb-12">
                            <div 
                                className="flex items-center gap-4 group cursor-pointer" 
                                onClick={() => router.push('/')}
                                title="Back to Landing Page"
                            >
                                <motion.div 
                                    whileHover={{ rotate: 180 }}
                                    transition={{ duration: 0.6 }}
                                    className="w-10 h-10 rounded-[1.25rem] bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30"
                                >
                                    <RefreshCcw size={20} className="text-white" />
                                </motion.div>
                                <h1 className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 select-none">
                                    DocuSync
                                </h1>
                            </div>
                            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500"><X size={20} /></button>
                        </div>

                        <div className="flex-1 flex flex-col gap-1.5">
                            {navItems.map((item) => {
                                const isActive = activeTab === item.name;
                                return (
                                    <motion.button
                                        key={item.name}
                                        onClick={() => { setActiveTab(item.name); setIsSidebarOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 ${isActive
                                            ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 shadow-[0_4px_12px_rgba(249,115,22,0.15)]'
                                            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/5'
                                            }`}
                                        whileHover={{ x: isActive ? 0 : 4 }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        <item.icon size={19} className={isActive ? "text-orange-500" : ""} />
                                        <span className="font-bold text-sm tracking-wide">{item.name}</span>
                                    </motion.button>
                                );
                            })}
                        </div>

                        {/* Usage Card (Mobile Friendly) */}
                        <div className="mt-auto p-4 rounded-2xl bg-zinc-100/50 dark:bg-white/5 border border-zinc-200/50 dark:border-white/5">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">Storage</span>
                                <span className="text-[10px] font-bold text-orange-500">{storagePercent.toFixed(1)}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden mb-3">
                                <div className="h-full bg-gradient-to-r from-orange-400 to-amber-500 transition-all duration-500" style={{ width: `${storagePercent}%` }} />
                            </div>
                            <button className="w-full py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-[11px] font-black uppercase tracking-wider transition-all shadow-lg shadow-orange-500/20">Upgrade Pro</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══════════ MAIN CONTENT ═══════════ */}
            <div className="flex-1 flex flex-col relative z-10 h-screen overflow-hidden">
                {/* Header */}
                <header className="px-5 sm:px-8 py-4 sm:py-6 flex justify-between items-center z-20">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 shadow-sm">
                            <Plus size={20} className="rotate-45" /> {/* Use Plus rotated as a minimalist menu icon if needed, or just X */}
                        </button>
                        <div className="hidden sm:flex items-center text-sm font-medium bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl px-5 py-3 rounded-2xl border border-white/10 dark:border-white/5 shadow-lg">
                            <span className="text-zinc-900 dark:text-zinc-100 font-bold tracking-wide">{activeTab} Overview</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-4 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl px-2 sm:px-5 py-2.5 rounded-2xl border border-white/10 dark:border-white/5 shadow-lg">
                        <ThemeToggle />
                        <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-300 ${!isOnline ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20' : 'border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-900/20'}`}>
                            <div className={`w-2 h-2 rounded-full ${!isOnline ? 'bg-red-500 animate-pulse' : 'bg-green-500 animate-pulse'}`} />
                            <span className={`text-xs font-bold ${!isOnline ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
                                {!isOnline ? 'Offline — CRDT Buffering' : 'Online'}
                            </span>
                            {isOnline && latencyMs !== null && (
                                <span className={`text-[10px] font-bold ml-1 ${latencyColor}`}>{latencyLabel}</span>
                            )}
                        </div>
                        
                        <div className="hidden lg:flex items-center ml-2 border-l border-zinc-200 dark:border-zinc-700 pl-4">
                            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-widest font-black mr-3">Friends</span>
                            <motion.div 
                                className="flex -space-x-2 cursor-pointer"
                                onClick={() => setIsFriendsPanelOpen(true)}
                                initial="hidden"
                                animate="show"
                                variants={{
                                    hidden: {},
                                    show: { transition: { staggerChildren: 0.1 } }
                                }}
                            >
                                {['S', 'P', 'E'].map((initial, i) => (
                                    <motion.div 
                                        key={i} 
                                        variants={{
                                            hidden: { scale: 0, x: -10 },
                                            show: { scale: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 20 } }
                                        }}
                                        whileHover={{ scale: 1.25, zIndex: 20, y: -4, transition: { type: "spring", stiffness: 400, damping: 10 } }} 
                                        className={`w-8 h-8 rounded-full border-2 border-white dark:border-zinc-900 flex items-center justify-center text-[10px] font-black text-white ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-orange-500' : 'bg-rose-500'} shadow-[0_4px_10px_rgba(0,0,0,0.1)]`}
                                    >
                                        {initial}
                                    </motion.div>
                                ))}
                            </motion.div>
                        </div>
                    </div>
                </header>

                {/* Main Area */}
                <main className="flex-1 overflow-y-auto px-8 pb-48 custom-scrollbar" onClick={() => setOpenMenuId(null)}>
                    {activeTab === 'My Drive' ? (
                        <>
                            <div className="flex flex-row items-center justify-between w-full mb-6 px-6 py-4 border-b border-white/5 dark:border-white/5">
                                <div className="flex flex-row items-center gap-4">
                                    {currentRepo && (
                                        <>
                                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} onClick={() => { setCurrentRepo(null); setSelectedFile(null); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-white transition-colors font-semibold border border-transparent">
                                                <ChevronLeft size={16} /> Back to My Drive
                                            </motion.button>
                                            <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block"></div>
                                        </>
                                    )}
                                    {!currentRepo ? (
                                        <div className="flex gap-3">
                                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} onClick={() => setIsCreateRepoOpen(true)} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-md shadow-orange-500/20">
                                                <FolderPlus size={16} /> Create Repository
                                            </motion.button>
                                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} onClick={() => setIsJoinRepoOpen(true)} className="flex items-center gap-2 bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-colors">
                                                <Link2 size={16} /> Join Repository
                                            </motion.button>
                                        </div>
                                    ) : (
                                        isRepoOwner && (
                                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} onClick={() => setIsUploadOpen(true)} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-md shadow-orange-500/20">
                                                <FilePlus size={16} /> Add File
                                            </motion.button>
                                        )
                                    )}
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><WifiOff size={16} /> Enable Offline Mode</span>
                                    <div onClick={() => setIsOffline(!isOffline)} className={`w-12 h-6 rounded-full relative cursor-pointer shadow-inner transition-colors ${isOffline ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}>
                                        <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-md ${isOffline ? 'right-0.5' : 'left-0.5'}`}></div>
                                    </div>
                                </div>
                            </div>
                            {/* Repo list OR detail view with tabs */}
                            {!currentRepo ? (
                                <>
                                    <div className="grid grid-cols-[3fr_1fr_1fr] gap-4 px-6 py-4 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border-b border-white/5 sticky top-0 bg-zinc-50/80 dark:bg-zinc-950/80 backdrop-blur-xl z-10">
                                        <div>Name</div><div>Status</div><div>Last Synced</div>
                                    </div>
                                    <motion.div 
                                        className="mt-4 flex flex-col gap-3"
                                        variants={{
                                            hidden: { opacity: 0 },
                                            show: { opacity: 1, transition: { staggerChildren: 0.1 } }
                                        }}
                                        initial="hidden"
                                        animate="show"
                                    >
                                        <AnimatePresence mode="popLayout">
                                            {reposData.map((repo) => (
                                                <motion.div key={`repo-${repo.id}`} onClick={() => setCurrentRepo(repo.name)}
                                                    variants={{
                                                        hidden: { opacity: 0, y: 15, rotateX: -20, scale: 0.95 },
                                                        show: { opacity: 1, y: 0, rotateX: 0, scale: 1, transition: { type: "spring", stiffness: 180, damping: 20 } }
                                                    }}
                                                    style={{ transformOrigin: "top center", perspective: 1000 }}
                                                    whileHover={{ scale: 1.015, y: -2, rotateX: 2 }}
                                                    className="grid grid-cols-[3fr_1fr_1fr] gap-4 items-center px-6 py-4 rounded-2xl bg-white/60 dark:bg-zinc-900/60 backdrop-blur-sm border border-white/10 dark:border-white/5 cursor-pointer hover:border-orange-400/40 hover:bg-white/80 dark:hover:bg-zinc-800/80 hover:shadow-[0_4px_24px_rgba(0,0,0,0.15)] transition-all duration-200 group">
                                                    <div className="flex items-center gap-4">
                                                        <div className="p-2.5 rounded-xl bg-gradient-to-br border from-orange-500/20 to-purple-600/20 text-orange-400 border-orange-500/30"><Folder size={20} /></div>
                                                        <span className="font-medium text-zinc-800 dark:text-zinc-100">{repo.name}</span>
                                                    </div>
                                                    <div>{repo.status === 'Up to date' ? (<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-medium"><CheckCircle2 size={14} /> {repo.status}</div>) : (<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/30 text-xs font-medium animate-pulse"><RefreshCcw size={14} /> {repo.status}</div>)}</div>
                                                    <div className="text-sm text-zinc-500 dark:text-zinc-400">{repo.lastSynced}</div>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    </motion.div>
                                </>
                            ) : (() => {
                                const activeRepo = reposData.find(r => r.name === currentRepo);
                                const isOwner = activeRepo?.userRole === 'Owner';
                                const badgeColors: Record<string, string> = {
                                    amber: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50',
                                    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/50',
                                    zinc: 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-600',
                                };
                                return (
                                    <div className="flex flex-col gap-0">
                                        {/* Repo Header */}
                                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 sticky top-0 bg-zinc-50/80 dark:bg-zinc-950/80 backdrop-blur-xl z-10">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-500 border border-amber-500/30">
                                                    <Folder size={20} />
                                                </div>
                                                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{activeRepo?.name}</h2>
                                                <div className="ml-2 px-2.5 py-1 rounded-lg border bg-white/10 dark:bg-white/5 border-white/10 text-zinc-400 dark:text-zinc-400 text-xs font-bold flex items-center gap-1.5 backdrop-blur-sm">
                                                    <Shield size={12} /> Role: {activeRepo?.userRole}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => {
                                                    navigator.clipboard.writeText(`${window.location.origin}/dashboard/user/my-drive?repo=${activeRepo?.name}`);
                                                    setLinkCopied(true);
                                                    setTimeout(() => setLinkCopied(false), 2000);
                                                }} className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl transition-all border border-white/10 bg-white/5 dark:bg-white/5 text-zinc-300 hover:text-blue-400 hover:border-blue-400/40 hover:bg-white/10 shadow-sm text-sm font-semibold backdrop-blur-sm">
                                                    {linkCopied ? <CheckCircle2 size={16} className="text-green-500" /> : <Link2 size={16} />} 
                                                    {linkCopied ? <span className="text-green-500">Copied!</span> : 'Copy Link'}
                                                </button>
                                                <motion.button 
                                                    whileHover={{ scale: 1.02 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    onClick={() => simulateConflict(activeRepo?.name || '')} 
                                                    className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl transition-all border border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 shadow-sm text-sm font-semibold backdrop-blur-sm"
                                                >
                                                    <Zap size={16} fill="currentColor" /> Simulate Collision
                                                </motion.button>
                                                <button onClick={() => setIsGroupManageOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all border border-white/10 bg-white/5 dark:bg-white/5 text-zinc-300 hover:text-orange-400 hover:border-orange-400/40 hover:bg-white/10 shadow-sm text-sm font-semibold backdrop-blur-sm">
                                                    {isOwner ? <><Settings size={16} /> Manage Group</> : <><Users size={16} /> Team Members</>}
                                                </button>
                                            </div>
                                        </div>

                                        {/* File List */}
                                        <div className="grid grid-cols-[3fr_2fr_2fr_auto] items-center gap-4 px-6 py-3 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border-b border-white/5">
                                            <div className="text-left">Name</div><div className="text-left">Sync Status</div><div className="text-left">Last Modified</div><div className="w-48"></div>
                                        </div>
                                        <motion.div 
                                            className="mt-4 flex flex-col gap-3"
                                            variants={{
                                                hidden: { opacity: 0 },
                                                show: { opacity: 1, transition: { staggerChildren: 0.1 } }
                                            }}
                                            initial="hidden"
                                            animate="show"
                                        >
                                            <AnimatePresence mode="popLayout">
                                                {activeRepo?.files.map((file) => (
                                                    <motion.div key={`file-${file.id}`} onClick={() => {
                                                        // Clicking the file row always goes to Edit Mode
                                                        setEditingFile({ name: file.name, content: file.content || '', pendingReview: file.pendingReview });
                                                        setEditorText(file.content || '');
                                                    }}
                                                        variants={{
                                                            hidden: { opacity: 0, y: 15, rotateX: -20, scale: 0.95 },
                                                            show: { opacity: 1, y: 0, rotateX: 0, scale: 1, transition: { type: "spring", stiffness: 180, damping: 20 } }
                                                        }}
                                                        style={{ transformOrigin: "top center", perspective: 1000 }}
                                                        whileHover={{ scale: 1.015, y: -2, rotateX: 2 }}
                                                        className={`grid grid-cols-[3fr_2fr_2fr_auto] items-center gap-4 px-6 py-4 rounded-2xl border cursor-pointer transition-all duration-300 group relative ${openMenuId === String(file.id) ? 'z-[50] border-orange-400/60 shadow-lg' : 'z-0 bg-white/60 dark:bg-zinc-900/50 backdrop-blur-sm border-white/10 dark:border-white/5 hover:border-orange-400/40 hover:bg-white/80 dark:hover:bg-zinc-800/60 hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]'}`}>
                                                        <div className="flex items-center gap-4">
                                                            <div className={`p-2.5 rounded-xl bg-gradient-to-br border ${getFileIconColors(file.type)}`}><FileText size={20} /></div>
                                                            <span className="font-medium text-zinc-800 dark:text-zinc-100">{file.name}</span>
                                                        </div>
                                                        <div>
                                                            <AnimatePresence mode="popLayout">
                                                                {file.isSyncing ? (
                                                                    <motion.div key="syncing" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/50 text-xs font-medium animate-pulse">
                                                                        <RefreshCcw size={14} className="animate-spin" /> Syncing...
                                                                    </motion.div>
                                                                ) : file.syncStatus === 'synced' ? (
                                                                    <motion.div key="synced" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-medium">
                                                                        <CheckCircle2 size={14} /> Synced
                                                                    </motion.div>
                                                                ) : (
                                                                    // Conflict badge — only visible to Owner, clicking opens Conflict Mode
                                                                    isRepoOwner ? (
                                                                        <motion.div key="conflict" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                                                                            onClick={(e) => { e.stopPropagation(); setEditingCardsFile({ name: file.name, content: latestEditorTextRef.current || file.content || '', serverContent: file.serverContent || '' }); setIsEditingCardsOpen(true); }}
                                                                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-medium animate-pulse cursor-pointer hover:bg-amber-500/20 transition-colors"
                                                                            title="Owner: click to resolve conflict">
                                                                            <AlertTriangle size={14} /> Conflict
                                                                        </motion.div>
                                                                    ) : (
                                                                        // Non-owners just see a neutral "Pending Review" badge with no click action
                                                                        <motion.div key="conflict" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                                                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 text-xs font-medium">
                                                                            <Clock size={14} /> Pending Review
                                                                        </motion.div>
                                                                    )
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                        <div className="text-sm text-zinc-500 dark:text-zinc-400">{file.date}</div>
                                                        <div className="flex items-center justify-end gap-2 px-2">
                                                            {!file.isSyncing && (
                                                                <button onClick={(e) => { e.stopPropagation(); toggleStar(activeRepo?.name || '', file.name); }} className={`p-2 shrink-0 rounded-full transition-colors ${file.isStarred ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10' : 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-amber-500'}`} title={file.isStarred ? "Remove Star" : "Star File"}>
                                                                    <Star size={18} fill={file.isStarred ? "currentColor" : "none"} />
                                                                </button>
                                                            )}
                                                            <div className={`relative flex items-center justify-end ${openMenuId === String(file.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                                                                <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === String(file.id) ? null : String(file.id)); }} className="p-2 shrink-0 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500"><MoreVertical size={18} /></button>
                                                                <AnimatePresence>
                                                                    {openMenuId === String(file.id) && (
                                                                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute right-0 top-full mt-1 w-56 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-2xl border border-white/20 dark:border-white/10 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.4)] z-[200] overflow-hidden">
                                                                            <div className="flex flex-col">
                                                                                {file.syncStatus === 'conflict' && isRepoOwner && (
                                                                                    <>
                                                                                        <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); setEditingCardsFile({ name: file.name, content: file.content || '', serverContent: file.serverContent || '' }); setIsEditingCardsOpen(true); }} className="flex items-center gap-3 hover:bg-orange-500/10 px-4 py-3 cursor-pointer transition-colors text-sm text-orange-400 font-semibold"><AlertTriangle size={16} /><span>⚠️ Resolve Conflict</span></div>
                                                                                        <div className="border-b border-zinc-200 dark:border-zinc-700/50"></div>
                                                                                    </>
                                                                                )}
                                                                                <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); URL.revokeObjectURL(url); }} className="flex items-center gap-3 hover:bg-white/10 dark:hover:bg-white/5 px-4 py-3 cursor-pointer transition-colors text-sm text-zinc-700 dark:text-zinc-200"><Download size={16} /><span>Download (Check-out)</span></div>
                                                                                <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }} className="flex items-center gap-3 hover:bg-white/10 dark:hover:bg-white/5 px-4 py-3 cursor-pointer transition-colors text-sm text-zinc-700 dark:text-zinc-200"><WifiOff size={16} /><span>Make Available Offline</span></div>
                                                                                <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); setIsGroupManageOpen(true); }} className="flex items-center gap-3 hover:bg-white/10 dark:hover:bg-white/5 px-4 py-3 cursor-pointer transition-colors text-sm text-zinc-700 dark:text-zinc-200"><Users size={16} /><span>Share with Group</span></div>
                                                                                {activeRepo?.userRole === 'Owner' && (
                                                                                    <div onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setOpenMenuId(null);
                                                                                        if (!activeRepo?.name) return;
                                                                                        // Check if anyone is actively editing this file
                                                                                        const editorsOfFile = activeEditors.filter(ae => ae.repoName === activeRepo.name && ae.fileName === file.name);
                                                                                        if (editorsOfFile.length > 0) {
                                                                                            // Show warning to the Owner
                                                                                            setOwnerDeleteWarning({ repoName: activeRepo.name, fileName: file.name, editingUsers: editorsOfFile.map(e => e.userName) });
                                                                                        } else {
                                                                                            setConfirmTrashFile({ repoName: activeRepo.name, fileName: file.name });
                                                                                        }
                                                                                    }} className="flex items-center gap-3 hover:bg-rose-500/10 px-4 py-3 cursor-pointer transition-all text-sm text-rose-400 font-semibold hover:text-rose-300"><Trash2 size={16} /><span>Move to Trash</span></div>
                                                                                )}
                                                                            </div>
                                                                        </motion.div>
                                                                    )}
                                                                </AnimatePresence>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                ))}
                                            </AnimatePresence>
                                        </motion.div>
                                    </div>
                                );
                            })()}
                        </>
                    ) : activeTab === 'Trash' ? (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="w-full">
                            <div className="flex items-center justify-between mb-6 px-6 py-4">
                                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                                    <Trash2 className="text-rose-500" /> Trash Bin
                                </h2>
                                {trashedFiles.length > 0 && (
                                    <button onClick={() => setDeleteFileTarget({ trashItemId: -999, fileName: `all ${trashedFiles.length} items` })} className="px-4 py-2 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border border-rose-500/30 hover:border-rose-500/50 transition-all text-sm font-bold flex items-center gap-2">
                                        <Trash2 size={14} /> Empty Trash
                                    </button>
                                )}
                            </div>
                            {trashedFiles.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-[50vh] text-center">
                                    <div className="w-20 h-20 mb-6 rounded-full bg-zinc-100 dark:bg-zinc-800/50 flex items-center justify-center border border-zinc-200 dark:border-zinc-700">
                                        <Trash2 size={32} className="text-zinc-400 dark:text-zinc-500" />
                                    </div>
                                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Trash is Empty</h3>
                                    <p className="text-zinc-500 dark:text-zinc-400">Items you delete will appear here for 30 days before being permanently removed.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3 px-6">
                                    <div className="grid grid-cols-[3fr_2fr_1fr_auto] items-center gap-4 px-6 py-3 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border-b border-white/5">
                                        <div>Name</div><div>Original Repo</div><div>Deleted On</div><div className="w-48 text-right">Actions</div>
                                    </div>
                                    <AnimatePresence mode="popLayout">
                                        {trashedFiles.map((item, i) => (
                                            <motion.div key={item.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                                                className="grid grid-cols-[3fr_2fr_1fr_auto] items-center gap-4 px-6 py-4 rounded-2xl bg-white/60 dark:bg-zinc-900/50 border border-white/10 dark:border-white/5 hover:bg-white/80 dark:hover:bg-zinc-800/60 transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500"><FileText size={20} /></div>
                                                    <span className="font-medium text-zinc-500 dark:text-zinc-400 line-through">{item.file.name}</span>
                                                </div>
                                                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><Folder size={16} /> {item.repoName}</div>
                                                <div className="text-sm text-zinc-500">{item.deletedAt}</div>
                                                <div className="flex gap-2 justify-end">
                                                    <button onClick={() => restoreFile(item.id)} className="px-3 py-1.5 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500 hover:text-white transition-colors text-xs font-bold shrink-0">Restore</button>
                                                    <button onClick={(e) => { e.stopPropagation(); setDeleteFileTarget({ trashItemId: item.id, fileName: item.file.name }); }} className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 hover:shadow-[0_0_10px_rgba(239,68,68,0.25)] border border-rose-500/20 transition-all text-xs font-bold shrink-0 flex items-center gap-1.5"><Trash2 size={12} /> Delete Forever</button>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            )}
                        </motion.div>
                    ) : activeTab === 'Recent' || activeTab === 'Starred' ? (() => {
                        const isRecent = activeTab === 'Recent';
                        const files = reposData.flatMap(r => r.files.map(f => ({ ...f, repoName: r.name })));
                        const displayFiles = isRecent
                            ? files.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 15)
                            : files.filter(f => f.isStarred);
                            
                        return (
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="w-full">
                                <div className="flex items-center justify-between mb-6 px-6 py-4">
                                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                                        {isRecent ? <Clock className="text-blue-500" /> : <Star className="text-amber-500" fill="currentColor" />} {activeTab} Files
                                    </h2>
                                </div>
                                {displayFiles.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-[50vh] text-center">
                                        <div className="w-20 h-20 mb-6 rounded-full bg-zinc-100 dark:bg-zinc-800/50 flex items-center justify-center border border-zinc-200 dark:border-zinc-700">
                                            {isRecent ? <Clock size={32} className="text-zinc-400 dark:text-zinc-500" /> : <Star size={32} className="text-zinc-400 dark:text-zinc-500" />}
                                        </div>
                                        <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">No {isRecent ? "recent" : "starred"} files</h3>
                                        <p className="text-zinc-500 dark:text-zinc-400">Files {isRecent ? "you modify recently" : "you star"} will appear here for quick access.</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-3 px-6">
                                        <div className="grid grid-cols-[3fr_2fr_1fr_auto] items-center gap-4 px-6 py-3 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border-b border-white/5">
                                            <div>Name</div><div>Location</div><div>Last Modified</div><div></div>
                                        </div>
                                        <AnimatePresence mode="popLayout">
                                            {displayFiles.map((file, i) => (
                                                <motion.div key={`${file.repoName}-${file.id}`} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                                                    onClick={() => { setCurrentRepo(file.repoName); setEditingFile({ name: file.name, content: file.content || '', pendingReview: file.pendingReview }); setEditorText(file.content || ''); setActiveTab('My Drive'); }}
                                                    className="grid grid-cols-[3fr_2fr_1fr_auto] items-center gap-4 px-6 py-4 rounded-2xl bg-white/60 dark:bg-zinc-900/50 border border-white/10 dark:border-white/5 hover:border-orange-400/40 hover:bg-white/80 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer cursor-pointer">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`p-2.5 rounded-xl bg-gradient-to-br border ${getFileIconColors(file.type)}`}><FileText size={20} /></div>
                                                        <span className="font-medium text-zinc-800 dark:text-zinc-100">{file.name}</span>
                                                    </div>
                                                    <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2 font-mono text-xs"><Folder size={14} className="text-amber-500/70" /> {file.repoName}</div>
                                                    <div className="text-sm text-zinc-500">{file.date}</div>
                                                    <div className="flex items-center gap-2">
                                                        {file.isStarred && <Star size={16} className="text-amber-500" fill="currentColor" />}
                                                        <ChevronRight size={18} className="text-zinc-400" />
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    </div>
                                )}
                            </motion.div>
                        );
                    })() : activeTab === 'Profile' ? (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full max-w-6xl mx-auto items-start">
                            <div className="bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl border border-white/15 rounded-2xl p-8 flex flex-col items-center space-y-6 shadow-[0_10px_40px_rgba(0,0,0,0.2)]">
                                <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-amber-600 to-orange-600 flex items-center justify-center text-3xl font-bold text-white shadow-lg uppercase">{userName.charAt(0)}</div>
                                <div className="text-center">
                                    <h2 className="text-3xl font-bold text-zinc-900 dark:text-white mb-1">{userName}</h2>
                                    <p className="text-zinc-500 dark:text-zinc-400 mb-3">{userEmail}</p>
                                    <span className="inline-block px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 text-xs font-semibold border border-amber-200 dark:border-amber-900/50">Standard User</span>
                                </div>
                                <div className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl p-5 flex flex-col gap-3">
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-zinc-600 dark:text-zinc-300 font-medium text-sm">Storage Used</span>
                                        <span className="text-zinc-900 dark:text-white font-bold text-sm">{formatBytes(currentStorageUsed)} <span className="text-zinc-500 font-normal">/ {formatBytes(storageLimitBytes)}</span></span>
                                    </div>
                                    <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden"><div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${storagePercent}%` }}></div></div>
                                </div>
                                <button onClick={() => setIsLogoutModalOpen(true)} className="flex items-center gap-2 border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:border-rose-400/50 hover:shadow-[0_0_12px_rgba(239,68,68,0.15)] px-8 py-3 rounded-xl transition-all font-semibold mt-4 w-full justify-center">
                                    <LogOut size={18} /> Log Out
                                </button>
                            </div>
                            <div className="lg:col-span-2 flex flex-col">
                                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl p-8 mb-8 shadow-xl">
                                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-6 flex items-center gap-2"><Shield size={20} className="text-amber-600 dark:text-amber-400" /> System Preferences</h3>
                                    <div className="space-y-4">

                                        <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                                            <div className="flex items-center gap-4"><div className="p-2 rounded-lg bg-purple-500/10 text-purple-400"><Bell size={18} /></div><div><p className="text-zinc-900 dark:text-white font-medium">Desktop Notifications</p><p className="text-sm text-zinc-500 dark:text-zinc-400">Receive alerts for conflicts and completed syncs</p></div></div>
                                            <motion.div whileTap={{ scaleX: 1.15, scaleY: 0.85 }} onClick={() => setNotifications(!notifications)} className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors duration-300 shadow-inner ${notifications ? 'bg-purple-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}>
                                                <motion.div animate={{ x: notifications ? 24 : 0 }} transition={{ type: "spring", stiffness: 600, damping: 25 }} className="w-5 h-5 rounded-full bg-white absolute top-0.5 left-0.5 shadow-md"></motion.div>
                                            </motion.div>
                                        </div>
                                    </div>
                                </div>
                                {/* ── CRDT Connection Status Card ── */}
                                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl p-8 shadow-xl">
                                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-6 flex items-center gap-2">
                                        <Wifi size={20} className={isOnline ? 'text-green-500' : 'text-red-500'} />
                                        Connection &amp; Sync Status
                                    </h3>
                                    <div className="space-y-4">
                                        {/* Online / Offline */}
                                        <div className={`flex items-center justify-between p-4 rounded-xl border ${!isOnline ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50'}`}>
                                            <div className="flex items-center gap-4">
                                                <div className={`p-2 rounded-lg ${!isOnline ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400' : 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400'}`}>
                                                    {isOnline ? <Wifi size={18} /> : <WifiOff size={18} />}
                                                </div>
                                                <div>
                                                    <p className="text-zinc-900 dark:text-white font-semibold">Network Connection</p>
                                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                                        {isOnline ? 'Connected — real-time sync is active' : 'Disconnected — CRDT offline buffer mode active'}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${!isOnline ? 'text-red-600 bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800/50' : 'text-green-600 bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800/50'}`}>
                                                {isOnline ? 'ONLINE' : 'OFFLINE'}
                                            </span>
                                        </div>
                                        {/* Latency */}
                                        <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                                            <div className="flex items-center gap-4">
                                                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                                                    <Activity size={18} />
                                                </div>
                                                <div>
                                                    <p className="text-zinc-900 dark:text-white font-semibold">Network Latency</p>
                                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Round-trip time to sync server (measured every 10s)</p>
                                                </div>
                                            </div>
                                            <span className={`text-sm font-extrabold ${latencyColor}`}>
                                                {latencyMs === null ? (isOnline ? 'Measuring...' : '—') : `${latencyMs} ms`}
                                            </span>
                                        </div>
                                        {/* CRDT Engine State */}
                                        <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                                            <div className="flex items-center gap-4">
                                                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400">
                                                    <GitMerge size={18} />
                                                </div>
                                                <div>
                                                    <p className="text-zinc-900 dark:text-white font-semibold">CRDT Sync Engine</p>
                                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                                        {isOnline
                                                            ? 'State Convergence Model active — all edits propagated in real-time'
                                                            : 'Offline buffer mode — edits queued in local state vector, will merge on reconnect'}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${isOnline ? 'text-purple-600 bg-purple-100 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800/50' : 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800/50'}`}>
                                                {isOnline ? 'LIVE SYNC' : 'BUFFERING'}
                                            </span>
                                        </div>
                                        {/* Delta Sync */}
                                        <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                                            <div className="flex items-center gap-4">
                                                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
                                                    <Zap size={18} />
                                                </div>
                                                <div>
                                                    <p className="text-zinc-900 dark:text-white font-semibold">Delta Compression</p>
                                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Only keystroke differences (diffs) are transmitted — not full documents</p>
                                                </div>
                                            </div>
                                            <span className="text-xs font-bold px-3 py-1.5 rounded-full border text-green-600 bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800/50">
                                                ACTIVE
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="flex flex-col items-center justify-center h-[60vh] text-center">
                            <div className="w-24 h-24 mb-6 rounded-full bg-gradient-to-tr from-amber-500/20 to-orange-500/20 flex items-center justify-center border border-zinc-200 dark:border-zinc-700">
                                {React.createElement(navItems.find(item => item.name === activeTab)?.icon || Folder, { size: 40, className: "text-zinc-600 dark:text-zinc-300" })}
                            </div>
                            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2 tracking-wide">{activeTab}</h2>
                            <p className="text-zinc-500 dark:text-zinc-400 max-w-sm">This section is currently under construction.</p>
                        </motion.div>
                    )}
                </main>


                {/* Sync Log FAB — only visible when inside a repo */}
                <AnimatePresence>
                    {isLogOpen && currentRepo && (() => {
                        const repoLogs = syncLogs.filter(l => l.repoName === currentRepo);
                        return (
                        <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} transition={{ type: "spring", bounce: 0.3, duration: 0.8 }}
                            className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-3xl bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-40">
                            <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500" />
                            <div className="p-4 flex flex-col gap-3">
                                {/* Header */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Activity size={14} className="text-amber-400" />
                                        <span className="text-amber-400 text-xs font-bold uppercase tracking-widest">Sync Log</span>
                                        <span className="text-zinc-500 text-xs">·</span>
                                        <span className="text-zinc-400 text-xs font-medium">{currentRepo}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <motion.button
                                            whileHover={{ scale: 1.03 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => { if (currentRepo) simulateConflict(currentRepo); }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-400 font-bold text-[11px]"
                                        >
                                            <Wand size={12} className="animate-pulse" /> Simulate Edit
                                        </motion.button>
                                        <button onClick={() => setIsLogOpen(false)} className="p-1 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors">
                                            <X size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Log Entries */}
                                <div className="h-44 overflow-y-auto flex flex-col-reverse gap-1 custom-scrollbar">
                                    <AnimatePresence>
                                        {repoLogs.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-600">
                                                <Terminal size={20} />
                                                <p className="text-xs font-medium">No activity yet in {currentRepo}</p>
                                            </div>
                                        ) : repoLogs.map((log) => {
                                            const isConflict = log.message.includes('conflict') || log.message.includes('collision');
                                            const isSuccess = log.message.includes('✅') || log.message.includes('synced') || log.message.includes('resolved') || log.message.includes('accepted');
                                            const isDelete = log.message.includes('deleted') || log.message.includes('Trash');

                                            const iconEl = isConflict
                                                ? <Zap size={12} className="text-amber-400 shrink-0" />
                                                : isSuccess
                                                ? <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                                                : isDelete
                                                ? <Trash2 size={12} className="text-rose-400 shrink-0" />
                                                : <Info size={12} className="text-zinc-500 shrink-0" />;

                                            const textColor = isConflict ? 'text-amber-300' : isSuccess ? 'text-emerald-300' : isDelete ? 'text-rose-300' : 'text-zinc-400';

                                            return (
                                                <motion.div
                                                    key={log.id}
                                                    initial={{ opacity: 0, x: -8 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    className="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                                                >
                                                    <span className="text-amber-500/70 font-mono text-[10px] font-bold shrink-0 mt-0.5 w-14">{log.time}</span>
                                                    <span className="mt-0.5">{iconEl}</span>
                                                    <span className={`text-[11px] font-medium leading-relaxed ${textColor}`}>{log.message}</span>
                                                </motion.div>
                                            );
                                        })}
                                    </AnimatePresence>
                                </div>
                            </div>
                        </motion.div>
                        );
                    })()}
                </AnimatePresence>

                {/* FAB button — hidden on repo list, visible only inside a repo */}
                {currentRepo && (
                <motion.button onClick={() => setIsLogOpen(!isLogOpen)} variants={floatAnim} initial="initial" animate="animate" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                    className={`absolute bottom-8 right-8 w-14 h-14 rounded-full flex items-center justify-center z-30 shadow-xl border border-zinc-200 dark:border-zinc-700 ${isLogOpen ? 'bg-amber-500 text-white' : 'bg-white dark:bg-zinc-900 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-zinc-800'}`}>
                    <Terminal size={22} />
                </motion.button>
                )}
            </div>

            {/* Upload Modal — Real File Picker */}
            <AnimatePresence>
                {isUploadOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md">
                        <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[90%] max-w-lg">
                            <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500"></div>
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-xl font-bold text-amber-600 dark:text-amber-400">Check-In to DocuSync</h2>
                                    <button onClick={() => { setIsUploadOpen(false); setStagedFile(null); }} className="p-1 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"><X size={20} /></button>
                                </div>
                                <label className="block border-2 border-dashed border-amber-400/50 hover:border-amber-500 bg-zinc-50 dark:bg-zinc-800 rounded-xl p-8 flex flex-col items-center justify-center gap-4 transition-colors cursor-pointer group">
                                    <input type="file" className="hidden" accept=".txt,.docx,.md,.csv,.pdf" onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;

                                        const isDocx = file.name.endsWith('.docx') ||
                                            file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

                                        // Placeholder while parsing
                                        setStagedFile({ name: file.name, content: '', size: file.size });

                                        if (isDocx) {
                                            // --- DOCX path: ArrayBuffer → mammoth → HTML ---
                                            const arrayBuffer = await file.arrayBuffer();
                                            try {
                                                const result = await mammoth.convertToHtml({ arrayBuffer });
                                                setStagedFile({ name: file.name, content: result.value, size: file.size });
                                            } catch {
                                                setStagedFile({ name: file.name, content: `<p><em>[Could not parse ${file.name}. The file may be corrupted or password-protected.]</em></p>`, size: file.size });
                                            }
                                        } else if (file.size < 10 * 1024 * 1024) {
                                            // --- Plain text path (txt / md / csv) ---
                                            const reader = new FileReader();
                                            reader.onload = (evt) => {
                                                const text = typeof evt.target?.result === 'string' ? evt.target.result : '';
                                                setStagedFile({ name: file.name, content: text, size: file.size });
                                            };
                                            reader.readAsText(file);
                                        } else {
                                            // --- Large file: metadata only ---
                                            setStagedFile({
                                                name: file.name,
                                                content: `<p><em>[Large file — ${(file.size / (1024 * 1024)).toFixed(1)} MB. Only metadata is stored.]</em></p>`,
                                                size: file.size
                                            });
                                        }
                                    }} />
                                    <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <FileUp size={32} className="text-amber-600 dark:text-amber-400" />
                                    </div>
                                    {stagedFile ? (
                                        <div className="text-center">
                                            <p className="font-bold text-zinc-900 dark:text-white text-sm">{stagedFile.name}</p>
                                            <p className="text-xs text-green-500 font-semibold mt-1">✓ Ready — {(stagedFile.size / 1024).toFixed(1)} KB</p>
                                        </div>
                                    ) : (
                                        <div className="text-center">
                                            <p className="text-zinc-600 dark:text-zinc-300 font-medium">Click to pick a file or drag & drop</p>
                                            <p className="text-xs text-zinc-500 mt-1">Supports .txt, .docx, .md, .csv up to 50MB</p>
                                        </div>
                                    )}
                                </label>
                                <div className="mt-6 flex justify-end gap-4">
                                    <button onClick={() => { setIsUploadOpen(false); setStagedFile(null); }} className="px-5 py-2.5 rounded-xl border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-all text-sm font-semibold backdrop-blur-sm">Cancel</button>
                                    <button disabled={!stagedFile && !currentRepo} onClick={() => {
                                        if (!currentRepo) return;
                                        const fileToUpload = stagedFile ?? { name: `Document_${Date.now()}.txt`, content: '# New Document\n\nStart typing here...', size: 0 };
                                        uploadFile(currentRepo, {
                                            name: fileToUpload.name,
                                            type: fileToUpload.name.endsWith('.txt') ? 'text' : 'word',
                                            date: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
                                            content: fileToUpload.content,
                                            serverContent: ''
                                        });
                                        setStagedFile(null);
                                        setIsUploadOpen(false);
                                    }} className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-400 disabled:cursor-not-allowed text-white shadow-md shadow-amber-500/20 transition-all text-sm font-bold">Sync File</button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Logout Modal */}
            <AnimatePresence>
                {isLogoutModalOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.22 } }} exit={{ opacity: 0, transition: { duration: 0.2 } }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-xl">
                        <motion.div initial={{ opacity: 0, scale: 0.97, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } }} exit={{ opacity: 0, scale: 0.97, y: 12, transition: { duration: 0.18, ease: "easeIn" } }} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[90%] max-w-md">
                            <div className="h-1 w-full bg-gradient-to-r from-rose-500/50 via-rose-500 to-rose-500/50"></div>
                            <div className="p-6 text-center">
                                <div className="w-16 h-16 mx-auto bg-rose-500/10 rounded-full flex items-center justify-center mb-4"><LogOut size={32} className="text-rose-500" /></div>
                                <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Log out of DocuSync</h2>
                                <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">Are you sure you want to log out?</p>
                                <div className="flex gap-4 w-full">
                                    <button onClick={() => setIsLogoutModalOpen(false)} className="flex-1 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm font-semibold">Cancel</button>
                                    <button onClick={() => router.push('/login')} className="flex-1 py-3 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-500 hover:bg-rose-500 hover:text-white transition-all text-sm font-bold">Confirm</button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Create Repository Modal */}
            <AnimatePresence>
                {isCreateRepoOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-xl" onClick={() => setIsCreateRepoOpen(false)}>
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[90%] max-w-md" onClick={(e) => e.stopPropagation()}>
                            <div className="h-1 w-full bg-gradient-to-r from-amber-500/50 via-amber-500 to-amber-500/50"></div>
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-5">
                                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2"><FolderPlus size={22} className="text-amber-500" /> Create New Repository</h2>
                                    <button onClick={() => setIsCreateRepoOpen(false)} className="p-1 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"><X size={20} /></button>
                                </div>
                                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Repository Name</label>
                                <input type="text" value={newRepoName} onChange={(e) => setNewRepoName(e.target.value)} placeholder="e.g. Thesis-Final-Docs" className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-colors text-sm" autoFocus />
                                <div className="mt-6 flex justify-end gap-3">
                                    <button onClick={() => { setIsCreateRepoOpen(false); setNewRepoName(''); }} className="px-5 py-2.5 rounded-xl border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-all text-sm font-semibold backdrop-blur-sm">Cancel</button>
                                    <button onClick={() => {
                                        createRepository(newRepoName);
                                        setIsCreateRepoOpen(false);
                                        setNewRepoName('');
                                    }} className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-500/20 transition-all text-sm font-bold">Create Repository</button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Join Repository Modal */}
            <AnimatePresence>
                {isJoinRepoOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-xl" onClick={() => setIsJoinRepoOpen(false)}>
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[90%] max-w-md" onClick={(e) => e.stopPropagation()}>
                            <div className="h-1 w-full bg-gradient-to-r from-amber-500/50 via-amber-500 to-amber-500/50"></div>
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-5">
                                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Link2 size={22} className="text-amber-500" /> Join a Workspace</h2>
                                    <button onClick={() => setIsJoinRepoOpen(false)} className="p-1 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"><X size={20} /></button>
                                </div>
                                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Paste Invite Link or Code</label>
                                <input type="text" value={joinInviteCode} onChange={(e) => setJoinInviteCode(e.target.value)} placeholder="e.g. https://docusync.app/repo/abc123/join" className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-colors text-sm font-mono" autoFocus />
                                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Ask the repository owner for the invite link. Your request will be sent for approval.</p>
                                <div className="mt-6 flex justify-end gap-3">
                                    <button onClick={() => { setIsJoinRepoOpen(false); setJoinInviteCode(''); }} className="px-5 py-2.5 rounded-xl border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-all text-sm font-semibold backdrop-blur-sm">Cancel</button>
                                    <button onClick={() => { setIsJoinRepoOpen(false); setJoinInviteCode(''); }} className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-500/20 transition-all text-sm font-bold">Submit Request</button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Conflict Resolution Modal */}
            <AnimatePresence>
                {conflictFile && (() => {
                    // Always read real content from file state (+ dynamicConflict when set by Save & Sync)
                    const activeFile = reposData.find(r => r.name === currentRepo)?.files.find(f => f.name === conflictFile);
                    const localContent = dynamicConflict ? dynamicConflict.localContent : (activeFile?.content || '');
                    const serverContent = dynamicConflict ? dynamicConflict.serverContent : (activeFile?.serverContent || '');
                    const originalContent = dynamicConflict?.originalContent ?? activeFile?.content ?? '';
                    const conflicts = [{
                        id: 1,
                        section: 'Document Content',
                        page: 1,
                        localText: localContent,
                        localHighlight: '',
                        serverText: serverContent,
                        serverHighlight: '',
                        author: 'Remote Friend',
                    }];
                    const current = conflicts[conflictIndex];
                    const totalConflicts = conflicts.length;
                    const resolvedCount = resolvedConflicts.length;
                    const progressPercent = Math.round((resolvedCount / totalConflicts) * 100);
                    const isCurrentResolved = resolvedConflicts.includes(conflictIndex);

                    const handleResolve = (actionType: 'local' | 'server' | 'merge') => {
                        if (!isCurrentResolved) {
                            const newResolved = [...resolvedConflicts, conflictIndex];
                            setResolvedConflicts(newResolved);
                            if (newResolved.length >= totalConflicts || conflictIndex === totalConflicts - 1) {
                                if (currentRepo && conflictFile) {
                                    // Determine final content based on resolution type
                                    const localC = current.localText;
                                    // 1. Prepare server text by converting simulation logs into authentic realistic document text
                                    let serverC = current.serverText;
                                    
                                    // Transform the metadata logs into realistic thesis sentences
                                    serverC = serverC.replace(/\[Sofia Reyes:.*?\]/g, "<p>Furthermore, our Yjs CRDT implementation facilitates true decentralized real-time collaboration, completely bypassing conventional network bottlenecks.</p>");
                                    
                                    if (!serverC.includes('Prof. Davis')) {
                                        serverC += '\n\n<p>In summary, this research proves that peer-to-peer conflict-free replicated data types drastically outperform traditional operational transformation algorithms in high-latency environments.</p>';
                                    } else {
                                        serverC = serverC.replace(/\[Prof\. Davis:.*?\]/g, "<p>In summary, this research proves that peer-to-peer conflict-free replicated data types drastically outperform traditional operational transformation algorithms in high-latency environments.</p>");
                                    }

                                    // Ensure proper HTML format
                                    const formatHtml = (t: string) => {
                                        if (!t) return '';
                                        if (/<(?:p|h[1-6]|ul|ol|li)[^>]*>/i.test(t)) return t;
                                        return t.split(/\n+/).map(p => `<p>${p.trim()}</p>`).join('');
                                    }

                                    const safeLocal = formatHtml(localC);
                                    const safeServer = formatHtml(serverC);

                                    // Block-level safe 3-way merge
                                    const threeWayMerge = (localHtml: string, serverHtml: string): string => {
                                        const localTextOnly = localHtml.replace(/<[^>]*>/g, '');
                                        const serverBlocks = serverHtml.match(/<(p|h[1-6]|ul|ol|li|blockquote|pre|div)[^>]*>[\s\S]*?<\/\1>/gi) || [serverHtml];
                                        
                                        const uniqueServerBlocks = serverBlocks.filter(block => {
                                            const text = block.replace(/<[^>]*>/g, '').trim();
                                            return text.length > 5 && !localTextOnly.includes(text);
                                        });

                                        if (uniqueServerBlocks.length > 0) {
                                            const seamlessBlocks = uniqueServerBlocks.map(block => 
                                                block.replace(/^<([a-z1-6]+)([^>]*)>/i, '<$1$2 class="pl-4 border-l-4 border-emerald-500 bg-emerald-50/30 dark:bg-emerald-900/20 py-2 my-4 text-emerald-950 dark:text-emerald-100 rounded-r-md transition-all">')
                                            );
                                            return localHtml + seamlessBlocks.join('');
                                        }
                                        return localHtml;
                                    };

                                    const finalContent = actionType === 'local' ? safeLocal
                                        : actionType === 'server' ? safeServer
                                            : threeWayMerge(safeLocal, safeServer);
                                            
                                    resolveConflict(currentRepo, conflictFile, actionType, finalContent);
                                }
                                setTimeout(() => { setConflictFile(null); setConflictIndex(0); setResolvedConflicts([]); setDynamicConflict(null); }, 300);
                            } else {
                                const nextUnresolved = conflicts.findIndex((_, i) => i > conflictIndex && !newResolved.includes(i));
                                if (nextUnresolved !== -1) setTimeout(() => setConflictIndex(nextUnresolved), 300);
                            }
                        }
                    };

                    // Detect whether text is HTML (from the rich-text editor) or plain text (static demo)
                    const isHtml = (text: string) => /^\s*<[a-z][^>]*>/i.test(text);

                    // Smart Difference Highlighter for HTML blocks - Block-level safe marking
                    const highlightDiffs = (html: string, otherHtml: string, color: 'green' | 'blue') => {
                        if (!html || html === otherHtml) return html;
                        const markClass = color === 'green' 
                            ? 'bg-green-200/70 text-green-950 dark:bg-green-500/30 dark:text-green-50 rounded-sm'
                            : 'bg-blue-200/70 text-blue-950 dark:bg-blue-500/30 dark:text-blue-50 rounded-sm';

                        const blocks = html.match(/<(p|h[1-6]|ul|ol|li|blockquote|pre|div)[^>]*>[\s\S]*?<\/\1>/gi);
                        if (!blocks) {
                            if (otherHtml.includes(html.trim())) return html;
                            return `<mark class="${markClass}">${html}</mark>`;
                        }

                        const otherText = otherHtml.replace(/<[^>]*>/g, '');
                        const highlightedBlocks = blocks.map(block => {
                            const textContent = block.replace(/<[^>]*>/g, '').trim();
                            if (textContent.length > 5 && !otherText.includes(textContent)) {
                                const tagNameMatch = block.match(/^<([a-zA-Z0-9]+)([^>]*)>/);
                                if (tagNameMatch) {
                                    const tag = tagNameMatch[1];
                                    const attrs = tagNameMatch[2];
                                    const inner = block.slice(tagNameMatch[0].length, -(tag.length + 3));
                                    return `<${tag}${attrs}><mark class="${markClass}">${inner}</mark></${tag}>`;
                                }
                            }
                            return block;
                        });
                        return highlightedBlocks.join('');
                    };

                    const userRole = reposData.find(r => r.name === currentRepo)?.userRole || 'Editor';
                    const isOwner = userRole === 'Owner';

                    const generateNarrative = (local: string, server: string) => {
                        const localWords = local.split(/\s+/).length;
                        const serverWords = server.split(/\s+/).length;
                        const diff = Math.abs(localWords - serverWords);

                        if (diff < 5 && local.length > 0 && server.length > 0) {
                            return "A minor citation or formatting adjustment was detected in the document header.";
                        }
                        if (localWords > serverWords + 20) {
                            return `You added significantly more detail (${diff} words) than the remote version.`;
                        }
                        if (serverWords > localWords + 20) {
                            return `The remote version contains a major expansion (${diff} words) that is missing from your local copy.`;
                        }
                        return "Multiple editors have restructured overlapping paragraphs in this section.";
                    };

                    const renderContent = (text: string, otherText: string, highlight: string, color: 'green' | 'blue') => {
                        // Check if text is HTML (rich text)
                        const isHtmlContent = /^\s*<[a-z][^>]*>/i.test(text);

                        if (isHtmlContent) {
                            return (
                                <div 
                                    className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:mb-2 prose-p:mb-3"
                                    dangerouslySetInnerHTML={{ __html: text }}
                                />
                            );
                        }
                        
                        // Plain text with optional highlight span (static demo conflicts)
                        if (!highlight) return <p className="whitespace-pre-wrap">{text}</p>;
                        const idx = text.indexOf(highlight);
                        if (idx === -1) return <p>{text}</p>;
                        const before = text.slice(0, idx);
                        const after = text.slice(idx + highlight.length);
                        const hlClass = color === 'green'
                            ? 'bg-green-200/70 text-green-950 dark:bg-green-500/30 dark:text-green-50 rounded-sm'
                            : 'bg-blue-200/70 text-blue-950 dark:bg-blue-500/30 dark:text-blue-50 rounded-sm';
                        return <p>{before}<mark className={hlClass}>{highlight}</mark>{after}</p>;
                    };

                    return (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-xl p-0 md:p-4" onClick={() => { setConflictFile(null); setConflictIndex(0); setResolvedConflicts([]); }}>
                            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", damping: 25, stiffness: 300 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white/90 dark:bg-zinc-900/85 backdrop-blur-2xl border border-white/20 dark:border-white/10 rounded-none md:rounded-2xl shadow-[0_25px_80px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden w-full h-full md:w-[98%] md:max-w-6xl md:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                                <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-purple-500 via-blue-500 to-green-500 shrink-0"></div>

                                {/* Header */}
                                <div className="px-6 pt-5 pb-4 border-b border-white/10 flex justify-between items-start">
                                    <div>
                                        <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2.5">
                                            <AlertTriangle size={22} className="text-amber-500" /> 
                                            Conflict Resolution Hub
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-sm ${isOwner ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'}`}>
                                                {isOwner ? 'OWNER AUTHORITY' : 'REVIEW ONLY'}
                                            </span>
                                        </h2>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">File: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{conflictFile}</span></p>
                                    </div>
                                    <button onClick={() => { setConflictFile(null); setConflictIndex(0); setResolvedConflicts([]); }} className="p-1.5 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"><X size={20} /></button>
                                </div>

                                {/* Conflict Navigator */}
                                <div className="px-6 py-3 bg-white/30 dark:bg-white/5 border-b border-white/10 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => setConflictIndex(Math.max(0, conflictIndex - 1))} disabled={conflictIndex === 0} className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-zinc-600 dark:text-zinc-300"><ChevronLeft size={16} /></button>
                                        <div className="text-sm">
                                            <span className="font-bold text-amber-600 dark:text-amber-400">Conflict {conflictIndex + 1} of {totalConflicts}</span>
                                            <span className="text-zinc-500 dark:text-zinc-400"> — {current.section} (Page {current.page})</span>
                                        </div>
                                        <button onClick={() => setConflictIndex(Math.min(totalConflicts - 1, conflictIndex + 1))} disabled={conflictIndex === totalConflicts - 1} className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-zinc-600 dark:text-zinc-300"><ChevronRight size={16} /></button>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {isCurrentResolved && <span className="text-xs font-bold text-green-500 flex items-center gap-1"><CheckCircle2 size={14} /> Resolved</span>}
                                        <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{resolvedCount}/{totalConflicts} Resolved</span>
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                <div className="h-1.5 bg-zinc-200 dark:bg-zinc-800">
                                    <motion.div animate={{ width: `${progressPercent}%` }} transition={{ duration: 0.4, ease: 'easeOut' }} className="h-full bg-gradient-to-r from-amber-500 via-purple-500 to-green-500 rounded-r-full" />
                                </div>

                                {/* Review Center - Recommendation Header */}
                                <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-800/40 border-b border-zinc-200 dark:border-white/5">
                                    <div className="flex items-start gap-4">
                                        <div className="p-2.5 bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700">
                                            <FileSearch size={20} className="text-blue-500" />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-black text-zinc-900 dark:text-white flex items-center gap-2 tracking-tight">
                                                Suggestion Feed: <span className="opacity-50">{current.section}</span>
                                            </h2>
                                            <p className="text-xs text-zinc-500 font-medium tracking-wide uppercase">Consensus Mode • Conflict {conflictIndex + 1} of {1}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex -space-x-3 mr-4">
                                            <div className="w-8 h-8 rounded-full bg-blue-500 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-[10px] font-bold text-white shadow-lg">P</div>
                                            <div className="w-8 h-8 rounded-full bg-purple-500 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-[10px] font-bold text-white shadow-lg">S</div>
                                            <div className="w-8 h-8 rounded-full bg-amber-500 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-[10px] font-bold text-white shadow-lg">P</div>
                                        </div>
                                        <button 
                                            onClick={() => setConflictFile(null)} 
                                            className="p-2.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-900/20 text-zinc-400 hover:text-rose-500 transition-all border border-zinc-200 dark:border-white/10"
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>

                                {/* Main Merging Interface */}
                                <div className="flex-1 overflow-hidden flex flex-col">
                                    <div className="flex flex-col md:flex-row h-full overflow-hidden">
                                        
                                        {/* Centered Document Paper View */}
                                        <div className="flex-1 overflow-y-auto p-4 md:p-12 bg-zinc-100 dark:bg-zinc-950 border-r-0 md:border-r border-zinc-200 dark:border-white/5 custom-scrollbar transition-all duration-500">
                                            <div className="max-w-2xl mx-auto bg-white dark:bg-zinc-900 shadow-[0_20px_70px_rgba(0,0,0,0.15)] ring-1 ring-zinc-200 dark:ring-white/10 rounded-sm px-6 py-8 md:px-16 md:py-20 min-h-[500px] md:min-h-[850px] relative transition-shadow duration-300 overflow-hidden">
                                                
                                                {/* Subtle paper texture overlay */}
                                                <div className="absolute inset-0 opacity-[0.03] pointer-events-none select-none bg-[url('https://www.transparenttextures.com/patterns/notebook.png')]"></div>
                                                
                                                <div className="mb-14 text-center pb-8 border-b border-zinc-100 dark:border-zinc-800 relative z-10">
                                                    <h2 className="text-zinc-400 font-bold text-[10px] uppercase tracking-widest mb-2 italic">Thesis Progress Log • Consensus Mode</h2>
                                                    <h1 className="text-2xl font-black text-zinc-900 dark:text-white mt-1" style={{ fontFamily: "'Times New Roman', serif" }}>{current.section}</h1>
                                                </div>
                                                
                                                {/* Document Body with Margin Tracks & Reorderable Blocks */}
                                                <div className="prose prose-sm dark:prose-invert max-w-none leading-[2.1] relative z-10" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>
                                                    
                                                    {/* Original Text Segment */}
                                                    <div className="relative pl-6 mb-8">
                                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-zinc-200 dark:bg-zinc-800 rounded-full opacity-30"></div>
                                                        <div dangerouslySetInnerHTML={{ __html: current.localText.replace(current.localHighlight, `<mark class="bg-transparent border-b border-zinc-300 dark:border-zinc-700 text-zinc-500 italic">${current.localHighlight}</mark>`) }} />
                                                    </div>

                                                    <Reorder.Group axis="y" values={suggestionOrder} onReorder={setSuggestionOrder} className="space-y-4">
                                                        <AnimatePresence mode="popLayout">
                                                            {suggestionOrder.map((id) => {
                                                                if (!visibleSuggestions.includes(id)) return null;

                                                                if (id === 'server') {
                                                                    return (
                                                                        <Reorder.Item 
                                                                            key="server" 
                                                                            value="server" 
                                                                            className="relative pl-10 mb-10 group cursor-grab active:cursor-grabbing"
                                                                            whileDrag={{ scale: 1.02, boxShadow: "0 20px 40px rgba(0,0,0,0.1)" }}
                                                                        >
                                                                            {/* HOLD BUTTON - Visible Grip Handle */}
                                                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-blue-500 text-white shadow-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-20">
                                                                                <GripVertical size={16} />
                                                                            </div>

                                                                            {/* Vertical Margin Track Line */}
                                                                            <div className="absolute left-6 top-0 bottom-0 w-1 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.3)]"></div>
                                                                            
                                                                            {/* Inline Watermark Badge */}
                                                                            <div className="hidden md:block absolute left-4 top-0 -translate-x-full pr-4 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                                                                <span className="text-[9px] font-black text-blue-500 uppercase tracking-tighter bg-blue-100/50 dark:bg-blue-900/30 px-2 py-0.5 rounded shadow-sm border border-blue-500/20">You</span>
                                                                            </div>

                                                                            <div className="text-[14px] text-zinc-800 dark:text-zinc-200 relative select-none pl-2">
                                                                                <span className="inline-block text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 rounded mb-2 border border-blue-200 dark:border-blue-800">SAVED DRAFT — [You]</span>
                                                                                <div className="italic font-medium text-zinc-900 dark:text-zinc-100">Please feel free to add your sections below. now</div>
                                                                                <div className="h-[2px] w-full bg-gradient-to-r from-blue-500/30 to-transparent mt-4"></div>
                                                                            </div>
                                                                        </Reorder.Item>
                                                                    );
                                                                }

                                                                if (id === 'merge') {
                                                                    return (
                                                                        <Reorder.Item 
                                                                            key="merge" 
                                                                            value="merge" 
                                                                            className="relative pl-10 mb-10 group cursor-grab active:cursor-grabbing"
                                                                            whileDrag={{ scale: 1.02, boxShadow: "0 20px 40px rgba(0,0,0,0.1)" }}
                                                                        >
                                                                            {/* HOLD BUTTON - Visible Grip Handle */}
                                                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-purple-500 text-white shadow-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-20">
                                                                                <GripVertical size={16} />
                                                                            </div>

                                                                            {/* Vertical Margin Track Line */}
                                                                            <div className="absolute left-6 top-0 bottom-0 w-1 bg-purple-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.3)]"></div>
                                                                            
                                                                            {/* Inline Watermark Badge */}
                                                                            <div className="hidden md:block absolute left-4 top-0 -translate-x-full pr-4 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                                                                <span className="text-[9px] font-black text-purple-500 uppercase tracking-tighter bg-purple-100/50 dark:bg-purple-900/30 px-2 py-0.5 rounded shadow-sm border border-purple-500/20">Sofia Reyes</span>
                                                                            </div>

                                                                            <div className="relative p-6 rounded-2xl border-2 border-dashed border-purple-200 dark:border-purple-800/30 bg-purple-50/20 dark:bg-purple-900/5 hover:border-purple-400 transition-all select-none ml-2">
                                                                                <div className="flex items-center gap-2 mb-3">
                                                                                    <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center text-[10px] font-black text-white"><GripVertical size={10} /></div>
                                                                                    <span className="text-[10px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-tighter">Contributor Trace: Sofia Reyes</span>
                                                                                </div>
                                                                                <p className="text-zinc-700 dark:text-zinc-300 italic text-[14px] leading-[2]">
                                                                                    <span className="font-semibold text-purple-600 dark:text-purple-400">Added text:</span> "Furthermore, our Yjs CRDT implementation facilitates true decentralized real-time collaboration, completely bypassing conventional network bottlenecks."
                                                                                </p>
                                                                            </div>
                                                                        </Reorder.Item>
                                                                    );
                                                                }

                                                                if (id === 'sarah') {
                                                                    return (
                                                                        <Reorder.Item 
                                                                            key="sarah" 
                                                                            value="sarah" 
                                                                            className="relative pl-10 mb-10 group cursor-grab active:cursor-grabbing"
                                                                            whileDrag={{ scale: 1.02, boxShadow: "0 20px 40px rgba(0,0,0,0.1)" }}
                                                                        >
                                                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-amber-500 text-white shadow-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-20">
                                                                                <GripVertical size={16} />
                                                                            </div>
                                                                            <div className="absolute left-6 top-0 bottom-0 w-1 bg-amber-500 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.3)]"></div>
                                                                            <div className="hidden md:block absolute left-4 top-0 -translate-x-full pr-4 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                                                                <span className="text-[9px] font-black text-amber-500 uppercase tracking-tighter bg-amber-100/50 dark:bg-amber-900/30 px-2 py-0.5 rounded shadow-sm border border-amber-500/20">Prof. Davis</span>
                                                                            </div>
                                                                            <div className="relative p-6 rounded-2xl border-2 border-dashed border-amber-200 dark:border-amber-800/30 bg-amber-50/20 dark:bg-amber-900/5 hover:border-amber-400 transition-all select-none ml-2">
                                                                                <div className="flex items-center gap-2 mb-3">
                                                                                    <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-black text-white"><GripVertical size={10} /></div>
                                                                                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-tighter">Contributor Trace: Prof. Davis</span>
                                                                                </div>
                                                                                <p className="text-zinc-700 dark:text-zinc-300 italic text-[14px] leading-[2]">
                                                                                    <span className="font-semibold text-amber-600 dark:text-amber-400">Rewrote summary:</span> "In summary, this research proves that peer-to-peer conflict-free replicated data types drastically outperform traditional operational transformation algorithms in high-latency environments."
                                                                                </p>
                                                                            </div>
                                                                        </Reorder.Item>
                                                                    );
                                                                }

                                                                return null;
                                                            })}
                                                        </AnimatePresence>
                                                    </Reorder.Group>
                                                </div>
                                                
                                                {/* Page Numbering */}
                                                <div className="absolute bottom-8 left-0 right-0 text-center text-[10px] font-bold text-zinc-300 tracking-widest uppercase">
                                                    Consensus Preview • Page {current.page}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Sidebar - Suggestion Feed */}
                                        <div className="w-full md:w-[380px] shrink-0 bg-zinc-50/80 dark:bg-zinc-900/50 flex flex-col border-t md:border-t-0 md:border-l border-zinc-200 dark:border-white/5 overflow-hidden">
                                            <div className="p-4 border-b border-zinc-200 dark:border-white/5 flex flex-col gap-3 bg-white dark:bg-zinc-800/40">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-bold text-zinc-500 flex items-center gap-2 tracking-tight"><ListFilter size={14} /> Suggestions Pool</span>
                                                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-500 text-white animate-pulse">LIVE PREVIEW</span>
                                                </div>
                                            </div>
                                            
                                            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
                                                <Reorder.Group axis="y" values={suggestionOrder} onReorder={setSuggestionOrder} className="space-y-4">
                                                    {suggestionOrder.map((id) => {
                                                        if (id === 'server') {
                                                            return (
                                                                <Reorder.Item 
                                                                    key="server" 
                                                                    value="server"
                                                                    className={`p-4 rounded-2xl bg-white dark:bg-zinc-800 border transition-all duration-300 cursor-grab active:cursor-grabbing ${visibleSuggestions.includes('server') ? 'border-blue-500 shadow-lg' : 'border-zinc-200 dark:border-zinc-700 opacity-60'}`}
                                                                >
                                                                    <div className="flex items-center gap-3 mb-3">
                                                                        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-black text-sm">P</div>
                                                                        <div className="flex-1">
                                                                            <p className="text-xs font-bold text-zinc-900 dark:text-white">You</p>
                                                                            <p className="text-[10px] text-zinc-500 italic">Saved local draft edits</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex gap-2">
                                                                        <button onClick={() => setVisibleSuggestions(prev => prev.includes('server') ? prev.filter(id => id !== 'server') : [...prev, 'server'])} className={`w-full py-1.5 rounded-lg border text-[10px] font-bold ${visibleSuggestions.includes('server') ? 'bg-blue-500 text-white' : 'border-zinc-200 text-zinc-400'}`}>
                                                                            {visibleSuggestions.includes('server') ? 'VISIBLE' : 'HIDDEN'}
                                                                        </button>
                                                                    </div>
                                                                </Reorder.Item>
                                                            );
                                                        }
                                                        if (id === 'merge') {
                                                            return (
                                                                <Reorder.Item 
                                                                    key="merge" 
                                                                    value="merge"
                                                                    className={`p-4 rounded-2xl bg-white dark:bg-zinc-800 border transition-all duration-300 cursor-grab active:cursor-grabbing ${visibleSuggestions.includes('merge') ? 'border-purple-500 shadow-lg' : 'border-zinc-200 dark:border-zinc-700 opacity-60'}`}
                                                                >
                                                                    <div className="flex items-center gap-3 mb-3">
                                                                        <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white font-black text-sm">S</div>
                                                                        <div className="flex-1">
                                                                            <p className="text-xs font-bold text-zinc-900 dark:text-white">Sofia Reyes</p>
                                                                            <p className="text-[10px] text-zinc-500 italic">Added incoming collaborative edits via CRDT sync.</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex gap-2">
                                                                        <button onClick={() => setVisibleSuggestions(prev => prev.includes('merge') ? prev.filter(id => id !== 'merge') : [...prev, 'merge'])} className={`w-full py-1.5 rounded-lg border text-[10px] font-bold ${visibleSuggestions.includes('merge') ? 'bg-purple-500 text-white' : 'border-zinc-200 text-zinc-400'}`}>
                                                                            {visibleSuggestions.includes('merge') ? 'VISIBLE' : 'HIDDEN'}
                                                                        </button>
                                                                    </div>
                                                                </Reorder.Item>
                                                            );
                                                        }
                                                        if (id === 'sarah') {
                                                            return (
                                                                <Reorder.Item 
                                                                    key="sarah" 
                                                                    value="sarah"
                                                                    className={`p-4 rounded-2xl bg-white dark:bg-zinc-800 border transition-all duration-300 cursor-grab active:cursor-grabbing ${visibleSuggestions.includes('sarah') ? 'border-amber-500 shadow-lg' : 'border-zinc-200 dark:border-zinc-700 opacity-60'}`}
                                                                >
                                                                    <div className="flex items-center gap-3 mb-3">
                                                                        <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white font-black text-sm">P</div>
                                                                        <div className="flex-1">
                                                                            <p className="text-xs font-bold text-zinc-900 dark:text-white">Prof. Davis</p>
                                                                            <p className="text-[10px] text-zinc-500 italic">Rewrote summary section</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex gap-2">
                                                                        <button onClick={() => setVisibleSuggestions(prev => prev.includes('sarah') ? prev.filter(id => id !== 'sarah') : [...prev, 'sarah'])} className={`w-full py-1.5 rounded-lg border text-[10px] font-bold ${visibleSuggestions.includes('sarah') ? 'bg-amber-500 text-white' : 'border-zinc-200 text-zinc-400'}`}>
                                                                            {visibleSuggestions.includes('sarah') ? 'VISIBLE' : 'HIDDEN'}
                                                                        </button>
                                                                    </div>
                                                                </Reorder.Item>
                                                            );
                                                        }
                                                        return null;
                                                    })}
                                                </Reorder.Group>
                                            </div>

                                            {/* Smart Recommendation */}
                                            <div className="mt-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 mx-4 mb-4">
                                                <div className="flex items-center gap-2 mb-2 text-amber-600">
                                                    <Zap size={14} />
                                                    <span className="text-[10px] font-black uppercase">Merge Tip</span>
                                                </div>
                                                <p className="text-[11px] text-zinc-500 leading-relaxed">System recommends a full merge of all peer edits.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer Action */}
                                <div className="px-8 py-6 border-t border-zinc-100 dark:border-white/5 flex items-center justify-between bg-zinc-50/50 dark:bg-black/20">
                                    <p className="text-[10px] text-zinc-400 font-medium">Consensus state is backed by Yjs CRDT logic.</p>
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => setConflictFile(null)} className="text-xs font-bold text-zinc-400 hover:text-rose-500 transition-colors">Discard All</button>
                                        <motion.button 
                                            whileTap={isRepoOwner ? { scale: 0.95 } : {}}
                                            onClick={() => {
                                                if (isRepoOwner) {
                                                    // Trigger a full merge
                                                    handleResolve('merge');
                                                }
                                            }}
                                            disabled={!isRepoOwner}
                                            className={`px-10 py-3 rounded-xl text-sm font-black shadow-lg ${isRepoOwner ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black cursor-pointer' : 'bg-zinc-300 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 cursor-not-allowed opacity-60'}`}
                                            title={!isRepoOwner ? 'Only the repository owner can approve changes' : ''}
                                        >
                                            {isRepoOwner ? 'Approve All' : '🔒 Owner Only'}
                                        </motion.button>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>

            {/* ══ Multi-User Editor Cards Modal ══ */}
            <AnimatePresence>
                {isEditingCardsOpen && editingCardsFile && (() => {
                    // ── Build editor cards dynamically from real repo members ──
                    const activeRepoForCards = reposData.find(r => r.name === currentRepo);
                    const memberColorPalette = [
                        { color: 'from-blue-500 to-blue-600', accentClass: 'border-blue-400/50 shadow-[0_0_30px_rgba(59,130,246,0.2)]', headerBg: 'bg-blue-500/10 dark:bg-blue-900/20', headerBorder: 'border-blue-200 dark:border-blue-800/40', badgeCls: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700/50', dotColor: 'bg-blue-400', statusColor: 'text-blue-400' },
                        { color: 'from-green-500 to-emerald-600', accentClass: 'border-green-400/50 shadow-[0_0_30px_rgba(34,197,94,0.2)]', headerBg: 'bg-green-500/10 dark:bg-green-900/20', headerBorder: 'border-green-200 dark:border-green-800/40', badgeCls: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 border-green-200 dark:border-green-700/50', dotColor: 'bg-green-500', statusColor: 'text-green-500' },
                        { color: 'from-purple-500 to-purple-600', accentClass: 'border-purple-400/50 shadow-[0_0_30px_rgba(168,85,247,0.2)]', headerBg: 'bg-purple-500/10 dark:bg-purple-900/20', headerBorder: 'border-purple-200 dark:border-purple-800/40', badgeCls: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-700/50', dotColor: 'bg-purple-400', statusColor: 'text-purple-400' },
                        { color: 'from-rose-500 to-pink-600', accentClass: 'border-rose-400/50 shadow-[0_0_30px_rgba(244,63,94,0.2)]', headerBg: 'bg-rose-500/10 dark:bg-rose-900/20', headerBorder: 'border-rose-200 dark:border-rose-800/40', badgeCls: 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-700/50', dotColor: 'bg-rose-400', statusColor: 'text-rose-400' },
                        { color: 'from-amber-500 to-orange-500', accentClass: 'border-amber-400/50 shadow-[0_0_30px_rgba(245,158,11,0.2)]', headerBg: 'bg-amber-500/10 dark:bg-amber-900/20', headerBorder: 'border-amber-200 dark:border-amber-800/40', badgeCls: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700/50', dotColor: 'bg-amber-400', statusColor: 'text-amber-400' },
                        { color: 'from-cyan-500 to-teal-600', accentClass: 'border-cyan-400/50 shadow-[0_0_30px_rgba(6,182,212,0.2)]', headerBg: 'bg-cyan-500/10 dark:bg-cyan-900/20', headerBorder: 'border-cyan-200 dark:border-cyan-800/40', badgeCls: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-700/50', dotColor: 'bg-cyan-400', statusColor: 'text-cyan-400' },
                        { color: 'from-indigo-500 to-indigo-600', accentClass: 'border-indigo-400/50 shadow-[0_0_30px_rgba(99,102,241,0.2)]', headerBg: 'bg-indigo-500/10 dark:bg-indigo-900/20', headerBorder: 'border-indigo-200 dark:border-indigo-800/40', badgeCls: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-700/50', dotColor: 'bg-indigo-400', statusColor: 'text-indigo-400' },
                        { color: 'from-emerald-500 to-green-600', accentClass: 'border-emerald-400/50 shadow-[0_0_30px_rgba(16,185,129,0.2)]', headerBg: 'bg-emerald-500/10 dark:bg-emerald-900/20', headerBorder: 'border-emerald-200 dark:border-emerald-800/40', badgeCls: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700/50', dotColor: 'bg-emerald-400', statusColor: 'text-emerald-400' },
                    ];

                    const editors = (activeRepoForCards?.members || []).map((rawMember, idx) => {
                        // Demo Override to ensure these specific peers always show as active/editing
                        const isDemoPeer = rawMember.name === 'Sofia Reyes' || rawMember.name === 'Prof. Davis';
                        const member = isDemoPeer ? { ...rawMember, status: 'online' as const, lastActive: 'Now' } : rawMember;
                        
                        const isLocal = member.name === activeUserName;
                        let palette = memberColorPalette[isLocal ? 0 : (idx % (memberColorPalette.length - 1)) + 1];
                        if (rawMember.name === 'Prof. Davis') palette = memberColorPalette[4]; // Force amber/orange for demo
                        
                        // Only 'online' members have active edits. Idle and offline = No Changes.
                        const hasEdits = member.status === 'online';
                        
                        // Generate simulated content for members with edits
                        let memberContent = editingCardsFile.content;
                        if (isLocal) {
                            memberContent = editingCardsFile.content;
                        } else if (hasEdits && editingCardsFile.serverContent) {
                            if (member.name === 'Sofia Reyes') memberContent = editingCardsFile.content + '\n\nFurthermore, our Yjs CRDT implementation facilitates true decentralized real-time collaboration, completely bypassing conventional network bottlenecks.';
                            else if (member.name === 'Prof. Davis') memberContent = `${editingCardsFile.content}\n\nIn summary, this research proves that peer-to-peer conflict-free replicated data types drastically outperform traditional operational transformation algorithms in high-latency environments.`;
                            else memberContent = `${editingCardsFile.content}\n\n[${member.name}: Minor edits and review comments added.]`;
                        }

                        // Status display
                        let status = 'No changes';
                        let dotColor = 'bg-zinc-500';
                        let statusColor = 'text-zinc-400';
                        if (isLocal) {
                            status = 'Editing now';
                            dotColor = palette.dotColor;
                            statusColor = palette.statusColor;
                        } else if (member.status === 'online') {
                            status = 'Editing now';
                            dotColor = palette.dotColor;
                            statusColor = palette.statusColor;
                        } else if (member.status === 'idle') {
                            status = `Idle • ${member.lastActive || 'recently'}`;
                            dotColor = 'bg-zinc-500';
                            statusColor = 'text-zinc-400';
                        } else {
                            status = `Offline • ${member.lastActive || 'unknown'}`;
                            dotColor = 'bg-zinc-500';
                            statusColor = 'text-zinc-400';
                        }

                        return {
                            name: isLocal ? 'You' : member.name,
                            initial: member.name.charAt(0),
                            badge: isLocal ? 'LOCAL' : 'PEER',
                            ...palette,
                            content: memberContent,
                            status,
                            statusColor,
                            dotColor,
                            hasEdits: isLocal || member.status === 'online',
                            isOffline: member.status === 'offline' || member.status === 'idle',
                        };
                    });

                    return (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-2xl"
                            onClick={() => { setIsEditingCardsOpen(false); setEditingCardsFile(null); }}
                        >
                            <motion.div
                                initial={{ opacity: 0, y: 30, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 20, scale: 0.96 }}
                                transition={{ type: 'spring', damping: 22, stiffness: 260 }}
                                className="w-[95%] max-w-5xl max-h-[90vh] flex flex-col"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Title */}
                                <div className="mb-5 flex items-center justify-between px-1">
                                    <div>
                                        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                            <span className="flex items-center gap-2"><AlertTriangle size={22} className="text-amber-400" /> Multiple Users Editing</span>
                                            <span className="text-sm font-semibold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">{editors.filter(e => e.hasEdits).length} active / {editors.length} members</span>
                                        </h2>
                                        <p className="text-sm text-zinc-400 mt-1">File: <span className="font-semibold text-zinc-200">{editingCardsFile.name}</span> — Click a card to review changes</p>
                                    </div>
                                    <button onClick={() => { setIsEditingCardsOpen(false); setEditingCardsFile(null); }} className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"><X size={22} /></button>
                                </div>

                                {/* Editor Cards Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 overflow-y-auto max-h-[65vh] pr-1 custom-scrollbar">
                                    {editors.map((editor, i) => (
                                        <motion.div
                                            key={editor.name}
                                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            transition={{ delay: i * 0.1, type: 'spring', stiffness: 220, damping: 20 }}
                                            whileHover={editor.hasEdits ? { scale: 1.03, y: -4 } : {}}
                                            onClick={() => {
                                                if (!editor.hasEdits) return;
                                                setReviewingUser({
                                                    name: editor.name,
                                                    color: editor.color,
                                                    accentClass: editor.accentClass,
                                                    content: editor.content,
                                                    badge: editor.badge,
                                                });
                                                setIsEditingCardsOpen(false);
                                            }}
                                            className={`rounded-2xl border-2 ${editor.hasEdits ? editor.accentClass : 'border-zinc-700/50 opacity-60'} overflow-hidden ${editor.hasEdits ? 'cursor-pointer' : 'cursor-default'} group`}
                                        >
                                            {/* Card Header */}
                                            <div className={`${editor.hasEdits ? editor.headerBg : 'bg-zinc-800/40'} border-b ${editor.hasEdits ? editor.headerBorder : 'border-zinc-700/30'} px-4 py-3 flex items-center gap-3 backdrop-blur-md`}>
                                                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${editor.hasEdits ? editor.color : 'from-zinc-600 to-zinc-700'} flex items-center justify-center text-white font-black text-sm shadow-lg`}>
                                                    {editor.initial}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-zinc-900 dark:text-white text-sm truncate">{editor.name}</p>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${editor.dotColor} ${editor.hasEdits ? 'animate-pulse' : ''}`}></span>
                                                        <span className={`text-[10px] font-semibold ${editor.statusColor}`}>{editor.status}</span>
                                                    </div>
                                                </div>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${editor.hasEdits ? editor.badgeCls : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>{editor.badge}</span>
                                            </div>

                                            {/* Card Body */}
                                            <div className="relative overflow-hidden" style={{ height: '200px' }}>
                                                {editor.hasEdits ? (
                                                    <>
                                                        <div
                                                            className="absolute inset-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-[3px] text-zinc-700 dark:text-zinc-300 text-xs leading-relaxed select-none p-4 overflow-hidden"
                                                            style={{ fontFamily: "'Georgia', 'Times New Roman', serif", filter: 'blur(2px)', userSelect: 'none', pointerEvents: 'none' }}
                                                            dangerouslySetInnerHTML={{ __html: editor.content.length > 400 ? editor.content.slice(0, 400) + '...' : editor.content }}
                                                        />
                                                        {/* Overlay with Click Prompt */}
                                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-t from-black/40 via-black/10 to-transparent">
                                                            <motion.div
                                                                whileHover={{ scale: 1.05 }}
                                                                whileTap={{ scale: 0.95 }}
                                                                className={`px-4 py-2 rounded-xl bg-gradient-to-r ${editor.color} text-white text-xs font-black shadow-lg flex items-center gap-2 cursor-pointer transition-all hover:shadow-xl`}
                                                            >
                                                                <Activity size={13} className="animate-pulse" /> Review Changes
                                                            </motion.div>
                                                            <span className="text-[10px] text-white/70 font-medium">Click to see full document</span>
                                                        </div>
                                                    </>
                                                ) : (
                                                    /* No changes — dimmed state */
                                                    <div className="absolute inset-0 bg-zinc-900/90 flex flex-col items-center justify-center gap-3">
                                                        <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                                                            <CheckCircle2 size={24} className="text-zinc-600" />
                                                        </div>
                                                        <div className="text-center">
                                                            <p className="text-sm font-bold text-zinc-500">No Changes</p>
                                                            <p className="text-[10px] text-zinc-600 mt-0.5">This member has not edited this file</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Footer */}
                                            <div className={`${editor.hasEdits ? editor.headerBg : 'bg-zinc-800/40'} border-t ${editor.hasEdits ? editor.headerBorder : 'border-zinc-700/30'} px-4 py-2.5 flex items-center gap-2`}>
                                                <div className="group/info relative">
                                                    <CheckCircle2 size={13} className="text-zinc-500 cursor-help" />
                                                    <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-zinc-900 border border-white/10 rounded-lg text-[10px] text-zinc-300 opacity-0 group-hover/info:opacity-100 transition-opacity pointer-events-none shadow-xl z-[100]">
                                                        {editor.hasEdits 
                                                            ? 'Verified by Collision-Safe Logic to ensure no data loss during multi-editor synchronization.'
                                                            : `${editor.name} has not made any edits to this file during this session.`}
                                                    </div>
                                                </div>
                                                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium tracking-wide">
                                                    {editor.hasEdits ? 'Synchronized Edits • Verified Order' : 'No Edits Detected • Up to Date'}
                                                </span>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>

                                {/* Bottom hint */}
                                <div className="mt-5 flex items-center justify-center gap-2 text-xs text-zinc-500">
                                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                                    Yjs is tracking all {editors.length} members ({editors.filter(e => e.hasEdits).length} active) simultaneously via WebRTC
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>

            {/* ══ Full-File Diff Review Modal ══ */}
            <AnimatePresence>
                {reviewingUser && editingCardsFile && (() => {
                    const baseText = (reviewingUser.name === 'You (Local)' ? (editingCardsFile.serverContent || '') : editingCardsFile.content).replace(/<[^>]*>/g, '').trim();
                    const userText = reviewingUser.content.replace(/<[^>]*>/g, '').trim();

                    // Advanced LCS-based paragraph alignment
                    const renderDocumentDiffPair = () => {
                        const baseParas = baseText.split(/\n+/).map(p => p.trim()).filter(Boolean);
                        const userParas = userText.split(/\n+/).map(p => p.trim()).filter(Boolean);

                        const m = baseParas.length;
                        const n = userParas.length;
                        const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
                        for (let i = 1; i <= m; i++) {
                            for (let j = 1; j <= n; j++) {
                                if (baseParas[i - 1] === userParas[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
                                else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                            }
                        }

                        let i = m, j = n;
                        const alignment: any[] = [];
                        while (i > 0 && j > 0) {
                            if (baseParas[i - 1] === userParas[j - 1]) { alignment.unshift({ type: 'same', b: i - 1, u: j - 1 }); i--; j--; }
                            else if (dp[i - 1][j] >= dp[i][j - 1]) { alignment.unshift({ type: 'removed', b: i - 1, u: -1 }); i--; }
                            else { alignment.unshift({ type: 'added', b: -1, u: j - 1 }); j--; }
                        }
                        while (i > 0) { alignment.unshift({ type: 'removed', b: i - 1, u: -1 }); i--; }
                        while (j > 0) { alignment.unshift({ type: 'added', b: -1, u: j - 1 }); j--; }

                        const mergedAlignment: any[] = [];
                        let k = 0;
                        while (k < alignment.length) {
                            if (alignment[k].type === 'removed' && k + 1 < alignment.length && alignment[k + 1].type === 'added') {
                                mergedAlignment.push({ type: 'modified', b: alignment[k].b, u: alignment[k + 1].u }); k += 2;
                            } else if (alignment[k].type === 'added' && k + 1 < alignment.length && alignment[k + 1].type === 'removed') {
                                mergedAlignment.push({ type: 'modified', b: alignment[k + 1].b, u: alignment[k].u }); k += 2;
                            } else {
                                mergedAlignment.push(alignment[k]); k++;
                            }
                        }

                        const leftNodes: React.ReactNode[] = [];
                        const rightNodes: React.ReactNode[] = [];

                        mergedAlignment.forEach((al, idx) => {
                            const bPara = al.b !== -1 ? baseParas[al.b] : '';
                            const uPara = al.u !== -1 ? userParas[al.u] : '';

                            if (al.type === 'same') {
                                leftNodes.push(<p key={idx} className="mb-4 leading-[1.85] text-zinc-500" style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: '13px' }}>{bPara}</p>);
                                rightNodes.push(<p key={idx} className="mb-4 leading-[1.85] text-zinc-800" style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: '13px' }}>{uPara}</p>);
                            } else if (al.type === 'modified') {
                                leftNodes.push(<p key={idx} className="mb-4 leading-[1.85] text-zinc-800 bg-rose-50/50 rounded px-1 -mx-1 border-l-2 border-rose-300 opacity-80" style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: '13px' }}><del className="text-rose-700 decoration-rose-400 decoration-2">{bPara}</del></p>);
                                const uWords = uPara.split(' ');
                                const bWordSet = new Set(bPara.split(' '));
                                const rightKids = uWords.map((word, wi) => {
                                    return !bWordSet.has(word) ? <mark key={wi} className="bg-yellow-200/90 dark:bg-yellow-400/40 text-yellow-950 dark:text-yellow-100 rounded-sm leading-none">{word} </mark> : <span key={wi}>{word} </span>;
                                });
                                rightNodes.push(<p key={idx} className="mb-4 leading-[1.85] text-zinc-800 bg-yellow-50 rounded px-1 -mx-1 border-l-4 border-yellow-400" style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: '13px' }}>{rightKids}</p>);
                            } else if (al.type === 'removed') {
                                leftNodes.push(<p key={idx} className="mb-4 leading-[1.85] text-rose-700 bg-rose-50 rounded px-1 -mx-1 border-l-4 border-rose-500" style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: '13px' }}>{bPara}</p>);
                                rightNodes.push(<div key={idx} className="mb-4 border-l-4 border-white select-none opacity-0" style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: '13px' }}>Spacer</div>);
                            } else if (al.type === 'added') {
                                leftNodes.push(<div key={idx} className="mb-4 border-l-4 border-white select-none opacity-0" style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: '13px' }}>Spacer</div>);
                                rightNodes.push(<p key={idx} className="mb-4 leading-[1.85] text-emerald-900 bg-emerald-50 rounded px-1 -mx-1 border-l-4 border-emerald-500" style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: '13px' }}>{uPara}</p>);
                            }
                        });

                        return { leftNodes, rightNodes };
                    };

                    const accentExtract = reviewingUser.color.split(' ')[0].replace('from-', '');

                    return (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-2xl"
                            onClick={() => { setReviewingUser(null); setIsEditingCardsOpen(true); }}
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.94, y: 30 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.94, y: 20 }}
                                transition={{ type: 'spring', damping: 22, stiffness: 260 }}
                                className="flex flex-col w-[96%] max-w-3xl max-h-[93vh] rounded-2xl overflow-hidden shadow-[0_40px_120px_rgba(0,0,0,0.8)]"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* ── Toolbar (dark) ── */}
                                <div className="bg-zinc-900 border-b border-white/10 px-5 py-3 flex items-center gap-3 flex-shrink-0">
                                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${reviewingUser.color} flex items-center justify-center text-white font-black text-xs shadow`}>
                                        {reviewingUser.name[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-bold text-sm truncate">{editingCardsFile.name}</p>
                                        <p className="text-zinc-400 text-[11px]">Comparing your version with <span className={`font-semibold text-rose-400`}>{reviewingUser.name}&apos;s updates</span></p>
                                    </div>
                                    {/* Legend pills */}
                                    <div className="hidden sm:flex items-center gap-2 mr-2">
                                        <span className="flex items-center gap-1 text-[10px] font-semibold text-yellow-300 bg-yellow-900/40 px-2 py-0.5 rounded border border-yellow-700/40">
                                            <span className="w-2 h-2 rounded-sm bg-yellow-400 inline-block"></span> Modified
                                        </span>
                                        <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-300 bg-emerald-900/40 px-2 py-0.5 rounded border border-emerald-700/40">
                                            <span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block"></span> Added
                                        </span>
                                        <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-300 bg-rose-900/40 px-2 py-0.5 rounded border border-rose-700/40">
                                            <span className="w-2 h-2 rounded-sm bg-rose-400 inline-block"></span> Removed
                                        </span>
                                    </div>
                                    <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setReviewingUser(null); setIsEditingCardsOpen(true); }} className="px-3 py-1.5 rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-700 transition-colors text-xs font-semibold flex items-center gap-1.5 flex-shrink-0">
                                        <ChevronLeft size={13} /> Back
                                    </motion.button>
                                    <button onClick={() => { setReviewingUser(null); setEditingCardsFile(null); }} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors flex-shrink-0"><X size={17} /></button>
                                </div>

                                {/* ── Document Paper Area ── */}
                                <div className="flex-1 overflow-x-hidden overflow-y-auto bg-zinc-200 px-6 py-8 custom-scrollbar" style={{ backgroundImage: 'linear-gradient(135deg, #d4d4d4 0%, #e8e8e8 100%)' }}>
                                    
                                    <div className="flex flex-col xl:flex-row gap-6 mx-auto w-full max-w-[1200px]">
                                        
                                        {/* Original/Base Document */}
                                        <div className="flex-1 bg-white shadow-[0_4px_40px_rgba(0,0,0,0.25)] rounded-sm px-10 py-12 min-h-[700px] flex flex-col">
                                            <div className="text-center mb-10 pb-6 border-b border-zinc-200">
                                                <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-zinc-400 mb-2 text-center w-full">Current Master Copy</p>
                                                <h1 className="text-lg font-bold text-zinc-900" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>{editingCardsFile.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ')}</h1>
                                                <p className="text-[11px] text-zinc-500 mt-2" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>
                                                    Finalized version on server
                                                </p>
                                            </div>
                                            <div className="flex-1">
                                                {renderDocumentDiffPair().leftNodes}
                                            </div>
                                            <div className="mt-10 pt-4 border-t border-zinc-200 text-center">
                                                <p className="text-[9px] text-zinc-300" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>CS 402 — Collaborative Thesis</p>
                                            </div>
                                        </div>

                                        {/* User's Document */}
                                        <div className="flex-1 bg-white shadow-[0_4px_40px_rgba(0,0,0,0.25)] rounded-sm px-10 py-12 min-h-[700px] flex flex-col">
                                            <div className="text-center mb-10 pb-6 border-b border-zinc-200">
                                                <p className={`text-[10px] font-semibold tracking-[0.2em] uppercase text-${accentExtract}-600 mb-2`}>{reviewingUser.name}&apos;s Version</p>
                                                <h1 className="text-lg font-bold text-zinc-900" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>{editingCardsFile.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ')}</h1>
                                                <p className="text-[11px] text-zinc-500 mt-2" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>
                                                    Reviewing changes · DocuSync CRDT v2
                                                </p>
                                            </div>
                                            <div className="flex-1">
                                                {renderDocumentDiffPair().rightNodes}
                                            </div>
                                            <div className="mt-10 pt-4 border-t border-zinc-200 text-center">
                                                <p className="text-[9px] text-zinc-300" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>CS 402 — Collaborative Thesis</p>
                                            </div>
                                        </div>

                                    </div>
                                </div>

                                {/* ── Accept / Dismiss Footer ── */}
                                <div className="bg-zinc-900 border-t border-white/10 px-5 py-3.5 flex gap-3 flex-shrink-0">
                                    <motion.button
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => {
                                            if (editingCardsFile) {
                                                setConflictFile(editingCardsFile.name);
                                                setDynamicConflict(null);
                                            }
                                            setReviewingUser(null);
                                            setIsEditingCardsOpen(false);
                                        }}
                                        className="flex-1 py-2.5 rounded-xl border border-zinc-600 text-zinc-300 hover:bg-zinc-800 transition-all text-sm font-semibold"
                                    >
                                        Open Full Conflict Resolver
                                    </motion.button>
                                    <motion.button
                                        whileTap={isRepoOwner ? { scale: 0.97 } : {}}
                                        onClick={() => {
                                            if (!isRepoOwner) return;
                                            if (currentRepo && editingCardsFile) {
                                                // Build merged content: local + all peer edits combined
                                                const mergedContent = reviewingUser.content;
                                                // 1. Resolve the conflict in the data store (marks file as Synced)
                                                resolveConflict(currentRepo, editingCardsFile.name, 'server', mergedContent);
                                                // 2. Update the editor so it NOW shows the merged result
                                                setEditorText(mergedContent);
                                                setEditingFile(prev => prev ? { ...prev, content: mergedContent } : null);
                                            }
                                            setReviewingUser(null);
                                            setIsEditingCardsOpen(false);
                                            setEditingCardsFile(null);
                                        }}
                                        disabled={!isRepoOwner}
                                        className={`flex-1 py-2.5 rounded-xl font-bold text-sm shadow-lg ${isRepoOwner ? `bg-gradient-to-r ${reviewingUser.color} text-white cursor-pointer` : 'bg-zinc-600 text-zinc-400 cursor-not-allowed opacity-60'}`}
                                        title={!isRepoOwner ? 'Only the repository owner can accept changes' : ''}
                                    >
                                        {isRepoOwner ? `✓ Accept ${reviewingUser.name.split(' ')[0]}\u0027s Changes` : '🔒 Owner Only'}
                                    </motion.button>
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>


            {/* Group Management Slide-over */}
            <AnimatePresence>
                {isGroupManageOpen && currentRepo && (() => {
                    const activeRepo = reposData.find(r => r.name === currentRepo);
                    if (!activeRepo) return null;
                    const isOwner = activeRepo.userRole === 'Owner';
                    const badgeColors: Record<string, string> = {
                        amber: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50',
                        purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/50',
                        zinc: 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-600',
                    };
                    const onlineCount = activeRepo.members.filter(m => m.status === 'online').length;
                    const idleCount = activeRepo.members.filter(m => m.status === 'idle').length;
                    const offlineCount = activeRepo.members.filter(m => m.status === 'offline').length;
                    return (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex justify-end bg-black/50 backdrop-blur-sm" onClick={() => setIsGroupManageOpen(false)}>
                            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="bg-zinc-50/95 dark:bg-zinc-950/95 backdrop-blur-2xl border-l border-white/5 shadow-[0_0_60px_rgba(0,0,0,0.5)] w-full max-w-2xl h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
                                {/* Header */}
                                <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl z-10">
                                    <div>
                                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                                            {isOwner ? <Settings className="text-amber-500" /> : <Users className="text-amber-500" />}
                                            {isOwner ? 'Manage Group' : 'Team Members'}
                                        </h2>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{activeRepo.name} • {activeRepo.members.length} members</p>
                                    </div>
                                    <button onClick={() => setIsGroupManageOpen(false)} className="p-2 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"><X size={24} /></button>
                                </div>

                                <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar flex flex-col gap-8">
                                    {/* ── Member Status Summary Bar (shown for EVERYONE) ── */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 flex flex-col items-center gap-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                                                <span className="text-2xl font-black text-green-500">{onlineCount}</span>
                                            </div>
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-green-600 dark:text-green-400">Online</span>
                                        </div>
                                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex flex-col items-center gap-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                                <span className="text-2xl font-black text-amber-500">{idleCount}</span>
                                            </div>
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Idle</span>
                                        </div>
                                        <div className="bg-zinc-500/10 border border-zinc-500/20 rounded-2xl p-4 flex flex-col items-center gap-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full bg-zinc-500" />
                                                <span className="text-2xl font-black text-zinc-500">{offlineCount}</span>
                                            </div>
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Offline</span>
                                        </div>
                                    </div>

                                    {/* Invite Member Section (Owner Only) */}
                                    {isOwner && (
                                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
                                            <div className={`px-6 py-5 flex items-center justify-between cursor-pointer transition-colors ${isInviteExpanded ? 'bg-amber-50/50 dark:bg-amber-900/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`} onClick={() => setIsInviteExpanded(!isInviteExpanded)}>
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"><UserPlus size={18} /></div>
                                                    <div>
                                                        <h3 className="font-bold text-zinc-900 dark:text-white">Invite New Members</h3>
                                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Share links, review requests, or invite directly</p>
                                                    </div>
                                                </div>
                                                <ChevronRight size={20} className={`text-zinc-400 transition-transform duration-300 ${isInviteExpanded ? 'rotate-90' : ''}`} />
                                            </div>
                                            <AnimatePresence>
                                                {isInviteExpanded && (
                                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-zinc-200 dark:border-zinc-800/50">
                                                        <div className="p-6 flex flex-col gap-6 bg-zinc-50/50 dark:bg-zinc-900/50">
                                                            {/* A. Shareable Link */}
                                                            <div>
                                                                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2"><Share2 size={16} className="text-amber-500" /> Shareable Invite Link</label>
                                                                <div className="flex gap-2">
                                                                    <input type="text" readOnly value={`https://docusync.app/repo/${activeRepo.id}/join`} className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 font-mono text-sm focus:outline-none" />
                                                                    <button className="px-5 py-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 font-bold text-sm transition-all shadow-md shrink-0">Copy Link</button>
                                                                </div>
                                                            </div>

                                                            {/* B. Pending Requests */}
                                                            {activeRepo.pendingRequests && activeRepo.pendingRequests.length > 0 && (
                                                                <div>
                                                                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2"><Clock size={16} className="text-orange-500" /> Pending Join Requests ({activeRepo.pendingRequests.length})</label>
                                                                    <div className="flex flex-col gap-2">
                                                                        {activeRepo.pendingRequests.map(req => (
                                                                            <div key={req.id} className="flex items-center justify-between p-3.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-sm">
                                                                                <div className="flex flex-col">
                                                                                    <span className="font-bold text-zinc-900 dark:text-zinc-200 text-sm">{req.name}</span>
                                                                                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{req.email} • Requested {req.date}</span>
                                                                                </div>
                                                                                <div className="flex items-center gap-2">
                                                                                    <button className="p-2 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/20 transition-colors" title="Accept Request"><CheckCircle2 size={18} /></button>
                                                                                    <button className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-colors" title="Deny Request"><X size={18} /></button>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* C. Direct Invite Search */}
                                                            <div>
                                                                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2"><Search size={16} className="text-purple-500" /> Direct Invite Search</label>
                                                                <div className="relative">
                                                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                                                                    <input type="text" placeholder="Search users by name or email..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors text-sm" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    )}

                                    {/* ── Members List ── */}
                                    <div>
                                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                                            <Users size={18} className="text-zinc-400" /> {isOwner ? 'Active Members' : 'All Members'}
                                        </h3>
                                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                                            {activeRepo.members.map((member, idx) => (
                                                <motion.div 
                                                    key={idx} 
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: idx * 0.05 }}
                                                    className="px-6 py-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group/member"
                                                >
                                                    <div className="flex items-center gap-4">
                                                        {/* Avatar with status indicator */}
                                                        <div className="relative">
                                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-sm ${member.badge === 'amber' ? 'bg-gradient-to-tr from-amber-500 to-amber-600' : member.badge === 'purple' ? 'bg-gradient-to-tr from-purple-500 to-purple-600' : 'bg-gradient-to-tr from-zinc-400 to-zinc-500'}`}>
                                                                {member.name.charAt(0)}
                                                            </div>
                                                            {/* Status dot on avatar */}
                                                            <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-zinc-900 ${
                                                                member.status === 'online' ? 'bg-green-500' :
                                                                member.status === 'idle' ? 'bg-amber-500' :
                                                                'bg-zinc-400'
                                                            }`} />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-zinc-900 dark:text-zinc-200">{member.name}</span>
                                                                {member.name === activeUserName && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20">YOU</span>}
                                                            </div>
                                                            {/* Status text for member view */}
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className={`text-[11px] font-semibold ${
                                                                    member.status === 'online' ? 'text-green-500' :
                                                                    member.status === 'idle' ? 'text-amber-500' :
                                                                    'text-zinc-400'
                                                                }`}>
                                                                    {member.status === 'online' ? '● Online' : member.status === 'idle' ? '● Idle' : '○ Offline'}
                                                                </span>
                                                                {member.lastActive && member.status !== 'online' && (
                                                                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500">• Last active {member.lastActive}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        {isOwner && member.name !== activeUserName ? (
                                                            <>
                                                                <select defaultValue={member.role} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-amber-500 cursor-pointer appearance-none shadow-sm">
                                                                    <option value="Owner">Owner</option>
                                                                    <option value="Editor">Editor</option>
                                                                    <option value="Viewer">Viewer</option>
                                                                </select>
                                                                <button className="opacity-0 group-hover/member:opacity-100 text-xs font-bold px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-all shadow-sm">
                                                                    Remove
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${badgeColors[member.badge] || badgeColors.zinc}`}>
                                                                {member.role}
                                                            </span>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </div>

                                        {/* Danger Zone: Delete Repository (Owner only) */}
                                        {isOwner && (
                                            <div className="mt-4 rounded-2xl border-2 border-rose-500/30 bg-rose-50/30 dark:bg-rose-900/10 p-6">
                                                <h3 className="text-base font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2 mb-2"><AlertTriangle size={18} /> Danger Zone</h3>
                                                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">Permanently delete this repository and all its files. This action cannot be undone.</p>
                                                <button onClick={() => setIsDeleteRepoOpen(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-rose-500/50 text-rose-600 dark:text-rose-400 bg-white dark:bg-zinc-900 hover:bg-rose-500 hover:text-white hover:border-rose-600 transition-all font-bold text-sm">
                                                    <Trash2 size={16} /> Delete Repository
                                                </button>
                                            </div>
                                        )}
                                        {/* Member View: Your Role + Permissions Info */}
                                        {!isOwner && (
                                            <div className="mt-4 flex flex-col gap-3">
                                                {/* Your role card */}
                                                <div className="bg-purple-50/50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800/40 rounded-xl p-4 flex items-center gap-3">
                                                    <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 shrink-0"><User size={16} /></div>
                                                    <div className="flex-1">
                                                        <p className="text-xs font-bold text-zinc-900 dark:text-white">Your Role: {activeRepo.userRole}</p>
                                                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                                                            {activeRepo.userRole === 'Editor' 
                                                                ? 'You can edit files and view changes, but only the Owner can approve conflict resolutions.'
                                                                : 'You can view files but cannot edit or approve changes.'}
                                                        </p>
                                                    </div>
                                                </div>
                                                {/* Restricted permissions notice */}
                                                <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4 flex items-center gap-3">
                                                    <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 shrink-0"><Shield size={16} /></div>
                                                    <div>
                                                        <p className="text-xs font-bold text-zinc-900 dark:text-white">Restricted Permissions</p>
                                                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Only the repository Owner can invite members, change roles, approve merges, or remove users.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>

            {/* Exclusive Friends Panel Slide-over */}
            <AnimatePresence>
                {isFriendsPanelOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex justify-end bg-black/40 backdrop-blur-sm" onClick={() => setIsFriendsPanelOpen(false)}>
                        <motion.div 
                            initial={{ x: '100%', rotateY: 10, scale: 0.95 }} 
                            animate={{ x: 0, rotateY: 0, scale: 1 }} 
                            exit={{ x: '100%', rotateY: 10, scale: 0.95 }} 
                            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                            className="bg-white/95 dark:bg-zinc-950/95 backdrop-blur-3xl border-l border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.6)] w-full max-w-sm h-full flex flex-col perspective-1000" 
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-6 py-6 border-b border-white/5 flex justify-between items-center bg-white/40 dark:bg-zinc-900/40 backdrop-blur-md">
                                <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                                    <Users size={20} className="text-emerald-500" /> My Friends
                                </h2>
                                <button onClick={() => setIsFriendsPanelOpen(false)} className="p-2 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"><X size={20} /></button>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar flex flex-col gap-3">
                                <div className="relative mb-2">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={14} />
                                    <input type="text" placeholder="Search friends..." className="w-full pl-9 pr-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors text-sm" />
                                </div>
                                
                                <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Online (3)</p>
                                
                                {/* Friend 1 */}
                                <motion.div whileHover={{ scale: 1.02, x: 2 }} className="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 shadow-sm cursor-pointer group">
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white font-bold shadow-md">S</div>
                                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-white dark:border-zinc-900"></div>
                                        </div>
                                        <div>
                                            <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">Sarah Jenkins</p>
                                            <p className="text-[11px] text-green-600 dark:text-green-400 font-semibold">Editing Thesis_Docs</p>
                                        </div>
                                    </div>
                                    <button className="opacity-0 group-hover:opacity-100 p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all"><MessageCircle size={16} /></button>
                                </motion.div>

                                {/* Friend 2 */}
                                <motion.div whileHover={{ scale: 1.02, x: 2 }} className="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 shadow-sm cursor-pointer group">
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-orange-400 to-rose-500 flex items-center justify-center text-white font-bold shadow-md">P</div>
                                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-white dark:border-zinc-900"></div>
                                        </div>
                                        <div>
                                            <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">Prof. Anderson</p>
                                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">Online</p>
                                        </div>
                                    </div>
                                    <button className="opacity-0 group-hover:opacity-100 p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all"><MessageCircle size={16} /></button>
                                </motion.div>

                                {/* Friend 3 */}
                                <motion.div whileHover={{ scale: 1.02, x: 2 }} className="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 shadow-sm cursor-pointer group">
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-rose-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-md">E</div>
                                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-500 border-2 border-white dark:border-zinc-900"></div>
                                        </div>
                                        <div>
                                            <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">Elena Rostova</p>
                                            <p className="text-[11px] text-amber-600 dark:text-amber-500 font-medium">Away for 15m</p>
                                        </div>
                                    </div>
                                    <button className="opacity-0 group-hover:opacity-100 p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all"><MessageCircle size={16} /></button>
                                </motion.div>
                                
                                <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mt-4 mb-1">Offline (1)</p>
                                {/* Friend 4 (Offline) */}
                                <motion.div whileHover={{ scale: 1.02, x: 2 }} className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50 shadow-sm cursor-pointer opacity-70 hover:opacity-100 transition-opacity">
                                    <div className="flex items-center gap-3">
                                        <div className="relative grayscale">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-zinc-400 to-stone-500 flex items-center justify-center text-white font-bold shadow-md">M</div>
                                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-zinc-400 border-2 border-white dark:border-zinc-900"></div>
                                        </div>
                                        <div>
                                            <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">Michael Chang</p>
                                            <p className="text-[11px] text-zinc-500 dark:text-zinc-500 font-medium">Last seen 2 days ago</p>
                                        </div>
                                    </div>
                                </motion.div>

                            </div>
                            
                            <div className="p-6 border-t border-white/5 bg-zinc-50/50 dark:bg-zinc-900/20">
                                <button className="w-full py-3 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 dark:text-emerald-400 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"><UserPlus size={18} /> Add New Friend</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* File Text Editor Modal (Module 3) */}
            <AnimatePresence>
                {editingFile && (() => {
                    const review = editingFile.pendingReview;
                    const isReviewMode = !!review;
                    const getHighlightedHtml = (newHtml: string, oldHtml: string) => {
                        const baseText = oldHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                        const userText = newHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

                        const baseWords = baseText.split(' ').filter(Boolean);
                        const userWords = userText.split(' ').filter(Boolean);

                        const m = baseWords.length;
                        const n = userWords.length;
                        const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
                        for (let i = 1; i <= m; i++) {
                            for (let j = 1; j <= n; j++) {
                                if (baseWords[i - 1] === userWords[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
                                else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                            }
                        }

                        let i = m, j = n;
                        const alignment: any[] = [];
                        while (i > 0 && j > 0) {
                            if (baseWords[i - 1] === userWords[j - 1]) { alignment.unshift({ type: 'same', text: baseWords[i - 1] }); i--; j--; }
                            else if (dp[i - 1][j] >= dp[i][j - 1]) { alignment.unshift({ type: 'removed', text: baseWords[i - 1] }); i--; }
                            else { alignment.unshift({ type: 'added', text: userWords[j - 1] }); j--; }
                        }
                        while (i > 0) { alignment.unshift({ type: 'removed', text: baseWords[i - 1] }); i--; }
                        while (j > 0) { alignment.unshift({ type: 'added', text: userWords[j - 1] }); j--; }

                        const mergedAlignment: any[] = [];
                        alignment.forEach(al => {
                            if (mergedAlignment.length > 0 && mergedAlignment[mergedAlignment.length - 1].type === al.type) {
                                mergedAlignment[mergedAlignment.length - 1].text += ' ' + al.text;
                            } else {
                                mergedAlignment.push({ ...al });
                            }
                        });

                        let resultHtml = '';
                        mergedAlignment.forEach(al => {
                            if (al.type === 'same') resultHtml += al.text + ' ';
                            else if (al.type === 'removed') resultHtml += `<del style="background-color:#ffe4e6;color:#e11d48;padding:2px 4px;border-radius:4px;text-decoration-thickness:2px;font-weight:600;margin:0 2px;">${al.text}</del> `;
                            else if (al.type === 'added') resultHtml += `<ins style="background-color:#d1fae5;color:#065f46;padding:2px 4px;border-radius:4px;text-decoration:none;font-weight:600;border-bottom:2px solid #34d399;margin:0 2px;">${al.text}</ins> `;
                        });
                        return `<p style="line-height:2.2">${resultHtml.trim()}</p>`;
                    };
                    return (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} className="fixed inset-0 z-[70] flex flex-col">
                        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} exit={{ opacity: 0 }} className="flex flex-col" style={{ height: '100vh' }}>
                            <div className="flex-shrink-0 bg-[#2b579a] text-white px-4 py-1.5 flex items-center gap-3 shadow">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <FileText size={15} className="text-white/80 flex-shrink-0" />
                                    <span className="font-semibold text-sm truncate">{editingFile.name}</span>
                                    {isReviewMode && <span className="bg-amber-400 text-black text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide">Review Mode</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-white/50 text-xs hidden sm:block">{isReviewMode ? 'Accept changes to enable editing' : 'Editing locally'}</span>
                                    <button onClick={() => { setEditingFile(null); setEditorText(''); }} className="p-1 rounded hover:bg-white/20 text-white/80 hover:text-white transition-colors flex-shrink-0"><X size={16} /></button>
                                </div>
                            </div>
                            {isReviewMode && (
                                <div className="flex-shrink-0 px-6 py-4 bg-white border-b border-zinc-200">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-xl bg-amber-500 text-white"><AlertTriangle size={18} /></div>
                                            <div>
                                                <h4 className="font-bold text-zinc-900 text-sm">Review Changes Prior to Editing</h4>
                                                <p className="text-xs text-zinc-500">{"Friend's changes have been integrated. Review the side-by-side diff below."}</p>
                                            </div>
                                        </div>
                                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} onClick={() => { if (currentRepo) clearPendingReview(currentRepo, editingFile.name); setEditingFile({ ...editingFile, pendingReview: null }); }} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-bold uppercase tracking-wider shadow-lg transition-all">
                                            <CheckCircle2 size={15} /> Continue
                                        </motion.button>
                                    </div>
                                    <div className="flex flex-col lg:flex-row gap-4" style={{ height: '50vh', minHeight: '360px' }}>
                                        <div className="flex-1 flex flex-col rounded bg-white shadow-[0_4px_20px_rgba(0,0,0,0.12)] ring-1 ring-zinc-200 overflow-hidden" style={{ borderTop: '3px solid #10b981' }}>
                                            <div className="px-4 py-2 border-b border-zinc-100 bg-white flex justify-between items-center">
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Previous State</span>
                                                <span className="text-emerald-600 text-[10px] font-bold">Original</span>
                                            </div>
                                            <div className="flex-1 overflow-y-auto px-10 py-8 text-sm leading-[2] text-zinc-900 bg-white" style={{ fontFamily: "Times New Roman, serif" }}>
                                                <div dangerouslySetInnerHTML={{ __html: review!.previousContent }} />
                                            </div>
                                        </div>
                                        <div className="flex-1 flex flex-col rounded bg-white shadow-[0_4px_20px_rgba(0,0,0,0.12)] ring-1 ring-zinc-200 overflow-hidden" style={{ borderTop: '3px solid #10b981' }}>
                                            <div className="px-4 py-2 border-b border-zinc-100 bg-white flex justify-between items-center">
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Integrated Result</span>
                                                <span className="bg-amber-200 text-amber-900 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Highlighted</span>
                                            </div>
                                            <div className="flex-1 overflow-y-auto px-10 py-8 text-sm leading-[2] text-zinc-900 bg-white" style={{ fontFamily: "Times New Roman, serif" }}>
                                                <div dangerouslySetInnerHTML={{ __html: getHighlightedHtml(editingFile.content, review!.previousContent) }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className={`flex-1 overflow-hidden ${isReviewMode ? 'pointer-events-none opacity-50 grayscale-[0.5]' : ''}`}>
                                <RichTextEditor fileName={editingFile.name} userName={activeUserName} onChange={(html) => setEditorText(html)} initialContent={editingFile.content} isOffline={isOffline} />
                            </div>
                            <div className="flex-shrink-0 bg-[#1e3f7a] text-white px-4 py-2 flex justify-between items-center">
                                <span className="text-xs text-white/60 flex items-center gap-2">
                                    {isReviewMode ? (<><span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />{' Accept changes above to start editing'}</>) : (<><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />{' Rich Text Editor \u2014 formatting preserved on save'}</>)}
                                </span>
                                <div className="flex gap-2">
                                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => { setEditingFile(null); setEditorText(''); }} className="px-4 py-1.5 rounded border border-white/30 text-white/80 hover:bg-white/10 hover:text-white transition-all text-sm font-semibold">Close</motion.button>
                                    <motion.button whileTap={{ scale: 0.97 }} disabled={isReviewMode} onClick={() => { if (!currentRepo || !editingFile) return; const newContent = editorText || editingFile.content; saveFileContent(currentRepo, editingFile.name, newContent, editingFile.content || ''); setEditingFile(null); setEditorText(''); }} className={`px-4 py-1.5 rounded bg-orange-500 hover:bg-orange-400 text-white transition-all text-sm font-bold flex items-center gap-2 ${isReviewMode ? 'opacity-30 cursor-not-allowed' : ''}`}>
                                        <RefreshCcw size={14} /> Save &amp; Sync
                                    </motion.button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                    );
                })()}
            </AnimatePresence>

            {/* ══ Premium Delete File Confirmation Modal ══ */}
            <AnimatePresence>
                {deleteFileTarget && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-xl"
                        onClick={() => setDeleteFileTarget(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.88, y: 24 }}
                            animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
                            exit={{ opacity: 0, scale: 0.92, y: 12, transition: { duration: 0.2, ease: 'easeIn' } }}
                            onClick={(e) => e.stopPropagation()}
                            className="relative overflow-hidden bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl border border-rose-500/20 rounded-3xl shadow-[0_30px_100px_rgba(239,68,68,0.25),0_0_0_1px_rgba(239,68,68,0.1)] flex flex-col w-[90%] max-w-md"
                        >
                            {/* Gradient top stripe */}
                            <div className="h-1 w-full bg-gradient-to-r from-rose-600 via-red-500 to-rose-600" />

                            {/* Ambient glow */}
                            <div className="absolute top-0 right-0 w-48 h-48 bg-rose-500/8 rounded-full -translate-y-24 translate-x-24 blur-3xl pointer-events-none" />

                            <div className="p-8 relative z-10">
                                {/* Icon + title */}
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="relative shrink-0">
                                        <div className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping" />
                                        <div className="relative w-14 h-14 rounded-full bg-rose-100 dark:bg-rose-900/40 border border-rose-200 dark:border-rose-700/50 flex items-center justify-center shadow-inner">
                                            <AlertTriangle size={26} className="text-rose-600 dark:text-rose-400" />
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h2 className="text-xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                                            Permanent Deletion
                                        </h2>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">This action is irreversible and cannot be undone.</p>
                                    </div>
                                    <button
                                        onClick={() => setDeleteFileTarget(null)}
                                        className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                {/* Warning card */}
                                <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 rounded-2xl p-5 mb-6 shadow-inner">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                        <span className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-widest">CRITICAL WARNING</span>
                                    </div>
                                    <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                                        {deleteFileTarget.trashItemId === -999
                                            ? <>You are about to permanently delete <strong className="text-zinc-900 dark:text-white">{deleteFileTarget.fileName}</strong>. All data will be erased from storage immediately.</>
                                            : <>File <strong className="text-zinc-900 dark:text-white">&ldquo;{deleteFileTarget.fileName}&rdquo;</strong> will be permanently erased. It cannot be recovered from Trash after this action.</>
                                        }
                                    </p>
                                </div>

                                {/* Action buttons */}
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setDeleteFileTarget(null)}
                                        className="flex-1 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all text-sm font-semibold"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (!deleteFileTarget) return;
                                            if (deleteFileTarget.trashItemId === -999) {
                                                emptyTrash();
                                            } else {
                                                permanentlyDeleteFile(deleteFileTarget.trashItemId);
                                            }
                                            setDeleteFileTarget(null);
                                        }}
                                        className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-extrabold text-sm shadow-lg shadow-rose-500/30 hover:shadow-rose-500/50 transition-all flex items-center justify-center gap-2 group"
                                    >
                                        <Trash2 size={16} className="group-hover:scale-110 transition-transform" />
                                        Delete Forever
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Delete Repo Confirmation Modal (Module 1) */}
            <AnimatePresence>
                {isDeleteRepoOpen && currentRepo && (() => {
                    const repoToDelete = reposData.find(r => r.name === currentRepo);
                    return (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md">
                            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="bg-white/90 dark:bg-zinc-900/85 backdrop-blur-2xl border border-rose-500/25 rounded-2xl shadow-[0_25px_80px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden w-[90%] max-w-md">
                                <div className="h-1 w-full bg-gradient-to-r from-rose-600 to-red-500" />
                                <div className="p-7">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center">
                                            <AlertTriangle size={24} className="text-rose-600 dark:text-rose-400" />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-extrabold text-rose-600 dark:text-rose-400">Permanent Deletion</h2>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">This action is irreversible</p>
                                        </div>
                                    </div>
                                    <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 rounded-xl p-4 mb-6">
                                        <p className="text-sm font-bold text-rose-700 dark:text-rose-300">⚠ WARNING: This action is permanent and will delete all files and repository history.</p>
                                        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2">Repository <strong className="text-zinc-900 dark:text-white">&ldquo;{repoToDelete?.name}&rdquo;</strong> and its <strong>{repoToDelete?.files.length} file(s)</strong> will be permanently erased. Are you sure you want to proceed?</p>
                                    </div>
                                    <div className="flex gap-3">
                                        <button onClick={() => setIsDeleteRepoOpen(false)} className="flex-1 px-5 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm font-semibold">Cancel, Keep Repository</button>
                                        <button onClick={() => {
                                            if (!repoToDelete) return;
                                            deleteRepository(repoToDelete.id);
                                            setIsDeleteRepoOpen(false);
                                            setIsGroupManageOpen(false);
                                            setCurrentRepo(null);
                                        }} className="flex-1 px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-sm shadow-lg shadow-rose-500/30 transition-all flex items-center justify-center gap-2">
                                            <Trash2 size={16} /> Yes, Delete Forever
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>
            <AnimatePresence>
                {isFriendsPanelOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex justify-end bg-black/50 backdrop-blur-sm" onClick={() => setIsFriendsPanelOpen(false)}>
                        <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="bg-zinc-50 dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-md h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
                            {/* Panel Header */}
                            <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-900">
                                <div>
                                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2.5">
                                        <Users className="text-amber-500" size={22} /> Friends & Activity
                                    </h2>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Manage your connections and see who&apos;s online</p>
                                </div>
                                <button onClick={() => setIsFriendsPanelOpen(false)} className="p-2 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"><X size={22} /></button>
                            </div>

                            <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar flex flex-col gap-6">
                                {/* A. Add Friend */}
                                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-3 flex items-center gap-2"><UserPlus size={16} className="text-amber-500" /> Add Friend</h3>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={15} />
                                            <input type="text" value={friendSearchQuery} onChange={(e) => setFriendSearchQuery(e.target.value)} placeholder="Search by username or email..." className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white placeholder-zinc-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors" />
                                        </div>
                                        <button className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-all shadow-md shadow-amber-500/20 shrink-0">Send Request</button>
                                    </div>
                                </div>

                                {/* B. Pending Requests */}
                                <div>
                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-3 flex items-center gap-2"><Clock size={16} className="text-orange-500" /> Pending Requests <span className="ml-auto text-[11px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">2 new</span></h3>
                                    <div className="flex flex-col gap-2">
                                        {[
                                            { name: 'Maria Santos', email: 'maria.s@university.edu', time: '5 min ago' },
                                            { name: 'Alex Turner', email: 'a.turner@campus.edu', time: '1 hr ago' },
                                        ].map((req, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm ${idx === 0 ? 'bg-gradient-to-tr from-pink-500 to-rose-500' : 'bg-gradient-to-tr from-blue-500 to-indigo-500'}`}>{req.name.charAt(0)}</div>
                                                    <div>
                                                        <span className="font-bold text-zinc-900 dark:text-zinc-200 text-sm">{req.name}</span>
                                                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{req.email} · {req.time}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <button className="p-2 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/20 transition-colors" title="Accept"><UserCheck size={16} /></button>
                                                    <button className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-colors" title="Decline"><UserX size={16} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* C. Friends List */}
                                <div>
                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-3 flex items-center gap-2"><Users size={16} className="text-zinc-400" /> Friends List</h3>
                                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                                        {[
                                            { name: 'Sofia Reyes', initial: 'S', gradient: 'from-amber-500 to-amber-600', status: 'online', label: '🟢 Online' },
                                            { name: 'Prof. Davis', initial: 'P', gradient: 'from-emerald-500 to-teal-500', status: 'idle', label: '🟡 Idle (15 mins)' },
                                            { name: 'John Doe', initial: 'J', gradient: 'from-cyan-600 to-amber-600', status: 'offline', label: '⚪ Last seen 2 hours ago' },
                                            { name: 'Jane Smith', initial: 'J', gradient: 'from-purple-500 to-pink-500', status: 'offline', label: '⚪ Last seen 3 days ago' },
                                        ].map((friend, idx) => (
                                            <div key={idx} className="px-5 py-3.5 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                                <div className="flex items-center gap-3.5">
                                                    <div className="relative">
                                                        <div className={`w-10 h-10 rounded-full bg-gradient-to-tr ${friend.gradient} flex items-center justify-center text-sm font-bold text-white shadow-sm`}>{friend.initial}</div>
                                                        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-zinc-900 ${friend.status === 'online' ? 'bg-green-500' : friend.status === 'idle' ? 'bg-yellow-500' : 'bg-zinc-400 dark:bg-zinc-600'}`}></div>
                                                    </div>
                                                    <div>
                                                        <span className="font-bold text-zinc-900 dark:text-zinc-200 text-sm">{friend.name}</span>
                                                        <p className={`text-[11px] mt-0.5 ${friend.status === 'online' ? 'text-green-500' : friend.status === 'idle' ? 'text-yellow-500' : 'text-zinc-500 dark:text-zinc-400'}`}>{friend.label}</p>
                                                    </div>
                                                </div>
                                                <button className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"><MoreVertical size={16} /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══════════ OWNER DELETE WARNING MODAL ═══════════ */}
            <AnimatePresence>
                {ownerDeleteWarning && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md">
                        <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} className="w-[90%] max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
                            <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500" />
                            <div className="p-6 flex flex-col gap-5">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 flex-shrink-0">
                                        <AlertTriangle size={24} className="text-amber-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">File Currently Being Edited</h3>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                            <strong className="text-zinc-800 dark:text-zinc-200">&ldquo;{ownerDeleteWarning.fileName}&rdquo;</strong> is currently being edited by:
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2 pl-2">
                                    {ownerDeleteWarning.editingUsers.map((user, i) => (
                                        <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-xs font-bold text-white shadow-sm">{user.charAt(0).toUpperCase()}</div>
                                            <div>
                                                <span className="font-bold text-sm text-zinc-900 dark:text-zinc-200">{user}</span>
                                                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" /> Actively editing
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20">
                                    <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold leading-relaxed">
                                        ⚠️ Deleting this file will immediately close the editor for all active users and remove their unsaved work.
                                    </p>
                                </div>

                                <div className="flex justify-end gap-3 pt-1">
                                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => setOwnerDeleteWarning(null)} className="px-5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all text-sm font-semibold">
                                        Cancel
                                    </motion.button>
                                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => {
                                        if (ownerDeleteWarning) {
                                            trashFile(ownerDeleteWarning.repoName, ownerDeleteWarning.fileName);
                                            setOwnerDeleteWarning(null);
                                        }
                                    }} className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white transition-all text-sm font-bold shadow-lg shadow-rose-500/20 flex items-center gap-2">
                                        <Trash2 size={14} /> Delete Anyway
                                    </motion.button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══════════ FILE DELETED KICK MODAL (for editors) ═══════════ */}
            <AnimatePresence>
                {fileDeletedKick && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md">
                        <motion.div initial={{ opacity: 0, scale: 0.85, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.85, y: 30 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} className="w-[90%] max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
                            <div className="h-1 w-full bg-gradient-to-r from-rose-500 via-red-500 to-rose-500" />
                            <div className="p-8 flex flex-col items-center text-center gap-5">
                                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.15 }} className="w-20 h-20 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
                                    <Trash2 size={36} className="text-rose-500" />
                                </motion.div>
                                <div>
                                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">File Deleted</h3>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                        The file <strong className="text-zinc-800 dark:text-zinc-200">&ldquo;{fileDeletedKick.fileName}&rdquo;</strong> has been moved to Trash by the repository Owner.
                                    </p>
                                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
                                        Your editing session has been ended. Any unsaved changes were not preserved.
                                    </p>
                                </div>
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => {
                                    setFileDeletedKick(null);
                                    setCurrentRepo(null);
                                    setActiveTab('My Drive');
                                }} className="px-8 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white text-sm font-bold uppercase tracking-wider shadow-lg shadow-orange-500/30 transition-all flex items-center gap-2">
                                    <ChevronLeft size={16} /> Return to My Drive
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══════════ CONFIRM TRASH FILE MODAL ═══════════ */}
            <AnimatePresence>
                {confirmTrashFile && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md px-4">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-sm w-full border border-zinc-200 dark:border-zinc-800 shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-amber-600"></div>
                            
                            <div className="flex flex-col items-center text-center">
                                <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mb-6 border border-amber-500/20">
                                    <AlertTriangle size={32} />
                                </div>
                                
                                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Move to Trash?</h3>
                                
                                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-8 leading-relaxed">
                                    Are you sure you want to move <strong className="text-zinc-800 dark:text-zinc-200">&ldquo;{confirmTrashFile.fileName}&rdquo;</strong> to the Trash? You can easily restore it later from your recycle bin if needed.
                                </p>
                                
                                <div className="flex gap-3 w-full">
                                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => setConfirmTrashFile(null)} className="flex-1 px-5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all text-sm font-semibold">
                                        Cancel
                                    </motion.button>
                                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => {
                                        trashFile(confirmTrashFile.repoName, confirmTrashFile.fileName);
                                        setConfirmTrashFile(null);
                                    }} className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20 transition-all font-bold text-sm">
                                        <Trash2 size={14} /> Move to Trash
                                    </motion.button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
            `}</style>
        </div>
    );
}

