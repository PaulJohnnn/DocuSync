'use client';
import { usePathname } from 'next/navigation';
import Navbar from './Navbar';
import Footer from './Footer';

export default function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAppRoute = pathname.startsWith('/app');
  const isWelcome = pathname === '/app/welcome';

  if (!isAppRoute || isWelcome) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        {!isWelcome && <Navbar />}
        <div style={{ flex: 1 }}>{children}</div>
        {!isWelcome && <Footer />}
      </div>
    );
  }

  // App route (with Sidebar etc.)
  // Note: we check for welcome screen redirection
  if (typeof window !== 'undefined') {
    const isDemo = window.location.search.includes('demo=true');
    const hasSeenWelcome = localStorage.getItem('docusync_has_seen_welcome');
    if (!hasSeenWelcome && !isDemo) {
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
