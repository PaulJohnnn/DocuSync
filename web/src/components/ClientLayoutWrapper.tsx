'use client';
import React from 'react';
import { usePathname } from 'next/navigation';
import Navbar from './Navbar';
import Footer from './Footer';
import mockAuthService from '@/lib/mockAuthService';

// Auth pages that are fullscreen (no navbar / sidebar / footer)
const AUTH_ROUTES = ['/app/login', '/app/admin'];

export default function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAppRoute = pathname.startsWith('/app');
  const isWelcome = pathname === '/app/welcome';
  const isAuthRoute = AUTH_ROUTES.some(r => pathname.startsWith(r));

  const [mounted, setMounted] = React.useState(false);
  
  React.useEffect(() => {
    setMounted(true);
    if (isAppRoute && !isAuthRoute && !isWelcome) {
      const isDemo = typeof window !== 'undefined' && window.location.search.includes('demo=true');
      const user = mockAuthService.getCurrentUser();
      const hasSeenWelcomeSession = typeof window !== 'undefined' ? sessionStorage.getItem('docusync_has_seen_welcome_session') : false;
      if (!hasSeenWelcomeSession && !isDemo && !user && typeof window !== 'undefined') {
        window.location.href = '/app/welcome';
      }
    }
  }, [isAppRoute, isAuthRoute, isWelcome]);

  // Auth & welcome pages render fullscreen — no chrome
  if (isAuthRoute || isWelcome) {
    return <>{children}</>;
  }

  // Public (landing, download, etc.) — show navbar + footer
  if (!isAppRoute) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <Navbar />
        <div style={{ flex: 1 }}>{children}</div>
        <Footer />
      </div>
    );
  }

  if (!mounted) {
    return <div style={{ height: '100vh', background: 'var(--bg)' }} />;
  }

  return (
    <div className="app-layout" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {children}
    </div>
  );
}
