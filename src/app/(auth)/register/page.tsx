"use client";

import React, { useState } from 'react';
import { Mail, Loader2, AlertCircle, ArrowRight, ShieldCheck, ArrowLeft, User, Copy, CheckCircle2, BookOpen, Hash, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ThemeToggle } from '../../../components/ThemeToggle';
import { supabase } from '../../../lib/supabase';

export default function RegisterPage() {
    const router = useRouter();

    // Form fields
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [department, setDepartment] = useState('');
    const [role, setRole] = useState('');

    // State
    const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
    const [assignedLoginId, setAssignedLoginId] = useState<string | null>(null);
    const [isCopied, setIsCopied] = useState(false);
    const [isCopiedId, setIsCopiedId] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getNextLoginId = (): string => {
        try {
            const stored = localStorage.getItem('docusync_user_requests');
            const allUsers = stored ? JSON.parse(stored) : [];
            // Find highest existing loginId
            const maxId = allUsers.reduce((max: number, u: any) => {
                const id = parseInt(u.loginId || '1999');
                return id > max ? id : max;
            }, 1999);
            return String(maxId + 1);
        } catch {
            return '2000';
        }
    };

    const generateSecurePassword = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        let pass = '';
        for (let i = 0; i < 8; i++) {
            pass += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return pass;
    };

    const orbVariants: any = {
        animate: (i: number) => ({
            x: i % 2 === 0 ? [0, 80, -40, 0] : [0, -60, 50, 0],
            y: i % 2 === 0 ? [0, -40, 70, 0] : [0, 90, -30, 0],
            transition: { duration: 15 + i * 2, repeat: Infinity, ease: "easeInOut" }
        })
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const loginId = getNextLoginId();

        const newPassword = generateSecurePassword();

        // 1. Check if email already exists locally
        try {
            const stored = localStorage.getItem('docusync_user_requests');
            if (stored) {
                const allRequests = JSON.parse(stored);
                const existingUser = allRequests.find((u: any) => u.email === email);
                if (existingUser) {
                    setError('This email is already registered. Please log in or use a different email.');
                    setIsLoading(false);
                    return;
                }
            }
        } catch { /* ignore */ }

        // 2. Try Supabase (non-blocking)
        try {
            if (supabase) {
                const { error: signUpError } = await supabase.auth.signUp({
                    email,
                    password: newPassword,
                    options: { data: { full_name: name, department, role } }
                });

                if (signUpError &&
                    (signUpError.message.toLowerCase().includes('already registered') ||
                     signUpError.message.toLowerCase().includes('user already registered'))
                ) {
                    setError('This email is already registered. Please log in or use a different email.');
                    setIsLoading(false);
                    return;
                }
            }
        } catch { /* Network error — use local fallback */ }

        // 3. Always save locally so login works
        try {
            const stored = localStorage.getItem('docusync_user_requests');
            const allRequests = stored ? JSON.parse(stored) : [];
            allRequests.push({
                id: Date.now().toString(),
                loginId,
                name,
                email,
                department,
                role,
                password: newPassword,
                status: 'approved',
                requestDate: new Date().toISOString(),
            });
            localStorage.setItem('docusync_user_requests', JSON.stringify(allRequests));
        } catch { /* ignore */ }

        // 4. Show generated credentials
        setAssignedLoginId(loginId);
        setGeneratedPassword(newPassword);
        setIsLoading(false);
    };

    const inputClass = "block w-full pl-14 pr-6 py-5 border-none bg-zinc-100/50 dark:bg-black/20 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:bg-white dark:focus:bg-black/40 ring-0 outline-none transition-all duration-300 font-bold text-base";

    const departments = [
        'College of Computing Studies',
        'College of Engineering',
        'College of Business Administration',
        'College of Education',
        'College of Arts and Sciences',
        'College of Nursing',
        'Other',
    ];

    const roles = ['Student', 'Faculty', 'Researcher', 'Administrator'];

    return (
        <div className="min-h-screen bg-[#fafafa] dark:bg-[#050505] flex items-center justify-center relative font-sans overflow-hidden transition-colors duration-500 py-12">
            <title>Register | DocuSync Workspace</title>

            {/* Background Orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <motion.div custom={0} variants={orbVariants} animate="animate" className="absolute top-[10%] left-[10%] w-[60vw] h-[60vw] rounded-full bg-amber-400/20 dark:bg-amber-500/10 blur-[120px]" />
                <motion.div custom={1} variants={orbVariants} animate="animate" className="absolute bottom-[5%] right-[-5%] w-[50vw] h-[50vw] rounded-full bg-orange-400/20 dark:bg-orange-600/10 blur-[100px]" />
                <motion.div custom={2} variants={orbVariants} animate="animate" className="absolute top-[-20%] right-[15%] w-[40vw] h-[40vw] rounded-full bg-purple-400/15 dark:bg-purple-600/5 blur-[90px]" />
            </div>

            {/* Nav Buttons */}
            <div className="absolute top-8 left-8 z-30">
                <motion.button
                    initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4, duration: 0.6 }}
                    onClick={() => router.push('/')}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 dark:bg-zinc-900/50 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all text-sm font-bold shadow-lg"
                >
                    <ArrowLeft size={16} /> Home
                </motion.button>
            </div>
            <div className="absolute top-8 right-8 z-30">
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6 }}>
                    <ThemeToggle />
                </motion.div>
            </div>

            {/* Main Card */}
            <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="relative z-10 w-full max-w-lg px-6"
            >
                {/* Header */}
                <div className="text-center mb-8">
                    <motion.div
                        whileHover={{ scale: 1.05, rotate: 5 }}
                        className="w-20 h-20 mx-auto rounded-[2rem] bg-gradient-to-tr from-amber-500 to-purple-600 shadow-2xl shadow-amber-500/30 flex items-center justify-center mb-6 border-4 border-white/50 dark:border-white/10"
                    >
                        <User className="text-white drop-shadow-lg" size={38} />
                    </motion.div>
                    <h1 className="text-4xl font-black text-zinc-900 dark:text-white tracking-tight mb-2">Create Account</h1>
                    <div className="flex items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500 text-[11px] font-bold uppercase tracking-widest">
                        <ShieldCheck size={13} className="text-amber-500" /> Secure Registration — Password Auto-Generated
                    </div>
                </div>

                {/* Card */}
                <div className="w-full bg-white/70 dark:bg-zinc-900/40 backdrop-blur-[32px] p-8 sm:p-10 rounded-[3rem] border border-white/40 dark:border-white/10 shadow-[0_32px_80px_rgba(0,0,0,0.08)] dark:shadow-[0_40px_100px_rgba(0,0,0,0.5)] relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 via-orange-500 to-purple-500 opacity-80" />

                    {/* Error Banner */}
                    <AnimatePresence>
                        {error && (
                            <motion.div
                                initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                                animate={{ height: 'auto', opacity: 1, marginBottom: 24 }}
                                exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                                className="flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm font-semibold overflow-hidden"
                            >
                                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-black uppercase text-[10px] tracking-widest mb-1 opacity-60">Error</p>
                                    {error}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Success State */}
                    {generatedPassword ? (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center space-y-5 py-2">
                            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                                <CheckCircle2 size={32} />
                            </div>
                            <div className="text-center">
                                <h3 className="text-2xl font-bold text-zinc-900 dark:text-white mb-1">Account Created!</h3>
                                <p className="text-zinc-500 dark:text-zinc-400 text-sm">Save your Login ID and password below — you'll need both to log in.</p>
                            </div>

                            {/* Login ID */}
                            <div className="w-full bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-5 border border-amber-200 dark:border-amber-800/40">
                                <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 dark:text-amber-400 mb-3">Your Login ID</p>
                                <div className="flex items-center justify-between">
                                    <span className="text-3xl font-mono font-black text-amber-600 dark:text-amber-400 tracking-widest">{assignedLoginId}</span>
                                    <motion.button
                                        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                        onClick={() => { navigator.clipboard.writeText(assignedLoginId!); setIsCopiedId(true); setTimeout(() => setIsCopiedId(false), 2000); }}
                                        className={`p-3 rounded-xl transition-colors ${isCopiedId ? 'bg-amber-500/20 text-amber-500' : 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-600 dark:text-zinc-300'}`}
                                    >
                                        {isCopiedId ? <CheckCircle2 size={22} /> : <Copy size={22} />}
                                    </motion.button>
                                </div>
                                <p className="text-xs text-amber-600/70 dark:text-amber-400/60 mt-2 font-medium">Use this number to log in — not your email.</p>
                            </div>

                            {/* Password */}
                            <div className="w-full bg-zinc-100 dark:bg-zinc-800/50 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-700">
                                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">Your System Password</p>
                                <div className="flex items-center justify-between">
                                    <span className="text-2xl font-mono font-bold text-zinc-900 dark:text-white tracking-widest">{generatedPassword}</span>
                                    <motion.button
                                        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                        onClick={() => { navigator.clipboard.writeText(generatedPassword!); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); }}
                                        className={`p-3 rounded-xl transition-colors ${isCopied ? 'bg-emerald-500/20 text-emerald-500' : 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-600 dark:text-zinc-300'}`}
                                    >
                                        {isCopied ? <CheckCircle2 size={22} /> : <Copy size={22} />}
                                    </motion.button>
                                </div>
                            </div>

                            <motion.button
                                whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
                                onClick={() => router.push('/login')}
                                className="w-full py-5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black uppercase tracking-widest text-sm shadow-xl transition-all mt-2 flex items-center justify-center gap-3"
                            >
                                Proceed to Login <ArrowRight size={18} />
                            </motion.button>
                        </motion.div>
                    ) : (
                        <form onSubmit={handleRegister} className="space-y-5">

                            {/* Full Name */}
                            <div className="group">
                                <label className="block text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2 ml-1">Full Name</label>
                                <div className="relative rounded-2xl overflow-hidden shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none z-10">
                                        <User className="h-5 w-5 text-zinc-400 group-focus-within:text-amber-500 transition-colors" />
                                    </div>
                                    <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
                                        className={inputClass} placeholder="Enter your full name" />
                                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-amber-500 group-focus-within:w-full transition-all duration-500 ease-out" />
                                </div>
                            </div>

                            {/* Email */}
                            <div className="group">
                                <label className="block text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2 ml-1">Email Address</label>
                                <div className="relative rounded-2xl overflow-hidden shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none z-10">
                                        <Mail className="h-5 w-5 text-zinc-400 group-focus-within:text-amber-500 transition-colors" />
                                    </div>
                                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                                        className={inputClass} placeholder="Enter your Gmail or email" />
                                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-amber-500 group-focus-within:w-full transition-all duration-500 ease-out" />
                                </div>
                            </div>

                            {/* Department */}
                            <div className="group">
                                <label className="block text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2 ml-1">Department / College</label>
                                <div className="relative rounded-2xl overflow-hidden shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none z-10">
                                        <BookOpen className="h-5 w-5 text-zinc-400 group-focus-within:text-amber-500 transition-colors" />
                                    </div>
                                    <select required value={department} onChange={(e) => setDepartment(e.target.value)}
                                        className={`${inputClass} appearance-none cursor-pointer`}
                                        style={{ paddingLeft: '3.5rem' }}
                                    >
                                        <option value="" disabled>Select your department</option>
                                        {departments.map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                    <div className="absolute inset-y-0 right-0 pr-5 flex items-center pointer-events-none z-10">
                                        <ChevronDown className="h-5 w-5 text-zinc-400" />
                                    </div>
                                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-amber-500 group-focus-within:w-full transition-all duration-500 ease-out" />
                                </div>
                            </div>

                            {/* Role */}
                            <div className="group">
                                <label className="block text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2 ml-1">Role</label>
                                <div className="relative rounded-2xl overflow-hidden shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none z-10">
                                        <ShieldCheck className="h-5 w-5 text-zinc-400 group-focus-within:text-amber-500 transition-colors" />
                                    </div>
                                    <select required value={role} onChange={(e) => setRole(e.target.value)}
                                        className={`${inputClass} appearance-none cursor-pointer`}
                                        style={{ paddingLeft: '3.5rem' }}
                                    >
                                        <option value="" disabled>Select your role</option>
                                        {roles.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                    <div className="absolute inset-y-0 right-0 pr-5 flex items-center pointer-events-none z-10">
                                        <ChevronDown className="h-5 w-5 text-zinc-400" />
                                    </div>
                                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-amber-500 group-focus-within:w-full transition-all duration-500 ease-out" />
                                </div>
                            </div>



                            {/* Submit */}
                            <motion.button
                                type="submit"
                                disabled={isLoading}
                                whileHover={{ scale: 1.02, y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                className="w-full relative group overflow-hidden mt-3"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-[2rem] blur opacity-30 group-hover:opacity-50 transition-opacity" />
                                <div className="relative w-full py-5 rounded-[2rem] bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-black uppercase tracking-[0.2em] text-sm shadow-2xl flex justify-center items-center gap-3">
                                    {isLoading ? <><Loader2 className="h-5 w-5 animate-spin" /> Creating...</> : <>Create Account <ArrowRight size={18} /></>}
                                </div>
                            </motion.button>

                            <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 pt-2">
                                Already have an account?{' '}
                                <span onClick={() => router.push('/login')} className="text-amber-500 hover:text-amber-400 cursor-pointer font-bold transition-colors">Log In</span>
                            </p>
                        </form>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
