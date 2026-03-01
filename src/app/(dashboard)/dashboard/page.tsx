"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
    Folder, FileText, Clock, Star, Trash2, User,
    CheckCircle2, AlertTriangle, Share2,
    ChevronRight, MoreVertical, Search,
    Activity, RefreshCcw, Database,
    FileIcon, X, Terminal, UploadCloud, FileUp, Wand, LogOut,
    Monitor, Laptop, Lock, Bell, Wifi, Shield,
    Download, WifiOff, Users, Plus
} from 'lucide-react';

export default function DocuSyncDashboard() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('My Drive');
    const [isOffline, setIsOffline] = useState(false);
    const [queueOffline, setQueueOffline] = useState(true);
    const [isLogOpen, setIsLogOpen] = useState(false);
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [currentRepo, setCurrentRepo] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    // Floating animation variants
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
        { name: 'Groups & Access', icon: Users },
        { name: 'Recent', icon: Clock },
        { name: 'Starred', icon: Star },
        { name: 'Trash', icon: Trash2 },
    ];

    const [fileList, setFileList] = useState([
        { id: 1, name: 'Project_Proposal.docx', type: 'word', syncStatus: 'synced', date: 'Apr 3, 2026 13:27', isSyncing: false },
        { id: 2, name: 'Q3_Report.pdf', type: 'pdf', syncStatus: 'synced', date: 'Apr 3, 2026 13:26', isSyncing: false },
        { id: 3, name: 'Presentation_V2.pptx', type: 'ppt', syncStatus: 'conflict', date: 'Apr 4, 2026 13:35', isSyncing: false },
        { id: 4, name: 'Budget_Q4.xlsx', type: 'excel', syncStatus: 'synced', date: 'Apr 4, 2026 15:42', isSyncing: false },
        { id: 5, name: 'Design_System.fig', type: 'design', syncStatus: 'synced', date: 'Apr 5, 2026 09:12', isSyncing: false },
    ]);

    const [syncLogs, setSyncLogs] = useState([
        { id: 1, time: '10:00 AM', message: 'System initialized. All files up to date.' }
    ]);

    const simulateIncomingEdit = () => {
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const logId1 = Date.now();

        setSyncLogs(prev => [{ id: logId1, time: now, message: "Remote edit detected on 'Project_Proposal.docx' by User S." }, ...prev]);

        setFileList(prev => prev.map(f =>
            f.name === 'Project_Proposal.docx'
                ? { ...f, syncStatus: 'syncing...', isSyncing: true }
                : f
        ));

        setTimeout(() => {
            const finalNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setSyncLogs(prev => [{ id: Date.now(), time: finalNow, message: "OT Algorithm applied. 'Project_Proposal.docx' merged automatically. No user intervention required." }, ...prev]);

            setFileList(prev => prev.map(f =>
                f.name === 'Project_Proposal.docx'
                    ? { ...f, syncStatus: 'synced', isSyncing: false }
                    : f
            ));
        }, 2500);
    };

    const repos = [
        { id: 1, name: 'Main-Sync-Repo', lastSynced: 'Just now', status: 'Up to date' },
        { id: 2, name: 'Thesis-Docs', lastSynced: '2 hrs ago', status: 'Syncing...' },
    ];

    const getFileIconColors = (type: string) => {
        switch (type) {
            case 'word': return 'from-blue-500/20 to-blue-600/20 text-blue-400 border-blue-500/30';
            case 'pdf': return 'from-red-500/20 to-red-600/20 text-red-400 border-red-500/30';
            case 'ppt': return 'from-orange-500/20 to-orange-600/20 text-orange-400 border-orange-500/30';
            case 'excel': return 'from-green-500/20 to-green-600/20 text-green-400 border-green-500/30';
            default: return 'from-purple-500/20 to-purple-600/20 text-purple-400 border-purple-500/30';
        }
    };

    return (
        <div className="min-h-screen bg-[#05050A] text-slate-200 font-sans selection:bg-cyan-500/30 relative overflow-hidden flex">
            {/* Ambient Background Glows */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-purple-900/20 blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-cyan-900/10 blur-[150px]" />
                <div className="absolute top-[40%] left-[30%] w-[30vw] h-[30vw] rounded-full bg-blue-900/10 blur-[100px]" />
            </div>

            {/* Sidebar */}
            <div className="relative z-10 w-64 border-r border-white/5 bg-[#0a0a1a]/60 backdrop-blur-2xl px-5 py-8 flex flex-col shadow-[10px_0_30px_rgba(0,0,0,0.5)]">
                {/* Logo */}
                <motion.div
                    variants={floatAnim}
                    initial="initial"
                    animate="animate"
                    className="flex items-center gap-3 mb-12 cursor-pointer"
                >
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-400 to-purple-500 shadow-[0_0_20px_rgba(34,211,238,0.4)] flex items-center justify-center">
                        <RefreshCcw size={18} className="text-white" />
                    </div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-purple-300 drop-shadow-[0_0_15px_rgba(168,85,247,0.5)] tracking-tight">
                        DocuSync
                    </h1>
                </motion.div>

                {/* Navigation */}
                <div className="flex-1 flex flex-col gap-1">
                    {navItems.map((item) => {
                        const isActive = activeTab === item.name;
                        return (
                            <motion.button
                                key={item.name}
                                onClick={() => setActiveTab(item.name)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 ${isActive
                                    ? 'bg-cyan-500/10 text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.15)] border border-cyan-500/30'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                                    }`}
                                whileHover={{ scale: isActive ? 1 : 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <item.icon size={18} className={isActive ? "drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" : ""} />
                                <span className="font-medium text-sm tracking-wide">{item.name}</span>
                            </motion.button>
                        )
                    })}
                </div>
            </div>

            {/* Main Content Areas */}
            <div className="flex-1 flex flex-col relative z-10 h-screen overflow-hidden">
                {/* Top Header */}
                <header className="px-8 py-6 flex justify-between items-center z-20">
                    <div className="flex items-center text-sm font-medium bg-[#0f0f1d]/40 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
                        <span
                            onClick={() => { setCurrentRepo(null); setSelectedFile(null); }}
                            className="text-slate-400 hover:text-cyan-300 hover:text-cyan-400 cursor-pointer transition-colors"
                        >
                            Home
                        </span>
                        {currentRepo && (
                            <>
                                <ChevronRight size={14} className="mx-2 text-slate-600" />
                                <span
                                    onClick={() => setSelectedFile(null)}
                                    className="text-slate-400 hover:text-cyan-300 hover:text-cyan-400 cursor-pointer transition-colors"
                                >
                                    {currentRepo}
                                </span>
                            </>
                        )}
                        {selectedFile && (
                            <>
                                <ChevronRight size={14} className="mx-2 text-slate-600" />
                                <span className="text-slate-100 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">{selectedFile}</span>
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-4 bg-[#0f0f1d]/40 backdrop-blur-md px-5 py-2.5 rounded-2xl border border-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
                        <button
                            onClick={() => simulateIncomingEdit()}
                            className="mr-3 flex items-center gap-2 px-4 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 hover:bg-purple-500/20 hover:border-purple-500/60 transition-all font-semibold text-xs shadow-[0_0_15px_rgba(168,85,247,0.1)] hover:shadow-[0_0_20px_rgba(168,85,247,0.4)]"
                            title="Simulate Sync"
                        >
                            <Wand size={16} className="drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
                            SIMULATE
                        </button>
                        <button
                            onClick={() => setIsUploadOpen(true)}
                            className="mr-3 flex items-center gap-2 px-4 py-1.5 rounded-xl bg-white/5 border border-white/10 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-500/50 transition-all font-semibold text-xs shadow-[0_0_15px_rgba(34,211,238,0.1)] hover:shadow-[0_0_20px_rgba(34,211,238,0.4)]"
                        >
                            <UploadCloud size={16} className="drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                            UPLOAD
                        </button>

                        <span className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Active users</span>
                        <div className="flex -space-x-2 hover:space-x-1 transition-all duration-300">
                            {['S', 'M', 'E'].map((initial, i) => (
                                <motion.div
                                    whileHover={{ scale: 1.15, zIndex: 10 }}
                                    key={i}
                                    className={`w-8 h-8 rounded-full border-2 border-[#05050A] shadow-[0_0_15px_rgba(168,85,247,0.4)] flex items-center justify-center text-xs font-bold text-white cursor-pointer ${i === 0 ? 'bg-gradient-to-tr from-purple-600 to-indigo-600' :
                                        i === 1 ? 'bg-gradient-to-tr from-cyan-600 to-blue-600' :
                                            'bg-gradient-to-tr from-emerald-500 to-teal-500'
                                        }`}
                                >
                                    {initial}
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </header>

                {/* File List or Placeholder */}
                <main className="flex-1 overflow-y-auto px-8 pb-48 custom-scrollbar" onClick={() => setOpenMenuId(null)}>
                    {activeTab === 'My Drive' ? (
                        <>
                            <div className="grid grid-cols-[3fr_1fr_1fr_auto] gap-4 px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-white/5 sticky top-0 bg-[#05050A]/80 backdrop-blur-md z-10">
                                <div>Name</div>
                                <div>{currentRepo ? 'Sync Status' : 'Status'}</div>
                                <div>{currentRepo ? 'Last Modified' : 'Last Synced'}</div>
                                <div className="w-8"></div>
                            </div>

                            <div className="mt-4 flex flex-col gap-3">
                                <AnimatePresence mode="popLayout">
                                    {!currentRepo ? (
                                        repos.map((repo, i) => (
                                            <motion.div
                                                key={`repo-${repo.id}`}
                                                onClick={() => setCurrentRepo(repo.name)}
                                                initial={{ opacity: 0, y: 15 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -15 }}
                                                transition={{ delay: i * 0.1, ease: "easeOut" }}
                                                whileHover={{
                                                    scale: 1.005,
                                                    backgroundColor: 'rgba(255,255,255,0.05)',
                                                    boxShadow: '0 0 20px rgba(34,211,238,0.05)',
                                                    borderColor: 'rgba(34,211,238,0.2)'
                                                }}
                                                className="grid grid-cols-[3fr_1fr_1fr_auto] gap-4 items-center px-6 py-4 rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-md cursor-pointer hover:bg-white/5 transition-all duration-300 group"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="p-2.5 rounded-xl bg-gradient-to-br border from-indigo-500/20 to-purple-600/20 text-indigo-400 border-indigo-500/30">
                                                        <Folder size={20} className="drop-shadow-md" />
                                                    </div>
                                                    <span className="font-medium text-slate-200 group-hover:text-cyan-100 transition-colors">{repo.name}</span>
                                                </div>

                                                <div>
                                                    {repo.status === 'Up to date' ? (
                                                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-medium shadow-[0_0_15px_rgba(34,197,94,0.15)]">
                                                            <CheckCircle2 size={14} className="drop-shadow-[0_0_5px_rgba(34,197,94,0.8)]" /> {repo.status}
                                                        </div>
                                                    ) : (
                                                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs font-medium shadow-[0_0_15px_rgba(34,211,238,0.15)] animate-pulse">
                                                            <RefreshCcw size={14} className="drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]" /> {repo.status}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="text-sm text-slate-400">
                                                    {repo.lastSynced}
                                                </div>

                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                                                    <button
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="p-2 rounded-full hover:bg-white/10 hover:text-cyan-400 transition-colors text-slate-400"
                                                    >
                                                        <MoreVertical size={18} />
                                                    </button>
                                                </div>
                                            </motion.div>
                                        ))
                                    ) : (
                                        fileList.map((file, i) => (
                                            <motion.div
                                                key={`file-${file.id}`}
                                                onClick={() => setSelectedFile(file.name)}
                                                initial={{ opacity: 0, y: 15 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -15 }}
                                                transition={{ delay: i * 0.1, ease: "easeOut" }}
                                                whileHover={{
                                                    scale: 1.005,
                                                    backgroundColor: 'rgba(255,255,255,0.05)',
                                                    boxShadow: '0 0 20px rgba(34,211,238,0.05)',
                                                    borderColor: 'rgba(34,211,238,0.2)'
                                                }}
                                                className={`grid grid-cols-[3fr_1fr_1fr_auto] gap-4 items-center px-6 py-4 rounded-2xl border backdrop-blur-md cursor-pointer transition-all duration-300 group relative ${file.isSyncing ? 'bg-yellow-500/5 border-yellow-500/30' : 'bg-white/[0.02] border-white/5 hover:bg-white/5'}`}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={`p-2.5 rounded-xl bg-gradient-to-br border ${getFileIconColors(file.type)}`}>
                                                        <FileIcon size={20} className="drop-shadow-md" />
                                                    </div>
                                                    <span className="font-medium text-slate-200 group-hover:text-cyan-100 transition-colors">{file.name}</span>
                                                </div>

                                                <div>
                                                    {file.isSyncing ? (
                                                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/50 text-xs font-medium shadow-[0_0_15px_rgba(234,179,8,0.3)] animate-pulse">
                                                            <RefreshCcw size={14} className="animate-spin drop-shadow-[0_0_5px_rgba(234,179,8,0.8)]" /> Syncing...
                                                        </div>
                                                    ) : file.syncStatus === 'synced' ? (
                                                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-medium shadow-[0_0_15px_rgba(34,197,94,0.15)]">
                                                            <CheckCircle2 size={14} className="drop-shadow-[0_0_5px_rgba(34,197,94,0.8)]" /> Synced
                                                        </div>
                                                    ) : (
                                                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-medium shadow-[0_0_15px_rgba(245,158,11,0.15)] animate-pulse">
                                                            <AlertTriangle size={14} className="drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]" /> Conflict
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="text-sm text-slate-400">
                                                    {file.date}
                                                </div>

                                                <div className={`transition-opacity flex items-center gap-2 ${openMenuId === file.name ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === file.name ? null : file.name); }}
                                                        className="p-2 rounded-full hover:bg-white/10 hover:text-cyan-400 transition-colors text-slate-400"
                                                    >
                                                        <MoreVertical size={18} />
                                                    </button>
                                                </div>
                                                <AnimatePresence>
                                                    {openMenuId === file.name && (
                                                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute right-10 top-8 w-56 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                                                            <div className="flex flex-col">
                                                                <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }} className="flex items-center gap-3 hover:bg-white/10 px-4 py-3 cursor-pointer transition-colors text-sm text-slate-200">
                                                                    <Download size={16} />
                                                                    <span>Download (Check-out)</span>
                                                                </div>
                                                                <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }} className="flex items-center gap-3 hover:bg-white/10 px-4 py-3 cursor-pointer transition-colors text-sm text-slate-200">
                                                                    <WifiOff size={16} />
                                                                    <span>Make Available Offline</span>
                                                                </div>
                                                                <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }} className="flex items-center gap-3 hover:bg-white/10 px-4 py-3 cursor-pointer transition-colors text-sm text-slate-200">
                                                                    <Users size={16} />
                                                                    <span>Share with Group</span>
                                                                </div>
                                                                <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }} className="flex items-center gap-3 hover:bg-white/10 px-4 py-3 cursor-pointer transition-colors text-sm text-rose-400">
                                                                    <Trash2 size={16} />
                                                                    <span>Delete File</span>
                                                                </div>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </motion.div>
                                        ))
                                    )}
                                </AnimatePresence>
                            </div>
                        </>
                    ) : activeTab === 'Profile' ? (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.3 }}
                            className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full max-w-6xl mx-auto items-start h-auto"
                        >
                            {/* Left Column (User Card) */}
                            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 flex flex-col items-center space-y-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
                                <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center text-3xl font-bold shadow-[0_0_30px_rgba(34,211,238,0.4)]">
                                    AT
                                </div>
                                <div className="text-center">
                                    <h2 className="text-3xl font-bold text-white mb-1">Admin Thesis</h2>
                                    <p className="text-slate-400 mb-3">admin.thesis@gmail.com</p>
                                    <span className="inline-block px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-semibold border border-cyan-500/30">
                                        System Administrator
                                    </span>
                                </div>

                                <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-slate-300 font-medium text-sm">Storage Used</span>
                                        <span className="text-white font-bold text-sm">1.2 GB <span className="text-slate-500 font-normal">/ 15 GB</span></span>
                                    </div>
                                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full w-[8%] bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]"></div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => { if (window.confirm('Are you sure you want to log out of the Sync Horizon?')) { router.push('/login'); } }}
                                    className="flex items-center gap-2 border border-rose-500/50 text-rose-400 hover:bg-rose-500/10 px-8 py-3 rounded-xl transition-all shadow-[0_0_15px_rgba(243,62,98,0.1)] hover:shadow-[0_0_20px_rgba(243,62,98,0.3)] font-semibold mt-4 w-full justify-center"
                                >
                                    <LogOut size={18} />
                                    Log Out
                                </button>
                            </div>

                            {/* Right Column (Preferences & Activity) */}
                            <div className="lg:col-span-2 flex flex-col">
                                {/* System Preferences */}
                                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 mb-8 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
                                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                                        <Shield size={20} className="text-cyan-400" /> System Preferences
                                    </h3>

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/5 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                                                    <Wifi size={18} />
                                                </div>
                                                <div>
                                                    <p className="text-white font-medium">Auto-Sync on Cellular</p>
                                                    <p className="text-sm text-slate-400">Allow background syncing when disconnected from Wi-Fi</p>
                                                </div>
                                            </div>
                                            <div className="w-12 h-6 rounded-full bg-cyan-500 relative cursor-pointer shadow-[0_0_10px_rgba(34,211,238,0.4)]">
                                                <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 right-0.5 shadow-md"></div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/5 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                                                    <Bell size={18} />
                                                </div>
                                                <div>
                                                    <p className="text-white font-medium">Desktop Notifications</p>
                                                    <p className="text-sm text-slate-400">Receive alerts for conflicts and completed syncs</p>
                                                </div>
                                            </div>
                                            <div className="w-12 h-6 rounded-full bg-purple-500 relative cursor-pointer shadow-[0_0_10px_rgba(168,85,247,0.4)]">
                                                <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 right-0.5 shadow-md"></div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/5 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="p-2 rounded-lg bg-green-500/10 text-green-400">
                                                    <Lock size={18} />
                                                </div>
                                                <div>
                                                    <p className="text-white font-medium">End-to-End Encryption</p>
                                                    <p className="text-sm text-slate-400">Ensure quantum secure packet transmission</p>
                                                </div>
                                            </div>
                                            <div className="w-12 h-6 rounded-full bg-green-500 relative cursor-pointer shadow-[0_0_10px_rgba(34,197,94,0.4)]">
                                                <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 right-0.5 shadow-md"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Recent Activity */}
                                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
                                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                                        <Activity size={20} className="text-purple-400" /> Recent Activity
                                    </h3>

                                    <div className="space-y-4">
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-slate-900 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
                                                <Monitor size={18} />
                                            </div>
                                            <div className="flex-1 p-4 rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-md">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="font-bold text-slate-200">Windows PC - Chrome</div>
                                                    <div className="text-xs font-bold text-cyan-400 flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></div> Active Now</div>
                                                </div>
                                                <div className="text-slate-400 text-sm">Main desktop workstation sync successful.</div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-slate-900 text-slate-400">
                                                <Laptop size={18} />
                                            </div>
                                            <div className="flex-1 p-4 rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-md">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="font-bold text-slate-200">MacBook Pro - Safari</div>
                                                    <div className="text-xs text-slate-500">2 hours ago</div>
                                                </div>
                                                <div className="text-slate-400 text-sm">Last active from university library.</div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-slate-900 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
                                                <Lock size={18} />
                                            </div>
                                            <div className="flex-1 p-4 rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-md">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="font-bold text-slate-200">Password changed</div>
                                                    <div className="text-xs text-slate-500">3 days ago</div>
                                                </div>
                                                <div className="text-slate-400 text-sm">Authentication credentials updated.</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ) : activeTab === 'Groups & Access' ? (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.3 }}
                            className="w-full max-w-6xl mx-auto flex flex-col space-y-8"
                        >
                            {/* Header */}
                            <div className="flex justify-between items-center bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
                                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                    <Users size={28} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                                    Group Management
                                </h2>
                                <button className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white px-6 py-2.5 rounded-xl font-semibold transition-all shadow-[0_0_15px_rgba(34,211,238,0.4)] hover:shadow-[0_0_25px_rgba(34,211,238,0.6)]">
                                    <Plus size={18} />
                                    Create New Group
                                </button>
                            </div>

                            {/* Main Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Group 1: Thesis Capstone Team */}
                                <div className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.2)] flex flex-col h-full">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="text-xl font-bold text-white mb-1">Thesis Capstone Team</h3>
                                            <p className="text-sm text-cyan-400 font-medium tracking-wide">3 Members</p>
                                        </div>
                                        <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                                            <Users size={20} />
                                        </div>
                                    </div>

                                    <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-xl p-4 mb-6 space-y-3">
                                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                            <span className="text-slate-200 font-medium">You</span>
                                            <span className="text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-1 rounded-md font-semibold">Admin</span>
                                        </div>
                                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                            <span className="text-slate-200">User S</span>
                                            <span className="text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-1 rounded-md font-semibold">Editor</span>
                                        </div>
                                        <div className="flex justify-between items-center pb-1">
                                            <span className="text-slate-200">Prof. Davis</span>
                                            <span className="text-xs bg-white/10 text-slate-300 border border-white/10 px-2 py-1 rounded-md font-semibold">Viewer</span>
                                        </div>
                                    </div>

                                    <div className="flex gap-3 mt-auto">
                                        <button className="flex-1 bg-white/5 hover:bg-white/10 text-white border border-white/10 px-4 py-2.5 rounded-xl transition-colors font-medium">
                                            Assign Roles
                                        </button>
                                        <button className="flex-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 px-4 py-2.5 rounded-xl transition-all font-medium shadow-[0_0_10px_rgba(243,62,98,0.1)] hover:shadow-[0_0_15px_rgba(243,62,98,0.3)]">
                                            Leave Group
                                        </button>
                                    </div>
                                </div>

                                {/* Group 2: CS Dept Admins */}
                                <div className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.2)] flex flex-col h-full">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="text-xl font-bold text-white mb-1">CS Dept Admins</h3>
                                            <div className="text-sm text-amber-400 font-medium tracking-wide flex items-center gap-1">
                                                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></div>
                                                Pending Join Request
                                            </div>
                                        </div>
                                        <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
                                            <Shield size={20} />
                                        </div>
                                    </div>

                                    <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-xl p-4 mb-6 flex items-center justify-center text-center">
                                        <div>
                                            <p className="text-slate-300 text-sm leading-relaxed max-w-[200px]">
                                                You have 1 pending request to join this official department workspace.
                                            </p>
                                        </div>
                                    </div>

                                    <button className="w-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-4 py-2.5 rounded-xl transition-all font-medium shadow-[0_0_10px_rgba(245,158,11,0.1)] hover:shadow-[0_0_15px_rgba(245,158,11,0.3)] mt-auto">
                                        Approve Join Request
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.3 }}
                            className="flex flex-col items-center justify-center h-[60vh] text-center"
                        >
                            <div className="w-24 h-24 mb-6 rounded-full bg-gradient-to-tr from-cyan-500/20 to-purple-500/20 flex items-center justify-center border border-white/10 shadow-[0_0_30px_rgba(34,211,238,0.1)]">
                                {React.createElement(navItems.find(item => item.name === activeTab)?.icon || Folder, {
                                    size: 40,
                                    className: "text-slate-300 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]"
                                })}
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2 tracking-wide">{activeTab} Settings</h2>
                            <p className="text-slate-400 max-w-sm">
                                This section is currently under construction in the Anti-Gravity prototype.
                            </p>

                            <div className="mt-8 px-6 py-4 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md inline-block">
                                <span className="text-sm text-slate-300 font-medium">User Profile Modules Loading...</span>
                            </div>
                        </motion.div>
                    )}
                </main>

                {/* Bottom Console Panel */}
                <AnimatePresence>
                    {isLogOpen && (
                        <motion.div
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 100, opacity: 0 }}
                            transition={{ type: "spring", bounce: 0.3, duration: 0.8 }}
                            className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-4xl bg-[#0b0b14]/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8),0_0_30px_rgba(34,211,238,0.15)] flex flex-col overflow-hidden z-40"
                        >
                            {/* Top glowing neon bar */}
                            <div className="h-1 w-full bg-gradient-to-r from-purple-500/80 via-cyan-400 to-purple-500/80 relative">
                                <div className="absolute top-0 left-0 w-full h-full animate-[pulse_2s_ease-in-out_Infinity] blur-[2px] bg-cyan-400/50"></div>
                            </div>

                            <div className="p-5 flex flex-col gap-4">
                                <div className="flex justify-between items-center border-b border-white/5 pb-3">
                                    <h3 className="text-cyan-300 text-sm font-bold flex items-center gap-2 tracking-widest uppercase">
                                        <Activity size={16} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,1)]" /> Sync Horizon Log
                                    </h3>

                                    <div className="flex items-center gap-6">
                                        {/* Offline Mode Toggle */}
                                        <div className="flex items-center gap-3 text-xs font-semibold text-slate-400 hidden sm:flex">
                                            <span>MAKE AVAILABLE OFFLINE</span>
                                            <button
                                                onClick={() => setIsOffline(!isOffline)}
                                                className={`w-11 h-6 rounded-full p-1 transition-colors relative flex items-center cursor-pointer ${isOffline ? 'bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.4)]' : 'bg-white/10'}`}
                                            >
                                                <motion.div
                                                    animate={{ x: isOffline ? 20 : 0 }}
                                                    className={`w-4 h-4 rounded-full ${isOffline ? 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]' : 'bg-slate-400'}`}
                                                />
                                            </button>
                                        </div>
                                        {/* Queue Changes Toggle */}
                                        <div className="flex items-center gap-3 text-xs font-semibold text-slate-400 hidden sm:flex">
                                            <span>QUEUE OFFLINE CHANGES</span>
                                            <button
                                                onClick={() => setQueueOffline(!queueOffline)}
                                                className={`w-11 h-6 rounded-full p-1 transition-colors relative flex items-center cursor-pointer ${queueOffline ? 'bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.4)]' : 'bg-white/10'}`}
                                            >
                                                <motion.div
                                                    animate={{ x: queueOffline ? 20 : 0 }}
                                                    className={`w-4 h-4 rounded-full ${queueOffline ? 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]' : 'bg-slate-400'}`}
                                                />
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => setIsLogOpen(false)}
                                            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors ml-2"
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                </div>

                                <div className="h-40 lg:h-48 overflow-y-auto space-y-3 font-mono text-xs pr-2 custom-scrollbar flex flex-col-reverse">
                                    <AnimatePresence>
                                        {syncLogs.map((log) => (
                                            <motion.div
                                                key={log.id}
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className={`flex items-start gap-4 transition-opacity ${log.message.includes('Conflict') || log.message.includes('conflict') ? 'bg-amber-500/10 -mx-3 px-3 py-1.5 rounded border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]' : 'opacity-80 hover:opacity-100'}`}
                                            >
                                                <span className={`${log.message.includes('Conflict') || log.message.includes('conflict') ? 'text-amber-500 font-bold' : log.message.includes('merged automatically') ? 'text-green-400 font-bold' : 'text-cyan-400'} w-20 shrink-0 select-none`}>{log.time}:</span>
                                                <span className={`${log.message.includes('Conflict') || log.message.includes('conflict') ? 'text-amber-200' : log.message.includes('merged automatically') ? 'text-green-300' : 'text-slate-300'}`}>{log.message}</span>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Floating Action Button (FAB) */}
                <motion.button
                    onClick={() => setIsLogOpen(!isLogOpen)}
                    variants={floatAnim}
                    initial="initial"
                    animate="animate"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className={`absolute bottom-8 right-8 w-14 h-14 rounded-full flex items-center justify-center z-30 shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-colors duration-300 backdrop-blur-md border border-white/10 ${isLogOpen
                        ? 'bg-purple-600/80 text-white shadow-[0_0_20px_rgba(168,85,247,0.6)]'
                        : 'bg-[#0f0f1d]/80 text-cyan-400 hover:bg-cyan-900/40 shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:shadow-[0_0_25px_rgba(34,211,238,0.5)]'
                        }`}
                >
                    <Terminal size={24} className={isLogOpen ? "drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" : "drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]"} />
                </motion.button>
            </div>

            {/* Upload Modal Overlay */}
            <AnimatePresence>
                {isUploadOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            transition={{ type: "spring", bounce: 0.4 }}
                            className="bg-[#0b0b14]/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8),0_0_30px_rgba(34,211,238,0.2)] flex flex-col overflow-hidden w-[90%] max-w-lg"
                        >
                            {/* Top glowing neon bar */}
                            <div className="h-1 w-full bg-gradient-to-r from-purple-500/80 via-cyan-400 to-purple-500/80 relative">
                                <div className="absolute top-0 left-0 w-full h-full animate-[pulse_2s_ease-in-out_Infinity] blur-[2px] bg-cyan-400/50"></div>
                            </div>

                            <div className="p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-purple-300 drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]">
                                        Upload to Sync Horizon
                                    </h2>
                                    <button
                                        onClick={() => setIsUploadOpen(false)}
                                        className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                <div className="border-2 border-dashed border-cyan-500/50 hover:border-cyan-400 bg-white/5 rounded-xl p-10 flex flex-col items-center justify-center gap-4 transition-colors cursor-pointer group">
                                    <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.2)] group-hover:scale-110 transition-transform">
                                        <FileUp size={32} className="text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
                                    </div>
                                    <p className="text-center text-slate-300 font-medium">
                                        Drag & drop your files here, or <span className="text-cyan-400 underline decoration-cyan-400/50 hover:decoration-cyan-400">click to browse</span>
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        Supports PDF, Word, Excel, and Design files up to 50MB
                                    </p>
                                </div>

                                <div className="mt-8 flex justify-end gap-4">
                                    <button
                                        onClick={() => setIsUploadOpen(false)}
                                        className="px-5 py-2.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white transition-colors text-sm font-semibold"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => setIsUploadOpen(false)}
                                        className="px-5 py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-500 hover:text-white shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:shadow-[0_0_25px_rgba(34,211,238,0.6)] transition-all text-sm font-bold tracking-wide"
                                    >
                                        Upload Files
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
        </div>
    );
}
