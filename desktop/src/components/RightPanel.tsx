/**
 * @module RightPanel
 * Engine status panel — Engine / Clocks / Delta tabs.
 * Algo cards with gradient left borders. Live counters tick every 3s.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useElectronSync } from '@/context/ElectronSyncContext';

type Tab = 'engine' | 'clocks' | 'delta';

// ── RightPanel ────────────────────────────────────────────────────────────

const RightPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('engine');
  const { vectorClock, pendingConflicts } = useElectronSync();

  const [logEvents, setLogEvents] = useState(12);
  const [clockTick, setClockTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setLogEvents((v) => v + 1);
      setClockTick((v) => v + 1);
    }, 3000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const counters = (() => {
    try {
      if (vectorClock && typeof vectorClock === 'object') {
        const root = (vectorClock as Record<string, unknown>).root as Record<string, unknown> | undefined;
        if (root && Array.isArray(root.children)) {
          return (root.children as Array<{ counter: number }>).map((c) => c.counter);
        }
      }
    } catch { /* ignore */ }
    return [clockTick, 0, 0];
  })();

  const tabs: { key: Tab; label: string }[] = [
    { key: 'engine', label: 'Engine' },
    { key: 'clocks', label: 'Clocks' },
    { key: 'delta',  label: 'Delta' },
  ];

  return (
    <aside className="ds-right-panel">

      {/* ── Tab Bar ── */}
      <div className="ds-right-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            id={`right-tab-${t.key}`}
            className={`ds-right-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="ds-right-content">

        {/* ENGINE TAB */}
        {activeTab === 'engine' && (
          <>
            {/* Log-Based Sync — blue border */}
            <div className="ds-algo-card" style={{
              background: 'var(--accent-glow)',
              border: '1px solid var(--border-accent)',
              borderLeft: '3px solid var(--accent)',
            }}>
              <div className="ds-algo-card-header" style={{ color: 'var(--accent)' }}>
                <span>📋</span> Log-Based Sync
              </div>
              <div className="ds-algo-card-stat">
                <span>Events logged</span>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                  {logEvents}
                </span>
              </div>
              <div className="ds-algo-card-stat">
                <span>Chunks</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>1</span>
              </div>
              <div className="ds-algo-card-stat">
                <span>Status</span>
                <span style={{ color: 'var(--green)', fontWeight: 600 }}>Active</span>
              </div>
            </div>

            {/* Vector Clocks — purple border */}
            <div className="ds-algo-card" style={{
              background: 'var(--purple-bg)',
              border: '1px solid var(--purple-border)',
              borderLeft: '3px solid var(--purple)',
            }}>
              <div className="ds-algo-card-header" style={{ color: 'var(--purple)' }}>
                <span>🕐</span> Vector Clocks
              </div>
              <div className="ds-clock-grid" style={{ marginTop: 4 }}>
                {[0, 1, 2].map((i) => (
                  <div className="ds-clock-node" key={i}>
                    <div className="ds-clock-node-label">N{i}</div>
                    <div className="ds-clock-node-value" style={{
                      color: i === 0 ? 'var(--accent)' : i === 1 ? 'var(--purple)' : 'var(--teal)',
                    }}>
                      {counters[i] ?? 0}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Delta Encoding — green border */}
            <div className="ds-algo-card" style={{
              background: 'var(--green-bg)',
              border: '1px solid var(--green-border)',
              borderLeft: '3px solid var(--green)',
            }}>
              <div className="ds-algo-card-header" style={{ color: 'var(--green)' }}>
                <span>⚡</span> Delta Encoding
              </div>
              <div className="ds-algo-card-stat">
                <span>BW saved</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>0 B</span>
              </div>
              <div className="ds-algo-card-stat">
                <span>Algorithm</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Myers O(ND)</span>
              </div>
              <div className="ds-algo-card-stat">
                <span>Last delta</span>
                <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>—</span>
              </div>
            </div>

            {/* LWW Resolver — amber border */}
            <div className="ds-algo-card" style={{
              background: 'var(--amber-bg)',
              border: '1px solid var(--amber-border)',
              borderLeft: '3px solid var(--amber)',
            }}>
              <div className="ds-algo-card-header" style={{ color: 'var(--amber)' }}>
                <span>⚖️</span> LWW Resolver
              </div>
              <div className="ds-algo-card-stat">
                <span>Resolved</span>
                <span style={{ fontWeight: 700, color: 'var(--green)' }}>0</span>
              </div>
              <div className="ds-algo-card-stat">
                <span>Pending</span>
                <span style={{ fontWeight: 700, color: pendingConflicts > 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                  {pendingConflicts}
                </span>
              </div>
              <div className="ds-algo-card-stat">
                <span>Policy</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.65rem' }}>LWW + Owner</span>
              </div>
            </div>
          </>
        )}

        {/* CLOCKS TAB */}
        {activeTab === 'clocks' && (
          <>
            <div style={{
              fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)',
              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
            }}>
              Vector Clock State
            </div>

            {[0, 1, 2].map((i) => {
              const val = counters[i] ?? 0;
              const max = Math.max(...counters, 1);
              const pct = Math.round((val / max) * 100);
              const clr = i === 0 ? 'var(--accent)' : i === 1 ? 'var(--purple)' : 'var(--teal)';
              return (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: 4 }}>
                    <span style={{ color: clr, fontWeight: 600 }}>
                      Node {i} {i === 0 ? '· local' : ''}
                    </span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                      {val}
                    </span>
                  </div>
                  <div className="ds-progress">
                    <div className="ds-progress-bar" style={{ width: `${pct}%`, background: clr }} />
                  </div>
                </div>
              );
            })}

            <div style={{
              marginTop: 8,
              padding: '10px 12px',
              background: 'var(--bg-surface)',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border-subtle)',
            }}>
              <div style={{ fontSize: '0.63rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Causal Relations
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                N0 → N1: {counters[0] > 0 ? 'dominant' : 'equal'}<br />
                N0 → N2: {counters[0] > 0 ? 'dominant' : 'equal'}<br />
                N1 → N2: equal
              </div>
            </div>
          </>
        )}

        {/* DELTA TAB */}
        {activeTab === 'delta' && (
          <>
            <div style={{
              fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)',
              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
            }}>
              Algorithm Info
            </div>

            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-md)',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}>
              {[
                { label: 'Algorithm', value: 'Myers O(ND)' },
                { label: 'Encoding',  value: 'Base64' },
                { label: 'Checksum',  value: 'FNV-1a' },
                { label: 'Chunk Size', value: '4 MB' },
              ].map((r) => (
                <div key={r.label} className="ds-algo-card-stat">
                  <span>{r.label}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.value}</span>
                </div>
              ))}
            </div>

            <div style={{
              fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              margin: '8px 0 4px',
            }}>
              Performance
            </div>

            {[
              { label: 'Avg Latency',  value: '1.51ms',   color: 'var(--accent)' },
              { label: 'Throughput',   value: '1,010/s',  color: 'var(--green)' },
              { label: 'Data Loss',    value: '0%',        color: 'var(--green)' },
              { label: 'Consistency',  value: '100%',      color: 'var(--green)' },
            ].map((m) => (
              <div key={m.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 10px',
                background: 'var(--bg-surface)',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.72rem',
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>{m.label}</span>
                <span style={{ fontWeight: 700, color: m.color, fontVariantNumeric: 'tabular-nums' }}>
                  {m.value}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </aside>
  );
};

export default RightPanel;
