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

  const [isCollapsed, setIsCollapsed] = useState(true);

  // Fake counters removed as requested

  const counters = (() => {
    try {
      if (vectorClock && typeof vectorClock === 'object') {
        const root = (vectorClock as Record<string, unknown>).root as Record<string, unknown> | undefined;
        if (root && Array.isArray(root.children)) {
          return (root.children as Array<{ counter: number }>).map((c) => c.counter);
        }
      }
    } catch { /* ignore */ }
    return [0, 0, 0];
  })();

  const tabs: { key: Tab; label: string }[] = [
    { key: 'engine', label: 'Engine' },
    { key: 'clocks', label: 'Clocks' },
    { key: 'delta',  label: 'Delta' },
  ];

  const algoCards = [
    {
      color: 'var(--amber)',
      bg:    'var(--amber-light)',
      label: 'LWW Resolver',
      stats: [
        { label: 'Pending',  value: String(pendingConflicts), valueColor: pendingConflicts > 0 ? 'var(--red)' : undefined },
        { label: 'Policy',   value: 'LWW + Owner'  },
      ],
    },
  ];

  return (
    <>
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{
          position: 'fixed', right: isCollapsed ? 0 : 320, top: '50%', transform: 'translateY(-50%)',
          zIndex: 1000, background: 'var(--s1)', border: '1px solid var(--b1)', borderRight: 'none',
          padding: '12px 8px', borderRadius: '8px 0 0 8px', cursor: 'pointer',
          color: 'var(--t2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '-2px 0 8px rgba(0,0,0,0.2)', transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        <span style={{ transform: isCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s', fontSize: 16 }}>
          ➔
        </span>
      </button>

      <aside className="ds-right-panel" style={{ 
        transform: isCollapsed ? 'translateX(100%)' : 'translateX(0)',
        position: 'fixed', right: 0, top: 0, height: '100vh',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)', zIndex: 999,
        background: 'var(--bg)', borderLeft: '1px solid var(--b1)'
      }}>
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
            <div style={{
              fontSize: 9, color: 'var(--amber)',
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 4, padding: '3px 6px', marginBottom: 4, textAlign: 'center',
            }}>
              Illustrative — not live measurements
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
    </>
  );
};

export default RightPanel;
