'use client';
import { useState, useEffect } from 'react';
import PageShell from '@/components/PageShell';
import { AlertTriangle, CheckCircle, Scale } from 'lucide-react';

interface ConflictRecord {
  id: string;
  fileId: string;
  fileName: string;
  payloadA: string;
  nodeIdA: string;
  payloadB: string;
  nodeIdB: string;
  status: 'pending' | 'resolved';
  winner: 'A' | 'B' | null;
  detectedAt: string;
  resolvedAt: string | null;
}

export default function ConflictsPage() {
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('all');

  useEffect(() => {
    const stored = localStorage.getItem('docusync_conflicts');
    if (stored) setConflicts(JSON.parse(stored));
  }, []);

  const resolve = (conflictId: string, winner: 'A' | 'B') => {
    const updated = conflicts.map(c => {
      if (c.id === conflictId) {
        return { ...c, status: 'resolved' as const, winner, resolvedAt: new Date().toISOString() };
      }
      return c;
    });
    setConflicts(updated);
    localStorage.setItem('docusync_conflicts', JSON.stringify(updated));
  };

  const filtered = conflicts.filter(c => {
    if (filter === 'all') return true;
    return c.status === filter;
  });

  const pending = conflicts.filter(c => c.status === 'pending').length;
  const resolved = conflicts.filter(c => c.status === 'resolved').length;

  return (
    <PageShell>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Conflicts</h1>
          <p style={{ fontSize: 13, color: 'var(--t3)', margin: '4px 0 0' }}>
            {pending} pending • {resolved} resolved
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'pending', 'resolved'] as const).map(f => (
            <button key={f} className="ds-btn" onClick={() => setFilter(f)}
              style={{
                background: filter === f ? 'var(--acb)' : undefined,
                color: filter === f ? 'var(--acc)' : undefined,
                borderColor: filter === f ? 'var(--acbr)' : undefined,
                textTransform: 'capitalize',
              }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Conflict list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(34,197,94,0.12)',
            border: '2px solid rgba(34,197,94,0.30)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <CheckCircle size={36} style={{ color: '#22c55e' }} />
          </div>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', marginBottom: 6 }}>
            All conflicts resolved
          </p>
          <p style={{ fontSize: 13, color: 'var(--t3)', maxWidth: 280, margin: '0 auto' }}>
            No conflicts detected. Your files are in sync across all nodes.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(c => (
            <div key={c.id} className="ds-card" style={{ padding: 16 }}>
              {/* Conflict header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={16} style={{ color: c.status === 'pending' ? 'var(--amb)' : 'var(--grn)' }} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{c.fileName}</span>
                </div>
                <div className="ds-badge" style={{
                  background: c.status === 'pending' ? 'var(--abb)' : 'var(--grb)',
                  color: c.status === 'pending' ? 'var(--amb)' : 'var(--grn)',
                  border: `1px solid ${c.status === 'pending' ? 'var(--abbr)' : 'var(--grbr)'}`,
                }}>
                  {c.status === 'pending' ? 'Pending' : `Resolved (${c.winner})`}
                </div>
              </div>

              {/* Side-by-side diff */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div style={{
                  background: 'var(--bg)', border: '1px solid var(--b1)', borderRadius: 8,
                  padding: 12, fontSize: 12, fontFamily: 'monospace', color: 'var(--t2)',
                  maxHeight: 120, overflow: 'auto',
                }}>
                  <div style={{ fontSize: 10, color: 'var(--acc)', marginBottom: 6, fontWeight: 600 }}>
                    SIDE A — {c.nodeIdA.slice(0, 8)}
                  </div>
                  {c.payloadA || 'Empty'}
                </div>
                <div style={{
                  background: 'var(--bg)', border: '1px solid var(--b1)', borderRadius: 8,
                  padding: 12, fontSize: 12, fontFamily: 'monospace', color: 'var(--t2)',
                  maxHeight: 120, overflow: 'auto',
                }}>
                  <div style={{ fontSize: 10, color: 'var(--pur)', marginBottom: 6, fontWeight: 600 }}>
                    SIDE B — {c.nodeIdB.slice(0, 8)}
                  </div>
                  {c.payloadB || 'Empty'}
                </div>
              </div>

              {/* Escalated status for non-owner collaborator */}
              {c.status === 'pending' && (
                <div style={{
                  padding: '12px 16px',
                  background: 'rgba(245,158,11,0.12)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: 8,
                  color: 'var(--amb)',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginTop: 4,
                  fontWeight: 500,
                }}>
                  <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                  <span>Change escalated to host for conflict resolution. Waiting for room owner to accept or reject.</span>
                </div>
              )}

              <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 8 }}>
                Detected: {new Date(c.detectedAt).toLocaleString()}
                {c.resolvedAt && ` • Resolved: ${new Date(c.resolvedAt).toLocaleString()}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
