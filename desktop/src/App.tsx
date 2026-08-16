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
import { ShieldAlert, Check, X } from 'lucide-react';
import { useElectronSync } from '@/context/ElectronSyncContext';
import mockAuthService, { getDisplayName } from '@/services/mockAuthService';

/** Component to ping the Next.js matchmaker with heartbeat */
const GlobalHeartbeat: React.FC = () => {
  const { localNodeId, isAdmin } = useElectronSync();

  useEffect(() => {
    if (!localNodeId || isAdmin) return; // Admins don't need to heartbeat

    const pingHeartbeat = async () => {
      const _base = import.meta.env.VITE_WEB_URL || 'http://localhost:3000';
      try {
        await fetch(`${_base}/api/lobby/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodeId: localNodeId })
        });
      } catch (err) {
        // ignore errors if server is down
      }
    };

    pingHeartbeat();
    const interval = setInterval(pingHeartbeat, 30000); // every 30 seconds
    return () => clearInterval(interval);
  }, [localNodeId, isAdmin]);

  return null;
};

/** Modal that listens for auth:verify-request and prompts the user */
const GlobalVerifyModal: React.FC = () => {
  const [request, setRequest] = useState<{ reqId: string; nodeId: string } | null>(null);

  useEffect(() => {
    if (!window.docuSync) return;
    const unsub = window.docuSync.onVerifyRequest((reqId, nodeId) => {
      setRequest({ reqId, nodeId });
    });
    return unsub;
  }, []);

  if (!request) return null;

  const handleRespond = async (allow: boolean) => {
    if (window.docuSync) {
      await window.docuSync.respondToVerifyRequest(request.reqId, allow);
    }
    setRequest(null);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--ds-surface)', border: '1px solid var(--ds-border)',
        borderRadius: '8px', padding: '1.5rem', width: '380px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', color: '#f5a623' }}>
          <ShieldAlert size={24} />
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--ds-text)' }}>⚠️ New Login Attempt</h2>
        </div>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--ds-text2)', lineHeight: 1.5 }}>
          Someone is trying to access your DocuSync account from a new device.
        </p>
        <div style={{
          background: 'var(--ds-bg)', padding: '0.75rem', borderRadius: '4px',
          marginBottom: '1.5rem', fontSize: '0.8rem', color: 'var(--ds-text3)',
          fontFamily: 'monospace'
        }}>
          <div>Node: {request.nodeId}</div>
          <div>Time: Just now</div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => handleRespond(true)}
            style={{
              flex: 1, padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              background: 'var(--ds-bg)', border: '1px solid var(--ds-border)', color: 'var(--ds-text)',
              borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem'
            }}
          >
            <Check size={16} /> Yes, that's me
          </button>
          <button
            onClick={() => handleRespond(false)}
            style={{
              flex: 1, padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              background: '#e04343', border: 'none', color: '#fff',
              borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem'
            }}
          >
            <X size={16} /> Block this
          </button>
        </div>
      </div>
    </div>
  );
};


// ── Lazy-loaded pages ─────────────────────────────────────────────────────
const FilesPage     = lazy(() => import('@/pages/FilesPage'));
const EditorPage    = lazy(() => import('@/pages/EditorPage'));
const ConflictsPage = lazy(() => import('@/pages/ConflictsPage'));
const HistoryPage   = lazy(() => import('@/pages/HistoryPage'));
const PeersPage     = lazy(() => import('@/pages/PeersPage'));
const SettingsPage  = lazy(() => import('@/pages/SettingsPage'));
const AdminPage     = lazy(() => import('@/pages/AdminPage'));
const MetricsPage   = lazy(() => import('@/pages/MetricsPage'));
const VaultLoginPage = lazy(() => import('@/pages/VaultLoginPage'));
const WelcomePage    = lazy(() => import('@/pages/WelcomePage'));

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
        // Replace real vault status check with centralized mock API check
        const user = mockAuthService.getCurrentUser();
        if (user) {
          if (window.docuSync?.setDisplayName) {
            window.docuSync.setDisplayName(getDisplayName(user));
          }
          setIsUnlocked(true);
        } else {
          navigate('/vault-login');
        }
      } catch (err) {
        console.error('Failed to check auth status', err);
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
          if (window.docuSync) {
            await window.docuSync.lockVault();
          }
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
      <GlobalVerifyModal />
      <GlobalHeartbeat />
      <HashRouter>
        <Routes>
          <Route path="/vault-login" element={
            <Suspense fallback={<PageLoader />}>
              <VaultLoginPage />
            </Suspense>
          } />
          <Route path="/welcome" element={
            <Suspense fallback={<PageLoader />}>
              <WelcomePage />
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
                  <Route path="/admin"        element={<AdminPage />} />
                </Routes>
              </AppShell>
            </AuthGuard>
          } />
        </Routes>
      </HashRouter>
      <GlobalVerifyModal />
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
