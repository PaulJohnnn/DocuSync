/**
 * @module Sidebar
 * WPS Office–inspired 224px sidebar.
 * Logo · search bar · WORKSPACE nav · TOOLS nav · node card.
 */
import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useElectronSync } from '@/context/ElectronSyncContext';
import {
  Files, FileEdit, AlertTriangle, Clock,
  Network, BarChart2, Settings, Search, Lock
} from 'lucide-react';

interface NavItem {
  to:    string;
  icon:  React.ReactNode;
  label: string;
  id:    string;
}

const WORKSPACE_NAV: NavItem[] = [
  { to: '/',          icon: <Files size={16} />,         label: 'Files',     id: 'nav-files'     },
  { to: '/editor/0',  icon: <FileEdit size={16} />,      label: 'Editor',    id: 'nav-editor'    },
  { to: '/conflicts', icon: <AlertTriangle size={16} />, label: 'Conflicts', id: 'nav-conflicts' },
  { to: '/history/0', icon: <Clock size={16} />,         label: 'History',   id: 'nav-history'   },
  { to: '/peers',     icon: <Network size={16} />,       label: 'Peers',     id: 'nav-peers'     },
];

const TOOLS_NAV: NavItem[] = [
  { to: '/metrics',  icon: <BarChart2 size={16} />, label: 'Metrics',  id: 'nav-metrics'  },
  { to: '/settings', icon: <Settings size={16} />,  label: 'Settings', id: 'nav-settings' },
];

const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { localNodeId, pendingConflicts, connectedPeers, syncStatus } = useElectronSync();

  const handleLockVault = async () => {
    try {
      const res = await window.docuSync.lockVault();
      if (res.success) {
        navigate('/vault-login');
      }
    } catch (err) {
      console.error('Failed to lock vault', err);
    }
  };

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to.split('/')[1] ? '/' + to.split('/')[1] : to);

  const isOnline = syncStatus !== 'offline' && syncStatus !== 'error';
  const shortId  = localNodeId ? localNodeId.slice(0, 8) : '--------';

  const renderItem = (item: NavItem) => (
    <NavLink
      key={item.to}
      id={item.id}
      to={item.to}
      end={item.to === '/'}
      className={`ds-sidebar-item ${isActive(item.to) ? 'active' : ''}`}
    >
      <span className="ds-sidebar-item-icon">{item.icon}</span>
      <span>{item.label}</span>
      {item.to === '/conflicts' && pendingConflicts > 0 && (
        <span className="ds-nav-badge">{pendingConflicts}</span>
      )}
    </NavLink>
  );

  return (
    <nav className="ds-sidebar">

      {/* ── Logo ── */}
      <div className="ds-sidebar-logo">
        <div className="ds-sidebar-logo-icon">
          <img src="/docusync-logo.svg" width={24} height={24} alt="DocuSync" style={{ display: 'block' }} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.2 }}>
            DocuSync
          </div>
          <div style={{
            display: 'inline-block', marginTop: 3,
            background: 'var(--accent-light)', borderRadius: 20,
            padding: '2px 8px', fontSize: 10, color: 'var(--text-muted)',
          }}>
            Hybrid P2P Engine
          </div>
        </div>
      </div>

      {/* ── Visual search bar ── */}
      <div className="ds-sidebar-search">
        <span className="ds-sidebar-search-icon">
          <Search size={12} />
        </span>
        <input
          className="ds-sidebar-search-input"
          placeholder="Search files..."
          readOnly
          tabIndex={-1}
        />
      </div>

      {/* ── WORKSPACE ── */}
      <div className="ds-sidebar-section-label">Workspace</div>
      <div className="ds-sidebar-nav">
        {WORKSPACE_NAV.map(renderItem)}
      </div>

      {/* ── TOOLS ── */}
      <div className="ds-sidebar-section-label">Tools</div>
      <div className="ds-sidebar-nav" style={{ flex: 'none' }}>
        {TOOLS_NAV.map(renderItem)}
      </div>

      {/* ── Node card ── */}
      <div className="ds-sidebar-sep" />
      <div className="ds-sidebar-node">
        <div className="ds-sidebar-node-card">
          {/* Row 1: status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: isOnline ? 'var(--green)' : 'var(--text-muted)',
              boxShadow: isOnline ? '0 0 5px var(--green)' : 'none',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: isOnline ? 'var(--green)' : 'var(--text-muted)' }}>
              {isOnline ? 'Online' : 'Disconnected'}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
              {connectedPeers.length} peer{connectedPeers.length !== 1 ? 's' : ''}
            </span>
          </div>
          {/* Row 2: node ID */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 34, flexShrink: 0 }}>Node</span>
            <code style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {shortId}…
            </code>
          </div>
          {/* Row 3: port */}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            Port 9000
          </div>
        </div>
      </div>

      {/* ── Lock Repository Button ── */}
      <div style={{ padding: '0 12px 12px 12px' }}>
        <button
          onClick={handleLockVault}
          className="ds-sidebar-item"
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            color: 'var(--ds-red)',
            cursor: 'pointer',
            justifyContent: 'flex-start',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <span className="ds-sidebar-item-icon"><Lock size={16} /></span>
          <span>Lock Repository</span>
        </button>
      </div>
    </nav>
  );
};

export default Sidebar;
