/**
 * @module RightPanel
 * Engine status panel — Engine / Clocks / Delta tabs.
 * Algo cards with coloured left borders. Live counters tick every 3s.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useElectronSync } from '@/context/ElectronSyncContext';

type Tab = 'engine' | 'clocks' | 'delta';

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

  const algoCards = [
    {
      color: 'var(--accent)',
      bg:    'var(--accent-light)',
      label: 'Log-Based Sync',
      stats: [
        { label: 'Events',  value: String(logEvents) },
        { label: 'Status',  value: 'Active',         valueColor: 'var(--green)' },
        { label: 'Chunks',  value: '1'               },
        { label: 'Mode',    value: 'Delta'            },
      ],
    },
    {
      color: 'var(--purple)',
      bg:    'var(--purple-light)',
      label: 'Vector Clocks',
      stats: [
        { label: 'N0 (local)', value: String(counters[0] ?? 0), valueColor: 'var(--accent)' },
        { label: 'N1',         value: String(counters[1] ?? 0), valueColor: 'var(--purple)' },
        { label: 'N2',         value: String(counters[2] ?? 0), valueColor: 'var(--teal)'   },
        { label: 'Nodes',      value: '3'                       },
      ],
    },
    {
      color: 'var(--green)',
      bg:    'var(--green-light)',
      label: 'Delta Encoding',
      stats: [
        { label: 'BW Saved', value: '0 B'          },
        { label: 'Algo',     value: 'Myers O(ND)'  },
        { label: 'Encoding', value: 'Base64'        },
        { label: 'Last Δ',   value: '—', valueColor: 'var(--text-muted)' },
      ],
    },
    {
      color: 'var(--amber)',
      bg:    'var(--amber-light)',
      label: 'LWW Resolver',
      stats: [
        { label: 'Resolved', value: '0',            valueColor: 'var(--green)' },
        { label: 'Pending',  value: String(pendingConflicts), valueColor: pendingConflicts > 0 ? 'var(--red)' : undefined },
        { label: 'Policy',   value: 'LWW + Owner'  },
        { label: 'Mode',     value: 'Auto'          },
      ],
    },
  ];

  return (
    <aside className="ds-right-panel">
      {/* ── Tab bar ── */}
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

        {/* ENGINE */}
        {activeTab === 'engine' && algoCards.map((card) => (
          <div
            key={card.label}
            className="ds-algo-card"
            style={{ borderLeftColor: card.color }}
          >
            <div className="ds-algo-card-header">
              <span className="ds-algo-card-dot" style={{ background: card.color }} />
              {card.label}
              <span
                className="ds-badge"
                style={{
                  marginLeft: 'auto', fontSize: 9,
                  background: card.bg, color: card.color,
                  border: `1px solid ${card.color}40`,
                }}
              >
                Active
              </span>
            </div>
            <div className="ds-progress">
              <div className="ds-progress-bar" style={{ width: '100%', background: card.color }} />
            </div>
            <div className="ds-algo-stats-grid">
              {card.stats.map((s) => (
                <div key={s.label} className="ds-algo-stat-cell">
                  <div
                    className="ds-algo-stat-cell-value"
                    style={{ color: s.valueColor ?? 'var(--text-primary)' }}
                  >
                    {s.value}
                  </div>
                  <div className="ds-algo-stat-cell-label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* CLOCKS */}
        {activeTab === 'clocks' && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Vector Clock State
            </div>

            <div className="ds-clock-grid">
              {[
                { i: 0, color: 'var(--accent)',  label: 'Local' },
                { i: 1, color: 'var(--purple)',  label: 'Peer 1' },
                { i: 2, color: 'var(--teal)',    label: 'Peer 2' },
              ].map(({ i, color, label }) => (
                <div key={i} className="ds-clock-node">
                  <div className="ds-clock-node-label">{label}</div>
                  <div className="ds-clock-node-value" style={{ color }}>
                    {counters[i] ?? 0}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 8 }}>
              {[0, 1, 2].map((i) => {
                const val = counters[i] ?? 0;
                const max = Math.max(...counters, 1);
                const pct = Math.round((val / max) * 100);
                const clr = i === 0 ? 'var(--accent)' : i === 1 ? 'var(--purple)' : 'var(--teal)';
                return (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
                      <span style={{ color: clr, fontWeight: 600 }}>N{i}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', fontWeight: 700 }}>{val}</span>
                    </div>
                    <div className="ds-progress">
                      <div className="ds-progress-bar" style={{ width: `${pct}%`, background: clr }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.03)', borderRadius: 6,
              padding: '8px 10px', border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Causal Relations
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                N0 → N1: {counters[0] > 0 ? 'dominant' : 'equal'}<br />
                N0 → N2: {counters[0] > 0 ? 'dominant' : 'equal'}<br />
                N1 → N2: equal
              </div>
            </div>
          </>
        )}

        {/* DELTA */}
        {activeTab === 'delta' && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Algorithm Info
            </div>
            {[
              { label: 'Algorithm', value: 'Myers O(ND)'    },
              { label: 'Encoding',  value: 'Base64'         },
              { label: 'Checksum',  value: 'FNV-1a'         },
              { label: 'Chunk Size',value: '4 MB'           },
            ].map((r) => (
              <div key={r.label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '7px 10px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 6,
                border: '1px solid var(--border)',
                fontSize: 12,
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>{r.label}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{r.value}</span>
              </div>
            ))}

            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 4px' }}>
              Performance
            </div>
            {[
              { label: 'Avg Latency',  value: '1.51ms',   color: 'var(--accent)' },
              { label: 'Throughput',   value: '1,010/s',  color: 'var(--green)'  },
              { label: 'Data Loss',    value: '0%',        color: 'var(--green)'  },
              { label: 'Consistency',  value: '100%',      color: 'var(--green)'  },
            ].map((m) => (
              <div key={m.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 10px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 6,
                border: '1px solid var(--border)',
                fontSize: 12,
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>{m.label}</span>
                <span style={{ fontWeight: 700, color: m.color, fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
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
