/**
 * @module MetricsPage
 * @description ISO/IEC 25010 evaluation results dashboard — route `/metrics`.
 * Displays performance benchmark results, thesis metadata, and evaluation standard info.
 * All data is static (sourced from Chapter 4 evidence JSON); no IPC calls required.
 */
import React from 'react';
import { IconActivity, IconShield, IconZap } from '@/components/Icons';

// ── Types ────────────────────────────────────────────────────────────────────

interface MetricRow {
  /** Human-readable metric name */
  metric: string;
  /** Target threshold defined in thesis */
  target: string;
  /** Measured result from automated/manual tests */
  result: string;
  /** PASSED | FAILED */
  status: 'PASSED' | 'FAILED';
}

interface ThesisInfo {
  key: string;
  value: string;
}

// ── Data ─────────────────────────────────────────────────────────────────────

/** ISO/IEC 25010 evaluation results from Phase 5 (Chapter 4). */
const METRICS: MetricRow[] = [
  { metric: 'Avg Latency',        target: '< 50ms',    result: '1.51ms',     status: 'PASSED' },
  { metric: 'p95 Latency',        target: '< 50ms',    result: '3.01ms',     status: 'PASSED' },
  { metric: 'Max Latency',        target: '< 50ms',    result: '4.55ms',     status: 'PASSED' },
  { metric: 'Throughput',         target: '≥ 10/s',    result: '1,010.89/s', status: 'PASSED' },
  { metric: 'Conflict Detection', target: '> 95%',     result: '100%',       status: 'PASSED' },
  { metric: 'Data Loss Rate',     target: '0%',        result: '0%',         status: 'PASSED' },
  { metric: 'Consistency Rate',   target: '≥ 95%',     result: '100%',       status: 'PASSED' },
  { metric: 'Concurrent Users',   target: '15 nodes',  result: '15 nodes',   status: 'PASSED' },
  { metric: 'Manual Tests',       target: '20/20',     result: '100%',       status: 'PASSED' },
  { metric: 'Automated Tests',    target: '72/72',     result: '100%',       status: 'PASSED' },
];

/** Thesis metadata rows. */
const THESIS_INFO: ThesisInfo[] = [
  { key: 'Project',            value: 'DocuSync' },
  { key: 'Thesis',            value: 'A Comparative Evaluation of Operational Transformation and Replicated Data Types to Hybrid Conflict Resolution Algorithm' },
  { key: 'Institution',       value: 'Pamantasan ng Cabuyao' },
  { key: 'College',           value: 'College of Computing Studies' },
  { key: 'Degree',            value: 'BS Computer Science' },
  { key: 'Researchers',       value: 'Paul John G. Palamara (Solo Developer)\nBajado, John Benedict B.\nPalma, John Lloyd P.\nVenancio, Zyra P.' },
  { key: 'Year',              value: '2026' },
  { key: 'Standard',         value: 'ISO/IEC 25010' },
];

// ── Sub-components ───────────────────────────────────────────────────────────

/** Single summary card shown in the metrics grid. */
const SummaryCard: React.FC<{
  label: string;
  value: string;
  color?: string;
  icon?: React.ReactNode;
}> = ({ label, value, color = 'var(--ds-accent)', icon }) => (
  <div className="ds-metric-card">
    {icon && (
      <span style={{ color, marginBottom: '0.25rem', display: 'block' }}>{icon}</span>
    )}
    <span className="ds-metric-label">{label}</span>
    <span className="ds-metric-value" style={{ color }}>{value}</span>
  </div>
);

/** A single row in the metrics results table. */
const MetricRow: React.FC<{ row: MetricRow; index: number }> = ({ row, index }) => {
  const passColor = 'var(--ds-green)';
  const failColor = 'var(--ds-red)';
  const statusColor = row.status === 'PASSED' ? passColor : failColor;

  return (
    <tr style={{ background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
      <td style={TD}>{row.metric}</td>
      <td style={{ ...TD, color: 'var(--ds-text2)', fontFamily: 'monospace', fontSize: '0.75rem' }}>{row.target}</td>
      <td style={{ ...TD, fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: 'var(--ds-text)' }}>{row.result}</td>
      <td style={TD}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          padding: '2px 8px', borderRadius: '999px',
          fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em',
          background: row.status === 'PASSED' ? 'rgba(30,199,106,0.15)' : 'rgba(239,68,68,0.15)',
          color: statusColor,
          border: `1px solid ${statusColor}33`,
        }}>
          {row.status === 'PASSED' ? '✓' : '✗'} {row.status}
        </span>
      </td>
    </tr>
  );
};

