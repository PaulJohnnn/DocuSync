/**
 * @module Sidebar
 * Premium sidebar — lucide-react icons, section labels, active left-border accent,
 * live node status card at the bottom.
 */
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useElectronSync } from '@/context/ElectronSyncContext';
import {
  Files, FileEdit, AlertTriangle, Clock,
  Network, BarChart2, Settings,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  id: string;
}

// ── Sidebar ───────────────────────────────────────────────────────────────

const Sidebar: React.FC = () => {
  const location = useLocation();
  const { localNodeId, pendingConflicts, connectedPeers, syncStatus } = useElectronSync();

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  const NAV_ITEMS: NavItem[] = [
    { to: '/',          icon: <Files size={15} />,         label: 'Files',     id: 'nav-files' },
    { to: '/editor/0',  icon: <FileEdit size={15} />,      label: 'Editor',    id: 'nav-editor' },
    { to: '/conflicts', icon: <AlertTriangle size={15} />, label: 'Conflicts', id: 'nav-conflicts' },
    { to: '/history/0', icon: <Clock size={15} />,         label: 'History',   id: 'nav-history' },
    { to: '/peers',     icon: <Network size={15} />,       label: 'Peers',     id: 'nav-peers' },
    { to: '/metrics',   icon: <BarChart2 size={15} />,     label: 'Metrics',   id: 'nav-metrics' },
    { to: '/settings',  icon: <Settings size={15} />,      label: 'Settings',  id: 'nav-settings' },
  ];

  const shortId  = localNodeId ? localNodeId.slice(0, 8) : '--------';
  const isOnline = syncStatus !== 'offline' && syncStatus !== 'error';

  return (
    <nav className="ds-sidebar">

      {/* ── Logo ── */}
      <div className="ds-sidebar-logo">
        <div className="ds-sidebar-logo-icon">
          <img
            src="/docusync-logo.svg"
            width={28}
            height={28}
            alt="DocuSync"
            style={{ display: 'block' }}
          />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>
            DocuSync
          </div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '1px' }}>
            v1.0.0
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <div className="ds-sidebar-section-label">Navigation</div>

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

            {/* Conflict count badge */}
            {item.to === '/conflicts' && pendingConflicts > 0 && (
              <span className="ds-nav-badge">{pendingConflicts}</span>
            )}
          </NavLink>
        ))}
      </div>

      {/* ── Node Card ── */}
      <div className="ds-sidebar-node">
        <div className="ds-sidebar-node-card">

          {/* Status row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: isOnline ? 'var(--green)' : 'var(--text-muted)',
              boxShadow: isOnline ? '0 0 6px var(--green)' : 'none',
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: '0.7rem',
              fontWeight: 600,
              color: isOnline ? 'var(--green)' : 'var(--text-muted)',
            }}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
            <span style={{
              marginLeft: 'auto',
              fontSize: '0.62rem',
              color: 'var(--text-muted)',
            }}>
              {connectedPeers.length}p
            </span>
          </div>

          {/* Mini logo + node ID */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <img
              src="/docusync-logo.svg"
              width={16}
              height={16}
              alt=""
              style={{ display: 'block', opacity: 0.5, flexShrink: 0 }}
            />
            <code style={{
              fontSize: '0.62rem',
              color: 'var(--text-muted)',
              fontFamily: 'monospace',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {shortId}…
            </code>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Sidebar;
