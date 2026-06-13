'use client';
import Sidebar from './Sidebar';
import RightPanel from './RightPanel';

export default function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <main style={{
        flex: 1, overflow: 'auto',
        background: 'var(--bg)',
        padding: 24,
      }}>
        {children}
      </main>
      <RightPanel />
    </>
  );
}
