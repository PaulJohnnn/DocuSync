'use client';
import PageShell from '@/components/PageShell';
import WebMetricsDashboard from '@/components/WebMetricsDashboard';
import { BarChart2 } from 'lucide-react';

export default function WebMetricsPage() {
  return (
    <PageShell>
      <div style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div style={{ padding: 10, background: 'var(--s1)', borderRadius: 12, border: '1px solid var(--b1)' }}>
            <BarChart2 size={24} style={{ color: 'var(--acc)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Performance Metrics</h1>
            <p style={{ fontSize: 13, color: 'var(--t3)', margin: '4px 0 0' }}>
              Real-time evaluation dashboard (RQ4 & RQ5) — live data from Desktop Room Host
            </p>
          </div>
        </div>
        <WebMetricsDashboard />
      </div>
    </PageShell>
  );
}
