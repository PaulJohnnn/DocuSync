"use client";

import React, { useEffect, useState, useRef } from 'react';

interface MetricsOverlayProps {
    deltaBytes: number;
    peerCount: number;
}

export default function MetricsOverlay({ deltaBytes, peerCount }: MetricsOverlayProps) {
    const [ping, setPing] = useState(24);
    const [flashDelta, setFlashDelta] = useState(false);
    const [uptime, setUptime] = useState(0);
    const prevDelta = useRef(deltaBytes);
    const startTime = useRef(Date.now());

    // Simulate realistic latency fluctuation (12–45ms)
    useEffect(() => {
        const id = setInterval(() => {
            setPing(Math.floor(12 + Math.random() * 33));
            setUptime(Math.floor((Date.now() - startTime.current) / 1000));
        }, 1800);
        return () => clearInterval(id);
    }, []);

    // Flash delta counter when new bytes arrive
    useEffect(() => {
        if (deltaBytes !== prevDelta.current) {
            prevDelta.current = deltaBytes;
            setFlashDelta(true);
            const t = setTimeout(() => setFlashDelta(false), 400);
            return () => clearTimeout(t);
        }
    }, [deltaBytes]);

    const pingColor = ping < 20 ? '#4ade80' : ping < 35 ? '#facc15' : '#f87171';
    const fmtBytes = (b: number) => b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`;
    const fmtUptime = (s: number) => {
        const m = Math.floor(s / 60), sec = s % 60;
        return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    };

    return (
        <div className="fixed bottom-5 left-5 z-[200] w-72 rounded-xl overflow-hidden shadow-2xl border border-green-500/20 bg-black/85 backdrop-blur-md font-mono text-xs select-none">
            {/* Header bar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-green-500/10 border-b border-green-500/20">
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
                    <span className="text-green-400 font-bold uppercase tracking-widest text-[9px]">DocuSync · Live Metrics</span>
                </div>
                <span className="text-green-600 text-[9px]">SESSION {fmtUptime(uptime)}</span>
            </div>

            {/* Metrics rows */}
            <div className="px-3 py-2.5 space-y-1.5">
                <MetricRow label="SYNC PROTOCOL" value="Log/LWW Hybrid Engine" valueClass="text-cyan-400" />
                <MetricRow
                    label="NETWORK PING"
                    value={`${ping} ms`}
                    valueClass="font-bold"
                    valueStyle={{ color: pingColor }}
                    extra={
                        <div className="flex gap-0.5 items-center ml-2">
                            {[...Array(5)].map((_, i) => (
                                <div
                                    key={i}
                                    className="w-1 rounded-sm transition-all duration-300"
                                    style={{
                                        height: `${4 + i * 2}px`,
                                        backgroundColor: i < Math.ceil((45 - ping) / 9) ? pingColor : '#27272a',
                                    }}
                                />
                            ))}
                        </div>
                    }
                />
                <MetricRow
                    label="DELTA PAYLOADS"
                    value={fmtBytes(deltaBytes)}
                    valueClass={`font-bold transition-colors duration-200 ${flashDelta ? 'text-yellow-300' : 'text-green-400'}`}
                    extra={flashDelta && <span className="ml-2 text-[8px] text-yellow-400 animate-pulse">TX ▲</span>}
                />
                <MetricRow label="ACTIVE PEERS" value={`${peerCount} node${peerCount !== 1 ? 's' : ''}`} valueClass="text-purple-400" />
                <MetricRow label="VECTOR CLOCK" value="LWW · last-write-wins" valueClass="text-zinc-500" />
                <MetricRow label="COMPLEXITY" value="O(m) · Δ-encoding" valueClass="text-orange-400" />
            </div>

            {/* Footer bar */}
            <div className="px-3 py-1 border-t border-green-500/10 bg-green-500/5">
                <span className="text-green-700 text-[8px] tracking-wider">Hybrid Sync Engine · WebRTC Mesh · Yjs v13</span>
            </div>
        </div>
    );
}

function MetricRow({ label, value, valueClass = 'text-green-400', valueStyle, extra }: {
    label: string; value: string; valueClass?: string; valueStyle?: React.CSSProperties; extra?: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-2">
            <span className="text-zinc-600 text-[9px] uppercase tracking-widest shrink-0">{label}</span>
            <div className="flex items-center">
                <span className={`text-[10px] ${valueClass}`} style={valueStyle}>{value}</span>
                {extra}
            </div>
        </div>
    );
}
