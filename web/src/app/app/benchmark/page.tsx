'use client';
import React, { useState, useEffect } from 'react';
import PageShell from '@/components/PageShell';
import { Activity } from 'lucide-react';

export default function BenchmarkDashboard() {
  const [data100, setData100] = useState<any>(null);
  const [dataMixed, setDataMixed] = useState<any>(null);
  const [dataOffline, setDataOffline] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/benchmark')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setData100(d.results100);
          setDataMixed(d.resultsMixed);
          setDataOffline(d.resultsOffline);
        } else {
          setError(d.error);
        }
        setLoading(false);
      })
      .catch(e => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  const renderTable = (data: any, title: string, subtitle: string) => (
    <div style={{ marginBottom: '3rem' }}>
      <h3 style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 4, color: 'var(--t1)' }}>{title}</h3>
      <p style={{ color: 'var(--t2)', fontSize: 13, marginBottom: 16 }}>{subtitle}</p>
      <div style={{ background: 'var(--bg2)', borderRadius: 12, border: '1px solid var(--b1)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--b1)', color: 'var(--t2)', fontSize: 12, textTransform: 'uppercase' }}>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid var(--b1)' }}>Concurrent Peers</th>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid var(--b1)' }}>Escalation Rate</th>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid var(--b1)' }}>Data Loss Rate</th>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid var(--b1)' }}>Consistency Rate</th>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid var(--b1)' }}>Avg Resolve Time</th>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid var(--b1)' }}>True Collisions</th>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid var(--b1)' }}>False Positives</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r: any, idx: number) => (
              <tr key={idx} style={{ borderBottom: '1px solid var(--b1)', color: 'var(--t1)' }}>
                <td style={{ padding: '12px 16px' }}><strong>{r.results.peerCount}</strong></td>
                <td style={{ padding: '12px 16px', color: r.results.conflictDetectionRate === 100 ? 'var(--brand)' : 'inherit' }}>{r.results.conflictDetectionRate}%</td>
                <td style={{ padding: '12px 16px', color: r.results.dataLossRate === 0 ? 'var(--success)' : 'var(--danger)' }}>{r.results.dataLossRate}%</td>
                <td style={{ padding: '12px 16px', color: r.results.consistencyRate === 100 ? 'var(--success)' : 'var(--danger)' }}>{r.results.consistencyRate}%</td>
                <td style={{ padding: '12px 16px' }}>{r.results.resolutionTimeMs.toFixed(3)} ms</td>
                <td style={{ padding: '12px 16px', color: r.results.trueCollisions > 0 ? 'var(--danger)' : 'inherit' }}>{r.results.trueCollisions} pairs</td>
                <td style={{ padding: '12px 16px', color: r.results.falsePositives > 0 ? 'var(--warning)' : 'inherit' }}>{r.results.falsePositives} pairs</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <PageShell title="Sync Engine Benchmark Results">
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '2rem' }}>
          <Activity size={24} style={{ color: 'var(--brand)' }} />
          <h1 style={{ fontSize: 24, fontWeight: 'bold' }}>Simulated Sync Engine Benchmark</h1>
        </div>

        {loading && <div style={{ color: 'var(--t2)' }}>Running strictly in-memory simulation across all peers... This may take a few seconds.</div>}
        {error && <div style={{ color: 'var(--danger)', background: 'rgba(255,0,0,0.1)', padding: 16, borderRadius: 8 }}>{error}</div>}

        {data100 && renderTable(data100, "Scenario 1: 100% Forced Collision", "All peers edit the exact same line simultaneously to force LWW escalation.")}
        {dataMixed && renderTable(dataMixed, "Scenario 2: 20% Mixed Workload", "Realistic workload: 20% overlapping edits, 80% independent non-overlapping edits.")}
        {dataOffline && renderTable(dataOffline, "Scenario 3: Offline / Reconnect", "A peer goes offline, makes an edit, while an online peer also edits. They reconnect and sync.")}
      </div>
    </PageShell>
  );
}
