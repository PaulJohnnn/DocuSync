'use client';
import Sidebar from './Sidebar';
import RightPanel from './RightPanel';
import OfflineBanner from './OfflineBanner';
export default function PageShell({ children }: { children: React.ReactNode; title?: string }) {
  return (
    <>
      <Sidebar />
      <main style={{
        flex: 1, overflow: 'auto',
        background: 'var(--bg)',
        display: 'flex', flexDirection: 'column'
      }}>
        <OfflineBanner />
        <div style={{ flex: 1, padding: 24 }}>
          {children}
        </div>
      </main>
      <RightPanel />
    </>
  );
}
