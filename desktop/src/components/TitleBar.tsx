/**
 * @module TitleBar
 * Premium macOS-style titlebar — 42px height, traffic lights, centered title,
 * sync status badge with animated glow dot.
 */
import React from 'react';
import { useElectronSync } from '@/context/ElectronSyncContext';

const TitleBar: React.FC = () => {
  const { syncStatus } = useElectronSync();

  const statusColor =
    syncStatus === 'idle'     ? 'var(--green)' :
    syncStatus === 'syncing'  ? 'var(--amber)' :
    syncStatus === 'conflict' ? 'var(--red)' :
    syncStatus === 'error'    ? 'var(--red)' :
    'var(--text-muted)';

  const statusLabel =
    syncStatus === 'idle'     ? 'Ready' :
    syncStatus === 'syncing'  ? 'Syncing' :
    syncStatus === 'conflict' ? 'Conflict' :
    syncStatus === 'error'    ? 'Error' :
    'Offline';

  return (
    <div className="ds-titlebar">
      {/* macOS traffic light dots */}
      <div className="ds-titlebar-dots">
        <div className="ds-titlebar-dot" style={{ background: '#ff5f57' }} />
        <div className="ds-titlebar-dot" style={{ background: '#febc2e' }} />
        <div className="ds-titlebar-dot" style={{ background: '#28c840' }} />
      </div>

      {/* Centered app name */}
      <div className="ds-titlebar-title">DocuSync</div>

      {/* Right: status badge */}
      <div className="ds-titlebar-right">
        <div className="ds-titlebar-status" style={{ color: statusColor }}>
          <span
            className="ds-titlebar-status-dot"
            style={{
              background: statusColor,
              boxShadow: syncStatus === 'syncing'
                ? `0 0 6px ${statusColor}`
                : syncStatus === 'idle'
                ? `0 0 4px ${statusColor}`
                : 'none',
            }}
          />
          <span style={{ textTransform: 'capitalize', letterSpacing: '0.02em' }}>
            {statusLabel}
          </span>
        </div>
      </div>
    </div>
  );
};

export default TitleBar;
