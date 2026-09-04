/**
 * @module Sidebar
 * WPS Office–inspired 224px sidebar.
 * Logo · search bar · WORKSPACE nav · TOOLS nav · node card.
 */
import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useElectronSync } from '@/context/ElectronSyncContext';
import { toast } from 'sonner';
import {
  Files, FileEdit, Clock,
  Network, BarChart2, Settings, Search, Lock, ShieldCheck, Activity, LogOut
} from 'lucide-react';

interface NavItem {
  to:    string;
  icon:  React.ReactNode;
  label: string;
  id:    string;
}

const WORKSPACE_NAV: NavItem[] = [
  { to: '/',          icon: <Files size={16} />,         label: 'Room',      id: 'nav-files'     },
  { to: '/peers',     icon: <Network size={16} />,       label: 'Peers',     id: 'nav-peers'     },
];

const TOOLS_NAV: NavItem[] = [
  { to: '/metrics',     icon: <BarChart2 size={16} />, label: 'Metrics',     id: 'nav-metrics'     },
  { to: '/settings',    icon: <Settings size={16} />,  label: 'Settings',    id: 'nav-settings'    },
];

const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { syncStatus, connectedPeers, pendingConflicts, localNodeId, isAdmin, refreshStatus } = useElectronSync();
  const [hasInternet, setHasInternet] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = async () => {
      setHasInternet(true);
      toast.success('Back online — syncing with peers');
      try {
        if (window.docuSync && typeof window.docuSync.triggerSync === 'function') {
          await window.docuSync.triggerSync();
        }
        await refreshStatus();
      } catch {}
    };
    const handleOffline = () => {
      setHasInternet(false);
      toast.error('You are now offline — edits will be queued locally.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshStatus, pendingConflicts, navigate]);

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

  let statusText = 'Disconnected';
  let statusColor = 'var(--text-muted)';
  
  if (!hasInternet) {
     statusText = 'Offline';
     statusColor = 'var(--text-muted)';
  } else if (syncStatus === 'error') {
     statusText = 'Error';
     statusColor = 'var(--red)';
  } else if (syncStatus === 'syncing') {
     statusText = 'Syncing';
     statusColor = 'var(--amber)';
  } else {
     statusText = 'Online';
     statusColor = 'var(--green)';
  }

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
    </NavLink>
  );

  return (
    <nav className="ds-sidebar">

      {/* ── Logo ── */}
      <div className="ds-sidebar-logo">
        <div className="ds-sidebar-logo-icon">
          <img src="/icon.png" width={24} height={24} alt="DocuSync" style={{ display: 'block', borderRadius: 6 }} />
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
        {/* Admin — only shown to Global Admin */}
        {isAdmin && (
          <NavLink
            to="/admin"
            id="nav-admin"
            className={`ds-sidebar-item ${isActive('/admin') ? 'active' : ''}`}
          >
            <span className="ds-sidebar-item-icon"><ShieldCheck size={16} /></span>
            <span>Admin</span>
            <span style={{
              marginLeft: 'auto', fontSize: 9, background: 'var(--ds-accent-bg)',
              color: 'var(--ds-accent)', padding: '1px 5px', borderRadius: 99, fontWeight: 700,
            }}>ADMIN</span>
          </NavLink>
        )}
        

      </div>

      {/* ── Node card ── */}
      <div className="ds-sidebar-sep" />
      <div className="ds-sidebar-node">
        <div className="ds-sidebar-node-card">
          {/* Row 1: status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: statusColor,
              boxShadow: `0 0 5px ${statusColor}`,
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: statusColor }}>
              {statusText}
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

    </nav>
  );
};

export default Sidebar;
