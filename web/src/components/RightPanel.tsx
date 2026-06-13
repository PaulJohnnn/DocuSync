'use client';
import { useState, useEffect } from 'react';
import { Activity, Clock, Zap, Shield, GitBranch, Hash } from 'lucide-react';

type Tab = 'engine' | 'clocks' | 'delta';

const ALGORITHMS = [
  { name: 'Log-Based Sync', icon: Activity, color: 'var(--acc)', desc: 'Append-only event sourcing' },
  { name: 'Vector Clocks', icon: Clock, color: 'var(--grn)', desc: 'Causal ordering (Fidge/Mattern)' },
  { name: 'LWW Resolver', icon: Shield, color: 'var(--amb)', desc: 'Last-Writer-Wins arbitration' },
  { name: 'Delta Encoding', icon: Zap, color: 'var(--pur)', desc: 'Myers diff compression' },
];

export default function RightPanel() {
  const [tab, setTab] = useState<Tab>('engine');
  const [counters, setCounters] = useState({ events: 0, merges: 0, deltas: 0, conflicts: 0 });
  const [vcState, setVcState] = useState<number[]>([0, 0, 0]);

  useEffect(() => {
    const iv = setInterval(() => {
      setCounters(c => ({
        events: c.events + Math.floor(Math.random() * 3),
        merges: c.merges + (Math.random() > 0.7 ? 1 : 0),
        deltas: c.deltas + Math.floor(Math.random() * 2),
        conflicts: c.conflicts + (Math.random() > 0.95 ? 1 : 0),
      }));
      setVcState(v => v.map(x => x + (Math.random() > 0.6 ? 1 : 0)));
    }, 2000);
    return () => clearInterval(iv);
  }, []);

  return (
    <aside style={{
      width: 270, minWidth: 270, height: '100vh',
      background: 'var(--bg2)', borderLeft: '1px solid var(--b1)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Tabs */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--b1)',
        padding: '0 8px',
      }}>
        {(['engine', 'clocks', 'delta'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '10px 0', fontSize: 11,
            fontWeight: tab === t ? 600 : 400, textTransform: 'uppercase',
            letterSpacing: 0.8, border: 'none', cursor: 'pointer',
            background: 'transparent',
            color: tab === t ? 'var(--acc)' : 'var(--t3)',
            borderBottom: tab === t ? '2px solid var(--acc)' : '2px solid transparent',
          }}>{t}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {tab === 'engine' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              Hybrid Sync Engine
            </div>
            {ALGORITHMS.map(a => {
              const Icon = a.icon;
              return (
                <div key={a.name} className="ds-card" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 7,
                      background: `${a.color}18`, border: `1px solid ${a.color}40`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={14} style={{ color: a.color }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)' }}>{a.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--t3)' }}>{a.desc}</div>
                    </div>
                  </div>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontSize: 10, color: 'var(--t3)', marginTop: 4,
                  }}>
                    <span>Status</span>
                    <span style={{ color: 'var(--grn)', fontWeight: 600 }}>● Active</span>
                  </div>
                </div>
              );
            })}

            {/* Live counters */}
            <div className="ds-card" style={{ padding: 12, marginTop: 4 }}>
              <div style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Live Counters
              </div>
              {[
                { label: 'Events Logged', value: counters.events, color: 'var(--acc)' },
                { label: 'Merges', value: counters.merges, color: 'var(--grn)' },
                { label: 'Deltas Sent', value: counters.deltas, color: 'var(--pur)' },
                { label: 'Conflicts', value: counters.conflicts, color: 'var(--amb)' },
              ].map(c => (
                <div key={c.label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 12, padding: '4px 0',
                  borderBottom: '1px solid var(--b1)',
                }}>
                  <span style={{ color: 'var(--t2)' }}>{c.label}</span>
                  <span style={{ color: c.color, fontWeight: 600, fontFamily: 'monospace' }}>{c.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'clocks' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              Vector Clock State
            </div>
            <div className="ds-card" style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Hash size={14} style={{ color: 'var(--grn)' }} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>Local Clock</span>
              </div>
              <div style={{
                fontFamily: 'monospace', fontSize: 14,
                padding: '8px 12px', borderRadius: 6,
                background: 'var(--bg)', border: '1px solid var(--b1)',
                color: 'var(--grn)', textAlign: 'center',
              }}>
                [{vcState.join(', ')}]
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 6, textAlign: 'center' }}>
                Fidge/Mattern implementation • 3 nodes
              </div>
            </div>

            <div className="ds-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Clock Relations</div>
              {['dominant', 'dominated', 'concurrent', 'equal'].map(r => (
                <div key={r} style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 11, padding: '4px 0',
                  borderBottom: '1px solid var(--b1)',
                }}>
                  <span style={{ color: 'var(--t2)', textTransform: 'capitalize' }}>{r}</span>
                  <span style={{ color: 'var(--t3)', fontFamily: 'monospace' }}>
                    {r === 'dominant' ? 'A > B' : r === 'dominated' ? 'A < B' : r === 'concurrent' ? 'A ∥ B' : 'A = B'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'delta' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              Delta Performance
            </div>
            <div className="ds-card" style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Zap size={14} style={{ color: 'var(--pur)' }} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>Compression Stats</span>
              </div>
              {[
                { label: 'Algorithm', value: 'Myers Diff', color: 'var(--t1)' },
                { label: 'Avg Ratio', value: '73.2%', color: 'var(--grn)' },
                { label: 'Max Chunk', value: '4 MB', color: 'var(--t2)' },
                { label: 'Binary Reject', value: 'Yes', color: 'var(--amb)' },
                { label: 'Encoding', value: 'UTF-8', color: 'var(--t2)' },
              ].map(s => (
                <div key={s.label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 12, padding: '4px 0',
                  borderBottom: '1px solid var(--b1)',
                }}>
                  <span style={{ color: 'var(--t2)' }}>{s.label}</span>
                  <span style={{ color: s.color, fontFamily: 'monospace', fontWeight: 500 }}>{s.value}</span>
                </div>
              ))}
            </div>

            <div className="ds-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Latency Histogram</div>
              {[
                { range: '0-1ms', pct: 45 },
                { range: '1-5ms', pct: 35 },
                { range: '5-10ms', pct: 15 },
                { range: '10-50ms', pct: 5 },
              ].map(b => (
                <div key={b.range} style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t3)', marginBottom: 2 }}>
                    <span>{b.range}</span>
                    <span>{b.pct}%</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--bg)', borderRadius: 2 }}>
                    <div style={{ height: 4, width: `${b.pct}%`, background: 'var(--pur)', borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
