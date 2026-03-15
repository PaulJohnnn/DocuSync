"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '../../../../components/ThemeToggle';
import {
    Folder, FileText, Clock, Star, Trash2, User,
    CheckCircle2, AlertTriangle, Share2,
    ChevronRight, MoreVertical, Search,
    Activity, RefreshCcw, Database,
    FileIcon, X, Terminal, UploadCloud, FileUp, Wand, LogOut,
    Monitor, Laptop, Lock, Bell, Wifi, Shield, GitMerge,
    Download, WifiOff, Users, Plus, UserPlus, FolderPlus, FilePlus, Settings, Link2, UserCheck, UserX, ChevronLeft
} from 'lucide-react';
import { useSyncContext, FileData, RepositoryData } from '../../../../context/SyncContext';
import RichTextEditor from '../../../../components/RichTextEditor';
import mammoth from 'mammoth';

export default function UserDashboard() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<string>('My Drive');
    const [isOffline, setIsOffline] = useState(false);
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
    const [editingFile, setEditingFile] = useState<{ name: string; content: string } | null>(null);
    const [editorText, setEditorText] = useState('');
    // Module 4: Dynamic conflict content (from editor Save & Quit)
    const [dynamicConflict, setDynamicConflict] = useState<{ localContent: string; serverContent: string; originalContent: string } | null>(null);
    // Module 1: Delete repo confirm
    const [isDeleteRepoOpen, setIsDeleteRepoOpen] = useState(false);

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
        || !!editingFile || isDeleteRepoOpen;

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
    const [userName, setUserName] = useState('Paul John Palamara');
    const [isEditingProfile, setIsEditingProfile] = useState(false);

    const {
        reposData,
        syncLogs,
        trashedFiles,
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
        resolveConflict
    } = useSyncContext();

    const getFileIconColors = (type: string) => {
        return 'from-blue-500/20 to-blue-600/20 text-blue-500 border-blue-500/30';
    };

    return (
        <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-300 font-sans selection:bg-orange-500/30 relative overflow-hidden flex">
            {/* Ambient Background */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-20%] left-[-10%] w-[55vw] h-[55vw] rounded-full bg-orange-600/5 dark:bg-orange-900/15 blur-[130px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[65vw] h-[65vw] rounded-full bg-indigo-500/5 dark:bg-zinc-900/60 blur-[160px]" />
            </div>

            {/* ═══════════ USER SIDEBAR (Amber) ═══════════ */}
            <div className="relative z-10 w-64 border-r border-white/5 dark:border-white/5 bg-white/70 dark:bg-zinc-950/90 backdrop-blur-2xl px-5 py-8 flex flex-col shadow-[10px_0_40px_rgba(0,0,0,0.6)]">
                <motion.div variants={floatAnim} initial="initial" animate="animate" className="flex items-center gap-3 mb-12 cursor-pointer">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 shadow-lg shadow-orange-500/30 flex items-center justify-center">
                        <RefreshCcw size={18} className="text-white" />
                    </div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-amber-400 tracking-tight">
                        DocuSync
                    </h1>
                </motion.div>

                <div className="flex-1 flex flex-col gap-1">
                    {navItems.map((item) => {
                        const isActive = activeTab === item.name;
                        return (
                            <motion.button
                                key={item.name}
                                onClick={() => setActiveTab(item.name)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 ${isActive
                                    ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 shadow-[0_0_12px_rgba(249,115,22,0.15)]'
                                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/10 dark:hover:bg-white/5 border border-transparent hover:border-white/10'
                                    }`}
                                whileHover={{ scale: isActive ? 1 : 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <item.icon size={18} className={isActive ? "text-orange-500" : ""} />
                                <span className="font-medium text-sm tracking-wide">{item.name}</span>
                            </motion.button>
                        );
                    })}
                </div>
            </div>

            {/* ═══════════ MAIN CONTENT ═══════════ */}
            <div className="flex-1 flex flex-col relative z-10 h-screen overflow-hidden">
                {/* Header */}
                <header className="px-8 py-6 flex justify-between items-center z-20">
                    <div className="flex items-center text-sm font-medium bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl px-5 py-3 rounded-2xl border border-white/10 dark:border-white/5 shadow-lg">
                        <span className="text-zinc-900 dark:text-zinc-100 font-bold tracking-wide">My Drive Overview</span>
                    </div>

                    <div className="flex items-center gap-4 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl px-5 py-2.5 rounded-2xl border border-white/10 dark:border-white/5 shadow-lg">
                        <ThemeToggle />
                        <div className={`hidden md:flex items-center gap-2 mr-2 px-3 py-1.5 rounded-xl border transition-colors duration-300 ${isOffline ? 'border-zinc-300 dark:border-zinc-600 bg-zinc-200 dark:bg-zinc-700' : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800'}`}>
                            <div className={`w-2 h-2 rounded-full ${isOffline ? 'bg-zinc-500' : 'bg-green-500 animate-pulse'}`}></div>
                            <span className={`text-xs font-bold ${isOffline ? 'text-zinc-600 dark:text-zinc-300' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                {isOffline ? 'Offline (Queuing Edits)' : 'Online (WebSocket Active)'}
                            </span>
                        </div>
                        {currentRepo && (
                            <button onClick={() => setIsUploadOpen(true)} className="mr-3 flex items-center gap-2 px-4 py-1.5 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 hover:border-orange-400/50 hover:shadow-[0_0_12px_rgba(249,115,22,0.2)] transition-all font-semibold text-xs">
                                <UploadCloud size={16} /> Sync Edits (Check-in)
                            </button>
                        )}
                        <span className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-widest font-semibold">Active users</span>
                        <button onClick={() => setIsFriendsPanelOpen(true)} className="flex -space-x-2 hover:space-x-1 transition-all duration-300 cursor-pointer group/avatars rounded-xl p-1.5 -m-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700">
                            {['S', 'M', 'E'].map((initial, i) => (
                                <motion.div whileHover={{ scale: 1.15, zIndex: 10 }} key={i}
                                    className={`w-8 h-8 rounded-full border-2 border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-xs font-bold text-white ${i === 0 ? 'bg-gradient-to-tr from-amber-500 to-amber-600' : i === 1 ? 'bg-gradient-to-tr from-cyan-600 to-amber-600' : 'bg-gradient-to-tr from-emerald-500 to-teal-500'}`}>
                                    {initial}
                                </motion.div>
                            ))}
                        </button>
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
                                            <button onClick={() => { setCurrentRepo(null); setSelectedFile(null); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-amber-600 dark:hover:text-amber-400 transition-colors font-semibold border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700">
                                                <ChevronLeft size={16} /> Back to My Drive
                                            </button>
                                            <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-700 hidden sm:block"></div>
                                        </>
                                    )}
                                    {!currentRepo ? (
                                        <div className="flex gap-3">
                                            <button onClick={() => setIsCreateRepoOpen(true)} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-md shadow-orange-500/30 hover:shadow-[0_0_18px_rgba(249,115,22,0.35)]">
                                                <FolderPlus size={16} /> Create Repository
                                            </button>
                                            <button onClick={() => setIsJoinRepoOpen(true)} className="flex items-center gap-2 bg-white/5 dark:bg-white/5 border border-white/10 text-zinc-300 hover:border-orange-400/50 hover:text-orange-400 px-4 py-2 rounded-xl text-sm font-semibold transition-all backdrop-blur-sm">
                                                <Link2 size={16} /> Join Repository
                                            </button>
                                        </div>
                                    ) : (
                                        <button onClick={() => setIsUploadOpen(true)} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-md shadow-orange-500/30 hover:shadow-[0_0_18px_rgba(249,115,22,0.35)]">
                                            <FilePlus size={16} /> Add File
                                        </button>
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
                                    <div className="mt-4 flex flex-col gap-3">
                                        <AnimatePresence mode="popLayout">
                                            {reposData.map((repo, i) => (
                                                <motion.div key={`repo-${repo.id}`} onClick={() => setCurrentRepo(repo.name)}
                                                    initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ delay: i * 0.1 }} whileHover={{ scale: 1.005 }}
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
                                    </div>
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
                                                <button onClick={() => setIsGroupManageOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all border border-white/10 bg-white/5 dark:bg-white/5 text-zinc-300 hover:text-orange-400 hover:border-orange-400/40 hover:bg-white/10 shadow-sm text-sm font-semibold backdrop-blur-sm">
                                                    <Settings size={16} /> Manage Group
                                                </button>
                                            </div>
                                        </div>

                                        {/* File List */}
                                        <div className="grid grid-cols-[3fr_2fr_2fr_auto] items-center gap-4 px-6 py-3 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border-b border-white/5">
                                            <div className="text-left">Name</div><div className="text-left">Sync Status</div><div className="text-left">Last Modified</div><div className="w-48"></div>
                                        </div>
                                        <div className="mt-4 flex flex-col gap-3">
                                            <AnimatePresence mode="popLayout">
                                                {activeRepo?.files.map((file, i) => (
                                                    <motion.div key={`file-${file.id}`} onClick={() => {
                                                        if (file.syncStatus === 'conflict') {
                                                            setConflictFile(file.name);
                                                            setDynamicConflict(null);
                                                        } else {
                                                            setEditingFile({ name: file.name, content: file.content || '' });
                                                            setEditorText(file.content || '');
                                                        }
                                                    }}
                                                        initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ delay: i * 0.1 }} whileHover={{ scale: 1.005 }}
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
                                                                    <motion.div key="conflict" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} onClick={(e) => { e.stopPropagation(); setConflictFile(file.name); }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-medium animate-pulse cursor-pointer hover:bg-amber-500/20 transition-colors" title="Click to resolve conflict">
                                                                        <AlertTriangle size={14} /> Conflict
                                                                    </motion.div>
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
                                                                                {file.syncStatus === 'conflict' && (
                                                                                    <>
                                                                                        <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); setConflictFile(file.name); }} className="flex items-center gap-3 hover:bg-orange-500/10 px-4 py-3 cursor-pointer transition-colors text-sm text-orange-400 font-semibold"><AlertTriangle size={16} /><span>⚠️ Resolve Conflict</span></div>
                                                                                        <div className="border-b border-zinc-200 dark:border-zinc-700/50"></div>
                                                                                    </>
                                                                                )}
                                                                                <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); URL.revokeObjectURL(url); }} className="flex items-center gap-3 hover:bg-white/10 dark:hover:bg-white/5 px-4 py-3 cursor-pointer transition-colors text-sm text-zinc-700 dark:text-zinc-200"><Download size={16} /><span>Download (Check-out)</span></div>
                                                                                <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }} className="flex items-center gap-3 hover:bg-white/10 dark:hover:bg-white/5 px-4 py-3 cursor-pointer transition-colors text-sm text-zinc-700 dark:text-zinc-200"><WifiOff size={16} /><span>Make Available Offline</span></div>
                                                                                <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); setIsGroupManageOpen(true); }} className="flex items-center gap-3 hover:bg-white/10 dark:hover:bg-white/5 px-4 py-3 cursor-pointer transition-colors text-sm text-zinc-700 dark:text-zinc-200"><Users size={16} /><span>Share with Group</span></div>
                                                                                <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); if (activeRepo?.name) { trashFile(activeRepo.name, file.name); } }} className="flex items-center gap-3 hover:bg-rose-500/10 px-4 py-3 cursor-pointer transition-all text-sm text-rose-400 font-semibold hover:text-rose-300"><Trash2 size={16} /><span>Move to Trash</span></div>
                                                                            </div>
                                                                        </motion.div>
                                                                    )}
                                                                </AnimatePresence>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                ))}
                                            </AnimatePresence>
                                        </div>
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
                                    <button onClick={() => { if (window.confirm('Empty trash? This permanently deletes all items and cannot be undone.')) emptyTrash(); }} className="px-4 py-2 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors border border-rose-500/30 text-sm font-bold">
                                        Empty Trash
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
                                                    <button onClick={() => permanentlyDeleteFile(item.id)} className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors text-xs font-bold shrink-0">Delete Perm</button>
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
                                                    onClick={() => { setCurrentRepo(file.repoName); setEditingFile({ name: file.name, content: file.content || '' }); setEditorText(file.content || ''); setActiveTab('My Drive'); }}
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
                                <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-amber-600 to-orange-600 flex items-center justify-center text-3xl font-bold text-white shadow-lg">U</div>
                                <div className="text-center">
                                    <h2 className="text-3xl font-bold text-zinc-900 dark:text-white mb-1">DocuSync User</h2>
                                    <p className="text-zinc-500 dark:text-zinc-400 mb-3">user@institution.edu</p>
                                    <span className="inline-block px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 text-xs font-semibold border border-amber-200 dark:border-amber-900/50">Standard User</span>
                                </div>
                                <div className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl p-5 flex flex-col gap-3">
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-zinc-600 dark:text-zinc-300 font-medium text-sm">Storage Used</span>
                                        <span className="text-zinc-900 dark:text-white font-bold text-sm">1.2 GB <span className="text-zinc-500 font-normal">/ 15 GB</span></span>
                                    </div>
                                    <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden"><div className="h-full w-[8%] bg-amber-400"></div></div>
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
                                            <div className="flex items-center gap-4"><div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"><Wifi size={18} /></div><div><p className="text-zinc-900 dark:text-white font-medium">Auto-Sync on Cellular</p><p className="text-sm text-zinc-500 dark:text-zinc-400">Allow background syncing when disconnected from Wi-Fi</p></div></div>
                                            <div onClick={() => setAutoSync(!autoSync)} className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${autoSync ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}>
                                                <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${autoSync ? 'right-0.5' : 'left-0.5'} shadow-md`}></div>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                                            <div className="flex items-center gap-4"><div className="p-2 rounded-lg bg-purple-500/10 text-purple-400"><Bell size={18} /></div><div><p className="text-zinc-900 dark:text-white font-medium">Desktop Notifications</p><p className="text-sm text-zinc-500 dark:text-zinc-400">Receive alerts for conflicts and completed syncs</p></div></div>
                                            <div onClick={() => setNotifications(!notifications)} className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${notifications ? 'bg-purple-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}>
                                                <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${notifications ? 'right-0.5' : 'left-0.5'} shadow-md`}></div>
                                            </div>
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


                {/* Sync Log FAB */}
                <AnimatePresence>
                    {isLogOpen && (
                        <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} transition={{ type: "spring", bounce: 0.3, duration: 0.8 }}
                            className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-4xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-40">
                            <div className="h-1 w-full bg-gradient-to-r from-purple-500/80 via-amber-400 to-purple-500/80"></div>
                            <div className="p-5 flex flex-col gap-4">
                                <div className="flex justify-between items-center border-b border-zinc-200 dark:border-zinc-800 pb-3">
                                    <div className="flex items-center justify-between w-full">
                                        <h3 className="text-amber-700 dark:text-amber-300 text-sm font-bold flex items-center gap-2 tracking-widest uppercase"><Activity size={16} className="text-amber-600 dark:text-amber-400" /> Sync Log History</h3>
                                        <button onClick={() => {
                                            if (!currentRepo) return;
                                            simulateConflict(currentRepo);
                                        }} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/25 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 hover:border-purple-400/50 hover:shadow-[0_0_12px_rgba(168,85,247,0.2)] transition-all font-bold text-xs">
                                            <Wand size={14} /> Simulate Inbound Edit
                                        </button>
                                    </div>
                                    <button onClick={() => setIsLogOpen(false)} className="ml-4 p-1 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"><X size={18} /></button>
                                </div>
                                <div className="h-40 lg:h-48 overflow-y-auto space-y-3 font-mono text-xs pr-2 custom-scrollbar flex flex-col-reverse">
                                    <AnimatePresence>
                                        {syncLogs.map((log) => (
                                            <motion.div key={log.id} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-4">
                                                <span className={`${log.message.includes('merged') ? 'text-green-400 font-bold' : 'text-amber-600 dark:text-amber-400'} w-20 shrink-0`}>{log.time}:</span>
                                                <span className={`${log.message.includes('merged') ? 'text-green-300' : 'text-zinc-600 dark:text-zinc-300'}`}>{log.message}</span>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <motion.button onClick={() => setIsLogOpen(!isLogOpen)} variants={floatAnim} initial="initial" animate="animate" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                    className={`absolute bottom-8 right-8 w-14 h-14 rounded-full flex items-center justify-center z-30 shadow-xl border border-zinc-200 dark:border-zinc-700 ${isLogOpen ? 'bg-purple-600/80 text-white' : 'bg-white dark:bg-zinc-900 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-zinc-800'}`}>
                    <Terminal size={24} />
                </motion.button>
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
                        author: 'Remote Collaborator',
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
                                    const serverC = current.serverText;
                                    // ── Three-Way HTML Merge ──────────────────────────────────────────────────
                                    // Strategy: Parse each version into <p>/<h1><h2><ul><li> block nodes.
                                    // Compare each original block against local and server.
                                    // If local changed a paragraph → keep local's version.
                                    // If server changed a paragraph → keep server's version.
                                    // If both changed the SAME paragraph → keep local (user intent wins).
                                    // Non-conflicting changes from both sides get merged into one document.
                                    const threeWayMerge = (orig: string, local: string, server: string): string => {
                                        const parseBlocks = (html: string): string[] => {
                                            if (!html || !html.trim()) return [];
                                            const blockTagRe = /<(p|h[1-6]|ul|ol|li|blockquote|pre|div)[^>]*>[\s\S]*?<\/\1>/gi;
                                            const blocks = html.match(blockTagRe) || [];
                                            if (blocks.length === 0 && html.trim()) return [html.trim()];
                                            return blocks;
                                        };
                                        const origBlocks = parseBlocks(orig);
                                        const localBlocks = parseBlocks(local);
                                        const serverBlocks = parseBlocks(server);
                                        if (origBlocks.length === 0) {
                                            // No original to compare → combine both (local first)
                                            const combined = [...localBlocks];
                                            serverBlocks.forEach(sb => { if (!localBlocks.some(lb => lb.trim() === sb.trim())) combined.push(sb); });
                                            return combined.join('\n');
                                        }
                                        const mergedBlocks: string[] = [];
                                        const maxLen = Math.max(origBlocks.length, localBlocks.length, serverBlocks.length);
                                        for (let i = 0; i < maxLen; i++) {
                                            const o = (origBlocks[i] || '').trim();
                                            const l = (localBlocks[i] || '').trim();
                                            const s = (serverBlocks[i] || '').trim();
                                            const localChanged = l && l !== o;
                                            const serverChanged = s && s !== o;
                                            
                                            if (l || s) {
                                                // ── Smart Inclusive Union Merge ──
                                                // Strategy: If both have content, we union the unique words.
                                                // This ensures "Paul John" (server) + "Paul Palamara" (local)
                                                // becomes "Paul John Palamara".
                                                
                                                const strip = (h: string) => h.replace(/<[^>]*>/g, '').trim();
                                                const lText = strip(l);
                                                const sText = strip(s);
                                                const oText = strip(o);

                                                if (lText && sText && (lText !== oText || sText !== oText)) {
                                                    const lWords = lText.split(/\s+/);
                                                    const sWords = sText.split(/\s+/);
                                                    const oWords = oText.split(/\s+/);

                                                    // Identify NEW words from both sides
                                                    const lNew = lWords.filter(w => !oWords.includes(w));
                                                    const sNew = sWords.filter(w => !oWords.includes(w));
                                                    
                                                    // Start with original words, then add additions from both
                                                    const mergedWords = [...oWords];
                                                    
                                                    // Slot in server additions then local additions
                                                    sNew.forEach(w => { if (!mergedWords.includes(w)) mergedWords.push(w); });
                                                    lNew.forEach(w => { if (!mergedWords.includes(w)) mergedWords.push(w); });

                                                    const mergedText = mergedWords.join(' ').trim();
                                                    
                                                    // Wrap in local's tag format if local was HTML
                                                    const tagMatch = l.match(/^<([a-z1-6]+)/i);
                                                    const tag = tagMatch ? tagMatch[1] : 'p';
                                                    mergedBlocks.push(`<${tag}>${mergedText}</${tag}>`);
                                                } else {
                                                    // Fallback to simpler block logic if one side is empty or neither changed from o
                                                    if (lText && lText !== oText) mergedBlocks.push(l);
                                                    else if (sText && sText !== oText) mergedBlocks.push(s);
                                                    else mergedBlocks.push(l || s);
                                                }
                                            }
                                        }
                                        // Append server-only NEW paragraphs (past original length)
                                        for (let i = origBlocks.length; i < serverBlocks.length; i++) {
                                            const s = serverBlocks[i]?.trim();
                                            if (s && !mergedBlocks.some(b => b.trim() === s)) mergedBlocks.push(s);
                                        }
                                        return mergedBlocks.join('\n');
                                    };
                                    const finalContent = actionType === 'local' ? localC
                                        : actionType === 'server' ? serverC
                                            : threeWayMerge(originalContent, localC, serverC);
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

                    const renderContent = (text: string, highlight: string, color: 'green' | 'blue') => {
                        if (isHtml(text)) {
                            // Rich-text HTML — render it properly
                            return (
                                <div
                                    dangerouslySetInnerHTML={{ __html: text }}
                                    className="conflict-html-preview"
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
                            ? 'bg-green-500/15 text-green-700 dark:text-green-300 px-1 py-0.5 rounded-md border-b-2 border-green-500/40'
                            : 'bg-blue-500/15 text-blue-700 dark:text-blue-300 px-1 py-0.5 rounded-md border-b-2 border-blue-500/40';
                        return <p>{before}<mark className={hlClass}>{highlight}</mark>{after}</p>;
                    };

                    return (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-xl" onClick={() => { setConflictFile(null); setConflictIndex(0); setResolvedConflicts([]); }}>
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white/90 dark:bg-zinc-900/85 backdrop-blur-2xl border border-white/20 dark:border-white/10 rounded-2xl shadow-[0_25px_80px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden w-[95%] max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                                <div className="h-1 w-full bg-gradient-to-r from-amber-500/50 via-amber-400 to-amber-500/50"></div>

                                {/* Header */}
                                <div className="px-6 pt-5 pb-4 border-b border-white/10 flex justify-between items-start">
                                    <div>
                                        <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2.5"><AlertTriangle size={22} className="text-amber-500" /> Conflict Resolution</h2>
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
                                    <motion.div animate={{ width: `${progressPercent}%` }} transition={{ duration: 0.4, ease: 'easeOut' }} className="h-full bg-gradient-to-r from-amber-500 to-green-500 rounded-r-full" />
                                </div>

                                {/* Document Comparison */}
                                <div className="px-6 py-5 overflow-y-auto flex-1">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        {/* Local Version */}
                                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden shadow-sm">
                                            <div className="bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700 flex items-center gap-2">
                                                <Laptop size={16} className="text-green-500" />
                                                <span className="text-sm font-bold text-zinc-900 dark:text-white">Your Local Version</span>
                                                <span className="ml-auto text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-md font-semibold">Your edits</span>
                                            </div>
                                            <div className="overflow-y-auto max-h-64 bg-white text-zinc-800 text-sm leading-[1.8]" style={{ fontFamily: "'Georgia', 'Times New Roman', serif", padding: '1.25rem' }}>
                                                {renderContent(current.localText, current.localHighlight, 'green')}
                                            </div>
                                        </div>

                                        {/* Server Version */}
                                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden shadow-sm">
                                            <div className="bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700 flex items-center gap-2">
                                                <Database size={16} className="text-blue-500" />
                                                <span className="text-sm font-bold text-zinc-900 dark:text-white">Server Version</span>
                                                <span className="ml-auto text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-md font-semibold">{current.author}&apos;s edits</span>
                                            </div>
                                            <div className="overflow-y-auto max-h-64 bg-white text-zinc-800 text-sm leading-[1.8]" style={{ fontFamily: "'Georgia', 'Times New Roman', serif", padding: '1.25rem' }}>
                                                {renderContent(current.serverText, current.serverHighlight, 'blue')}
                                            </div>
                                        </div>
                                    </div>

                                    {/* OT Analysis */}
                                    <div className="mt-5 rounded-xl border border-white/10 bg-white/20 dark:bg-white/5 backdrop-blur-sm p-4">
                                        <div className="flex items-center gap-2 mb-2"><GitMerge size={16} className="text-amber-500" /><span className="text-sm font-bold text-zinc-900 dark:text-white">Operational Transformation Analysis</span></div>
                                        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">The OT algorithm detected <span className="font-semibold text-amber-600 dark:text-amber-400">{totalConflicts} conflicting regions</span> across pages {conflicts.map(c => c.page).join(', ')} of this document. Each conflict can be resolved independently. Auto-merge will attempt to combine non-overlapping changes.</p>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="px-6 py-4 border-t border-white/10 flex flex-col sm:flex-row gap-3 bg-white/20 dark:bg-white/5">
                                    <button disabled={isCurrentResolved} onClick={() => handleResolve('local')} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-white/10 border border-white/10 text-zinc-200 hover:bg-white/15 hover:border-white/20 transition-all text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed backdrop-blur-sm"><Laptop size={16} /> Keep Local</button>
                                    <button disabled={isCurrentResolved} onClick={() => handleResolve('server')} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-white/10 border border-white/10 text-zinc-200 hover:bg-white/15 hover:border-white/20 transition-all text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed backdrop-blur-sm"><Database size={16} /> Keep Server</button>
                                    <button disabled={isCurrentResolved} onClick={() => handleResolve('merge')} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white shadow-[0_0_20px_rgba(249,115,22,0.35)] hover:shadow-[0_0_30px_rgba(249,115,22,0.55)] transition-all text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed"><GitMerge size={16} /> Auto-Merge</button>
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
                    return (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex justify-end bg-black/50 backdrop-blur-sm" onClick={() => setIsGroupManageOpen(false)}>
                            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="bg-zinc-50/95 dark:bg-zinc-950/95 backdrop-blur-2xl border-l border-white/5 shadow-[0_0_60px_rgba(0,0,0,0.5)] w-full max-w-2xl h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
                                {/* Header */}
                                <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl z-10">
                                    <div>
                                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                                            <Settings className="text-amber-500" /> Manage Group
                                        </h2>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{activeRepo.name} • {activeRepo.members.length} members</p>
                                    </div>
                                    <button onClick={() => setIsGroupManageOpen(false)} className="p-2 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"><X size={24} /></button>
                                </div>

                                <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar flex flex-col gap-8">
                                    {/* Invite Member Section */}
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

                                    {/* Existing Members List */}
                                    <div>
                                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                                            <Users size={18} className="text-zinc-400" /> Active Members
                                        </h3>
                                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                                            {activeRepo.members.map((member, idx) => (
                                                <div key={idx} className="px-6 py-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group/member">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-sm ${member.badge === 'amber' ? 'bg-gradient-to-tr from-amber-500 to-amber-600' : member.badge === 'purple' ? 'bg-gradient-to-tr from-purple-500 to-purple-600' : 'bg-gradient-to-tr from-zinc-400 to-zinc-500'}`}>
                                                            {member.name.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <span className="font-bold text-zinc-900 dark:text-zinc-200">{member.name}</span>
                                                            {member.name === 'You' && <span className="ml-2 text-xs text-amber-600 dark:text-amber-400 font-semibold">(You)</span>}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        {isOwner && member.name !== 'You' ? (
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
                                                </div>
                                            ))}
                                        </div>

                                        {/* Danger Zone: Delete Repository */}
                                        {isOwner && (
                                            <div className="mt-4 rounded-2xl border-2 border-rose-500/30 bg-rose-50/30 dark:bg-rose-900/10 p-6">
                                                <h3 className="text-base font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2 mb-2"><AlertTriangle size={18} /> Danger Zone</h3>
                                                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">Permanently delete this repository and all its files. This action cannot be undone.</p>
                                                <button onClick={() => setIsDeleteRepoOpen(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-rose-500/50 text-rose-600 dark:text-rose-400 bg-white dark:bg-zinc-900 hover:bg-rose-500 hover:text-white hover:border-rose-600 transition-all font-bold text-sm">
                                                    <Trash2 size={16} /> Delete Repository
                                                </button>
                                            </div>
                                        )}
                                        {!isOwner && (
                                            <div className="mt-4 bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4 flex items-center gap-3">
                                                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 shrink-0"><Shield size={16} /></div>
                                                <div>
                                                    <p className="text-xs font-bold text-zinc-900 dark:text-white">Restricted Permissions</p>
                                                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Only the repository Owner can invite members, change roles, or remove users.</p>
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

            {/* File Text Editor Modal (Module 3) */}
            <AnimatePresence>
                {editingFile && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.2 } }} exit={{ opacity: 0, transition: { duration: 0.25 } }} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-xl">
                        <motion.div initial={{ opacity: 0, scale: 0.97, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }} exit={{ opacity: 0, scale: 0.97, y: 16, transition: { duration: 0.2, ease: "easeIn" } }} className="bg-white/90 dark:bg-zinc-900/85 backdrop-blur-2xl border border-white/20 dark:border-white/10 rounded-2xl shadow-[0_25px_80px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden w-[98%] max-w-4xl" style={{ height: '88vh' }}>
                            <div className="h-1 w-full bg-gradient-to-r from-purple-500 via-amber-400 to-purple-500" />
                            <div className="px-6 pt-5 pb-4 border-b border-white/10 flex justify-between items-center">
                                <div>
                                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                                        <FileText size={20} className="text-amber-500" /> {editingFile.name}
                                    </h2>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Editing locally — saving will trigger conflict check</p>
                                </div>
                                <button onClick={() => setEditingFile(null)} className="p-1.5 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"><X size={20} /></button>
                            </div>
                            <div className="flex-1 overflow-hidden p-0">
                                <RichTextEditor
                                    content={editingFile.content || ''}
                                    onChange={(html) => setEditorText(html)}
                                />
                            </div>
                            <div className="px-6 py-4 border-t border-white/10 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-900/50">
                                <span className="text-xs text-zinc-500 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse inline-block" />
                                    Rich Text Editor &mdash; formatting preserved on save
                                </span>
                                <div className="flex gap-3">
                                    <button onClick={() => setEditingFile(null)} className="px-5 py-2.5 rounded-xl border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-all text-sm font-semibold backdrop-blur-sm">Cancel</button>
                                    <button onClick={() => {
                                        if (!currentRepo || !editingFile) return;
                                        // Capture the ORIGINAL content (before editing) as server version
                                        const originalContent = editingFile.content || '';

                                        // ── Intelligent Server Content Generator ──
                                        let generatedServerContent = originalContent;
                                        const realisticEdit = ' <span style="background-color: #fef08a; padding: 0 4px; border-radius: 4px; color: #854d0e; font-weight: 500;">[This Page has been Auto-Sync]</span>';

                                        if (originalContent.includes('<p>')) {
                                            const pTags = originalContent.match(/<p>[\\s\\S]*?<\/p>/g);
                                            if (pTags && pTags.length > 0) {
                                                const targetIdx = pTags.length > 1 ? pTags.length - 1 : 0;
                                                const targetP = pTags[targetIdx];
                                                const newP = targetP.replace(/(<\/p>)s*$/i, realisticEdit + '$1');
                                                // Replace only the LAST occurrence if there are duplicates to avoid touching the first paragraph
                                                const lastIndex = originalContent.lastIndexOf(targetP);
                                                if (lastIndex !== -1) {
                                                    generatedServerContent = originalContent.substring(0, lastIndex) + newP + originalContent.substring(lastIndex + targetP.length);
                                                } else {
                                                    generatedServerContent = originalContent.replace(targetP, newP);
                                                }
                                            } else {
                                                generatedServerContent += '<p>' + realisticEdit + '</p>';
                                            }
                                        } else if (originalContent.trim().length > 0) {
                                            generatedServerContent += '\n\n' + realisticEdit;
                                        }
                                        // ──────────────────────────────────────────

                                        const newContent = editorText;
                                        saveFileContent(currentRepo, editingFile.name, newContent, generatedServerContent);
                                        const pendingName = editingFile.name;
                                        setEditingFile(null);
                                        setTimeout(() => {
                                            setDynamicConflict({ localContent: newContent, serverContent: generatedServerContent, originalContent: originalContent });
                                            setConflictFile(pendingName);
                                            setConflictIndex(0);
                                            setResolvedConflicts([]);
                                        }, 400);
                                    }} className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white shadow-[0_0_20px_rgba(249,115,22,0.35)] hover:shadow-[0_0_28px_rgba(249,115,22,0.5)] transition-all text-sm font-bold flex items-center gap-2">
                                        <RefreshCcw size={16} /> Save
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
                                            { name: 'User S', initial: 'S', gradient: 'from-amber-500 to-amber-600', status: 'online', label: '🟢 Online' },
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

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
            `}</style>
        </div>
    );
}
