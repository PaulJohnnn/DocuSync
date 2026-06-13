/**
 * @module App
 * Root React component for DocuSync Electron renderer.
 * Layout: TitleBar → Sidebar | Main Content | RightPanel
 */
import React, { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/context/ThemeContext';
import { ElectronSyncProvider } from '@/context/ElectronSyncContext';
import { Toaster } from 'sonner';
import TitleBar from '@/components/TitleBar';
import Sidebar from '@/components/Sidebar';
import RightPanel from '@/components/RightPanel';

// ── Lazy-loaded pages ─────────────────────────────────────────────────────
const FilesPage     = lazy(() => import('@/pages/FilesPage'));
const EditorPage    = lazy(() => import('@/pages/EditorPage'));
const ConflictsPage = lazy(() => import('@/pages/ConflictsPage'));
const HistoryPage   = lazy(() => import('@/pages/HistoryPage'));
const PeersPage     = lazy(() => import('@/pages/PeersPage'));

/** Loading skeleton shown during lazy chunk loading. */
const PageLoader: React.FC = () => (
  <div style={{
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--ds-text3)', fontSize: '0.82rem', gap: '0.5rem',
  }}>
    <span className="ds-pulse">⏳</span> Loading…
  </div>
);

/** The persistent application shell. */
const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="ds-layout">
    <TitleBar />
    <div className="ds-body">
      <Sidebar />
      <div className="ds-main">
        <Suspense fallback={<PageLoader />}>
          {children}
        </Suspense>
      </div>
      <RightPanel />
    </div>
  </div>
);

/** Root component. */
const App: React.FC = () => (
  <ThemeProvider>
    <ElectronSyncProvider>
      <HashRouter>
        <AppShell>
          <Routes>
            <Route path="/"             element={<FilesPage />} />
            <Route path="/editor/:id"   element={<EditorPage />} />
            <Route path="/conflicts"    element={<ConflictsPage />} />
            <Route path="/history/:id"  element={<HistoryPage />} />
            <Route path="/peers"        element={<PeersPage />} />
          </Routes>
        </AppShell>
      </HashRouter>
      <Toaster
        id="app-toaster"
        position="bottom-right"
        theme="dark"
        richColors
        closeButton
        toastOptions={{
          style: {
            background: 'var(--ds-surface)',
            border: '1px solid var(--ds-border)',
            color: 'var(--ds-text)',
            fontSize: '0.82rem',
          },
        }}
      />
    </ElectronSyncProvider>
  </ThemeProvider>
);

export default App;
