'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { uGet } from '@/lib/userStorage';
import { Activity, Shield, Server, CheckCircle, Info } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid
} from 'recharts';

interface RealMetrics {
  totalPushes: number;
  totalConflicts: number;
  unresolvedConflicts: number;
  throughputPerSec: number;
  throughputPerMin: number;
  conflictResolutionTimeMs: number | null;
  dataLossRatePct: number;
  consistencySuccessRatePct: number | null;
  conflictDetectionRatePct: number | null;
  resolutionAccuracyPct: number | null;
  systemScalabilityPct: number | null;
  scalabilityInsufficientData: boolean;
}

interface TelemetryPoint {
  timeLabel: string;
  throughput: number;
  latency: number;
  conflicts: number;
}

/**
 * Small "?" affordance next to a label — hovering (or tapping, on touch)
 * shows a plain-language explanation of what the metric means, aimed at
 * someone without a distributed-systems background. This exists because
 * a number like "Conflict Detection Rate: 66.7%" means nothing on its own
 * to a non-technical reader.
 */
const InfoTip: React.FC<{ text: string }> = ({ text }) => (
  <span
    title={text}
    style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 14, height: 14, borderRadius: '50%', cursor: 'help',
      color: 'var(--t3, #64748b)', flexShrink: 0,
    }}
  >
    <Info size={13} />
  </span>
);

