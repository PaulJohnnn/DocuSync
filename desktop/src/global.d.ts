/**
 * @file global.d.ts
 *
 * Global ambient type declarations for the DocuSync renderer.
 *
 * This file is automatically included by TypeScript (via `tsconfig.json`
 * `"include": ["src/**\/*.ts"]`) and requires no explicit import.
 *
 * It augments the browser `Window` interface with the `docuSync` property
 * injected by `electron/preload.ts` via `contextBridge.exposeInMainWorld`.
 *
 * **Why a separate file instead of importing from preload.ts?**
 * The preload script runs in a privileged Node.js context. Importing it in
 * the renderer would pull in Electron runtime types and potentially
 * node_modules that are not available in the sandboxed renderer process.
 * Redeclaring only the public surface here keeps the renderer fully isolated.
 */

/// <reference types="vite/client" />

// ── Re-export preload interface types for use in renderer pages ──────────────
// We import these as *types only* — no runtime code crosses the boundary.

import type {
  DocuSyncBridge,
  IPCResponse,
  ConflictDetectedPayload,
  SyncStatusChangedPayload,
} from '../electron/preload';

// ── Window augmentation ───────────────────────────────────────────────────────

declare global {
  interface Window {
    /**
     * The DocuSync secure IPC bridge, injected by `electron/preload.ts`
     * via `contextBridge.exposeInMainWorld('docuSync', ...)`.
     *
     * Available only inside Electron. In plain browser dev mode this will
     * be `undefined` — all usages should guard with `if (!window.docuSync)`.
     *
     * @see {@link DocuSyncBridge} for the full method list.
     */
    docuSync: DocuSyncBridge;
  }
}

// Re-export types so pages can import them from '@/global' if needed.
export type {
  DocuSyncBridge,
  IPCResponse,
  ConflictDetectedPayload,
  SyncStatusChangedPayload,
};
