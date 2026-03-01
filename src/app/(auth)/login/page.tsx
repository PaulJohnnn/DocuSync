"use client";

import React from 'react';
import { Mail, Lock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const router = useRouter();
    return (
        <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center relative font-sans overflow-hidden">

            {/* Ambient Neon Orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-25%] left-[-15%] w-[55vw] h-[55vw] rounded-full bg-cyan-500/10 blur-[150px]" />
                <div className="absolute bottom-[-25%] right-[-15%] w-[55vw] h-[55vw] rounded-full bg-purple-500/10 blur-[150px]" />
                <div className="absolute top-[40%] left-[60%] w-[35vw] h-[35vw] rounded-full bg-indigo-500/[0.07] blur-[120px]" />
            </div>

            {/* Login Card */}
            <div className="relative z-10 w-full max-w-md px-4 sm:px-0">
                {/* Logo & Title */}
                <div className="text-center mb-10">
                    <div className="w-20 h-20 mx-auto bg-gradient-to-br from-cyan-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-cyan-500/30 mb-8 border-2 border-white/10">
                        <Lock className="text-white drop-shadow-[0_0_12px_rgba(34,211,238,0.6)]" size={36} />
                    </div>
                    <h2 className="text-4xl font-extrabold text-white tracking-tight mb-3">
                        Welcome to DocuSync
                    </h2>
                    <p className="text-base text-slate-400 font-medium">
                        Secure workspace authentication required.
                    </p>
                </div>

                {/* Card Body */}
                <div className="bg-white/[0.04] backdrop-blur-2xl py-10 px-8 shadow-[0_20px_60px_rgba(0,0,0,0.4)] rounded-[2rem] sm:px-12 border border-white/10 overflow-hidden relative">
                    {/* Decorative top bar */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500"></div>

                    <form onSubmit={(e) => { e.preventDefault(); router.push('/dashboard'); }} className="space-y-7 mt-2">
                        <div>
                            <label htmlFor="email" className="block text-sm font-bold text-slate-300 mb-2">
                                Email Address
                            </label>
                            <div className="mt-1 relative rounded-2xl group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-slate-500 group-focus-within:text-cyan-400 transition-colors" aria-hidden="true" />
                                </div>
                                <input
                                    id="email"
                                    name="email"
                                    type="text"
                                    autoComplete="email"
                                    defaultValue="admin.thesis@gmail.com"
                                    className="block w-full pl-12 rounded-2xl py-3.5 border border-white/10 bg-white/[0.04] text-white placeholder-slate-500 focus:bg-white/[0.08] focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/50 transition-all duration-200 sm:text-sm outline-none font-medium"
                                    placeholder="you@example.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-bold text-slate-300 mb-2">
                                Password
                            </label>
                            <div className="mt-1 relative rounded-2xl group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-slate-500 group-focus-within:text-cyan-400 transition-colors" aria-hidden="true" />
                                </div>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="current-password"
                                    defaultValue="password123"
                                    className="block w-full pl-12 rounded-2xl py-3.5 border border-white/10 bg-white/[0.04] text-white placeholder-slate-500 focus:bg-white/[0.08] focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/50 transition-all duration-200 sm:text-sm outline-none font-medium tracking-wider"
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
                                    className="h-4 w-4 text-cyan-500 focus:ring-cyan-500 border-white/20 bg-white/5 rounded cursor-pointer"
                                />
                                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-400 font-medium cursor-pointer">
                                    Remember me
                                </label>
                            </div>

                            <div className="text-sm">
                                <Link href="/forgot-password" className="font-bold text-cyan-400 hover:text-cyan-300 transition-colors">
                                    Forgot Password?
                                </Link>
                            </div>
                        </div>

                        <div className="pt-4">
                            <button
                                type="submit"
                                className="w-full flex justify-center py-4 px-4 border border-transparent rounded-2xl shadow-xl shadow-cyan-500/20 text-sm font-extrabold text-white bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 hover:shadow-2xl hover:shadow-cyan-500/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 focus:ring-offset-[#0a0e1a] transition-all duration-300 transform hover:-translate-y-0.5"
                            >
                                Access Workspace
                            </button>
                        </div>
                    </form>

                    <div className="mt-10 text-center text-sm border-t border-white/10 pt-8">
                        <span className="text-slate-500 font-medium">Don&apos;t have an account? </span>
                        <Link href="/register" className="font-bold text-cyan-400 hover:text-cyan-300 transition-colors bg-cyan-500/10 px-3 py-1.5 rounded-lg ml-1 border border-cyan-500/20">
                            Create one now
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