// Executive Animated & Glowing Radial Gauge for RQ4 Causal Verification
const RadialGauge: React.FC<{
  label: string;
  value: string;
  percentage: number | null;
  color: string;
  subtext: string;
  badge?: string;
  tooltip: string;
}> = ({ label, value, percentage, color, subtext, badge, tooltip }) => {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const pct = percentage ?? 0;
  const strokeDashoffset = circumference - (pct / 100) * circumference;
  const noData = percentage === null;

  return (
    <div style={{
      background: 'var(--s1, #181d28)',
      border: '1px solid var(--b1, rgba(255,255,255,0.08))',
      borderRadius: 16,
      padding: '22px',
      display: 'flex',
      alignItems: 'center',
      gap: '20px',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      transition: 'all 0.3s ease',
      opacity: noData ? 0.7 : 1,
    }}>
      {/* Top Accent Color Bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3.5,
        background: noData ? 'var(--b1, #475569)' : color
      }} />

      {/* Ambient Glow */}
      <div style={{
        position: 'absolute', left: 16, top: '50%',
        transform: 'translateY(-50%)',
        width: 80, height: 80, borderRadius: '50%',
        background: `${color}18`,
        filter: 'blur(14px)', pointerEvents: 'none'
      }} />

      <div style={{ position: 'relative', width: 92, height: 92, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="92" height="92" style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx="46" cy="46" r={radius}
            stroke="var(--b1, rgba(255,255,255,0.08))"
            strokeWidth="8.5"
            fill="transparent"
          />
          {!noData && (
            <circle
              cx="46" cy="46" r={radius}
              stroke={color}
              strokeWidth="8.5"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
            />
          )}
        </svg>
        <div style={{
          position: 'absolute',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
        }}>
          <span style={{
            fontSize: noData ? '11px' : '17px',
            fontWeight: 800,
            color: noData ? 'var(--t3, #64748b)' : 'var(--t1, #1e293b)',
            fontFamily: 'monospace',
            letterSpacing: '-0.02em',
            textAlign: 'center',
          }}>
            {value}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--t1, #1e293b)' }}>{label}</span>
          <InfoTip text={tooltip} />
          {badge && !noData && (
            <span style={{
              fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              background: `${color}18`, color: color, border: `1px solid ${color}40`,
              display: 'flex', alignItems: 'center', gap: 6
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
              {badge}
            </span>
          )}
        </div>
        <p style={{ fontSize: '12px', color: 'var(--t2, #64748b)', margin: 0, lineHeight: 1.55 }}>
          {subtext}
        </p>
      </div>
    </div>
  );
};

export default function WebMetricsDashboard() {
  const [realMetrics, setRealMetrics] = useState<RealMetrics | null>(null);
  const [hasData, setHasData] = useState(false);
  const [viewMode, setViewMode] = useState<'technical' | 'simple'>('technical');
  const [avgLatencyMs, setAvgLatencyMs] = useState<number | null>(null);
  const [connectedPeerCount, setConnectedPeerCount] = useState<number>(1);

  // Rolling real-time telemetry points for interactive charts
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryPoint[]>(() => {
    const now = new Date();
    return Array.from({ length: 8 }, (_, i) => {
      const t = new Date(now.getTime() - (7 - i) * 3000);
      return {
        timeLabel: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        throughput: 0,
        latency: 0,
        conflicts: 0,
      };
    });
  });

  // ── Real client-measured latency (L = t_ack - t_dispatch) ─────────────────
  useEffect(() => {
    const readLatency = () => {
      try {
        const samples: number[] = JSON.parse(localStorage.getItem('web_session_latency_samples') || '[]');
        if (samples.length > 0) {
          const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
          setAvgLatencyMs(Math.round(avg * 10) / 10);
        }
      } catch (_e) {}
    };
    readLatency();
    const iv = setInterval(readLatency, 2000);
    return () => clearInterval(iv);
  }, []);

  // ── Real room-scoped metrics from actual sync activity ────────────────────
  const fetchRealMetrics = useCallback(async () => {
    try {
      const storedRoomStr = uGet('current_room');
      const room = storedRoomStr ? JSON.parse(storedRoomStr) : null;
      const otp = room?.otp;
      if (!otp) return;

      const _MATCHMAKER_URL = process.env.NEXT_PUBLIC_MATCHMAKER_URL || `${window.location.origin}/api/lobby`;
      const res = await fetch(`${_MATCHMAKER_URL}/metrics?otp=${otp}`);
      if (res.ok) {
        const data = await res.json();
        setHasData(!!data.hasData);
        if (data.hasData) {
          setRealMetrics(data.metrics);

          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setTelemetryHistory(prev => [
            ...prev.slice(-14),
            {
              timeLabel: nowStr,
              throughput: data.metrics.throughputPerMin || 0,
              latency: avgLatencyMs || 0,
              conflicts: data.metrics.totalConflicts || 0,
            }
          ]);
        }
      }

      // Peer count comes from the room's own heartbeat-backed peer list —
      // reuse whatever's already cached locally rather than a second
      // network call.
      const peersRaw = uGet('peers');
      if (peersRaw) {
        try {
          const peers = JSON.parse(peersRaw);
          const connected = Array.isArray(peers) ? peers.filter((p: any) => p.status === 'connected').length : 0;
          setConnectedPeerCount(connected + 1);
        } catch (_e) {}
      }
    } catch (_e) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avgLatencyMs]);

  useEffect(() => {
    fetchRealMetrics();
    const iv = setInterval(fetchRealMetrics, 3000);
    return () => clearInterval(iv);
  }, [fetchRealMetrics]);

  const fmtPct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);
  const fmtMs = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}ms`);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -10 }}>
        <div style={{ display: 'flex', background: 'var(--b1)', borderRadius: 8, padding: 2 }}>
          <button onClick={() => setViewMode('simple')} style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, borderRadius: 6, background: viewMode === 'simple' ? 'var(--bg)' : 'transparent', color: viewMode === 'simple' ? 'var(--t1)' : 'var(--t3)', border: 'none', cursor: 'pointer' }}>Simple</button>
          <button onClick={() => setViewMode('technical')} style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, borderRadius: 6, background: viewMode === 'technical' ? 'var(--bg)' : 'transparent', color: viewMode === 'technical' ? 'var(--t1)' : 'var(--t3)', border: 'none', cursor: 'pointer' }}>Technical</button>
        </div>
      </div>

      {!hasData && (
        <div style={{
          padding: '14px 18px', background: 'var(--amb-bg, rgba(245,158,11,0.1))', border: '1px solid var(--amb, #f59e0b)',
          borderRadius: 10, color: 'var(--amb, #f59e0b)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10
        }}>
          <Info size={16} />
          No sync activity recorded yet this session. Every number below is measured from real edits and pushes — make an edit in this room to start populating them.
        </div>
      )}

      {viewMode === 'simple' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <RadialGauge
            label="Sync Success"
            value={hasData ? fmtPct(realMetrics?.consistencySuccessRatePct) : '—'}
            percentage={hasData ? (realMetrics?.consistencySuccessRatePct ?? null) : null}
            color="#10b981"
            subtext={hasData ? `${realMetrics?.totalPushes || 0} edits synced this session` : 'No edits synced yet'}
            tooltip="Out of every save attempt this session, what percentage actually reached the server and was applied successfully. 100% means nothing failed to sync."
          />
          <RadialGauge
            label="Data Kept Safe"
            value={hasData ? `${(100 - (realMetrics?.dataLossRatePct ?? 0)).toFixed(1)}%` : '—'}
            percentage={hasData ? 100 - (realMetrics?.dataLossRatePct ?? 0) : null}
            color="#3b82f6"
            subtext={hasData ? 'Percentage of typed content that survived every merge' : 'No edits yet'}
            tooltip="When two people edit the same spot at the same time, the system has to pick one version. This is the percentage of everything typed this session that made it into the final document — not lost to a conflict."
          />
          <RadialGauge
            label="Active Users"
            value={`${connectedPeerCount}`}
            percentage={100}
            color="#8b5cf6"
            subtext="People currently in this room"
            tooltip="How many devices/browsers are connected to this room right now, including you."
          />
        </div>
      ) : (
        <>
          {/* ── LIVE INTERACTIVE TELEMETRY STREAM (Recharts AreaChart) ───────────── */}
      <div style={{
        background: 'var(--s1, #181d28)', borderRadius: 16, padding: '24px',
        border: '1px solid var(--b1, rgba(255,255,255,0.08))',
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1, #fff)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={18} style={{ color: '#3b82f6' }} />
              Live Sync Telemetry (RQ5 — latency &amp; throughput)
              <InfoTip text="Throughput: how many edits per minute the server actually processed, counted from real save requests. Latency: how long each save took to round-trip, timed on your own device from the moment you sent it to the moment the server confirmed it." />
            </div>
            <div style={{ fontSize: 12, color: 'var(--t3, #8a94a6)', marginTop: 2 }}>
              Measured from this room&apos;s actual sync traffic — throughput (ops/min) and round-trip latency (ms)
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#3b82f6', fontWeight: 600 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: '#3b82f6', display: 'inline-block' }} />
              Throughput (ops/min)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', fontWeight: 600 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: '#10b981', display: 'inline-block' }} />
              Latency (ms)
            </span>
          </div>
        </div>

        <div style={{ height: 260, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={telemetryHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorThroughput" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="timeLabel" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
              <RechartsTooltip
                contentStyle={{
                  background: '#1e2330', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, fontSize: 12, color: '#fff'
                }}
              />
              <Area type="monotone" dataKey="throughput" name="Throughput (ops/min)" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorThroughput)" />
              <Area type="monotone" dataKey="latency" name="Latency (ms)" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorLatency)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {avgLatencyMs !== null && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--t3, #8a94a6)' }}>
            Average round-trip latency this session: <strong style={{ color: '#10b981' }}>{avgLatencyMs}ms</strong> (measured on your device, dispatch-to-acknowledgement)
          </div>
        )}
      </div>

      {/* ── RQ4 RADIAL GAUGES & CONFLICT BREAKDOWN ─────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Shield size={18} style={{ color: '#f59e0b' }} />
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1, #fff)' }}>
            RQ4 — Conflict Detection &amp; Resolution
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <RadialGauge
            label="Consistency Success Rate"
            value={fmtPct(realMetrics?.consistencySuccessRatePct)}
            percentage={realMetrics?.consistencySuccessRatePct ?? null}
            color="#10b981"
            subtext={hasData ? `${realMetrics?.totalPushes || 0} sync attempts this session` : 'No sync attempts yet'}
            tooltip="How often a save actually made it to the server successfully, out of every attempt. This is the RQ4(e) / RQ5(e) 'data consistency rate' — measured from real save attempts and real server responses, not assumed."
          />

          <RadialGauge
            label="Resolution Accuracy"
            value={fmtPct(realMetrics?.resolutionAccuracyPct)}
            percentage={realMetrics?.resolutionAccuracyPct ?? null}
            color="#3b82f6"
            badge={realMetrics?.resolutionAccuracyPct !== null ? 'Line-Scoped LWW' : undefined}
            subtext={
              realMetrics && realMetrics.totalConflicts > 0
                ? `${realMetrics.totalConflicts} conflict(s) this session, resolved to exactly the overlapping line(s) only`
                : 'No concurrent-edit conflicts have happened yet'
            }
            tooltip="Out of every real conflict (two people editing the exact same line at the same time), what percentage the system resolved cleanly — picking a winner for just that line, without corrupting or losing anything elsewhere in the document."
          />

          <RadialGauge
            label="Conflict Detection Rate"
            value={fmtPct(realMetrics?.conflictDetectionRatePct)}
            percentage={realMetrics?.conflictDetectionRatePct ?? null}
            color="#f59e0b"
            subtext={
              realMetrics && realMetrics.conflictDetectionRatePct !== null
                ? `${realMetrics.totalConflicts} genuine conflict(s) out of every concurrent-edit situation this session`
                : 'No concurrent edits from two peers yet'
            }
            tooltip="When two peers edit the document at overlapping times, what fraction of those situations turned out to be genuine same-line conflicts (as opposed to edits to different parts of the file, which merge automatically with no conflict at all)."
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 16 }}>
          <RadialGauge
            label="Unresolved Conflicts"
            value={`${realMetrics?.unresolvedConflicts ?? 0}`}
            percentage={realMetrics?.unresolvedConflicts ? 0 : 100}
            color={realMetrics?.unresolvedConflicts ? '#ef4444' : '#10b981'}
            subtext={
              realMetrics?.unresolvedConflicts
                ? 'These are still awaiting manual review — see the room\'s conflict history.'
                : 'Every conflict this session was auto-resolved immediately by Last-Write-Wins — none are sitting unresolved.'
            }
            tooltip="A live count of conflicts that still need a person to manually pick a winner. This system auto-resolves same-line conflicts immediately, so this should normally read 0; a nonzero count means something is genuinely waiting on you."
          />

          <RadialGauge
            label="Resolution Time"
            value={fmtMs(realMetrics?.conflictResolutionTimeMs)}
            percentage={null}
            color="#a855f7"
            subtext={
              realMetrics && realMetrics.conflictResolutionTimeMs !== null
                ? 'Average time the server spent computing a merge, from detecting the overlap to producing the final result.'
                : 'No conflicts resolved yet this session.'
            }
            tooltip="How long it took the engine to figure out how to merge a conflict, in milliseconds. This is pure computation time — it excludes network travel time, which is covered separately by Latency."
          />
        </div>
      </div>

      {/* ── RQ4 & RQ5 COMPARATIVE BAR CHART & ARCHITECTURE SHIELD ───────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>

        {/* Left: Professional Theme-Responsive Animated Bar Chart */}
        <div style={{
          background: 'var(--s1, #181d28)',
          borderRadius: 16, padding: '24px',
          border: '1px solid var(--b1, rgba(255,255,255,0.08))',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          display: 'flex', flexDirection: 'column', gap: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1, #1e293b)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Sync Operations vs Conflicts, This Session</span>
                <InfoTip text="Sync Ops: every save attempt. Conflicts: how many of those hit a genuine same-line overlap with another peer's edit. Both bars are live counts from this room's actual activity." />
              </div>
              <div style={{ fontSize: 12, color: 'var(--t2, #64748b)', marginTop: 3 }}>
                Live counts from real save requests to this room
              </div>
            </div>
          </div>

          <div style={{ height: 230, width: '100%' }}>
            {hasData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: 'Sync Ops', count: realMetrics?.totalPushes || 0 },
                    { name: 'Conflicts', count: realMetrics?.totalConflicts || 0 },
                    { name: 'Unresolved', count: realMetrics?.unresolvedConflicts || 0 },
                  ]}
                  margin={{ top: 15, right: 15, left: -18, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="barGradSync" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={1} />
                      <stop offset="100%" stopColor="#0284c7" stopOpacity={0.85} />
                    </linearGradient>
                    <linearGradient id="barGradConflicts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fbbf24" stopOpacity={1} />
                      <stop offset="100%" stopColor="#d97706" stopOpacity={0.85} />
                    </linearGradient>
                    <linearGradient id="barGradUnresolved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f87171" stopOpacity={1} />
                      <stop offset="100%" stopColor="#dc2626" stopOpacity={0.85} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--b1, rgba(255,255,255,0.08))" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--t2, #64748b)" fontSize={12} fontWeight={600} tickLine={false} />
                  <YAxis stroke="var(--t2, #64748b)" fontSize={11} tickLine={false} allowDecimals={false} />
                  <RechartsTooltip
                    cursor={{ fill: 'rgba(59,130,246,0.06)' }}
                    contentStyle={{
                      background: 'var(--s1, #ffffff)', border: '1px solid var(--b1)',
                      borderRadius: 10, fontSize: 12, color: 'var(--t1)'
                    }}
                  />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]} animationDuration={1200}>
                    {['url(#barGradSync)', 'url(#barGradConflicts)', 'url(#barGradUnresolved)'].map((g, index) => (
                      <Cell key={`cell-${index}`} fill={g} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--t3, #8a94a6)', fontSize: 13 }}>
                No activity recorded yet — make an edit to populate this chart.
              </div>
            )}
          </div>
        </div>

        {/* Right: Data Loss Shield Card & Topology */}
        <div style={{
          background: 'var(--s1, #181d28)', borderRadius: 16, padding: '24px',
          border: '1px solid var(--b1, rgba(255,255,255,0.08))',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 16
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ padding: 10, borderRadius: 10, background: (realMetrics?.dataLossRatePct ?? 0) === 0 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: (realMetrics?.dataLossRatePct ?? 0) === 0 ? '#10b981' : '#ef4444' }}>
                <CheckCircle size={24} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1, #fff)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  Data Loss Rate: {hasData ? `${realMetrics?.dataLossRatePct ?? 0}%` : '—'}
                  <InfoTip text="Percentage of characters typed this session that were overwritten by a conflicting edit and did not survive into the final document. A deliberate deletion by the user (backspace) is never counted as loss — only content lost to the algorithm's own conflict resolution." />
                </div>
                <div style={{ fontSize: 12, color: (realMetrics?.dataLossRatePct ?? 0) === 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                  {hasData
                    ? ((realMetrics?.dataLossRatePct ?? 0) === 0 ? 'No data lost this session' : `${realMetrics?.dataLossRatePct}% of edited content overwritten by conflict resolution`)
                    : 'No edits yet this session'}
                </div>
              </div>
            </div>

            <p style={{ fontSize: 13, color: 'var(--t2, #cbd5e1)', lineHeight: 1.6, margin: '12px 0' }}>
              Measured directly: every conflict tracks the exact character length of whichever side's edit was overwritten. This is the actual DLR = (lost characters ÷ total characters synced) × 100 from this session&apos;s real traffic — not an assumed 0%.
            </p>
          </div>

          <div style={{
            padding: '14px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Server size={18} style={{ color: '#06b6d4' }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1, #fff)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  System Scalability
                  <InfoTip text="Compares real throughput measured while you were the only editor (baseline) against real throughput measured while multiple peers were editing concurrently. 100% means no slowdown; below 100% means the system processes edits more slowly as more people join." />
                </div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                  {realMetrics?.scalabilityInsufficientData
                    ? 'Needs both a solo session and a multi-user session to compare'
                    : 'Multi-user throughput vs solo-session baseline'}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#06b6d4', fontFamily: 'monospace' }}>
              {realMetrics && !realMetrics.scalabilityInsufficientData ? `${realMetrics.systemScalabilityPct}%` : '—'}
            </div>
          </div>
        </div>

      </div>
        </>
      )}
    </div>
  );
}
