/**
 * @module TitleBar
 * macOS-style 40px titlebar — traffic lights, centered "DocuSync", status pill.
 */
import React from 'react';
import { useElectronSync } from '@/context/ElectronSyncContext';
import { Cpu } from 'lucide-react';

interface TitleBarProps {
  isRightPanelOpen?: boolean;
  onToggleRightPanel?: () => void;
}

const TitleBar: React.FC<TitleBarProps> = ({ isRightPanelOpen, onToggleRightPanel }) => {
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

        {onToggleRightPanel && (
          <button 
            className="ds-btn ds-btn-ghost" 
            style={{ 
              width: 26, 
              height: 26, 
              padding: 0, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              marginLeft: 6, 
              borderRadius: 'var(--r-sm)',
              border: 'none',
              background: isRightPanelOpen ? 'var(--accent-light)' : 'transparent',
              color: isRightPanelOpen ? 'var(--accent)' : 'var(--text-secondary)'
            }}
            onClick={onToggleRightPanel}
            title="Toggle Engine Metrics Panel"
          >
            <Cpu size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

export default TitleBar;
