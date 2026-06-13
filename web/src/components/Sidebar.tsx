'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FolderOpen, FileEdit, AlertTriangle, Clock, Users, BarChart3, Wifi
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', label: 'Files', icon: FolderOpen },
  { href: '/editor/new', label: 'Editor', icon: FileEdit },
  { href: '/conflicts', label: 'Conflicts', icon: AlertTriangle },
  { href: '/history/all', label: 'History', icon: Clock },
  { href: '/peers', label: 'Peers', icon: Users },
  { href: '/metrics', label: 'Metrics', icon: BarChart3 },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [nodeId, setNodeId] = useState('');

  useEffect(() => {
    let id = localStorage.getItem('docusync_node_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('docusync_node_id', id);
    }
    setNodeId(id);
  }, []);

  return (
    <aside style={{
      width: 210,
      minWidth: 210,
      height: '100vh',
      background: 'var(--bg2)',
      borderRight: '1px solid var(--b1)',
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 0',
    }}>
      {/* Logo */}
      <div style={{ padding: '0 16px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, var(--acc), var(--pur))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, color: '#fff',
          }}>D</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>DocuSync</div>
            <div style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: 1, textTransform: 'uppercase' }}>Web Edition</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '0 8px' }}>
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href.split('/')[1] ? '/' + item.href.split('/')[1] : item.href));
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 8,
              marginBottom: 2, textDecoration: 'none',
              fontSize: 13, fontWeight: active ? 600 : 400,
              color: active ? 'var(--acc)' : 'var(--t2)',
              background: active ? 'var(--acb)' : 'transparent',
              border: active ? '1px solid var(--acbr)' : '1px solid transparent',
              transition: 'all 0.15s',
            }}>
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom node info */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--b1)',
        marginTop: 'auto',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 11, color: 'var(--t3)',
        }}>
          <Wifi size={12} style={{ color: 'var(--grn)' }} />
          <span>Web Node</span>
        </div>
        <div style={{
          fontSize: 10, color: 'var(--t3)',
          fontFamily: 'monospace', marginTop: 4,
          overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {nodeId.slice(0, 18)}...
        </div>
      </div>
    </aside>
  );
}
