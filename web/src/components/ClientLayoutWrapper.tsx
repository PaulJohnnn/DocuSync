'use client';
import { usePathname } from 'next/navigation';
import Navbar from './Navbar';
import Footer from './Footer';

// Auth pages that are fullscreen (no navbar / sidebar / footer)
const AUTH_ROUTES = ['/app/login', '/app/unlock', '/app/admin'];

export default function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAppRoute = pathname.startsWith('/app');
  const isWelcome = pathname === '/app/welcome';
  const isAuthRoute = AUTH_ROUTES.some(r => pathname.startsWith(r));

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

  // Protected app route — redirect to welcome/login if no session
  if (typeof window !== 'undefined') {
    const isDemo = window.location.search.includes('demo=true');
    const hasSeenWelcomeSession = sessionStorage.getItem('docusync_has_seen_welcome_session');
    if (!hasSeenWelcomeSession && !isDemo) {
      window.location.href = '/app/welcome';
      return null;
    }
  }

  return (
    <div className="app-layout" style={{ display: 'flex' }}>
      {children}
    </div>
  );
}
