import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { initEngine, registerIPCHandlers, cleanupIPCHandlers } from './ipc-handlers';
import type { EngineServices } from './ipc-handlers';

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public');

let win: BrowserWindow | null;
let engineServices: EngineServices | null = null;

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - SystemJS vite plugin
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

/**
 * All IPC channels that the preload.ts bridge expects to exist.
 * If the engine fails to initialise, we register stub handlers for all
 * of these so the renderer never sees "No handler registered" errors.
 */
const ALL_IPC_CHANNELS = [
  'file:open', 'file:save', 'file:history', 'file:restore',
  'sync:status', 'sync:trigger',
  'conflict:list', 'conflict:detail', 'conflict:resolve',
  'peer:list', 'peer:connect',
] as const;

// Vault channels need special fallback handling because the UI hangs
// forever if vault:get-status never responds.
const VAULT_IPC_CHANNELS = [
  'vault:unlock', 'vault:lock', 'vault:genesis-init', 'vault:factory-reset',
  'network:get-lan-ip',
] as const;

/**
 * Registers fallback IPC handlers that return a structured error response.
 *
 * Called when the engine fails to initialise — prevents "No handler
 * registered for 'sync:status'" errors that crash the renderer.
 */
function registerFallbackIPCHandlers(): void {
  // Register generic fallbacks for engine channels
  for (const channel of ALL_IPC_CHANNELS) {
    try {
      ipcMain.handle(channel, async () => ({
        success: false,
        error: 'Engine not initialised. Please restart the application.',
      }));
    } catch {
      // Handler already registered — skip.
    }
  }

  // Register vault:get-status specially — it must return a valid shape
  // or the renderer will hang on "Loading Secure Vault..." forever.
  try {
    ipcMain.handle('vault:get-status', async () => ({
      success: true,
      data: { isRegistered: false, isUnlocked: false, nodeId: null },
      error: 'Engine startup failed — running in limited mode.',
    }));
  } catch {
    // Already registered (shouldn't happen if engine never started).
  }

  // Register remaining vault channels with error stubs
  for (const channel of VAULT_IPC_CHANNELS) {
    try {
      ipcMain.handle(channel, async () => ({
        success: false,
        error: 'Engine not initialised. Please restart the application.',
      }));
    } catch {
      // Handler already registered — skip.
    }
  }

  console.warn('[IPC] Fallback handlers registered (engine unavailable).');
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC!, 'favicon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(process.env.DIST!, 'index.html'));
  }
}

// ── Engine Initialisation ──────────────────────────────────────────────────
// Initialise the sync engine and register IPC handlers before the
// first window is created.
async function bootstrap(): Promise<void> {
  try {
    // Read config from environment or use defaults.
    const nodeCount = parseInt(process.env['DOCUSYNC_NODE_COUNT'] ?? '3', 10);
    const nodeIndex = parseInt(process.env['DOCUSYNC_NODE_INDEX'] ?? '0', 10);
    const wsPort = parseInt(process.env['DOCUSYNC_WS_PORT'] ?? '9000', 10);

    engineServices = await initEngine(nodeCount, nodeIndex, wsPort);
    registerIPCHandlers(engineServices);
    console.log('[Main] Engine initialised and IPC handlers registered.');
  } catch (err) {
    console.error('[Main] Failed to initialise engine:', err);
    // Engine failure is non-fatal — the app still opens, but sync
    // features will be unavailable. Register fallback handlers so
    // the renderer never sees "No handler registered" errors.
    registerFallbackIPCHandlers();
  }

  await createWindow();
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ── Graceful Shutdown ──────────────────────────────────────────────────────
app.on('before-quit', async () => {
  if (engineServices) {
    await cleanupIPCHandlers(engineServices);
    engineServices = null;
  }
});

app.whenReady().then(bootstrap);

