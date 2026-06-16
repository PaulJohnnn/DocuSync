/**
 * @module TitleBar
 * macOS-style 40px titlebar — traffic lights, centered "DocuSync", status pill.
 */
import React from 'react';
import { useElectronSync } from '@/context/ElectronSyncContext';

const TitleBar: React.FC = () => {
  const { syncStatus } = useElectronSync();

  const dotColor =
    syncStatus === 'idle'     ? 'var(--green)' :
    syncStatus === 'syncing'  ? 'var(--amber)' :
    syncStatus === 'conflict' ? 'var(--red)'   :
    syncStatus === 'error'    ? 'var(--red)'   :
    'var(--text-muted)';

  const label =
    syncStatus === 'idle'     ? 'Ready'    :
    syncStatus === 'syncing'  ? 'Syncing'  :
    syncStatus === 'conflict' ? 'Conflict' :
    syncStatus === 'error'    ? 'Error'    :
    'Offline';

  return (
    <div className="ds-titlebar">
      {/* Traffic lights */}
      <div className="ds-titlebar-dots">
        <div className="ds-titlebar-dot" style={{ background: '#ff5f56' }} />
        <div className="ds-titlebar-dot" style={{ background: '#febc2e' }} />
        <div className="ds-titlebar-dot" style={{ background: '#28c840' }} />
      </div>

      {/* Centered app name */}
      <div className="ds-titlebar-title">DocuSync</div>

      {/* Sync status pill */}
      <div className="ds-titlebar-right">
        <div className="ds-titlebar-status" style={{ color: dotColor }}>
          <span
            className="ds-titlebar-status-dot"
            style={{
              background: dotColor,
              boxShadow: syncStatus === 'idle' ? `0 0 4px ${dotColor}` :
                         syncStatus === 'syncing' ? `0 0 6px ${dotColor}` : 'none',
            }}
          />
          <span>{label}</span>
        </div>
      </div>
    </div>
  );
};

export default TitleBar;
