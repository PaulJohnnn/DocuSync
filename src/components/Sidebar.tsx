/**
 * @module Sidebar
 * Left sidebar with logo, nav items (Tabler icons), and local node card.
 */
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useElectronSync } from '@/context/ElectronSyncContext';
import {
  IconFiles, IconEdit, IconAlertTriangle,
  IconHistory, IconNetwork, IconDatabase,
} from './Icons';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  id: string;
}

const Sidebar: React.FC = () => {
  const location = useLocation();
  const { localNodeId, pendingConflicts, connectedPeers, syncStatus } = useElectronSync();

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  const NAV_ITEMS: NavItem[] = [
    { to: '/',          icon: <IconFiles size={16} />,           label: 'Files',     id: 'nav-files' },
    { to: '/editor/0',  icon: <IconEdit size={16} />,            label: 'Editor',    id: 'nav-editor' },
    { to: '/conflicts', icon: <IconAlertTriangle size={16} />,   label: 'Conflicts', id: 'nav-conflicts' },
    { to: '/history/0', icon: <IconHistory size={16} />,         label: 'History',   id: 'nav-history' },
    { to: '/peers',     icon: <IconNetwork size={16} />,         label: 'Peers',     id: 'nav-peers' },
  ];

  const shortId = localNodeId ? localNodeId.slice(0, 8) + '...' : 'Loading...';
  const statusOnline = syncStatus !== 'offline' && syncStatus !== 'error';

  return (
    <nav className="ds-sidebar">
      {/* Logo */}
      <div className="ds-sidebar-logo">
        <div className="ds-sidebar-logo-icon">
          <IconDatabase size={18} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--ds-text)' }}>
            DocuSync
          </div>
          <div style={{ fontSize: '0.62rem', color: 'var(--ds-text3)', marginTop: '-1px' }}>
            Hybrid P2P Engine
          </div>
        </div>
      </div>

      {/* Nav Items */}
      <div className="ds-sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            id={item.id}
            to={item.to}
            end={item.to === '/'}
            className={`ds-sidebar-item ${isActive(item.to) ? 'active' : ''}`}
          >
            {item.icon}
            <span>{item.label}</span>

            {/* Conflict badge */}
            {item.to === '/conflicts' && pendingConflicts > 0 && (
              <span className="ds-nav-badge">{pendingConflicts}</span>
            )}
          </NavLink>
        ))}
      </div>

      {/* Node card */}
      <div className="ds-sidebar-node">
        <div style={{
          background: 'var(--ds-bg3)',
          borderRadius: 'var(--ds-radius-sm)',
          padding: '0.6rem 0.75rem',
          border: '1px solid var(--ds-border)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            marginBottom: '4px',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: statusOnline ? 'var(--ds-green)' : 'var(--ds-text3)',
              flexShrink: 0,
              boxShadow: statusOnline ? '0 0 6px var(--ds-green)' : 'none',
            }} />
            <span style={{
              fontSize: '0.72rem', fontWeight: 600,
              color: statusOnline ? 'var(--ds-green)' : 'var(--ds-text3)',
            }}>
              {statusOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <div style={{
            fontSize: '0.65rem', color: 'var(--ds-text3)',
            fontFamily: 'monospace',
          }}>
            Node: {shortId}
          </div>
          <div style={{
            fontSize: '0.62rem', color: 'var(--ds-text3)',
            marginTop: '1px',
          }}>
            {connectedPeers.length} peer{connectedPeers.length !== 1 ? 's' : ''} connected
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Sidebar;
