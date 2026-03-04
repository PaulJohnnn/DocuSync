"use client";

import React from 'react';
import { Shield, User, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '../../../components/ThemeToggle';

export default function AdminLoginPage() {
    const router = useRouter();

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center relative font-sans overflow-hidden transition-colors duration-300">

            {/* Ambient Orbs — same amber/orange as user login */}
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
                        <Shield className="text-white drop-shadow-md" size={36} />
                    </div>
                    <h2 className="text-4xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight mb-3">
                        Admin Command Center
                    </h2>
                    <p className="text-base text-zinc-500 dark:text-zinc-400 font-medium">
                        Restricted access. Administrator credentials required.
                    </p>
                    <span className="inline-block mt-4 px-4 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-bold border border-amber-200 dark:border-amber-800/50 tracking-wide uppercase">
                        Restricted Access
                    </span>
                </div>

                {/* Card Body */}
                <div className="bg-white dark:bg-zinc-900 py-10 px-8 shadow-[0_20px_60px_rgba(0,0,0,0.05)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.4)] rounded-[2rem] sm:px-12 border border-zinc-200 dark:border-zinc-800 overflow-hidden relative transition-colors duration-300">
                    {/* Decorative top bar */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-purple-500"></div>

                    <form onSubmit={(e) => { e.preventDefault(); router.push('/dashboard/admin/control-panel'); }} className="space-y-7">

                        {/* Administrator ID */}
                        <div>
                            <label htmlFor="admin-id" className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">
                                Administrator ID
                            </label>
                            <div className="mt-1 relative rounded-2xl group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Shield className="h-5 w-5 text-zinc-400 dark:text-zinc-500 group-focus-within:text-amber-600 dark:group-focus-within:text-amber-500 transition-colors" aria-hidden="true" />
                                </div>
                                <input
                                    id="admin-id"
                                    name="admin-id"
                                    type="text"
                                    className="block w-full pl-12 rounded-2xl py-3.5 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all duration-200 sm:text-sm outline-none font-medium"
                                    placeholder="ADMIN-XXXX"
                                />
                            </div>
                        </div>

                        {/* Admin Username */}
                        <div>
                            <label htmlFor="admin-username" className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">
                                Admin Username
                            </label>
                            <div className="mt-1 relative rounded-2xl group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <User className="h-5 w-5 text-zinc-400 dark:text-zinc-500 group-focus-within:text-amber-600 dark:group-focus-within:text-amber-500 transition-colors" aria-hidden="true" />
                                </div>
                                <input
                                    id="admin-username"
                                    name="admin-username"
                                    type="text"
                                    className="block w-full pl-12 rounded-2xl py-3.5 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all duration-200 sm:text-sm outline-none font-medium"
                                    placeholder="admin_username"
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label htmlFor="admin-password" className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">
                                Password
                            </label>
                            <div className="mt-1 relative rounded-2xl group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-zinc-400 dark:text-zinc-500 group-focus-within:text-amber-600 dark:group-focus-within:text-amber-500 transition-colors" aria-hidden="true" />
                                </div>
                                <input
                                    id="admin-password"
                                    name="admin-password"
                                    type="password"
                                    autoComplete="current-password"
                                    className="block w-full pl-12 rounded-2xl py-3.5 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all duration-200 sm:text-sm outline-none font-medium tracking-wider"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <div className="pt-4">
                            <button
                                type="submit"
                                className="w-full flex justify-center py-4 px-4 border border-transparent rounded-2xl shadow-xl text-sm font-extrabold text-white bg-amber-600 hover:bg-amber-700 shadow-amber-500/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 dark:focus:ring-offset-zinc-900 transition-all duration-300 transform hover:-translate-y-0.5"
                            >
                                Access Command Center
                            </button>
                        </div>
                    </form>

                    <div className="mt-10 text-center text-sm border-t border-zinc-100 dark:border-zinc-800 pt-8">
                        <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                            Admin credentials are distributed offline for security.
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
