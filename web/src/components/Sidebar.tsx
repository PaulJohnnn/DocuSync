'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FolderOpen, AlertTriangle, Clock, Users, Wifi, Settings
} from 'lucide-react';
import OnlineStatusPill from './OnlineStatusPill';

const NAV_ITEMS = [
  { href: '/app/files', label: 'Files', icon: FolderOpen },
  { href: '/app/conflicts', label: 'Conflicts', icon: AlertTriangle },
  { href: '/app/history/demo', label: 'History', icon: Clock },
  { href: '/app/peers', label: 'Peers', icon: Users },
  { href: '/app/settings', label: 'Settings', icon: Settings },
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--b1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/docusync-icon.png"
              width={20}
              height={20}
              alt="DocuSync logo"
              style={{ display: 'block', flexShrink: 0 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', lineHeight: 1.2 }}>DocuSync</div>
            <div style={{
              display: 'inline-block', marginTop: 3,
              background: 'var(--acb)', borderRadius: 20,
              padding: '2px 8px', fontSize: 10, color: 'var(--t2)',
            }}>
              Hybrid P2P Engine
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '0 8px' }}>
        {NAV_ITEMS.map(item => {
          const active = (item.href !== '/app/files' && pathname.startsWith(item.href.split('/demo')[0])) ||
            (item.href === '/app/files' && pathname === '/app/files');
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
        <div style={{ marginBottom: 12 }}>
          <OnlineStatusPill />
        </div>
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