// ── Styles ───────────────────────────────────────────────────────────────────

const TD: React.CSSProperties = {
  padding: '0.6rem 0.75rem',
  fontSize: '0.78rem',
  color: 'var(--ds-text)',
  borderBottom: '1px solid var(--ds-border)',
  verticalAlign: 'middle',
};

const TH: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontSize: '0.65rem',
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--ds-text3)',
  borderBottom: '1px solid var(--ds-border)',
  textAlign: 'left',
};

// ── MetricsPage ──────────────────────────────────────────────────────────────

/**
 * MetricsPage — ISO/IEC 25010 evaluation dashboard.
 * All results sourced from Chapter 4 evidence. No live IPC calls.
 */
const MetricsPage: React.FC = () => {
  const passedCount = METRICS.filter((m) => m.status === 'PASSED').length;
  const totalCount = METRICS.length;
  const passRate = Math.round((passedCount / totalCount) * 100);

  return (
    <>
      {/* Topbar */}
      <div className="ds-topbar">
        <span style={{ color: 'var(--ds-accent)' }}><IconActivity size={16} /></span>
        <span className="ds-topbar-title">Performance Metrics</span>
        <span className="ds-topbar-subtitle">ISO/IEC 25010 Evaluation Results</span>
      </div>

      <div className="ds-main-scroll ds-page-enter">

        {/* Summary cards */}
        <div className="ds-metrics-grid">
          <SummaryCard
            label="Tests Passed"
            value={`${passedCount}/${totalCount}`}
            color="var(--ds-green)"
            icon={<IconShield size={14} />}
          />
          <SummaryCard
            label="Pass Rate"
            value={`${passRate}%`}
            color="var(--ds-green)"
          />
          <SummaryCard
            label="Avg Latency"
            value="1.51ms"
            color="var(--ds-accent)"
            icon={<IconZap size={14} />}
          />
          <SummaryCard
            label="Throughput"
            value="1,010/s"
            color="var(--ds-accent)"
          />
        </div>

        {/* Results table */}
        <div className="ds-card" style={{ overflow: 'hidden', marginBottom: '1rem' }}>
          <div style={{
            padding: '0.75rem 1rem',
            borderBottom: '1px solid var(--ds-border)',
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'var(--ds-text)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <IconActivity size={14} style={{ color: 'var(--ds-accent)' }} />
            Evaluation Results — All Metrics
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>Metric</th>
                  <th style={TH}>Target</th>
                  <th style={TH}>Result</th>
                  <th style={TH}>Status</th>
                </tr>
              </thead>
              <tbody>
                {METRICS.map((row, i) => (
                  <MetricRow key={row.metric} row={row} index={i} />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Thesis info */}
        <div className="ds-card" style={{ overflow: 'hidden', marginBottom: '1rem' }}>
          <div style={{
            padding: '0.75rem 1rem',
            borderBottom: '1px solid var(--ds-border)',
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'var(--ds-text)',
          }}>
            Thesis Information
          </div>
          <div style={{ padding: '0.25rem 0' }}>
            {THESIS_INFO.map(({ key, value }, i) => (
              <div
                key={key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 1fr',
                  gap: '0.5rem',
                  padding: '0.55rem 1rem',
                  borderBottom: i < THESIS_INFO.length - 1 ? '1px solid var(--ds-border)' : 'none',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                  alignItems: 'start',
                }}
              >
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--ds-text3)', textTransform: 'uppercase', letterSpacing: '0.05em', paddingTop: '1px' }}>
                  {key}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--ds-text)', whiteSpace: 'pre-line', lineHeight: 1.6 }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Standard badge */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: '1rem' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '4px 12px', borderRadius: '999px',
            fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em',
            background: 'rgba(79,125,248,0.12)',
            color: 'var(--ds-accent)',
            border: '1px solid rgba(79,125,248,0.25)',
          }}>
            <IconShield size={11} /> Evaluated per ISO/IEC 25010 · 2026
          </span>
        </div>

      </div>
    </>
  );
};

export default MetricsPage;
