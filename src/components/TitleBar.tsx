/**
 * @module TitleBar
 * macOS-style titlebar with traffic light dots, centered title, and sync status badge.
 */
import React from 'react';
import { useElectronSync } from '@/context/ElectronSyncContext';

const TitleBar: React.FC = () => {
  const { syncStatus } = useElectronSync();

  const statusColor =
    syncStatus === 'idle'     ? 'var(--ds-green)' :
    syncStatus === 'syncing'  ? 'var(--ds-amber)' :
    syncStatus === 'conflict' ? 'var(--ds-red)' :
    syncStatus === 'error'    ? 'var(--ds-red)' :
    'var(--ds-text3)';

  return (
    <div className="ds-titlebar">
      {/* Traffic light dots */}
      <div className="ds-titlebar-dots">
        <div className="ds-titlebar-dot" style={{ background: '#ff5f57' }} />
        <div className="ds-titlebar-dot" style={{ background: '#febc2e' }} />
        <div className="ds-titlebar-dot" style={{ background: '#28c840' }} />
      </div>

      {/* Centered title */}
      <div className="ds-titlebar-title">DocuSync — Hybrid P2P Sync Engine</div>

      {/* Right: sync status badge */}
      <div className="ds-titlebar-right">
        <div style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          background: 'var(--ds-bg3)', borderRadius: '99px',
          padding: '2px 10px 2px 7px', fontSize: '0.68rem',
          fontWeight: 600, color: statusColor,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: statusColor, flexShrink: 0,
          }} />
          <span style={{ textTransform: 'capitalize' }}>{syncStatus}</span>
        </div>
      </div>
    </div>
  );
};

export default TitleBar;
