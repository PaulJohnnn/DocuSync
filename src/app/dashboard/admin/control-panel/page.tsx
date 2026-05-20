"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '../../../../components/ThemeToggle';
import {
    Shield, Activity, Database, User, Trash2,
    Wifi, WifiOff, CheckCircle2, UserPlus, LogOut, X, Clock,
    Mail, Key, Eye, EyeOff, Copy, BadgeCheck,
    HardDrive, Zap, Archive, Server, BarChart3,
    Users, RefreshCcw, AlertTriangle, Terminal,
    UserCheck, UserX, Lock
} from 'lucide-react';
import { useSyncContext } from '../../../../context/SyncContext';

// ── Toggle Switch Component ──────────────────────────────────────────────────
function ToggleSwitch({
    enabled, onToggle, label, sublabel, accentColor = 'green',
}: {
    enabled: boolean; onToggle: () => void; label: string; sublabel: string;
    accentColor?: 'green' | 'blue' | 'purple' | 'orange' | 'red';
}) {
    const colorMap = {
        green:  { track: 'bg-green-500',  glow: 'shadow-green-500/40',  badge: 'text-green-400 bg-green-500/10 border-green-500/20'   },
        blue:   { track: 'bg-blue-500',   glow: 'shadow-blue-500/40',   badge: 'text-blue-400  bg-blue-500/10  border-blue-500/20'    },
        purple: { track: 'bg-purple-500', glow: 'shadow-purple-500/40', badge: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
        orange: { track: 'bg-orange-500', glow: 'shadow-orange-500/40', badge: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
        red:    { track: 'bg-red-500',    glow: 'shadow-red-500/40',    badge: 'text-red-400 bg-red-500/10 border-red-500/20'         },
    };
    const colors = colorMap[accentColor];
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white leading-snug">{label}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{sublabel}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${enabled ? colors.badge : 'text-zinc-500 bg-zinc-100 dark:bg-zinc-700/50 border-zinc-300 dark:border-zinc-600'}`}>
                    {enabled ? 'ON' : 'OFF'}
                </span>
                <button type="button" onClick={onToggle}
                    className={`relative w-14 h-7 rounded-full transition-all duration-300 focus:outline-none ${enabled ? `${colors.track} shadow-lg ${colors.glow}` : 'bg-zinc-200 dark:bg-zinc-700'}`}>
                    <motion.div layout transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md ${enabled ? 'right-1' : 'left-1'}`} />
                </button>
            </div>
        </div>
    );
}



export default function AdminDashboard() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<string>('System Overview');
    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
    const [showGenPassword, setShowGenPassword] = useState(false);
    const [selectedRepoToDelete, setSelectedRepoToDelete] = useState<number | null>(null);

    // ── User Directory state (merged: User Management + Registered Users)
    const [directoryUsers, setDirectoryUsers] = useState<any[]>([]);
    const [selectedDirUser, setSelectedDirUser] = useState<any | null>(null);
    const [suspendedUsers, setSuspendedUsers] = useState<string[]>([]);
    const [userActionMsg, setUserActionMsg] = useState<string | null>(null);
    // Delete confirmation modal
    const [deleteConfirm, setDeleteConfirm] = useState<any | null>(null);
    // Password Reset flow
    const [pwResetModal, setPwResetModal] = useState<any | null>(null); // user to reset
    const [pwResetStep, setPwResetStep] = useState<'verify' | 'success'>('verify');
    const [pwVerifyName, setPwVerifyName] = useState('');
    const [pwVerifyEmail, setPwVerifyEmail] = useState('');
    const [pwVerifyError, setPwVerifyError] = useState('');
    const [pwNewGenerated, setPwNewGenerated] = useState('');
    const [showNewPw, setShowNewPw] = useState(false);
    const [pwCopied, setPwCopied] = useState(false);
    // Password reset notifications for admin
    const [pwResetNotifications, setPwResetNotifications] = useState<{id:number;name:string;email:string;time:string}[]>([]);

    const loadDirectoryUsers = () => {
        try {
            const stored = localStorage.getItem('docusync_user_requests');
            if (stored) {
                let parsed = JSON.parse(stored);
                let changed = false;
                let nextId = parsed.reduce((max: number, u: any) => {
                    const id = parseInt(u.loginId || '1999');
                    return id > max ? id : max;
                }, 1999);
                parsed = parsed.map((u: any) => {
                    if (!u.loginId) { nextId++; changed = true; return { ...u, loginId: String(nextId) }; }
                    return u;
                });
                if (changed) localStorage.setItem('docusync_user_requests', JSON.stringify(parsed));
                setDirectoryUsers(parsed);
            }
        } catch {}
    };

    useEffect(() => { loadDirectoryUsers(); }, []);

    const confirmDeleteUser = (user: any) => setDeleteConfirm(user);

    const executeDeleteUser = () => {
        if (!deleteConfirm) return;
        const updated = directoryUsers.filter(u => u.id !== deleteConfirm.id);
        setDirectoryUsers(updated);
        localStorage.setItem('docusync_user_requests', JSON.stringify(updated));
        addAuditEvent(`Account permanently deleted: ${deleteConfirm.name} (${deleteConfirm.email}). Action by Administrator.`, 'error');
        if (selectedDirUser?.id === deleteConfirm.id) setSelectedDirUser(null);
        setDeleteConfirm(null);
    };

    const openPwReset = (user: any) => {
        setPwResetModal(user);
        setPwResetStep('verify');
        setPwVerifyName('');
        setPwVerifyEmail('');
        setPwVerifyError('');
        setPwNewGenerated('');
        setShowNewPw(false);
        setPwCopied(false);
        addAuditEvent(`Password reset requested for account: ${user.name} (ID: ${user.loginId}).`, 'warn');
    };

    const verifyAndResetPassword = () => {
        if (!pwResetModal) return;
        const nameMatch = pwVerifyName.trim().toLowerCase() === pwResetModal.name.toLowerCase();
        const emailMatch = pwVerifyEmail.trim().toLowerCase() === pwResetModal.email.toLowerCase();
        if (!nameMatch || !emailMatch) {
            setPwVerifyError('Verification failed. The name or email address does not match our records. Please try again.');
            return;
        }
        const newPw = generatePassword();
        setPwNewGenerated(newPw);
        // Update the password in localStorage
        const updated = directoryUsers.map(u => u.id === pwResetModal.id ? { ...u, password: newPw } : u);
        setDirectoryUsers(updated);
        localStorage.setItem('docusync_user_requests', JSON.stringify(updated));
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setPwResetNotifications(prev => [{ id: Date.now(), name: pwResetModal.name, email: pwResetModal.email, time: now }, ...prev]);
        addAuditEvent(`✅ Password successfully reset for ${pwResetModal.name}. Verification passed. New credentials issued.`, 'info');
        setPwResetStep('success');
        setPwVerifyError('');
    };

    const handleSuspendToggle = (userId: string, name: string) => {
        setSuspendedUsers(prev => {
            const isSuspended = prev.includes(userId);
            const next = isSuspended ? prev.filter(id => id !== userId) : [...prev, userId];
            setUserActionMsg(isSuspended ? `${name}'s account has been reactivated.` : `${name}'s account has been suspended.`);
            addAuditEvent(isSuspended ? `Account reactivated: ${name}.` : `Account suspended: ${name}.`, isSuspended ? 'info' : 'error');
            setTimeout(() => setUserActionMsg(null), 3000);
            return next;
        });
    };

    // Network Simulator state
    const [latencySimActive, setLatencySimActive] = useState(false);
    const [latencyMs, setLatencyMs] = useState(500);
    const [simLog, setSimLog] = useState<string[]>([
        '[SYSTEM] Network simulator ready. All connections nominal.',
    ]);
    const simLogRef = useRef<HTMLDivElement>(null);

    // Audit log state (mirrors sync logs + extra events)
    const [auditEvents, setAuditEvents] = useState<{ id: number; time: string; level: 'info' | 'warn' | 'error'; message: string }[]>([
        { id: 1, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), level: 'info', message: 'Admin Control Panel opened. Session initialized.' },
        { id: 2, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), level: 'info', message: 'CRDT sync engine active. All file states converged.' },
        { id: 3, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), level: 'info', message: 'User Paul John Palamara authenticated via Supabase Auth.' },
    ]);
    const auditLogRef = useRef<HTMLDivElement>(null);

    const {
        reposData, deleteRepository, currentStorageUsed, currentStorageUsedRaw,
        storageLimitBytes, deltaSyncEnabled, autoPurgeEnabled,
        toggleDeltaSync, toggleAutoPurge, pendingUserRequests, approveRequest, denyRequest, syncLogs,
        isOnline
    } = useSyncContext();

    // isOnline drives the offline simulation panel automatically
    const offlineSimActive = !isOnline;

    // Keep audit log in sync with SyncContext logs
    useEffect(() => {
        if (syncLogs.length > 0) {
            const latest = syncLogs[0];
            setAuditEvents(prev => {
                const alreadyExists = prev.some(e => e.id === latest.id + 10000);
                if (alreadyExists) return prev;
                return [{ id: latest.id + 10000, time: latest.time, level: 'info' as const, message: latest.message }, ...prev];
            });
        }
    }, [syncLogs]);

    // Auto scroll audit log
    useEffect(() => {
        if (auditLogRef.current) auditLogRef.current.scrollTop = 0;
    }, [auditEvents]);

    useEffect(() => {
        if (simLogRef.current) simLogRef.current.scrollTop = simLogRef.current.scrollHeight;
    }, [simLog]);

    const addSimLog = (msg: string) => {
        const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setSimLog(prev => [...prev, `[${t}] ${msg}`]);
        setAuditEvents(prev => [{ id: Date.now(), time: t, level: 'warn', message: `[NET-SIM] ${msg}` }, ...prev]);
    };

    const addAuditEvent = (msg: string, level: 'info' | 'warn' | 'error' = 'info') => {
        const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setAuditEvents(prev => [{ id: Date.now(), time: t, level, message: msg }, ...prev]);
    };

    // Storage helpers
    const formatBytes = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(3)} GB`;
    };
    const storagePercent = Math.min(100, (currentStorageUsed / storageLimitBytes) * 100);

    // Password generator
    const generatePassword = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
        let pass = '';
        for (let i = 0; i < 16; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
        return pass;
    };

    // Approval queue state
    const [approvedUser, setApprovedUser] = useState<{ name: string; email: string; role: string; password: string } | null>(null);

    const handleApprove = (userId: string) => {
        const user = pendingUserRequests.find(u => u.id === userId);
        if (!user) return;
        const password = generatePassword();
        approveRequest(userId, password);
        setApprovedUser({ name: user.name, email: user.email, role: 'Editor', password });
        addAuditEvent(`Account approved for ${user.name} (${user.email}). Temporary credentials generated.`);
    };

    const handleDeny = (userId: string) => {
        const user = pendingUserRequests.find(u => u.id === userId);
        if (window.confirm('Are you sure you want to deny this request?')) {
            denyRequest(userId);
            if (user) addAuditEvent(`Access request denied for ${user.name}.`, 'warn');
        }
    };



    // Network Simulator handlers
    const handleOfflineSim = () => {
        // Offline state is now driven automatically by the browser's online/offline events
        // This toggle is kept for manual demonstration purposes
        addSimLog(offlineSimActive
            ? '🟢 Checking connection... Browser reports online. CRDT convergence initiated.'
            : '🔴 Manual offline check: Browser reports offline. CRDT buffer mode active.'
        );
    };

    const handleLatencySim = () => {
        const next = !latencySimActive;
        setLatencySimActive(next);
        if (next) {
            addSimLog(`⚠️  HIGH LATENCY SIMULATION: +${latencyMs}ms injected to all sync operations.`);
            addSimLog('📡 Delta payloads will be delayed. CRDT state vectors still valid.');
        } else {
            addSimLog('✅ Latency simulation cleared. Network operating at normal speed.');
        }
    };

    const floatAnim = {
        initial: { y: 0 },
        animate: { y: [-3, 3, -3], transition: { duration: 5, repeat: Infinity, ease: "easeInOut" as const } }
    };

    const navItems = [
        { name: 'System Overview', icon: Activity },
        { name: 'User Directory', icon: Users },
        { name: 'Audit Logs', icon: Terminal },
    ];

    const statusColor = (s: string) =>
        s === 'online' ? 'bg-green-500' : s === 'idle' ? 'bg-amber-400' : 'bg-zinc-400';

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 transition-colors duration-300 font-sans selection:bg-rose-500/30 relative overflow-hidden flex">
            {/* Ambient Background */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-rose-600/10 dark:bg-rose-900/20 blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-rose-500/10 dark:bg-zinc-800/50 blur-[150px]" />
            </div>

            {/* ═══════════ ADMIN SIDEBAR ═══════════ */}
            <div className="relative z-10 w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 backdrop-blur-2xl px-5 py-8 flex flex-col shadow-[10px_0_30px_rgba(0,0,0,0.5)]">
                <motion.div variants={floatAnim} initial="initial" animate="animate" className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 flex items-center justify-center">
                        <div className="w-full h-full rounded-md bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30 p-1.5">
                            <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
                        </div>
                    </div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-rose-600 to-rose-700 dark:from-rose-400 dark:to-rose-500 tracking-tight">
                        DocuSync
                    </h1>
                </motion.div>

                <div className="mb-6 px-4 py-3 rounded-xl bg-rose-100 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800/50">
                    <p className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider flex items-center gap-2"><Shield size={14} /> Admin Console</p>
                </div>

                <div className="flex-1 flex flex-col gap-1">
                    {navItems.map((item) => {
                        const isActive = activeTab === item.name;
                        return (
                            <motion.button key={item.name} onClick={() => setActiveTab(item.name)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 ${isActive
                                    ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 shadow-md border border-rose-200 dark:border-rose-900/50'
                                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent'
                                    }`}
                                whileHover={{ scale: isActive ? 1 : 1.02 }} whileTap={{ scale: 0.98 }}>
                                <item.icon size={18} className={isActive ? "text-rose-600 dark:text-rose-400" : ""} />
                                <span className="font-medium text-sm tracking-wide">{item.name}</span>

                                {item.name === 'Network Simulator' && (offlineSimActive || latencySimActive) && (
                                    <span className="ml-auto w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                )}
                            </motion.button>
                        );
                    })}
                </div>

                <div className="flex flex-col gap-2 mt-auto">
                    <button onClick={() => setIsLogoutModalOpen(true)} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-zinc-500 dark:text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 border border-transparent transition-all">
                        <LogOut size={18} /><span className="font-medium text-sm">Log Out</span>
                    </button>
                </div>
            </div>

            {/* ═══════════ MAIN CONTENT ═══════════ */}
            <div className="flex-1 flex flex-col relative z-10 h-screen overflow-hidden">
                {/* Header */}
                <header className="px-8 py-6 flex justify-between items-center z-20">
                    <div className="flex items-center text-sm font-medium bg-white dark:bg-zinc-900 backdrop-blur-md px-5 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-md gap-3">
                        <Shield size={16} className="text-rose-500" />
                        <span className="text-zinc-900 dark:text-white font-bold">Admin Command Center</span>
                        <span className="mx-1 text-zinc-300 dark:text-zinc-600">|</span>
                        <span className="text-zinc-500 dark:text-zinc-400">{activeTab}</span>
                        {(offlineSimActive || latencySimActive) && (
                            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700/50 text-[10px] font-bold text-red-600 dark:text-red-400 uppercase">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                Simulation Active
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-4 bg-white dark:bg-zinc-900 backdrop-blur-md px-5 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-md">
                        <ThemeToggle />
                        <span className="text-xs font-bold bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800/50">SYSTEM ADMINISTRATOR</span>
                    </div>
                </header>

                {/* Main Area */}
                <main className="flex-1 overflow-y-auto px-8 pb-24">

                    {/* ─── SYSTEM OVERVIEW TAB ─────────────────────────── */}
                    {activeTab === 'System Overview' && (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="w-full max-w-6xl mx-auto flex flex-col space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                {/* Active WebRTC Peers */}
                                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-6 rounded-2xl shadow-lg relative overflow-hidden group hover:border-rose-400/50 dark:hover:border-rose-600/50 transition-colors">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 dark:bg-rose-500/10 rounded-full -translate-y-8 translate-x-8 group-hover:scale-125 transition-transform" />
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2.5 bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-xl"><Wifi size={20} /></div>
                                        <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Active WebRTC Peers</span>
                                    </div>
                                    <div className="flex items-end gap-2">
                                        <span className="text-4xl font-extrabold text-zinc-900 dark:text-white">{directoryUsers.filter((u: any) => !suspendedUsers.includes(u.id)).length}</span>
                                        <span className="text-sm font-bold text-green-500 mb-1 flex items-center gap-1"><CheckCircle2 size={14} /> Live CRDT</span>
                                    </div>
                                    <div className="mt-3 w-full h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden"><div className="h-full w-[40%] bg-gradient-to-r from-rose-500 to-orange-500 rounded-full" /></div>
                                </div>
                                {/* System Health */}
                                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-6 rounded-2xl shadow-lg relative overflow-hidden group hover:border-green-400/50 dark:hover:border-green-600/50 transition-colors">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 dark:bg-green-500/10 rounded-full -translate-y-8 translate-x-8 group-hover:scale-125 transition-transform" />
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2.5 bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 rounded-xl"><Activity size={20} /></div>
                                        <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">System Health</span>
                                    </div>
                                    <div className="flex items-end gap-2">
                                        <span className="text-4xl font-extrabold text-zinc-900 dark:text-white">{offlineSimActive ? '72.1%' : '99.8%'}</span>
                                        <span className={`text-sm font-bold mb-1 ${offlineSimActive ? 'text-red-500' : 'text-green-500'}`}>{offlineSimActive ? 'Degraded' : 'Uptime'}</span>
                                    </div>
                                    <div className="mt-3 w-full h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden"><div className={`h-full rounded-full bg-gradient-to-r ${offlineSimActive ? 'w-[72%] from-red-500 to-orange-500' : 'w-[99%] from-green-500 to-emerald-500'}`} /></div>
                                </div>
                                {/* Total Workspaces */}
                                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-6 rounded-2xl shadow-lg relative overflow-hidden group hover:border-purple-400/50 dark:hover:border-purple-600/50 transition-colors">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 dark:bg-purple-500/10 rounded-full -translate-y-8 translate-x-8 group-hover:scale-125 transition-transform" />
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2.5 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded-xl"><Database size={20} /></div>
                                        <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Total Workspaces</span>
                                    </div>
                                    <div className="flex items-end gap-2">
                                        <span className="text-4xl font-extrabold text-zinc-900 dark:text-white">{reposData.length}</span>
                                        <span className="text-sm font-bold text-purple-500 mb-1">Repositories</span>
                                    </div>
                                    <div className="mt-3 w-full h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden"><div className="h-full w-[30%] bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full" /></div>
                                </div>
                            </div>

                            {/* Storage Architecture Panel */}
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}
                                className="relative overflow-hidden rounded-[2rem] bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
                                <div className="h-1 w-full bg-gradient-to-r from-green-500 via-emerald-400 to-teal-500" />
                                <div className="p-8 relative z-10">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3.5 bg-gradient-to-tr from-green-500/20 to-emerald-500/20 rounded-2xl border border-green-500/20 shadow-inner">
                                                <HardDrive size={24} className="text-green-500" />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-extrabold text-zinc-900 dark:text-white tracking-tight">Server Storage Architecture</h3>
                                                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Global CRDT delta management &amp; data lifecycle policies</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/40 shadow-sm shrink-0">
                                            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                                            <Server size={14} className="text-green-600 dark:text-green-400" />
                                            <span className="text-xs font-bold text-green-700 dark:text-green-400">Supabase Cloud Storage (S3)</span>
                                        </div>
                                    </div>
                                    {/* Storage Quota Gauge */}
                                    <div className="mb-8 p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <BarChart3 size={16} className="text-zinc-500" />
                                                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Global Storage Quota</span>
                                                {deltaSyncEnabled && (
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-700/40 uppercase tracking-wider">
                                                        Delta Mode (×0.15)
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <span className="text-sm font-extrabold text-zinc-900 dark:text-white">{formatBytes(currentStorageUsed)}</span>
                                                <span className="text-xs text-zinc-500 dark:text-zinc-400"> / 1 GB (Free Tier)</span>
                                            </div>
                                        </div>
                                        <div className="w-full h-3 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                            <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(storagePercent, 0.5)}%` }}
                                                transition={{ duration: 0.8, ease: 'easeOut' }}
                                                className={`h-full rounded-full ${storagePercent > 85 ? 'bg-gradient-to-r from-rose-500 to-red-500' : storagePercent > 60 ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-green-400 to-emerald-500'}`} />
                                        </div>
                                        <div className="flex justify-between mt-1.5">
                                            <span className="text-[10px] text-zinc-400">Raw (without delta compression): {formatBytes(currentStorageUsedRaw)}</span>
                                            <span className="text-[10px] text-zinc-400">{storagePercent.toFixed(2)}% used</span>
                                        </div>
                                    </div>
                                    {/* Toggles */}
                                    <div className="flex flex-col gap-4">
                                        <div className="p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                                            <div className="flex items-start gap-3 mb-4">
                                                <div className="p-2 rounded-xl bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 shrink-0"><Zap size={16} /></div>
                                                <div><h4 className="text-sm font-bold text-zinc-900 dark:text-white">Delta Synchronization</h4><p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Diff-Only Storage Engine</p></div>
                                            </div>
                                            <ToggleSwitch enabled={deltaSyncEnabled} onToggle={toggleDeltaSync} label="Enable Delta Sync (Diff-Only Storage)" sublabel="Reduces storage footprint by saving only keystroke diffs. Active files use 15% of raw size." accentColor="green" />
                                        </div>
                                        <div className="p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                                            <div className="flex items-start gap-3 mb-4">
                                                <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 shrink-0"><Archive size={16} /></div>
                                                <div><h4 className="text-sm font-bold text-zinc-900 dark:text-white">Data Lifecycle Policy</h4><p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">30-Day Auto-Purge</p></div>
                                            </div>
                                            <ToggleSwitch enabled={autoPurgeEnabled} onToggle={toggleAutoPurge} label="Data Lifecycle Policy (30-Day Auto-Purge)" sublabel="Automatically permanently deletes trashed items after 30 days." accentColor="orange" />
                                        </div>
                                    </div>
                                </div>
                            </motion.div>

                            {/* Delete Group Section */}
                            <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-rose-500/20 p-8 rounded-[2rem] shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full -translate-y-16 translate-x-16" />
                                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                                    <div className="flex items-center gap-5">
                                        <div className="p-4 bg-rose-500/10 text-rose-500 rounded-2xl shadow-inner"><Trash2 size={24} /></div>
                                        <div>
                                            <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Delete Synchronization Group</h3>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-md">Permanently purge a group workspace, including all files, version history, and membership data.</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                                        <select value={selectedRepoToDelete ?? ''} onChange={(e) => setSelectedRepoToDelete(e.target.value ? Number(e.target.value) : null)}
                                            className="px-5 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm font-semibold outline-none focus:ring-2 focus:ring-rose-500/40 transition-all appearance-none cursor-pointer">
                                            <option value="">Select a Group...</option>
                                            {reposData.map(repo => (<option key={repo.id} value={repo.id}>{repo.name}</option>))}
                                        </select>
                                        <button onClick={() => {
                                            if (selectedRepoToDelete) {
                                                const repo = reposData.find(r => r.id === selectedRepoToDelete);
                                                if (window.confirm(`CRITICAL: Are you sure you want to permanently delete '${repo?.name}'? This action cannot be undone.`)) {
                                                    deleteRepository(selectedRepoToDelete);
                                                    addAuditEvent(`Repository '${repo?.name}' permanently deleted by Administrator.`, 'error');
                                                    setSelectedRepoToDelete(null);
                                                }
                                            }
                                        }} disabled={!selectedRepoToDelete}
                                            className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 disabled:bg-zinc-400 disabled:opacity-50 text-white font-bold px-8 py-3 rounded-xl transition-all shadow-lg shadow-rose-500/25 active:scale-95 disabled:pointer-events-none">
                                            <Trash2 size={18} /> Purge Group
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}


                    {/* ─── USER REQUESTS TAB ───────────────────────────────── */}
                    {activeTab === 'User Requests' && (() => {
                        const localRequests: any[] = (() => {
                            try {
                                const stored = localStorage.getItem('docusync_user_requests');
                                return stored ? JSON.parse(stored) : [];
                            } catch { return []; }
                        })();
                        const pendingLocal = localRequests.filter((r: any) => r.status === 'pending');

                        const handleApproveLocal = (req: any) => {
                            const password = generatePassword();
                            const stored = localStorage.getItem('docusync_user_requests');
                            const allRequests = stored ? JSON.parse(stored) : [];
                            const nextId = allRequests.reduce((max: number, u: any) => {
                                const id = parseInt(u.loginId || '1999');
                                return id > max ? id : max;
                            }, 1999) + 1;
                            const updated = allRequests.map((r: any) =>
                                r.id === req.id ? { ...r, status: 'approved', password, loginId: String(nextId) } : r
                            );
                            localStorage.setItem('docusync_user_requests', JSON.stringify(updated));
                            loadDirectoryUsers();
                            setApprovedUser({ name: req.name, email: req.email, role: 'Editor', password });
                            addAuditEvent(`✅ Account approved for ${req.name} (${req.email}). Login ID: ${nextId}. Credentials generated.`, 'info');
                            setActiveTab('User Requests');
                        };

                        const handleDenyLocal = (req: any) => {
                            if (!window.confirm(`Deny access for ${req.name}?`)) return;
                            const stored = localStorage.getItem('docusync_user_requests');
                            const allRequests = stored ? JSON.parse(stored) : [];
                            const updated = allRequests.map((r: any) =>
                                r.id === req.id ? { ...r, status: 'denied' } : r
                            );
                            localStorage.setItem('docusync_user_requests', JSON.stringify(updated));
                            loadDirectoryUsers();
                            addAuditEvent(`❌ Access request denied for ${req.name} (${req.email}).`, 'warn');
                        };

                        return (
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="w-full max-w-5xl mx-auto flex flex-col space-y-6">

                                {/* Approved User Credential Banner */}
                                <AnimatePresence>
                                    {approvedUser && (
                                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                            className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/50 rounded-2xl p-6">
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                                                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Access Approved — Share credentials with the user</p>
                                                </div>
                                                <button onClick={() => setApprovedUser(null)} className="text-zinc-400 hover:text-zinc-600"><X size={16} /></button>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
                                                <div><p className="text-[10px] font-bold text-zinc-400 uppercase">Name</p><p className="text-sm font-bold text-zinc-900 dark:text-white">{approvedUser.name}</p></div>
                                                <div><p className="text-[10px] font-bold text-zinc-400 uppercase">Email</p><p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{approvedUser.email}</p></div>
                                                <div><p className="text-[10px] font-bold text-zinc-400 uppercase">Role</p><p className="text-sm font-bold text-blue-600">{approvedUser.role}</p></div>
                                                <div>
                                                    <p className="text-[10px] font-bold text-zinc-400 uppercase">System Password</p>
                                                    <div className="flex items-center gap-2">
                                                        <code className="text-sm font-mono font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-800/40">{approvedUser.password}</code>
                                                        <button onClick={() => navigator.clipboard.writeText(approvedUser.password)} className="text-zinc-400 hover:text-rose-500 transition-colors"><Copy size={13} /></button>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Pending Requests Table */}
                                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl overflow-hidden">
                                    <div className="px-8 py-6 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 bg-rose-100 dark:bg-rose-900/40 text-rose-600 rounded-xl"><UserPlus size={22} /></div>
                                            <div>
                                                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">User Access Requests</h3>
                                                <p className="text-sm text-zinc-500 dark:text-zinc-400">Review and approve or deny incoming account requests from users.</p>
                                            </div>
                                        </div>
                                        <button onClick={() => { loadDirectoryUsers(); }} className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-rose-500 transition-colors px-3 py-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-900/20 border border-transparent hover:border-rose-200">
                                            <RefreshCcw size={14} /> Refresh
                                        </button>
                                    </div>

                                    <div className="divide-y divide-zinc-100 dark:divide-zinc-700/50">
                                        {pendingLocal.length === 0 ? (
                                            <div className="px-8 py-16 text-center">
                                                <div className="w-16 h-16 mx-auto rounded-full bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center mb-4"><UserPlus size={28} className="text-zinc-400" /></div>
                                                <h4 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">No Pending Requests</h4>
                                                <p className="text-sm text-zinc-500 dark:text-zinc-400">When users submit access requests from the landing page, they will appear here for your review.</p>
                                            </div>
                                        ) : pendingLocal.map((req: any) => (
                                            <div key={req.id} className="flex flex-col sm:flex-row sm:items-center gap-4 px-8 py-5">
                                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-sm font-bold text-white shadow-sm shrink-0">
                                                        {req.name?.split(' ').map((n: string) => n[0]).join('').slice(0,2) || '?'}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-zinc-900 dark:text-zinc-200 text-sm">{req.name}</p>
                                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate flex items-center gap-1"><Mail size={11} /> {req.email}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/50">PENDING</span>
                                                    <button onClick={() => handleApproveLocal(req)}
                                                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 transition-all">
                                                        <BadgeCheck size={14} /> Approve
                                                    </button>
                                                    <button onClick={() => handleDenyLocal(req)}
                                                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-bold text-xs transition-all">
                                                        <UserX size={14} /> Deny
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Show recently denied/approved for reference */}
                                {localRequests.filter((r: any) => r.status !== 'pending').length > 0 && (
                                    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl overflow-hidden">
                                        <div className="px-8 py-4 border-b border-zinc-200 dark:border-zinc-700">
                                            <h4 className="font-bold text-zinc-700 dark:text-zinc-300 text-sm">Processed Requests</h4>
                                        </div>
                                        <div className="divide-y divide-zinc-100 dark:divide-zinc-700/50">
                                            {localRequests.filter((r: any) => r.status !== 'pending').map((req: any) => (
                                                <div key={req.id} className="flex items-center gap-4 px-8 py-4 opacity-60">
                                                    <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-600 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-300 shrink-0">
                                                        {req.name?.split(' ').map((n: string) => n[0]).join('').slice(0,2) || '?'}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-zinc-900 dark:text-zinc-200 text-sm">{req.name}</p>
                                                        <p className="text-xs text-zinc-500 truncate">{req.email}</p>
                                                    </div>
                                                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                                                        req.status === 'approved' ? 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20' : 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20'
                                                    }`}>{req.status.toUpperCase()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        );
                    })()
                    }


                    {/* ─── USER DIRECTORY TAB (merged) ───────────────────── */}
                    {activeTab === 'User Directory' && (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="w-full max-w-5xl mx-auto flex flex-col space-y-6">

                            {/* ── PENDING ACCESS REQUESTS PANEL ── */}
                            {(() => {
                                const localRequests: any[] = (() => {
                                    try {
                                        const stored = localStorage.getItem('docusync_user_requests');
                                        return stored ? JSON.parse(stored) : [];
                                    } catch { return []; }
                                })();
                                const pendingLocal = localRequests.filter((r: any) => r.status === 'pending');
                                if (pendingLocal.length === 0) return null;

                                const handleApproveLocal = (req: any) => {
                                    const password = generatePassword();
                                    const stored = localStorage.getItem('docusync_user_requests');
                                    const allRequests = stored ? JSON.parse(stored) : [];
                                    const nextId = allRequests.reduce((max: number, u: any) => {
                                        const id = parseInt(u.loginId || '1999');
                                        return id > max ? id : max;
                                    }, 1999) + 1;
                                    const updated = allRequests.map((r: any) =>
                                        r.id === req.id ? { ...r, status: 'approved', password, loginId: String(nextId) } : r
                                    );
                                    localStorage.setItem('docusync_user_requests', JSON.stringify(updated));
                                    loadDirectoryUsers();
                                    setApprovedUser({ name: req.name, email: req.email, role: 'Editor', password });
                                    addAuditEvent(`✅ Account approved for ${req.name} (${req.email}). Login ID: ${nextId}.`, 'info');
                                };

                                const handleDenyLocal = (req: any) => {
                                    if (!window.confirm(`Deny access for ${req.name}?`)) return;
                                    const stored = localStorage.getItem('docusync_user_requests');
                                    const allRequests = stored ? JSON.parse(stored) : [];
                                    const updated = allRequests.map((r: any) =>
                                        r.id === req.id ? { ...r, status: 'denied' } : r
                                    );
                                    localStorage.setItem('docusync_user_requests', JSON.stringify(updated));
                                    loadDirectoryUsers();
                                    addAuditEvent(`❌ Access request denied for ${req.name} (${req.email}).`, 'warn');
                                };

                                return (
                                    <div className="bg-white dark:bg-zinc-800 border-2 border-amber-300 dark:border-amber-700/60 rounded-2xl shadow-xl overflow-hidden">
                                        <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400" />
                                        <div className="px-8 py-5 border-b border-amber-100 dark:border-amber-900/30 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2.5 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-xl"><UserPlus size={20} /></div>
                                                <div>
                                                    <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                                                        Pending Access Requests
                                                        <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black">{pendingLocal.length}</span>
                                                    </h3>
                                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Users waiting for your approval to access the system.</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="divide-y divide-amber-50 dark:divide-zinc-700/50">
                                            {pendingLocal.map((req: any) => (
                                                <div key={req.id} className="flex flex-col sm:flex-row sm:items-center gap-4 px-8 py-4">
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
                                                            {req.name?.split(' ').map((n: string) => n[0]).join('').slice(0,2) || '?'}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-zinc-900 dark:text-zinc-200 text-sm">{req.name}</p>
                                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate flex items-center gap-1"><Mail size={11} /> {req.email}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/50">PENDING</span>
                                                        <button onClick={() => handleApproveLocal(req)}
                                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all">
                                                            <BadgeCheck size={14} /> Approve
                                                        </button>
                                                        <button onClick={() => handleDenyLocal(req)}
                                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-bold text-xs transition-all">
                                                            <UserX size={14} /> Deny
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Approved User Credential Banner */}
                            <AnimatePresence>
                                {approvedUser && (
                                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                        className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/50 rounded-2xl p-6">
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                                                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Access Approved — Share these credentials with the user</p>
                                            </div>
                                            <button onClick={() => setApprovedUser(null)} className="text-zinc-400 hover:text-zinc-600"><X size={16} /></button>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
                                            <div><p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Name</p><p className="text-sm font-bold text-zinc-900 dark:text-white">{approvedUser.name}</p></div>
                                            <div><p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Email</p><p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{approvedUser.email}</p></div>
                                            <div><p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Role</p><p className="text-sm font-bold text-blue-600">{approvedUser.role}</p></div>
                                            <div>
                                                <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">System Password</p>
                                                <div className="flex items-center gap-2">
                                                    <code className="text-sm font-mono font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-800/40">{approvedUser.password}</code>
                                                    <button onClick={() => navigator.clipboard.writeText(approvedUser.password)} className="text-zinc-400 hover:text-rose-500 transition-colors"><Copy size={13} /></button>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Status / action banner */}
                            <AnimatePresence>
                                {userActionMsg && (
                                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                        className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl px-6 py-4 flex items-center gap-3">
                                        <AlertTriangle size={18} className="text-amber-500 shrink-0" />
                                        <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">{userActionMsg}</span>
                                    </motion.div>
                                )}
                                {pwResetNotifications.slice(0, 1).map(n => (
                                    <motion.div key={n.id} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                        className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-700/50 rounded-2xl px-6 py-4 flex items-center gap-3">
                                        <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Password Reset Successful</p>
                                            <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">{n.name} ({n.email}) successfully verified their identity and received new credentials at {n.time}.</p>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            {/* Main User Table */}
                            <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl overflow-hidden">
                                <div className="px-8 py-6 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-rose-100 dark:bg-rose-900/40 text-rose-600 rounded-xl"><Users size={22} /></div>
                                        <div>
                                            <h3 className="text-xl font-bold text-zinc-900 dark:text-white">User Directory</h3>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400">All registered accounts. Click a row to expand credentials. Use the action buttons to manage each user.</p>
                                        </div>
                                    </div>
                                    <span className="flex items-center gap-2 text-xs font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/50">
                                        <CheckCircle2 size={14} /> {directoryUsers.length} Registered
                                    </span>
                                </div>

                                {/* Expandable credential panel */}
                                <AnimatePresence>
                                    {selectedDirUser && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden border-b border-zinc-200 dark:border-zinc-700">
                                            <div className="px-8 py-5 bg-zinc-50 dark:bg-zinc-900/50">
                                                <div className="flex items-center justify-between mb-3">
                                                    <h4 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><BadgeCheck size={16} className="text-rose-500" /> Account Credentials</h4>
                                                    <button onClick={() => setSelectedDirUser(null)} className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"><X size={16} /></button>
                                                </div>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-5">
                                                    <div>
                                                        <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1">Login ID</p>
                                                        <p className="text-xl font-black font-mono text-amber-600 dark:text-amber-400">{selectedDirUser.loginId || '—'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Full Name</p>
                                                        <p className="text-sm font-bold text-zinc-900 dark:text-white">{selectedDirUser.name}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Email</p>
                                                        <p className="text-sm font-bold text-zinc-900 dark:text-white">{selectedDirUser.email}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">System Password</p>
                                                        <div className="flex items-center gap-2">
                                                            <code className="text-sm font-mono font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-800/40">
                                                                {selectedDirUser.password || '—'}
                                                            </code>
                                                            <button onClick={() => { navigator.clipboard.writeText(selectedDirUser.password || ''); }}
                                                                className="text-zinc-400 hover:text-rose-500 transition-colors"><Copy size={13} /></button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Table headers */}
                                <div className="grid grid-cols-[70px_2fr_2fr_100px_1fr_auto] gap-3 px-8 py-3 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-700/50">
                                    <div className="text-amber-500">Login ID</div><div>Full Name</div><div>Email</div><div>Role</div><div>Status</div><div className="text-right">Actions</div>
                                </div>

                                <div className="divide-y divide-zinc-100 dark:divide-zinc-700/50">
                                    {directoryUsers.length === 0 ? (
                                        <div className="px-8 py-16 text-center">
                                            <div className="w-16 h-16 mx-auto rounded-full bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center mb-4"><UserX size={28} className="text-zinc-400" /></div>
                                            <h4 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">No Registered Users</h4>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400">Users who register via the Create Account form will appear here.</p>
                                        </div>
                                    ) : directoryUsers.map((user) => {
                                        const isSuspended = suspendedUsers.includes(user.id);
                                        const isOwner = user.loginId === '2000';
                                        return (
                                            <div key={user.id}
                                                className={`grid grid-cols-[70px_2fr_2fr_100px_1fr_auto] gap-3 items-center px-8 py-4 cursor-pointer transition-colors ${selectedDirUser?.id === user.id ? 'bg-rose-50 dark:bg-rose-900/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'} ${isSuspended ? 'opacity-50' : ''}`}
                                                onClick={() => setSelectedDirUser(selectedDirUser?.id === user.id ? null : user)}>
                                                <div><span className="inline-block px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-black font-mono text-sm">{user.loginId || '—'}</span></div>
                                                <div className="flex items-center gap-3">
                                                    <div className="relative shrink-0">
                                                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-rose-500 to-rose-600 flex items-center justify-center text-sm font-bold text-white shadow-sm">
                                                            {user.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || '?'}
                                                        </div>
                                                        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zinc-800 ${isSuspended ? 'bg-zinc-400' : 'bg-green-500'}`} />
                                                    </div>
                                                    <div>
                                                        <span className="font-semibold text-zinc-900 dark:text-zinc-200 text-sm">{user.name}</span>
                                                        {isSuspended && <span className="ml-2 text-[9px] font-bold text-red-500 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full">SUSPENDED</span>}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400"><Mail size={13} className="text-zinc-400 shrink-0" /><span className="truncate">{user.email}</span></div>
                                                <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full border ${isOwner ? 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/50' : 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800/50'}`}>
                                                    {isOwner ? 'Owner' : user.role || 'Editor'}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2 h-2 rounded-full ${isSuspended ? 'bg-zinc-400' : 'bg-green-500'}`} />
                                                    <span className="text-xs text-zinc-500">{isSuspended ? 'Suspended' : 'Active'}</span>
                                                </div>
                                                <div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                                                    <button onClick={() => openPwReset(user)} title="Reset Password"
                                                        className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-blue-500 hover:border-blue-300 transition-all">
                                                        <Key size={15} />
                                                    </button>
                                                    <button onClick={() => handleSuspendToggle(user.id, user.name)} title={isSuspended ? 'Reactivate' : 'Suspend'}
                                                        className={`p-2 rounded-xl border transition-all ${isSuspended ? 'border-green-200 text-green-500 hover:border-green-400' : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-amber-500 hover:border-amber-300'}`}>
                                                        {isSuspended ? <UserCheck size={15} /> : <UserX size={15} />}
                                                    </button>
                                                    <button onClick={() => confirmDeleteUser(user)} title="Delete Account"
                                                        className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-rose-500 hover:border-rose-400 transition-all">
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Info note */}
                            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30 rounded-2xl p-5 flex items-start gap-3">
                                <AlertTriangle size={17} className="text-blue-500 mt-0.5 shrink-0" />
                                <p className="text-sm text-blue-700 dark:text-blue-400">
                                    <strong>Password Reset Policy:</strong> When a user requests a password reset, the system requires them to verify their <strong>full name</strong> and <strong>registered email address</strong>. Only after successful verification will a new system-generated password be issued. All reset events are recorded in the Audit Logs.
                                </p>
                            </div>
                        </motion.div>
                    )}

                    {/* ═══ DELETE CONFIRMATION MODAL ═══════════════════════ */}
                    <AnimatePresence>
                        {deleteConfirm && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                                <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                                    className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                                    <div className="h-1 w-full bg-gradient-to-r from-rose-600 to-rose-400" />
                                    <div className="p-8">
                                        <div className="flex items-center gap-4 mb-5">
                                            <div className="p-3 bg-rose-100 dark:bg-rose-900/40 rounded-2xl">
                                                <Trash2 size={24} className="text-rose-600 dark:text-rose-400" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-black text-zinc-900 dark:text-white">Confirm Account Deletion</h3>
                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">This action is permanent and cannot be reversed.</p>
                                            </div>
                                        </div>
                                        <div className="bg-zinc-50 dark:bg-zinc-800 rounded-2xl p-4 mb-6 border border-zinc-200 dark:border-zinc-700">
                                            <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-2">Account to be deleted</p>
                                            <p className="text-base font-bold text-zinc-900 dark:text-white">{deleteConfirm.name}</p>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mt-1"><Mail size={13} />{deleteConfirm.email}</p>
                                            <p className="text-sm text-amber-600 dark:text-amber-400 font-mono font-bold mt-1">ID: {deleteConfirm.loginId}</p>
                                        </div>
                                        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 rounded-xl px-4 py-3 mb-6 flex items-start gap-2">
                                            <AlertTriangle size={15} className="text-rose-500 shrink-0 mt-0.5" />
                                            <p className="text-xs text-rose-700 dark:text-rose-400 leading-relaxed">Deleting this account will permanently remove all access credentials and cannot be undone. The user will immediately lose the ability to log in.</p>
                                        </div>
                                        <div className="flex gap-3">
                                            <button onClick={() => setDeleteConfirm(null)}
                                                className="flex-1 px-5 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all">
                                                Cancel
                                            </button>
                                            <button onClick={executeDeleteUser}
                                                className="flex-1 px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-lg shadow-rose-500/25 transition-all flex items-center justify-center gap-2">
                                                <Trash2 size={15} /> Delete Account
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ═══ PASSWORD RESET VERIFICATION MODAL ══════════════ */}
                    <AnimatePresence>
                        {pwResetModal && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                                <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                                    className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                                    <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-600" />
                                    <div className="p-8">
                                        {pwResetStep === 'verify' && (<>
                                            <div className="flex items-center gap-4 mb-6">
                                                <div className="p-3 bg-blue-100 dark:bg-blue-900/40 rounded-2xl"><Key size={22} className="text-blue-600 dark:text-blue-400" /></div>
                                                <div>
                                                    <h3 className="text-lg font-black text-zinc-900 dark:text-white">Password Reset — Identity Verification</h3>
                                                    <p className="text-xs text-zinc-500 mt-0.5">The user must verify their registered details before a new password can be issued.</p>
                                                </div>
                                                <button onClick={() => setPwResetModal(null)} className="ml-auto p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"><X size={18} /></button>
                                            </div>

                                            <div className="bg-zinc-50 dark:bg-zinc-800 rounded-2xl p-4 mb-5 border border-zinc-200 dark:border-zinc-700">
                                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Resetting password for</p>
                                                <p className="font-bold text-zinc-900 dark:text-white">{pwResetModal.name}</p>
                                                <p className="text-xs text-zinc-500 dark:text-zinc-400">Login ID: {pwResetModal.loginId}</p>
                                            </div>

                                            <div className="flex flex-col gap-4 mb-5">
                                                <div>
                                                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">Full Name (as registered)</label>
                                                    <input value={pwVerifyName} onChange={e => { setPwVerifyName(e.target.value); setPwVerifyError(''); }}
                                                        placeholder="Enter the account holder's full name"
                                                        className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/40 transition-all" />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">Registered Email Address</label>
                                                    <input type="email" value={pwVerifyEmail} onChange={e => { setPwVerifyEmail(e.target.value); setPwVerifyError(''); }}
                                                        placeholder="Enter the registered email address"
                                                        className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/40 transition-all" />
                                                </div>
                                            </div>

                                            <AnimatePresence>
                                                {pwVerifyError && (
                                                    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                                        className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 rounded-xl px-4 py-3 flex items-start gap-2 mb-4">
                                                        <AlertTriangle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                                                        <p className="text-xs text-rose-700 dark:text-rose-400">{pwVerifyError}</p>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            <div className="flex gap-3">
                                                <button onClick={() => setPwResetModal(null)}
                                                    className="flex-1 px-5 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all">
                                                    Cancel
                                                </button>
                                                <button onClick={verifyAndResetPassword} disabled={!pwVerifyName || !pwVerifyEmail}
                                                    className="flex-1 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:pointer-events-none text-white font-bold text-sm shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2">
                                                    <BadgeCheck size={15} /> Verify & Reset Password
                                                </button>
                                            </div>
                                        </>)}

                                        {pwResetStep === 'success' && (<>
                                            <div className="text-center mb-6">
                                                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-4">
                                                    <CheckCircle2 size={32} className="text-emerald-500" />
                                                </div>
                                                <h3 className="text-lg font-black text-zinc-900 dark:text-white">Verification Passed</h3>
                                                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Identity confirmed for <strong>{pwResetModal.name}</strong>. A new system password has been generated and saved.</p>
                                            </div>

                                            <div className="bg-zinc-50 dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-5 mb-5">
                                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">New System Password</p>
                                                <div className="flex items-center gap-3">
                                                    <code className="flex-1 text-base font-mono font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-4 py-3 rounded-xl border border-rose-200 dark:border-rose-800/40 tracking-widest">
                                                        {showNewPw ? pwNewGenerated : '•'.repeat(16)}
                                                    </code>
                                                    <button onClick={() => setShowNewPw(!showNewPw)} className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-rose-500 transition-colors">
                                                        {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </button>
                                                    <button onClick={() => { navigator.clipboard.writeText(pwNewGenerated); setPwCopied(true); setTimeout(() => setPwCopied(false), 2000); }}
                                                        className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-emerald-500 transition-colors">
                                                        {pwCopied ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Copy size={16} />}
                                                    </button>
                                                </div>
                                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-2">Share this password securely with the user. Advise them to keep it safe.</p>
                                            </div>

                                            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-4 py-3 mb-5 flex items-start gap-2">
                                                <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                                                <p className="text-xs text-emerald-700 dark:text-emerald-400">This event has been recorded in the Audit Logs with a timestamp. The new password is now active in the system.</p>
                                            </div>

                                            <button onClick={() => setPwResetModal(null)}
                                                className="w-full px-5 py-3 rounded-2xl bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-700 dark:hover:bg-white text-white dark:text-zinc-900 font-bold text-sm transition-all">
                                                Done
                                            </button>
                                        </>)}
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>


                    {/* ─── NETWORK SIMULATOR TAB ───────────────────────── */}
                    {activeTab === 'Network Simulator' && (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="w-full max-w-5xl mx-auto flex flex-col space-y-6">
                            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-2xl p-5 flex items-start gap-3">
                                <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-sm font-bold text-amber-700 dark:text-amber-400">Thesis Defense Tool — Network Fault Simulator</p>
                                    <p className="text-sm text-amber-600 dark:text-amber-500 mt-0.5">This tool demonstrates how the CRDT State Convergence Model handles unstable network conditions. Use it during your defense to show offline-first resilience and automatic conflict-free merging.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {/* Offline Detection - Automatic */}
                                <div className={`bg-white dark:bg-zinc-800 border-2 rounded-2xl shadow-lg p-6 transition-all duration-300 ${offlineSimActive ? 'border-red-400 dark:border-red-600 shadow-red-500/20' : 'border-zinc-200 dark:border-zinc-700'}`}>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className={`p-2.5 rounded-xl ${offlineSimActive ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400' : 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400'}`}>
                                            {offlineSimActive ? <WifiOff size={20} /> : <Wifi size={20} />}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-zinc-900 dark:text-white">Network Connectivity Status</h3>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Automatically detected from the device&apos;s real network state</p>
                                        </div>
                                        <span className={`ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full border ${offlineSimActive ? 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800/50' : 'text-green-600 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800/50'}`}>
                                            {offlineSimActive ? 'OFFLINE' : 'ONLINE'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-5">
                                        {offlineSimActive
                                            ? '🔴 Device is currently OFFLINE. The CRDT engine is buffering all edits locally. When the connection returns, changes will automatically merge with zero data loss.'
                                            : '🟢 Device is ONLINE. Real-time synchronization is active. All changes are being pushed to Supabase instantly.'}
                                    </p>
                                    <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700">
                                        <span className={`w-3 h-3 rounded-full ${offlineSimActive ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                                        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                            {offlineSimActive ? 'CRDT Offline Mode Active — Edits queued in local state vector' : 'Supabase Realtime WebSocket — Connected'}
                                        </span>
                                    </div>
                                </div>

                                {/* Latency Simulation */}
                                <div className={`bg-white dark:bg-zinc-800 border-2 rounded-2xl shadow-lg p-6 transition-all duration-300 ${latencySimActive ? 'border-amber-400 dark:border-amber-600 shadow-amber-500/20' : 'border-zinc-200 dark:border-zinc-700'}`}>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className={`p-2.5 rounded-xl ${latencySimActive ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400' : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-500'}`}>
                                            <Wifi size={20} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-zinc-900 dark:text-white">High Latency Simulation</h3>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Injects artificial delay to all sync operations</p>
                                        </div>
                                    </div>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                                        Simulates a slow or congested internet connection. Demonstrates that delta payloads (diffs) are far smaller than full document transfers, maintaining responsiveness.
                                    </p>
                                    <div className="mb-4">
                                        <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Simulated Latency: <span className="text-amber-600 dark:text-amber-400 font-bold">{latencyMs}ms</span></label>
                                        <input type="range" min={100} max={3000} step={100} value={latencyMs} onChange={e => setLatencyMs(Number(e.target.value))}
                                            className="w-full mt-2 accent-amber-500" />
                                        <div className="flex justify-between text-[10px] text-zinc-400 mt-1"><span>100ms</span><span>3000ms</span></div>
                                    </div>
                                    <ToggleSwitch enabled={latencySimActive} onToggle={handleLatencySim}
                                        label={latencySimActive ? `+${latencyMs}ms Latency Active` : 'Simulate High Latency'}
                                        sublabel={latencySimActive ? 'Delta payloads still transmitting. CRDT state valid.' : 'Toggle to inject network latency'}
                                        accentColor="orange" />
                                </div>
                            </div>

                            {/* Simulation Terminal */}
                            <div className="bg-zinc-950 rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden">
                                <div className="px-6 py-3 border-b border-zinc-800 flex items-center gap-3">
                                    <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-red-500" /><div className="w-3 h-3 rounded-full bg-amber-400" /><div className="w-3 h-3 rounded-full bg-green-500" /></div>
                                    <span className="text-xs font-mono font-bold text-zinc-400">Network Simulation Log — CRDT Engine</span>
                                    <button onClick={() => setSimLog(['[SYSTEM] Log cleared.'])} className="ml-auto text-xs text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1"><RefreshCcw size={12} /> Clear</button>
                                </div>
                                <div ref={simLogRef} className="p-6 h-64 overflow-y-auto font-mono text-xs space-y-1.5">
                                    {simLog.map((line, i) => (
                                        <div key={i} className={`${line.includes('🔴') || line.includes('❌') ? 'text-red-400' : line.includes('🟢') || line.includes('✅') ? 'text-green-400' : line.includes('⚠️') ? 'text-amber-400' : 'text-zinc-400'}`}>
                                            {line}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ─── AUDIT LOGS TAB ──────────────────────────────── */}
                    {activeTab === 'Audit Logs' && (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="w-full max-w-5xl mx-auto flex flex-col space-y-6">
                            <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl overflow-hidden">
                                <div className="px-8 py-6 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-rose-100 dark:bg-rose-900/40 text-rose-600 rounded-xl"><Terminal size={22} /></div>
                                        <div>
                                            <h3 className="text-xl font-bold text-zinc-900 dark:text-white">System Audit Trail</h3>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400">Real-time log of all system events, user actions, file conflicts, and synchronization states.</p>
                                        </div>
                                    </div>
                                    <button onClick={() => { setAuditEvents([]); addAuditEvent('Audit log cleared by Administrator.', 'warn'); }}
                                        className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-rose-500 transition-colors px-3 py-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-900/20 border border-transparent hover:border-rose-200 dark:hover:border-rose-800/50">
                                        <RefreshCcw size={14} /> Clear Log
                                    </button>
                                </div>
                                <div ref={auditLogRef} className="divide-y divide-zinc-100 dark:divide-zinc-700/50 max-h-[520px] overflow-y-auto">
                                    {auditEvents.length > 0 ? auditEvents.map((event) => (
                                        <div key={event.id} className="grid grid-cols-[auto_auto_1fr] gap-4 items-start px-8 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                            <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 whitespace-nowrap pt-0.5">{event.time}</span>
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap ${event.level === 'error' ? 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800/50' : event.level === 'warn' ? 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/50' : 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800/50'}`}>
                                                {event.level}
                                            </span>
                                            <span className="text-sm text-zinc-700 dark:text-zinc-300">{event.message}</span>
                                        </div>
                                    )) : (
                                        <div className="px-8 py-16 text-center">
                                            <div className="w-16 h-16 mx-auto rounded-full bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center mb-4"><Terminal size={28} className="text-zinc-400" /></div>
                                            <h4 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">No Events Logged</h4>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400">System events will appear here in real-time.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </main>
            </div>

            {/* Logout Modal */}
            <AnimatePresence>
                {isLogoutModalOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[90%] max-w-md">
                            <div className="h-1 w-full bg-gradient-to-r from-rose-500/50 via-rose-500 to-rose-500/50" />
                            <div className="p-6 text-center">
                                <div className="w-16 h-16 mx-auto bg-rose-500/10 rounded-full flex items-center justify-center mb-4"><LogOut size={32} className="text-rose-500" /></div>
                                <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Log out of Admin Console</h2>
                                <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">Are you sure you want to log out of the administrator panel?</p>
                                <div className="flex gap-4 w-full">
                                    <button onClick={() => setIsLogoutModalOpen(false)} className="flex-1 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm font-semibold">Cancel</button>
                                    <button onClick={() => router.push('/admin/login')} className="flex-1 py-3 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-500 hover:bg-rose-500 hover:text-white transition-all text-sm font-bold">Confirm</button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
