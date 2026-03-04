"use client";

import React, { useState } from 'react';
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

    const floatAnim = {
        initial: { y: 0 },
        animate: {
            y: [-3, 3, -3],
            transition: { duration: 5, repeat: Infinity, ease: "easeInOut" as const }
        }
    };

    const navItems = [
        { name: 'Profile', icon: User },
        { name: 'My Drive', icon: Database },
        { name: 'Recent', icon: Clock },
        { name: 'Starred', icon: Star },
        { name: 'Trash', icon: Trash2 },
    ];

    const initialReposData = [
        {
            id: 1, name: 'Main-Sync-Repo', lastSynced: 'Just now', status: 'Up to date', userRole: 'Owner' as const,
            members: [
                { name: 'You', role: 'Owner', badge: 'amber' },
                { name: 'User S', role: 'Editor', badge: 'purple' },
                { name: 'Prof. Davis', role: 'Viewer', badge: 'zinc' },
            ], pendingRequests: [
                { id: 101, name: 'David Lee', email: 'david.lee@university.edu', date: '10 min ago' },
                { id: 102, name: 'Dr. Sarah Chen', email: 'schen@university.edu', date: '2 hrs ago' }
            ],
            files: [
                { id: 1, name: 'Project_Proposal.docx', type: 'word', syncStatus: 'synced', date: 'Apr 3, 2026 13:27', isSyncing: false },
                { id: 2, name: 'Q3_Report.docx', type: 'word', syncStatus: 'synced', date: 'Apr 3, 2026 13:26', isSyncing: false },
                { id: 5, name: 'Design_System.docx', type: 'word', syncStatus: 'synced', date: 'Apr 5, 2026 09:12', isSyncing: false },
            ]
        },
        {
            id: 2, name: 'Project-Beta-Repo', lastSynced: '2 hrs ago', status: 'Syncing...', userRole: 'Editor' as const,
            members: [
                { name: 'Dr. Lim', role: 'Owner', badge: 'amber' },
                { name: 'You', role: 'Editor', badge: 'purple' },
                { name: 'Research Asst. M', role: 'Editor', badge: 'purple' },
                { name: 'Intern K', role: 'Viewer', badge: 'zinc' },
            ],
            files: [
                { id: 3, name: 'Beta_Release_Plan.docx', type: 'word', syncStatus: 'conflict', date: 'Apr 4, 2026 13:35', isSyncing: false },
                { id: 4, name: 'Beta_Budget_Report.docx', type: 'word', syncStatus: 'synced', date: 'Apr 4, 2026 15:42', isSyncing: false },
                { id: 8, name: 'System_Architecture.docx', type: 'word', syncStatus: 'conflict', date: 'Apr 2, 2026 09:15', isSyncing: false },
                { id: 9, name: 'Database_Documentation.docx', type: 'word', syncStatus: 'conflict', date: 'Apr 3, 2026 11:20', isSyncing: false },
            ]
        },
        {
            id: 3, name: 'External-Assets-Repo', lastSynced: '1 day ago', status: 'Up to date', userRole: 'Viewer' as const,
            members: [
                { name: 'Design Team', role: 'Owner', badge: 'amber' },
                { name: 'You', role: 'Viewer', badge: 'zinc' },
            ],
            files: [
                { id: 6, name: 'Brand_Guidelines.docx', type: 'word', syncStatus: 'synced', date: 'Apr 1, 2026 10:00', isSyncing: false },
                { id: 7, name: 'Logo_Pack_Guide.docx', type: 'word', syncStatus: 'synced', date: 'Apr 1, 2026 10:05', isSyncing: false },
            ]
        }
    ];

    const [reposData, setReposData] = useState(initialReposData);

    const [syncLogs, setSyncLogs] = useState([
        { id: 1, time: '10:00 AM', message: 'System initialized. All files up to date.' }
    ]);

    const simulateIncomingEdit = () => {
        if (!currentRepo) return;
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const repoIndex = reposData.findIndex(r => r.name === currentRepo);
        if (repoIndex === -1 || reposData[repoIndex].files.length === 0) return;
        const targetFilename = reposData[repoIndex].files[0].name;

        setSyncLogs(prev => [{ id: Date.now(), time: now, message: `Remote edit detected on '${targetFilename}' by another user.` }, ...prev]);
        setReposData(prev => {
            const next = [...prev];
            next[repoIndex].files = next[repoIndex].files.map(f =>
                f.name === targetFilename ? { ...f, syncStatus: 'syncing...', isSyncing: true } : f
            );
            return next;
        });

        setTimeout(() => {
            const finalNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setSyncLogs(prev => [{ id: Date.now(), time: finalNow, message: `OT Algorithm applied. '${targetFilename}' merged automatically.` }, ...prev]);
            setReposData(prev => {
                const next = [...prev];
                const rIndex = next.findIndex(r => r.name === currentRepo);
                if (rIndex !== -1) {
                    next[rIndex].files = next[rIndex].files.map(f =>
                        f.name === targetFilename ? { ...f, syncStatus: 'synced', isSyncing: false } : f
                    );
                }
                return next;
            });
        }, 2500);
    };

    const getFileIconColors = (type: string) => {
        return 'from-blue-500/20 to-blue-600/20 text-blue-500 border-blue-500/30';
    };

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 transition-colors duration-300 font-sans selection:bg-amber-500/30 relative overflow-hidden flex">
            {/* Ambient Background */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-amber-600/10 dark:bg-amber-900/20 blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-amber-500/10 dark:bg-zinc-800/50 blur-[150px]" />
            </div>

            {/* ═══════════ USER SIDEBAR (Amber) ═══════════ */}
            <div className="relative z-10 w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 backdrop-blur-2xl px-5 py-8 flex flex-col shadow-[10px_0_30px_rgba(0,0,0,0.5)]">
                <motion.div variants={floatAnim} initial="initial" animate="animate" className="flex items-center gap-3 mb-12 cursor-pointer">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 shadow-lg flex items-center justify-center">
                        <RefreshCcw size={18} className="text-white" />
                    </div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-600 to-orange-700 dark:from-amber-400 dark:to-orange-400 tracking-tight">
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
                                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 shadow-md border border-amber-200 dark:border-amber-900/50'
                                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent'
                                    }`}
                                whileHover={{ scale: isActive ? 1 : 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <item.icon size={18} className={isActive ? "text-amber-600 dark:text-amber-400" : ""} />
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
                    <div className="flex items-center text-sm font-medium bg-white dark:bg-zinc-900 backdrop-blur-md px-5 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-md">
                        <span className="text-zinc-900 dark:text-zinc-100 font-bold tracking-wide">My Drive Overview</span>
                    </div>

                    <div className="flex items-center gap-4 bg-white dark:bg-zinc-900 backdrop-blur-md px-5 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-md">
                        <ThemeToggle />
                        <div className={`hidden md:flex items-center gap-2 mr-2 px-3 py-1.5 rounded-xl border transition-colors duration-300 ${isOffline ? 'border-zinc-300 dark:border-zinc-600 bg-zinc-200 dark:bg-zinc-700' : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800'}`}>
                            <div className={`w-2 h-2 rounded-full ${isOffline ? 'bg-zinc-500' : 'bg-green-500 animate-pulse'}`}></div>
                            <span className={`text-xs font-bold ${isOffline ? 'text-zinc-600 dark:text-zinc-300' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                {isOffline ? 'Offline (Queuing Edits)' : 'Online (WebSocket Active)'}
                            </span>
                        </div>
                        <button onClick={() => {
                            if (!currentRepo) return;
                            setReposData(prev => {
                                const next = [...prev];
                                const rIdx = next.findIndex(r => r.name === currentRepo);
                                if (rIdx !== -1) {
                                    next[rIdx].files = next[rIdx].files.map(f =>
                                        f.syncStatus === 'conflict' ? { ...f, syncStatus: 'syncing...', isSyncing: true } : f
                                    );
                                }
                                return next;
                            });
                            setTimeout(() => {
                                setReposData(prev => {
                                    const next = [...prev];
                                    const rIdx = next.findIndex(r => r.name === currentRepo);
                                    if (rIdx !== -1) {
                                        next[rIdx].files = next[rIdx].files.map(f =>
                                            f.isSyncing && f.syncStatus === 'syncing...' ? { ...f, syncStatus: 'synced', isSyncing: false } : f
                                        );
                                    }
                                    return next;
                                });
                            }, 1500);
                        }} className="mr-3 flex items-center gap-2 px-4 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 hover:bg-purple-500/20 hover:border-purple-500/60 transition-all font-semibold text-xs" title="Simulate mass auto-merge">
                            <Wand size={16} /> SIMULATE
                        </button>
                        <button onClick={() => setIsUploadOpen(true)} className="mr-3 flex items-center gap-2 px-4 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-amber-600 dark:text-amber-400 hover:bg-amber-100 hover:border-amber-300 transition-all font-semibold text-xs">
                            <UploadCloud size={16} /> Sync Edits (Check-in)
                        </button>
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
                            <div className="flex flex-row items-center justify-between w-full mb-6 px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
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
                                            <button onClick={() => setIsCreateRepoOpen(true)} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-md shadow-amber-500/20">
                                                <FolderPlus size={16} /> Create Repository
                                            </button>
                                            <button onClick={() => setIsJoinRepoOpen(true)} className="flex items-center gap-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400 px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-sm">
                                                <Link2 size={16} /> Join Repository
                                            </button>
                                        </div>
                                    ) : (
                                        <button className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-md shadow-amber-500/20">
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
                                    <div className="grid grid-cols-[3fr_1fr_1fr_auto] gap-4 px-6 py-4 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md z-10">
                                        <div>Name</div><div>Status</div><div>Last Synced</div><div className="w-8"></div>
                                    </div>
                                    <div className="mt-4 flex flex-col gap-3">
                                        <AnimatePresence mode="popLayout">
                                            {reposData.map((repo, i) => (
                                                <motion.div key={`repo-${repo.id}`} onClick={() => setCurrentRepo(repo.name)}
                                                    initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ delay: i * 0.1 }} whileHover={{ scale: 1.005 }}
                                                    className="grid grid-cols-[3fr_1fr_1fr_auto] gap-4 items-center px-6 py-4 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 cursor-pointer hover:border-amber-300 dark:hover:border-amber-700 transition-all duration-300 group">
                                                    <div className="flex items-center gap-4">
                                                        <div className="p-2.5 rounded-xl bg-gradient-to-br border from-orange-500/20 to-purple-600/20 text-orange-400 border-orange-500/30"><Folder size={20} /></div>
                                                        <span className="font-medium text-zinc-900 dark:text-zinc-200">{repo.name}</span>
                                                    </div>
                                                    <div>{repo.status === 'Up to date' ? (<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-medium"><CheckCircle2 size={14} /> {repo.status}</div>) : (<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/30 text-xs font-medium animate-pulse"><RefreshCcw size={14} /> {repo.status}</div>)}</div>
                                                    <div className="text-sm text-zinc-500 dark:text-zinc-400">{repo.lastSynced}</div>
                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={(e) => e.stopPropagation()} className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500"><MoreVertical size={18} /></button></div>
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
                                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md z-10">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-500 border border-amber-500/30">
                                                    <Folder size={20} />
                                                </div>
                                                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{activeRepo?.name}</h2>
                                                <div className="ml-2 px-2.5 py-1 rounded-lg border bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-bold flex items-center gap-1.5">
                                                    <Shield size={12} /> Role: {activeRepo?.userRole}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => setIsGroupManageOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-amber-600 hover:border-amber-400 dark:hover:text-amber-400 dark:hover:border-amber-600 shadow-sm text-sm font-semibold">
                                                    <Settings size={16} /> Manage Group
                                                </button>
                                            </div>
                                        </div>

                                        {/* File List */}
                                        <div className="grid grid-cols-[3fr_2fr_2fr_auto] items-center gap-4 px-6 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                                            <div className="text-left">Name</div><div className="text-left">Sync Status</div><div className="text-left">Last Modified</div><div className="w-48"></div>
                                        </div>
                                        <div className="mt-4 flex flex-col gap-3">
                                            <AnimatePresence mode="popLayout">
                                                {activeRepo?.files.map((file, i) => (
                                                    <motion.div key={`file-${file.id}`} onClick={() => setSelectedFile(file.name)}
                                                        initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ delay: i * 0.1 }} whileHover={{ scale: 1.005 }}
                                                        className={`grid grid-cols-[3fr_2fr_2fr_auto] items-center gap-4 px-6 py-4 rounded-2xl border cursor-pointer transition-all duration-300 group relative ${file.isSyncing ? 'bg-yellow-500/5 border-yellow-500/30' : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-800 hover:border-amber-300 dark:hover:border-amber-700'}`}>
                                                        <div className="flex items-center gap-4">
                                                            <div className={`p-2.5 rounded-xl bg-gradient-to-br border ${getFileIconColors(file.type)}`}><FileText size={20} /></div>
                                                            <span className="font-medium text-zinc-900 dark:text-zinc-200">{file.name}</span>
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
                                                        <div className={`transition-opacity flex items-center justify-end gap-3 w-48 ${openMenuId === file.name ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                            <div className="flex items-center gap-2">
                                                                <button onClick={(e) => { e.stopPropagation(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-bold hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 shadow-sm" title="Download File (Check Out)">
                                                                    <Download size={14} /> <span className="hidden sm:inline">Check-Out</span>
                                                                </button>
                                                                {file.syncStatus === 'conflict' && (
                                                                    <button onClick={(e) => { e.stopPropagation(); setConflictFile(file.name); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 shadow-sm" title="Resolve Conflict">
                                                                        <GitMerge size={14} /> <span className="hidden sm:inline">Resolve</span>
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === file.name ? null : file.name); }} className="p-2 shrink-0 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500"><MoreVertical size={18} /></button>
                                                        </div>
                                                        <AnimatePresence>
                                                            {openMenuId === file.name && (
                                                                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute right-10 top-8 w-56 bg-white dark:bg-zinc-900 backdrop-blur-xl border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                                                                    <div className="flex flex-col">
                                                                        {file.syncStatus === 'conflict' && (
                                                                            <>
                                                                                <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); setConflictFile(file.name); }} className="flex items-center gap-3 hover:bg-amber-500/10 px-4 py-3 cursor-pointer transition-colors text-sm text-amber-500 font-semibold"><AlertTriangle size={16} /><span>⚠️ Resolve Conflict</span></div>
                                                                                <div className="border-b border-zinc-200 dark:border-zinc-700/50"></div>
                                                                            </>
                                                                        )}
                                                                        <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }} className="flex items-center gap-3 hover:bg-zinc-100 dark:hover:bg-zinc-700 px-4 py-3 cursor-pointer transition-colors text-sm text-zinc-900 dark:text-zinc-200"><Download size={16} /><span>Download (Check-out)</span></div>
                                                                        <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }} className="flex items-center gap-3 hover:bg-zinc-100 dark:hover:bg-zinc-700 px-4 py-3 cursor-pointer transition-colors text-sm text-zinc-900 dark:text-zinc-200"><WifiOff size={16} /><span>Make Available Offline</span></div>
                                                                        <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }} className="flex items-center gap-3 hover:bg-zinc-100 dark:hover:bg-zinc-700 px-4 py-3 cursor-pointer transition-colors text-sm text-zinc-900 dark:text-zinc-200"><Users size={16} /><span>Share with Group</span></div>
                                                                        <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }} className="flex items-center gap-3 hover:bg-zinc-100 dark:hover:bg-zinc-700 px-4 py-3 cursor-pointer transition-colors text-sm text-rose-400"><Trash2 size={16} /><span>Delete File</span></div>
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </motion.div>
                                                ))}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                );
                            })()}
                        </>
                    ) : activeTab === 'Profile' ? (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full max-w-6xl mx-auto items-start">
                            <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl p-8 flex flex-col items-center space-y-6 shadow-xl">
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
                                <button onClick={() => setIsLogoutModalOpen(true)} className="flex items-center gap-2 border border-rose-500/50 text-rose-400 hover:bg-rose-500/10 px-8 py-3 rounded-xl transition-all font-semibold mt-4 w-full justify-center">
                                    <LogOut size={18} /> Log Out
                                </button>
                            </div>
                            <div className="lg:col-span-2 flex flex-col">
                                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl p-8 mb-8 shadow-xl">
                                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-6 flex items-center gap-2"><Shield size={20} className="text-amber-600 dark:text-amber-400" /> System Preferences</h3>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                                            <div className="flex items-center gap-4"><div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"><Wifi size={18} /></div><div><p className="text-zinc-900 dark:text-white font-medium">Auto-Sync on Cellular</p><p className="text-sm text-zinc-500 dark:text-zinc-400">Allow background syncing when disconnected from Wi-Fi</p></div></div>
                                            <div className="w-12 h-6 rounded-full bg-amber-500 relative cursor-pointer"><div className="w-5 h-5 rounded-full bg-white absolute top-0.5 right-0.5 shadow-md"></div></div>
                                        </div>
                                        <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                                            <div className="flex items-center gap-4"><div className="p-2 rounded-lg bg-purple-500/10 text-purple-400"><Bell size={18} /></div><div><p className="text-zinc-900 dark:text-white font-medium">Desktop Notifications</p><p className="text-sm text-zinc-500 dark:text-zinc-400">Receive alerts for conflicts and completed syncs</p></div></div>
                                            <div className="w-12 h-6 rounded-full bg-purple-500 relative cursor-pointer"><div className="w-5 h-5 rounded-full bg-white absolute top-0.5 right-0.5 shadow-md"></div></div>
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
                                    <h3 className="text-amber-700 dark:text-amber-300 text-sm font-bold flex items-center gap-2 tracking-widest uppercase"><Activity size={16} className="text-amber-600 dark:text-amber-400" /> Sync Horizon Log</h3>
                                    <button onClick={() => setIsLogOpen(false)} className="p-1 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"><X size={18} /></button>
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

            {/* Upload Modal */}
            <AnimatePresence>
                {isUploadOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md">
                        <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[90%] max-w-lg">
                            <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500"></div>
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-xl font-bold text-amber-600 dark:text-amber-400">Check-In to DocuSync</h2>
                                    <button onClick={() => setIsUploadOpen(false)} className="p-1 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"><X size={20} /></button>
                                </div>
                                <div className="border-2 border-dashed border-amber-400/50 hover:border-amber-400 bg-zinc-50 dark:bg-zinc-800 rounded-xl p-10 flex flex-col items-center justify-center gap-4 transition-colors cursor-pointer group">
                                    <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center group-hover:scale-110 transition-transform"><FileUp size={32} className="text-amber-600 dark:text-amber-400" /></div>
                                    <p className="text-center text-zinc-600 dark:text-zinc-300 font-medium">Drag & drop your files here, or <span className="text-amber-600 dark:text-amber-400 underline">click to browse</span></p>
                                    <p className="text-xs text-zinc-500">Supports PDF, Word, Excel, and Design files up to 50MB</p>
                                </div>
                                <div className="mt-8 flex justify-end gap-4">
                                    <button onClick={() => setIsUploadOpen(false)} className="px-5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm font-semibold">Cancel</button>
                                    <button onClick={() => setIsUploadOpen(false)} className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-500/20 transition-all text-sm font-bold">Sync Files</button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Logout Modal */}
            <AnimatePresence>
                {isLogoutModalOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[90%] max-w-md">
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
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setIsCreateRepoOpen(false)}>
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
                                    <button onClick={() => { setIsCreateRepoOpen(false); setNewRepoName(''); }} className="px-5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm font-semibold">Cancel</button>
                                    <button onClick={() => { setIsCreateRepoOpen(false); setNewRepoName(''); }} className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-500/20 transition-all text-sm font-bold">Create Repository</button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Join Repository Modal */}
            <AnimatePresence>
                {isJoinRepoOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setIsJoinRepoOpen(false)}>
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
                                    <button onClick={() => { setIsJoinRepoOpen(false); setJoinInviteCode(''); }} className="px-5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm font-semibold">Cancel</button>
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
                    const conflicts = [
                        {
                            id: 1,
                            section: 'Introduction',
                            page: 2,
                            localText: 'The proposed DocuSync framework leverages Operational Transformation algorithms to enable seamless real-time collaboration across distributed teams. Our approach prioritizes conflict-free replicated data types (CRDTs) to ensure eventual consistency even under intermittent network conditions.',
                            localHighlight: 'Our approach prioritizes conflict-free replicated data types (CRDTs) to ensure eventual consistency even under intermittent network conditions.',
                            serverText: 'The proposed DocuSync framework leverages Operational Transformation algorithms to enable seamless real-time collaboration across distributed teams. Our approach focuses on a hybrid OT-CRDT model that balances consistency guarantees with low-latency synchronization across nodes.',
                            serverHighlight: 'Our approach focuses on a hybrid OT-CRDT model that balances consistency guarantees with low-latency synchronization across nodes.',
                            author: 'User S',
                        },
                        {
                            id: 2,
                            section: 'Methodology',
                            page: 4,
                            localText: 'Data collection was performed through structured interviews with 25 participants from three academic institutions. Each session lasted approximately 45 minutes and followed a semi-structured protocol approved by the university IRB.',
                            localHighlight: 'Each session lasted approximately 45 minutes and followed a semi-structured protocol approved by the university IRB.',
                            serverText: 'Data collection was performed through structured interviews with 25 participants from three academic institutions. Surveys were distributed digitally, and responses were analyzed using a mixed-methods approach combining quantitative metrics and thematic coding.',
                            serverHighlight: 'Surveys were distributed digitally, and responses were analyzed using a mixed-methods approach combining quantitative metrics and thematic coding.',
                            author: 'Prof. Davis',
                        },
                        {
                            id: 3,
                            section: 'Results & Discussion',
                            page: 6,
                            localText: 'The experimental results indicate a 34% reduction in synchronization latency compared to the baseline system. These findings suggest that the proposed architecture is well-suited for academic collaboration environments with up to 50 concurrent users.',
                            localHighlight: 'These findings suggest that the proposed architecture is well-suited for academic collaboration environments with up to 50 concurrent users.',
                            serverText: 'The experimental results indicate a 34% reduction in synchronization latency compared to the baseline system. However, scalability tests revealed performance degradation beyond 30 concurrent connections, indicating the need for further optimization of the WebSocket relay layer.',
                            serverHighlight: 'However, scalability tests revealed performance degradation beyond 30 concurrent connections, indicating the need for further optimization of the WebSocket relay layer.',
                            author: 'User S',
                        },
                    ];
                    const current = conflicts[conflictIndex];
                    const totalConflicts = conflicts.length;
                    const resolvedCount = resolvedConflicts.length;
                    const progressPercent = Math.round((resolvedCount / totalConflicts) * 100);
                    const isCurrentResolved = resolvedConflicts.includes(conflictIndex);

                    const handleResolve = () => {
                        if (!isCurrentResolved) {
                            const newResolved = [...resolvedConflicts, conflictIndex];
                            setResolvedConflicts(newResolved);
                            if (newResolved.length >= totalConflicts || conflictIndex === totalConflicts - 1) {
                                setReposData(prev => { const next = [...prev]; const rIdx = next.findIndex(r => r.name === currentRepo); if (rIdx !== -1) { next[rIdx].files = next[rIdx].files.map(f => f.name === conflictFile ? { ...f, syncStatus: 'syncing...', isSyncing: true } : f); } return next; });
                                setTimeout(() => { setConflictFile(null); setConflictIndex(0); setResolvedConflicts([]); }, 300);
                                setTimeout(() => {
                                    setReposData(prev => { const next = [...prev]; const rIdx = next.findIndex(r => r.name === currentRepo); if (rIdx !== -1) { next[rIdx].files = next[rIdx].files.map(f => f.name === conflictFile ? { ...f, syncStatus: 'synced', isSyncing: false } : f); } return next; });
                                }, 1500);
                            } else {
                                const nextUnresolved = conflicts.findIndex((_, i) => i > conflictIndex && !newResolved.includes(i));
                                if (nextUnresolved !== -1) setTimeout(() => setConflictIndex(nextUnresolved), 300);
                            }
                        }
                    };

                    const renderHighlighted = (fullText: string, highlight: string, color: 'green' | 'blue') => {
                        const idx = fullText.indexOf(highlight);
                        if (idx === -1) return <p>{fullText}</p>;
                        const before = fullText.slice(0, idx);
                        const after = fullText.slice(idx + highlight.length);
                        const hlClass = color === 'green'
                            ? 'bg-green-500/15 text-green-700 dark:text-green-300 px-1 py-0.5 rounded-md border-b-2 border-green-500/40'
                            : 'bg-blue-500/15 text-blue-700 dark:text-blue-300 px-1 py-0.5 rounded-md border-b-2 border-blue-500/40';
                        return <p>{before}<mark className={hlClass}>{highlight}</mark>{after}</p>;
                    };

                    return (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => { setConflictFile(null); setConflictIndex(0); setResolvedConflicts([]); }}>
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[95%] max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                                <div className="h-1 w-full bg-gradient-to-r from-amber-500/50 via-amber-400 to-amber-500/50"></div>

                                {/* Header */}
                                <div className="px-6 pt-5 pb-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-start">
                                    <div>
                                        <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2.5"><AlertTriangle size={22} className="text-amber-500" /> Conflict Resolution</h2>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">File: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{conflictFile}</span></p>
                                    </div>
                                    <button onClick={() => { setConflictFile(null); setConflictIndex(0); setResolvedConflicts([]); }} className="p-1.5 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"><X size={20} /></button>
                                </div>

                                {/* Conflict Navigator */}
                                <div className="px-6 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
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
                                            <div className="p-5 bg-white dark:bg-zinc-950 text-sm leading-[1.8] text-zinc-700 dark:text-zinc-300" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>
                                                {renderHighlighted(current.localText, current.localHighlight, 'green')}
                                            </div>
                                        </div>

                                        {/* Server Version */}
                                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden shadow-sm">
                                            <div className="bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700 flex items-center gap-2">
                                                <Database size={16} className="text-blue-500" />
                                                <span className="text-sm font-bold text-zinc-900 dark:text-white">Server Version</span>
                                                <span className="ml-auto text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-md font-semibold">{current.author}&apos;s edits</span>
                                            </div>
                                            <div className="p-5 bg-white dark:bg-zinc-950 text-sm leading-[1.8] text-zinc-700 dark:text-zinc-300" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>
                                                {renderHighlighted(current.serverText, current.serverHighlight, 'blue')}
                                            </div>
                                        </div>
                                    </div>

                                    {/* OT Analysis */}
                                    <div className="mt-5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4">
                                        <div className="flex items-center gap-2 mb-2"><GitMerge size={16} className="text-amber-500" /><span className="text-sm font-bold text-zinc-900 dark:text-white">Operational Transformation Analysis</span></div>
                                        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">The OT algorithm detected <span className="font-semibold text-amber-600 dark:text-amber-400">{totalConflicts} conflicting regions</span> across pages {conflicts.map(c => c.page).join(', ')} of this document. Each conflict can be resolved independently. Auto-merge will attempt to combine non-overlapping changes.</p>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row gap-3">
                                    <button disabled={isCurrentResolved} onClick={handleResolve} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"><Laptop size={16} /> Keep Local</button>
                                    <button disabled={isCurrentResolved} onClick={handleResolve} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"><Database size={16} /> Keep Server</button>
                                    <button disabled={isCurrentResolved} onClick={handleResolve} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-500/20 transition-all text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"><GitMerge size={16} /> Auto-Merge</button>
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
                                className="bg-zinc-50 dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-2xl h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
                                {/* Header */}
                                <div className="px-8 py-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-900 z-10">
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

            {/* Friends & Activity Slide-over Panel */}
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
