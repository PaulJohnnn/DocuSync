'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FolderOpen, Users, Wifi, Settings, BarChart2
} from 'lucide-react';
import { uGet, uSet } from '@/lib/userStorage';
import OnlineStatusPill from './OnlineStatusPill';

const NAV_ITEMS = [
  { href: '/app/files', label: 'Recent Room', icon: FolderOpen },
  { href: '/app/peers', label: 'Sync Rooms', icon: Users },
  { href: '/app/metrics', label: 'Metrics', icon: BarChart2 },
  { href: '/app/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [nodeId, setNodeId] = useState('');
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{ top: number; left: number; width: number; height: number; ready: boolean }>({
    top: 0, left: 0, width: 0, height: 0, ready: false,
  });

  useEffect(() => {
    let id = uGet('node_id');
    if (!id) {
      id = `web-${Math.random().toString(36).substring(2, 9)}-${Date.now()}`;
      uSet('node_id', id);
    }
    setNodeId(id);
  }, []);

  // Slide a highlight behind the active nav item instead of just swapping
  // its background instantly — measures the real active link's rect so it
  // works whether the nav is laid out as a vertical rail (desktop) or a
  // horizontal bottom tab bar (mobile, see the 768px breakpoint in
  // globals.css), without needing separate logic for each orientation.
  useLayoutEffect(() => {
    const reposition = () => {
      const nav = navRef.current;
      const activeEl = nav?.querySelector('.ds-sidebar-link.active') as HTMLElement | null;
      if (nav && activeEl) {
        const navRect = nav.getBoundingClientRect();
        const elRect = activeEl.getBoundingClientRect();
        setIndicator({
          top: elRect.top - navRect.top,
          left: elRect.left - navRect.left,
          width: elRect.width,
          height: elRect.height,
          ready: true,
        });
      }
    };
    reposition();
    window.addEventListener('resize', reposition);
    return () => window.removeEventListener('resize', reposition);
  }, [pathname]);

  return (
    <aside className="ds-sidebar" style={{
      width: 210,
      minWidth: 210,
      height: '100vh',
      background: 'var(--bg2)',
      borderRight: '1px solid var(--b1)',
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 0',
    }}>
      {/* Logo — hidden on mobile, where the sidebar becomes a bottom tab bar */}
      <div className="ds-sidebar-logo" style={{ padding: '0 16px', marginBottom: 24 }}>
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

      {/* Navigation — becomes a horizontal bottom tab bar on mobile */}
      <nav ref={navRef} className="ds-sidebar-nav" style={{ flex: 1, padding: '0 8px', position: 'relative' }}>
        {/* Slides to the active item's real position/size instead of the
            highlight just popping in — see the useLayoutEffect above. */}
        <div className="ds-sidebar-indicator" style={{
          top: indicator.top, left: indicator.left, width: indicator.width, height: indicator.height,
          opacity: indicator.ready ? 1 : 0,
        }} />
        {NAV_ITEMS.map(item => {
          const active = (item.href !== '/app/files' && pathname.startsWith(item.href.split('/demo')[0])) ||
            (item.href === '/app/files' && pathname === '/app/files');
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={`ds-sidebar-link${active ? ' active' : ''}`} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 8,
              marginBottom: 2, textDecoration: 'none',
              fontSize: 13, fontWeight: active ? 600 : 400,
              color: active ? 'var(--acc)' : 'var(--t2)',
              transition: 'color 0.15s, font-weight 0.15s',
            }}>
              <Icon size={16} />
              <span className="ds-sidebar-link-label" style={{ flex: 1 }}>{item.label}</span>
            </Link>
          );
        })}
      </nav>



      {/* Bottom node info — hidden on mobile, no room in a tab bar */}
      <div className="ds-sidebar-footer" style={{
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
