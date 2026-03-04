"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '../../../../components/ThemeToggle';
import {
    Shield, Activity, RefreshCcw, Database, User, Trash2,
    Wifi, CheckCircle2, UserPlus, LogOut, X, Clock,
    Mail, Key, Eye, EyeOff, Copy, BadgeCheck
} from 'lucide-react';

export default function AdminDashboard() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<string>('System Overview');
    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
    const [showGenPassword, setShowGenPassword] = useState(false);

    // Approval queue state
    const [pendingUsers, setPendingUsers] = useState<{ id: number; name: string; email: string; requestDate: string; status: 'pending' | 'approved' }[]>([
        { id: 1, name: 'Maria Santos', email: 'maria.santos@institution.edu', requestDate: 'Mar 1, 2026', status: 'pending' },
        { id: 2, name: 'John Rivera', email: 'j.rivera@institution.edu', requestDate: 'Mar 2, 2026', status: 'pending' },
        { id: 3, name: 'Angela Cruz', email: 'a.cruz@institution.edu', requestDate: 'Mar 3, 2026', status: 'pending' },
        { id: 4, name: 'Carlos Reyes', email: 'c.reyes@institution.edu', requestDate: 'Mar 4, 2026', status: 'pending' },
    ]);
    const [approvedUser, setApprovedUser] = useState<{ name: string; email: string; role: string; password: string } | null>(null);

    const generatePassword = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
        let pass = '';
        for (let i = 0; i < 16; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
        return pass;
    };

    const handleApprove = (userId: number) => {
        const user = pendingUsers.find(u => u.id === userId);
        if (!user) return;
        const password = generatePassword();
        setPendingUsers(prev => prev.map(u => u.id === userId ? { ...u, status: 'approved' } : u));
        setApprovedUser({ name: user.name, email: user.email, role: 'Editor', password });
    };

    const dismissApproval = () => {
        setApprovedUser(null);
        setPendingUsers(prev => prev.filter(u => u.status !== 'approved'));
    };

    const floatAnim = {
        initial: { y: 0 },
        animate: { y: [-3, 3, -3], transition: { duration: 5, repeat: Infinity, ease: "easeInOut" as const } }
    };

    const navItems = [
        { name: 'System Overview', icon: Activity },
        { name: 'Account Generation', icon: UserPlus },
    ];

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 transition-colors duration-300 font-sans selection:bg-rose-500/30 relative overflow-hidden flex">
            {/* Ambient Background — Rose-tinted */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-rose-600/10 dark:bg-rose-900/20 blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-rose-500/10 dark:bg-zinc-800/50 blur-[150px]" />
            </div>

            {/* ═══════════ ADMIN SIDEBAR (Rose) ═══════════ */}
            <div className="relative z-10 w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 backdrop-blur-2xl px-5 py-8 flex flex-col shadow-[10px_0_30px_rgba(0,0,0,0.5)]">
                <motion.div variants={floatAnim} initial="initial" animate="animate" className="flex items-center gap-3 mb-6 cursor-pointer">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500 to-rose-600 shadow-lg flex items-center justify-center">
                        <Shield size={18} className="text-white" />
                    </div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-rose-600 to-rose-700 dark:from-rose-400 dark:to-rose-500 tracking-tight">
                        DocuSync
                    </h1>
                </motion.div>

                {/* Admin badge */}
                <div className="mb-8 px-4 py-3 rounded-xl bg-rose-100 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800/50">
                    <p className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider flex items-center gap-2"><Shield size={14} /> Admin Console</p>
                </div>

                <div className="flex-1 flex flex-col gap-1">
                    {navItems.map((item) => {
                        const isActive = activeTab === item.name;
                        return (
                            <motion.button
                                key={item.name}
                                onClick={() => setActiveTab(item.name)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 ${isActive
                                    ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 shadow-md border border-rose-200 dark:border-rose-900/50'
                                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent'
                                    }`}
                                whileHover={{ scale: isActive ? 1 : 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <item.icon size={18} className={isActive ? "text-rose-600 dark:text-rose-400" : ""} />
                                <span className="font-medium text-sm tracking-wide">{item.name}</span>
                            </motion.button>
                        );
                    })}
                </div>

                {/* Sidebar footer */}
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
                    <div className="flex items-center text-sm font-medium bg-white dark:bg-zinc-900 backdrop-blur-md px-5 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-md">
                        <Shield size={16} className="text-rose-500 mr-2" />
                        <span className="text-zinc-900 dark:text-white font-bold">Admin Command Center</span>
                        <span className="mx-3 text-zinc-300 dark:text-zinc-600">|</span>
                        <span className="text-zinc-500 dark:text-zinc-400">{activeTab}</span>
                    </div>
                    <div className="flex items-center gap-4 bg-white dark:bg-zinc-900 backdrop-blur-md px-5 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-md">
                        <ThemeToggle />
                        <span className="text-xs font-bold bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800/50">SYSTEM ADMINISTRATOR</span>
                    </div>
                </header>

                {/* Main Area */}
                <main className="flex-1 overflow-y-auto px-8 pb-24">
                    {activeTab === 'System Overview' ? (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="w-full max-w-6xl mx-auto flex flex-col space-y-6">
                            {/* System Overview Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                {/* Active WebSocket Connections */}
                                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-6 rounded-2xl shadow-lg relative overflow-hidden group hover:border-rose-400/50 dark:hover:border-rose-600/50 transition-colors">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 dark:bg-rose-500/10 rounded-full -translate-y-8 translate-x-8 group-hover:scale-125 transition-transform"></div>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2.5 bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-xl"><Wifi size={20} /></div>
                                        <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Active WebSocket Connections</span>
                                    </div>
                                    <div className="flex items-end gap-2">
                                        <span className="text-4xl font-extrabold text-zinc-900 dark:text-white">24</span>
                                        <span className="text-sm font-bold text-green-500 mb-1 flex items-center gap-1"><CheckCircle2 size={14} /> Live</span>
                                    </div>
                                    <div className="mt-3 w-full h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden"><div className="h-full w-[60%] bg-gradient-to-r from-rose-500 to-orange-500 rounded-full"></div></div>
                                </div>

                                {/* System Health */}
                                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-6 rounded-2xl shadow-lg relative overflow-hidden group hover:border-green-400/50 dark:hover:border-green-600/50 transition-colors">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 dark:bg-green-500/10 rounded-full -translate-y-8 translate-x-8 group-hover:scale-125 transition-transform"></div>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2.5 bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 rounded-xl"><Activity size={20} /></div>
                                        <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">System Health</span>
                                    </div>
                                    <div className="flex items-end gap-2">
                                        <span className="text-4xl font-extrabold text-zinc-900 dark:text-white">99.8%</span>
                                        <span className="text-sm font-bold text-green-500 mb-1">Uptime</span>
                                    </div>
                                    <div className="mt-3 w-full h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden"><div className="h-full w-[99.8%] bg-gradient-to-r from-green-500 to-emerald-500 rounded-full"></div></div>
                                </div>

                                {/* Total Workspaces */}
                                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-6 rounded-2xl shadow-lg relative overflow-hidden group hover:border-purple-400/50 dark:hover:border-purple-600/50 transition-colors">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 dark:bg-purple-500/10 rounded-full -translate-y-8 translate-x-8 group-hover:scale-125 transition-transform"></div>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2.5 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded-xl"><Database size={20} /></div>
                                        <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Total Workspaces</span>
                                    </div>
                                    <div className="flex items-end gap-2">
                                        <span className="text-4xl font-extrabold text-zinc-900 dark:text-white">12</span>
                                        <span className="text-sm font-bold text-purple-500 mb-1">Repositories</span>
                                    </div>
                                    <div className="mt-3 w-full h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden"><div className="h-full w-[30%] bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full"></div></div>
                                </div>
                            </div>

                            {/* Delete Group Section */}
                            <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-6 rounded-2xl shadow-xl">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-rose-100 dark:bg-rose-900/40 text-rose-600 rounded-xl"><Trash2 size={22} /></div>
                                        <div>
                                            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Delete Synchronization Group</h3>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400">Permanently purge a group workspace and all associated metadata from the system.</p>
                                        </div>
                                    </div>
                                    <button className="flex items-center gap-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 dark:hover:bg-rose-900/40 text-rose-600 font-bold px-5 py-3 rounded-xl transition-colors border border-rose-200 dark:border-rose-800/50 text-sm whitespace-nowrap">
                                        <Trash2 size={16} /> Select Group to Delete
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="w-full max-w-5xl mx-auto flex flex-col space-y-6">

                            {/* Approved User Success Card */}
                            {approvedUser && (
                                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded-2xl shadow-xl overflow-hidden">
                                    <div className="h-1 w-full bg-gradient-to-r from-green-400 via-emerald-500 to-green-400"></div>
                                    <div className="p-6">
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center"><BadgeCheck size={24} className="text-green-600 dark:text-green-400" /></div>
                                                <div>
                                                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Account Approved & Credentials Generated</h3>
                                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Distribute these credentials to <strong className="text-zinc-700 dark:text-zinc-200">{approvedUser.name}</strong> offline.</p>
                                                </div>
                                            </div>
                                            <button onClick={dismissApproval} className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"><X size={18} /></button>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
                                            <div>
                                                <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Name</p>
                                                <p className="text-sm font-bold text-zinc-900 dark:text-white">{approvedUser.name}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Email</p>
                                                <p className="text-sm font-bold text-zinc-900 dark:text-white">{approvedUser.email}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Assigned Role</p>
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800/50">{approvedUser.role}</span>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Generated Password</p>
                                                <div className="flex items-center gap-2">
                                                    <code className="text-sm font-bold font-mono text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800/40">{showGenPassword ? approvedUser.password : '••••••••••••••••'}</code>
                                                    <button onClick={() => setShowGenPassword(!showGenPassword)} className="text-zinc-400 hover:text-rose-500 transition-colors">{showGenPassword ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                                                    <button onClick={() => navigator.clipboard.writeText(approvedUser.password)} className="text-zinc-400 hover:text-rose-500 transition-colors"><Copy size={14} /></button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Pending Registrations Table */}
                            <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl overflow-hidden">
                                <div className="px-8 py-6 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-rose-100 dark:bg-rose-900/40 text-rose-600 rounded-xl"><UserPlus size={22} /></div>
                                        <div>
                                            <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Pending Registrations</h3>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400">Review and approve user access requests. Approved users receive auto-generated credentials.</p>
                                        </div>
                                    </div>
                                    <span className="flex items-center gap-2 text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800/50">
                                        <Clock size={14} /> {pendingUsers.filter(u => u.status === 'pending').length} Pending
                                    </span>
                                </div>

                                {/* Column Headers */}
                                <div className="grid grid-cols-[2fr_2fr_1fr_auto] gap-4 px-8 py-3 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-700/50">
                                    <div>Full Name</div>
                                    <div>Email</div>
                                    <div>Request Date</div>
                                    <div className="text-right">Action</div>
                                </div>

                                {/* User Rows */}
                                <div className="divide-y divide-zinc-100 dark:divide-zinc-700/50">
                                    {pendingUsers.filter(u => u.status === 'pending').length > 0 ? (
                                        pendingUsers.filter(u => u.status === 'pending').map((user) => (
                                            <motion.div
                                                key={user.id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0, x: -20 }}
                                                className="grid grid-cols-[2fr_2fr_1fr_auto] gap-4 items-center px-8 py-5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
                                            >
                                                {/* Name */}
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-rose-500 to-rose-600 flex items-center justify-center text-sm font-bold text-white shadow-sm">
                                                        {user.name.split(' ').map(n => n[0]).join('')}
                                                    </div>
                                                    <span className="font-semibold text-zinc-900 dark:text-zinc-200 text-sm">{user.name}</span>
                                                </div>

                                                {/* Email */}
                                                <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                                                    <Mail size={14} className="text-zinc-400 dark:text-zinc-500 shrink-0" />
                                                    {user.email}
                                                </div>

                                                {/* Request Date */}
                                                <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                                                    <Clock size={14} className="text-zinc-400 dark:text-zinc-500 shrink-0" />
                                                    {user.requestDate}
                                                </div>

                                                {/* Action Button */}
                                                <div className="flex justify-end">
                                                    <button
                                                        onClick={() => handleApprove(user.id)}
                                                        className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 whitespace-nowrap"
                                                    >
                                                        <BadgeCheck size={14} /> Accept & Generate
                                                    </button>
                                                </div>
                                            </motion.div>
                                        ))
                                    ) : (
                                        <div className="px-8 py-16 text-center">
                                            <div className="w-16 h-16 mx-auto rounded-full bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center mb-4">
                                                <CheckCircle2 size={28} className="text-green-500" />
                                            </div>
                                            <h4 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">All Caught Up</h4>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400">No pending registration requests at this time.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </main>
            </div>

            {/* Logout Modal */}
            {isLogoutModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[90%] max-w-md">
                        <div className="h-1 w-full bg-gradient-to-r from-rose-500/50 via-rose-500 to-rose-500/50"></div>
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 mx-auto bg-rose-500/10 rounded-full flex items-center justify-center mb-4"><LogOut size={32} className="text-rose-500" /></div>
                            <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Log out of Admin Console</h2>
                            <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">Are you sure you want to log out of the administrator panel?</p>
                            <div className="flex gap-4 w-full">
                                <button onClick={() => setIsLogoutModalOpen(false)} className="flex-1 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm font-semibold">Cancel</button>
                                <button onClick={() => router.push('/admin/login')} className="flex-1 py-3 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-500 hover:bg-rose-500 hover:text-white transition-all text-sm font-bold">Confirm</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
