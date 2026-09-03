/**
 * @module HistoryPage
 * EventLog version history page — route `/history/:fileId`.
 * Refactored: uses FileService. No inline IPC calls or duplicate formatters.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { IconArrowLeft, IconEdit, IconGitMerge, IconScale, IconFilePlus, IconRefresh } from '@/components/Icons';
import FileService, { type HistoryEntry } from '@/services/FileService';
import { ServiceError } from '@/services/errors/ServiceError';
import { notify } from '@docusync/shared/utils/notifications';
import { useElectronSync } from '@/context/ElectronSyncContext';
import { formatRelativeTime } from '@docusync/shared/utils/formatters';

// ── Helpers ──────────────────────────────────────────────────────────────────

function eventMeta(type: HistoryEntry['eventType']): { icon: React.ReactNode; label: string; color: string; bg: string } {
  switch (type) {
    case 'edit':
      return { icon: <IconEdit size={16} />, label: 'Edit', color: 'var(--ds-accent)', bg: 'var(--ds-accent-bg)' };
    case 'merge':
      return { icon: <IconGitMerge size={16} />, label: 'Merge', color: 'var(--ds-purple)', bg: 'var(--ds-purple-bg)' };
    case 'conflict-resolve':
      return { icon: <IconScale size={16} />, label: 'Conflict Resolved', color: 'var(--ds-amber)', bg: 'var(--ds-amber-bg)' };
    case 'restore':
      return { icon: <IconFilePlus size={16} />, label: 'Restore', color: 'var(--ds-green)', bg: 'var(--ds-green-bg)' };
    case 'delete':
      return { icon: <span style={{ fontSize: 16 }}>🗑️</span>, label: 'File Deleted', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' };
    default:
      return { icon: <IconRefresh size={16} />, label: type, color: 'var(--ds-text3)', bg: 'var(--ds-bg3)' };
  }
}

function truncatePreview(text: string, max = 120): string {
  if (!text) return '';
  const clean = text.replace(/[\r\n\t]+/g, ' ').trim();
  return clean.length <= max ? clean : clean.slice(0, max) + '…';
}

// ── TimelineItem ─────────────────────────────────────────────────────────────

const TimelineItem: React.FC<{
  entry: HistoryEntry;
  isLatest: boolean;
  restoring: boolean;
  onRestore: (eventId: string) => void;
}> = ({ entry, isLatest, restoring, onRestore }) => {
  const meta = eventMeta(entry.eventType);

  return (
    <div className="ds-timeline-item" style={{ opacity: entry.isCompacted ? 0.5 : 1 }}>
      {/* Icon circle */}
      <div className="ds-timeline-icon" style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}33` }}>
        {meta.icon}
      </div>

      {/* Content card */}
      <article className="ds-card" style={{ flex: 1, padding: '0.75rem 1rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
          <span style={{ fontWeight: 600, fontSize: '0.82rem', color: meta.color }}>{meta.label}</span>
          <span className="ds-badge ds-badge-accent" style={{ fontSize: '0.6rem' }}>ts={entry.logicalTimestamp}</span>
          {isLatest && <span className="ds-badge ds-badge-green" style={{ fontSize: '0.6rem' }}>latest</span>}
          {entry.isCompacted && <span className="ds-badge ds-badge-muted" style={{ fontSize: '0.6rem' }}>compacted</span>}
        </div>

        {/* Node info */}
        <div style={{ fontSize: '0.7rem', color: 'var(--ds-text3)', marginBottom: '0.3rem' }}>
          Node: <span style={{ fontFamily: 'monospace', color: 'var(--ds-text2)' }}>{entry.nodeId.slice(0, 12)}…</span>
        </div>

        {/* Payload preview */}
        {entry.payloadPreview && (
          <div style={{ fontSize: '0.68rem', color: 'var(--ds-text2)', background: 'var(--ds-bg3)', borderRadius: 'var(--ds-radius-sm)', padding: '0.35rem 0.5rem', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', marginBottom: '0.35rem' }}>
            {truncatePreview(entry.payloadPreview)}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--ds-text3)' }}>
              {formatRelativeTime(entry.createdAt)}
            </span>
            <span style={{ fontSize: '0.6rem', color: 'var(--ds-text3)', fontFamily: 'monospace', opacity: 0.7 }}>
              {new Date(entry.createdAt).toLocaleString()}
            </span>
          </div>
          {entry.eventType === 'delete' ? (
            <span style={{ fontSize: '0.68rem', color: '#ef4444', fontWeight: 600, padding: '0.2rem 0.5rem', background: 'rgba(239,68,68,0.1)', borderRadius: 4 }}>
              🗑️ Deleted at {new Date(entry.createdAt).toLocaleTimeString()}
            </span>
          ) : (
            isLatest ? (
              <span style={{ fontSize: '0.68rem', color: 'var(--ds-green)', fontWeight: 600, border: '1px solid var(--ds-green)', padding: '0.2rem 0.5rem', borderRadius: 4 }}>
                 Current Version
              </span>
            ) : (
              <button
                className="ds-btn ds-btn-ghost"
                disabled={restoring}
                onClick={() => onRestore(entry.eventId)}
                style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem' }}
                title={`Restore to ts=${entry.logicalTimestamp}`}
              >
                {restoring ? '⏳ Restoring…' : '⏪ Restore'}
              </button>
            )
          )}
        </div>
      </article>
    </div>
  );
};

// ── Compare Modal ────────────────────────────────────────────────────────────

import { diffWords } from 'diff';

function renderDiff(oldText: string, newText: string) {
  // Strip simple HTML tags for a clean text diff
  const strip = (html: string) => html ? html.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ') : '';
  const oldClean = strip(oldText);
  const newClean = strip(newText);
  
  const diffs = diffWords(newClean, oldClean); // Diffing latest against restored version

  return (
    <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: '1.5', background: 'var(--ds-bg3)', padding: 16, borderRadius: 8, maxHeight: 300, overflowY: 'auto' }}>
      {diffs.map((part, index) => {
        const color = part.added ? '#ef4444' : part.removed ? '#10b981' : 'var(--ds-text2)';
        const bg = part.added ? 'rgba(239, 68, 68, 0.15)' : part.removed ? 'rgba(16, 185, 129, 0.15)' : 'transparent';
        const textDecoration = part.added ? 'line-through' : 'none';
        return (
          <span key={index} style={{ color, backgroundColor: bg, padding: part.removed || part.added ? '0 2px' : 0, borderRadius: 2, textDecoration }}>
            {part.value}
          </span>
        );
      })}
    </div>
  );
}

// ── HistoryPage ───────────────────────────────────────────────────────────────

const HistoryPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileId = useMemo(() => { const n = parseInt(id ?? '', 10); return Number.isFinite(n) ? n : null; }, [id]);
  const { currentRoom, localNodeId } = useElectronSync();

  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [totalEntries, setTotalEntries] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<Record<string, boolean>>({});
  
  const [comparingEvent, setComparingEvent] = useState<HistoryEntry | null>(null);

  const fetchHistory = useCallback(async () => {
    if (fileId === null) { setLoadError('Invalid file ID.'); setLoading(false); return; }
    setLoading(true); setLoadError(null);
    try {
      const data = await FileService.getHistory(fileId);
      setEntries([...data.entries].sort((a, b) => b.logicalTimestamp - a.logicalTimestamp));
      setTotalEntries(data.totalEntries);
    } catch (err) {
      setLoadError(err instanceof ServiceError ? err.message : String(err));
    } finally { setLoading(false); }
  }, [fileId]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleConfirmRestore = useCallback(async () => {
    if (fileId === null || !comparingEvent) return;
    const eventId = comparingEvent.eventId;
    setComparingEvent(null);
    setRestoring(prev => ({ ...prev, [eventId]: true }));
    try {
      const data = await FileService.restoreVersion(fileId, eventId);
      notify.success('Version restored', `${data.contentLength} chars restored`);

      // Push to Matchmaker so the room snapshot isn't stale
      if (currentRoom) {
        const otp = currentRoom.otp || currentRoom.id;
        try {
          const _WEB_BASE = import.meta.env.VITE_WEB_URL || (import.meta.env.DEV ? 'http://localhost:3000' : 'https://docusync-dusky.vercel.app');
          await fetch(`${_WEB_BASE}/api/lobby/doc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              otp,
              fileId: String(fileId),
              authorNodeId: localNodeId || 'host',
              authorName: (localNodeId || 'host').slice(0, 8),
              content: (data as any).content || '',
              vectorClock: {},
              deltaSize: data.contentLength,
              isOfflineReconnect: !navigator.onLine
            })
          });
        } catch (e) {
          console.error('Failed to update Matchmaker after restore', e);
        }
      }

      navigate(`/editor/${data.fileId}`);
    } catch (err) {
      notify.error(err instanceof ServiceError ? err.message : `Restore failed: ${String(err)}`);
      setRestoring(prev => ({ ...prev, [eventId]: false }));
    }
  }, [fileId, navigate, comparingEvent, currentRoom, localNodeId]);

  const latestEntry = entries.length > 0 ? entries[0] : null;

  return (
    <>
      {/* Topbar */}
      <div className="ds-topbar">
        <button className="ds-btn ds-btn-ghost" onClick={() => navigate(`/editor/${fileId}`)}><IconArrowLeft size={14} /> Editor</button>
        <span className="ds-topbar-title">Version History</span>
        <span className="ds-topbar-subtitle">File #{fileId}</span>
        <div className="ds-topbar-actions">
          <span className="ds-badge ds-badge-accent">{totalEntries} events</span>
          <button className="ds-btn ds-btn-ghost" onClick={fetchHistory}><IconRefresh size={14} /> Refresh</button>
        </div>
      </div>

      {/* Compare Modal */}
      {comparingEvent && latestEntry && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          animation: 'fadeIn 0.15s ease-out'
        }}>
          <div style={{
            background: 'var(--ds-surface)', borderRadius: 16, width: '100%', maxWidth: 700,
            padding: 24, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)', border: '1px solid var(--ds-border)',
            display: 'flex', flexDirection: 'column', gap: 16
          }}>
            <h2 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <IconScale size={20} /> Compare Version vs Latest
            </h2>
            
            <div style={{ fontSize: '0.85rem', color: 'var(--ds-text2)' }}>
              You are viewing the difference between the <strong>latest version (ts={latestEntry.logicalTimestamp})</strong> and the historical version from <strong>{new Date(comparingEvent.createdAt).toLocaleString()} (ts={comparingEvent.logicalTimestamp})</strong>.
            </div>

            <div style={{ display: 'flex', gap: 16, fontSize: '0.8rem', color: 'var(--ds-text3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'inline-block', width: 12, height: 12, background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', borderRadius: 2 }}></span> What will be removed from latest</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'inline-block', width: 12, height: 12, background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10b981', borderRadius: 2 }}></span> What will be restored (added)</div>
            </div>

            {renderDiff(comparingEvent.payload, latestEntry.payload)}

            <div className="ds-banner ds-banner-amber" style={{ padding: '0.8rem 1rem' }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <div style={{ flex: 1, fontSize: '0.85rem' }}>
                <strong>Warning:</strong> Restoring this historical version will overwrite the current content of the file. A new "Restore" event will be appended to the history log, preserving this moment.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
              <button className="ds-btn ds-btn-ghost" onClick={() => setComparingEvent(null)}>Cancel</button>
              <button 
                className="ds-btn ds-btn-primary" 
                onClick={handleConfirmRestore}
                style={{ background: 'var(--ds-green)', borderColor: 'var(--ds-green)' }}
              >
                <IconFilePlus size={14} /> Confirm and Restore
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="ds-main-scroll ds-page-enter" style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ display: 'flex', gap: '1rem', opacity: 1 - i * 0.15 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--ds-surface)' }} className="ds-pulse" />
                <div style={{ flex: 1, height: 80, borderRadius: 'var(--ds-radius-lg)', background: 'var(--ds-surface)' }} className="ds-pulse" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {loadError && (
          <div className="ds-banner ds-banner-red">
            <span>⛔</span>
            <span style={{ flex: 1 }}>{loadError}</span>
            <button className="ds-btn ds-btn-ghost" onClick={fetchHistory}>Retry</button>
          </div>
        )}

        {/* Empty */}
        {!loading && !loadError && entries.length === 0 && (
          <div className="ds-empty" style={{ background: 'var(--ds-surface)', borderRadius: 'var(--ds-radius-lg)', border: '1px solid var(--ds-border)' }}>
            <div className="ds-empty-icon">🕐</div>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No history yet</h2>
            <p style={{ color: 'var(--ds-text2)', fontSize: '0.82rem', maxWidth: 340, margin: '0 auto 1.5rem' }}>
              Start editing this file to create EventLog entries. Each Check-In generates a new event.
            </p>
            <button className="ds-btn ds-btn-primary" onClick={() => navigate(`/editor/${fileId}`)}>Open Editor</button>
          </div>
        )}

        {/* Timeline */}
        {!loading && !loadError && entries.length > 0 && (
          <div className="ds-timeline">
            {entries.map((entry, idx) => (
              <TimelineItem
                key={entry.eventId}
                entry={entry}
                isLatest={idx === 0}
                restoring={!!restoring[entry.eventId]}
                onRestore={(eventId) => {
                  const target = entries.find(e => e.eventId === eventId);
                  if (target) setComparingEvent(target);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default HistoryPage;
