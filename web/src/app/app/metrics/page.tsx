'use client';
import PageShell from '@/components/PageShell';
import { BarChart3, CheckCircle, Clock, Zap, Shield, Database, Activity } from 'lucide-react';

const METRICS = [
  {
    name: 'Average Sync Latency',
    target: '< 50ms',
    actual: '1.51ms',
    passed: true,
    icon: Clock,
    color: 'var(--acc)',
    description: 'Mean time for a sync operation to complete across all test scenarios.',
  },
  {
    name: 'Sync Throughput',
    target: '≥ 10 ops/s',
    actual: '1,010 ops/s',
    passed: true,
    icon: Zap,
    color: 'var(--grn)',
    description: 'Maximum sustained sync operations per second under load.',
  },
  {
    name: 'Conflict Detection Rate',
    target: '100%',
    actual: '100%',
    passed: true,
    icon: Shield,
    color: 'var(--amb)',
    description: 'Percentage of injected concurrent conflicts correctly detected by vector clock comparison.',
  },
  {
    name: 'Data Loss Prevention',
    target: '0%',
    actual: '0%',
    passed: true,
    icon: Database,
    color: 'var(--pur)',
    description: 'Percentage of document content lost during sync, merge, or conflict resolution operations.',
  },
  {
    name: 'Eventual Consistency',
    target: '100%',
    actual: '100%',
    passed: true,
    icon: Activity,
    color: 'var(--tel)',
    description: 'Percentage of peers that converge to identical state after conflict resolution broadcast.',
  },
  {
    name: 'Delta Compression Ratio',
    target: '> 50%',
    actual: '73.2%',
    passed: true,
    icon: Zap,
    color: 'var(--acc)',
    description: 'Average reduction in payload size achieved by Myers diff delta encoding.',
  },
];

export default function MetricsPage() {
  return (
    <PageShell>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Metrics</h1>
        <p style={{ fontSize: 13, color: 'var(--t3)', margin: '4px 0 0' }}>
          ISO/IEC 25010 Performance Evaluation — Phase 5 Results
        </p>
      </div>

      {/* Summary banner */}
      <div className="ds-card" style={{
        padding: 16, marginBottom: 20,
        background: 'var(--grb)', borderColor: 'var(--grbr)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle size={20} style={{ color: 'var(--grn)' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--grn)' }}>All 6 Metrics Passed</div>
            <div style={{ fontSize: 12, color: 'var(--t2)' }}>
              72/72 tests passing • DocuSync Hybrid Sync Engine fully compliant
            </div>
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
        {METRICS.map(m => {
          const Icon = m.icon;
          return (
            <div key={m.name} className="ds-card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `${m.color}18`, border: `1px solid ${m.color}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon size={18} style={{ color: m.color }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginBottom: 4 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 10, lineHeight: 1.4 }}>{m.description}</div>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '8px 10px', background: 'var(--bg)', borderRadius: 8,
                    border: '1px solid var(--b1)',
                  }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Target</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)', fontFamily: 'monospace' }}>{m.target}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Actual</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: m.passed ? 'var(--grn)' : 'var(--red)', fontFamily: 'monospace' }}>{m.actual}</div>
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <CheckCircle size={18} style={{ color: 'var(--grn)' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Thesis info */}
      <div className="ds-card" style={{ padding: 16, marginTop: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--t1)' }}>
          <BarChart3 size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Thesis Reference
        </div>
        <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.6 }}>
          <strong>Title:</strong> A Comparative Evaluation of Operational Transformation and Replicated Data Types to Hybrid Conflict Resolution Algorithm<br />
          <strong>Institution:</strong> Pamantasan ng Cabuyao — College of Computing Studies<br />
          <strong>Researcher:</strong> Paul John G. Palamara<br />
          <strong>Methodology:</strong> Experimental Prototyping (ISO/IEC 25010:2023)<br />
          <strong>Test Suite:</strong> 72 tests (24 unit + 24 integration + 24 stress)
        </div>
      </div>
    </PageShell>
  );
}
