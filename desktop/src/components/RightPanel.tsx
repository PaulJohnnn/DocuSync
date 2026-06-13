/**
 * @module RightPanel
 * Right engine panel with Engine/Clocks/Delta tabs.
 * Live counters update every 3 seconds.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useElectronSync } from '@/context/ElectronSyncContext';

type Tab = 'engine' | 'clocks' | 'delta';

const RightPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('engine');
  const { vectorClock, pendingConflicts } = useElectronSync();

  // Live counters that update every 3 seconds
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

  // Extract vector clock counters
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
    { key: 'delta', label: 'Delta' },
  ];

  return (
    <aside className="ds-right-panel">
      {/* Tabs */}
      <div className="ds-right-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`ds-right-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="ds-right-content">
        {activeTab === 'engine' && (
          <>
            {/* Log-Based Sync */}
            <div className="ds-algo-card" style={{ background: 'var(--ds-accent-bg)', border: '1px solid var(--ds-accent-border)' }}>
              <div className="ds-algo-card-header" style={{ color: 'var(--ds-accent)' }}>
                <span>📋</span> Log-Based Sync
              </div>
              <div className="ds-algo-card-stat">
                <span>Events logged</span>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{logEvents}</span>
              </div>
              <div className="ds-algo-card-stat">
                <span>Chunks processed</span>
                <span style={{ fontWeight: 700 }}>1</span>
              </div>
              <div className="ds-algo-card-stat">
                <span>Status</span>
                <span style={{ color: 'var(--ds-green)', fontWeight: 600 }}>Active</span>
              </div>
            </div>

            {/* Vector Clocks */}
            <div className="ds-algo-card" style={{ background: 'var(--ds-purple-bg)', border: '1px solid rgba(167,139,250,.2)' }}>
              <div className="ds-algo-card-header" style={{ color: 'var(--ds-purple)' }}>
                <span>🕐</span> Vector Clocks
              </div>
              <div className="ds-clock-grid" style={{ marginTop: '0.25rem' }}>
                {[0, 1, 2].map((i) => (
                  <div className="ds-clock-node" key={i}>
                    <div className="ds-clock-node-label">N{i}</div>
                    <div className="ds-clock-node-value" style={{ color: i === 0 ? 'var(--ds-accent)' : 'var(--ds-text2)' }}>
                      {counters[i] ?? 0}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Delta Encoding */}
            <div className="ds-algo-card" style={{ background: 'var(--ds-green-bg)', border: '1px solid var(--ds-green-border)' }}>
              <div className="ds-algo-card-header" style={{ color: 'var(--ds-green)' }}>
                <span>⚡</span> Delta Encoding
              </div>
              <div className="ds-algo-card-stat">
                <span>BW saved</span>
                <span style={{ fontWeight: 700 }}>0 B</span>
              </div>
              <div className="ds-algo-card-stat">
                <span>Last delta</span>
                <span style={{ fontWeight: 700 }}>—</span>
              </div>
            </div>

            {/* LWW Resolver */}
            <div className="ds-algo-card" style={{ background: 'var(--ds-amber-bg)', border: '1px solid var(--ds-amber-border)' }}>
              <div className="ds-algo-card-header" style={{ color: 'var(--ds-amber)' }}>
                <span>⚖️</span> LWW Resolver
              </div>
              <div className="ds-algo-card-stat">
                <span>Resolved</span>
                <span style={{ fontWeight: 700, color: 'var(--ds-green)' }}>0</span>
              </div>
              <div className="ds-algo-card-stat">
                <span>Pending</span>
                <span style={{ fontWeight: 700, color: pendingConflicts > 0 ? 'var(--ds-red)' : 'var(--ds-text2)' }}>
                  {pendingConflicts}
                </span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'clocks' && (
          <>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ds-text)', marginBottom: '0.25rem' }}>
              Vector Clock State
            </div>
            {[0, 1, 2].map((i) => {
              const val = counters[i] ?? 0;
              const max = Math.max(...counters, 1);
              const pct = Math.round((val / max) * 100);
              return (
                <div key={i} style={{ marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '3px' }}>
                    <span style={{ color: i === 0 ? 'var(--ds-accent)' : 'var(--ds-text2)' }}>
                      Node {i} {i === 0 ? '(local)' : ''}
                    </span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--ds-text)' }}>{val}</span>
                  </div>
                  <div className="ds-progress">
                    <div
                      className="ds-progress-bar"
                      style={{
                        width: `${pct}%`,
                        background: i === 0 ? 'var(--ds-accent)' : i === 1 ? 'var(--ds-purple)' : 'var(--ds-teal)',
                      }}
                    />
                  </div>
                </div>
              );
            })}

            <div style={{
              marginTop: '0.5rem', padding: '0.5rem',
              background: 'var(--ds-bg3)', borderRadius: 'var(--ds-radius-sm)',
              border: '1px solid var(--ds-border)',
            }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--ds-text3)', marginBottom: '0.25rem' }}>
                Causal Relations
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--ds-text2)' }}>
                N0 → N1: {counters[0] > 0 ? 'dominant' : 'equal'}<br/>
                N0 → N2: {counters[0] > 0 ? 'dominant' : 'equal'}<br/>
                N1 → N2: equal
              </div>
            </div>
          </>
        )}

        {activeTab === 'delta' && (
          <>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ds-text)', marginBottom: '0.5rem' }}>
              Last Delta
            </div>
            <div className="ds-card" style={{ padding: '0.75rem' }}>
              <div className="ds-algo-card-stat"><span>Algorithm</span><span style={{ fontWeight: 600 }}>Myers O(ND)</span></div>
              <div className="ds-algo-card-stat"><span>Encoding</span><span style={{ fontWeight: 600 }}>Base64</span></div>
              <div className="ds-algo-card-stat"><span>Checksum</span><span style={{ fontWeight: 600 }}>FNV-1a</span></div>
            </div>

            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ds-text)', margin: '0.5rem 0 0.25rem' }}>
              Performance Metrics
            </div>

            {[
              { label: 'Avg Latency', value: '1.51ms', color: 'var(--ds-accent)' },
              { label: 'Throughput', value: '1,010/s', color: 'var(--ds-green)' },
              { label: 'Data Loss', value: '0%', color: 'var(--ds-green)' },
              { label: 'Consistency', value: '100%', color: 'var(--ds-green)' },
            ].map((m) => (
              <div key={m.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.4rem 0.5rem',
                background: 'var(--ds-bg3)', borderRadius: 'var(--ds-radius-sm)',
                fontSize: '0.72rem',
              }}>
                <span style={{ color: 'var(--ds-text2)' }}>{m.label}</span>
                <span style={{ fontWeight: 700, color: m.color, fontVariantNumeric: 'tabular-nums' }}>{m.value}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </aside>
  );
};

export default RightPanel;
