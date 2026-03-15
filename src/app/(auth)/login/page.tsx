"use client";

import React, { useState } from 'react';
import { Mail, Lock, Loader2, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '../../../components/ThemeToggle';
import { supabase } from '../../../lib/supabase';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            // 1. Try Supabase Auth if configured
            if (supabase) {
                const { error: authError } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (!authError) {
                    router.push('/dashboard/user/my-drive');
                    return;
                }
                
                // If Supabase error, only show it if the error is not "Invalid login credentials" 
                // because we might be using demo credentials
                if (authError.message !== 'Invalid login credentials') {
                    setError(authError.message);
                    setIsLoading(false);
                    return;
                }
            }

            // 2. Demo Fallback
            if (email === 'user@docusync.edu' && password === 'user123') {
                router.push('/dashboard/user/my-drive');
            } else {
                setError('Invalid workspace credentials. Please check your email and password.');
            }
        } catch (err: any) {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center relative font-sans overflow-hidden transition-colors duration-300">

            {/* Ambient Orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-25%] left-[-15%] w-[55vw] h-[55vw] rounded-full bg-amber-500/10 blur-[150px]" />
                <div className="absolute bottom-[-25%] right-[-15%] w-[55vw] h-[55vw] rounded-full bg-orange-500/10 blur-[150px]" />
            </div>

            {/* Theme Toggle */}
            <div className="absolute top-5 right-5 z-20">
                <ThemeToggle />
            </div>

            {/* Login Card */}
            <div className="relative z-10 w-full max-w-md px-4 sm:px-0">
                {/* Logo & Title */}
                <div className="text-center mb-10">
                    <div className="w-20 h-20 mx-auto rounded-3xl bg-amber-600 shadow-2xl shadow-amber-500/30 flex items-center justify-center mb-8 border-2 border-zinc-100 dark:border-zinc-800">
                        <Lock className="text-white drop-shadow-md" size={36} />
                    </div>
                    <h2 className="text-4xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight mb-3">
                        Welcome to DocuSync
                    </h2>
                    <p className="text-base text-zinc-500 dark:text-zinc-400 font-medium">
                        Secure workspace authentication required.
                    </p>
                </div>

                {/* Card Body */}
                <div className="bg-white dark:bg-zinc-900 py-10 px-8 shadow-[0_20px_60px_rgba(0,0,0,0.05)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.4)] rounded-[2rem] sm:px-12 border border-zinc-200 dark:border-zinc-800 overflow-hidden relative transition-colors duration-300">
                    {/* Decorative top bar */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-purple-500"></div>

                    {error && (
                        <div className="mb-6 flex items-center gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-sm font-semibold animate-in fade-in slide-in-from-top-2">
                            <AlertCircle size={18} className="shrink-0" />
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-7">
                        <div>
                            <label htmlFor="email" className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">
                                Email Address
                            </label>
                            <div className="mt-1 relative rounded-2xl group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-zinc-400 dark:text-zinc-500 group-focus-within:text-amber-600 dark:group-focus-within:text-amber-500 transition-colors" aria-hidden="true" />
                                </div>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    autoComplete="email"
                                    className="block w-full pl-12 rounded-2xl py-3.5 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all duration-200 sm:text-sm outline-none font-medium"
                                    placeholder="you@example.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">
                                Password
                            </label>
                            <div className="mt-1 relative rounded-2xl group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-zinc-400 dark:text-zinc-500 group-focus-within:text-amber-600 dark:group-focus-within:text-amber-500 transition-colors" aria-hidden="true" />
                                </div>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    className="block w-full pl-12 rounded-2xl py-3.5 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all duration-200 sm:text-sm outline-none font-medium tracking-wider"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                            <div className="flex items-center">
                                <input
                                    id="remember-me"
                                    name="remember-me"
                                    type="checkbox"
                                    className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 rounded cursor-pointer"
                                />
                                <label htmlFor="remember-me" className="ml-2 block text-sm text-zinc-600 dark:text-zinc-400 font-medium cursor-pointer">
                                    Remember me
                                </label>
                            </div>

                            <div className="text-sm">
                                <span className="font-bold text-amber-600 hover:text-amber-500 dark:text-amber-400 transition-colors cursor-pointer">
                                    Forgot Password?
                                </span>
                            </div>
                        </div>

                        <div className="pt-4">
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex justify-center items-center py-4 px-4 border border-transparent rounded-2xl shadow-xl text-sm font-extrabold text-white bg-amber-600 hover:bg-amber-700 shadow-amber-500/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 dark:focus:ring-offset-zinc-900 transition-all duration-300 transform hover:-translate-y-0.5 disabled:opacity-70 disabled:pointer-events-none"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        Authenticating...
                                    </>
                                ) : (
                                    "Access Workspace"
                                )}
                            </button>
                        </div>
                    </form>

                    <div className="mt-10 text-center text-sm border-t border-zinc-100 dark:border-zinc-800 pt-8">
                        <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                            User accounts are generated by your system administrator.
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
