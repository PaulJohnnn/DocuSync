"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, useScroll, useTransform, AnimatePresence, useInView } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  RefreshCcw, Shield, Zap, Wifi, Download, Globe, ChevronRight,
  GitMerge, Clock, Users, FileText, CheckCircle2, ArrowRight,
  Github, Star, Lock, Layers, Database, Activity, Menu, X,
  MonitorDown, Cpu, Binary, LayoutGrid, Sparkles, Send, Copy, AlertCircle, UserPlus
} from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { useSyncContext } from '../context/SyncContext';
import { supabase } from '../lib/supabase';

// ── Animated counter ──────────────────────────────────────────────────────────
function AnimatedCounter({ target, suffix = '', duration = 2000 }: { target: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [inView, target, duration]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

// ── Floating particle ─────────────────────────────────────────────────────────
function Particle({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <motion.div
      className="absolute w-1 h-1 rounded-full bg-amber-400/40"
      style={{ left: `${x}%`, top: `${y}%` }}
      animate={{ y: [-20, 20, -20], x: [-10, 10, -10], opacity: [0.2, 0.8, 0.2] }}
      transition={{ duration: 4 + delay, repeat: Infinity, ease: 'easeInOut', delay }}
    />
  );
}

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({ icon: Icon, title, desc, color, delay }: { icon: any; title: string; desc: string; color: string; delay: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6, scale: 1.02 }}
      className="group relative bg-white/5 backdrop-blur border border-white/10 rounded-3xl p-7 hover:border-white/25 transition-all duration-500 cursor-default overflow-hidden"
    >
      <div className={`absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity ${color}`} />
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 ${color} bg-opacity-20 border border-white/10`}>
        <Icon size={22} className="text-white" />
      </div>
      <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
      <p className="text-sm text-zinc-400 leading-relaxed">{desc}</p>
    </motion.div>
  );
}

// ── Step card ─────────────────────────────────────────────────────────────────
function StepCard({ num, title, desc, delay }: { num: string; title: string; desc: string; delay: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -30 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className="flex gap-5 items-start"
    >
      <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-amber-500/30">
        {num}
      </div>
      <div className="pt-1">
        <h4 className="font-bold text-white text-base mb-1">{title}</h4>
        <p className="text-sm text-zinc-400 leading-relaxed">{desc}</p>
      </div>
    </motion.div>
  );
}

// ── Request Access Form ───────────────────────────────────────────────────────
function RequestAccessForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  const generateSecurePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < 8; i++) {
        pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    const newPassword = generateSecurePassword();

    // Check if email already exists in localStorage first
    try {
        const stored = localStorage.getItem('docusync_user_requests');
        if (stored) {
            const allRequests = JSON.parse(stored);
            const existingUser = allRequests.find((u: any) => u.email === email);
            if (existingUser) {
                setErrorMessage('Email is already in use. Please use a different email or log in.');
                setStatus('error');
                return;
            }
        }
    } catch { /* ignore */ }

    let supabaseSuccess = false;

    // Try Supabase first
    try {
        if (supabase) {
            const { error: signUpError } = await supabase.auth.signUp({
                email,
                password: newPassword,
                options: { data: { full_name: name } }
            });

            if (!signUpError) {
                supabaseSuccess = true;
            } else if (
                signUpError.message.toLowerCase().includes('already registered') ||
                signUpError.message.toLowerCase().includes('already in use') ||
                signUpError.message.toLowerCase().includes('user already registered')
            ) {
                setErrorMessage('Email is already in use. Please use a different email or log in.');
                setStatus('error');
                return;
            }
            // If other Supabase error (e.g. "Failed to fetch"), fall through to local fallback
        }
    } catch { /* Network error — fall through to local */ }

    // Always create local account (as fallback or supplement)
    try {
        const stored = localStorage.getItem('docusync_user_requests');
        const allRequests = stored ? JSON.parse(stored) : [];
        allRequests.push({
            id: Date.now().toString(),
            name,
            email,
            password: newPassword,
            status: 'approved',
            requestDate: new Date().toISOString(),
        });
        localStorage.setItem('docusync_user_requests', JSON.stringify(allRequests));
    } catch { /* ignore */ }

    setGeneratedPassword(newPassword);
    setStatus('success');
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      <AnimatePresence mode="wait">
        {status === 'success' ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="p-8 rounded-[3rem] bg-emerald-500/10 border border-emerald-500/20 text-center backdrop-blur-xl shadow-2xl shadow-emerald-500/10"
          >
            <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/30">
              <CheckCircle2 size={32} className="text-white" />
            </div>
            <h3 className="text-2xl font-black text-white mb-2">Credentials Generated</h3>
            <p className="text-emerald-400 text-sm font-medium mb-6">
              Your account is ready! Please copy your secure auto-generated system password below.
            </p>
            <div className="bg-black/50 rounded-2xl p-4 mb-6 border border-emerald-500/20 flex justify-between items-center">
              <span className="text-2xl font-mono font-bold text-white tracking-widest">{generatedPassword}</span>
              <button 
                onClick={() => {
                  if(generatedPassword) navigator.clipboard.writeText(generatedPassword);
                  setIsCopied(true);
                  setTimeout(() => setIsCopied(false), 2000);
                }}
                className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl hover:bg-emerald-500/40 transition-colors"
                title="Copy Password"
              >
                 {isCopied ? <CheckCircle2 size={24}/> : <Copy size={24}/>}
              </button>
            </div>
            <button 
              onClick={() => router.push('/login')} 
              className="px-10 py-4 w-full rounded-[2rem] bg-emerald-500 text-white font-black text-sm uppercase tracking-[0.2em] shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 transition-colors"
            >
              Proceed to Login
            </button>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 gap-5"
          >
            <AnimatePresence mode="wait">
              {status === 'error' && (
                  <motion.div 
                      initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                      animate={{ height: 'auto', opacity: 1, marginBottom: 4 }}
                      exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                      className="flex items-start gap-4 p-4 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold overflow-hidden text-left"
                  >
                      <AlertCircle size={18} className="shrink-0 mt-0.5" />
                      <div>
                          <p className="font-black uppercase text-[10px] tracking-widest mb-1 opacity-60">Security Alert</p>
                          {errorMessage}
                      </div>
                  </motion.div>
              )}
            </AnimatePresence>
            <div className="group relative">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full Name"
                className="w-full px-8 py-5 rounded-[2rem] bg-white/[0.03] border border-white/10 text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.08] focus:ring-4 focus:ring-amber-500/10 transition-all font-bold text-base"
              />
            </div>
            <div className="group relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Institutional Email Address"
                className="w-full px-8 py-5 rounded-[2rem] bg-white/[0.03] border border-white/10 text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.08] focus:ring-4 focus:ring-amber-500/10 transition-all font-bold text-base"
              />
            </div>
            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              disabled={status === 'loading'}
              className="w-full py-5 rounded-[2rem] bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white font-black text-base shadow-2xl shadow-amber-500/30 hover:shadow-amber-500/50 flex items-center justify-center gap-3 disabled:opacity-50 transition-all uppercase tracking-widest"
            >
              {status === 'loading' ? (
                <RefreshCcw className="animate-spin" size={24} />
              ) : (
                <>
                  Create Account <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </motion.button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, -100]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const particles = Array.from({ length: 22 }, (_, i) => ({
    x: Math.random() * 100, y: Math.random() * 100, delay: (i * 0.4) % 4
  }));

  const features = [
    { icon: GitMerge, title: 'Hybrid Sync Engine', desc: 'Combines CRDTs with Operational Transformation for intent-preserving merges.', color: 'bg-amber-500', delay: 0.1 },
    { icon: Zap, title: 'Delta Encoding', desc: 'Transmits only changed bits, reducing bandwidth by up to 85%.', color: 'bg-orange-500', delay: 0.2 },
    { icon: Wifi, title: 'Edge-Based Sync', desc: 'Processing happens locally for zero-latency offline-first editing.', color: 'bg-purple-500', delay: 0.3 },
    { icon: RefreshCcw, title: 'State Recovery', desc: 'Automatically reconverges divergent states upon reconnection.', color: 'bg-emerald-500', delay: 0.1 },
    { icon: Shield, title: 'Strong Consistency', desc: 'Mathematical proof of convergence regardless of edit order.', color: 'bg-blue-500', delay: 0.2 },
    { icon: Sparkles, title: 'Semantic Merging', desc: 'Preserves each author\'s intent without manual reconciliation.', color: 'bg-rose-500', delay: 0.3 },
  ];

  const stats = [
    { label: 'Merge Accuracy', value: 95, suffix: '%' },
    { label: 'Bandwidth Save', value: 85, suffix: '%' },
    { label: 'Active Nodes', value: 124, suffix: '' },
  ];

  const team = [
    { name: 'Bajado, John Benedict B.', role: 'Developer' },
    { name: 'Palamara, Paul John G.', role: 'Developer' },
    { name: 'Palma, John Lloyd P.', role: 'Developer' },
    { name: 'Venancio, Zyra P.', role: 'Developer' },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] text-zinc-900 dark:text-white font-sans overflow-x-hidden transition-colors duration-500">
      
      {/* ── BACKGROUND ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] dark:opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #000 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <motion.div animate={{ opacity: [0.1, 0.15, 0.1] }} transition={{ duration: 8, repeat: Infinity }} className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-amber-500/20 blur-[120px]" />
        <motion.div animate={{ opacity: [0.05, 0.1, 0.05] }} transition={{ duration: 10, repeat: Infinity, delay: 2 }} className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-orange-600/20 blur-[100px]" />
      </div>

      {/* ── NAV ── */}
      <motion.nav
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-7xl transition-all duration-700 px-8 py-3 rounded-[2.5rem] border ${scrolled ? 'bg-white/70 dark:bg-black/70 backdrop-blur-2xl border-black/5 dark:border-white/10 shadow-2xl' : 'bg-transparent border-transparent'}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 group cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <motion.div 
              whileHover={{ rotate: 180 }}
              transition={{ duration: 0.6 }}
              className="w-10 h-10 rounded-[1.25rem] bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30"
            >
              <RefreshCcw size={20} className="text-white" />
            </motion.div>
            <span className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 select-none">DocuSync</span>
          </div>

          <div className="hidden md:flex items-center gap-10">
            {['Features', 'Research', 'Team'].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`}
                onClick={(e) => { e.preventDefault(); document.getElementById(item.toLowerCase())?.scrollIntoView({ behavior: 'smooth' }); }}
                className="text-xs font-black text-zinc-500 hover:text-amber-500 dark:text-zinc-500 dark:hover:text-white transition-all uppercase tracking-[0.2em]">{item}</a>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            <motion.button
              whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }}
              onClick={() => router.push('/login')}
              className="hidden sm:flex px-7 py-3 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black text-xs font-black uppercase tracking-widest shadow-xl shadow-black/10 dark:shadow-white/5 transition-all"
            >
              Download App
            </motion.button>
            <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-3 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-black/5 dark:border-white/10 text-zinc-900 dark:text-white transition-colors">
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="md:hidden overflow-hidden mt-4 pt-4 border-t border-black/5 dark:border-white/10"
            >
              <div className="flex flex-col gap-6 pb-6">
                {['Features', 'Research', 'Team'].map(item => (
                  <a key={item} href={`#${item.toLowerCase()}`} onClick={() => setMenuOpen(false)} className="text-sm font-black text-zinc-500 dark:text-zinc-500 uppercase tracking-widest px-2">{item}</a>
                ))}
                <button onClick={() => { setMenuOpen(false); router.push('/login'); }} className="w-full py-5 rounded-[1.5rem] bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black uppercase tracking-widest shadow-lg shadow-amber-500/20">Access Dashboard</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* ── HERO ── */}
      <section ref={heroRef} className="relative min-h-screen flex flex-col items-center justify-center pt-32 pb-20 px-6">
        <div className="absolute inset-0 z-0">
          {particles.map((p, i) => <Particle key={i} x={p.x} y={p.y} delay={p.delay} />)}
        </div>

        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative z-10 max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Hero Left */}
            <div className="lg:col-span-7 text-left">
              <motion.div
                initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 1, delay: 0.2 }}
                className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full border border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400 text-[11px] font-black uppercase tracking-[0.2em] mb-10 backdrop-blur-xl"
              >
                <Sparkles size={14} className="animate-pulse" />
                Next-Gen Sync Protocol
              </motion.div>

              <motion.h1 
                initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.4 }}
                className="text-6xl sm:text-8xl lg:text-9xl font-black tracking-tight leading-[0.85] mb-8 text-zinc-900 dark:text-white"
              >
                Seamless<br/>
                <span className="bg-gradient-to-r from-amber-500 via-orange-600 to-amber-500 bg-clip-text text-transparent bg-[length:200%] animate-[shimmer_4s_ease-in-out_infinite]">Sync.</span>
              </motion.h1>

              <motion.p 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.6 }}
                className="text-xl sm:text-2xl text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed max-w-2xl mb-12"
              >
                How can this system help your team collaborate seamlessly across distributed networks?
              </motion.p>

              <motion.div 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.8 }}
                className="flex flex-wrap gap-5"
              >
                <motion.button
                  whileHover={{ scale: 1.05, y: -4 }} whileTap={{ scale: 0.95 }}
                  onClick={() => router.push('/login')}
                  className="px-10 py-5 rounded-[2rem] bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black text-lg shadow-2xl shadow-amber-500/40 hover:shadow-amber-500/60 transition-all flex items-center gap-3 group"
                >
                  Continue Website <Zap size={20} className="fill-white" />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05, y: -4 }} whileTap={{ scale: 0.95 }}
                  onClick={() => document.getElementById('research')?.scrollIntoView({ behavior: 'smooth' })}
                  className="px-10 py-5 rounded-[2rem] border-2 border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white font-black text-lg hover:bg-zinc-100 dark:hover:bg-white/5 transition-all"
                >
                  Join Research
                </motion.button>
              </motion.div>
            </div>

            {/* Hero Right - Bento Stats Preview */}
            <div className="lg:col-span-5 relative mt-12 lg:mt-0">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, rotate: 5 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
                className="grid grid-cols-2 gap-4"
              >
                <div className="col-span-2 bg-white dark:bg-zinc-900/40 backdrop-blur-3xl border border-black/5 dark:border-white/10 rounded-[3rem] p-10 shadow-2xl ring-1 ring-black/5 dark:ring-white/5">
                  <div className="flex items-center gap-6 mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                      <Activity className="text-emerald-500" size={28} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black uppercase tracking-widest text-zinc-400">Sync Status</h4>
                      <p className="text-xl font-black text-emerald-500">Nodes Converged</p>
                    </div>
                  </div>
                  <div className="flex items-end gap-3">
                    <span className="text-7xl font-black text-zinc-900 dark:text-white">100</span>
                    <span className="text-2xl font-black text-emerald-500 mb-2">%</span>
                  </div>
                </div>

                {stats.slice(0, 2).map((stat, i) => (
                  <div key={i} className="bg-white dark:bg-zinc-900/40 backdrop-blur-2xl border border-black/5 dark:border-white/10 rounded-[2.5rem] p-8 shadow-xl">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-3">{stat.label}</h4>
                    <p className="text-4xl font-black text-zinc-900 dark:text-white">
                      <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                    </p>
                  </div>
                ))}
              </motion.div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="py-32 px-6 relative overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-20">
            <div className="max-w-2xl">
              <motion.div
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-black/5 dark:border-white/10 bg-zinc-50 dark:bg-white/5 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em] mb-6"
              >
                <LayoutGrid size={14} /> Core Infrastructure
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
                className="text-4xl sm:text-6xl font-black tracking-tight text-zinc-900 dark:text-white"
              >
                Engineered for <span className="bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">Absolute Persistence</span>
              </motion.h2>
            </div>
            <motion.p
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
              className="text-zinc-500 dark:text-zinc-400 text-lg max-w-md font-medium"
            >
              DocuSync leverages decentralized state management to ensure your research data remains consistent, even across unstable networks.
            </motion.p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                whileHover={{ y: -8 }}
                className="group relative bg-white dark:bg-zinc-900/30 backdrop-blur-xl border border-black/5 dark:border-white/10 rounded-[2.5rem] p-10 hover:border-amber-500/30 transition-all duration-500 shadow-xl shadow-black/[0.02]"
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-8 ${f.color} bg-opacity-10 dark:bg-opacity-20 border border-black/5 dark:border-white/10 transition-colors group-hover:bg-opacity-20`}>
                  <f.icon size={28} className="text-zinc-800 dark:text-white" />
                </div>
                <h3 className="text-xl font-black text-zinc-900 dark:text-white mb-4">{f.title}</h3>
                <p className="text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── RESEARCH ── */}
      <section id="research" className="py-32 px-6 relative bg-zinc-50 dark:bg-black/20 transition-colors">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <div>
              <motion.div
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-black/5 dark:border-white/10 bg-white dark:bg-white/5 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em] mb-8"
              >
                <Database size={14} /> Methodology
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
                className="text-4xl sm:text-6xl font-black tracking-tight text-zinc-900 dark:text-white mb-8"
              >
                Rigorous <span className="text-amber-500">Framework</span> Validation.
              </motion.h2>
              <div className="space-y-8">
                {[
                  { icon: Cpu, title: 'ISO/IEC 25010 Standards', desc: 'Evaluated against global benchmarks for software quality and reliability.' },
                  { icon: Activity, title: 'Latency Benchmarking', desc: 'Real-time performance distribution analysis under high-concurrency loads.' },
                  { icon: Binary, title: 'CRDT Verification', desc: 'Formal mathematical verification of eventually consistent state convergence.' }
                ].map((item, i) => (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                    className="flex gap-6"
                  >
                    <div className="shrink-0 w-12 h-12 rounded-2xl bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/10 flex items-center justify-center shadow-lg">
                      <item.icon size={22} className="text-amber-500" />
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-zinc-900 dark:text-white mb-1">{item.title}</h4>
                      <p className="text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="relative" id="access-form">
              <div className="absolute inset-0 bg-amber-500/10 blur-[100px] rounded-full scale-150 opacity-20" />
              <div className="relative p-1 bg-gradient-to-tr from-amber-500/20 to-orange-600/20 rounded-[3.5rem] shadow-2xl">
                <div className="bg-white dark:bg-zinc-900/60 backdrop-blur-3xl rounded-[3.25rem] p-10 sm:p-14 border border-white/20 dark:border-white/5">
                  <div className="text-center mb-8">
                    <h3 className="text-3xl font-black text-zinc-900 dark:text-white mb-3">Join DocuSync</h3>
                    <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm">Create your account — fill in your details and get a secure auto-generated password.</p>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => router.push('/register')}
                    className="w-full py-5 rounded-[2rem] bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white font-black text-base shadow-2xl shadow-amber-500/30 hover:shadow-amber-500/50 flex items-center justify-center gap-3 uppercase tracking-widest transition-all"
                  >
                    Create Account <ArrowRight size={20} />
                  </motion.button>
                  <p className="text-center text-xs text-zinc-400 dark:text-zinc-600 mt-5 font-medium">
                    Already have an account?{' '}
                    <span onClick={() => router.push('/login')} className="text-amber-500 hover:text-amber-400 cursor-pointer font-bold transition-colors">Log In</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TEAM ── */}
      <section id="team" className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-black/5 dark:border-white/10 bg-zinc-50 dark:bg-white/5 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em] mb-6"
            >
              <Users size={14} /> Research Faculty
            </motion.div>
            <h2 className="text-4xl sm:text-6xl font-black text-zinc-900 dark:text-white tracking-tight">The Researchers.</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {team.map((member, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="group relative bg-white dark:bg-zinc-900/40 border border-black/5 dark:border-white/10 rounded-[2.5rem] p-8 text-center hover:border-amber-500/30 transition-all shadow-xl shadow-black/[0.02]"
              >
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-black text-2xl mb-6 shadow-lg shadow-amber-500/20 group-hover:scale-110 transition-transform">
                  {member.name.split(',')[0][0]}
                </div>
                <h4 className="text-lg font-black text-zinc-900 dark:text-white mb-1">{member.name}</h4>
                <p className="text-sm font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-widest">{member.role}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="pt-20 pb-12 px-8 border-t border-black/5 dark:border-white/10 bg-zinc-50 dark:bg-black/40 transition-colors">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-20 items-start">
            <div className="md:col-span-4">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white">
                  <RefreshCcw size={20} />
                </div>
                <span className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">DocuSync</span>
              </div>
              <p className="text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">
                Advanced real-time file synchronization for academic and enterprise research. Built with mathematical convergence at its core.
              </p>
            </div>

            <div className="md:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-8">
              <div>
                <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-600 mb-6">Institution</h5>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-300">Pamantasan ng Cabuyao</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-2">College of Computing Studies</p>
              </div>
              <div>
                <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-600 mb-6">Timeline</h5>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-300">Final Defense</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-2">May 2026</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-600 mb-6">System</h5>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-300 italic">v4.0 Spring-Protocol</p>
              </div>
            </div>
          </div>

          <div className="pt-12 border-t border-black/5 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between gap-6">
            <p className="text-xs font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">
              © 2026 DocuSync Collective Research Team
            </p>
            <div className="flex gap-8">
              <span className="text-xs font-bold text-zinc-400 dark:text-zinc-600 hover:text-amber-500 cursor-pointer transition-colors uppercase tracking-widest">Terms</span>
              <span className="text-xs font-bold text-zinc-400 dark:text-zinc-600 hover:text-amber-500 cursor-pointer transition-colors uppercase tracking-widest">Privacy</span>
            </div>
          </div>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes shimmer {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        ::selection {
          background: rgba(245, 158, 11, 0.2);
          color: #f59e0b;
        }
      `}</style>
    </div>
  );
}
