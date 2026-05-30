"use client";

import React, { useState, useEffect } from 'react';
import { Mail, Lock, Loader2, AlertCircle, ArrowRight, ShieldCheck, Zap, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { ThemeToggle } from '../../../components/ThemeToggle';
import { supabase } from '../../../lib/supabase';
import { useSyncContext } from '../../../context/SyncContext';

interface UserRequest {
    id: string;
    loginId?: string;
    name: string;
    email: string;
    department: string;
    role: string;
    password?: string;
    status: 'pending' | 'approved' | 'denied';
    requestDate: string;
}

export default function LoginPage() {
    const router = useRouter();
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [isResetMode, setIsResetMode] = useState(false);
    const [resetSent, setResetSent] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    const [isCheckingSession, setIsCheckingSession] = useState(true);
    const { pendingUserRequests } = useSyncContext();

    // Auto-login: redirect if a session already exists in localStorage
    useEffect(() => {
        try {
            const stored = localStorage.getItem('docusync_current_user');
            if (stored) {
                const user = JSON.parse(stored);
                if (user?.loginId === 'admin') {
                    router.replace('/dashboard/admin/control-panel');
                } else if (user?.loginId) {
                    router.replace('/dashboard/user/my-drive');
                } else {
                    setIsCheckingSession(false);
                }
                return;
            }
        } catch { /* ignore */ }
        setIsCheckingSession(false);
    }, [router]);

    // Jitter-style Animation Variants
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.15,
                delayChildren: 0.3
            }
        }
    };

    const itemVariants: Variants = {
        hidden: { y: 30, opacity: 0, scale: 0.98 },
        show: { 
            y: 0, 
            opacity: 1, 
            scale: 1,
            transition: { 
                duration: 1.1, 
                ease: [0.22, 1, 0.36, 1] 
            } 
        }
    };

    const orbVariants: Variants = {
        animate: (i: number) => ({
            x: i % 2 === 0 ? [0, 80, -40, 0] : [0, -60, 50, 0],
            y: i % 2 === 0 ? [0, -40, 70, 0] : [0, 90, -30, 0],
            transition: {
                duration: 15 + i * 2,
                repeat: Infinity,
                ease: "easeInOut"
            }
        })
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const cleanEmail = resetEmail.trim();
        try {
            if (supabase) {
                const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
                    redirectTo: `${window.location.origin}/dashboard/user/my-drive`
                });
                
                if (resetError) {
                    setError(resetError.message);
                } else {
                    setResetSent(true);
                }
            } else {
                setError("Backend not connected! Wait for Supabase Config.");
            }
        } catch {
            setError("Unexpected error sending reset email.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const cleanId = loginId.trim();
        const cleanPassword = password.trim();

        try {
            // 1. Look up user by loginId in localStorage
            let matchedUser: UserRequest | null = null;
            let pendingUser: UserRequest | null = null;
            try {
                const stored = localStorage.getItem('docusync_user_requests');
                if (stored) {
                    const allRequests = JSON.parse(stored) as UserRequest[];
                    matchedUser = allRequests.find(
                        (u: UserRequest) => u.loginId === cleanId && u.password === cleanPassword && u.status === 'approved'
                    ) || null;
                    // Check if user has submitted request but hasn't been approved yet
                    if (!matchedUser) {
                        pendingUser = allRequests.find(
                            (u: UserRequest) => u.email === cleanId && u.status === 'pending'
                        ) || null;
                    }
                }
            } catch { /* ignore */ }

            if (matchedUser) {
                // Login with the real name — not the login ID
                localStorage.setItem('docusync_current_user', JSON.stringify({
                    name: matchedUser.name,
                    email: matchedUser.email,
                    loginId: matchedUser.loginId,
                    role: matchedUser.role,
                    department: matchedUser.department,
                }));
                router.push('/dashboard/user/my-drive');
                return;
            }

            if (pendingUser) {
                setError('Your account is pending admin approval. Please wait for an administrator to review your request.');
                setIsLoading(false);
                return;
            }

            // 2. Demo admin fallback
            if (cleanId === 'admin' && cleanPassword === 'admin123') {
                localStorage.setItem('docusync_current_user', JSON.stringify({ name: 'System Administrator', email: 'admin@docusync.edu', loginId: 'admin' }));
                router.push('/dashboard/admin/control-panel');
                return;
            }

            // 2.5. Demo user fallback
            if (cleanId === 'user' && cleanPassword === 'user123') {
                localStorage.setItem('docusync_current_user', JSON.stringify({ name: 'Demo User', email: 'user@docusync.edu', loginId: 'user', role: 'Student', department: 'College of Computing Studies' }));
                router.push('/dashboard/user/my-drive');
                return;
            }

            // 3. Try Supabase with email lookup from loginId
            try {
                const stored = localStorage.getItem('docusync_user_requests');
                if (stored && supabase) {
                    const allRequests = JSON.parse(stored) as UserRequest[];
                    const userByIdOnly = allRequests.find((u: UserRequest) => u.loginId === cleanId);
                    if (userByIdOnly) {
                        const { data, error: authError } = await supabase.auth.signInWithPassword({
                            email: userByIdOnly.email,
                            password: cleanPassword,
                        });
                        if (!authError && data.session) {
                            localStorage.setItem('docusync_current_user', JSON.stringify({
                                name: userByIdOnly.name,
                                email: userByIdOnly.email,
                                loginId: cleanId,
                            }));
                            router.push('/dashboard/user/my-drive');
                            return;
                        }
                    }
                }
            } catch { /* ignore */ }

            setError('Invalid Login ID or password. Please check your credentials.');
        } catch {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (isCheckingSession) {
        return (
            <div className="min-h-screen bg-[#fafafa] dark:bg-[#050505] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30 animate-pulse">
                        <svg xmlns="http://www.w3.org/2000/svg" width="60%" height="60%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest text-zinc-400">Checking Session…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#fafafa] dark:bg-[#050505] flex items-center justify-center relative font-sans overflow-hidden transition-colors duration-500">
            <title>Login | DocuSync Workspace</title>

            {/* Premium Jitter-style Background Orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <motion.div 
                    custom={0}
                    variants={orbVariants}
                    animate="animate"
                    className="absolute top-[10%] left-[10%] w-[60vw] h-[60vw] rounded-full bg-amber-400/20 dark:bg-amber-500/10 blur-[120px]" 
                />
                <motion.div 
                    custom={1}
                    variants={orbVariants}
                    animate="animate"
                    className="absolute bottom-[5%] right-[-5%] w-[50vw] h-[50vw] rounded-full bg-orange-400/20 dark:bg-orange-600/10 blur-[100px]" 
                />
                <motion.div 
                    custom={2}
                    variants={orbVariants}
                    animate="animate"
                    className="absolute top-[-20%] right-[15%] w-[40vw] h-[40vw] rounded-full bg-purple-400/15 dark:bg-purple-600/5 blur-[90px]" 
                />
            </div>

            {/* Top Navigation / Theme Toggle */}
            <div className="absolute top-8 left-8 z-30">
                <motion.button 
                    initial={{ opacity: 0, x: -20 }} 
                    animate={{ opacity: 1, x: 0 }} 
                    transition={{ delay: 0.8, duration: 0.8 }}
                    onClick={() => router.push('/')}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 dark:bg-zinc-900/50 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-white/80 dark:hover:bg-zinc-800 transition-all text-sm font-bold shadow-lg"
                >
                    <ArrowLeft size={16} /> Home
                </motion.button>
            </div>

            <div className="absolute top-8 right-8 z-30">
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1, duration: 0.8 }}>
                    <ThemeToggle />
                </motion.div>
            </div>

            {/* Content Container */}
            <motion.div 
                id="login-container"
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="relative z-10 w-full max-w-xl px-6 flex flex-col items-center"
            >
                {/* Logo & Branding Area */}
                <motion.div variants={itemVariants} className="mb-12 text-center">
                    <motion.div 
                        whileHover={{ scale: 1.05, rotate: 5 }}
                        whileTap={{ scale: 0.95 }}
                        className="w-28 h-28 mx-auto flex items-center justify-center mb-8 relative overflow-hidden group"
                    >
                        <div className="w-full h-full rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30 p-5">
                            <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
                        </div>
                    </motion.div>
                    <motion.h2 className="text-5xl font-black text-zinc-900 dark:text-white tracking-tight leading-[1.1] mb-4">
                        {isResetMode ? 'Reset Access' : 'DocuSync'}
                    </motion.h2>
                    <div className="flex items-center justify-center gap-3 text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-[0.2em] text-[10px]">
                        <ShieldCheck size={14} className="text-amber-500" /> 
                        {isResetMode ? 'Secure Link Generation' : 'Enterprise Auth Verified'}
                        <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-1" />
                        <Zap size={14} className="text-orange-500" />
                        Spring-Engine v4.0
                    </div>
                </motion.div>

                {/* Login Card (Premium Glassmorphism) */}
                <motion.div 
                    variants={itemVariants}
                    className="w-full bg-white/70 dark:bg-zinc-900/40 backdrop-blur-[32px] p-10 sm:p-14 rounded-[3.5rem] border border-white/40 dark:border-white/10 shadow-[0_32px_80px_rgba(0,0,0,0.08)] dark:shadow-[0_40px_100px_rgba(0,0,0,0.5)] relative overflow-hidden transition-colors duration-500"
                >
                    {/* Inner Accent Line */}
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 via-orange-500 to-purple-500 opacity-80" />

                    <AnimatePresence mode="wait">
                        {error && (
                            <motion.div 
                                initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                                animate={{ height: 'auto', opacity: 1, marginBottom: 32 }}
                                exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                                className="flex items-start gap-4 p-5 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm font-semibold overflow-hidden"
                            >
                                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-black uppercase text-[10px] tracking-widest mb-1 opacity-60">Security Alert</p>
                                    {error}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <form onSubmit={handleLogin} className="space-y-8">
                        {/* Login ID Field */}
                        <div className="group">
                            <label htmlFor="loginid-input" className="block text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-3 ml-2">Login ID</label>
                            <motion.div 
                                className="relative rounded-3xl overflow-hidden shadow-sm"
                                whileFocus={{ scale: 1.01 }}
                                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            >
                                <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none z-10">
                                    <ShieldCheck className="h-5 w-5 text-zinc-400 dark:text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
                                </div>
                                <input
                                    id="loginid-input"
                                    type="text"
                                    required
                                    value={loginId}
                                    onChange={(e) => setLoginId(e.target.value)}
                                    className="block w-full pl-14 pr-6 py-5 border-none bg-zinc-100/50 dark:bg-black/20 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:bg-white dark:focus:bg-black/40 ring-0 outline-none transition-all duration-300 font-bold text-base"
                                    placeholder="Enter your Login ID (e.g. 2000)"
                                />
                                <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-amber-500 group-focus-within:w-full transition-all duration-500 ease-out" />
                            </motion.div>
                        </div>

                        {/* Password Field */}
                        {!isResetMode && (
                            <div className="group">
                                <label htmlFor="password-input" className="flex justify-between items-center text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-3 ml-2">
                                    <span>Password</span>
                                    <span onClick={() => { setIsResetMode(true); setError(null); }} className="text-[10px] text-amber-600 hover:text-amber-500 cursor-pointer mr-2 transition-colors">Forgot Password?</span>
                                </label>
                                <motion.div 
                                    className="relative rounded-3xl overflow-hidden shadow-sm"
                                    whileFocus={{ scale: 1.01 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                >
                                    <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none z-10">
                                        <Lock className="h-5 w-5 text-zinc-400 dark:text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
                                    </div>
                                    <input
                                        id="password-input"
                                        type={showPassword ? 'text' : 'password'}
                                        required={!isResetMode}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="block w-full pl-14 pr-14 py-5 border-none bg-zinc-100/50 dark:bg-black/20 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:bg-white dark:focus:bg-black/40 ring-0 outline-none transition-all duration-300 font-bold text-base tracking-widest"
                                        placeholder="••••••••"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 pr-6 flex items-center z-10 text-zinc-400 hover:text-amber-500 transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                    </button>
                                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-amber-500 group-focus-within:w-full transition-all duration-500 ease-out" />
                                </motion.div>
                            </div>
                        )}

                        {/* Footer Actions */}
                        <div className="flex items-center justify-between px-2">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative">
                                    <input type="checkbox" className="sr-only peer" id="remember-me" defaultChecked={!isResetMode} />
                                    <div className="w-6 h-6 rounded-lg border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 peer-checked:bg-amber-500 peer-checked:border-amber-500 transition-all flex items-center justify-center">
                                        <div className="w-2 h-2 bg-white rounded-full opacity-0 peer-checked:opacity-100 transition-opacity" />
                                    </div>
                                </div>
                                <span className="text-[11px] font-black uppercase tracking-widest text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors">Keep Signed In</span>
                            </label>
                        </div>

                        {/* Submit Button */}
                        <motion.button
                            id="submit-auth"
                            type="submit"
                            disabled={isLoading}
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98, y: 0 }}
                            className="w-full relative group overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-[2rem] blur opacity-30 group-hover:opacity-50 transition-opacity" />
                            <div className="relative w-full py-6 rounded-[2rem] bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-black uppercase tracking-[0.2em] text-sm shadow-2xl transition-colors flex justify-center items-center gap-3">
                                {isLoading ? (
                                    <>
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        Wait...
                                    </>
                                ) : (
                                    <>
                                        Access Sync <ArrowRight size={18} />
                                    </>
                                )}
                            </div>
                        </motion.button>

                        {/* Quick Demo Access Panels */}
                        <div className="relative py-4 flex items-center gap-4">
                            <div className="flex-grow h-px bg-zinc-200 dark:bg-zinc-800" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Quick Login Panels</span>
                            <div className="flex-grow h-px bg-zinc-200 dark:bg-zinc-800" />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <motion.button
                                type="button"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                    localStorage.setItem('docusync_current_user', JSON.stringify({ name: 'Demo User', email: 'user@docusync.edu', loginId: 'user', role: 'Student', department: 'College of Computing Studies' }));
                                    router.push('/dashboard/user/my-drive');
                                }}
                                className="w-full py-4 rounded-2xl border-2 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-bold text-xs uppercase tracking-widest hover:bg-zinc-100 dark:hover:bg-white/10 transition-all flex flex-col justify-center items-center gap-1.5"
                            >
                                <Zap size={18} className="text-amber-500" />
                                User Panel
                            </motion.button>

                            <motion.button
                                type="button"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                    localStorage.setItem('docusync_current_user', JSON.stringify({ name: 'System Administrator', email: 'admin@docusync.edu', loginId: 'admin' }));
                                    router.push('/dashboard/admin/control-panel');
                                }}
                                className="w-full py-4 rounded-2xl border-2 border-amber-500/20 dark:border-amber-500/20 text-amber-600 dark:text-amber-500 font-bold text-xs uppercase tracking-widest hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-all flex flex-col justify-center items-center gap-1.5 shadow-lg shadow-amber-500/5"
                            >
                                <ShieldCheck size={18} className="text-amber-500" />
                                Admin Panel
                            </motion.button>
                        </div>
                    </form>

                    <div className="mt-12 text-center text-[10px] text-zinc-400 dark:text-zinc-600 font-bold uppercase tracking-[0.2em]">
                        Sync Cloud Infrastructure © 2026
                    </div>
                </motion.div>
                
                {/* Secondary Info */}
                <motion.p variants={itemVariants} className="mt-10 text-center text-xs text-zinc-500 dark:text-zinc-600 font-medium">
                    Don&apos;t have an account?{' '}
                    <span onClick={() => router.push('/#access-form')} className="text-amber-500 hover:text-amber-400 cursor-pointer font-bold transition-colors underline">Request Access</span>
                    {' · '}
                    <span className="text-zinc-400">Admin? Use Login ID <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">admin</code></span>
                </motion.p>
            </motion.div>
        </div>
    );
}
