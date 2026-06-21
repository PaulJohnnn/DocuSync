/**
 * @module App
 * Root React component for DocuSync Electron renderer.
 * Layout: TitleBar → Sidebar | Main Content | RightPanel
 */
import React, { Suspense, lazy, useState, useEffect } from 'react';
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom';
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
const MetricsPage   = lazy(() => import('@/pages/MetricsPage'));
const SettingsPage  = lazy(() => import('@/pages/SettingsPage'));
const VaultLoginPage = lazy(() => import('@/pages/VaultLoginPage'));

/** Loading skeleton shown during lazy chunk loading. */
const PageLoader: React.FC = () => (
  <div style={{
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--ds-text3)', fontSize: '0.82rem', gap: '0.5rem',
  }}>
    <span className="ds-pulse">⏳</span> Loading…
  </div>
);

/** AuthGuard wrapper to protect routes */
const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isUnlocked, setIsUnlocked] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function checkVault() {
      try {
        const res = await window.docuSync.getVaultStatus();
        if (res.success && res.data) {
          if (!res.data.isUnlocked) {
            navigate('/vault-login');
          } else {
            setIsUnlocked(true);
          }
        }
      } catch (err) {
        console.error('Failed to check vault status', err);
        navigate('/vault-login');
      }
    }
    checkVault();
  }, [navigate]);

  // ── Auto-Lock on Inactivity ──
  useEffect(() => {
    // Only run inactivity timer if the vault is unlocked
    if (!isUnlocked) return;

    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      // 10 minutes = 600,000 ms
      timeoutId = setTimeout(async () => {
        try {
          await window.docuSync.lockVault();
          navigate('/vault-login');
        } catch (err) {
          console.error('Failed to auto-lock vault:', err);
        }
      }, 600000);
    };

    // Initialize the timer
    resetTimer();

    // Debounce listener to avoid thrashing
    let throttleTimeout: NodeJS.Timeout | null = null;
    const handleActivity = () => {
      if (throttleTimeout) return;
      throttleTimeout = setTimeout(() => {
        resetTimer();
        throttleTimeout = null;
      }, 1000); // 1-second throttle
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('scroll', handleActivity);

    return () => {
      clearTimeout(timeoutId);
      if (throttleTimeout) clearTimeout(throttleTimeout);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('scroll', handleActivity);
    };
  }, [isUnlocked, navigate]);

  if (isUnlocked === null) {
    return <PageLoader />;
  }

  return <>{children}</>;
};

/** The persistent application shell. */
const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  
  return (
    <div className="ds-layout">
      <TitleBar 
        isRightPanelOpen={isRightPanelOpen} 
        onToggleRightPanel={() => setIsRightPanelOpen(!isRightPanelOpen)} 
      />
      <div className="ds-body">
        <Sidebar />
        <div className="ds-main">
          <Suspense fallback={<PageLoader />}>
            {children}
          </Suspense>
        </div>
        {isRightPanelOpen && <RightPanel />}
      </div>
    </div>
  );
};

/** Root component. */
const App: React.FC = () => (
  <ThemeProvider>
    <ElectronSyncProvider>
      <HashRouter>
        <Routes>
          <Route path="/vault-login" element={
            <Suspense fallback={<PageLoader />}>
              <VaultLoginPage />
            </Suspense>
          } />
          
          <Route path="/*" element={
            <AuthGuard>
              <AppShell>
                <Routes>
                  <Route path="/"             element={<FilesPage />} />
                  <Route path="/editor/:id"   element={<EditorPage />} />
                  <Route path="/conflicts"    element={<ConflictsPage />} />
                  <Route path="/history/:id"  element={<HistoryPage />} />
                  <Route path="/peers"        element={<PeersPage />} />
                  <Route path="/metrics"      element={<MetricsPage />} />
                  <Route path="/settings"     element={<SettingsPage />} />
                </Routes>
              </AppShell>
            </AuthGuard>
          } />
        </Routes>
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
