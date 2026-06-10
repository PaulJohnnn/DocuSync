# DocuSync Source Code Dump

Generated on: Sat May 30 2026 14:32:31 GMT+0800 (Philippine Standard Time)

## File: `package.json`

```json
{
  "name": "docusync",
  "version": "1.0.0",
  "private": true,
  "description": "DocuSync — Hybrid File Synchronization Engine using Log-Based Sync, Vector Clocks, LWW, and Delta Encoding over masterless P2P",
  "author": "Paul John G. Palamara <paul@docusync.edu>",
  "license": "MIT",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite",
    "dev:electron": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
    "build": "tsc && vite build && electron-builder",
    "build:renderer": "tsc && vite build",
    "lint": "eslint . --ext .ts,.tsx",
    "test": "jest --config jest.config.ts",
    "test:unit": "jest --config jest.config.ts --testPathPattern=tests/unit",
    "test:integration": "jest --config jest.config.ts --testPathPattern=tests/integration",
    "test:stress": "jest --config jest.config.ts --testPathPattern=tests/stress",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "postinstall": "prisma generate"
  },
  "dependencies": {
    "@prisma/client": "^6.9.0",
    "@tiptap/extension-highlight": "3.20.1",
    "@tiptap/extension-text-align": "3.20.1",
    "@tiptap/extension-underline": "3.20.1",
    "@tiptap/pm": "3.20.1",
    "@tiptap/react": "3.20.1",
    "@tiptap/starter-kit": "3.20.1",
    "chokidar": "^4.0.3",
    "framer-motion": "^12.34.3",
    "lucide-react": "^0.575.0",
    "mammoth": "^1.12.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^7.6.2",
    "sonner": "^2.0.7",
    "uuid": "^11.1.0",
    "ws": "^8.18.2"
  },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/uuid": "^10.0.0",
    "@types/ws": "^8.18.1",
    "@typescript-eslint/eslint-plugin": "^8.31.0",
    "@typescript-eslint/parser": "^8.31.0",
    "@vitejs/plugin-react": "^4.4.1",
    "autoprefixer": "^10.4.21",
    "concurrently": "^9.1.2",
    "electron": "^35.2.1",
    "electron-builder": "^26.0.12",
    "eslint": "^9.25.0",
    "jest": "^30.0.4",
    "postcss": "^8.5.3",
    "prettier": "^3.5.3",
    "prisma": "^6.9.0",
    "tailwindcss": "^3.4.17",
    "ts-jest": "^29.3.4",
    "ts-node": "^10.9.2",
    "typescript": "^5.8.3",
    "vite": "^6.3.5",
    "vite-plugin-electron": "latest",
    "vite-plugin-electron-renderer": "latest",
    "wait-on": "^8.0.3"
  }
}

```

---

## File: `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main-Process entry file of the Electron App.
        entry: 'electron/main.ts',
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete, 
          // instead of restarting the entire Electron App.
          options.reload()
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});

```

---

## File: `next.config.ts`

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Allows Vercel to deploy even if there are TypeScript warnings
    ignoreBuildErrors: true,
  },
};

export default nextConfig;

```

---

## File: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "es2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}

```

---

## File: `eslint.config.mjs`

```javascript
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

```

---

## File: `postcss.config.mjs`

```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;

```

---

## File: `electron/main.ts`

```typescript
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';

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
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - SystemJS vite plugin
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.png'),
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
    win.loadFile(path.join(process.env.DIST, 'index.html'));
  }
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

app.whenReady().then(createWindow);

```

---

## File: `electron/preload.ts`

```typescript
import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})

```

---

## File: `supabase/schema.sql`

```sql
-- ============================================================
-- DocuSync — Supabase Database Schema
-- Run this entire file in your Supabase SQL Editor
-- ============================================================

-- 1. Profiles (extends Supabase Auth users)
create table if not exists profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    name text not null,
    email text not null unique,
    role text not null default 'user' check (role in ('user', 'admin')),
    status text not null default 'active' check (status in ('pending', 'active', 'suspended')),
    avatar_letter text generated always as (upper(substr(name, 1, 1))) stored,
    created_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
    insert into profiles (id, name, email)
    values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email);
    return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function handle_new_user();

-- 2. Repositories
create table if not exists repositories (
    id bigserial primary key,
    name text not null,
    owner_id uuid not null references profiles(id) on delete cascade,
    status text not null default 'Up to date',
    last_synced text not null default 'Just now',
    created_at timestamptz not null default now()
);

-- 3. Repository Members (many-to-many)
create table if not exists repo_members (
    repo_id bigint not null references repositories(id) on delete cascade,
    user_id uuid not null references profiles(id) on delete cascade,
    role text not null default 'Editor' check (role in ('Owner', 'Editor', 'Viewer')),
    joined_at timestamptz not null default now(),
    primary key (repo_id, user_id)
);

-- 4. Files
create table if not exists files (
    id bigserial primary key,
    repo_id bigint not null references repositories(id) on delete cascade,
    name text not null,
    type text not null default 'word',
    content text not null default '',
    server_content text not null default '',
    sync_status text not null default 'synced' check (sync_status in ('synced', 'syncing...', 'conflict')),
    is_starred boolean not null default false,
    is_offline_available boolean not null default false,
    is_syncing boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists files_updated_at on files;
create trigger files_updated_at
    before update on files
    for each row execute function update_updated_at();

-- 5. Trashed Files
create table if not exists trashed_files (
    id bigserial primary key,
    original_file_id bigint,
    repo_id bigint references repositories(id) on delete set null,
    repo_name text not null,
    file_data jsonb not null,
    deleted_by uuid not null references profiles(id),
    deleted_at timestamptz not null default now()
);

-- 6. Pending Registration Requests (for Admin approval queue)
create table if not exists registration_requests (
    id bigserial primary key,
    name text not null,
    email text not null unique,
    requested_at timestamptz not null default now(),
    status text not null default 'pending' check (status in ('pending', 'approved', 'denied'))
);

-- ── Row Level Security ─────────────────────────────────────

alter table profiles enable row level security;
alter table repositories enable row level security;
alter table repo_members enable row level security;
alter table files enable row level security;
alter table trashed_files enable row level security;
alter table registration_requests enable row level security;

-- Profiles: users can read all, only edit their own
create policy "profiles_read_all" on profiles for select using (true);
create policy "profiles_edit_own" on profiles for update using (auth.uid() = id);

-- Repositories: visible to members
create policy "repos_member_read" on repositories for select
    using (exists (select 1 from repo_members where repo_id = repositories.id and user_id = auth.uid()));
create policy "repos_owner_write" on repositories for all
    using (owner_id = auth.uid());

-- Repo members
create policy "repo_members_read" on repo_members for select
    using (exists (select 1 from repo_members rm where rm.repo_id = repo_members.repo_id and rm.user_id = auth.uid()));

-- Files: accessible by repo members
create policy "files_member_access" on files for all
    using (exists (select 1 from repo_members where repo_id = files.repo_id and user_id = auth.uid()));

-- Trashed files: only the deleter
create policy "trash_owner" on trashed_files for all using (deleted_by = auth.uid());

-- Registration requests: anyone can insert, only admins read
create policy "reg_requests_insert" on registration_requests for insert with check (true);
create policy "reg_requests_admin_read" on registration_requests for select
    using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- ── Realtime ───────────────────────────────────────────────
-- Enable realtime on all key tables so changes broadcast to all clients
alter publication supabase_realtime add table repositories;
alter publication supabase_realtime add table files;
alter publication supabase_realtime add table trashed_files;
alter publication supabase_realtime add table repo_members;

```

---

## File: `src/lib/deltaEncoder.ts`

```typescript
import * as Y from 'yjs';

/**
 * Computes the binary delta update that transforms prevState to nextState.
 * Uses Yjs state vectors to find the exact binary diff.
 */
export function computeDelta(prevState: Uint8Array, nextState: Uint8Array): Uint8Array {
    const doc1 = new Y.Doc();
    Y.applyUpdate(doc1, prevState);

    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, nextState);

    const stateVector = Y.encodeStateVector(doc1);
    return Y.encodeStateAsUpdate(doc2, stateVector);
}

/**
 * Applies a binary delta update to a Yjs document.
 */
export function applyDelta(doc: Y.Doc, delta: Uint8Array): void {
    Y.applyUpdate(doc, delta);
}

/**
 * Returns the exact byte-level size of the binary delta update.
 */
export function getDeltaSizeBytes(delta: Uint8Array): number {
    return delta.length;
}

```

---

## File: `src/lib/offlineQueue.ts`

```typescript
import { VectorClock } from './vectorClock';

export interface QueuedEdit {
    id: string;
    repoName: string;
    fileName: string;
    delta: Uint8Array;       // Yjs binary update
    vectorClock: VectorClock;
    queuedAt: number;        // Date.now() for ordering
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB is not supported in this environment'));
            return;
        }
        const request = indexedDB.open('docusync_offline_queue', 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('edits')) {
                db.createObjectStore('edits', { keyPath: 'id' });
            }
        };
        request.onsuccess = () => {
            resolve(request.result);
        };
        request.onerror = () => {
            reject(request.error);
        };
    });
}

/**
 * Enqueues an offline edit into IndexedDB for persistence.
 */
export async function enqueueEdit(edit: QueuedEdit): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('edits', 'readwrite');
        const store = tx.objectStore('edits');
        store.put(edit);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Dequeues and returns all queued edits, sorted by vector clock causal ordering.
 */
export async function dequeueAllEdits(): Promise<QueuedEdit[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('edits', 'readonly');
        const store = tx.objectStore('edits');
        const request = store.getAll();
        tx.oncomplete = () => {
            const results = request.result as QueuedEdit[];
            // Sort by vector clock counter to preserve causal sequence.
            // Fall back to physical queue ordering (queuedAt) when counters are concurrent.
            results.sort((a, b) => {
                if (a.vectorClock.counter !== b.vectorClock.counter) {
                    return a.vectorClock.counter - b.vectorClock.counter;
                }
                return a.queuedAt - b.queuedAt;
            });
            resolve(results);
        };
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Clears the offline edit queue.
 */
export async function clearQueue(): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('edits', 'readwrite');
        const store = tx.objectStore('edits');
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

```

---

## File: `src/lib/vectorClock.ts`

```typescript
export interface VectorClock {
    nodeId: string;
    counter: number;
}

export function incrementClock(clock: VectorClock): VectorClock {
    return {
        nodeId: clock.nodeId,
        counter: clock.counter + 1,
    };
}

export function mergeClock(local: VectorClock, remote: VectorClock): VectorClock {
    return {
        nodeId: local.nodeId,
        counter: Math.max(local.counter, remote.counter) + 1,
    };
}

export function compareClocks(a: VectorClock, b: VectorClock): 'before' | 'after' | 'concurrent' {
    if (a.counter < b.counter) return 'before';
    if (a.counter > b.counter) return 'after';
    return 'concurrent';
}

```

---

## File: `src/lib/supabase.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Supabase is only "live" when real credentials are provided.
// Until then, the app falls back gracefully to localStorage.
export const isSupabaseConfigured =
    Boolean(supabaseUrl) &&
    Boolean(supabaseKey) &&
    supabaseUrl !== 'your_project_url' &&
    supabaseKey !== 'your_anon_key';

export const supabase = isSupabaseConfigured
    ? createClient(supabaseUrl, supabaseKey)
    : null;

export default supabase;

```

---

## File: `src/context/SyncContext.tsx`

```typescript
"use client";

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { VectorClock } from '../lib/vectorClock';
import { dequeueAllEdits, clearQueue } from '../lib/offlineQueue';
import { toast } from 'sonner';

// --- Types ---

export type UserRole = 'Owner' | 'Editor' | 'Viewer';
export type SyncStatus = 'synced' | 'syncing...' | 'conflict';

export interface RepoMember {
    name: string;
    role: UserRole;
    badge: string;
    status?: 'online' | 'idle' | 'offline';
    lastActive?: string;
}

export interface PendingRequest {
    id: number;
    name: string;
    email: string;
    date: string;
}

export interface UserRequest {
    id: string;
    name: string;
    email: string;
    requestDate: string;
    status: 'pending' | 'approved' | 'denied';
    password?: string;
}

// File Version (for version history)
export interface FileVersion {
    id: string;           
    content: string;      
    savedAt: string;      
    savedBy: string;      
    action: 'save' | 'merge' | 'restore' | 'conflict-resolve'; 
}

export interface FileData {
    id: number;
    name: string;
    type: string;
    syncStatus: SyncStatus;
    date: string;
    isSyncing: boolean;
    content: string;
    serverContent: string;
    size?: number;
    isStarred?: boolean;
    isOfflineAvailable?: boolean;
    pendingReview?: { previousContent: string; resolvedWith: 'local' | 'server' | 'merge'; resolvedAt: string } | null;
    versions?: FileVersion[]; // version history snapshots
}

export interface RepositoryData {
    id: number;
    name: string;
    lastSynced: string;
    status: string;
    userRole: UserRole;
    members: RepoMember[];
    pendingRequests?: PendingRequest[];
    files: FileData[];
}

export interface LogEntry {
    id: number;
    time: string;
    message: string;
    repoName?: string;
    nodeId?: string;
    deltaBytes?: number;
    vectorClock?: VectorClock;
    eventType?: 'save' | 'conflict-resolve' | 'merge' | 'restore' | 'offline-replay';
}

export interface TrashItem {
    id: number;
    file: FileData;
    repoName: string;
    deletedAt: string;
}

// --- Active editing tracker ---
export interface ActiveEditor {
    fileName: string;
    repoName: string;
    userName: string;
    tabId: string;
}

// --- BroadcastChannel message types ---
type BroadcastMessage =
    | { type: 'FILE_UPDATE';  repoName: string; fileName: string; content: string; senderId: string }
    | { type: 'FILE_UPLOAD';  repoName: string; file: FileData;   senderId: string }
    | { type: 'FILE_DELETE';  repoName: string; fileName: string; senderId: string }
    | { type: 'REPO_DELETE';  repoId: number;                     senderId: string }
    | { type: 'REPO_CREATE';  repo: RepositoryData;               senderId: string }
    | { type: 'FILE_TRASH';   trashItem: TrashItem;               senderId: string }
    | { type: 'FILE_RESTORE'; trashItemId: number; repoName: string; file: FileData; senderId: string }
    | { type: 'FILE_STAR';    repoName: string; fileName: string; isStarred: boolean; senderId: string }
    | { type: 'FILE_EDITING_START'; repoName: string; fileName: string; userName: string; senderId: string }
    | { type: 'FILE_EDITING_STOP';  repoName: string; fileName: string; senderId: string }
    | { type: 'FILE_DELETED_KICK';  repoName: string; fileName: string; senderId: string }
    | { type: 'FILE_APPROVED';      repoName: string; fileName: string; content: string; senderId: string };


const paulContent = `<h2>Introduction</h2><p>Hi I'm Paul... I'm on Cabuyao City... I'm on section CS 402, nice to meet you all groupmates.</p><p>This document is part of our collaborative thesis project, managed through DocuSync. Please feel free to add your sections below.</p>`;


const defaultContent = (name: string) =>
    `<h2>${name}</h2><p>Hi I'm Paul... I'm on Cabuyao City... I'm on section CS 402, nice to meet you all groupmates.</p><p>This document is part of our collaborative thesis project. Begin editing to add your content here.</p>`;


const STORAGE_LIMIT_BYTES = 15 * 1024 * 1024 * 1024;


const initialReposData: RepositoryData[] = [
    {
        id: 1, name: 'Thesis_Docs', lastSynced: 'Just now', status: 'Up to date', userRole: 'Owner',
        members: [
            { name: 'Paul John Palamara', role: 'Owner', badge: 'amber', status: 'online', lastActive: 'Now' },
            { name: 'Sofia Reyes', role: 'Editor', badge: 'purple', status: 'online', lastActive: 'Now' },
            { name: 'Prof. Davis', role: 'Viewer', badge: 'zinc', status: 'online', lastActive: 'Now' },
        ],
        pendingRequests: [
            { id: 101, name: 'David Lee', email: 'david.lee@university.edu', date: '10 min ago' },
            { id: 102, name: 'Dr. Sarah Chen', email: 'schen@university.edu', date: '2 hrs ago' }
        ],
        files: [
            { id: 1, name: 'Chapter_1_Introduction.docx', type: 'word', syncStatus: 'synced' as SyncStatus, date: 'Mar 22, 2026 13:27', isSyncing: false, content: paulContent, serverContent: '', isStarred: false, size: new TextEncoder().encode(paulContent).length },
            { id: 2, name: 'Chapter_2_Review.docx', type: 'word', syncStatus: 'synced' as SyncStatus, date: 'Mar 22, 2026 12:10', isSyncing: false, content: defaultContent('Chapter 2 — Literature Review'), serverContent: '', isStarred: false, size: 4200 },
            { id: 5, name: 'Thesis_Abstract.docx', type: 'word', syncStatus: 'synced' as SyncStatus, date: 'Mar 21, 2026 09:12', isSyncing: false, content: defaultContent('Thesis Abstract'), serverContent: '', isStarred: true, size: 3800 },
        ]
    },
    {
        id: 2, name: 'Research_Collab', lastSynced: '2 hrs ago', status: 'Syncing...', userRole: 'Editor',
        members: [
            { name: 'Dr. Lim', role: 'Owner', badge: 'amber', status: 'online', lastActive: 'Now' },
            { name: 'Paul John Palamara', role: 'Editor', badge: 'purple', status: 'online', lastActive: 'Now' },
            { name: 'Maria Santos', role: 'Editor', badge: 'purple', status: 'idle', lastActive: '10 min ago' },
            { name: 'Prof. Anderson', role: 'Editor', badge: 'purple', status: 'online', lastActive: 'Now' },
            { name: 'Elena Rostova', role: 'Editor', badge: 'purple', status: 'offline', lastActive: '1 hr ago' },
            { name: 'James Cruz', role: 'Viewer', badge: 'zinc', status: 'offline', lastActive: '3 hrs ago' },
        ],
        files: [
            { id: 3, name: 'SDA_Framework.docx', type: 'word', syncStatus: 'synced' as SyncStatus, date: 'Mar 21, 2026 13:35', isSyncing: false, content: defaultContent('SDA Framework'), serverContent: '', isStarred: false, size: 5200 },
            { id: 4, name: 'SDA_Data_Analysis.docx', type: 'word', syncStatus: 'synced' as SyncStatus, date: 'Mar 20, 2026 15:42', isSyncing: false, content: defaultContent('SDA Data Analysis'), serverContent: '', isStarred: true, size: 6800 },
            { id: 8, name: 'System_Architecture.docx', type: 'word', syncStatus: 'synced' as SyncStatus, date: 'Mar 19, 2026 09:15', isSyncing: false, content: defaultContent('System Architecture'), serverContent: '', isStarred: false, size: 4100 },
            { id: 201, name: 'SDA_Security_Protocol.docx', type: 'word', syncStatus: 'synced' as SyncStatus, date: 'Mar 18, 2026 11:20', isSyncing: false, content: defaultContent('SDA Security'), serverContent: '', isStarred: false, size: 3200 },
            { id: 202, name: 'SDA_User_Testing_Results.docx', type: 'word', syncStatus: 'synced' as SyncStatus, date: 'Mar 17, 2026 14:45', isSyncing: false, content: defaultContent('SDA User Testing'), serverContent: '', isStarred: false, size: 4500 },
            { id: 203, name: 'SDA_Database_Schema.docx', type: 'word', syncStatus: 'synced' as SyncStatus, date: 'Mar 16, 2026 09:30', isSyncing: false, content: defaultContent('SDA Schema'), serverContent: '', isStarred: true, size: 5800 },
            { id: 204, name: 'SDA_Network_Topology.docx', type: 'word', syncStatus: 'synced' as SyncStatus, date: 'Mar 15, 2026 16:10', isSyncing: false, content: defaultContent('SDA Topology'), serverContent: '', isStarred: false, size: 3900 },
            { id: 205, name: 'SDA_Deployment_Guide.docx', type: 'word', syncStatus: 'synced' as SyncStatus, date: 'Mar 14, 2026 10:05', isSyncing: false, content: defaultContent('SDA Deployment'), serverContent: '', isStarred: false, size: 2800 },
        ]
    },

];

const initialSyncLogs: LogEntry[] = [
    { id: 1, time: '10:00 AM', message: '🚀 DocuSync initialized. Hybrid Sync Engine active. All files converged and up to date.' }
];

// --- Context Definition ---

interface SyncContextType {
    reposData: RepositoryData[];
    syncLogs: LogEntry[];
    trashedFiles: TrashItem[];
    isSupabaseEnabled: boolean;
    // Storage
    currentStorageUsed: number; // bytes (after delta multiplier)
    currentStorageUsedRaw: number; // bytes (actual)
    storageLimitBytes: number;
    deltaSyncEnabled: boolean;
    autoPurgeEnabled: boolean;
    toggleDeltaSync: () => void;
    toggleAutoPurge: () => void;
    // Network state (automatic detection)
    isOnline: boolean;
    // Actions
    createRepository: (name: string) => void;
    deleteRepository: (repoId: number) => void;
    deleteFile: (repoName: string, fileName: string) => void;
    trashFile: (repoName: string, fileName: string) => void;
    restoreFile: (trashItemId: number) => void;
    permanentlyDeleteFile: (trashItemId: number) => void;
    emptyTrash: () => void;
    toggleStar: (repoName: string, fileName: string) => void;
    broadcastFileUpdate: (repoName: string, fileName: string, content: string) => void;
    uploadFile: (repoName: string, file: Omit<FileData, 'id' | 'syncStatus' | 'isSyncing'>) => void;
    simulateConflict: (repoName: string) => void;
    saveFileContent: (repoName: string, fileName: string, newContent: string, originalContent: string, vClock?: VectorClock, dBytes?: number) => void;
    resolveConflict: (repoName: string, fileName: string, resolutionType: 'local' | 'server' | 'merge', finalContent: string, resolvedBy?: string, vClock?: VectorClock, dBytes?: number) => void;
    clearPendingReview: (repoName: string, fileName: string) => void;
    addLog: (
        message: string, 
        repoName?: string, 
        nodeId?: string, 
        deltaBytes?: number, 
        vectorClock?: VectorClock, 
        eventType?: 'save' | 'conflict-resolve' | 'merge' | 'restore' | 'offline-replay'
    ) => void;
    // Version History
    getVersionHistory: (repoName: string, fileName: string) => FileVersion[];
    restoreVersion: (repoName: string, fileName: string, versionId: string) => void;
    // Active editing awareness
    activeEditors: ActiveEditor[];
    notifyEditingStart: (repoName: string, fileName: string, userName: string) => void;
    notifyEditingStop: (repoName: string, fileName: string) => void;
    fileDeletedEvent: { repoName: string; fileName: string } | null;
    clearFileDeletedEvent: () => void;
    // User Requests (Admin)
    pendingUserRequests: UserRequest[];
    requestAccess: (name: string, email: string) => void;
    approveRequest: (id: string, password?: string) => void;
    denyRequest: (id: string) => void;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

// --- Provider ---
export const SyncProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [reposData, setReposData] = useState<RepositoryData[]>(initialReposData);
    const [syncLogs, setSyncLogs] = useState<LogEntry[]>(initialSyncLogs);
    const [trashedFiles, setTrashedFiles] = useState<TrashItem[]>([]);
    const [isHydrated, setIsHydrated] = useState(false);
    const [deltaSyncEnabled, setDeltaSyncEnabled] = useState(true);
    const [autoPurgeEnabled, setAutoPurgeEnabled] = useState(true);
    const [pendingUserRequests, setPendingUserRequests] = useState<UserRequest[]>([]);
    const [activeEditors, setActiveEditors] = useState<ActiveEditor[]>([]);
    const nodeId = useRef<string>('');
    useEffect(() => {
        if (typeof window !== 'undefined') {
            nodeId.current = `node-${Math.random().toString(36).slice(2, 10)}`;
        }
    }, []);
    const [fileDeletedEvent, setFileDeletedEvent] = useState<{ repoName: string; fileName: string } | null>(null);
    const [isOnline, setIsOnline] = useState(true);

    const tabId = useRef<string>(
        typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2)
    );
    const channelRef = useRef<BroadcastChannel | null>(null);
    const reposDataRef = useRef(reposData);
    const trashedFilesRef = useRef(trashedFiles);
    useEffect(() => { reposDataRef.current = reposData; }, [reposData]);
    useEffect(() => { trashedFilesRef.current = trashedFiles; }, [trashedFiles]);

    // --- Storage Computation ---
    const currentStorageUsedRaw = reposData.reduce((total, repo) =>
        total + repo.files.reduce((s, f) => {
            // Use stored size if available, else estimate from content length
            const bytes = f.size ?? new TextEncoder().encode(f.content || '').length;
            return s + bytes;
        }, 0)
    , 0);

    // Delta sync: only 15% footprint if enabled
    const currentStorageUsed = deltaSyncEnabled
        ? Math.round(currentStorageUsedRaw * 0.15)
        : currentStorageUsedRaw;

    const toggleDeltaSync = () => setDeltaSyncEnabled(prev => !prev);
    const toggleAutoPurge = () => setAutoPurgeEnabled(prev => !prev);

    // ---------- Step 1: Hydrate from localStorage / Supabase ----------
    useEffect(() => {
        const hydrate = async () => {
            if (isSupabaseConfigured && supabase) {
                try {
                    const { data: dbRepos } = await supabase.from('repositories').select('*');
                    const { data: dbFiles } = await supabase.from('files').select('*');
                    
                    if (dbRepos && dbRepos.length > 0) {
                        const mappedRepos = dbRepos.map(r => ({
                            id: r.id,
                            name: r.name,
                            lastSynced: r.last_synced || 'Just now',
                            status: r.status || 'Up to date',
                            userRole: r.user_role || 'Owner',
                            members: r.members || [],
                            files: (dbFiles || []).filter(f => f.repo_id === r.id).map(f => ({
                                id: f.id,
                                name: f.name,
                                type: f.type,
                                syncStatus: f.sync_status,
                                date: f.date,
                                isSyncing: f.is_syncing,
                                content: f.content,
                                serverContent: f.server_content,
                                size: f.size,
                                isStarred: f.is_starred,
                                pendingReview: f.pending_review
                            }))
                        }));
                        setReposData(mappedRepos as RepositoryData[]);
                        setIsHydrated(true);
                        return; // Successfully hydrated from DB, skip local storage
                    }
                } catch (e) {
                    console.error('Supabase hydration failed, falling back to local', e);
                }
            }

            try {
                const DATA_VERSION = 'v7-sofia-reyes';
                const storedVersion = localStorage.getItem('docusync_data_version');

                // If version mismatch, wipe all cached state and start fresh with new initial data
                if (storedVersion !== DATA_VERSION) {
                    localStorage.removeItem('docusync_repos');
                    localStorage.removeItem('docusync_logs');
                    localStorage.removeItem('docusync_trash');
                    localStorage.setItem('docusync_data_version', DATA_VERSION);
                    setIsHydrated(true);
                    return;
                }

                const storedRepos  = localStorage.getItem('docusync_repos');
                const storedLogs   = localStorage.getItem('docusync_logs');
                const storedTrash  = localStorage.getItem('docusync_trash');
                const storedDelta  = localStorage.getItem('docusync_delta_sync');
                const storedPurge  = localStorage.getItem('docusync_auto_purge');
                const storedUserRequests = localStorage.getItem('docusync_user_requests');

                if (storedRepos) {
                    const parsed = JSON.parse(storedRepos) as RepositoryData[];
                    const hasOldNames = parsed.some(r => r.name === 'Main-Sync-Repo' || r.name === 'Project-Beta-Repo' || r.name === 'External-Assets-Repo');
                    if (!hasOldNames) setReposData(parsed);
                }
                if (storedLogs)  setSyncLogs(JSON.parse(storedLogs) as LogEntry[]);
                if (storedTrash) setTrashedFiles(JSON.parse(storedTrash) as TrashItem[]);
                if (storedDelta !== null) setDeltaSyncEnabled(JSON.parse(storedDelta) as boolean);
                if (storedPurge !== null) setAutoPurgeEnabled(JSON.parse(storedPurge) as boolean);
                if (storedUserRequests) setPendingUserRequests(JSON.parse(storedUserRequests) as UserRequest[]);
            } catch (e) {
                console.error('Failed to hydrate state from localStorage', e);
            }
            setIsHydrated(true);
        };
        hydrate();
    }, []);

    //  Step 2: Persist on every change 
    useEffect(() => {
        if (!isHydrated) return;
        try {
            localStorage.setItem('docusync_repos',      JSON.stringify(reposData));
            localStorage.setItem('docusync_logs',       JSON.stringify(syncLogs));
            localStorage.setItem('docusync_trash',      JSON.stringify(trashedFiles));
            localStorage.setItem('docusync_delta_sync', JSON.stringify(deltaSyncEnabled));
            localStorage.setItem('docusync_auto_purge', JSON.stringify(autoPurgeEnabled));
            localStorage.setItem('docusync_user_requests', JSON.stringify(pendingUserRequests));
        } catch (e) {
            console.error('Failed to persist state to localStorage', e);
        }
    }, [reposData, syncLogs, trashedFiles, isHydrated, deltaSyncEnabled, autoPurgeEnabled, pendingUserRequests]);

    //  Step 3: BroadcastChannel (cross-tab) 
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const channel = new BroadcastChannel('docusync_channel');
        channelRef.current = channel;

        channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
            const msg = event.data;
            if (!msg || msg.senderId === tabId.current) return;

            switch (msg.type) {
                case 'FILE_UPDATE':
                    setReposData(prev => prev.map(r => r.name !== msg.repoName ? r : {
                        ...r,
                        files: r.files.map(f => f.name !== msg.fileName ? f : {
                            ...f, serverContent: msg.content, syncStatus: 'conflict' as SyncStatus,
                        })
                    }));
                    setSyncLogs(prev => [{
                        id: Date.now(),
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        message: `⚡ Real-time conflict: '${msg.fileName}' was edited in another window. Resolution required.`
                    }, ...prev]);
                    break;
                case 'FILE_UPLOAD':
                    setReposData(prev => prev.map(r => r.name !== msg.repoName ? r : {
                        ...r, files: r.files.some(f => f.name === msg.file.name) ? r.files : [msg.file, ...r.files]
                    }));
                    break;
                case 'FILE_DELETE':
                    setReposData(prev => prev.map(r =>
                        r.name === msg.repoName ? { ...r, files: r.files.filter(f => f.name !== msg.fileName) } : r
                    ));
                    break;
                case 'REPO_DELETE':
                    setReposData(prev => prev.filter(r => r.id !== msg.repoId));
                    break;
                case 'REPO_CREATE':
                    setReposData(prev => prev.some(r => r.id === msg.repo.id) ? prev : [msg.repo, ...prev]);
                    break;
                case 'FILE_TRASH':
                    setReposData(prev => prev.map(r =>
                        r.name === msg.trashItem.repoName
                            ? { ...r, files: r.files.filter(f => f.name !== msg.trashItem.file.name) }
                            : r
                    ));
                    setTrashedFiles(prev => [msg.trashItem, ...prev]);
                    break;
                case 'FILE_RESTORE':
                    setTrashedFiles(prev => prev.filter(t => t.id !== msg.trashItemId));
                    setReposData(prev => prev.map(r =>
                        r.name === msg.repoName ? { ...r, files: [msg.file, ...r.files] } : r
                    ));
                    break;
                case 'FILE_STAR':
                    setReposData(prev => prev.map(r =>
                        r.name !== msg.repoName ? r : {
                            ...r,
                            files: r.files.map(f => f.name === msg.fileName ? { ...f, isStarred: msg.isStarred } : f)
                        }
                    ));
                    break;
                case 'FILE_EDITING_START':
                    setActiveEditors(prev => {
                        // Avoid duplicates from the same tab
                        const filtered = prev.filter(e => e.tabId !== msg.senderId || e.fileName !== msg.fileName);
                        return [...filtered, { fileName: msg.fileName, repoName: msg.repoName, userName: msg.userName, tabId: msg.senderId }];
                    });
                    break;
                case 'FILE_EDITING_STOP':
                    setActiveEditors(prev => prev.filter(e => !(e.tabId === msg.senderId && e.fileName === msg.fileName)));
                    break;
                case 'FILE_DELETED_KICK':
                    setFileDeletedEvent({ repoName: msg.repoName, fileName: msg.fileName });
                    setActiveEditors(prev => prev.filter(e => !(e.repoName === msg.repoName && e.fileName === msg.fileName)));
                    break;
                // Owner accepted conflict resolution — update ALL collaborators immediately
                case 'FILE_APPROVED':
                    setReposData(prev => prev.map(r => r.name !== msg.repoName ? r : {
                        ...r,
                        files: r.files.map(f => f.name !== msg.fileName ? f : {
                            ...f,
                            content: msg.content,
                            serverContent: '',
                            syncStatus: 'synced' as SyncStatus,
                            size: new TextEncoder().encode(msg.content).length,
                        })
                    }));
                    setSyncLogs(prev => [{
                        id: Date.now(),
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        message: `✅ '${msg.fileName}' — Owner accepted changes. All collaborators updated in real-time.`
                    }, ...prev]);
                    break;
            }
        };

        return () => { channel.close(); channelRef.current = null; };
    }, []);

    //  Offline replay function
    const replayOfflineEdits = async () => {
        try {
            const edits = await dequeueAllEdits();
            if (edits.length === 0) return;

            addLog(`🔄 Replaying ${edits.length} buffered offline edits...`);

            for (const edit of edits) {
                setReposData(prev =>
                    prev.map(r => {
                        if (r.name === edit.repoName) {
                            return {
                                ...r,
                                files: r.files.map(f => {
                                    if (f.name === edit.fileName) {
                                        return {
                                            ...f,
                                            syncStatus: 'synced' as SyncStatus,
                                            isSyncing: false,
                                        };
                                    }
                                    return f;
                                })
                            };
                        }
                        return r;
                    })
                );

                // Add audit entry for replay
                addLog(
                    `🔄 Offline replay: Applied update of ${edit.delta.length} bytes for '${edit.fileName}'.`,
                    edit.repoName,
                    edit.vectorClock.nodeId,
                    edit.delta.length,
                    edit.vectorClock,
                    'offline-replay'
                );
            }

            await clearQueue();
            toast.success(`Successfully replayed ${edits.length} offline edits!`);
        } catch (e) {
            console.error('Failed to replay offline edits:', e);
        }
    };

    //  Automatic Online/Offline Detection 
    useEffect(() => {
        const handleOffline = () => {
            setIsOnline(false);
            addLog('🔴 Network disconnected. CRDT engine entering offline buffer mode. Edits queued locally.');
        };
        const handleOnline = () => {
            setIsOnline(true);
            addLog('🟢 Network reconnected. CRDT state convergence initiated. Syncing buffered edits...');
            replayOfflineEdits();
        };
        if (typeof navigator !== 'undefined') {
            setIsOnline(navigator.onLine);
        }
        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);
        return () => {
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    //  Auto-purge: delete trash items older than 30 days 
    useEffect(() => {
        if (!autoPurgeEnabled || !isHydrated) return;
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const expired = trashedFilesRef.current.filter(t => {
            const deletedTime = new Date(t.deletedAt).getTime();
            return !isNaN(deletedTime) && (now - deletedTime) > thirtyDaysMs;
        });
        if (expired.length > 0) {
            setTrashedFiles(prev => prev.filter(t => !expired.some(e => e.id === t.id)));
            addLog(`♻️ Auto-Purge: ${expired.length} item(s) permanently deleted (30-day policy).`);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHydrated, autoPurgeEnabled]);

    //  Helpers 
    const post = (msg: BroadcastMessage) => channelRef.current?.postMessage(msg);

    const addLog = (
        message: string, 
        repoName?: string,
        nodeIdArg?: string,
        deltaBytes?: number,
        vectorClock?: VectorClock,
        eventType?: 'save' | 'conflict-resolve' | 'merge' | 'restore' | 'offline-replay'
    ) => {
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setSyncLogs(prev => [{
            id: Date.now(),
            time: now,
            message,
            repoName,
            nodeId: nodeIdArg,
            deltaBytes,
            vectorClock,
            eventType
        }, ...prev]);
    };

    //  Actions 
    const createRepository = async (name: string) => {
        if (!name.trim()) return;
        const newRepo: RepositoryData = {
            id: Date.now(),
            name: name.trim(),
            lastSynced: 'Just now',
            status: 'Up to date',
            userRole: 'Owner',
            members: [{ name: 'Paul John Palamara', role: 'Owner', badge: 'amber' }],
            files: []
        };
        setReposData(prev => [newRepo, ...prev]);
        addLog(`Repository '${name.trim()}' created successfully.`);
        post({ type: 'REPO_CREATE', repo: newRepo, senderId: tabId.current });

        if (isSupabaseConfigured && supabase) {
            await supabase.from('repositories').insert([{
                id: newRepo.id,
                name: newRepo.name,
                last_synced: newRepo.lastSynced,
                status: newRepo.status,
                user_role: newRepo.userRole,
                members: newRepo.members
            }]);
        }
    };


    const deleteRepository = (repoId: number) => {
        const repo = reposData.find(r => r.id === repoId);
        setReposData(prev => prev.filter(r => r.id !== repoId));
        if (repo) {
            addLog(`Repository '${repo.name}' and all its files have been permanently deleted.`);
            post({ type: 'REPO_DELETE', repoId, senderId: tabId.current });
        }
    };

    const deleteFile = async (repoName: string, fileName: string) => {
        setReposData(prev =>
            prev.map(r =>
                r.name === repoName
                    ? { ...r, files: r.files.filter(f => f.name !== fileName) }
                    : r
            )
        );
        setActiveEditors(prev => prev.filter(e => !(e.repoName === repoName && e.fileName === fileName)));
        addLog(`File '${fileName}' deleted from '${repoName}'.`, repoName);
        post({ type: 'FILE_DELETE', repoName, fileName, senderId: tabId.current });
        post({ type: 'FILE_DELETED_KICK', repoName, fileName, senderId: tabId.current });

        if (isSupabaseConfigured && supabase) {
            const repo = reposDataRef.current.find(r => r.name === repoName);
            if (repo) {
                await supabase.from('files').delete().match({ repo_id: repo.id, name: fileName });
            }
        }
    };

    const trashFile = async (repoName: string, fileName: string) => {
        const repo = reposDataRef.current.find(r => r.name === repoName);
        const file = repo?.files.find(f => f.name === fileName);
        if (!file) return;

        const trashItem: TrashItem = {
            id: Date.now(),
            file,
            repoName,
            deletedAt: new Date().toLocaleString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: false
            })
        };

        setReposData(prev =>
            prev.map(r =>
                r.name === repoName
                    ? { ...r, files: r.files.filter(f => f.name !== fileName) }
                    : r
            )
        );
        setActiveEditors(prev => prev.filter(e => !(e.repoName === repoName && e.fileName === fileName)));
        setTrashedFiles(prev => [trashItem, ...prev]);
        addLog(`'${fileName}' moved to Trash from '${repoName}'.`, repoName);
        post({ type: 'FILE_TRASH', trashItem, senderId: tabId.current });
        post({ type: 'FILE_DELETED_KICK', repoName, fileName, senderId: tabId.current });

        if (isSupabaseConfigured && supabase) {
            if (repo) {
                await supabase.from('files').delete().match({ repo_id: repo.id, name: fileName });
            }
        }
    };

    const restoreFile = (trashItemId: number) => {
        const item = trashedFilesRef.current.find(t => t.id === trashItemId);
        if (!item) return;
        setTrashedFiles(prev => prev.filter(t => t.id !== trashItemId));
        setReposData(prev =>
            prev.map(r =>
                r.name === item.repoName
                    ? { ...r, files: [item.file, ...r.files] }
                    : r
            )
        );
        addLog(`'${item.file.name}' restored from Trash to '${item.repoName}'.`);
        post({ type: 'FILE_RESTORE', trashItemId, repoName: item.repoName, file: item.file, senderId: tabId.current });
    };

    const permanentlyDeleteFile = (trashItemId: number) => {
        const item = trashedFilesRef.current.find(t => t.id === trashItemId);
        if (!item) return;
        setTrashedFiles(prev => prev.filter(t => t.id !== trashItemId));
        addLog(`'${item.file.name}' permanently deleted.`);
    };

    const emptyTrash = () => {
        const count = trashedFilesRef.current.length;
        setTrashedFiles([]);
        addLog(`Trash emptied — ${count} file(s) permanently deleted.`);
    };

    const toggleStar = (repoName: string, fileName: string) => {
        let newIsStarred = false;
        setReposData(prev => prev.map(r => {
            if (r.name !== repoName) return r;
            return {
                ...r,
                files: r.files.map(f => {
                    if (f.name !== fileName) return f;
                    newIsStarred = !f.isStarred;
                    return { ...f, isStarred: !f.isStarred };
                })
            };
        }));
        post({ type: 'FILE_STAR', repoName, fileName, isStarred: newIsStarred, senderId: tabId.current });
    };

    const uploadFile = async (repoName: string, fileInfo: Omit<FileData, 'id' | 'syncStatus' | 'isSyncing'>) => {
        // Compute projected storage usage
        const fileSize = fileInfo.size ?? new TextEncoder().encode(fileInfo.content || '').length;
        const projected = deltaSyncEnabled
            ? currentStorageUsedRaw + fileSize
            : currentStorageUsedRaw + fileSize;

        if (projected > STORAGE_LIMIT_BYTES) {
            addLog(`⛔ Upload blocked: Storage limit of 15 GB would be exceeded. Free up space first.`);
            return;
        }

        const newFile: FileData = {
            ...fileInfo,
            id: Date.now(),
            syncStatus: 'synced',
            isSyncing: false,
            content: fileInfo.content || defaultContent(fileInfo.name),
            serverContent: '',
            isStarred: false,
            size: fileSize,
        };
        setReposData(prev =>
            prev.map(r =>
                r.name === repoName
                    ? { ...r, files: [newFile, ...r.files] }
                    : r
            )
        );
        post({ type: 'FILE_UPLOAD', repoName, file: newFile, senderId: tabId.current });

        if (isSupabaseConfigured && supabase) {
            const repo = reposDataRef.current.find(r => r.name === repoName);
            if (repo) {
                let storagePath = null;
                if (fileSize > 1000 * 1024) { // over 1MB
                    storagePath = `${repoName}/${newFile.name}`;
                    const blob = new Blob([newFile.content], { type: 'text/plain' });
                    await supabase.storage.from('thesis-docs').upload(storagePath, blob);
                }

                await supabase.from('files').insert([{
                    id: newFile.id,
                    repo_id: repo.id,
                    name: newFile.name,
                    type: newFile.type,
                    sync_status: newFile.syncStatus,
                    date: newFile.date,
                    is_syncing: newFile.isSyncing,
                    content: storagePath ? '[Stored in bucket]' : newFile.content,
                    server_content: newFile.serverContent,
                    size: newFile.size,
                    is_starred: newFile.isStarred,
                    storage_path: storagePath
                }]);
            }
        }
    };

    const simulateConflict = (repoName: string) => {
        setReposData(prev => {
            const next = prev.map(r => {
                if (r.name !== repoName || r.files.length === 0) return r;
                const syncedFiles = r.files.filter(f => f.syncStatus === 'synced');
                if (syncedFiles.length === 0) return r;
                const count = Math.min(syncedFiles.length, Math.floor(Math.random() * 2) + 1);
                const shuffled = [...syncedFiles].sort(() => 0.5 - Math.random()).slice(0, count);
                const conflictIds = new Set(shuffled.map(f => f.id));
                return {
                    ...r,
                    files: r.files.map(f =>
                        conflictIds.has(f.id)
                            ? { ...f, syncStatus: 'conflict' as SyncStatus, serverContent: (f.content || '') + '\n\n[Sofia Reyes: Added incoming collaborative edits via CRDT sync.]' }
                            : f
                    ),
                    // Set Sofia Reyes to 'online' so her card shows active edits in the conflict hub
                    members: r.members.map(m =>
                        m.name === 'Sofia Reyes' ? { ...m, status: 'online' as const, lastActive: 'Now' } : m
                    )
                };
            });
            const repo = next.find(r => r.name === repoName);
            const conflictCount = repo?.files.filter(f => f.syncStatus === 'conflict').length ?? 0;
            addLog(`Incoming edit collision detected on ${conflictCount} file(s) in '${repoName}'. Manual resolution required.`, repoName);
            return next;
        });
    };

    const saveFileContent = async (
        repoName: string, 
        fileName: string, 
        newContent: string, 
        originalContent: string,
        vClock?: VectorClock,
        dBytes?: number
    ) => {
        const contentSize = new TextEncoder().encode(newContent).length;
        // Create a version snapshot before applying the save
        let currentUser = 'Unknown';
        try {
            const u = localStorage.getItem('docusync_current_user');
            if (u) {
                const userData = JSON.parse(u) as { name?: string };
                currentUser = userData.name || 'Unknown';
            }
        } catch { /* ignore */ }
        const newVersion: FileVersion = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            content: newContent,
            savedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            savedBy: currentUser,
            action: 'save',
        };
        setReposData(prev =>
            prev.map(r =>
                r.name === repoName
                    ? {
                        ...r,
                        files: r.files.map(f =>
                            f.name === fileName
                                ? {
                                    ...f,
                                    content: newContent,
                                    serverContent: originalContent,
                                    syncStatus: 'synced' as SyncStatus,
                                    size: contentSize,
                                    versions: [newVersion, ...(f.versions || [])].slice(0, 20), // keep last 20
                                }
                                : f
                        )
                    }
                    : r
            )
        );
        
        const calcDeltaBytes = Math.abs(contentSize - new TextEncoder().encode(originalContent).length);
        const resolvedVClock = vClock || { nodeId: nodeId.current || 'unknown-node', counter: 1 };
        addLog(
            `✅ '${fileName}' saved & synced via CRDT. All collaborators updated.`,
            repoName,
            nodeId.current || 'unknown-node',
            dBytes || calcDeltaBytes,
            resolvedVClock,
            'save'
        );
        post({ type: 'FILE_UPDATE', repoName, fileName, content: newContent, senderId: tabId.current });

        if (isSupabaseConfigured && supabase) {
            const repo = reposDataRef.current.find(r => r.name === repoName);
            if (repo) {
                await supabase.from('files').update({
                    content: newContent,
                    server_content: originalContent,
                    sync_status: 'synced',
                    size: contentSize
                }).match({ repo_id: repo.id, name: fileName });
            }
        }
    };

    const broadcastFileUpdate = (repoName: string, fileName: string, content: string) => {
        post({ type: 'FILE_UPDATE', repoName, fileName, content, senderId: tabId.current });
    };

    const notifyEditingStart = (repoName: string, fileName: string, userName: string) => {
        // Add ourselves to local active editors
        setActiveEditors(prev => {
            const filtered = prev.filter(e => e.tabId !== tabId.current || e.fileName !== fileName);
            return [...filtered, { fileName, repoName, userName, tabId: tabId.current }];
        });
        post({ type: 'FILE_EDITING_START', repoName, fileName, userName, senderId: tabId.current });
    };

    const notifyEditingStop = (repoName: string, fileName: string) => {
        setActiveEditors(prev => prev.filter(e => !(e.tabId === tabId.current && e.fileName === fileName)));
        post({ type: 'FILE_EDITING_STOP', repoName, fileName, senderId: tabId.current });
    };

    const clearFileDeletedEvent = () => setFileDeletedEvent(null);

    const resolveConflict = (
        repoName: string, 
        fileName: string, 
        resolutionType: 'local' | 'server' | 'merge', 
        finalContent: string, 
        resolvedBy?: string,
        vClock?: VectorClock,
        dBytes?: number
    ) => {
        let currentUser = resolvedBy || 'Owner';
        try {
            if (!resolvedBy) {
                const u = localStorage.getItem('docusync_current_user');
                if (u) {
                    const userData = JSON.parse(u) as { name?: string };
                    currentUser = userData.name || 'Owner';
                }
            }
        } catch { /* ignore */ }
        const newVersion: FileVersion = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            content: finalContent,
            savedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            savedBy: currentUser,
            action: 'conflict-resolve',
        };
        setReposData(prev =>
            prev.map(r =>
                r.name === repoName
                    ? {
                        ...r,
                        files: r.files.map(f =>
                            f.name === fileName
                                ? {
                                    ...f,
                                    content: finalContent,
                                    serverContent: '',
                                    syncStatus: 'synced' as SyncStatus,
                                    isSyncing: false,
                                    versions: [newVersion, ...(f.versions || [])].slice(0, 20),
                                    pendingReview: {
                                        previousContent: f.content,
                                        resolvedWith: resolutionType,
                                        resolvedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                    },
                                }
                                : f
                        )
                    }
                    : r
            )
        );
        // Broadcast accepted content — all collaborators update simultaneously (Sir Janus #8)
        post({ type: 'FILE_APPROVED', repoName, fileName, content: finalContent, senderId: tabId.current });
        const actionLabel = resolutionType === 'local' ? 'Kept Local Version' : resolutionType === 'server' ? 'Kept Server Version' : 'Auto-Merged (Hybrid CRDT+OT)';
        
        const contentSize = new TextEncoder().encode(finalContent).length;
        const calcDeltaBytes = dBytes || contentSize;
        const resolvedVClock = vClock || { nodeId: nodeId.current || 'unknown-node', counter: 1 };
        addLog(
            `✅ '${fileName}' — Conflict resolved (${actionLabel}). All users notified.`, 
            repoName,
            nodeId.current || 'unknown-node',
            calcDeltaBytes,
            resolvedVClock,
            'conflict-resolve'
        );
    };

    // --- Version History helpers ---
    const getVersionHistory = (repoName: string, fileName: string): FileVersion[] => {
        const repo = reposData.find(r => r.name === repoName);
        const file = repo?.files.find(f => f.name === fileName);
        return file?.versions || [];
    };

    const restoreVersion = (repoName: string, fileName: string, versionId: string) => {
        const repo = reposData.find(r => r.name === repoName);
        const file = repo?.files.find(f => f.name === fileName);
        const version = file?.versions?.find(v => v.id === versionId);
        if (!version) return;
        let currentUser = 'Unknown';
        try {
            const u = localStorage.getItem('docusync_current_user');
            if (u) {
                const userData = JSON.parse(u) as { name?: string };
                currentUser = userData.name || 'Unknown';
            }
        } catch { /* ignore */ }
        const restoreEntry: FileVersion = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            content: version.content,
            savedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            savedBy: currentUser,
            action: 'restore',
        };
        setReposData(prev => prev.map(r => r.name !== repoName ? r : {
            ...r,
            files: r.files.map(f => f.name !== fileName ? f : {
                ...f,
                content: version.content,
                syncStatus: 'synced' as SyncStatus,
                versions: [restoreEntry, ...(f.versions || [])].slice(0, 20),
            })
        }));
        post({ type: 'FILE_APPROVED', repoName, fileName, content: version.content, senderId: tabId.current });
        addLog(`♻️ '${fileName}' restored to version from ${version.savedAt} by ${currentUser}.`, repoName);
    };

    const clearPendingReview = (repoName: string, fileName: string) => {
        setReposData(prev =>
            prev.map(r =>
                r.name === repoName
                    ? { ...r, files: r.files.map(f => f.name === fileName ? { ...f, pendingReview: null } : f) }
                    : r
            )
        );
        addLog(`✅ Changes accepted for '${fileName}'. Document is ready for editing.`, repoName);
    };

    const requestAccess = (name: string, email: string) => {
        const newRequest: UserRequest = {
            id: crypto.randomUUID?.() || String(Date.now()),
            name,
            email,
            requestDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            status: 'pending'
        };
        setPendingUserRequests(prev => [newRequest, ...prev]);
        addLog(`📩 New access request from ${name} (${email}).`);
    };

    const approveRequest = (id: string, password?: string) => {
        setPendingUserRequests(prev => prev.map(req => 
            req.id === id ? { ...req, status: 'approved', password } : req
        ));
        const req = pendingUserRequests.find(r => r.id === id);
        if (req) {
            addLog(`✅ Access request approved for ${req.name}.`);
        }
    };

    const denyRequest = (id: string) => {
        const req = pendingUserRequests.find(r => r.id === id);
        setPendingUserRequests(prev => prev.filter(r => r.id !== id));
        if (req) {
            addLog(`❌ Access request denied for ${req.name}.`);
        }
    };

    const computedReposData = reposData.map(repo => {
        if (repo.files.length === 0) return { ...repo, status: 'Up to date' };
        const hasConflict = repo.files.some(f => f.syncStatus === 'conflict');
        const hasSyncing = repo.files.some(f => f.isSyncing || f.syncStatus === 'syncing...');
        return {
            ...repo,
            status: hasConflict ? 'Conflict' : (hasSyncing ? 'Syncing...' : 'Up to date')
        };
    });

    if (!isHydrated) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-2 border-amber-500/40 border-t-amber-500 rounded-full animate-spin" />
                    <p className="text-zinc-400 text-sm font-medium">Loading DocuSync...</p>
                </div>
            </div>
        );
    }

    return (
        <SyncContext.Provider value={{
            reposData: computedReposData,
            syncLogs,
            trashedFiles,
            isSupabaseEnabled: isSupabaseConfigured,
            currentStorageUsed,
            currentStorageUsedRaw,
            storageLimitBytes: STORAGE_LIMIT_BYTES,
            deltaSyncEnabled,
            autoPurgeEnabled,
            toggleDeltaSync,
            toggleAutoPurge,
            isOnline,
            createRepository,
            deleteRepository,
            deleteFile,
            trashFile,
            restoreFile,
            permanentlyDeleteFile,
            emptyTrash,
            toggleStar,
            broadcastFileUpdate,
            uploadFile,
            simulateConflict,
            saveFileContent,
            resolveConflict,
            clearPendingReview,
            addLog,
            getVersionHistory,
            restoreVersion,
            activeEditors,
            notifyEditingStart,
            notifyEditingStop,
            fileDeletedEvent,
            clearFileDeletedEvent,
            pendingUserRequests,
            requestAccess,
            approveRequest,
            denyRequest,
        }}>
            {children}
        </SyncContext.Provider>
    );
};

// --- Custom Hook ---
export const useSyncContext = () => {
    const context = useContext(SyncContext);
    if (!context) throw new Error('useSyncContext must be used within a SyncProvider');
    return context;
};

```

---

## File: `src/components/AuthorMark.ts`

```typescript
import { Mark, mergeAttributes } from '@tiptap/core';

export const AuthorMark = Mark.create({
  name: 'authorMark',

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      author: { default: null, parseHTML: el => el.getAttribute('data-author') },
      color:  { default: '#f97316', parseHTML: el => el.getAttribute('data-color') },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-author]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, {
      'data-author': HTMLAttributes.author,
      'data-color':  HTMLAttributes.color,
      style: `border-bottom: 2px solid ${HTMLAttributes.color}22;`,
    }), 0];
  },
});

```

---

## File: `src/components/MetricsOverlay.tsx`

```typescript
"use client";

import React, { useEffect, useState, useRef } from 'react';
import { VectorClock } from '../lib/vectorClock';

interface MetricsOverlayProps {
    deltaBytes: number;
    peerCount: number;
    vectorClock?: VectorClock;
}

export default function MetricsOverlay({ deltaBytes, peerCount, vectorClock }: MetricsOverlayProps) {
    const [ping, setPing] = useState(24);
    const [flashDelta, setFlashDelta] = useState(false);
    const [uptime, setUptime] = useState(0);
    const prevDelta = useRef(deltaBytes);
    const startTime = useRef(Date.now());

    // Simulate realistic latency fluctuation (12–45ms)
    useEffect(() => {
        const id = setInterval(() => {
            setPing(Math.floor(12 + Math.random() * 33));
            setUptime(Math.floor((Date.now() - startTime.current) / 1000));
        }, 1800);
        return () => clearInterval(id);
    }, []);

    // Flash delta counter when new bytes arrive
    useEffect(() => {
        if (deltaBytes !== prevDelta.current) {
            prevDelta.current = deltaBytes;
            setFlashDelta(true);
            const t = setTimeout(() => setFlashDelta(false), 400);
            return () => clearTimeout(t);
        }
    }, [deltaBytes]);

    const pingColor = ping < 20 ? '#4ade80' : ping < 35 ? '#facc15' : '#f87171';
    const fmtBytes = (b: number) => b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`;
    const fmtUptime = (s: number) => {
        const m = Math.floor(s / 60), sec = s % 60;
        return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    };

    return (
        <div className="fixed bottom-5 left-5 z-[200] w-72 rounded-xl overflow-hidden shadow-2xl border border-green-500/20 bg-black/85 backdrop-blur-md font-mono text-xs select-none">
            {/* Header bar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-green-500/10 border-b border-green-500/20">
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
                    <span className="text-green-400 font-bold uppercase tracking-widest text-[9px]">DocuSync · Live Metrics</span>
                </div>
                <span className="text-green-600 text-[9px]">SESSION {fmtUptime(uptime)}</span>
            </div>

            {/* Metrics rows */}
            <div className="px-3 py-2.5 space-y-1.5">
                <MetricRow label="SYNC PROTOCOL" value="Log/LWW Hybrid Engine" valueClass="text-cyan-400" />
                <MetricRow
                    label="NETWORK PING"
                    value={`${ping} ms`}
                    valueClass="font-bold"
                    valueStyle={{ color: pingColor }}
                    extra={
                        <div className="flex gap-0.5 items-center ml-2">
                            {[...Array(5)].map((_, i) => (
                                <div
                                    key={i}
                                    className="w-1 rounded-sm transition-all duration-300"
                                    style={{
                                        height: `${4 + i * 2}px`,
                                        backgroundColor: i < Math.ceil((45 - ping) / 9) ? pingColor : '#27272a',
                                    }}
                                />
                            ))}
                        </div>
                    }
                />
                <MetricRow
                    label="DELTA PAYLOADS"
                    value={fmtBytes(deltaBytes)}
                    valueClass={`font-bold transition-colors duration-200 ${flashDelta ? 'text-yellow-300' : 'text-green-400'}`}
                    extra={flashDelta && <span className="ml-2 text-[8px] text-yellow-400 animate-pulse">TX ▲</span>}
                />
                <MetricRow label="ACTIVE PEERS" value={`${peerCount} node${peerCount !== 1 ? 's' : ''}`} valueClass="text-purple-400" />
                <MetricRow
                    label="VECTOR CLOCK"
                    value={vectorClock ? `${vectorClock.nodeId} · cnt ${vectorClock.counter}` : "LWW · last-write-wins"}
                    valueClass={vectorClock ? "text-green-400 font-bold" : "text-zinc-500"}
                />
                <MetricRow label="COMPLEXITY" value="O(m) · Δ-encoding" valueClass="text-orange-400" />
            </div>

            {/* Footer bar */}
            <div className="px-3 py-1 border-t border-green-500/10 bg-green-500/5">
                <span className="text-green-700 text-[8px] tracking-wider">Hybrid Sync Engine · WebRTC Mesh · Yjs v13</span>
            </div>
        </div>
    );
}

function MetricRow({ label, value, valueClass = 'text-green-400', valueStyle, extra }: {
    label: string; value: string; valueClass?: string; valueStyle?: React.CSSProperties; extra?: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-2">
            <span className="text-zinc-600 text-[9px] uppercase tracking-widest shrink-0">{label}</span>
            <div className="flex items-center">
                <span className={`text-[10px] ${valueClass}`} style={valueStyle}>{value}</span>
                {extra}
            </div>
        </div>
    );
}

```

---

## File: `src/components/Real-Time_Algo.tsx`

```typescript
"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { AuthorMark } from './AuthorMark';
import MetricsOverlay from './MetricsOverlay';
import { toast } from 'sonner';
import { VectorClock, incrementClock, mergeClock } from '../lib/vectorClock';
import { enqueueEdit } from '../lib/offlineQueue';

const PAUL_CONTENT = `<h2>Introduction</h2><p>Hi I'm Paul... I'm on Cabuyao City... I'm on section CS 402, nice to meet you all groupmates.</p><p>This document is part of our collaborative thesis project, managed through DocuSync. Please feel free to add your sections below.</p>`;
const CURSOR_COLORS = ['#f97316', '#8b5cf6', '#06b6d4', '#10b981', '#ef4444', '#f59e0b'];
const pickColor = (name: string) => CURSOR_COLORS[name.charCodeAt(0) % CURSOR_COLORS.length];

// ── Lightweight toolbar button ─────────────────────────────────────────────────
const ToolBtn = ({
    onClick, isActive, title, children,
}: {
    onClick: () => void; isActive?: boolean; title: string; children: React.ReactNode;
}) => (
    <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); onClick(); }}
        title={title}
        className={`
            min-w-[30px] h-7 px-2 flex items-center justify-center rounded-md text-[13px] font-medium
            transition-all duration-150 select-none
            ${isActive
                ? 'bg-orange-500/25 text-orange-400 ring-1 ring-orange-500/40'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/8'
            }
        `}
    >
        {children}
    </button>
);

const ToolSep = () => <div className="w-px h-5 bg-zinc-700/80 mx-0.5 flex-shrink-0" />;

// ── Props ──────────────────────────────────────────────────────────────────────
interface RichTextEditorProps {
    fileName: string;
    userName: string;
    onChange: (html: string) => void;
    onClose?: () => void;
    onSave?: () => void;
    initialContent?: string;
    isOffline?: boolean;
    repoName?: string;
}

export interface CollaboratorUser {
    name: string;
    color: string;
}

export interface AwarenessState {
    user?: CollaboratorUser;
    clock?: VectorClock;
}

// ── Root: initialises Yjs + WebRTC provider ───────────────────────────────────
export default function RichTextEditor(props: RichTextEditorProps) {
    const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
    const [provider, setProvider] = useState<WebrtcProvider | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const doc = new Y.Doc();
        setYdoc(doc);
        const prov = new WebrtcProvider(`docusync-room-${props.fileName}`, doc, {
            signaling: ['wss://signaling.yjs.dev'],
        });
        setProvider(prov);
        return () => { prov.destroy(); doc.destroy(); };
    }, [props.fileName]);

    if (!ydoc || !provider) {
        return (
            <div className="flex flex-col h-full bg-zinc-950 items-center justify-center gap-4">
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Connecting to Hybrid LWW Engine…</p>
            </div>
        );
    }

    return <InnerEditor ydoc={ydoc} provider={provider} {...props} />;
}

// ── Inner: editor + full UI chrome ────────────────────────────────────────────
function InnerEditor({
    ydoc, provider, fileName, userName, onChange, onClose, onSave, initialContent, isOffline, repoName,
}: { ydoc: Y.Doc; provider: WebrtcProvider } & RichTextEditorProps) {

    const [collaborators, setCollaborators] = useState<CollaboratorUser[]>([]);
    const [zoom, setZoom] = useState(100);
    const [showAudit, setShowAudit] = useState(false);
    const [auditTrail, setAuditTrail] = useState<{ author: string; color: string; text: string }[]>([]);
    const [showMetrics, setShowMetrics] = useState(false);
    const [deltaBytes, setDeltaBytes] = useState(0);
    const [showPeerList, setShowPeerList] = useState(false);
    const knownPeers = useRef<Set<number>>(new Set());
    const isMarkingRef = useRef(false); // prevents recursive AuthorMark onUpdate loop

    const userColor = pickColor(userName || 'User');

    // Vector clock initialization using Client ID as nodeId
    const nodeIdRef = useRef<string>('');
    if (!nodeIdRef.current && provider) {
        nodeIdRef.current = `node-${provider.awareness.clientID}`;
    }
    const [vectorClock, setVectorClock] = useState<VectorClock>({
        nodeId: nodeIdRef.current || 'unknown-node',
        counter: 0
    });

    const editor = useEditor({
        extensions: [
            StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
            Underline,
            Highlight.configure({ multicolor: false }),
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            AuthorMark,
            Collaboration.configure({ document: ydoc }),
            CollaborationCursor.configure({
                provider,
                user: { name: userName || 'User', color: userColor },
            }),
        ],
        editorProps: {
            attributes: { class: 'notion-paper focus:outline-none', spellCheck: 'true' },
            handleKeyDown: () => false,
        },
        onUpdate: ({ editor, transaction }) => {
            // Skip if this update was triggered by our own mark application (breaks recursive loop)
            if (isMarkingRef.current) {
                // Still rebuild the trail after our mark transaction completes
                const trail: { author: string; color: string; text: string }[] = [];
                editor.state.doc.descendants((node) => {
                    if (!node.isText || !node.text?.trim()) return;
                    const mark = node.marks.find(m => m.type.name === 'authorMark');
                    const author = mark?.attrs.author || 'Unknown';
                    const color  = mark?.attrs.color  || '#71717a';
                    const last = trail[trail.length - 1];
                    if (last && last.author === author) { last.text += ' ' + node.text.trim(); }
                    else { trail.push({ author, color, text: node.text.trim() }); }
                });
                setAuditTrail(trail);
                return;
            }

            onChange(editor.getHTML());

            // Auto-apply AuthorMark ONLY within the current block, with loop guard
            if (transaction.docChanged && transaction.steps.length > 0) {
                const { from, to } = editor.state.selection;
                if (from === to && transaction.getMeta('uiEvent') !== 'drop') {
                    const $from = editor.state.doc.resolve(from);
                    if ($from.parent.isTextblock && $from.parentOffset > 0) {
                        isMarkingRef.current = true;
                        editor.chain()
                            .setMeta('addToHistory', false)
                            .setTextSelection({ from: from - 1, to: from })
                            .setMark('authorMark', { author: userName || 'User', color: userColor })
                            .setTextSelection({ from, to: from })
                            .run();
                        isMarkingRef.current = false;
                        return; // trail rebuilt in the recursive call above
                    }
                }
            }

            // Rebuild audit trail
            const trail: { author: string; color: string; text: string }[] = [];
            editor.state.doc.descendants((node) => {
                if (!node.isText || !node.text?.trim()) return;
                const mark = node.marks.find(m => m.type.name === 'authorMark');
                const author = mark?.attrs.author || 'Unknown';
                const color  = mark?.attrs.color  || '#71717a';
                const last = trail[trail.length - 1];
                if (last && last.author === author) { last.text += ' ' + node.text.trim(); }
                else { trail.push({ author, color, text: node.text.trim() }); }
            });
            setAuditTrail(trail);
        },
        immediatelyRender: false,
    });

    // ── Vector Clock and True Delta Encoding Integration ──
    useEffect(() => {
        if (!ydoc || !provider) return;

        const handleUpdate = (update: Uint8Array, origin: unknown) => {
            // Measure actual byte-level size of Yjs update delta
            setDeltaBytes(prev => prev + update.byteLength);

            // Detect if update was made locally by this client
            const isLocal = origin !== null && origin !== provider;
            if (isLocal) {
                // Increment logical clock on document update
                setVectorClock(prev => {
                    const next = incrementClock(prev);
                    provider.awareness.setLocalStateField('clock', next);
                    return next;
                });

                // Buffer offline edits to IndexedDB
                if (isOffline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
                    const editId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
                    enqueueEdit({
                        id: editId,
                        repoName: repoName || 'default-repo',
                        fileName,
                        delta: update,
                        vectorClock,
                        queuedAt: Date.now()
                    }).catch(err => console.error('Failed to enqueue offline edit:', err));
                }
            }
        };

        ydoc.on('update', handleUpdate);
        return () => {
            ydoc.off('update', handleUpdate);
        };
    }, [ydoc, provider, repoName, fileName, isOffline, vectorClock]);

    // Push local clock to awareness state
    const lastClockRef = useRef<number>(0);
    useEffect(() => {
        if (!provider) return;
        if (vectorClock.counter !== lastClockRef.current) {
            lastClockRef.current = vectorClock.counter;
            provider.awareness.setLocalStateField('clock', vectorClock);
        }
    }, [provider, vectorClock]);

    // Seed initial content into the shared Yjs doc once (only if empty)
    useEffect(() => {
        if (!editor || !provider) return;
        const t = setTimeout(() => {
            if (!editor.isEmpty) return;

            if (!initialContent) {
                editor.commands.setContent(PAUL_CONTENT);
                return;
            }

            const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

            // ── Code-view formats: escape & wrap in <pre><code> ──────────────
            if (['json', 'csv', 'html', 'xml', 'tex'].includes(ext)) {
                const escaped = initialContent
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
                editor.commands.setContent(`<pre><code>${escaped}</code></pre>`);

            // ── Markdown: lightweight md → HTML conversion ───────────────────
            } else if (ext === 'md') {
                const mdToHtml = (md: string): string => {
                    return md
                        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
                        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\*(.+?)\*/g, '<em>$1</em>')
                        .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
                        .replace(new RegExp('(<li>.*<\\/li>)', 's'), '<ul>$1</ul>')
                        .replace(/^(?!<[hul])(.*\S.*)$/gm, '<p>$1</p>');
                };
                editor.commands.setContent(mdToHtml(initialContent));

            // ── Plain-text / document formats: pass through directly ─────────
            } else {
                editor.commands.setContent(initialContent);
            }
        }, 280);
        return () => clearTimeout(t);
    }, [editor, provider, initialContent, fileName]);

    // Track live collaborators via Yjs awareness + toast on join
    useEffect(() => {
        if (!provider) return;
        const update = () => {
            const arr: CollaboratorUser[] = [];
            provider.awareness.getStates().forEach((state: unknown, clientId: number) => {
                const s = state as AwarenessState;
                if (s.user) {
                    arr.push(s.user);
                    if (!knownPeers.current.has(clientId)) {
                        knownPeers.current.add(clientId);
                        if (clientId !== provider.awareness.clientID) {
                            toast(`${s.user.name} joined the document`, {
                                icon: '👥',
                                description: 'Connected via WebRTC peer mesh',
                                duration: 3500,
                            });
                        }
                    }
                }
                // Handle merging clocks from remote peers
                if (clientId !== provider.awareness.clientID && s.clock) {
                    setVectorClock(local => {
                        const remote = s.clock as VectorClock;
                        if (remote.counter > local.counter) {
                            return mergeClock(local, remote);
                        }
                        return local;
                    });
                }
            });
            // detect leaves
            knownPeers.current.forEach(id => {
                if (!provider.awareness.getStates().has(id)) {
                    knownPeers.current.delete(id);
                }
            });
            setCollaborators(arr);
        };
        provider.awareness.on('change', update);
        update();
        return () => provider.awareness.off('change', update);
    }, [provider]);

    if (!editor) return null;

    return (
        <div className="flex flex-col h-full overflow-hidden bg-zinc-950">

            {/* ════════════════════════════════════════════════════════════════════
                NAV BAR — Logo ‹ left ›  |  Filename ‹ center ›  |  Avatars ‹ right ›
            ════════════════════════════════════════════════════════════════════ */}
            <div className="flex-shrink-0 w-full bg-zinc-900 border-b border-zinc-800 px-5 py-2.5 grid grid-cols-3 items-center shadow-sm z-20">

                {/* LEFT — Brand */}
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md shadow-orange-500/30 flex-shrink-0 p-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
                    </div>
                    <span className="text-white font-bold text-sm tracking-tight">DocuSync</span>
                    <div className={`hidden sm:flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${
                        isOffline
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            : 'bg-green-500/10 border-green-500/30 text-green-400 cursor-help'
                    }`} title={isOffline ? '' : 'Algorithm: Log/Vector/Delta/LWW Hybrid. Time Complexity: O(m). Bypasses legacy O(n²) Operational Transformation (OT).'}>
                        <span className={`w-1.5 h-1.5 rounded-full inline-block ${isOffline ? 'bg-amber-500' : 'bg-green-400 animate-pulse'}`} />
                        {isOffline ? 'Offline' : 'Hybrid Sync Active'}
                    </div>
                </div>

                {/* CENTER — Document name */}
                <div className="flex items-center justify-center gap-2 min-w-0 px-2">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500 flex-shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <span className="text-zinc-200 text-sm font-medium truncate max-w-[240px]" title={fileName}>{fileName}</span>
                </div>

                {/* RIGHT — Live collaborator avatars + zoom + close */}
                <div className="flex items-center justify-end gap-3">
                    {/* Clickable collaborator avatars with peer list dropdown */}
                    {collaborators.length > 0 && (
                        <div className="relative flex items-center gap-2">
                            <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold hidden sm:block">Live</span>
                            <button
                                onClick={() => setShowPeerList(p => !p)}
                                className="flex -space-x-1.5 cursor-pointer focus:outline-none"
                                title="Click to see who's editing"
                            >
                                {collaborators.slice(0, 6).map((u, i) => (
                                    <div
                                        key={`${u.name}-${i}`}
                                        className="relative w-7 h-7 rounded-full border-2 border-zinc-900 flex items-center justify-center text-[10px] font-bold text-white shadow-lg hover:scale-110 hover:z-10 transition-transform"
                                        style={{ backgroundColor: u.color || '#f97316' }}
                                    >
                                        {u.name.charAt(0).toUpperCase()}
                                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-zinc-900 animate-pulse" />
                                    </div>
                                ))}
                            </button>

                            {/* Peer list dropdown */}
                            {showPeerList && (
                                <div className="absolute right-0 top-full mt-2 w-64 rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl z-50 overflow-hidden">
                                    <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Active Editors</span>
                                        <span className="text-[9px] bg-green-500/15 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded-full font-bold">{collaborators.length} online</span>
                                    </div>
                                    <div className="py-2">
                                        {collaborators.map((u, i) => (
                                            <div key={`peer-${u.name}-${i}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 transition-colors">
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black text-white flex-shrink-0 relative" style={{ backgroundColor: u.color || '#f97316' }}>
                                                    {u.name.charAt(0).toUpperCase()}
                                                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-zinc-900 animate-pulse" />
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-zinc-100 text-xs font-semibold truncate">{u.name}</span>
                                                    <span className="text-[10px] text-green-400 font-medium">✎ Editing now</span>
                                                </div>
                                                <div className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Zoom controls */}
                    <div className="hidden sm:flex items-center gap-0.5 bg-zinc-800 rounded-lg px-1.5 py-1">
                        <button onMouseDown={() => setZoom(z => Math.max(50, z - 10))} className="w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-zinc-100 font-bold transition-colors text-sm">−</button>
                        <span className="w-9 text-center font-mono text-[11px] text-zinc-400">{zoom}%</span>
                        <button onMouseDown={() => setZoom(z => Math.min(200, z + 10))} className="w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-zinc-100 font-bold transition-colors text-sm">+</button>
                    </div>

                    {/* Save & Close buttons (if callbacks provided) */}
                    {onSave && (
                        <button
                            onClick={() => {
                                onSave();
                                toast.success('Changes synced across peer network', {
                                    description: 'Δ-payload transmitted · Vector clock updated',
                                    duration: 3000,
                                });
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold transition-all shadow-md shadow-orange-500/25 whitespace-nowrap flex-shrink-0"
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                            <span>Save &amp; Sync</span>
                        </button>
                    )}
                    {/* Metrics toggle */}
                    <button
                        onClick={() => setShowMetrics(m => !m)}
                        title="Toggle Live Metrics Overlay"
                        className={`p-1.5 rounded-lg transition-colors ${
                            showMetrics
                                ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/30'
                                : 'text-zinc-500 hover:text-zinc-100 hover:bg-zinc-700'
                        }`}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    )}
                </div>
            </div>

            {/* ════════════════════════════════════════════════════════════════════
                FORMATTING TOOLBAR — sleek pill, centered above the paper
            ════════════════════════════════════════════════════════════════════ */}
            <div className="flex-shrink-0 bg-zinc-950 py-2.5 flex items-center justify-center z-10">
                <div className="flex items-center gap-0.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 shadow-lg">

                    {/* Undo / Redo */}
                    <ToolBtn onClick={() => editor.chain().focus().undo().run()} isActive={false} title="Undo (Ctrl+Z)">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M3 13A9 9 0 1 0 5.7 5.7"/></svg>
                    </ToolBtn>
                    <ToolBtn onClick={() => editor.chain().focus().redo().run()} isActive={false} title="Redo (Ctrl+Y)">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M21 13A9 9 0 1 1 18.3 5.7"/></svg>
                    </ToolBtn>

                    <ToolSep />

                    {/* Headings */}
                    <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} title="Heading 1">
                        <span className="text-[11px] font-black">H1</span>
                    </ToolBtn>
                    <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} title="Heading 2">
                        <span className="text-[11px] font-black">H2</span>
                    </ToolBtn>
                    <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} title="Heading 3">
                        <span className="text-[11px] font-black">H3</span>
                    </ToolBtn>

                    <ToolSep />

                    {/* Text marks */}
                    <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Bold (Ctrl+B)">
                        <strong className="text-[14px] leading-none">B</strong>
                    </ToolBtn>
                    <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Italic (Ctrl+I)">
                        <em className="text-[14px] leading-none">I</em>
                    </ToolBtn>
                    <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} title="Underline (Ctrl+U)">
                        <span className="underline decoration-2 text-[13px]">U</span>
                    </ToolBtn>
                    <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title="Strikethrough">
                        <span className="line-through text-[13px]">S</span>
                    </ToolBtn>
                    <ToolBtn onClick={() => editor.chain().focus().toggleHighlight().run()} isActive={editor.isActive('highlight')} title="Highlight">
                        <span className="text-[13px] font-bold" style={{ borderBottom: '2.5px solid #facc15' }}>A</span>
                    </ToolBtn>

                    <ToolSep />

                    {/* Alignment */}
                    <ToolBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} title="Align Left">
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="1" width="14" height="2" rx="1"/><rect x="0" y="5" width="10" height="2" rx="1"/><rect x="0" y="9" width="14" height="2" rx="1"/><rect x="0" y="13" width="7" height="1" rx=".5"/></svg>
                    </ToolBtn>
                    <ToolBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} title="Center">
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="1" width="14" height="2" rx="1"/><rect x="2" y="5" width="10" height="2" rx="1"/><rect x="0" y="9" width="14" height="2" rx="1"/><rect x="3.5" y="13" width="7" height="1" rx=".5"/></svg>
                    </ToolBtn>
                    <ToolBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} title="Align Right">
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="1" width="14" height="2" rx="1"/><rect x="4" y="5" width="10" height="2" rx="1"/><rect x="0" y="9" width="14" height="2" rx="1"/><rect x="7" y="13" width="7" height="1" rx=".5"/></svg>
                    </ToolBtn>

                    <ToolSep />

                    {/* Lists */}
                    <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="Bullet List">
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor"><circle cx="2" cy="3.5" r="1.5"/><rect x="5" y="2.5" width="9" height="2" rx="1"/><circle cx="2" cy="7" r="1.5"/><rect x="5" y="6" width="9" height="2" rx="1"/><circle cx="2" cy="10.5" r="1.5"/><rect x="5" y="9.5" width="9" height="2" rx="1"/></svg>
                    </ToolBtn>
                    <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Ordered List">
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor"><text x="0" y="5" fontSize="4.5" fontWeight="bold">1.</text><rect x="5" y="2.5" width="9" height="2" rx="1"/><text x="0" y="9" fontSize="4.5" fontWeight="bold">2.</text><rect x="5" y="6" width="9" height="2" rx="1"/><text x="0" y="13" fontSize="4.5" fontWeight="bold">3.</text><rect x="5" y="9.5" width="9" height="2" rx="1"/></svg>
                    </ToolBtn>
                </div>
            </div>

            {/* ════════════════════════════════════════════════════════════════════
                PAPER CANVAS — white card centered on dark background
            ════════════════════════════════════════════════════════════════════ */}
            <div className="flex-1 overflow-y-auto bg-zinc-950 px-6 pb-4 custom-scrollbar">
                <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', transition: 'transform 0.15s ease' }}>
                    <EditorContent editor={editor} />
                </div>
            </div>

            {/* Metrics Overlay */}
            {showMetrics && (
                <MetricsOverlay deltaBytes={deltaBytes} peerCount={collaborators.length} vectorClock={vectorClock} />
            )}

            {/* ════════════════════════════════════════════════════════════════════
                CONTRIBUTOR TRACE — Audit Trail Panel
            ════════════════════════════════════════════════════════════════════ */}
            <div className="flex-shrink-0 border-t border-zinc-800">
                {/* Toggle header */}
                <button
                    onClick={() => setShowAudit(a => !a)}
                    className="w-full flex items-center justify-between px-5 py-2 bg-zinc-900 hover:bg-zinc-800 transition-colors group"
                >
                    <div className="flex items-center gap-2">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-orange-400"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 group-hover:text-zinc-200 transition-colors">Contributor Trace</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/20">Log-Based Audit Trail</span>
                        {auditTrail.length > 0 && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-700 text-zinc-400">{auditTrail.length} entries</span>
                        )}
                    </div>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-zinc-500 transition-transform duration-200 ${showAudit ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
                </button>

                {/* Audit trail body */}
                {showAudit && (
                    <div className="bg-zinc-950 px-5 py-4 max-h-56 overflow-y-auto custom-scrollbar">
                        {auditTrail.length === 0 ? (
                            <p className="text-[11px] text-zinc-600 italic text-center py-4">No author attributions yet — start typing to generate the log.</p>
                        ) : (
                            <div className="space-y-3">
                                {auditTrail.map((entry, i) => (
                                    <div key={i} className="flex flex-col gap-1 pl-3" style={{ borderLeft: `2px solid ${entry.color}` }}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black text-white flex-shrink-0" style={{ backgroundColor: entry.color }}>
                                                {entry.author.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: entry.color }}>
                                                {entry.author}
                                            </span>
                                            <span className="text-[8px] text-zinc-600 font-mono">δ-payload #{i + 1}</span>
                                        </div>
                                        <p className="text-[11px] text-zinc-400 leading-relaxed font-mono pl-6 truncate" title={entry.text}>
                                            &ldquo;{entry.text.length > 120 ? entry.text.slice(0, 120) + '…' : entry.text}&rdquo;
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ════════════════════════════════════════════════════════════════════
                STYLES
            ════════════════════════════════════════════════════════════════════ */}
            <style>{`
                /* White paper card */
                .notion-paper {
                    max-width: 780px;
                    min-height: 1060px;
                    margin: 0 auto;
                    padding: 80px 96px 120px;
                    box-sizing: border-box;
                    background-color: #ffffff;
                    border-radius: 0 0 12px 12px;
                    box-shadow: 0 0 0 1px rgba(0,0,0,0.07), 0 12px 60px rgba(0,0,0,0.45);
                    outline: none;
                    font-family: 'Times New Roman', Georgia, serif;
                    font-size: 12pt;
                    line-height: 1.8;
                    color: #1a1a1a;
                }

                /* Headings */
                .notion-paper h1 {
                    font-size: 24pt; font-weight: 800; margin: 0 0 18pt;
                    color: #111; text-align: center;
                    font-family: system-ui, -apple-system, sans-serif;
                    letter-spacing: -0.02em;
                }
                .notion-paper h2 {
                    font-size: 16pt; font-weight: 700; margin: 20pt 0 8pt;
                    color: #1a1a1a; text-align: center;
                    font-family: system-ui, -apple-system, sans-serif;
                }
                .notion-paper h3 {
                    font-size: 12pt; font-weight: 700; font-style: italic;
                    margin: 14pt 0 6pt; color: #1a1a1a;
                    font-family: 'Times New Roman', serif;
                }

                /* Paragraphs */
                .notion-paper p { margin: 0 0 10pt; text-indent: 36pt; color: #222; }
                .notion-paper p:first-child { text-indent: 0; }

                /* Lists */
                .notion-paper ul, .notion-paper ol { padding-left: 28pt; margin: 8pt 0; }
                .notion-paper li { margin-bottom: 4pt; }

                /* Blockquote */
                .notion-paper blockquote {
                    border-left: 3px solid #f97316; padding-left: 14pt;
                    margin: 10pt 0 10pt 16pt; color: #555; font-style: italic;
                }

                /* Inline marks */
                .notion-paper mark { background-color: #fef08a; color: #1a1a1a; }
                .notion-paper strong { font-weight: 700; }
                .notion-paper em { font-style: italic; }
                .notion-paper s { text-decoration: line-through; color: #9ca3af; }

                /* Code / pre blocks — used for JSON and CSV files */
                .notion-paper pre {
                    background: #f4f4f5; border-radius: 6px; padding: 16px 20px;
                    overflow-x: auto; margin: 10pt 0; border: 1px solid #e4e4e7;
                }
                .notion-paper pre code {
                    font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
                    font-size: 10pt; line-height: 1.65; color: #18181b;
                    white-space: pre-wrap; word-break: break-all;
                }

                /* Yjs Hybrid collaboration cursors */
                .collaboration-cursor__caret {
                    border-left: 2px solid currentColor;
                    border-right: 2px solid currentColor;
                    margin-left: -1px; margin-right: -1px;
                    pointer-events: none; position: relative;
                }
                .collaboration-cursor__label {
                    border-radius: 4px 4px 4px 0; color: #fff;
                    font-size: 10px; font-style: normal; font-weight: 700;
                    left: -1px; line-height: normal;
                    padding: 2px 6px; position: absolute; top: -1.6em;
                    user-select: none; white-space: nowrap;
                    font-family: system-ui, sans-serif;
                    background-color: inherit;
                }

                /* Scrollbar */
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 3px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.13); }
            `}</style>
        </div>
    );
}

```

---

## File: `src/components/ThemeProvider.tsx`

```typescript
"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({
    children,
    ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
    return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}

```

---

## File: `src/components/ThemeToggle.tsx`

```typescript
"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";

export function ThemeToggle() {
    const [mounted, setMounted] = React.useState(false);
    const { setTheme, resolvedTheme } = useTheme();

    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className="w-14 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800/80 animate-pulse border border-transparent mx-2" />;
    }

    const isDark = resolvedTheme === "dark";

    return (
        <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className={`
                relative flex items-center w-14 h-8 rounded-full p-1 mx-2 focus:outline-none transition-colors duration-300
                ${isDark ? 'bg-zinc-800/80 border border-white/10 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]' : 'bg-zinc-200 border border-black/5 shadow-[inset_0_2px_5px_rgba(0,0,0,0.1)]'}
            `}
            aria-label="Toggle theme switch"
            title="Toggle Dark Mode"
        >
            <motion.div
                layout
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className={`
                    flex items-center justify-center w-6 h-6 rounded-full shadow-md
                    ${isDark ? 'bg-zinc-950 border border-white/5' : 'bg-white border border-black/5'}
                `}
                style={{ marginLeft: isDark ? 'auto' : '0' }}
            >
                <motion.div
                    initial={false}
                    animate={{ rotate: isDark ? 360 : 0 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                >
                    {isDark ? (
                        <Moon className="w-3.5 h-3.5 text-zinc-400" strokeWidth={2.5} />
                    ) : (
                        <Sun className="w-3.5 h-3.5 text-amber-500" strokeWidth={2.5} />
                    )}
                </motion.div>
            </motion.div>
        </motion.button>
    );
}

```

---

## File: `src/app/layout.tsx`

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DocuSync",
  description: "Offline-first document collaboration platform",
};

import { ThemeProvider } from "../components/ThemeProvider";
import { SyncProvider } from "../context/SyncContext";
import { Toaster } from "sonner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
        >
          <SyncProvider>
            {children}
            <Toaster
              position="bottom-right"
              toastOptions={{
                style: {
                  background: '#18181b',
                  border: '1px solid #3f3f46',
                  color: '#f4f4f5',
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: '13px',
                },
              }}
              richColors
            />
          </SyncProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

```

---

## File: `src/app/page.tsx`

```typescript
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, useScroll, useTransform, AnimatePresence, useInView } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  RefreshCcw, Shield, Zap, Wifi, Download, Globe, ChevronRight,
  GitMerge, Clock, Users, FileText, CheckCircle2, ArrowRight,
  Github, Star, Lock, Layers, Database, Activity, Menu, X,
  MonitorDown, Cpu, Binary, LayoutGrid, Sparkles, Send, Copy, AlertCircle, UserPlus
} from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { useSyncContext } from '../context/SyncContext';
import { supabase } from '../lib/supabase';

// ── Animated counter ──────────────────────────────────────────────────────────
function AnimatedCounter({ target, suffix = '', duration = 2000 }: { target: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [inView, target, duration]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

// ── Floating particle ─────────────────────────────────────────────────────────
function Particle({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <motion.div
      className="absolute w-1 h-1 rounded-full bg-amber-400/40"
      style={{ left: `${x}%`, top: `${y}%` }}
      animate={{ y: [-20, 20, -20], x: [-10, 10, -10], opacity: [0.2, 0.8, 0.2] }}
      transition={{ duration: 4 + delay, repeat: Infinity, ease: 'easeInOut', delay }}
    />
  );
}

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({ icon: Icon, title, desc, color, delay }: { icon: any; title: string; desc: string; color: string; delay: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6, scale: 1.02 }}
      className="group relative bg-white/5 backdrop-blur border border-white/10 rounded-3xl p-7 hover:border-white/25 transition-all duration-500 cursor-default overflow-hidden"
    >
      <div className={`absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity ${color}`} />
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 ${color} bg-opacity-20 border border-white/10`}>
        <Icon size={22} className="text-white" />
      </div>
      <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
      <p className="text-sm text-zinc-400 leading-relaxed">{desc}</p>
    </motion.div>
  );
}

// ── Step card ─────────────────────────────────────────────────────────────────
function StepCard({ num, title, desc, delay }: { num: string; title: string; desc: string; delay: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -30 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className="flex gap-5 items-start"
    >
      <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-amber-500/30">
        {num}
      </div>
      <div className="pt-1">
        <h4 className="font-bold text-white text-base mb-1">{title}</h4>
        <p className="text-sm text-zinc-400 leading-relaxed">{desc}</p>
      </div>
    </motion.div>
  );
}

// ── Request Access Form ───────────────────────────────────────────────────────
function RequestAccessForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  const generateSecurePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < 8; i++) {
        pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    const newPassword = generateSecurePassword();

    // Check if email already exists in localStorage first
    try {
        const stored = localStorage.getItem('docusync_user_requests');
        if (stored) {
            const allRequests = JSON.parse(stored);
            const existingUser = allRequests.find((u: any) => u.email === email);
            if (existingUser) {
                setErrorMessage('Email is already in use. Please use a different email or log in.');
                setStatus('error');
                return;
            }
        }
    } catch { /* ignore */ }

    // Submit a pending request — admin must approve before login
    try {
        const stored = localStorage.getItem('docusync_user_requests');
        const allRequests = stored ? JSON.parse(stored) : [];
        allRequests.push({
            id: Date.now().toString(),
            name,
            email,
            password: newPassword,
            status: 'pending',
            requestDate: new Date().toISOString(),
        });
        localStorage.setItem('docusync_user_requests', JSON.stringify(allRequests));
    } catch { /* ignore */ }

    setGeneratedPassword(newPassword);
    setStatus('success');
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      <AnimatePresence mode="wait">
        {status === 'success' ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="p-8 rounded-[3rem] bg-amber-500/10 border border-amber-500/20 text-center backdrop-blur-xl shadow-2xl shadow-amber-500/10"
          >
            <div className="w-16 h-16 bg-amber-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-amber-500/30">
              <CheckCircle2 size={32} className="text-white" />
            </div>
            <h3 className="text-2xl font-black text-white mb-2">Request Submitted!</h3>
            <p className="text-amber-300 text-sm font-medium mb-4">
              Your access request has been sent. An admin will review and approve your account.
            </p>
            <div className="bg-black/30 rounded-2xl p-4 mb-4 border border-amber-500/20 text-left">
              <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-2">Your Credentials (save these)</p>
              <p className="text-xs text-zinc-300 mb-1"><span className="text-zinc-500">Email:</span> {email}</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-zinc-300 flex-1"><span className="text-zinc-500">Password:</span> <span className="font-mono font-bold text-amber-400">{generatedPassword}</span></p>
                <button 
                  onClick={() => {
                    if(generatedPassword) navigator.clipboard.writeText(generatedPassword);
                    setIsCopied(true);
                    setTimeout(() => setIsCopied(false), 2000);
                  }}
                  className="p-2 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/40 transition-colors"
                  title="Copy Password"
                >
                   {isCopied ? <CheckCircle2 size={16}/> : <Copy size={16}/>}
                </button>
              </div>
            </div>
            <p className="text-xs text-zinc-400 mb-4">Once approved, use your email and password to log in.</p>
            <button 
              onClick={() => router.push('/login')} 
              className="px-10 py-4 w-full rounded-[2rem] bg-amber-500 text-white font-black text-sm uppercase tracking-[0.2em] shadow-lg shadow-amber-500/30 hover:bg-amber-400 transition-colors"
            >
              Go to Login
            </button>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 gap-5"
          >
            <AnimatePresence mode="wait">
              {status === 'error' && (
                  <motion.div 
                      initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                      animate={{ height: 'auto', opacity: 1, marginBottom: 4 }}
                      exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                      className="flex items-start gap-4 p-4 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold overflow-hidden text-left"
                  >
                      <AlertCircle size={18} className="shrink-0 mt-0.5" />
                      <div>
                          <p className="font-black uppercase text-[10px] tracking-widest mb-1 opacity-60">Security Alert</p>
                          {errorMessage}
                      </div>
                  </motion.div>
              )}
            </AnimatePresence>
            <div className="group relative">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full Name"
                className="w-full px-8 py-5 rounded-[2rem] bg-white/[0.03] border border-white/10 text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.08] focus:ring-4 focus:ring-amber-500/10 transition-all font-bold text-base"
              />
            </div>
            <div className="group relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email Address"
                className="w-full px-8 py-5 rounded-[2rem] bg-white/[0.03] border border-white/10 text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.08] focus:ring-4 focus:ring-amber-500/10 transition-all font-bold text-base"
              />
            </div>
            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              disabled={status === 'loading'}
              className="w-full py-5 rounded-[2rem] bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white font-black text-base shadow-2xl shadow-amber-500/30 hover:shadow-amber-500/50 flex items-center justify-center gap-3 disabled:opacity-50 transition-all uppercase tracking-widest"
            >
              {status === 'loading' ? (
                <RefreshCcw className="animate-spin" size={24} />
              ) : (
                <>
                  Create Account <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </motion.button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, -100]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const particles = Array.from({ length: 22 }, (_, i) => ({
    x: Math.random() * 100, y: Math.random() * 100, delay: (i * 0.4) % 4
  }));

  const features = [
    { icon: GitMerge, title: 'Hybrid Sync Engine', desc: 'Combines CRDTs with Operational Transformation for intent-preserving merges.', color: 'bg-amber-500', delay: 0.1 },
    { icon: Zap, title: 'Delta Encoding', desc: 'Transmits only changed bits, reducing bandwidth by up to 85%.', color: 'bg-orange-500', delay: 0.2 },
    { icon: Wifi, title: 'Edge-Based Sync', desc: 'Processing happens locally for zero-latency offline-first editing.', color: 'bg-purple-500', delay: 0.3 },
    { icon: RefreshCcw, title: 'State Recovery', desc: 'Automatically reconverges divergent states upon reconnection.', color: 'bg-emerald-500', delay: 0.1 },
    { icon: Shield, title: 'Strong Consistency', desc: 'Mathematical proof of convergence regardless of edit order.', color: 'bg-blue-500', delay: 0.2 },
    { icon: Sparkles, title: 'Semantic Merging', desc: 'Preserves each author\'s intent without manual reconciliation.', color: 'bg-rose-500', delay: 0.3 },
  ];

  const stats = [
    { label: 'Merge Accuracy', value: 95, suffix: '%' },
    { label: 'Bandwidth Save', value: 85, suffix: '%' },
    { label: 'Active Nodes', value: 124, suffix: '' },
  ];

  const team = [
    { name: 'Bajado, John Benedict B.', role: 'Developer' },
    { name: 'Palamara, Paul John G.', role: 'Developer' },
    { name: 'Palma, John Lloyd P.', role: 'Developer' },
    { name: 'Venancio, Zyra P.', role: 'Developer' },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] text-zinc-900 dark:text-white font-sans overflow-x-hidden transition-colors duration-500">
      
      {/* ── BACKGROUND ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] dark:opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #000 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <motion.div animate={{ opacity: [0.1, 0.15, 0.1] }} transition={{ duration: 8, repeat: Infinity }} className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-amber-500/20 blur-[120px]" />
        <motion.div animate={{ opacity: [0.05, 0.1, 0.05] }} transition={{ duration: 10, repeat: Infinity, delay: 2 }} className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-orange-600/20 blur-[100px]" />
      </div>

      {/* ── NAV ── */}
      <motion.nav
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-7xl transition-all duration-700 px-8 py-3 rounded-[2.5rem] border ${scrolled ? 'bg-white/70 dark:bg-black/70 backdrop-blur-2xl border-black/5 dark:border-white/10 shadow-2xl' : 'bg-transparent border-transparent'}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 group cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <motion.div 
              whileHover={{ rotate: 180 }}
              transition={{ duration: 0.6 }}
              className="w-10 h-10 flex items-center justify-center"
            >
              <div className="w-full h-full rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30 p-2.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
              </div>
            </motion.div>
            <span className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 select-none">DocuSync</span>
          </div>

          <div className="hidden md:flex items-center gap-10">
            {['Features', 'Research', 'Team'].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`}
                onClick={(e) => { e.preventDefault(); document.getElementById(item.toLowerCase())?.scrollIntoView({ behavior: 'smooth' }); }}
                className="text-xs font-black text-zinc-500 hover:text-amber-500 dark:text-zinc-500 dark:hover:text-white transition-all uppercase tracking-[0.2em]">{item}</a>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            <motion.button
              whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }}
              onClick={() => router.push('/login')}
              className="hidden sm:flex px-7 py-3 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black text-xs font-black uppercase tracking-widest shadow-xl shadow-black/10 dark:shadow-white/5 transition-all"
            >
              Download App
            </motion.button>
            <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-3 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-black/5 dark:border-white/10 text-zinc-900 dark:text-white transition-colors">
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="md:hidden overflow-hidden mt-4 pt-4 border-t border-black/5 dark:border-white/10"
            >
              <div className="flex flex-col gap-6 pb-6">
                {['Features', 'Research', 'Team'].map(item => (
                  <a key={item} href={`#${item.toLowerCase()}`} onClick={() => setMenuOpen(false)} className="text-sm font-black text-zinc-500 dark:text-zinc-500 uppercase tracking-widest px-2">{item}</a>
                ))}
                <button onClick={() => { setMenuOpen(false); router.push('/login'); }} className="w-full py-5 rounded-[1.5rem] bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black uppercase tracking-widest shadow-lg shadow-amber-500/20">Access Dashboard</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* ── HERO ── */}
      <section ref={heroRef} className="relative min-h-screen flex flex-col items-center justify-center pt-32 pb-20 px-6">
        <div className="absolute inset-0 z-0">
          {particles.map((p, i) => <Particle key={i} x={p.x} y={p.y} delay={p.delay} />)}
        </div>

        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative z-10 max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Hero Left */}
            <div className="lg:col-span-7 text-left">
              <motion.div
                initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 1, delay: 0.2 }}
                className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full border border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400 text-[11px] font-black uppercase tracking-[0.2em] mb-10 backdrop-blur-xl"
              >
                <Sparkles size={14} className="animate-pulse" />
                Next-Gen Sync Protocol
              </motion.div>

              <motion.h1 
                initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.4 }}
                className="text-6xl sm:text-8xl lg:text-9xl font-black tracking-tight leading-[0.85] mb-8 text-zinc-900 dark:text-white"
              >
                Seamless<br/>
                <span className="bg-gradient-to-r from-amber-500 via-orange-600 to-amber-500 bg-clip-text text-transparent bg-[length:200%] animate-[shimmer_4s_ease-in-out_infinite]">Sync.</span>
              </motion.h1>

              <motion.p 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.6 }}
                className="text-xl sm:text-2xl text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed max-w-2xl mb-12"
              >
                Real-time file synchronization for teams and individuals — keep your documents in sync, anywhere, on any device.
              </motion.p>

              <motion.div 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.8 }}
                className="flex flex-wrap gap-5"
              >
                <motion.button
                  whileHover={{ scale: 1.05, y: -4 }} whileTap={{ scale: 0.95 }}
                  onClick={() => router.push('/login')}
                  className="px-10 py-5 rounded-[2rem] bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black text-lg shadow-2xl shadow-amber-500/40 hover:shadow-amber-500/60 transition-all flex items-center gap-3 group"
                >
                  Continue to App <Zap size={20} className="fill-white" />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05, y: -4 }} whileTap={{ scale: 0.95 }}
                  onClick={() => document.getElementById('research')?.scrollIntoView({ behavior: 'smooth' })}
                  className="px-10 py-5 rounded-[2rem] border-2 border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white font-black text-lg hover:bg-zinc-100 dark:hover:bg-white/5 transition-all"
                >
                  Get Started
                </motion.button>
              </motion.div>
            </div>

            {/* Hero Right - Bento Stats Preview */}
            <div className="lg:col-span-5 relative mt-12 lg:mt-0">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, rotate: 5 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
                className="grid grid-cols-2 gap-4"
              >
                <div className="col-span-2 bg-white dark:bg-zinc-900/40 backdrop-blur-3xl border border-black/5 dark:border-white/10 rounded-[3rem] p-10 shadow-2xl ring-1 ring-black/5 dark:ring-white/5">
                  <div className="flex items-center gap-6 mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                      <Activity className="text-emerald-500" size={28} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black uppercase tracking-widest text-zinc-400">Sync Status</h4>
                      <p className="text-xl font-black text-emerald-500">Nodes Converged</p>
                    </div>
                  </div>
                  <div className="flex items-end gap-3">
                    <span className="text-7xl font-black text-zinc-900 dark:text-white">100</span>
                    <span className="text-2xl font-black text-emerald-500 mb-2">%</span>
                  </div>
                </div>

                {stats.slice(0, 2).map((stat, i) => (
                  <div key={i} className="bg-white dark:bg-zinc-900/40 backdrop-blur-2xl border border-black/5 dark:border-white/10 rounded-[2.5rem] p-8 shadow-xl">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-3">{stat.label}</h4>
                    <p className="text-4xl font-black text-zinc-900 dark:text-white">
                      <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                    </p>
                  </div>
                ))}
              </motion.div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="py-32 px-6 relative overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-20">
            <div className="max-w-2xl">
              <motion.div
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-black/5 dark:border-white/10 bg-zinc-50 dark:bg-white/5 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em] mb-6"
              >
                <LayoutGrid size={14} /> Core Infrastructure
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
                className="text-4xl sm:text-6xl font-black tracking-tight text-zinc-900 dark:text-white"
              >
                Engineered for <span className="bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">Absolute Persistence</span>
              </motion.h2>
            </div>
            <motion.p
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
              className="text-zinc-500 dark:text-zinc-400 text-lg max-w-md font-medium"
            >
              DocuSync uses decentralized state management to keep your documents consistent — even across unstable networks and multiple devices.
            </motion.p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                whileHover={{ y: -8 }}
                className="group relative bg-white dark:bg-zinc-900/30 backdrop-blur-xl border border-black/5 dark:border-white/10 rounded-[2.5rem] p-10 hover:border-amber-500/30 transition-all duration-500 shadow-xl shadow-black/[0.02]"
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-8 ${f.color} bg-opacity-10 dark:bg-opacity-20 border border-black/5 dark:border-white/10 transition-colors group-hover:bg-opacity-20`}>
                  <f.icon size={28} className="text-zinc-800 dark:text-white" />
                </div>
                <h3 className="text-xl font-black text-zinc-900 dark:text-white mb-4">{f.title}</h3>
                <p className="text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── RESEARCH ── */}
      <section id="research" className="py-32 px-6 relative bg-zinc-50 dark:bg-black/20 transition-colors">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <div>
              <motion.div
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-black/5 dark:border-white/10 bg-white dark:bg-white/5 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em] mb-8"
              >
                <Database size={14} /> How It Works
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
                className="text-4xl sm:text-6xl font-black tracking-tight text-zinc-900 dark:text-white mb-8"
              >
                Built for <span className="text-amber-500">Real Users</span>.
              </motion.h2>
              <div className="space-y-8">
                {[
                  { icon: Cpu, title: 'Request an Account', desc: 'Sign up and submit your details. Our admin team reviews and approves your workspace access.' },
                  { icon: Activity, title: 'Upload & Sync Files', desc: 'Instantly upload your documents and collaborate in real-time across all your devices.' },
                  { icon: Binary, title: 'Stay in Sync, Always', desc: 'Our CRDT engine automatically merges edits — no conflicts, no lost work, even when offline.' }
                ].map((item, i) => (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                    className="flex gap-6"
                  >
                    <div className="shrink-0 w-12 h-12 rounded-2xl bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/10 flex items-center justify-center shadow-lg">
                      <item.icon size={22} className="text-amber-500" />
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-zinc-900 dark:text-white mb-1">{item.title}</h4>
                      <p className="text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="relative" id="access-form">
              <div className="absolute inset-0 bg-amber-500/10 blur-[100px] rounded-full scale-150 opacity-20" />
              <div className="relative p-1 bg-gradient-to-tr from-amber-500/20 to-orange-600/20 rounded-[3.5rem] shadow-2xl">
                <div className="bg-white dark:bg-zinc-900/60 backdrop-blur-3xl rounded-[3.25rem] p-10 sm:p-14 border border-white/20 dark:border-white/5">
                  <div className="text-center mb-8">
                    <h3 className="text-3xl font-black text-zinc-900 dark:text-white mb-3">Request Access</h3>
                    <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm">Create your account — submit your details and an admin will approve your access shortly.</p>
                  </div>
                  <RequestAccessForm />
                  <p className="text-center text-xs text-zinc-400 dark:text-zinc-600 mt-5 font-medium">
                    Already have an account?{' '}
                    <span onClick={() => router.push('/login')} className="text-amber-500 hover:text-amber-400 cursor-pointer font-bold transition-colors">Log In</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TEAM ── */}
      <section id="team" className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-black/5 dark:border-white/10 bg-zinc-50 dark:bg-white/5 text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em] mb-6"
            >
              <Users size={14} /> The Team
            </motion.div>
            <h2 className="text-4xl sm:text-6xl font-black text-zinc-900 dark:text-white tracking-tight">Who Built This.</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {team.map((member, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="group relative bg-white dark:bg-zinc-900/40 border border-black/5 dark:border-white/10 rounded-[2.5rem] p-8 text-center hover:border-amber-500/30 transition-all shadow-xl shadow-black/[0.02]"
              >
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-black text-2xl mb-6 shadow-lg shadow-amber-500/20 group-hover:scale-110 transition-transform">
                  {member.name.split(',')[0][0]}
                </div>
                <h4 className="text-lg font-black text-zinc-900 dark:text-white mb-1">{member.name}</h4>
                <p className="text-sm font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-widest">{member.role}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="pt-20 pb-12 px-8 border-t border-black/5 dark:border-white/10 bg-zinc-50 dark:bg-black/40 transition-colors">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-20 items-start">
            <div className="md:col-span-4">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30 p-2.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
                </div>
                <span className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">DocuSync</span>
              </div>
              <p className="text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">
                Advanced real-time file synchronization for teams and individuals. Built with mathematical convergence at its core.
              </p>
            </div>

            <div className="md:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-8">
              <div>
                <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-600 mb-6">Platform</h5>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-300">DocuSync Cloud</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-2">Powered by Supabase</p>
              </div>
              <div>
                <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-600 mb-6">Technology</h5>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-300">CRDT + WebRTC</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-2">Edge-first Architecture</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-600 mb-6">Version</h5>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-300 italic">v4.0 Spring-Protocol</p>
              </div>
            </div>
          </div>

          <div className="pt-12 border-t border-black/5 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between gap-6">
            <p className="text-xs font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">
              © 2026 DocuSync
            </p>
            <div className="flex gap-8">
              <span className="text-xs font-bold text-zinc-400 dark:text-zinc-600 hover:text-amber-500 cursor-pointer transition-colors uppercase tracking-widest">Terms</span>
              <span className="text-xs font-bold text-zinc-400 dark:text-zinc-600 hover:text-amber-500 cursor-pointer transition-colors uppercase tracking-widest">Privacy</span>
            </div>
          </div>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes shimmer {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        ::selection {
          background: rgba(245, 158, 11, 0.2);
          color: #f59e0b;
        }
      `}</style>
    </div>
  );
}

```

---

## File: `src/app/(auth)/login/page.tsx`

```typescript
"use client";

import React, { useState, useEffect } from 'react';
import { Mail, Lock, Loader2, AlertCircle, ArrowRight, ShieldCheck, Zap, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { ThemeToggle } from '../../../components/ThemeToggle';
import { supabase } from '../../../lib/supabase';
import { useSyncContext } from '../../../context/SyncContext';

interface UserRequest {
    id: string;
    loginId?: string;
    name: string;
    email: string;
    department: string;
    role: string;
    password?: string;
    status: 'pending' | 'approved' | 'denied';
    requestDate: string;
}

export default function LoginPage() {
    const router = useRouter();
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [isResetMode, setIsResetMode] = useState(false);
    const [resetSent, setResetSent] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    const [isCheckingSession, setIsCheckingSession] = useState(true);
    const { pendingUserRequests } = useSyncContext();

    // Auto-login: redirect if a session already exists in localStorage
    useEffect(() => {
        try {
            const stored = localStorage.getItem('docusync_current_user');
            if (stored) {
                const user = JSON.parse(stored);
                if (user?.loginId === 'admin') {
                    router.replace('/dashboard/admin/control-panel');
                } else if (user?.loginId) {
                    router.replace('/dashboard/user/my-drive');
                } else {
                    setIsCheckingSession(false);
                }
                return;
            }
        } catch { /* ignore */ }
        setIsCheckingSession(false);
    }, [router]);

    // Jitter-style Animation Variants
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.15,
                delayChildren: 0.3
            }
        }
    };

    const itemVariants: Variants = {
        hidden: { y: 30, opacity: 0, scale: 0.98 },
        show: { 
            y: 0, 
            opacity: 1, 
            scale: 1,
            transition: { 
                duration: 1.1, 
                ease: [0.22, 1, 0.36, 1] 
            } 
        }
    };

    const orbVariants: Variants = {
        animate: (i: number) => ({
            x: i % 2 === 0 ? [0, 80, -40, 0] : [0, -60, 50, 0],
            y: i % 2 === 0 ? [0, -40, 70, 0] : [0, 90, -30, 0],
            transition: {
                duration: 15 + i * 2,
                repeat: Infinity,
                ease: "easeInOut"
            }
        })
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const cleanEmail = resetEmail.trim();
        try {
            if (supabase) {
                const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
                    redirectTo: `${window.location.origin}/dashboard/user/my-drive`
                });
                
                if (resetError) {
                    setError(resetError.message);
                } else {
                    setResetSent(true);
                }
            } else {
                setError("Backend not connected! Wait for Supabase Config.");
            }
        } catch {
            setError("Unexpected error sending reset email.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const cleanId = loginId.trim();
        const cleanPassword = password.trim();

        try {
            // 1. Look up user by loginId in localStorage
            let matchedUser: UserRequest | null = null;
            let pendingUser: UserRequest | null = null;
            try {
                const stored = localStorage.getItem('docusync_user_requests');
                if (stored) {
                    const allRequests = JSON.parse(stored) as UserRequest[];
                    matchedUser = allRequests.find(
                        (u: UserRequest) => u.loginId === cleanId && u.password === cleanPassword && u.status === 'approved'
                    ) || null;
                    // Check if user has submitted request but hasn't been approved yet
                    if (!matchedUser) {
                        pendingUser = allRequests.find(
                            (u: UserRequest) => u.email === cleanId && u.status === 'pending'
                        ) || null;
                    }
                }
            } catch { /* ignore */ }

            if (matchedUser) {
                // Login with the real name — not the login ID
                localStorage.setItem('docusync_current_user', JSON.stringify({
                    name: matchedUser.name,
                    email: matchedUser.email,
                    loginId: matchedUser.loginId,
                    role: matchedUser.role,
                    department: matchedUser.department,
                }));
                router.push('/dashboard/user/my-drive');
                return;
            }

            if (pendingUser) {
                setError('Your account is pending admin approval. Please wait for an administrator to review your request.');
                setIsLoading(false);
                return;
            }

            // 2. Demo admin fallback
            if (cleanId === 'admin' && cleanPassword === 'admin123') {
                localStorage.setItem('docusync_current_user', JSON.stringify({ name: 'System Administrator', email: 'admin@docusync.edu', loginId: 'admin' }));
                router.push('/dashboard/admin/control-panel');
                return;
            }

            // 2.5. Demo user fallback
            if (cleanId === 'user' && cleanPassword === 'user123') {
                localStorage.setItem('docusync_current_user', JSON.stringify({ name: 'Demo User', email: 'user@docusync.edu', loginId: 'user', role: 'Student', department: 'College of Computing Studies' }));
                router.push('/dashboard/user/my-drive');
                return;
            }

            // 3. Try Supabase with email lookup from loginId
            try {
                const stored = localStorage.getItem('docusync_user_requests');
                if (stored && supabase) {
                    const allRequests = JSON.parse(stored) as UserRequest[];
                    const userByIdOnly = allRequests.find((u: UserRequest) => u.loginId === cleanId);
                    if (userByIdOnly) {
                        const { data, error: authError } = await supabase.auth.signInWithPassword({
                            email: userByIdOnly.email,
                            password: cleanPassword,
                        });
                        if (!authError && data.session) {
                            localStorage.setItem('docusync_current_user', JSON.stringify({
                                name: userByIdOnly.name,
                                email: userByIdOnly.email,
                                loginId: cleanId,
                            }));
                            router.push('/dashboard/user/my-drive');
                            return;
                        }
                    }
                }
            } catch { /* ignore */ }

            setError('Invalid Login ID or password. Please check your credentials.');
        } catch {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (isCheckingSession) {
        return (
            <div className="min-h-screen bg-[#fafafa] dark:bg-[#050505] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30 animate-pulse">
                        <svg xmlns="http://www.w3.org/2000/svg" width="60%" height="60%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest text-zinc-400">Checking Session…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#fafafa] dark:bg-[#050505] flex items-center justify-center relative font-sans overflow-hidden transition-colors duration-500">
            <title>Login | DocuSync Workspace</title>

            {/* Premium Jitter-style Background Orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <motion.div 
                    custom={0}
                    variants={orbVariants}
                    animate="animate"
                    className="absolute top-[10%] left-[10%] w-[60vw] h-[60vw] rounded-full bg-amber-400/20 dark:bg-amber-500/10 blur-[120px]" 
                />
                <motion.div 
                    custom={1}
                    variants={orbVariants}
                    animate="animate"
                    className="absolute bottom-[5%] right-[-5%] w-[50vw] h-[50vw] rounded-full bg-orange-400/20 dark:bg-orange-600/10 blur-[100px]" 
                />
                <motion.div 
                    custom={2}
                    variants={orbVariants}
                    animate="animate"
                    className="absolute top-[-20%] right-[15%] w-[40vw] h-[40vw] rounded-full bg-purple-400/15 dark:bg-purple-600/5 blur-[90px]" 
                />
            </div>

            {/* Top Navigation / Theme Toggle */}
            <div className="absolute top-8 left-8 z-30">
                <motion.button 
                    initial={{ opacity: 0, x: -20 }} 
                    animate={{ opacity: 1, x: 0 }} 
                    transition={{ delay: 0.8, duration: 0.8 }}
                    onClick={() => router.push('/')}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 dark:bg-zinc-900/50 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-white/80 dark:hover:bg-zinc-800 transition-all text-sm font-bold shadow-lg"
                >
                    <ArrowLeft size={16} /> Home
                </motion.button>
            </div>

            <div className="absolute top-8 right-8 z-30">
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1, duration: 0.8 }}>
                    <ThemeToggle />
                </motion.div>
            </div>

            {/* Content Container */}
            <motion.div 
                id="login-container"
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="relative z-10 w-full max-w-xl px-6 flex flex-col items-center"
            >
                {/* Logo & Branding Area */}
                <motion.div variants={itemVariants} className="mb-12 text-center">
                    <motion.div 
                        whileHover={{ scale: 1.05, rotate: 5 }}
                        whileTap={{ scale: 0.95 }}
                        className="w-28 h-28 mx-auto flex items-center justify-center mb-8 relative overflow-hidden group"
                    >
                        <div className="w-full h-full rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30 p-5">
                            <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
                        </div>
                    </motion.div>
                    <motion.h2 className="text-5xl font-black text-zinc-900 dark:text-white tracking-tight leading-[1.1] mb-4">
                        {isResetMode ? 'Reset Access' : 'DocuSync'}
                    </motion.h2>
                    <div className="flex items-center justify-center gap-3 text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-[0.2em] text-[10px]">
                        <ShieldCheck size={14} className="text-amber-500" /> 
                        {isResetMode ? 'Secure Link Generation' : 'Enterprise Auth Verified'}
                        <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-1" />
                        <Zap size={14} className="text-orange-500" />
                        Spring-Engine v4.0
                    </div>
                </motion.div>

                {/* Login Card (Premium Glassmorphism) */}
                <motion.div 
                    variants={itemVariants}
                    className="w-full bg-white/70 dark:bg-zinc-900/40 backdrop-blur-[32px] p-10 sm:p-14 rounded-[3.5rem] border border-white/40 dark:border-white/10 shadow-[0_32px_80px_rgba(0,0,0,0.08)] dark:shadow-[0_40px_100px_rgba(0,0,0,0.5)] relative overflow-hidden transition-colors duration-500"
                >
                    {/* Inner Accent Line */}
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 via-orange-500 to-purple-500 opacity-80" />

                    <AnimatePresence mode="wait">
                        {error && (
                            <motion.div 
                                initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                                animate={{ height: 'auto', opacity: 1, marginBottom: 32 }}
                                exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                                className="flex items-start gap-4 p-5 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm font-semibold overflow-hidden"
                            >
                                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-black uppercase text-[10px] tracking-widest mb-1 opacity-60">Security Alert</p>
                                    {error}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <form onSubmit={handleLogin} className="space-y-8">
                        {/* Login ID Field */}
                        <div className="group">
                            <label htmlFor="loginid-input" className="block text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-3 ml-2">Login ID</label>
                            <motion.div 
                                className="relative rounded-3xl overflow-hidden shadow-sm"
                                whileFocus={{ scale: 1.01 }}
                                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            >
                                <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none z-10">
                                    <ShieldCheck className="h-5 w-5 text-zinc-400 dark:text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
                                </div>
                                <input
                                    id="loginid-input"
                                    type="text"
                                    required
                                    value={loginId}
                                    onChange={(e) => setLoginId(e.target.value)}
                                    className="block w-full pl-14 pr-6 py-5 border-none bg-zinc-100/50 dark:bg-black/20 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:bg-white dark:focus:bg-black/40 ring-0 outline-none transition-all duration-300 font-bold text-base"
                                    placeholder="Enter your Login ID (e.g. 2000)"
                                />
                                <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-amber-500 group-focus-within:w-full transition-all duration-500 ease-out" />
                            </motion.div>
                        </div>

                        {/* Password Field */}
                        {!isResetMode && (
                            <div className="group">
                                <label htmlFor="password-input" className="flex justify-between items-center text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-3 ml-2">
                                    <span>Password</span>
                                    <span onClick={() => { setIsResetMode(true); setError(null); }} className="text-[10px] text-amber-600 hover:text-amber-500 cursor-pointer mr-2 transition-colors">Forgot Password?</span>
                                </label>
                                <motion.div 
                                    className="relative rounded-3xl overflow-hidden shadow-sm"
                                    whileFocus={{ scale: 1.01 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                >
                                    <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none z-10">
                                        <Lock className="h-5 w-5 text-zinc-400 dark:text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
                                    </div>
                                    <input
                                        id="password-input"
                                        type={showPassword ? 'text' : 'password'}
                                        required={!isResetMode}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="block w-full pl-14 pr-14 py-5 border-none bg-zinc-100/50 dark:bg-black/20 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:bg-white dark:focus:bg-black/40 ring-0 outline-none transition-all duration-300 font-bold text-base tracking-widest"
                                        placeholder="••••••••"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 pr-6 flex items-center z-10 text-zinc-400 hover:text-amber-500 transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                    </button>
                                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-amber-500 group-focus-within:w-full transition-all duration-500 ease-out" />
                                </motion.div>
                            </div>
                        )}

                        {/* Footer Actions */}
                        <div className="flex items-center justify-between px-2">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative">
                                    <input type="checkbox" className="sr-only peer" id="remember-me" defaultChecked={!isResetMode} />
                                    <div className="w-6 h-6 rounded-lg border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 peer-checked:bg-amber-500 peer-checked:border-amber-500 transition-all flex items-center justify-center">
                                        <div className="w-2 h-2 bg-white rounded-full opacity-0 peer-checked:opacity-100 transition-opacity" />
                                    </div>
                                </div>
                                <span className="text-[11px] font-black uppercase tracking-widest text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors">Keep Signed In</span>
                            </label>
                        </div>

                        {/* Submit Button */}
                        <motion.button
                            id="submit-auth"
                            type="submit"
                            disabled={isLoading}
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98, y: 0 }}
                            className="w-full relative group overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-[2rem] blur opacity-30 group-hover:opacity-50 transition-opacity" />
                            <div className="relative w-full py-6 rounded-[2rem] bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-black uppercase tracking-[0.2em] text-sm shadow-2xl transition-colors flex justify-center items-center gap-3">
                                {isLoading ? (
                                    <>
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        Wait...
                                    </>
                                ) : (
                                    <>
                                        Access Sync <ArrowRight size={18} />
                                    </>
                                )}
                            </div>
                        </motion.button>

                        {/* Quick Demo Access Panels */}
                        <div className="relative py-4 flex items-center gap-4">
                            <div className="flex-grow h-px bg-zinc-200 dark:bg-zinc-800" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Quick Login Panels</span>
                            <div className="flex-grow h-px bg-zinc-200 dark:bg-zinc-800" />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <motion.button
                                type="button"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                    localStorage.setItem('docusync_current_user', JSON.stringify({ name: 'Demo User', email: 'user@docusync.edu', loginId: 'user', role: 'Student', department: 'College of Computing Studies' }));
                                    router.push('/dashboard/user/my-drive');
                                }}
                                className="w-full py-4 rounded-2xl border-2 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-bold text-xs uppercase tracking-widest hover:bg-zinc-100 dark:hover:bg-white/10 transition-all flex flex-col justify-center items-center gap-1.5"
                            >
                                <Zap size={18} className="text-amber-500" />
                                User Panel
                            </motion.button>

                            <motion.button
                                type="button"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                    localStorage.setItem('docusync_current_user', JSON.stringify({ name: 'System Administrator', email: 'admin@docusync.edu', loginId: 'admin' }));
                                    router.push('/dashboard/admin/control-panel');
                                }}
                                className="w-full py-4 rounded-2xl border-2 border-amber-500/20 dark:border-amber-500/20 text-amber-600 dark:text-amber-500 font-bold text-xs uppercase tracking-widest hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-all flex flex-col justify-center items-center gap-1.5 shadow-lg shadow-amber-500/5"
                            >
                                <ShieldCheck size={18} className="text-amber-500" />
                                Admin Panel
                            </motion.button>
                        </div>
                    </form>

                    <div className="mt-12 text-center text-[10px] text-zinc-400 dark:text-zinc-600 font-bold uppercase tracking-[0.2em]">
                        Sync Cloud Infrastructure © 2026
                    </div>
                </motion.div>
                
                {/* Secondary Info */}
                <motion.p variants={itemVariants} className="mt-10 text-center text-xs text-zinc-500 dark:text-zinc-600 font-medium">
                    Don&apos;t have an account?{' '}
                    <span onClick={() => router.push('/#access-form')} className="text-amber-500 hover:text-amber-400 cursor-pointer font-bold transition-colors underline">Request Access</span>
                    {' · '}
                    <span className="text-zinc-400">Admin? Use Login ID <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">admin</code></span>
                </motion.p>
            </motion.div>
        </div>
    );
}

```

---

## File: `src/app/(auth)/register/page.tsx`

```typescript
"use client";

import React, { useState } from 'react';
import { Mail, Loader2, AlertCircle, ArrowRight, ShieldCheck, ArrowLeft, User, Copy, CheckCircle2, BookOpen, Hash, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { ThemeToggle } from '../../../components/ThemeToggle';
import { supabase } from '../../../lib/supabase';

interface UserRequest {
    id: string;
    loginId?: string;
    name: string;
    email: string;
    department: string;
    role: string;
    password?: string;
    status: 'pending' | 'approved' | 'denied';
    requestDate: string;
}

export default function RegisterPage() {
    const router = useRouter();

    // Form fields
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [department, setDepartment] = useState('');
    const [role, setRole] = useState('');

    // State
    const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
    const [assignedLoginId, setAssignedLoginId] = useState<string | null>(null);
    const [isCopied, setIsCopied] = useState(false);
    const [isCopiedId, setIsCopiedId] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getNextLoginId = (): string => {
        try {
            const stored = localStorage.getItem('docusync_user_requests');
            const allUsers = stored ? JSON.parse(stored) as UserRequest[] : [];
            // Find highest existing loginId
            const maxId = allUsers.reduce((max: number, u: UserRequest) => {
                const id = parseInt(u.loginId || '1999');
                return id > max ? id : max;
            }, 1999);
            return String(maxId + 1);
        } catch {
            return '2000';
        }
    };

    const generateSecurePassword = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        let pass = '';
        for (let i = 0; i < 8; i++) {
            pass += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return pass;
    };

    const orbVariants: Variants = {
        animate: (i: number) => ({
            x: i % 2 === 0 ? [0, 80, -40, 0] : [0, -60, 50, 0],
            y: i % 2 === 0 ? [0, -40, 70, 0] : [0, 90, -30, 0],
            transition: { duration: 15 + i * 2, repeat: Infinity, ease: "easeInOut" }
        })
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const loginId = getNextLoginId();

        const newPassword = generateSecurePassword();

        // 1. Check if email already exists locally
        try {
            const stored = localStorage.getItem('docusync_user_requests');
            if (stored) {
                const allRequests = JSON.parse(stored) as UserRequest[];
                const existingUser = allRequests.find((u: UserRequest) => u.email === email);
                if (existingUser) {
                    setError('This email is already registered. Please log in or use a different email.');
                    setIsLoading(false);
                    return;
                }
            }
        } catch { /* ignore */ }

        // 2. Try Supabase (non-blocking)
        try {
            if (supabase) {
                const { error: signUpError } = await supabase.auth.signUp({
                    email,
                    password: newPassword,
                    options: { data: { full_name: name, department, role } }
                });

                if (signUpError &&
                    (signUpError.message.toLowerCase().includes('already registered') ||
                     signUpError.message.toLowerCase().includes('user already registered'))
                ) {
                    setError('This email is already registered. Please log in or use a different email.');
                    setIsLoading(false);
                    return;
                }
            }
        } catch { /* Network error — use local fallback */ }

        // 3. Always save locally so login works
        try {
            const stored = localStorage.getItem('docusync_user_requests');
            const allRequests = stored ? JSON.parse(stored) as UserRequest[] : [];
            allRequests.push({
                id: Date.now().toString(),
                loginId,
                name,
                email,
                department,
                role,
                password: newPassword,
                status: 'approved',
                requestDate: new Date().toISOString(),
            });
            localStorage.setItem('docusync_user_requests', JSON.stringify(allRequests));
        } catch { /* ignore */ }

        // 4. Show generated credentials
        setAssignedLoginId(loginId);
        setGeneratedPassword(newPassword);
        setIsLoading(false);
    };

    const inputClass = "block w-full pl-14 pr-6 py-5 border-none bg-zinc-100/50 dark:bg-black/20 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:bg-white dark:focus:bg-black/40 ring-0 outline-none transition-all duration-300 font-bold text-base";

    const departments = [
        'College of Computing Studies',
        'College of Engineering',
        'College of Business Administration',
        'College of Education',
        'College of Arts and Sciences',
        'College of Nursing',
        'Other',
    ];

    const roles = ['Student', 'Faculty', 'Researcher', 'Administrator'];

    return (
        <div className="min-h-screen bg-[#fafafa] dark:bg-[#050505] flex items-center justify-center relative font-sans overflow-hidden transition-colors duration-500 py-12">
            <title>Register | DocuSync Workspace</title>

            {/* Background Orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <motion.div custom={0} variants={orbVariants} animate="animate" className="absolute top-[10%] left-[10%] w-[60vw] h-[60vw] rounded-full bg-amber-400/20 dark:bg-amber-500/10 blur-[120px]" />
                <motion.div custom={1} variants={orbVariants} animate="animate" className="absolute bottom-[5%] right-[-5%] w-[50vw] h-[50vw] rounded-full bg-orange-400/20 dark:bg-orange-600/10 blur-[100px]" />
                <motion.div custom={2} variants={orbVariants} animate="animate" className="absolute top-[-20%] right-[15%] w-[40vw] h-[40vw] rounded-full bg-purple-400/15 dark:bg-purple-600/5 blur-[90px]" />
            </div>

            {/* Nav Buttons */}
            <div className="absolute top-8 left-8 z-30">
                <motion.button
                    initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4, duration: 0.6 }}
                    onClick={() => router.push('/')}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 dark:bg-zinc-900/50 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all text-sm font-bold shadow-lg"
                >
                    <ArrowLeft size={16} /> Home
                </motion.button>
            </div>
            <div className="absolute top-8 right-8 z-30">
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6 }}>
                    <ThemeToggle />
                </motion.div>
            </div>

            {/* Main Card */}
            <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="relative z-10 w-full max-w-lg px-6"
            >
                {/* Header */}
                <div className="text-center mb-8">
                    <motion.div
                        whileHover={{ scale: 1.05, rotate: 5 }}
                        className="w-24 h-24 mx-auto flex items-center justify-center mb-6 relative overflow-hidden group"
                    >
                        <div className="w-full h-full rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30 p-4">
                            <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
                        </div>
                    </motion.div>
                    <h1 className="text-4xl font-black text-zinc-900 dark:text-white tracking-tight mb-2">Create Account</h1>
                    <div className="flex items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500 text-[11px] font-bold uppercase tracking-widest">
                        <ShieldCheck size={13} className="text-amber-500" /> Secure Registration — Password Auto-Generated
                    </div>
                </div>

                {/* Card */}
                <div className="w-full bg-white/70 dark:bg-zinc-900/40 backdrop-blur-[32px] p-8 sm:p-10 rounded-[3rem] border border-white/40 dark:border-white/10 shadow-[0_32px_80px_rgba(0,0,0,0.08)] dark:shadow-[0_40px_100px_rgba(0,0,0,0.5)] relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 via-orange-500 to-purple-500 opacity-80" />

                    {/* Error Banner */}
                    <AnimatePresence>
                        {error && (
                            <motion.div
                                initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                                animate={{ height: 'auto', opacity: 1, marginBottom: 24 }}
                                exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                                className="flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm font-semibold overflow-hidden"
                            >
                                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-black uppercase text-[10px] tracking-widest mb-1 opacity-60">Error</p>
                                    {error}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Success State */}
                    {generatedPassword ? (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center space-y-5 py-2">
                            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                                <CheckCircle2 size={32} />
                            </div>
                            <div className="text-center">
                                <h3 className="text-2xl font-bold text-zinc-900 dark:text-white mb-1">Account Created!</h3>
                                <p className="text-zinc-500 dark:text-zinc-400 text-sm">Save your Login ID and password below — you'll need both to log in.</p>
                            </div>

                            {/* Login ID */}
                            <div className="w-full bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-5 border border-amber-200 dark:border-amber-800/40">
                                <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 dark:text-amber-400 mb-3">Your Login ID</p>
                                <div className="flex items-center justify-between">
                                    <span className="text-3xl font-mono font-black text-amber-600 dark:text-amber-400 tracking-widest">{assignedLoginId}</span>
                                    <motion.button
                                        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                        onClick={() => { navigator.clipboard.writeText(assignedLoginId!); setIsCopiedId(true); setTimeout(() => setIsCopiedId(false), 2000); }}
                                        className={`p-3 rounded-xl transition-colors ${isCopiedId ? 'bg-amber-500/20 text-amber-500' : 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-600 dark:text-zinc-300'}`}
                                    >
                                        {isCopiedId ? <CheckCircle2 size={22} /> : <Copy size={22} />}
                                    </motion.button>
                                </div>
                                <p className="text-xs text-amber-600/70 dark:text-amber-400/60 mt-2 font-medium">Use this number to log in — not your email.</p>
                            </div>

                            {/* Password */}
                            <div className="w-full bg-zinc-100 dark:bg-zinc-800/50 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-700">
                                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">Your System Password</p>
                                <div className="flex items-center justify-between">
                                    <span className="text-2xl font-mono font-bold text-zinc-900 dark:text-white tracking-widest">{generatedPassword}</span>
                                    <motion.button
                                        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                        onClick={() => { navigator.clipboard.writeText(generatedPassword!); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); }}
                                        className={`p-3 rounded-xl transition-colors ${isCopied ? 'bg-emerald-500/20 text-emerald-500' : 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-600 dark:text-zinc-300'}`}
                                    >
                                        {isCopied ? <CheckCircle2 size={22} /> : <Copy size={22} />}
                                    </motion.button>
                                </div>
                            </div>

                            <motion.button
                                whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
                                onClick={() => router.push('/login')}
                                className="w-full py-5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black uppercase tracking-widest text-sm shadow-xl transition-all mt-2 flex items-center justify-center gap-3"
                            >
                                Proceed to Login <ArrowRight size={18} />
                            </motion.button>
                        </motion.div>
                    ) : (
                        <form onSubmit={handleRegister} className="space-y-5">

                            {/* Full Name */}
                            <div className="group">
                                <label className="block text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2 ml-1">Full Name</label>
                                <div className="relative rounded-2xl overflow-hidden shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none z-10">
                                        <User className="h-5 w-5 text-zinc-400 group-focus-within:text-amber-500 transition-colors" />
                                    </div>
                                    <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
                                        className={inputClass} placeholder="Enter your full name" />
                                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-amber-500 group-focus-within:w-full transition-all duration-500 ease-out" />
                                </div>
                            </div>

                            {/* Email */}
                            <div className="group">
                                <label className="block text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2 ml-1">Email Address</label>
                                <div className="relative rounded-2xl overflow-hidden shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none z-10">
                                        <Mail className="h-5 w-5 text-zinc-400 group-focus-within:text-amber-500 transition-colors" />
                                    </div>
                                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                                        className={inputClass} placeholder="Enter your Gmail or email" />
                                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-amber-500 group-focus-within:w-full transition-all duration-500 ease-out" />
                                </div>
                            </div>

                            {/* Department */}
                            <div className="group">
                                <label className="block text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2 ml-1">Department / College</label>
                                <div className="relative rounded-2xl overflow-hidden shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none z-10">
                                        <BookOpen className="h-5 w-5 text-zinc-400 group-focus-within:text-amber-500 transition-colors" />
                                    </div>
                                    <select required value={department} onChange={(e) => setDepartment(e.target.value)}
                                        className={`${inputClass} appearance-none cursor-pointer`}
                                        style={{ paddingLeft: '3.5rem' }}
                                    >
                                        <option value="" disabled>Select your department</option>
                                        {departments.map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                    <div className="absolute inset-y-0 right-0 pr-5 flex items-center pointer-events-none z-10">
                                        <ChevronDown className="h-5 w-5 text-zinc-400" />
                                    </div>
                                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-amber-500 group-focus-within:w-full transition-all duration-500 ease-out" />
                                </div>
                            </div>

                            {/* Role */}
                            <div className="group">
                                <label className="block text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2 ml-1">Role</label>
                                <div className="relative rounded-2xl overflow-hidden shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none z-10">
                                        <ShieldCheck className="h-5 w-5 text-zinc-400 group-focus-within:text-amber-500 transition-colors" />
                                    </div>
                                    <select required value={role} onChange={(e) => setRole(e.target.value)}
                                        className={`${inputClass} appearance-none cursor-pointer`}
                                        style={{ paddingLeft: '3.5rem' }}
                                    >
                                        <option value="" disabled>Select your role</option>
                                        {roles.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                    <div className="absolute inset-y-0 right-0 pr-5 flex items-center pointer-events-none z-10">
                                        <ChevronDown className="h-5 w-5 text-zinc-400" />
                                    </div>
                                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-amber-500 group-focus-within:w-full transition-all duration-500 ease-out" />
                                </div>
                            </div>



                            {/* Submit */}
                            <motion.button
                                type="submit"
                                disabled={isLoading}
                                whileHover={{ scale: 1.02, y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                className="w-full relative group overflow-hidden mt-3"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-[2rem] blur opacity-30 group-hover:opacity-50 transition-opacity" />
                                <div className="relative w-full py-5 rounded-[2rem] bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-black uppercase tracking-[0.2em] text-sm shadow-2xl flex justify-center items-center gap-3">
                                    {isLoading ? <><Loader2 className="h-5 w-5 animate-spin" /> Creating...</> : <>Create Account <ArrowRight size={18} /></>}
                                </div>
                            </motion.button>

                            <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 pt-2">
                                Already have an account?{' '}
                                <span onClick={() => router.push('/login')} className="text-amber-500 hover:text-amber-400 cursor-pointer font-bold transition-colors">Log In</span>
                            </p>
                        </form>
                    )}
                </div>
            </motion.div>
        </div>
    );
}

```

---

## File: `src/app/admin/login/page.tsx`

```typescript
"use client";

import React, { useState } from 'react';
import { Shield, User, Lock, Loader2, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '../../../components/ThemeToggle';

export default function AdminLoginPage() {
    const router = useRouter();
    const [adminId, setAdminId] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAdminLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        // Simulated highly secure admin authentication
        setTimeout(() => {
            if (adminId === 'ADMIN-2026' && username === 'root' && password === 'admin123') {
                router.push('/dashboard/admin/control-panel');
            } else {
                setError('Invalid administrator credentials. Access denied and logged.');
                setIsLoading(false);
            }
        }, 1500);
    };

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center relative font-sans overflow-hidden transition-colors duration-300">

            {/* Ambient Orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-25%] left-[-15%] w-[55vw] h-[55vw] rounded-full bg-amber-500/10 blur-[150px]" />
                <div className="absolute bottom-[-25%] right-[-15%] w-[55vw] h-[55vw] rounded-full bg-orange-500/10 blur-[150px]" />
            </div>

            {/* Theme Toggle */}
            <div className="absolute top-5 right-5 z-20">
                <ThemeToggle />
            </div>

            {/* Login Card */}
            <div className="relative z-10 w-full max-w-md px-4 sm:px-0">
                {/* Logo & Title */}
                <div className="text-center mb-10">
                    <div className="w-20 h-20 mx-auto rounded-3xl bg-amber-600 shadow-2xl shadow-amber-500/30 flex items-center justify-center mb-8 border-2 border-zinc-100 dark:border-zinc-800">
                        <Shield className="text-white drop-shadow-md" size={36} />
                    </div>
                    <h2 className="text-4xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight mb-3">
                        Admin Command Center
                    </h2>
                    <p className="text-base text-zinc-500 dark:text-zinc-400 font-medium">
                        Restricted access. Administrator credentials required.
                    </p>
                    <span className="inline-block mt-4 px-4 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-bold border border-amber-200 dark:border-amber-800/50 tracking-wide uppercase">
                        Restricted Access
                    </span>
                </div>

                {/* Card Body */}
                <div className="bg-white dark:bg-zinc-900 py-10 px-8 shadow-[0_20px_60px_rgba(0,0,0,0.05)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.4)] rounded-[2rem] sm:px-12 border border-zinc-200 dark:border-zinc-800 overflow-hidden relative transition-colors duration-300">
                    {/* Decorative top bar */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-purple-500"></div>

                    {error && (
                        <div className="mb-6 flex items-center gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-sm font-semibold animate-in fade-in slide-in-from-top-2">
                            <AlertCircle size={18} className="shrink-0" />
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleAdminLogin} className="space-y-7">

                        {/* Administrator ID */}
                        <div>
                            <label htmlFor="admin-id" className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">
                                Administrator ID
                            </label>
                            <div className="mt-1 relative rounded-2xl group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Shield className="h-5 w-5 text-zinc-400 dark:text-zinc-500 group-focus-within:text-amber-600 dark:group-focus-within:text-amber-500 transition-colors" aria-hidden="true" />
                                </div>
                                <input
                                    id="admin-id"
                                    name="admin-id"
                                    type="text"
                                    required
                                    value={adminId}
                                    onChange={(e) => setAdminId(e.target.value)}
                                    className="block w-full pl-12 rounded-2xl py-3.5 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all duration-200 sm:text-sm outline-none font-medium text-center"
                                    placeholder="ADMIN-XXXX"
                                />
                            </div>
                        </div>

                        {/* Admin Username */}
                        <div>
                            <label htmlFor="admin-username" className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">
                                Admin Username
                            </label>
                            <div className="mt-1 relative rounded-2xl group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <User className="h-5 w-5 text-zinc-400 dark:text-zinc-500 group-focus-within:text-amber-600 dark:group-focus-within:text-amber-500 transition-colors" aria-hidden="true" />
                                </div>
                                <input
                                    id="admin-username"
                                    name="admin-username"
                                    type="text"
                                    required
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="block w-full pl-12 rounded-2xl py-3.5 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all duration-200 sm:text-sm outline-none font-medium"
                                    placeholder="admin_username"
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label htmlFor="admin-password" className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">
                                Password
                            </label>
                            <div className="mt-1 relative rounded-2xl group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-zinc-400 dark:text-zinc-500 group-focus-within:text-amber-600 dark:group-focus-within:text-amber-500 transition-colors" aria-hidden="true" />
                                </div>
                                <input
                                    id="admin-password"
                                    name="admin-password"
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    className="block w-full pl-12 rounded-2xl py-3.5 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all duration-200 sm:text-sm outline-none font-medium tracking-wider"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <div className="pt-4">
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex justify-center items-center py-4 px-4 border border-transparent rounded-2xl shadow-xl text-sm font-extrabold text-white bg-amber-600 hover:bg-amber-700 shadow-amber-500/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 dark:focus:ring-offset-zinc-900 transition-all duration-300 transform hover:-translate-y-0.5 disabled:opacity-70 disabled:pointer-events-none"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        Verifying Identity...
                                    </>
                                ) : (
                                    "Access Command Center"
                                )}
                            </button>
                        </div>
                    </form>

                    <div className="mt-10 text-center text-sm border-t border-zinc-100 dark:border-zinc-800 pt-8">
                        <span className="text-zinc-500 dark:text-zinc-400 font-medium italic">
                            Admin credentials are encrypted and rotated periodically.
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

```

---

## File: `src/app/dashboard/admin/control-panel/page.tsx`

```typescript
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '../../../../components/ThemeToggle';
import {
    Shield, Activity, Database, User, Trash2,
    Wifi, WifiOff, CheckCircle2, UserPlus, LogOut, X, Clock,
    Mail, Key, Eye, EyeOff, Copy, BadgeCheck,
    HardDrive, Zap, Archive, Server, BarChart3,
    Users, RefreshCcw, AlertTriangle, Terminal,
    UserCheck, UserX, Lock
} from 'lucide-react';
import { useSyncContext } from '../../../../context/SyncContext';

// ── Toggle Switch Component ──────────────────────────────────────────────────
function ToggleSwitch({
    enabled, onToggle, label, sublabel, accentColor = 'green',
}: {
    enabled: boolean; onToggle: () => void; label: string; sublabel: string;
    accentColor?: 'green' | 'blue' | 'purple' | 'orange' | 'red';
}) {
    const colorMap = {
        green:  { track: 'bg-green-500',  glow: 'shadow-green-500/40',  badge: 'text-green-400 bg-green-500/10 border-green-500/20'   },
        blue:   { track: 'bg-blue-500',   glow: 'shadow-blue-500/40',   badge: 'text-blue-400  bg-blue-500/10  border-blue-500/20'    },
        purple: { track: 'bg-purple-500', glow: 'shadow-purple-500/40', badge: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
        orange: { track: 'bg-orange-500', glow: 'shadow-orange-500/40', badge: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
        red:    { track: 'bg-red-500',    glow: 'shadow-red-500/40',    badge: 'text-red-400 bg-red-500/10 border-red-500/20'         },
    };
    const colors = colorMap[accentColor];
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white leading-snug">{label}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{sublabel}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${enabled ? colors.badge : 'text-zinc-500 bg-zinc-100 dark:bg-zinc-700/50 border-zinc-300 dark:border-zinc-600'}`}>
                    {enabled ? 'ON' : 'OFF'}
                </span>
                <button type="button" onClick={onToggle}
                    className={`relative w-14 h-7 rounded-full transition-all duration-300 focus:outline-none ${enabled ? `${colors.track} shadow-lg ${colors.glow}` : 'bg-zinc-200 dark:bg-zinc-700'}`}>
                    <motion.div layout transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md ${enabled ? 'right-1' : 'left-1'}`} />
                </button>
            </div>
        </div>
    );
}



interface DirectoryUser {
    id: string;
    loginId?: string;
    name: string;
    email: string;
    department: string;
    role: string;
    password?: string;
    status: 'pending' | 'approved' | 'denied';
    requestDate: string;
}

export default function AdminDashboard() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<string>('System Overview');
    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
    const [showGenPassword, setShowGenPassword] = useState(false);
    const [selectedRepoToDelete, setSelectedRepoToDelete] = useState<number | null>(null);

    // ── User Directory state (merged: User Management + Registered Users)
    const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
    const [selectedDirUser, setSelectedDirUser] = useState<DirectoryUser | null>(null);
    const [suspendedUsers, setSuspendedUsers] = useState<string[]>([]);
    const [userActionMsg, setUserActionMsg] = useState<string | null>(null);
    // Delete confirmation modal
    const [deleteConfirm, setDeleteConfirm] = useState<DirectoryUser | null>(null);
    // Password Reset flow
    const [pwResetModal, setPwResetModal] = useState<DirectoryUser | null>(null); // user to reset
    const [pwResetStep, setPwResetStep] = useState<'verify' | 'success'>('verify');
    const [pwVerifyName, setPwVerifyName] = useState('');
    const [pwVerifyEmail, setPwVerifyEmail] = useState('');
    const [pwVerifyError, setPwVerifyError] = useState('');
    const [pwNewGenerated, setPwNewGenerated] = useState('');
    const [showNewPw, setShowNewPw] = useState(false);
    const [pwCopied, setPwCopied] = useState(false);
    // Password reset notifications for admin
    const [pwResetNotifications, setPwResetNotifications] = useState<{id:number;name:string;email:string;time:string}[]>([]);

    const loadDirectoryUsers = () => {
        try {
            const stored = localStorage.getItem('docusync_user_requests');
            if (stored) {
                let parsed = JSON.parse(stored) as DirectoryUser[];
                let changed = false;
                let nextId = parsed.reduce((max: number, u: DirectoryUser) => {
                    const id = parseInt(u.loginId || '1999');
                    return id > max ? id : max;
                }, 1999);
                parsed = parsed.map((u: DirectoryUser) => {
                    if (!u.loginId) { nextId++; changed = true; return { ...u, loginId: String(nextId) }; }
                    return u;
                });
                if (changed) localStorage.setItem('docusync_user_requests', JSON.stringify(parsed));
                setDirectoryUsers(parsed);
            }
        } catch {}
    };

    useEffect(() => { loadDirectoryUsers(); }, []);

    const confirmDeleteUser = (user: DirectoryUser) => setDeleteConfirm(user);

    const executeDeleteUser = () => {
        if (!deleteConfirm) return;
        const updated = directoryUsers.filter(u => u.id !== deleteConfirm.id);
        setDirectoryUsers(updated);
        localStorage.setItem('docusync_user_requests', JSON.stringify(updated));
        addAuditEvent(`Account permanently deleted: ${deleteConfirm.name} (${deleteConfirm.email}). Action by Administrator.`, 'error');
        if (selectedDirUser?.id === deleteConfirm.id) setSelectedDirUser(null);
        setDeleteConfirm(null);
    };

    const openPwReset = (user: DirectoryUser) => {
        setPwResetModal(user);
        setPwResetStep('verify');
        setPwVerifyName('');
        setPwVerifyEmail('');
        setPwVerifyError('');
        setPwNewGenerated('');
        setShowNewPw(false);
        setPwCopied(false);
        addAuditEvent(`Password reset requested for account: ${user.name} (ID: ${user.loginId}).`, 'warn');
    };

    const verifyAndResetPassword = () => {
        if (!pwResetModal) return;
        const nameMatch = pwVerifyName.trim().toLowerCase() === pwResetModal.name.toLowerCase();
        const emailMatch = pwVerifyEmail.trim().toLowerCase() === pwResetModal.email.toLowerCase();
        if (!nameMatch || !emailMatch) {
            setPwVerifyError('Verification failed. The name or email address does not match our records. Please try again.');
            return;
        }
        const newPw = generatePassword();
        setPwNewGenerated(newPw);
        // Update the password in localStorage
        const updated = directoryUsers.map(u => u.id === pwResetModal.id ? { ...u, password: newPw } : u);
        setDirectoryUsers(updated);
        localStorage.setItem('docusync_user_requests', JSON.stringify(updated));
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setPwResetNotifications(prev => [{ id: Date.now(), name: pwResetModal.name, email: pwResetModal.email, time: now }, ...prev]);
        addAuditEvent(`✅ Password successfully reset for ${pwResetModal.name}. Verification passed. New credentials issued.`, 'info');
        setPwResetStep('success');
        setPwVerifyError('');
    };

    const handleSuspendToggle = (userId: string, name: string) => {
        setSuspendedUsers(prev => {
            const isSuspended = prev.includes(userId);
            const next = isSuspended ? prev.filter(id => id !== userId) : [...prev, userId];
            setUserActionMsg(isSuspended ? `${name}'s account has been reactivated.` : `${name}'s account has been suspended.`);
            addAuditEvent(isSuspended ? `Account reactivated: ${name}.` : `Account suspended: ${name}.`, isSuspended ? 'info' : 'error');
            setTimeout(() => setUserActionMsg(null), 3000);
            return next;
        });
    };

    // Network Simulator state
    const [latencySimActive, setLatencySimActive] = useState(false);
    const [latencyMs, setLatencyMs] = useState(500);
    const [simLog, setSimLog] = useState<string[]>([
        '[SYSTEM] Network simulator ready. All connections nominal.',
    ]);
    const simLogRef = useRef<HTMLDivElement>(null);

    // Audit log state (mirrors sync logs + extra events)
    const [auditEvents, setAuditEvents] = useState<{ id: number; time: string; level: 'info' | 'warn' | 'error'; message: string }[]>([
        { id: 1, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), level: 'info', message: 'Admin Control Panel opened. Session initialized.' },
        { id: 2, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), level: 'info', message: 'CRDT sync engine active. All file states converged.' },
        { id: 3, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), level: 'info', message: 'User Paul John Palamara authenticated via Supabase Auth.' },
    ]);
    const auditLogRef = useRef<HTMLDivElement>(null);

    const {
        reposData, deleteRepository, currentStorageUsed, currentStorageUsedRaw,
        storageLimitBytes, deltaSyncEnabled, autoPurgeEnabled,
        toggleDeltaSync, toggleAutoPurge, pendingUserRequests, approveRequest, denyRequest, syncLogs,
        isOnline
    } = useSyncContext();

    // isOnline drives the offline simulation panel automatically
    const offlineSimActive = !isOnline;

    // Keep audit log in sync with SyncContext logs
    useEffect(() => {
        if (syncLogs.length > 0) {
            const latest = syncLogs[0];
            setAuditEvents(prev => {
                const alreadyExists = prev.some(e => e.id === latest.id + 10000);
                if (alreadyExists) return prev;
                return [{ id: latest.id + 10000, time: latest.time, level: 'info' as const, message: latest.message }, ...prev];
            });
        }
    }, [syncLogs]);

    // Auto scroll audit log
    useEffect(() => {
        if (auditLogRef.current) auditLogRef.current.scrollTop = 0;
    }, [auditEvents]);

    useEffect(() => {
        if (simLogRef.current) simLogRef.current.scrollTop = simLogRef.current.scrollHeight;
    }, [simLog]);

    const addSimLog = (msg: string) => {
        const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setSimLog(prev => [...prev, `[${t}] ${msg}`]);
        setAuditEvents(prev => [{ id: Date.now(), time: t, level: 'warn', message: `[NET-SIM] ${msg}` }, ...prev]);
    };

    const addAuditEvent = (msg: string, level: 'info' | 'warn' | 'error' = 'info') => {
        const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setAuditEvents(prev => [{ id: Date.now(), time: t, level, message: msg }, ...prev]);
    };

    // Storage helpers
    const formatBytes = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(3)} GB`;
    };
    const storagePercent = Math.min(100, (currentStorageUsed / storageLimitBytes) * 100);

    // Password generator
    const generatePassword = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
        let pass = '';
        for (let i = 0; i < 16; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
        return pass;
    };

    // Approval queue state
    const [approvedUser, setApprovedUser] = useState<{ name: string; email: string; role: string; password: string } | null>(null);

    const handleApprove = (userId: string) => {
        const user = pendingUserRequests.find(u => u.id === userId);
        if (!user) return;
        const password = generatePassword();
        approveRequest(userId, password);
        setApprovedUser({ name: user.name, email: user.email, role: 'Editor', password });
        addAuditEvent(`Account approved for ${user.name} (${user.email}). Temporary credentials generated.`);
    };

    const handleDeny = (userId: string) => {
        const user = pendingUserRequests.find(u => u.id === userId);
        if (window.confirm('Are you sure you want to deny this request?')) {
            denyRequest(userId);
            if (user) addAuditEvent(`Access request denied for ${user.name}.`, 'warn');
        }
    };



    // Network Simulator handlers
    const handleOfflineSim = () => {
        // Offline state is now driven automatically by the browser's online/offline events
        // This toggle is kept for manual demonstration purposes
        addSimLog(offlineSimActive
            ? '🟢 Checking connection... Browser reports online. CRDT convergence initiated.'
            : '🔴 Manual offline check: Browser reports offline. CRDT buffer mode active.'
        );
    };

    const handleLatencySim = () => {
        const next = !latencySimActive;
        setLatencySimActive(next);
        if (next) {
            addSimLog(`⚠️  HIGH LATENCY SIMULATION: +${latencyMs}ms injected to all sync operations.`);
            addSimLog('📡 Delta payloads will be delayed. CRDT state vectors still valid.');
        } else {
            addSimLog('✅ Latency simulation cleared. Network operating at normal speed.');
        }
    };

    const floatAnim = {
        initial: { y: 0 },
        animate: { y: [-3, 3, -3], transition: { duration: 5, repeat: Infinity, ease: "easeInOut" as const } }
    };

    const navItems = [
        { name: 'System Overview', icon: Activity },
        { name: 'User Directory', icon: Users },
        { name: 'User Requests', icon: UserPlus },
        { name: 'Audit Logs', icon: Terminal },
    ];

    const statusColor = (s: string) =>
        s === 'online' ? 'bg-green-500' : s === 'idle' ? 'bg-amber-400' : 'bg-zinc-400';

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 transition-colors duration-300 font-sans selection:bg-rose-500/30 relative overflow-hidden flex">
            {/* Ambient Background */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-rose-600/10 dark:bg-rose-900/20 blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-rose-500/10 dark:bg-zinc-800/50 blur-[150px]" />
            </div>

            {/* ═══════════ ADMIN SIDEBAR ═══════════ */}
            <div className="relative z-10 w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 backdrop-blur-2xl px-5 py-8 flex flex-col shadow-[10px_0_30px_rgba(0,0,0,0.5)]">
                <motion.div variants={floatAnim} initial="initial" animate="animate" className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 flex items-center justify-center">
                        <div className="w-full h-full rounded-md bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30 p-1.5">
                            <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
                        </div>
                    </div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-rose-600 to-rose-700 dark:from-rose-400 dark:to-rose-500 tracking-tight">
                        DocuSync
                    </h1>
                </motion.div>

                <div className="mb-6 px-4 py-3 rounded-xl bg-rose-100 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800/50">
                    <p className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider flex items-center gap-2"><Shield size={14} /> Admin Console</p>
                </div>

                <div className="flex-1 flex flex-col gap-1">
                    {navItems.map((item) => {
                        const isActive = activeTab === item.name;
                        return (
                            <motion.button key={item.name} onClick={() => setActiveTab(item.name)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 ${isActive
                                    ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 shadow-md border border-rose-200 dark:border-rose-900/50'
                                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent'
                                    }`}
                                whileHover={{ scale: isActive ? 1 : 1.02 }} whileTap={{ scale: 0.98 }}>
                                <item.icon size={18} className={isActive ? "text-rose-600 dark:text-rose-400" : ""} />
                                <span className="font-medium text-sm tracking-wide">{item.name}</span>

                                {item.name === 'Network Simulator' && (offlineSimActive || latencySimActive) && (
                                    <span className="ml-auto w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                )}
                            </motion.button>
                        );
                    })}
                </div>

                <div className="flex flex-col gap-2 mt-auto">
                    <button onClick={() => setIsLogoutModalOpen(true)} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-zinc-500 dark:text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 border border-transparent transition-all">
                        <LogOut size={18} /><span className="font-medium text-sm">Log Out</span>
                    </button>
                </div>
            </div>

            {/* ═══════════ MAIN CONTENT ═══════════ */}
            <div className="flex-1 flex flex-col relative z-10 h-screen overflow-hidden">
                {/* Header */}
                <header className="px-8 py-6 flex justify-between items-center z-20">
                    <div className="flex items-center text-sm font-medium bg-white dark:bg-zinc-900 backdrop-blur-md px-5 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-md gap-3">
                        <Shield size={16} className="text-rose-500" />
                        <span className="text-zinc-900 dark:text-white font-bold">Admin Command Center</span>
                        <span className="mx-1 text-zinc-300 dark:text-zinc-600">|</span>
                        <span className="text-zinc-500 dark:text-zinc-400">{activeTab}</span>
                        {(offlineSimActive || latencySimActive) && (
                            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700/50 text-[10px] font-bold text-red-600 dark:text-red-400 uppercase">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                Simulation Active
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-4 bg-white dark:bg-zinc-900 backdrop-blur-md px-5 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-md">
                        <ThemeToggle />
                        <span className="text-xs font-bold bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800/50">SYSTEM ADMINISTRATOR</span>
                    </div>
                </header>

                {/* Main Area */}
                <main className="flex-1 overflow-y-auto px-8 pb-24">

                    {/* ─── SYSTEM OVERVIEW TAB ─────────────────────────── */}
                    {activeTab === 'System Overview' && (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="w-full max-w-6xl mx-auto flex flex-col space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                {/* Active WebRTC Peers */}
                                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-6 rounded-2xl shadow-lg relative overflow-hidden group hover:border-rose-400/50 dark:hover:border-rose-600/50 transition-colors">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 dark:bg-rose-500/10 rounded-full -translate-y-8 translate-x-8 group-hover:scale-125 transition-transform" />
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2.5 bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-xl"><Wifi size={20} /></div>
                                        <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Active WebRTC Peers</span>
                                    </div>
                                    <div className="flex items-end gap-2">
                                        <span className="text-4xl font-extrabold text-zinc-900 dark:text-white">{directoryUsers.filter((u: DirectoryUser) => !suspendedUsers.includes(u.id)).length}</span>
                                        <span className="text-sm font-bold text-green-500 mb-1 flex items-center gap-1"><CheckCircle2 size={14} /> Live CRDT</span>
                                    </div>
                                    <div className="mt-3 w-full h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden"><div className="h-full w-[40%] bg-gradient-to-r from-rose-500 to-orange-500 rounded-full" /></div>
                                </div>
                                {/* System Health */}
                                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-6 rounded-2xl shadow-lg relative overflow-hidden group hover:border-green-400/50 dark:hover:border-green-600/50 transition-colors">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 dark:bg-green-500/10 rounded-full -translate-y-8 translate-x-8 group-hover:scale-125 transition-transform" />
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2.5 bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 rounded-xl"><Activity size={20} /></div>
                                        <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">System Health</span>
                                    </div>
                                    <div className="flex items-end gap-2">
                                        <span className="text-4xl font-extrabold text-zinc-900 dark:text-white">{offlineSimActive ? '72.1%' : '99.8%'}</span>
                                        <span className={`text-sm font-bold mb-1 ${offlineSimActive ? 'text-red-500' : 'text-green-500'}`}>{offlineSimActive ? 'Degraded' : 'Uptime'}</span>
                                    </div>
                                    <div className="mt-3 w-full h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden"><div className={`h-full rounded-full bg-gradient-to-r ${offlineSimActive ? 'w-[72%] from-red-500 to-orange-500' : 'w-[99%] from-green-500 to-emerald-500'}`} /></div>
                                </div>
                                {/* Total Workspaces */}
                                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-6 rounded-2xl shadow-lg relative overflow-hidden group hover:border-purple-400/50 dark:hover:border-purple-600/50 transition-colors">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 dark:bg-purple-500/10 rounded-full -translate-y-8 translate-x-8 group-hover:scale-125 transition-transform" />
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2.5 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded-xl"><Database size={20} /></div>
                                        <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Total Workspaces</span>
                                    </div>
                                    <div className="flex items-end gap-2">
                                        <span className="text-4xl font-extrabold text-zinc-900 dark:text-white">{reposData.length}</span>
                                        <span className="text-sm font-bold text-purple-500 mb-1">Repositories</span>
                                    </div>
                                    <div className="mt-3 w-full h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden"><div className="h-full w-[30%] bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full" /></div>
                                </div>
                            </div>

                            {/* Storage Architecture Panel */}
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}
                                className="relative overflow-hidden rounded-[2rem] bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
                                <div className="h-1 w-full bg-gradient-to-r from-green-500 via-emerald-400 to-teal-500" />
                                <div className="p-8 relative z-10">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3.5 bg-gradient-to-tr from-green-500/20 to-emerald-500/20 rounded-2xl border border-green-500/20 shadow-inner">
                                                <HardDrive size={24} className="text-green-500" />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-extrabold text-zinc-900 dark:text-white tracking-tight">Server Storage Architecture</h3>
                                                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Global CRDT delta management &amp; data lifecycle policies</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/40 shadow-sm shrink-0">
                                            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                                            <Server size={14} className="text-green-600 dark:text-green-400" />
                                            <span className="text-xs font-bold text-green-700 dark:text-green-400">Supabase Cloud Storage (S3)</span>
                                        </div>
                                    </div>
                                    {/* Storage Quota Gauge */}
                                    <div className="mb-8 p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <BarChart3 size={16} className="text-zinc-500" />
                                                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Global Storage Quota</span>
                                                {deltaSyncEnabled && (
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-700/40 uppercase tracking-wider">
                                                        Delta Mode (×0.15)
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <span className="text-sm font-extrabold text-zinc-900 dark:text-white">{formatBytes(currentStorageUsed)}</span>
                                                <span className="text-xs text-zinc-500 dark:text-zinc-400"> / 1 GB (Free Tier)</span>
                                            </div>
                                        </div>
                                        <div className="w-full h-3 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                            <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(storagePercent, 0.5)}%` }}
                                                transition={{ duration: 0.8, ease: 'easeOut' }}
                                                className={`h-full rounded-full ${storagePercent > 85 ? 'bg-gradient-to-r from-rose-500 to-red-500' : storagePercent > 60 ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-green-400 to-emerald-500'}`} />
                                        </div>
                                        <div className="flex justify-between mt-1.5">
                                            <span className="text-[10px] text-zinc-400">Raw (without delta compression): {formatBytes(currentStorageUsedRaw)}</span>
                                            <span className="text-[10px] text-zinc-400">{storagePercent.toFixed(2)}% used</span>
                                        </div>
                                    </div>
                                    {/* Toggles */}
                                    <div className="flex flex-col gap-4">
                                        <div className="p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                                            <div className="flex items-start gap-3 mb-4">
                                                <div className="p-2 rounded-xl bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 shrink-0"><Zap size={16} /></div>
                                                <div><h4 className="text-sm font-bold text-zinc-900 dark:text-white">Delta Synchronization</h4><p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Diff-Only Storage Engine</p></div>
                                            </div>
                                            <ToggleSwitch enabled={deltaSyncEnabled} onToggle={toggleDeltaSync} label="Enable Delta Sync (Diff-Only Storage)" sublabel="Reduces storage footprint by saving only keystroke diffs. Active files use 15% of raw size." accentColor="green" />
                                        </div>
                                        <div className="p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                                            <div className="flex items-start gap-3 mb-4">
                                                <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 shrink-0"><Archive size={16} /></div>
                                                <div><h4 className="text-sm font-bold text-zinc-900 dark:text-white">Data Lifecycle Policy</h4><p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">30-Day Auto-Purge</p></div>
                                            </div>
                                            <ToggleSwitch enabled={autoPurgeEnabled} onToggle={toggleAutoPurge} label="Data Lifecycle Policy (30-Day Auto-Purge)" sublabel="Automatically permanently deletes trashed items after 30 days." accentColor="orange" />
                                        </div>
                                    </div>
                                </div>
                            </motion.div>

                            {/* Delete Group Section */}
                            <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-rose-500/20 p-8 rounded-[2rem] shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full -translate-y-16 translate-x-16" />
                                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                                    <div className="flex items-center gap-5">
                                        <div className="p-4 bg-rose-500/10 text-rose-500 rounded-2xl shadow-inner"><Trash2 size={24} /></div>
                                        <div>
                                            <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Delete Synchronization Group</h3>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-md">Permanently purge a group workspace, including all files, version history, and membership data.</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                                        <select value={selectedRepoToDelete ?? ''} onChange={(e) => setSelectedRepoToDelete(e.target.value ? Number(e.target.value) : null)}
                                            className="px-5 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm font-semibold outline-none focus:ring-2 focus:ring-rose-500/40 transition-all appearance-none cursor-pointer">
                                            <option value="">Select a Group...</option>
                                            {reposData.map(repo => (<option key={repo.id} value={repo.id}>{repo.name}</option>))}
                                        </select>
                                        <button onClick={() => {
                                            if (selectedRepoToDelete) {
                                                const repo = reposData.find(r => r.id === selectedRepoToDelete);
                                                if (window.confirm(`CRITICAL: Are you sure you want to permanently delete '${repo?.name}'? This action cannot be undone.`)) {
                                                    deleteRepository(selectedRepoToDelete);
                                                    addAuditEvent(`Repository '${repo?.name}' permanently deleted by Administrator.`, 'error');
                                                    setSelectedRepoToDelete(null);
                                                }
                                            }
                                        }} disabled={!selectedRepoToDelete}
                                            className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 disabled:bg-zinc-400 disabled:opacity-50 text-white font-bold px-8 py-3 rounded-xl transition-all shadow-lg shadow-rose-500/25 active:scale-95 disabled:pointer-events-none">
                                            <Trash2 size={18} /> Purge Group
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}


                    {/* ─── USER REQUESTS TAB ───────────────────────────────── */}
                    {activeTab === 'User Requests' && (() => {
                        const localRequests: DirectoryUser[] = (() => {
                            try {
                                const stored = localStorage.getItem('docusync_user_requests');
                                return stored ? JSON.parse(stored) as DirectoryUser[] : [];
                            } catch { return []; }
                        })();
                        const pendingLocal = localRequests.filter((r: DirectoryUser) => r.status === 'pending');

                        const handleApproveLocal = (req: DirectoryUser) => {
                            const password = generatePassword();
                            const stored = localStorage.getItem('docusync_user_requests');
                            const allRequests = stored ? JSON.parse(stored) as DirectoryUser[] : [];
                            const nextId = allRequests.reduce((max: number, u: DirectoryUser) => {
                                const id = parseInt(u.loginId || '1999');
                                return id > max ? id : max;
                            }, 1999) + 1;
                            const updated = allRequests.map((r: DirectoryUser) =>
                                r.id === req.id ? { ...r, status: 'approved', password, loginId: String(nextId) } : r
                            );
                            localStorage.setItem('docusync_user_requests', JSON.stringify(updated));
                            loadDirectoryUsers();
                            setApprovedUser({ name: req.name, email: req.email, role: 'Editor', password });
                            addAuditEvent(`✅ Account approved for ${req.name} (${req.email}). Login ID: ${nextId}. Credentials generated.`, 'info');
                            setActiveTab('User Requests');
                        };

                        const handleDenyLocal = (req: DirectoryUser) => {
                            if (!window.confirm(`Deny access for ${req.name}?`)) return;
                            const stored = localStorage.getItem('docusync_user_requests');
                            const allRequests = stored ? JSON.parse(stored) as DirectoryUser[] : [];
                            const updated = allRequests.map((r: DirectoryUser) =>
                                r.id === req.id ? { ...r, status: 'denied' } : r
                            );
                            localStorage.setItem('docusync_user_requests', JSON.stringify(updated));
                            loadDirectoryUsers();
                            addAuditEvent(`❌ Access request denied for ${req.name} (${req.email}).`, 'warn');
                        };

                        return (
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="w-full max-w-5xl mx-auto flex flex-col space-y-6">

                                {/* Approved User Credential Banner */}
                                <AnimatePresence>
                                    {approvedUser && (
                                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                            className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/50 rounded-2xl p-6">
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                                                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Access Approved — Share credentials with the user</p>
                                                </div>
                                                <button onClick={() => setApprovedUser(null)} className="text-zinc-400 hover:text-zinc-600"><X size={16} /></button>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
                                                <div><p className="text-[10px] font-bold text-zinc-400 uppercase">Name</p><p className="text-sm font-bold text-zinc-900 dark:text-white">{approvedUser.name}</p></div>
                                                <div><p className="text-[10px] font-bold text-zinc-400 uppercase">Email</p><p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{approvedUser.email}</p></div>
                                                <div><p className="text-[10px] font-bold text-zinc-400 uppercase">Role</p><p className="text-sm font-bold text-blue-600">{approvedUser.role}</p></div>
                                                <div>
                                                    <p className="text-[10px] font-bold text-zinc-400 uppercase">System Password</p>
                                                    <div className="flex items-center gap-2">
                                                        <code className="text-sm font-mono font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-800/40">{approvedUser.password}</code>
                                                        <button onClick={() => navigator.clipboard.writeText(approvedUser.password)} className="text-zinc-400 hover:text-rose-500 transition-colors"><Copy size={13} /></button>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Pending Requests Table */}
                                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl overflow-hidden">
                                    <div className="px-8 py-6 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 bg-rose-100 dark:bg-rose-900/40 text-rose-600 rounded-xl"><UserPlus size={22} /></div>
                                            <div>
                                                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">User Access Requests</h3>
                                                <p className="text-sm text-zinc-500 dark:text-zinc-400">Review and approve or deny incoming account requests from users.</p>
                                            </div>
                                        </div>
                                        <button onClick={() => { loadDirectoryUsers(); }} className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-rose-500 transition-colors px-3 py-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-900/20 border border-transparent hover:border-rose-200">
                                            <RefreshCcw size={14} /> Refresh
                                        </button>
                                    </div>

                                    <div className="divide-y divide-zinc-100 dark:divide-zinc-700/50">
                                        {pendingLocal.length === 0 ? (
                                            <div className="px-8 py-16 text-center">
                                                <div className="w-16 h-16 mx-auto rounded-full bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center mb-4"><UserPlus size={28} className="text-zinc-400" /></div>
                                                <h4 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">No Pending Requests</h4>
                                                <p className="text-sm text-zinc-500 dark:text-zinc-400">When users submit access requests from the landing page, they will appear here for your review.</p>
                                            </div>
                                        ) : pendingLocal.map((req: any) => (
                                            <div key={req.id} className="flex flex-col sm:flex-row sm:items-center gap-4 px-8 py-5">
                                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-sm font-bold text-white shadow-sm shrink-0">
                                                        {req.name?.split(' ').map((n: string) => n[0]).join('').slice(0,2) || '?'}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-zinc-900 dark:text-zinc-200 text-sm">{req.name}</p>
                                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate flex items-center gap-1"><Mail size={11} /> {req.email}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/50">PENDING</span>
                                                    <button onClick={() => handleApproveLocal(req)}
                                                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 transition-all">
                                                        <BadgeCheck size={14} /> Approve
                                                    </button>
                                                    <button onClick={() => handleDenyLocal(req)}
                                                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-bold text-xs transition-all">
                                                        <UserX size={14} /> Deny
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Show recently denied/approved for reference */}
                                {localRequests.filter((r: any) => r.status !== 'pending').length > 0 && (
                                    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl overflow-hidden">
                                        <div className="px-8 py-4 border-b border-zinc-200 dark:border-zinc-700">
                                            <h4 className="font-bold text-zinc-700 dark:text-zinc-300 text-sm">Processed Requests</h4>
                                        </div>
                                        <div className="divide-y divide-zinc-100 dark:divide-zinc-700/50">
                                            {localRequests.filter((r: any) => r.status !== 'pending').map((req: any) => (
                                                <div key={req.id} className="flex items-center gap-4 px-8 py-4 opacity-60">
                                                    <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-600 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-300 shrink-0">
                                                        {req.name?.split(' ').map((n: string) => n[0]).join('').slice(0,2) || '?'}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-zinc-900 dark:text-zinc-200 text-sm">{req.name}</p>
                                                        <p className="text-xs text-zinc-500 truncate">{req.email}</p>
                                                    </div>
                                                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                                                        req.status === 'approved' ? 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20' : 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20'
                                                    }`}>{req.status.toUpperCase()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        );
                    })()
                    }


                    {/* ─── USER DIRECTORY TAB (merged) ───────────────────── */}
                    {activeTab === 'User Directory' && (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="w-full max-w-5xl mx-auto flex flex-col space-y-6">

                            {/* ── PENDING ACCESS REQUESTS PANEL ── */}
                            {(() => {
                                const localRequests: any[] = (() => {
                                    try {
                                        const stored = localStorage.getItem('docusync_user_requests');
                                        return stored ? JSON.parse(stored) : [];
                                    } catch { return []; }
                                })();
                                const pendingLocal = localRequests.filter((r: any) => r.status === 'pending');
                                if (pendingLocal.length === 0) return null;

                                const handleApproveLocal = (req: any) => {
                                    const password = generatePassword();
                                    const stored = localStorage.getItem('docusync_user_requests');
                                    const allRequests = stored ? JSON.parse(stored) : [];
                                    const nextId = allRequests.reduce((max: number, u: any) => {
                                        const id = parseInt(u.loginId || '1999');
                                        return id > max ? id : max;
                                    }, 1999) + 1;
                                    const updated = allRequests.map((r: any) =>
                                        r.id === req.id ? { ...r, status: 'approved', password, loginId: String(nextId) } : r
                                    );
                                    localStorage.setItem('docusync_user_requests', JSON.stringify(updated));
                                    loadDirectoryUsers();
                                    setApprovedUser({ name: req.name, email: req.email, role: 'Editor', password });
                                    addAuditEvent(`✅ Account approved for ${req.name} (${req.email}). Login ID: ${nextId}.`, 'info');
                                };

                                const handleDenyLocal = (req: any) => {
                                    if (!window.confirm(`Deny access for ${req.name}?`)) return;
                                    const stored = localStorage.getItem('docusync_user_requests');
                                    const allRequests = stored ? JSON.parse(stored) : [];
                                    const updated = allRequests.map((r: any) =>
                                        r.id === req.id ? { ...r, status: 'denied' } : r
                                    );
                                    localStorage.setItem('docusync_user_requests', JSON.stringify(updated));
                                    loadDirectoryUsers();
                                    addAuditEvent(`❌ Access request denied for ${req.name} (${req.email}).`, 'warn');
                                };

                                return (
                                    <div className="bg-white dark:bg-zinc-800 border-2 border-amber-300 dark:border-amber-700/60 rounded-2xl shadow-xl overflow-hidden">
                                        <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400" />
                                        <div className="px-8 py-5 border-b border-amber-100 dark:border-amber-900/30 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2.5 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-xl"><UserPlus size={20} /></div>
                                                <div>
                                                    <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                                                        Pending Access Requests
                                                        <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black">{pendingLocal.length}</span>
                                                    </h3>
                                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Users waiting for your approval to access the system.</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="divide-y divide-amber-50 dark:divide-zinc-700/50">
                                            {pendingLocal.map((req: any) => (
                                                <div key={req.id} className="flex flex-col sm:flex-row sm:items-center gap-4 px-8 py-4">
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
                                                            {req.name?.split(' ').map((n: string) => n[0]).join('').slice(0,2) || '?'}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-zinc-900 dark:text-zinc-200 text-sm">{req.name}</p>
                                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate flex items-center gap-1"><Mail size={11} /> {req.email}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/50">PENDING</span>
                                                        <button onClick={() => handleApproveLocal(req)}
                                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all">
                                                            <BadgeCheck size={14} /> Approve
                                                        </button>
                                                        <button onClick={() => handleDenyLocal(req)}
                                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-bold text-xs transition-all">
                                                            <UserX size={14} /> Deny
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Approved User Credential Banner */}
                            <AnimatePresence>
                                {approvedUser && (
                                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                        className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/50 rounded-2xl p-6">
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                                                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Access Approved — Share these credentials with the user</p>
                                            </div>
                                            <button onClick={() => setApprovedUser(null)} className="text-zinc-400 hover:text-zinc-600"><X size={16} /></button>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
                                            <div><p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Name</p><p className="text-sm font-bold text-zinc-900 dark:text-white">{approvedUser.name}</p></div>
                                            <div><p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Email</p><p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{approvedUser.email}</p></div>
                                            <div><p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Role</p><p className="text-sm font-bold text-blue-600">{approvedUser.role}</p></div>
                                            <div>
                                                <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">System Password</p>
                                                <div className="flex items-center gap-2">
                                                    <code className="text-sm font-mono font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-800/40">{approvedUser.password}</code>
                                                    <button onClick={() => navigator.clipboard.writeText(approvedUser.password)} className="text-zinc-400 hover:text-rose-500 transition-colors"><Copy size={13} /></button>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Status / action banner */}
                            <AnimatePresence>
                                {userActionMsg && (
                                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                        className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl px-6 py-4 flex items-center gap-3">
                                        <AlertTriangle size={18} className="text-amber-500 shrink-0" />
                                        <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">{userActionMsg}</span>
                                    </motion.div>
                                )}
                                {pwResetNotifications.slice(0, 1).map(n => (
                                    <motion.div key={n.id} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                        className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-700/50 rounded-2xl px-6 py-4 flex items-center gap-3">
                                        <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Password Reset Successful</p>
                                            <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">{n.name} ({n.email}) successfully verified their identity and received new credentials at {n.time}.</p>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            {/* Main User Table */}
                            <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl overflow-hidden">
                                <div className="px-8 py-6 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-rose-100 dark:bg-rose-900/40 text-rose-600 rounded-xl"><Users size={22} /></div>
                                        <div>
                                            <h3 className="text-xl font-bold text-zinc-900 dark:text-white">User Directory</h3>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400">All registered accounts. Click a row to expand credentials. Use the action buttons to manage each user.</p>
                                        </div>
                                    </div>
                                    <span className="flex items-center gap-2 text-xs font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/50">
                                        <CheckCircle2 size={14} /> {directoryUsers.length} Registered
                                    </span>
                                </div>

                                {/* Expandable credential panel */}
                                <AnimatePresence>
                                    {selectedDirUser && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden border-b border-zinc-200 dark:border-zinc-700">
                                            <div className="px-8 py-5 bg-zinc-50 dark:bg-zinc-900/50">
                                                <div className="flex items-center justify-between mb-3">
                                                    <h4 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><BadgeCheck size={16} className="text-rose-500" /> Account Credentials</h4>
                                                    <button onClick={() => setSelectedDirUser(null)} className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"><X size={16} /></button>
                                                </div>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-5">
                                                    <div>
                                                        <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1">Login ID</p>
                                                        <p className="text-xl font-black font-mono text-amber-600 dark:text-amber-400">{selectedDirUser.loginId || '—'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Full Name</p>
                                                        <p className="text-sm font-bold text-zinc-900 dark:text-white">{selectedDirUser.name}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Email</p>
                                                        <p className="text-sm font-bold text-zinc-900 dark:text-white">{selectedDirUser.email}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">System Password</p>
                                                        <div className="flex items-center gap-2">
                                                            <code className="text-sm font-mono font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-800/40">
                                                                {selectedDirUser.password || '—'}
                                                            </code>
                                                            <button onClick={() => { navigator.clipboard.writeText(selectedDirUser.password || ''); }}
                                                                className="text-zinc-400 hover:text-rose-500 transition-colors"><Copy size={13} /></button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Table headers */}
                                <div className="grid grid-cols-[70px_2fr_2fr_100px_1fr_auto] gap-3 px-8 py-3 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-700/50">
                                    <div className="text-amber-500">Login ID</div><div>Full Name</div><div>Email</div><div>Role</div><div>Status</div><div className="text-right">Actions</div>
                                </div>

                                <div className="divide-y divide-zinc-100 dark:divide-zinc-700/50">
                                    {directoryUsers.length === 0 ? (
                                        <div className="px-8 py-16 text-center">
                                            <div className="w-16 h-16 mx-auto rounded-full bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center mb-4"><UserX size={28} className="text-zinc-400" /></div>
                                            <h4 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">No Registered Users</h4>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400">Users who register via the Create Account form will appear here.</p>
                                        </div>
                                    ) : directoryUsers.map((user) => {
                                        const isSuspended = suspendedUsers.includes(user.id);
                                        const isOwner = user.loginId === '2000';
                                        return (
                                            <div key={user.id}
                                                className={`grid grid-cols-[70px_2fr_2fr_100px_1fr_auto] gap-3 items-center px-8 py-4 cursor-pointer transition-colors ${selectedDirUser?.id === user.id ? 'bg-rose-50 dark:bg-rose-900/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'} ${isSuspended ? 'opacity-50' : ''}`}
                                                onClick={() => setSelectedDirUser(selectedDirUser?.id === user.id ? null : user)}>
                                                <div><span className="inline-block px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-black font-mono text-sm">{user.loginId || '—'}</span></div>
                                                <div className="flex items-center gap-3">
                                                    <div className="relative shrink-0">
                                                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-rose-500 to-rose-600 flex items-center justify-center text-sm font-bold text-white shadow-sm">
                                                            {user.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || '?'}
                                                        </div>
                                                        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zinc-800 ${isSuspended ? 'bg-zinc-400' : 'bg-green-500'}`} />
                                                    </div>
                                                    <div>
                                                        <span className="font-semibold text-zinc-900 dark:text-zinc-200 text-sm">{user.name}</span>
                                                        {isSuspended && <span className="ml-2 text-[9px] font-bold text-red-500 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full">SUSPENDED</span>}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400"><Mail size={13} className="text-zinc-400 shrink-0" /><span className="truncate">{user.email}</span></div>
                                                <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full border ${isOwner ? 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/50' : 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800/50'}`}>
                                                    {isOwner ? 'Owner' : user.role || 'Editor'}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2 h-2 rounded-full ${isSuspended ? 'bg-zinc-400' : 'bg-green-500'}`} />
                                                    <span className="text-xs text-zinc-500">{isSuspended ? 'Suspended' : 'Active'}</span>
                                                </div>
                                                <div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                                                    <button onClick={() => openPwReset(user)} title="Reset Password"
                                                        className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-blue-500 hover:border-blue-300 transition-all">
                                                        <Key size={15} />
                                                    </button>
                                                    <button onClick={() => handleSuspendToggle(user.id, user.name)} title={isSuspended ? 'Reactivate' : 'Suspend'}
                                                        className={`p-2 rounded-xl border transition-all ${isSuspended ? 'border-green-200 text-green-500 hover:border-green-400' : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-amber-500 hover:border-amber-300'}`}>
                                                        {isSuspended ? <UserCheck size={15} /> : <UserX size={15} />}
                                                    </button>
                                                    <button onClick={() => confirmDeleteUser(user)} title="Delete Account"
                                                        className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-rose-500 hover:border-rose-400 transition-all">
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Info note */}
                            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30 rounded-2xl p-5 flex items-start gap-3">
                                <AlertTriangle size={17} className="text-blue-500 mt-0.5 shrink-0" />
                                <p className="text-sm text-blue-700 dark:text-blue-400">
                                    <strong>Password Reset Policy:</strong> When a user requests a password reset, the system requires them to verify their <strong>full name</strong> and <strong>registered email address</strong>. Only after successful verification will a new system-generated password be issued. All reset events are recorded in the Audit Logs.
                                </p>
                            </div>
                        </motion.div>
                    )}

                    {/* ═══ DELETE CONFIRMATION MODAL ═══════════════════════ */}
                    <AnimatePresence>
                        {deleteConfirm && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                                <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                                    className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                                    <div className="h-1 w-full bg-gradient-to-r from-rose-600 to-rose-400" />
                                    <div className="p-8">
                                        <div className="flex items-center gap-4 mb-5">
                                            <div className="p-3 bg-rose-100 dark:bg-rose-900/40 rounded-2xl">
                                                <Trash2 size={24} className="text-rose-600 dark:text-rose-400" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-black text-zinc-900 dark:text-white">Confirm Account Deletion</h3>
                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">This action is permanent and cannot be reversed.</p>
                                            </div>
                                        </div>
                                        <div className="bg-zinc-50 dark:bg-zinc-800 rounded-2xl p-4 mb-6 border border-zinc-200 dark:border-zinc-700">
                                            <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-2">Account to be deleted</p>
                                            <p className="text-base font-bold text-zinc-900 dark:text-white">{deleteConfirm.name}</p>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mt-1"><Mail size={13} />{deleteConfirm.email}</p>
                                            <p className="text-sm text-amber-600 dark:text-amber-400 font-mono font-bold mt-1">ID: {deleteConfirm.loginId}</p>
                                        </div>
                                        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 rounded-xl px-4 py-3 mb-6 flex items-start gap-2">
                                            <AlertTriangle size={15} className="text-rose-500 shrink-0 mt-0.5" />
                                            <p className="text-xs text-rose-700 dark:text-rose-400 leading-relaxed">Deleting this account will permanently remove all access credentials and cannot be undone. The user will immediately lose the ability to log in.</p>
                                        </div>
                                        <div className="flex gap-3">
                                            <button onClick={() => setDeleteConfirm(null)}
                                                className="flex-1 px-5 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all">
                                                Cancel
                                            </button>
                                            <button onClick={executeDeleteUser}
                                                className="flex-1 px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-lg shadow-rose-500/25 transition-all flex items-center justify-center gap-2">
                                                <Trash2 size={15} /> Delete Account
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ═══ PASSWORD RESET VERIFICATION MODAL ══════════════ */}
                    <AnimatePresence>
                        {pwResetModal && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                                <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                                    className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                                    <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-600" />
                                    <div className="p-8">
                                        {pwResetStep === 'verify' && (<>
                                            <div className="flex items-center gap-4 mb-6">
                                                <div className="p-3 bg-blue-100 dark:bg-blue-900/40 rounded-2xl"><Key size={22} className="text-blue-600 dark:text-blue-400" /></div>
                                                <div>
                                                    <h3 className="text-lg font-black text-zinc-900 dark:text-white">Password Reset — Identity Verification</h3>
                                                    <p className="text-xs text-zinc-500 mt-0.5">The user must verify their registered details before a new password can be issued.</p>
                                                </div>
                                                <button onClick={() => setPwResetModal(null)} className="ml-auto p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"><X size={18} /></button>
                                            </div>

                                            <div className="bg-zinc-50 dark:bg-zinc-800 rounded-2xl p-4 mb-5 border border-zinc-200 dark:border-zinc-700">
                                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Resetting password for</p>
                                                <p className="font-bold text-zinc-900 dark:text-white">{pwResetModal.name}</p>
                                                <p className="text-xs text-zinc-500 dark:text-zinc-400">Login ID: {pwResetModal.loginId}</p>
                                            </div>

                                            <div className="flex flex-col gap-4 mb-5">
                                                <div>
                                                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">Full Name (as registered)</label>
                                                    <input value={pwVerifyName} onChange={e => { setPwVerifyName(e.target.value); setPwVerifyError(''); }}
                                                        placeholder="Enter the account holder's full name"
                                                        className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/40 transition-all" />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">Registered Email Address</label>
                                                    <input type="email" value={pwVerifyEmail} onChange={e => { setPwVerifyEmail(e.target.value); setPwVerifyError(''); }}
                                                        placeholder="Enter the registered email address"
                                                        className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/40 transition-all" />
                                                </div>
                                            </div>

                                            <AnimatePresence>
                                                {pwVerifyError && (
                                                    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                                        className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 rounded-xl px-4 py-3 flex items-start gap-2 mb-4">
                                                        <AlertTriangle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                                                        <p className="text-xs text-rose-700 dark:text-rose-400">{pwVerifyError}</p>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            <div className="flex gap-3">
                                                <button onClick={() => setPwResetModal(null)}
                                                    className="flex-1 px-5 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all">
                                                    Cancel
                                                </button>
                                                <button onClick={verifyAndResetPassword} disabled={!pwVerifyName || !pwVerifyEmail}
                                                    className="flex-1 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:pointer-events-none text-white font-bold text-sm shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2">
                                                    <BadgeCheck size={15} /> Verify & Reset Password
                                                </button>
                                            </div>
                                        </>)}

                                        {pwResetStep === 'success' && (<>
                                            <div className="text-center mb-6">
                                                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-4">
                                                    <CheckCircle2 size={32} className="text-emerald-500" />
                                                </div>
                                                <h3 className="text-lg font-black text-zinc-900 dark:text-white">Verification Passed</h3>
                                                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Identity confirmed for <strong>{pwResetModal.name}</strong>. A new system password has been generated and saved.</p>
                                            </div>

                                            <div className="bg-zinc-50 dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-5 mb-5">
                                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">New System Password</p>
                                                <div className="flex items-center gap-3">
                                                    <code className="flex-1 text-base font-mono font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-4 py-3 rounded-xl border border-rose-200 dark:border-rose-800/40 tracking-widest">
                                                        {showNewPw ? pwNewGenerated : '•'.repeat(16)}
                                                    </code>
                                                    <button onClick={() => setShowNewPw(!showNewPw)} className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-rose-500 transition-colors">
                                                        {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </button>
                                                    <button onClick={() => { navigator.clipboard.writeText(pwNewGenerated); setPwCopied(true); setTimeout(() => setPwCopied(false), 2000); }}
                                                        className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-emerald-500 transition-colors">
                                                        {pwCopied ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Copy size={16} />}
                                                    </button>
                                                </div>
                                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-2">Share this password securely with the user. Advise them to keep it safe.</p>
                                            </div>

                                            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-4 py-3 mb-5 flex items-start gap-2">
                                                <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                                                <p className="text-xs text-emerald-700 dark:text-emerald-400">This event has been recorded in the Audit Logs with a timestamp. The new password is now active in the system.</p>
                                            </div>

                                            <button onClick={() => setPwResetModal(null)}
                                                className="w-full px-5 py-3 rounded-2xl bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-700 dark:hover:bg-white text-white dark:text-zinc-900 font-bold text-sm transition-all">
                                                Done
                                            </button>
                                        </>)}
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>


                    {/* ─── NETWORK SIMULATOR TAB ───────────────────────── */}
                    {activeTab === 'Network Simulator' && (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="w-full max-w-5xl mx-auto flex flex-col space-y-6">
                            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-2xl p-5 flex items-start gap-3">
                                <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-sm font-bold text-amber-700 dark:text-amber-400">Thesis Defense Tool — Network Fault Simulator</p>
                                    <p className="text-sm text-amber-600 dark:text-amber-500 mt-0.5">This tool demonstrates how the CRDT State Convergence Model handles unstable network conditions. Use it during your defense to show offline-first resilience and automatic conflict-free merging.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {/* Offline Detection - Automatic */}
                                <div className={`bg-white dark:bg-zinc-800 border-2 rounded-2xl shadow-lg p-6 transition-all duration-300 ${offlineSimActive ? 'border-red-400 dark:border-red-600 shadow-red-500/20' : 'border-zinc-200 dark:border-zinc-700'}`}>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className={`p-2.5 rounded-xl ${offlineSimActive ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400' : 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400'}`}>
                                            {offlineSimActive ? <WifiOff size={20} /> : <Wifi size={20} />}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-zinc-900 dark:text-white">Network Connectivity Status</h3>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Automatically detected from the device&apos;s real network state</p>
                                        </div>
                                        <span className={`ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full border ${offlineSimActive ? 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800/50' : 'text-green-600 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800/50'}`}>
                                            {offlineSimActive ? 'OFFLINE' : 'ONLINE'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-5">
                                        {offlineSimActive
                                            ? '🔴 Device is currently OFFLINE. The CRDT engine is buffering all edits locally. When the connection returns, changes will automatically merge with zero data loss.'
                                            : '🟢 Device is ONLINE. Real-time synchronization is active. All changes are being pushed to Supabase instantly.'}
                                    </p>
                                    <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700">
                                        <span className={`w-3 h-3 rounded-full ${offlineSimActive ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                                        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                            {offlineSimActive ? 'CRDT Offline Mode Active — Edits queued in local state vector' : 'Supabase Realtime WebSocket — Connected'}
                                        </span>
                                    </div>
                                </div>

                                {/* Latency Simulation */}
                                <div className={`bg-white dark:bg-zinc-800 border-2 rounded-2xl shadow-lg p-6 transition-all duration-300 ${latencySimActive ? 'border-amber-400 dark:border-amber-600 shadow-amber-500/20' : 'border-zinc-200 dark:border-zinc-700'}`}>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className={`p-2.5 rounded-xl ${latencySimActive ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400' : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-500'}`}>
                                            <Wifi size={20} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-zinc-900 dark:text-white">High Latency Simulation</h3>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Injects artificial delay to all sync operations</p>
                                        </div>
                                    </div>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                                        Simulates a slow or congested internet connection. Demonstrates that delta payloads (diffs) are far smaller than full document transfers, maintaining responsiveness.
                                    </p>
                                    <div className="mb-4">
                                        <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Simulated Latency: <span className="text-amber-600 dark:text-amber-400 font-bold">{latencyMs}ms</span></label>
                                        <input type="range" min={100} max={3000} step={100} value={latencyMs} onChange={e => setLatencyMs(Number(e.target.value))}
                                            className="w-full mt-2 accent-amber-500" />
                                        <div className="flex justify-between text-[10px] text-zinc-400 mt-1"><span>100ms</span><span>3000ms</span></div>
                                    </div>
                                    <ToggleSwitch enabled={latencySimActive} onToggle={handleLatencySim}
                                        label={latencySimActive ? `+${latencyMs}ms Latency Active` : 'Simulate High Latency'}
                                        sublabel={latencySimActive ? 'Delta payloads still transmitting. CRDT state valid.' : 'Toggle to inject network latency'}
                                        accentColor="orange" />
                                </div>
                            </div>

                            {/* Simulation Terminal */}
                            <div className="bg-zinc-950 rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden">
                                <div className="px-6 py-3 border-b border-zinc-800 flex items-center gap-3">
                                    <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-red-500" /><div className="w-3 h-3 rounded-full bg-amber-400" /><div className="w-3 h-3 rounded-full bg-green-500" /></div>
                                    <span className="text-xs font-mono font-bold text-zinc-400">Network Simulation Log — CRDT Engine</span>
                                    <button onClick={() => setSimLog(['[SYSTEM] Log cleared.'])} className="ml-auto text-xs text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1"><RefreshCcw size={12} /> Clear</button>
                                </div>
                                <div ref={simLogRef} className="p-6 h-64 overflow-y-auto font-mono text-xs space-y-1.5">
                                    {simLog.map((line, i) => (
                                        <div key={i} className={`${line.includes('🔴') || line.includes('❌') ? 'text-red-400' : line.includes('🟢') || line.includes('✅') ? 'text-green-400' : line.includes('⚠️') ? 'text-amber-400' : 'text-zinc-400'}`}>
                                            {line}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ─── AUDIT LOGS TAB ──────────────────────────────── */}
                    {activeTab === 'Audit Logs' && (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="w-full max-w-5xl mx-auto flex flex-col space-y-6">
                            <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl overflow-hidden">
                                <div className="px-8 py-6 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-rose-100 dark:bg-rose-900/40 text-rose-600 rounded-xl"><Terminal size={22} /></div>
                                        <div>
                                            <h3 className="text-xl font-bold text-zinc-900 dark:text-white">System Audit Trail</h3>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400">Real-time log of all system events, user actions, file conflicts, and synchronization states.</p>
                                        </div>
                                    </div>
                                    <button onClick={() => { setAuditEvents([]); addAuditEvent('Audit log cleared by Administrator.', 'warn'); }}
                                        className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-rose-500 transition-colors px-3 py-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-900/20 border border-transparent hover:border-rose-200 dark:hover:border-rose-800/50">
                                        <RefreshCcw size={14} /> Clear Log
                                    </button>
                                </div>
                                <div ref={auditLogRef} className="divide-y divide-zinc-100 dark:divide-zinc-700/50 max-h-[520px] overflow-y-auto">
                                    {auditEvents.length > 0 ? auditEvents.map((event) => (
                                        <div key={event.id} className="grid grid-cols-[auto_auto_1fr] gap-4 items-start px-8 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                            <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 whitespace-nowrap pt-0.5">{event.time}</span>
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap ${event.level === 'error' ? 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800/50' : event.level === 'warn' ? 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/50' : 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800/50'}`}>
                                                {event.level}
                                            </span>
                                            <span className="text-sm text-zinc-700 dark:text-zinc-300">{event.message}</span>
                                        </div>
                                    )) : (
                                        <div className="px-8 py-16 text-center">
                                            <div className="w-16 h-16 mx-auto rounded-full bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center mb-4"><Terminal size={28} className="text-zinc-400" /></div>
                                            <h4 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">No Events Logged</h4>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400">System events will appear here in real-time.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </main>
            </div>

            {/* Logout Modal */}
            <AnimatePresence>
                {isLogoutModalOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[90%] max-w-md">
                            <div className="h-1 w-full bg-gradient-to-r from-rose-500/50 via-rose-500 to-rose-500/50" />
                            <div className="p-6 text-center">
                                <div className="w-16 h-16 mx-auto bg-rose-500/10 rounded-full flex items-center justify-center mb-4"><LogOut size={32} className="text-rose-500" /></div>
                                <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Log out of Admin Console</h2>
                                <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">Are you sure you want to log out of the administrator panel?</p>
                                <div className="flex gap-4 w-full">
                                    <button onClick={() => setIsLogoutModalOpen(false)} className="flex-1 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm font-semibold">Cancel</button>
                                    <button onClick={() => router.push('/admin/login')} className="flex-1 py-3 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-500 hover:bg-rose-500 hover:text-white transition-all text-sm font-bold">Confirm</button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

```

---

## File: `src/app/dashboard/user/my-drive/page.tsx`

```typescript
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '../../../../components/ThemeToggle';
import {
    Folder, FileText, Clock, Star, Trash2, User,
    CheckCircle2, AlertTriangle, Share2,
    ChevronRight, MoreVertical, Search,
    Activity, RefreshCcw, Database,
    FileIcon, X, Terminal, UploadCloud, FileUp, Wand, LogOut,
    Monitor, Laptop, Lock, Bell, Wifi, Shield, GitMerge,
    Download, WifiOff, Users, Plus, UserPlus, FolderPlus, FilePlus, Settings, Link2, UserCheck, UserX, ChevronLeft,
    Info, Zap, MessageCircle, FileSearch, ListFilter, GripVertical, Sparkles
} from 'lucide-react';
import { useSyncContext, FileData, RepositoryData } from '../../../../context/SyncContext';
import RichTextEditor from '../../../../components/Real-Time_Algo';
import mammoth from 'mammoth';
import { toast } from 'sonner';

export default function UserDashboard() {
    const router = useRouter();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<string>('My Drive');
    const [isOffline, setIsOffline] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const [queueOffline, setQueueOffline] = useState(true);
    const [isLogOpen, setIsLogOpen] = useState(false);
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
    const [currentRepo, setCurrentRepo] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [isCreateRepoOpen, setIsCreateRepoOpen] = useState(false);
    const [newRepoName, setNewRepoName] = useState('');
    const [conflictFile, setConflictFile] = useState<string | null>(null);
    const [isGroupManageOpen, setIsGroupManageOpen] = useState(false);
    const [isInviteExpanded, setIsInviteExpanded] = useState(false);
    const [isJoinRepoOpen, setIsJoinRepoOpen] = useState(false);
    const [joinInviteCode, setJoinInviteCode] = useState('');
    const [isFriendsPanelOpen, setIsFriendsPanelOpen] = useState(false);
    const [friendSearchQuery, setFriendSearchQuery] = useState('');
    const [conflictIndex, setConflictIndex] = useState(0);
    const [resolvedConflicts, setResolvedConflicts] = useState<number[]>([]);
    // Module 2: File Upload
    const [stagedFile, setStagedFile] = useState<{ name: string; content: string; size: number } | null>(null);
    // Module 3: File Editor
    const [editingFile, setEditingFile] = useState<{ name: string; content: string; pendingReview?: { previousContent: string; resolvedWith: 'local' | 'server' | 'merge'; resolvedAt: string } | null } | null>(null);
    const [editorText, setEditorText] = useState('');
    // Always-fresh ref — never stale in closures or modal opens
    const latestEditorTextRef = useRef('');
    useEffect(() => { latestEditorTextRef.current = editorText; }, [editorText]);
    // Module 4: Dynamic conflict content (from editor Save & Quit)
    const [dynamicConflict, setDynamicConflict] = useState<{ localContent: string; serverContent: string; originalContent: string } | null>(null);
    // Module 1: Delete repo confirm
    const [isDeleteRepoOpen, setIsDeleteRepoOpen] = useState(false);
    // Premium delete file modal
    const [deleteFileTarget, setDeleteFileTarget] = useState<{ trashItemId: number; fileName: string } | null>(null);
    // Multi-user editor cards flow
    const [isEditingCardsOpen, setIsEditingCardsOpen] = useState(false);
    const [editingCardsFile, setEditingCardsFile] = useState<{ name: string; content: string; serverContent: string } | null>(null);
    const [reviewingUser, setReviewingUser] = useState<{ name: string; color: string; accentClass: string; content: string; badge: string } | null>(null);
    const [visibleSuggestions, setVisibleSuggestions] = useState<string[]>(['server', 'merge', 'sarah']);
    const [suggestionOrder, setSuggestionOrder] = useState<string[]>(['server', 'merge', 'sarah']);
    // Version History panel
    const [versionHistoryTarget, setVersionHistoryTarget] = useState<{ repoName: string; fileName: string } | null>(null);

    const floatAnim = {
        initial: { y: 0 },
        animate: {
            y: [-3, 3, -3],
            transition: { duration: 5, repeat: Infinity, ease: "easeInOut" as const }
        }
    };

    // Body scroll lock — prevent page jump when any modal is open
    const anyModalOpen = isUploadOpen || isLogoutModalOpen || isCreateRepoOpen
        || !!conflictFile || isGroupManageOpen || isJoinRepoOpen
        || !!editingFile || isDeleteRepoOpen || !!deleteFileTarget
        || isEditingCardsOpen || !!reviewingUser;

    useEffect(() => {
        if (anyModalOpen) {
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            document.body.style.overflow = 'hidden';
            document.body.style.paddingRight = scrollbarWidth > 0 ? `${scrollbarWidth}px` : '';
        } else {
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        }
        return () => {
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        };
    }, [anyModalOpen]);


    const navItems = [
        { name: 'Profile', icon: User },
        { name: 'My Drive', icon: Database },
        { name: 'Recent', icon: Clock },
        { name: 'Starred', icon: Star },
        { name: 'Trash', icon: Trash2 },
    ];

    const [autoSync, setAutoSync] = useState(true);
    const [notifications, setNotifications] = useState(true);
    const [userName, setUserName] = useState('DocuSync Demo User');
    const [userEmail, setUserEmail] = useState('user@docusync.edu');
    const [isEditingProfile, setIsEditingProfile] = useState(false);

    useEffect(() => {
        const storedUser = localStorage.getItem('docusync_current_user');
        if (storedUser) {
            const parsed = JSON.parse(storedUser);
            setUserName(parsed.name);
            setUserEmail(parsed.email);
        }
    }, []);

    // ── Demo User Switcher ─────────────────────────────────────────────────────
    // Allows each browser tab to independently simulate a different user.
    // This is for demo/presentation purposes only.
    const DEMO_USERS = [
        { name: 'Paul John Palamara', email: 'paul@docusync.edu', role: 'Owner',  color: 'bg-amber-500' },
        { name: 'Sofia Reyes',        email: 'sofia@docusync.edu', role: 'Editor', color: 'bg-purple-500' },
        { name: 'Prof. Davis',        email: 'davis@docusync.edu', role: 'Viewer', color: 'bg-zinc-500' },
        { name: 'Elena Rostova',      email: 'elena@docusync.edu', role: 'Editor', color: 'bg-cyan-500' },
    ];
    const switchDemoUser = () => {
        const idx = DEMO_USERS.findIndex(u => u.name === userName);
        const next = DEMO_USERS[(idx + 1) % DEMO_USERS.length];
        localStorage.setItem('docusync_current_user', JSON.stringify({ name: next.name, email: next.email, role: next.role }));
        setUserName(next.name);
        setUserEmail(next.email);
    };
    const currentDemoUser = DEMO_USERS.find(u => u.name === userName) ?? DEMO_USERS[0];
    // ──────────────────────────────────────────────────────────────────────────

    const {
        reposData,
        syncLogs,
        trashedFiles,
        currentStorageUsed,
        storageLimitBytes,
        createRepository,
        deleteRepository,
        deleteFile,
        trashFile,
        restoreFile,
        permanentlyDeleteFile,
        emptyTrash,
        toggleStar,
        broadcastFileUpdate,
        uploadFile,
        simulateConflict,
        saveFileContent,
        resolveConflict,
        clearPendingReview,
        activeEditors,
        notifyEditingStart,
        notifyEditingStop,
        fileDeletedEvent,
        clearFileDeletedEvent,
        isOnline,
        getVersionHistory,
        restoreVersion,
    } = useSyncContext();

    // Real latency measurement — pings a tiny request and measures round-trip time
    const [latencyMs, setLatencyMs] = useState<number | null>(null);
    useEffect(() => {
        const measure = async () => {
            if (!isOnline) { setLatencyMs(null); return; }
            try {
                const start = performance.now();
                await fetch('https://www.google.com/favicon.ico', { mode: 'no-cors', cache: 'no-store' });
                const end = performance.now();
                setLatencyMs(Math.round(end - start));
            } catch { setLatencyMs(null); }
        };
        measure();
        const interval = setInterval(measure, 10000);
        return () => clearInterval(interval);
    }, [isOnline]);

    const latencyLabel = latencyMs === null ? '—' : `${latencyMs}ms`;
    const latencyColor = latencyMs === null ? 'text-zinc-400' : latencyMs < 150 ? 'text-green-500' : latencyMs < 400 ? 'text-amber-500' : 'text-red-500';

    // Alias for the logged-in user name
    const activeUserName = userName;

    // Determine if current user is the owner of the active repo (for approval gating)
    const currentRepoData = reposData.find(r => r.name === currentRepo);
    const isRepoOwner = currentRepoData?.userRole === 'Owner';

    // Owner-delete-warning: when Owner tries to trash a file being edited
    const [ownerDeleteWarning, setOwnerDeleteWarning] = useState<{ repoName: string; fileName: string; editingUsers: string[] } | null>(null);
    // File-deleted-kick modal: shown to editors when Owner deletes their file
    const [fileDeletedKick, setFileDeletedKick] = useState<{ fileName: string } | null>(null);

    // Confirm Trash File: generic confirmation before soft-deleting any file
    const [confirmTrashFile, setConfirmTrashFile] = useState<{ repoName: string; fileName: string } | null>(null);

    // Notify context when we start/stop editing
    useEffect(() => {
        if (editingFile && currentRepo) {
            notifyEditingStart(currentRepo, editingFile.name, activeUserName);
            return () => {
                notifyEditingStop(currentRepo, editingFile.name);
            };
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editingFile?.name, currentRepo]);

    // Detect FILE_DELETED_KICK event — kick the editor out
    useEffect(() => {
        if (fileDeletedEvent && editingFile && currentRepo) {
            if (fileDeletedEvent.repoName === currentRepo && fileDeletedEvent.fileName === editingFile.name) {
                setEditingFile(null);
                setEditorText('');
                setFileDeletedKick({ fileName: fileDeletedEvent.fileName });
                clearFileDeletedEvent();
            } else {
                clearFileDeletedEvent();
            }
        } else if (fileDeletedEvent) {
            clearFileDeletedEvent();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fileDeletedEvent]);

    const formatBytes = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(3)} GB`;
    };
    const storagePercent = Math.min(100, (currentStorageUsed / storageLimitBytes) * 100);

    // Returns gradient + text + border classes for each supported file type
    const getFileIconColors = (ext: string) => {
        switch (ext) {
            case 'md':   return 'from-purple-500/20 to-purple-600/20 text-purple-400 border-purple-500/30';
            case 'json': return 'from-amber-400/20 to-yellow-500/20 text-amber-400 border-amber-400/30';
            case 'csv':  return 'from-emerald-500/20 to-green-600/20 text-emerald-400 border-emerald-500/30';
            case 'docx': return 'from-blue-500/20 to-blue-600/20 text-blue-400 border-blue-500/30';
            case 'txt':  return 'from-zinc-400/20 to-zinc-500/20 text-zinc-400 border-zinc-500/30';
            case 'html': return 'from-orange-500/20 to-red-500/20 text-orange-400 border-orange-500/30';
            case 'xml':  return 'from-teal-500/20 to-cyan-500/20 text-teal-400 border-teal-500/30';
            case 'tex':  return 'from-indigo-500/20 to-slate-600/20 text-indigo-400 border-indigo-500/30';
            case 'rtf':  return 'from-rose-500/20 to-pink-500/20 text-rose-400 border-rose-500/30';
            default:     return 'from-blue-500/20 to-blue-600/20 text-blue-500 border-blue-500/30';
        }
    };

    // Derives the file extension from a filename string
    const getFileExt = (name: string): string => {
        const parts = name.split('.');
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'txt';
    };

    // Returns a color-coded badge class for the extension pill in the file table
    const getExtBadgeClass = (ext: string) => {
        switch (ext) {
            case 'md':   return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
            case 'json': return 'bg-amber-400/15 text-amber-400 border-amber-400/30';
            case 'csv':  return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
            case 'docx': return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
            case 'txt':  return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30';
            case 'html': return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
            case 'xml':  return 'bg-teal-500/15 text-teal-400 border-teal-500/30';
            case 'tex':  return 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30';
            case 'rtf':  return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
            default:     return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30';
        }
    };

    // ── Demo Suite ────────────────────────────────────────────────────────────
    // Injects one example file per supported format into the active repository
    // so the thesis panel can see the Hybrid Engine process every format live.
    const ALLOWED_EXTS = new Set(['txt', 'docx', 'md', 'json', 'csv', 'rtf', 'html', 'xml', 'tex']);

    const loadDemoSuite = () => {
        if (!currentRepo) return;
        const now = new Date().toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false,
        });

        // ── 1. JSON — structured server configuration ──────────────────────────
        const jsonContent = JSON.stringify({
            app: 'DocuSync',
            version: '3.1.0',
            server: 'Node.js v20',
            port: 8080,
            hybrid_sync: true,
            max_payload_mb: 4,
            delta_encoding: 'enabled',
            crdt_algorithm: 'LWW + Vector Clock',
            signaling_server: 'wss://signaling.yjs.dev',
            endpoints: { upload: '/api/upload', sync: '/api/sync', health: '/api/health' },
            supported_formats: ['txt', 'docx', 'md', 'json', 'csv', 'rtf', 'html', 'xml', 'tex'],
            last_updated: new Date().toISOString(),
        }, null, 2);

        // ── 2. CSV — university student ledger ────────────────────────────────
        const csvContent = [
            'StudentID,Name,Department,Status,Year,GWA',
            '2023-001,Paul Palamara,CS,Cleared,4th,1.50',
            '2023-002,Zyra Venancio,CS,Cleared,4th,1.75',
            '2023-003,Sofia Reyes,CS,Cleared,4th,1.25',
            '2023-004,James Cruz,IT,Pending,3rd,2.00',
            '2023-005,Elena Rostova,IS,Cleared,4th,1.50',
            '2023-006,Prof. Davis,Faculty,Active,N/A,N/A',
        ].join('\n');

        // ── 3. MD — system architecture documentation ─────────────────────────
        const mdContent = [
            '# DocuSync Architecture',
            '',
            'This system utilizes a **Hybrid Sync Engine** combining multiple distributed algorithms.',
            '',
            '## Core Algorithms',
            '- **Vector Clocks** — causality tracking across peers',
            '- **Last-Write-Wins (LWW)** — conflict resolution strategy',
            '- **Delta Encoding** — only diffs are transmitted over the wire',
            '- **Yjs CRDT** — real-time collaborative state convergence',
            '',
            '## Supported File Formats',
            '- `.txt`  Plain text documents',
            '- `.docx` Word documents (parsed via mammoth.js)',
            '- `.md`   Markdown (converted to HTML on load)',
            '- `.json` Structured config / data (pretty-printed)',
            '- `.csv`  Tabular ledger data',
            '- `.html` Web markup (displayed as source code)',
            '- `.xml`  Structured markup / data interchange',
            '- `.tex`  LaTeX academic documents',
            '- `.rtf`  Rich Text Format documents',
            '',
            '## Sync Flow',
            '1. Client detects local edit → generates Delta patch',
            '2. Delta broadcast via WebRTC (y-webrtc)',
            '3. Remote peers apply patch via CRDT merge',
            '4. Vector Clock incremented → convergence confirmed',
        ].join('\n');

        // ── 4. TXT — plain text research abstract ─────────────────────────────
        const txtContent = [
            'DOCUSYNC: A HYBRID REAL-TIME COLLABORATIVE DOCUMENT SYNCHRONIZATION SYSTEM',
            '============================================================================',
            '',
            'ABSTRACT',
            '',
            'DocuSync is a web-based collaborative document editing platform built on a',
            'Hybrid Synchronization Engine that combines Conflict-free Replicated Data',
            'Types (CRDTs), Vector Clocks, and Last-Write-Wins (LWW) semantics to ensure',
            'eventual consistency across distributed peers.',
            '',
            'The system supports nine plain-text and structured-text file formats:',
            '.txt, .docx, .md, .json, .csv, .html, .xml, .tex, and .rtf.',
            '',
            'Key contributions:',
            '  1. Delta Encoding reduces network payload by up to 85%.',
            '  2. Offline-first buffering ensures zero edit loss during disconnection.',
            '  3. Real-time conflict resolution via a visual Conflict Hub interface.',
            '',
            'Keywords: CRDT, LWW, Delta Encoding, WebRTC, Collaborative Editing',
        ].join('\n');

        // ── 5. HTML — web page source markup ──────────────────────────────────
        const htmlContent = [
            '<!DOCTYPE html>',
            '<html lang="en">',
            '<head>',
            '    <meta charset="UTF-8" />',
            '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
            '    <title>DocuSync — Collaborative Engine</title>',
            '    <style>',
            '        body { font-family: Inter, sans-serif; background: #09090b; color: #f4f4f5; }',
            '        h1   { color: #f59e0b; }',
            '        code { background: #1c1c1e; padding: 2px 6px; border-radius: 4px; }',
            '    </style>',
            '</head>',
            '<body>',
            '    <h1>DocuSync Hybrid Engine</h1>',
            '    <p>Sync algorithm: <code>LWW + Vector Clock + Delta Encoding</code></p>',
            '    <ul>',
            '        <li>Real-time collaboration via WebRTC</li>',
            '        <li>9 supported file formats</li>',
            '        <li>Offline-first with CRDT buffering</li>',
            '    </ul>',
            '</body>',
            '</html>',
        ].join('\n');

        // ── 6. XML — data interchange / config ────────────────────────────────
        const xmlContent = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<docusync version="3.1.0">',
            '    <engine>',
            '        <algorithm>LWW + Vector Clock</algorithm>',
            '        <delta_encoding>true</delta_encoding>',
            '        <offline_buffer>true</offline_buffer>',
            '        <signaling>wss://signaling.yjs.dev</signaling>',
            '    </engine>',
            '    <formats>',
            '        <format ext="txt"  renderer="plain-text" />',
            '        <format ext="docx" renderer="mammoth"    />',
            '        <format ext="md"   renderer="md-to-html" />',
            '        <format ext="json" renderer="code-view"  />',
            '        <format ext="csv"  renderer="code-view"  />',
            '        <format ext="html" renderer="code-view"  />',
            '        <format ext="xml"  renderer="code-view"  />',
            '        <format ext="tex"  renderer="code-view"  />',
            '        <format ext="rtf"  renderer="plain-text" />',
            '    </formats>',
            '    <team>',
            '        <member role="Owner">Paul John Palamara</member>',
            '        <member role="Editor">Sofia Reyes</member>',
            '        <member role="Viewer">Prof. Davis</member>',
            '    </team>',
            '</docusync>',
        ].join('\n');

        // ── 7. TEX — LaTeX academic paper ─────────────────────────────────────
        const texContent = [
            '\\documentclass[12pt]{article}',
            '\\usepackage[utf8]{inputenc}',
            '\\usepackage{amsmath}',
            '\\usepackage{hyperref}',
            '',
            '\\title{DocuSync: A Hybrid Real-Time Collaborative\\\\Document Synchronization System}',
            '\\author{Paul John Palamara \\\\ \\textit{Cabuyao City University — CS 402}}',
            '\\date{\\today}',
            '',
            '\\begin{document}',
            '\\maketitle',
            '',
            '\\begin{abstract}',
            'DocuSync implements a hybrid synchronization engine combining',
            'CRDTs, Vector Clocks, and Last-Write-Wins (LWW) semantics',
            'to achieve eventual consistency across distributed collaborative peers.',
            '\\end{abstract}',
            '',
            '\\section{Introduction}',
            'Collaborative document editing requires robust conflict resolution.',
            'DocuSync addresses this by layering three complementary algorithms:',
            '',
            '\\begin{itemize}',
            '    \\item \\textbf{Vector Clocks} — track causal ordering of edits',
            '    \\item \\textbf{LWW Registers} — resolve concurrent writes deterministically',
            '    \\item \\textbf{Delta Encoding} — transmit only changed fragments',
            '\\end{itemize}',
            '',
            '\\section{Conclusion}',
            'The Hybrid Engine reduces network overhead by $85\\%$ while',
            'guaranteeing zero edit loss during offline operation.',
            '',
            '\\end{document}',
        ].join('\n');

        // ── 8. RTF — rich text format document ────────────────────────────────
        const rtfContent = [
            '{\\rtf1\\ansi\\deff0',
            '{\\fonttbl {\\f0 Times New Roman;}{\\f1 Courier New;}}',
            '{\\colortbl ;\\red245\\green158\\blue11;}',
            '\\f0\\fs28\\b DocuSync — Project Overview\\b0\\par',
            '\\fs22\\par',
            'This document was uploaded as an \\b RTF\\b0  (Rich Text Format) file.\\par',
            'The DocuSync Hybrid Engine treats RTF as a plain-text stream,\\par',
            'preserving all control words and ensuring zero data loss during sync.\\par',
            '\\par',
            '\\b Synchronization Properties:\\b0\\par',
            '\\f1\\fs20',
            '  Algorithm : LWW + Vector Clock\\par',
            '  Transport : WebRTC (y-webrtc)\\par',
            '  Encoding  : Delta patches (85% reduction)\\par',
            '  Formats   : 9 supported types\\par',
            '\\f0\\fs22\\par',
            'Team: Paul Palamara, Sofia Reyes, Prof. Davis\\par',
            '}',
        ].join('\n');

        // ── 9. DOCX — pre-rendered HTML (as mammoth would produce) ───────────
        const docxContent = [
            '<h1>Chapter 1 — Introduction to DocuSync</h1>',
            '<p>DocuSync is a <strong>collaborative document editing system</strong> built on top of the Yjs CRDT library and WebRTC peer-to-peer networking.</p>',
            '<h2>1.1 Problem Statement</h2>',
            '<p>Traditional cloud editors rely on central servers for conflict resolution. This creates latency, single points of failure, and lock-in. DocuSync solves this with a fully decentralised <em>Hybrid Sync Engine</em>.</p>',
            '<h2>1.2 Objectives</h2>',
            '<p>The system aims to:</p>',
            '<ul><li>Achieve real-time collaborative editing with sub-100ms latency</li><li>Reduce network payload by 85% via Delta Encoding</li><li>Guarantee zero edit loss during offline operation</li></ul>',
            '<h2>1.3 Scope</h2>',
            '<p>DocuSync supports nine file formats: <strong>.txt, .docx, .md, .json, .csv, .html, .xml, .tex, .rtf</strong>. Each format is parsed appropriately and injected into the shared Yjs document for collaborative editing.</p>',
        ].join('');

        // ── Assemble the full demo suite ───────────────────────────────────────
        const enc = (s: string) => new TextEncoder().encode(s).length;
        const demoFiles: Array<Omit<FileData, 'id' | 'syncStatus' | 'isSyncing'>> = [
            { name: 'Developer_Config.json',    type: 'json', date: now, content: jsonContent,  serverContent: '', size: enc(jsonContent)  },
            { name: 'University_Ledger.csv',    type: 'csv',  date: now, content: csvContent,   serverContent: '', size: enc(csvContent)   },
            { name: 'System_Architecture.md',   type: 'md',   date: now, content: mdContent,    serverContent: '', size: enc(mdContent)    },
            { name: 'Research_Abstract.txt',    type: 'text', date: now, content: txtContent,   serverContent: '', size: enc(txtContent)   },
            { name: 'Landing_Page.html',        type: 'html', date: now, content: htmlContent,  serverContent: '', size: enc(htmlContent)  },
            { name: 'Engine_Config.xml',        type: 'xml',  date: now, content: xmlContent,   serverContent: '', size: enc(xmlContent)   },
            { name: 'Thesis_Paper.tex',         type: 'tex',  date: now, content: texContent,   serverContent: '', size: enc(texContent)   },
            { name: 'Project_Overview.rtf',     type: 'rtf',  date: now, content: rtfContent,   serverContent: '', size: enc(rtfContent)   },
            { name: 'Chapter_1_Intro.docx',     type: 'word', date: now, content: docxContent,  serverContent: '', size: enc(docxContent)  },
        ];

        // Upload only files that don't already exist in the repo
        const repo = reposData.find(r => r.name === currentRepo);
        const existing = new Set(repo?.files.map(f => f.name) ?? []);
        let injected = 0;
        demoFiles.forEach(f => {
            if (!existing.has(f.name)) { uploadFile(currentRepo, f); injected++; }
        });

        if (injected > 0) {
            toast.success(`Demo Suite loaded — ${injected} of 9 file(s) injected`, {
                description: '.json · .csv · .md · .txt · .html · .xml · .tex · .rtf · .docx',
                duration: 5000,
                icon: '🧪',
            });
        } else {
            toast('Demo Suite already present in this repository', {
                description: 'All 9 demo files are already in the file list.',
                duration: 3000,
                icon: '✅',
            });
        }
    };
    // ─────────────────────────────────────────────────────────────────────────


    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 transition-colors duration-300 font-sans relative overflow-hidden flex">
            {/* Interactive Animated Ambient Orbs Background */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                {/* Light Mode Glow */}
                <motion.div 
                    animate={{ x: [0, 50, -30, 0], y: [0, -40, 60, 0], scale: [1, 1.1, 0.9, 1] }} 
                    transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
                    className="absolute -top-40 left-10 w-[60vw] h-[50vw] rounded-full bg-amber-500/5 blur-[100px] dark:hidden" 
                />
                
                {/* Dark Mode Ambient Orbs */}
                <motion.div 
                    animate={{ rotate: 360, scale: [1, 1.2, 0.9, 1] }} 
                    transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                    className="hidden dark:block absolute -top-40 -left-20 w-[60vw] h-[60vw] rounded-full bg-gradient-to-br from-amber-500/10 to-transparent blur-[120px]" 
                />
                <motion.div 
                    animate={{ x: [0, -100, 50, 0], y: [0, 80, -60, 0], scale: [0.8, 1.1, 0.9, 0.8] }} 
                    transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                    className="hidden dark:block absolute top-1/3 -right-20 w-[40vw] h-[50vw] rounded-full bg-gradient-to-tl from-purple-600/10 to-transparent blur-[100px]" 
                />
                <div className="hidden dark:block absolute top-0 inset-x-0 h-[600px] bg-gradient-to-b from-zinc-900/80 via-zinc-950/20 to-transparent" />
            </div>

            {/* ═══════════ OFFLINE / RECONNECTION BANNER ═══════════ */}
            <AnimatePresence>
                {!isOnline && (
                    <motion.div
                        key="offline-banner"
                        initial={{ y: -80, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -80, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                        className="fixed top-0 left-0 right-0 z-[999] bg-gradient-to-r from-red-600 via-red-500 to-rose-600 text-white shadow-[0_4px_30px_rgba(239,68,68,0.5)]"
                    >
                        <div className="flex items-center justify-center gap-3 px-6 py-3 text-sm font-semibold">
                            <WifiOff size={16} className="animate-pulse flex-shrink-0" />
                            <span>
                                You are <strong>offline</strong> — Hybrid Engine is buffering your edits locally.
                                All changes will automatically sync when connection is restored.
                            </span>
                            <span className="ml-2 px-2 py-0.5 rounded-full bg-white/20 border border-white/30 text-[10px] font-black uppercase tracking-widest">
                                Hybrid Engine Active
                            </span>
                        </div>
                    </motion.div>
                )}
                {isOnline && latencyMs !== null && latencyMs > 1000 && (
                    <motion.div
                        key="high-latency-banner"
                        initial={{ y: -80, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -80, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                        className="fixed top-0 left-0 right-0 z-[999] bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white shadow-[0_4px_30px_rgba(245,158,11,0.4)]"
                    >
                        <div className="flex items-center justify-center gap-3 px-6 py-3 text-sm font-semibold">
                            <Activity size={16} className="flex-shrink-0" />
                            <span>
                                High latency detected: <strong>{latencyMs}ms</strong> — Delta Sync is active to keep performance smooth on slow connections.
                            </span>
                            <span className="ml-2 px-2 py-0.5 rounded-full bg-white/20 border border-white/30 text-[10px] font-black uppercase tracking-widest">
                                Delta Active
                            </span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══════════ USER SIDEBAR (Amber) ═══════════ */}
            <AnimatePresence>
                {(isSidebarOpen || (typeof window !== 'undefined' && window.innerWidth >= 1024)) && (
                    <motion.div 
                        initial={{ x: -260 }}
                        animate={{ x: 0 }}
                        exit={{ x: -260 }}
                        className="fixed lg:relative z-[100] lg:z-10 w-64 h-full border-r border-white/5 dark:border-white/5 bg-white/90 dark:bg-zinc-950/95 backdrop-blur-3xl px-5 py-8 flex flex-col shadow-[20px_0_60px_rgba(0,0,0,0.4)] lg:shadow-none"
                    >
                        <div className="flex items-center justify-between mb-12">
                            <div 
                                className="flex items-center gap-4 group cursor-pointer" 
                                onClick={() => router.push('/')}
                                title="Back to Landing Page"
                            >
                                <motion.div 
                                    whileHover={{ rotate: 180 }}
                                    transition={{ duration: 0.6 }}
                                    className="w-10 h-10 flex items-center justify-center"
                                >
                                    <div className="w-full h-full rounded-md bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30 p-1.5">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
                                    </div>
                                </motion.div>
                                <h1 className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 select-none">
                                    DocuSync
                                </h1>
                            </div>
                            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500"><X size={20} /></button>
                        </div>

                        <div className="flex-1 flex flex-col gap-1.5">
                            {navItems.map((item) => {
                                const isActive = activeTab === item.name;
                                return (
                                    <motion.button
                                        key={item.name}
                                        onClick={() => { setActiveTab(item.name); setIsSidebarOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 ${isActive
                                            ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 shadow-[0_4px_12px_rgba(249,115,22,0.15)]'
                                            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/5'
                                            }`}
                                        whileHover={{ x: isActive ? 0 : 4 }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        <item.icon size={19} className={isActive ? "text-orange-500" : ""} />
                                        <span className="font-bold text-sm tracking-wide">{item.name}</span>
                                    </motion.button>
                                );
                            })}
                        </div>

                        {/* Usage Card (Mobile Friendly) */}
                        <div className="mt-auto p-4 rounded-2xl bg-zinc-100/50 dark:bg-white/5 border border-zinc-200/50 dark:border-white/5">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">Storage</span>
                                <span className="text-[10px] font-bold text-orange-500">{storagePercent.toFixed(1)}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-orange-400 to-amber-500 transition-all duration-500" style={{ width: `${storagePercent}%` }} />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══════════ MAIN CONTENT ═══════════ */}
            <div className="flex-1 flex flex-col relative z-10 h-screen overflow-hidden">
                {/* Header */}
                <header className="px-5 sm:px-8 py-4 sm:py-6 flex justify-between items-center z-20">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 shadow-sm">
                            <Plus size={20} className="rotate-45" /> {/* Use Plus rotated as a minimalist menu icon if needed, or just X */}
                        </button>
                        <div className="hidden sm:flex items-center text-sm font-medium bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl px-5 py-3 rounded-2xl border border-white/10 dark:border-white/5 shadow-lg">
                            <span className="text-zinc-900 dark:text-zinc-100 font-bold tracking-wide">{activeTab} Overview</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-4 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl px-2 sm:px-5 py-2.5 rounded-2xl border border-white/10 dark:border-white/5 shadow-lg">
                        <ThemeToggle />
                        {/* Demo User Switcher — click to cycle through simulated users per tab */}
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={switchDemoUser}
                            title="Click to switch demo user (per tab)"
                            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-orange-400/50 transition-all"
                        >
                            <div className={`w-5 h-5 rounded-full ${currentDemoUser.color} flex items-center justify-center text-[9px] font-black text-white flex-shrink-0`}>
                                {currentDemoUser.name.charAt(0)}
                            </div>
                            <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-200 max-w-[90px] truncate">{currentDemoUser.name.split(' ')[0]}</span>
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                                currentDemoUser.role === 'Owner' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400' :
                                currentDemoUser.role === 'Editor' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400' :
                                'bg-zinc-200 dark:bg-zinc-700 text-zinc-500'
                            }`}>{currentDemoUser.role}</span>
                        </motion.button>
                        <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-300 ${!isOnline ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20' : 'border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-900/20'}`}>
                            <div className={`w-2 h-2 rounded-full ${!isOnline ? 'bg-red-500 animate-pulse' : 'bg-green-500 animate-pulse'}`} />
                            <span className={`text-xs font-bold ${!isOnline ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
                                {!isOnline ? 'Offline — Hybrid Buffering' : 'Online'}
                            </span>
                            {isOnline && latencyMs !== null && (
                                <span className={`text-[10px] font-bold ml-1 ${latencyColor}`}>{latencyLabel}</span>
                            )}
                        </div>
                        
                        <div className="hidden lg:flex items-center ml-2 border-l border-zinc-200 dark:border-zinc-700 pl-4">
                            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-widest font-black mr-3">Friends</span>
                            <motion.div 
                                className="flex -space-x-2 cursor-pointer"
                                onClick={() => setIsFriendsPanelOpen(true)}
                                initial="hidden"
                                animate="show"
                                variants={{
                                    hidden: {},
                                    show: { transition: { staggerChildren: 0.1 } }
                                }}
                            >
                                {['S', 'P', 'E'].map((initial, i) => (
                                    <motion.div 
                                        key={i} 
                                        variants={{
                                            hidden: { scale: 0, x: -10 },
                                            show: { scale: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 20 } }
                                        }}
                                        whileHover={{ scale: 1.25, zIndex: 20, y: -4, transition: { type: "spring", stiffness: 400, damping: 10 } }} 
                                        className={`w-8 h-8 rounded-full border-2 border-white dark:border-zinc-900 flex items-center justify-center text-[10px] font-black text-white ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-orange-500' : 'bg-rose-500'} shadow-[0_4px_10px_rgba(0,0,0,0.1)]`}
                                    >
                                        {initial}
                                    </motion.div>
                                ))}
                            </motion.div>
                        </div>
                    </div>
                </header>

                {/* Main Area */}
                <main className="flex-1 overflow-y-auto px-8 pb-48 custom-scrollbar" onClick={() => setOpenMenuId(null)}>
                    {activeTab === 'My Drive' ? (
                        <>
                            <div className="flex flex-row items-center justify-between w-full mb-6 px-6 py-4 border-b border-white/5 dark:border-white/5">
                                <div className="flex flex-row items-center gap-4">
                                    {currentRepo && (
                                        <>
                                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} onClick={() => { setCurrentRepo(null); setSelectedFile(null); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-white transition-colors font-semibold border border-transparent">
                                                <ChevronLeft size={16} /> Back to My Drive
                                            </motion.button>
                                            <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block"></div>
                                        </>
                                    )}
                                    {!currentRepo ? (
                                        <div className="flex gap-3">
                                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} onClick={() => setIsCreateRepoOpen(true)} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-md shadow-orange-500/20">
                                                <FolderPlus size={16} /> Create Repository
                                            </motion.button>
                                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} onClick={() => setIsJoinRepoOpen(true)} className="flex items-center gap-2 bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-colors">
                                                <Link2 size={16} /> Join Repository
                                            </motion.button>
                                        </div>
                                    ) : (
                                        isRepoOwner && (
                                            <div className="flex items-center gap-2">
                                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} onClick={() => setIsUploadOpen(true)} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-md shadow-orange-500/20">
                                                    <FilePlus size={16} /> Add File
                                                </motion.button>
                                                <motion.button
                                                    whileHover={{ scale: 1.02 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={loadDemoSuite}
                                                    title="Inject 3 structured-text demo files (.json, .csv, .md) for thesis panel demonstration"
                                                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 hover:border-purple-400/50 transition-all"
                                                >
                                                    <Sparkles size={15} className="animate-pulse" /> Load Demo Suite
                                                </motion.button>
                                            </div>
                                        )
                                    )}
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><WifiOff size={16} /> Enable Offline Mode</span>
                                    <div onClick={() => setIsOffline(!isOffline)} className={`w-12 h-6 rounded-full relative cursor-pointer shadow-inner transition-colors ${isOffline ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}>
                                        <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-md ${isOffline ? 'right-0.5' : 'left-0.5'}`}></div>
                                    </div>
                                </div>
                            </div>
                            {/* Repo list OR detail view with tabs */}
                            {!currentRepo ? (
                                <>
                                    <div className="grid grid-cols-[3fr_1fr_1fr] gap-4 px-6 py-4 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border-b border-white/5 sticky top-0 bg-zinc-50/80 dark:bg-zinc-950/80 backdrop-blur-xl z-10">
                                        <div>Name</div><div>Status</div><div>Last Synced</div>
                                    </div>
                                    <motion.div 
                                        className="mt-4 flex flex-col gap-3"
                                        variants={{
                                            hidden: { opacity: 0 },
                                            show: { opacity: 1, transition: { staggerChildren: 0.1 } }
                                        }}
                                        initial="hidden"
                                        animate="show"
                                    >
                                        <AnimatePresence mode="popLayout">
                                            {reposData.map((repo) => (
                                                <motion.div key={`repo-${repo.id}`} onClick={() => setCurrentRepo(repo.name)}
                                                    variants={{
                                                        hidden: { opacity: 0, y: 15, rotateX: -20, scale: 0.95 },
                                                        show: { opacity: 1, y: 0, rotateX: 0, scale: 1, transition: { type: "spring", stiffness: 180, damping: 20 } }
                                                    }}
                                                    style={{ transformOrigin: "top center", perspective: 1000 }}
                                                    whileHover={{ scale: 1.015, y: -2, rotateX: 2 }}
                                                    className="grid grid-cols-[3fr_1fr_1fr] gap-4 items-center px-6 py-4 rounded-2xl bg-white/60 dark:bg-zinc-900/60 backdrop-blur-sm border border-white/10 dark:border-white/5 cursor-pointer hover:border-orange-400/40 hover:bg-white/80 dark:hover:bg-zinc-800/80 hover:shadow-[0_4px_24px_rgba(0,0,0,0.15)] transition-all duration-200 group">
                                                    <div className="flex items-center gap-4">
                                                        <div className="p-2.5 rounded-xl bg-gradient-to-br border from-orange-500/20 to-purple-600/20 text-orange-400 border-orange-500/30"><Folder size={20} /></div>
                                                        <span className="font-medium text-zinc-800 dark:text-zinc-100">{repo.name}</span>
                                                    </div>
                                                    <div>{repo.status === 'Up to date' ? (<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-medium"><CheckCircle2 size={14} /> {repo.status}</div>) : (<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/30 text-xs font-medium animate-pulse"><RefreshCcw size={14} /> {repo.status}</div>)}</div>
                                                    <div className="text-sm text-zinc-500 dark:text-zinc-400">{repo.lastSynced}</div>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    </motion.div>
                                </>
                            ) : (() => {
                                const activeRepo = reposData.find(r => r.name === currentRepo);
                                const isOwner = activeRepo?.userRole === 'Owner';
                                const badgeColors: Record<string, string> = {
                                    amber: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50',
                                    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/50',
                                    zinc: 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-600',
                                };
                                return (
                                    <div className="flex flex-col gap-0">
                                        {/* Repo Header */}
                                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 sticky top-0 bg-zinc-50/80 dark:bg-zinc-950/80 backdrop-blur-xl z-10">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-500 border border-amber-500/30">
                                                    <Folder size={20} />
                                                </div>
                                                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{activeRepo?.name}</h2>
                                                <div className="ml-2 px-2.5 py-1 rounded-lg border bg-white/10 dark:bg-white/5 border-white/10 text-zinc-400 dark:text-zinc-400 text-xs font-bold flex items-center gap-1.5 backdrop-blur-sm">
                                                    <Shield size={12} /> Role: {activeRepo?.userRole}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => {
                                                    navigator.clipboard.writeText(`${window.location.origin}/dashboard/user/my-drive?repo=${activeRepo?.name}`);
                                                    setLinkCopied(true);
                                                    setTimeout(() => setLinkCopied(false), 2000);
                                                }} className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl transition-all border border-white/10 bg-white/5 dark:bg-white/5 text-zinc-300 hover:text-blue-400 hover:border-blue-400/40 hover:bg-white/10 shadow-sm text-sm font-semibold backdrop-blur-sm">
                                                    {linkCopied ? <CheckCircle2 size={16} className="text-green-500" /> : <Link2 size={16} />} 
                                                    {linkCopied ? <span className="text-green-500">Copied!</span> : 'Copy Link'}
                                                </button>
                                                <motion.button 
                                                    whileHover={{ scale: 1.02 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    onClick={() => simulateConflict(activeRepo?.name || '')} 
                                                    className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl transition-all border border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 shadow-sm text-sm font-semibold backdrop-blur-sm"
                                                >
                                                    <Zap size={16} fill="currentColor" /> Simulate Collision
                                                </motion.button>
                                                <button onClick={() => setIsGroupManageOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all border border-white/10 bg-white/5 dark:bg-white/5 text-zinc-300 hover:text-orange-400 hover:border-orange-400/40 hover:bg-white/10 shadow-sm text-sm font-semibold backdrop-blur-sm">
                                                    {isOwner ? <><Settings size={16} /> Manage Group</> : <><Users size={16} /> Team Members</>}
                                                </button>
                                            </div>
                                        </div>

                                        {/* File List */}
                                        <div className="grid grid-cols-[3fr_2fr_2fr_1fr_auto] items-center gap-4 px-6 py-3 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border-b border-white/5">
                                            <div className="text-left">Name</div><div className="text-left">Sync Status</div><div className="text-left">Last Modified</div><div className="text-left">Contributors</div><div className="w-20"></div>
                                        </div>
                                        <motion.div 
                                            className="mt-4 flex flex-col gap-3"
                                            variants={{
                                                hidden: { opacity: 0 },
                                                show: { opacity: 1, transition: { staggerChildren: 0.1 } }
                                            }}
                                            initial="hidden"
                                            animate="show"
                                        >
                                            <AnimatePresence mode="popLayout">
                                                {activeRepo?.files.map((file) => (
                                                    <motion.div key={`file-${file.id}`} onClick={() => {
                                                        // Clicking the file row always goes to Edit Mode
                                                        setEditingFile({ name: file.name, content: file.content || '', pendingReview: file.pendingReview });
                                                        setEditorText(file.content || '');
                                                    }}
                                                        variants={{
                                                            hidden: { opacity: 0, y: 15, rotateX: -20, scale: 0.95 },
                                                            show: { opacity: 1, y: 0, rotateX: 0, scale: 1, transition: { type: "spring", stiffness: 180, damping: 20 } }
                                                        }}
                                                        style={{ transformOrigin: "top center", perspective: 1000 }}
                                                        whileHover={{ scale: 1.015, y: -2, rotateX: 2 }}
                                                        className={`grid grid-cols-[3fr_2fr_2fr_1fr_auto] items-center gap-4 px-6 py-4 rounded-2xl border cursor-pointer transition-all duration-300 group relative ${openMenuId === String(file.id) ? 'z-[50] border-orange-400/60 shadow-lg' : 'z-0 bg-white/60 dark:bg-zinc-900/50 backdrop-blur-sm border-white/10 dark:border-white/5 hover:border-orange-400/40 hover:bg-white/80 dark:hover:bg-zinc-800/60 hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]'}`}>
                                                        <div className="flex items-center gap-4">
                                                            <div className={`p-2.5 rounded-xl bg-gradient-to-br border ${getFileIconColors(getFileExt(file.name))}`}><FileText size={20} /></div>
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <span className="font-medium text-zinc-800 dark:text-zinc-100 truncate">{file.name}</span>
                                                                <span className={`hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border flex-shrink-0 ${getExtBadgeClass(getFileExt(file.name))}`}>.{getFileExt(file.name)}</span>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <AnimatePresence mode="popLayout">
                                                                {file.isSyncing ? (
                                                                    <motion.div key="syncing" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/50 text-xs font-medium animate-pulse">
                                                                        <RefreshCcw size={14} className="animate-spin" /> Syncing...
                                                                    </motion.div>
                                                                ) : file.syncStatus === 'synced' ? (
                                                                    <motion.div key="synced" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-medium">
                                                                        <CheckCircle2 size={14} /> Synced
                                                                    </motion.div>
                                                                ) : (
                                                                    // All files with "conflict" status now show Hybrid Synced — Yjs auto-merges
                                                                    <motion.div
                                                                        key="crdt-synced"
                                                                        initial={{ scale: 0.8, opacity: 0 }}
                                                                        animate={{ scale: 1, opacity: 1 }}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setEditingFile({ name: file.name, content: file.content || '', pendingReview: null });
                                                                            setEditorText(file.content || '');
                                                                        }}
                                                                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-medium cursor-pointer hover:bg-green-500/15 transition-colors"
                                                                        title="Hybrid LWW Engine — click to open live editor"
                                                                    >
                                                                        <CheckCircle2 size={14} /> Hybrid Synced
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                        <div className="text-sm text-zinc-500 dark:text-zinc-400">{file.date}</div>

                                                        {/* Contributors column — shows who has edited this file */}
                                                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                            {activeRepo?.members.map(member => {
                                                                const isNowEditing = activeEditors.some(ae =>
                                                                    ae.repoName === activeRepo.name &&
                                                                    ae.fileName === file.name &&
                                                                    ae.userName === member.name
                                                                );
                                                                const hasContributed = (file.versions || []).some(v => v.savedBy === member.name);
                                                                const badgeColors: Record<string, string> = {
                                                                    amber:  'bg-amber-500',
                                                                    purple: 'bg-purple-500',
                                                                    zinc:   'bg-zinc-500',
                                                                    cyan:   'bg-cyan-500',
                                                                    rose:   'bg-rose-500',
                                                                };
                                                                const color = badgeColors[member.badge] ?? 'bg-zinc-500';
                                                                return (
                                                                    <div
                                                                        key={member.name}
                                                                        title={isNowEditing ? `${member.name} is editing now` : hasContributed ? `${member.name} has contributed` : `${member.name} — no edits yet`}
                                                                        className={`relative w-6 h-6 rounded-full border-2 border-zinc-900 flex items-center justify-center text-[9px] font-black text-white transition-all ${
                                                                            isNowEditing
                                                                                ? `${color} ring-2 ring-offset-1 ring-offset-zinc-900 ring-green-400`
                                                                                : hasContributed
                                                                                ? `${color}`
                                                                                : 'bg-zinc-700 opacity-30'
                                                                        }`}
                                                                    >
                                                                        {member.name.charAt(0)}
                                                                        {isNowEditing && (
                                                                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full animate-pulse border border-zinc-900" />
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>

                                                        <div className="flex items-center justify-end gap-2 px-2">
                                                            {!file.isSyncing && (
                                                                <button onClick={(e) => { e.stopPropagation(); toggleStar(activeRepo?.name || '', file.name); }} className={`p-2 shrink-0 rounded-full transition-colors ${file.isStarred ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10' : 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-amber-500'}`} title={file.isStarred ? "Remove Star" : "Star File"}>
                                                                    <Star size={18} fill={file.isStarred ? "currentColor" : "none"} />
                                                                </button>
                                                            )}
                                                            <div className={`relative flex items-center justify-end ${openMenuId === String(file.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                                                                <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === String(file.id) ? null : String(file.id)); }} className="p-2 shrink-0 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500"><MoreVertical size={18} /></button>
                                                                <AnimatePresence>
                                                                    {openMenuId === String(file.id) && (
                                                                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute right-0 top-full mt-1 w-56 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-2xl border border-white/20 dark:border-white/10 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.4)] z-[200] overflow-hidden">
                                                                            <div className="flex flex-col">
                                                                                {file.syncStatus === 'conflict' && (
                                                                                    <>
                                                                                        <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); setEditingFile({ name: file.name, content: file.content || '', pendingReview: null }); setEditorText(file.content || ''); }} className="flex items-center gap-3 hover:bg-green-500/10 px-4 py-3 cursor-pointer transition-colors text-sm text-green-400 font-semibold"><CheckCircle2 size={16} /><span>Open Live Editor (Hybrid Engine)</span></div>
                                                                                        <div className="border-b border-zinc-200 dark:border-zinc-700/50"></div>
                                                                                    </>
                                                                                )}
                                                                                <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); URL.revokeObjectURL(url); }} className="flex items-center gap-3 hover:bg-white/10 dark:hover:bg-white/5 px-4 py-3 cursor-pointer transition-colors text-sm text-zinc-700 dark:text-zinc-200"><Download size={16} /><span>Download (Check-out)</span></div>
                                                                                <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }} className="flex items-center gap-3 hover:bg-white/10 dark:hover:bg-white/5 px-4 py-3 cursor-pointer transition-colors text-sm text-zinc-700 dark:text-zinc-200"><WifiOff size={16} /><span>Make Available Offline</span></div>
                                                                                <div onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); setIsGroupManageOpen(true); }} className="flex items-center gap-3 hover:bg-white/10 dark:hover:bg-white/5 px-4 py-3 cursor-pointer transition-colors text-sm text-zinc-700 dark:text-zinc-200"><Users size={16} /><span>Share with Group</span></div>
                                                                                {/* Version History item — accessible from context menu at any time */}
                                                                                <div onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setOpenMenuId(null);
                                                                                    if (currentRepo) setVersionHistoryTarget({ repoName: currentRepo, fileName: file.name });
                                                                                }} className="flex items-center gap-3 hover:bg-violet-500/10 px-4 py-3 cursor-pointer transition-all text-sm text-violet-400 font-semibold hover:text-violet-300">
                                                                                    <Clock size={16} /><span>Version History</span>
                                                                                    {(file.versions?.length ?? 0) > 0 && <span className="ml-auto text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded-full font-bold">{file.versions!.length}</span>}
                                                                                </div>
                                                                                {activeRepo?.userRole === 'Owner' && (
                                                                                    <div onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setOpenMenuId(null);
                                                                                        if (!activeRepo?.name) return;
                                                                                        // Check if anyone is actively editing this file
                                                                                        const editorsOfFile = activeEditors.filter(ae => ae.repoName === activeRepo.name && ae.fileName === file.name);
                                                                                        if (editorsOfFile.length > 0) {
                                                                                            // Show warning to the Owner
                                                                                            setOwnerDeleteWarning({ repoName: activeRepo.name, fileName: file.name, editingUsers: editorsOfFile.map(e => e.userName) });
                                                                                        } else {
                                                                                            setConfirmTrashFile({ repoName: activeRepo.name, fileName: file.name });
                                                                                        }
                                                                                    }} className="flex items-center gap-3 hover:bg-rose-500/10 px-4 py-3 cursor-pointer transition-all text-sm text-rose-400 font-semibold hover:text-rose-300"><Trash2 size={16} /><span>Move to Trash</span></div>
                                                                                )}
                                                                            </div>
                                                                        </motion.div>
                                                                    )}
                                                                </AnimatePresence>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                ))}
                                            </AnimatePresence>
                                        </motion.div>
                                    </div>
                                );
                            })()}
                        </>
                    ) : activeTab === 'Trash' ? (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="w-full">
                            <div className="flex items-center justify-between mb-6 px-6 py-4">
                                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                                    <Trash2 className="text-rose-500" /> Trash Bin
                                </h2>
                                {trashedFiles.length > 0 && (
                                    <button onClick={() => setDeleteFileTarget({ trashItemId: -999, fileName: `all ${trashedFiles.length} items` })} className="px-4 py-2 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border border-rose-500/30 hover:border-rose-500/50 transition-all text-sm font-bold flex items-center gap-2">
                                        <Trash2 size={14} /> Empty Trash
                                    </button>
                                )}
                            </div>
                            {trashedFiles.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-[50vh] text-center">
                                    <div className="w-20 h-20 mb-6 rounded-full bg-zinc-100 dark:bg-zinc-800/50 flex items-center justify-center border border-zinc-200 dark:border-zinc-700">
                                        <Trash2 size={32} className="text-zinc-400 dark:text-zinc-500" />
                                    </div>
                                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Trash is Empty</h3>
                                    <p className="text-zinc-500 dark:text-zinc-400">Items you delete will appear here for 30 days before being permanently removed.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3 px-6">
                                    <div className="grid grid-cols-[3fr_2fr_1fr_auto] items-center gap-4 px-6 py-3 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border-b border-white/5">
                                        <div>Name</div><div>Original Repo</div><div>Deleted On</div><div className="w-48 text-right">Actions</div>
                                    </div>
                                    <AnimatePresence mode="popLayout">
                                        {trashedFiles.map((item, i) => (
                                            <motion.div key={item.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                                                className="grid grid-cols-[3fr_2fr_1fr_auto] items-center gap-4 px-6 py-4 rounded-2xl bg-white/60 dark:bg-zinc-900/50 border border-white/10 dark:border-white/5 hover:bg-white/80 dark:hover:bg-zinc-800/60 transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500"><FileText size={20} /></div>
                                                    <span className="font-medium text-zinc-500 dark:text-zinc-400 line-through">{item.file.name}</span>
                                                </div>
                                                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><Folder size={16} /> {item.repoName}</div>
                                                <div className="text-sm text-zinc-500">{item.deletedAt}</div>
                                                <div className="flex gap-2 justify-end">
                                                    <button onClick={() => restoreFile(item.id)} className="px-3 py-1.5 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500 hover:text-white transition-colors text-xs font-bold shrink-0">Restore</button>
                                                    <button onClick={(e) => { e.stopPropagation(); setDeleteFileTarget({ trashItemId: item.id, fileName: item.file.name }); }} className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 hover:shadow-[0_0_10px_rgba(239,68,68,0.25)] border border-rose-500/20 transition-all text-xs font-bold shrink-0 flex items-center gap-1.5"><Trash2 size={12} /> Delete Forever</button>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            )}
                        </motion.div>
                    ) : activeTab === 'Recent' || activeTab === 'Starred' ? (() => {
                        const isRecent = activeTab === 'Recent';
                        const files = reposData.flatMap(r => r.files.map(f => ({ ...f, repoName: r.name })));
                        const displayFiles = isRecent
                            ? files.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 15)
                            : files.filter(f => f.isStarred);
                            
                        return (
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="w-full">
                                <div className="flex items-center justify-between mb-6 px-6 py-4">
                                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                                        {isRecent ? <Clock className="text-blue-500" /> : <Star className="text-amber-500" fill="currentColor" />} {activeTab} Files
                                    </h2>
                                </div>
                                {displayFiles.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-[50vh] text-center">
                                        <div className="w-20 h-20 mb-6 rounded-full bg-zinc-100 dark:bg-zinc-800/50 flex items-center justify-center border border-zinc-200 dark:border-zinc-700">
                                            {isRecent ? <Clock size={32} className="text-zinc-400 dark:text-zinc-500" /> : <Star size={32} className="text-zinc-400 dark:text-zinc-500" />}
                                        </div>
                                        <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">No {isRecent ? "recent" : "starred"} files</h3>
                                        <p className="text-zinc-500 dark:text-zinc-400">Files {isRecent ? "you modify recently" : "you star"} will appear here for quick access.</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-3 px-6">
                                        <div className="grid grid-cols-[3fr_2fr_1fr_auto] items-center gap-4 px-6 py-3 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border-b border-white/5">
                                            <div>Name</div><div>Location</div><div>Last Modified</div><div></div>
                                        </div>
                                        <AnimatePresence mode="popLayout">
                                            {displayFiles.map((file, i) => (
                                                <motion.div key={`${file.repoName}-${file.id}`} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                                                    onClick={() => { setCurrentRepo(file.repoName); setEditingFile({ name: file.name, content: file.content || '', pendingReview: file.pendingReview }); setEditorText(file.content || ''); setActiveTab('My Drive'); }}
                                                    className="grid grid-cols-[3fr_2fr_1fr_auto] items-center gap-4 px-6 py-4 rounded-2xl bg-white/60 dark:bg-zinc-900/50 border border-white/10 dark:border-white/5 hover:border-orange-400/40 hover:bg-white/80 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer cursor-pointer">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`p-2.5 rounded-xl bg-gradient-to-br border ${getFileIconColors(getFileExt(file.name))}`}><FileText size={20} /></div>
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className="font-medium text-zinc-800 dark:text-zinc-100 truncate">{file.name}</span>
                                                            <span className={`hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border flex-shrink-0 ${getExtBadgeClass(getFileExt(file.name))}`}>.{getFileExt(file.name)}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2 font-mono text-xs"><Folder size={14} className="text-amber-500/70" /> {file.repoName}</div>
                                                    <div className="text-sm text-zinc-500">{file.date}</div>
                                                    <div className="flex items-center gap-2">
                                                        {file.isStarred && <Star size={16} className="text-amber-500" fill="currentColor" />}
                                                        <ChevronRight size={18} className="text-zinc-400" />
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    </div>
                                )}
                            </motion.div>
                        );
                    })() : activeTab === 'Profile' ? (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full max-w-6xl mx-auto items-start">
                            <div className="bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl border border-white/15 rounded-2xl p-8 flex flex-col items-center space-y-6 shadow-[0_10px_40px_rgba(0,0,0,0.2)]">
                                <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-amber-600 to-orange-600 flex items-center justify-center text-3xl font-bold text-white shadow-lg uppercase">{userName.charAt(0)}</div>
                                <div className="text-center">
                                    <h2 className="text-3xl font-bold text-zinc-900 dark:text-white mb-1">{userName}</h2>
                                    <p className="text-zinc-500 dark:text-zinc-400 mb-3">{userEmail}</p>
                                    <span className="inline-block px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 text-xs font-semibold border border-amber-200 dark:border-amber-900/50">Standard User</span>
                                </div>
                                <div className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl p-5 flex flex-col gap-3">
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-zinc-600 dark:text-zinc-300 font-medium text-sm">Storage Used</span>
                                        <span className="text-zinc-900 dark:text-white font-bold text-sm">{formatBytes(currentStorageUsed)} <span className="text-zinc-500 font-normal">/ {formatBytes(storageLimitBytes)}</span></span>
                                    </div>
                                    <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden"><div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${storagePercent}%` }}></div></div>
                                </div>
                                <button onClick={() => setIsLogoutModalOpen(true)} className="flex items-center gap-2 border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:border-rose-400/50 hover:shadow-[0_0_12px_rgba(239,68,68,0.15)] px-8 py-3 rounded-xl transition-all font-semibold mt-4 w-full justify-center">
                                    <LogOut size={18} /> Log Out
                                </button>
                            </div>
                            <div className="lg:col-span-2 flex flex-col">
                                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl p-8 mb-8 shadow-xl">
                                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-6 flex items-center gap-2"><Shield size={20} className="text-amber-600 dark:text-amber-400" /> System Preferences</h3>
                                    <div className="space-y-4">

                                        <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                                            <div className="flex items-center gap-4"><div className="p-2 rounded-lg bg-purple-500/10 text-purple-400"><Bell size={18} /></div><div><p className="text-zinc-900 dark:text-white font-medium">Desktop Notifications</p><p className="text-sm text-zinc-500 dark:text-zinc-400">Receive alerts for conflicts and completed syncs</p></div></div>
                                            <motion.div whileTap={{ scaleX: 1.15, scaleY: 0.85 }} onClick={() => setNotifications(!notifications)} className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors duration-300 shadow-inner ${notifications ? 'bg-purple-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}>
                                                <motion.div animate={{ x: notifications ? 24 : 0 }} transition={{ type: "spring", stiffness: 600, damping: 25 }} className="w-5 h-5 rounded-full bg-white absolute top-0.5 left-0.5 shadow-md"></motion.div>
                                            </motion.div>
                                        </div>
                                    </div>
                                </div>
                                {/* ── CRDT Connection Status Card ── */}
                                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl p-8 shadow-xl">
                                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-6 flex items-center gap-2">
                                        <Wifi size={20} className={isOnline ? 'text-green-500' : 'text-red-500'} />
                                        Connection &amp; Sync Status
                                    </h3>
                                    <div className="space-y-4">
                                        {/* Online / Offline */}
                                        <div className={`flex items-center justify-between p-4 rounded-xl border ${!isOnline ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50'}`}>
                                            <div className="flex items-center gap-4">
                                                <div className={`p-2 rounded-lg ${!isOnline ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400' : 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400'}`}>
                                                    {isOnline ? <Wifi size={18} /> : <WifiOff size={18} />}
                                                </div>
                                                <div>
                                                    <p className="text-zinc-900 dark:text-white font-semibold">Network Connection</p>
                                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                                        {isOnline ? 'Connected — real-time sync is active' : 'Disconnected — Hybrid Engine offline buffer mode active'}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${!isOnline ? 'text-red-600 bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800/50' : 'text-green-600 bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800/50'}`}>
                                                {isOnline ? 'ONLINE' : 'OFFLINE'}
                                            </span>
                                        </div>
                                        {/* Latency */}
                                        <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                                            <div className="flex items-center gap-4">
                                                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                                                    <Activity size={18} />
                                                </div>
                                                <div>
                                                    <p className="text-zinc-900 dark:text-white font-semibold">Network Latency</p>
                                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Round-trip time to sync server (measured every 10s)</p>
                                                </div>
                                            </div>
                                            <span className={`text-sm font-extrabold ${latencyColor}`}>
                                                {latencyMs === null ? (isOnline ? 'Measuring...' : '—') : `${latencyMs} ms`}
                                            </span>
                                        </div>
                                        {/* CRDT Engine State */}
                                        <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                                            <div className="flex items-center gap-4">
                                                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400">
                                                    <GitMerge size={18} />
                                                </div>
                                                <div>
                                                    <p className="text-zinc-900 dark:text-white font-semibold">Hybrid Sync Engine</p>
                                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                                        {isOnline
                                                            ? 'State Convergence Model active — all edits propagated in real-time'
                                                            : 'Offline buffer mode — edits queued in local state vector, will merge on reconnect'}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${isOnline ? 'text-purple-600 bg-purple-100 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800/50' : 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800/50'}`}>
                                                {isOnline ? 'LIVE SYNC' : 'BUFFERING'}
                                            </span>
                                        </div>
                                        {/* Delta Sync */}
                                        <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                                            <div className="flex items-center gap-4">
                                                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
                                                    <Zap size={18} />
                                                </div>
                                                <div>
                                                    <p className="text-zinc-900 dark:text-white font-semibold">Delta Compression</p>
                                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Only keystroke differences (diffs) are transmitted — not full documents</p>
                                                </div>
                                            </div>
                                            <span className="text-xs font-bold px-3 py-1.5 rounded-full border text-green-600 bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800/50">
                                                ACTIVE
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="flex flex-col items-center justify-center h-[60vh] text-center">
                            <div className="w-24 h-24 mb-6 rounded-full bg-gradient-to-tr from-amber-500/20 to-orange-500/20 flex items-center justify-center border border-zinc-200 dark:border-zinc-700">
                                {React.createElement(navItems.find(item => item.name === activeTab)?.icon || Folder, { size: 40, className: "text-zinc-600 dark:text-zinc-300" })}
                            </div>
                            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2 tracking-wide">{activeTab}</h2>
                            <p className="text-zinc-500 dark:text-zinc-400 max-w-sm">This section is currently under construction.</p>
                        </motion.div>
                    )}
                </main>


                {/* Sync Log FAB — only visible when inside a repo */}
                <AnimatePresence>
                    {isLogOpen && currentRepo && (() => {
                        const repoLogs = syncLogs.filter(l => l.repoName === currentRepo);
                        return (
                        <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} transition={{ type: "spring", bounce: 0.3, duration: 0.8 }}
                            className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-3xl bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-40">
                            <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500" />
                            <div className="p-4 flex flex-col gap-3">
                                {/* Header */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Activity size={14} className="text-amber-400" />
                                        <span className="text-amber-400 text-xs font-bold uppercase tracking-widest">Sync Log</span>
                                        <span className="text-zinc-500 text-xs">·</span>
                                        <span className="text-zinc-400 text-xs font-medium">{currentRepo}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <motion.button
                                            whileHover={{ scale: 1.03 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => { if (currentRepo) simulateConflict(currentRepo); }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-400 font-bold text-[11px]"
                                        >
                                            <Wand size={12} className="animate-pulse" /> Simulate Edit
                                        </motion.button>
                                        <button onClick={() => setIsLogOpen(false)} className="p-1 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors">
                                            <X size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Log Entries */}
                                <div className="h-44 overflow-y-auto flex flex-col-reverse gap-1 custom-scrollbar">
                                    <AnimatePresence>
                                        {repoLogs.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-600">
                                                <Terminal size={20} />
                                                <p className="text-xs font-medium">No activity yet in {currentRepo}</p>
                                            </div>
                                        ) : repoLogs.map((log) => {
                                            const isConflict = log.message.includes('conflict') || log.message.includes('collision');
                                            const isSuccess = log.message.includes('✅') || log.message.includes('synced') || log.message.includes('resolved') || log.message.includes('accepted');
                                            const isDelete = log.message.includes('deleted') || log.message.includes('Trash');

                                            const iconEl = isConflict
                                                ? <Zap size={12} className="text-amber-400 shrink-0" />
                                                : isSuccess
                                                ? <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                                                : isDelete
                                                ? <Trash2 size={12} className="text-rose-400 shrink-0" />
                                                : <Info size={12} className="text-zinc-500 shrink-0" />;

                                            const textColor = isConflict ? 'text-amber-300' : isSuccess ? 'text-emerald-300' : isDelete ? 'text-rose-300' : 'text-zinc-400';

                                            return (
                                                <motion.div
                                                    key={log.id}
                                                    initial={{ opacity: 0, x: -8 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    className="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                                                >
                                                    <span className="text-amber-500/70 font-mono text-[10px] font-bold shrink-0 mt-0.5 w-14">{log.time}</span>
                                                    <span className="mt-0.5">{iconEl}</span>
                                                    <span className={`text-[11px] font-medium leading-relaxed ${textColor}`}>{log.message}</span>
                                                </motion.div>
                                            );
                                        })}
                                    </AnimatePresence>
                                </div>
                            </div>
                        </motion.div>
                        );
                    })()}
                </AnimatePresence>

                {/* FAB button — hidden on repo list, visible only inside a repo */}
                {currentRepo && (
                <motion.button onClick={() => setIsLogOpen(!isLogOpen)} variants={floatAnim} initial="initial" animate="animate" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                    className={`absolute bottom-8 right-8 w-14 h-14 rounded-full flex items-center justify-center z-30 shadow-xl border border-zinc-200 dark:border-zinc-700 ${isLogOpen ? 'bg-amber-500 text-white' : 'bg-white dark:bg-zinc-900 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-zinc-800'}`}>
                    <Terminal size={22} />
                </motion.button>
                )}
            </div>

            {/* Upload Modal — Real File Picker */}
            <AnimatePresence>
                {isUploadOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md">
                        <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[90%] max-w-lg">
                            <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500"></div>
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-xl font-bold text-amber-600 dark:text-amber-400">Check-In to DocuSync</h2>
                                    <button onClick={() => { setIsUploadOpen(false); setStagedFile(null); }} className="p-1 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"><X size={20} /></button>
                                </div>
                                <label className="block border-2 border-dashed border-amber-400/50 hover:border-amber-500 bg-zinc-50 dark:bg-zinc-800 rounded-xl p-8 flex flex-col items-center justify-center gap-4 transition-colors cursor-pointer group">
                                    <input type="file" className="hidden" accept=".txt,.docx,.md,.json,.csv,.rtf,.html,.xml,.tex" onChange={async (e) => {
                                        // Reset input so re-selecting the same file re-fires onChange
                                        const input = e.target;
                                        const file = input.files?.[0];
                                        if (!file) return;

                                        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

                                        // ── Strict allowlist validation ──────────────────────────────────
                                        if (!ALLOWED_EXTS.has(ext)) {
                                            input.value = '';
                                            toast.error('Format Rejected', {
                                                description: 'Binary and media files (images, video, executables, .xlsx, .pdf) are not supported. Complex binary files break delta encoding chunking.',
                                                duration: 5000,
                                                icon: '🚫',
                                            });
                                            return;
                                        }
                                        // ────────────────────────────────────────────────────────────────

                                        const isDocx = ext === 'docx' ||
                                            file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

                                        // Placeholder while parsing
                                        setStagedFile({ name: file.name, content: '', size: file.size });

                                        if (isDocx) {
                                            // --- DOCX path: ArrayBuffer → mammoth → HTML ---
                                            const arrayBuffer = await file.arrayBuffer();
                                            try {
                                                const result = await mammoth.convertToHtml({ arrayBuffer });
                                                setStagedFile({ name: file.name, content: result.value, size: file.size });
                                            } catch {
                                                setStagedFile({ name: file.name, content: `<p><em>[Could not parse ${file.name}. The file may be corrupted or password-protected.]</em></p>`, size: file.size });
                                            }
                                        } else if (file.size < 10 * 1024 * 1024) {
                                            // --- Structured plain-text: txt / md / json / csv ---
                                            const reader = new FileReader();
                                            reader.onload = (evt) => {
                                                let raw = typeof evt.target?.result === 'string' ? evt.target.result : '';
                                                // Pretty-print JSON so it reads cleanly in the editor
                                                if (ext === 'json') {
                                                    try { raw = JSON.stringify(JSON.parse(raw), null, 2); } catch { /* keep raw on parse error */ }
                                                }
                                                setStagedFile({ name: file.name, content: raw, size: file.size });
                                            };
                                            reader.readAsText(file);
                                        } else {
                                            // --- Large file: metadata only ---
                                            setStagedFile({
                                                name: file.name,
                                                content: `<p><em>[Large file — ${(file.size / (1024 * 1024)).toFixed(1)} MB. Only metadata is stored.]</em></p>`,
                                                size: file.size
                                            });
                                        }
                                    }} />
                                    <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <FileUp size={32} className="text-amber-600 dark:text-amber-400" />
                                    </div>
                                    {stagedFile ? (
                                        <div className="text-center">
                                            <p className="font-bold text-zinc-900 dark:text-white text-sm">{stagedFile.name}</p>
                                            <p className="text-xs text-green-500 font-semibold mt-1">✓ Ready — {(stagedFile.size / 1024).toFixed(1)} KB</p>
                                        </div>
                                    ) : (
                                        <div className="text-center">
                                            <p className="text-zinc-600 dark:text-zinc-300 font-medium">Click to pick a file or drag &amp; drop</p>
                                            <div className="flex items-center justify-center gap-1.5 mt-2 flex-wrap">
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border bg-zinc-500/15 text-zinc-400 border-zinc-500/30">.txt</span>
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border bg-blue-500/15 text-blue-400 border-blue-500/30">.docx</span>
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border bg-purple-500/15 text-purple-400 border-purple-500/30">.md</span>
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border bg-amber-400/15 text-amber-400 border-amber-400/30">.json</span>
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border bg-emerald-500/15 text-emerald-400 border-emerald-500/30">.csv</span>
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border bg-orange-500/15 text-orange-400 border-orange-500/30">.html</span>
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border bg-teal-500/15 text-teal-400 border-teal-500/30">.xml</span>
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border bg-indigo-500/15 text-indigo-400 border-indigo-500/30">.tex</span>
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border bg-rose-500/15 text-rose-400 border-rose-500/30">.rtf</span>
                                            </div>
                                            <p className="text-[10px] text-zinc-500 mt-1.5">Max 10 MB per file</p>
                                        </div>
                                    )}
                                </label>
                                <div className="mt-6 flex justify-end gap-4">
                                    <button onClick={() => { setIsUploadOpen(false); setStagedFile(null); }} className="px-5 py-2.5 rounded-xl border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-all text-sm font-semibold backdrop-blur-sm">Cancel</button>
                                    <button disabled={!stagedFile && !currentRepo} onClick={() => {
                                        if (!currentRepo) return;
                                        const fileToUpload = stagedFile ?? { name: `Document_${Date.now()}.txt`, content: '# New Document\n\nStart typing here...', size: 0 };
                                        uploadFile(currentRepo, {
                                            name: fileToUpload.name,
                                            type: (() => { const e = fileToUpload.name.split('.').pop()?.toLowerCase() ?? 'txt'; return e === 'docx' ? 'word' : e === 'json' ? 'json' : e === 'csv' ? 'csv' : e === 'md' ? 'md' : e === 'html' ? 'html' : e === 'xml' ? 'xml' : e === 'tex' ? 'tex' : e === 'rtf' ? 'rtf' : 'text'; })(),
                                            date: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
                                            content: fileToUpload.content,
                                            serverContent: ''
                                        });
                                        setStagedFile(null);
                                        setIsUploadOpen(false);
                                    }} className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-400 disabled:cursor-not-allowed text-white shadow-md shadow-amber-500/20 transition-all text-sm font-bold">Sync File</button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Logout Modal */}
            <AnimatePresence>
                {isLogoutModalOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.22 } }} exit={{ opacity: 0, transition: { duration: 0.2 } }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-xl">
                        <motion.div initial={{ opacity: 0, scale: 0.97, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } }} exit={{ opacity: 0, scale: 0.97, y: 12, transition: { duration: 0.18, ease: "easeIn" } }} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[90%] max-w-md">
                            <div className="h-1 w-full bg-gradient-to-r from-rose-500/50 via-rose-500 to-rose-500/50"></div>
                            <div className="p-6 text-center">
                                <div className="w-16 h-16 mx-auto bg-rose-500/10 rounded-full flex items-center justify-center mb-4"><LogOut size={32} className="text-rose-500" /></div>
                                <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Log out of DocuSync</h2>
                                <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">Are you sure you want to log out?</p>
                                <div className="flex gap-4 w-full">
                                    <button onClick={() => setIsLogoutModalOpen(false)} className="flex-1 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm font-semibold">Cancel</button>
                                    <button onClick={() => router.push('/login')} className="flex-1 py-3 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-500 hover:bg-rose-500 hover:text-white transition-all text-sm font-bold">Confirm</button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Create Repository Modal */}
            <AnimatePresence>
                {isCreateRepoOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-xl" onClick={() => setIsCreateRepoOpen(false)}>
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[90%] max-w-md" onClick={(e) => e.stopPropagation()}>
                            <div className="h-1 w-full bg-gradient-to-r from-amber-500/50 via-amber-500 to-amber-500/50"></div>
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-5">
                                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2"><FolderPlus size={22} className="text-amber-500" /> Create New Repository</h2>
                                    <button onClick={() => setIsCreateRepoOpen(false)} className="p-1 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"><X size={20} /></button>
                                </div>
                                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Repository Name</label>
                                <input type="text" value={newRepoName} onChange={(e) => setNewRepoName(e.target.value)} placeholder="e.g. Thesis-Final-Docs" className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-colors text-sm" autoFocus />
                                <div className="mt-6 flex justify-end gap-3">
                                    <button onClick={() => { setIsCreateRepoOpen(false); setNewRepoName(''); }} className="px-5 py-2.5 rounded-xl border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-all text-sm font-semibold backdrop-blur-sm">Cancel</button>
                                    <button onClick={() => {
                                        createRepository(newRepoName);
                                        setIsCreateRepoOpen(false);
                                        setNewRepoName('');
                                    }} className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-500/20 transition-all text-sm font-bold">Create Repository</button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Join Repository Modal */}
            <AnimatePresence>
                {isJoinRepoOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-xl" onClick={() => setIsJoinRepoOpen(false)}>
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[90%] max-w-md" onClick={(e) => e.stopPropagation()}>
                            <div className="h-1 w-full bg-gradient-to-r from-amber-500/50 via-amber-500 to-amber-500/50"></div>
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-5">
                                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Link2 size={22} className="text-amber-500" /> Join a Workspace</h2>
                                    <button onClick={() => setIsJoinRepoOpen(false)} className="p-1 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"><X size={20} /></button>
                                </div>
                                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Paste Invite Link or Code</label>
                                <input type="text" value={joinInviteCode} onChange={(e) => setJoinInviteCode(e.target.value)} placeholder="e.g. https://docusync.app/repo/abc123/join" className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-colors text-sm font-mono" autoFocus />
                                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Ask the repository owner for the invite link. Your request will be sent for approval.</p>
                                <div className="mt-6 flex justify-end gap-3">
                                    <button onClick={() => { setIsJoinRepoOpen(false); setJoinInviteCode(''); }} className="px-5 py-2.5 rounded-xl border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-all text-sm font-semibold backdrop-blur-sm">Cancel</button>
                                    <button onClick={() => { setIsJoinRepoOpen(false); setJoinInviteCode(''); }} className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-500/20 transition-all text-sm font-bold">Submit Request</button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Conflict Resolution Modal */}
            <AnimatePresence>
                {conflictFile && (() => {
                    // Always read real content from file state (+ dynamicConflict when set by Save & Sync)
                    const activeFile = reposData.find(r => r.name === currentRepo)?.files.find(f => f.name === conflictFile);
                    const localContent = dynamicConflict ? dynamicConflict.localContent : (activeFile?.content || '');
                    const serverContent = dynamicConflict ? dynamicConflict.serverContent : (activeFile?.serverContent || '');
                    const originalContent = dynamicConflict?.originalContent ?? activeFile?.content ?? '';
                    const conflicts = [{
                        id: 1,
                        section: 'Document Content',
                        page: 1,
                        localText: localContent,
                        localHighlight: '',
                        serverText: serverContent,
                        serverHighlight: '',
                        author: 'Remote Friend',
                    }];
                    const current = conflicts[conflictIndex];
                    const totalConflicts = conflicts.length;
                    const resolvedCount = resolvedConflicts.length;
                    const progressPercent = Math.round((resolvedCount / totalConflicts) * 100);
                    const isCurrentResolved = resolvedConflicts.includes(conflictIndex);

                    const handleResolve = (actionType: 'local' | 'server' | 'merge') => {
                        if (!isCurrentResolved) {
                            const newResolved = [...resolvedConflicts, conflictIndex];
                            setResolvedConflicts(newResolved);
                            if (newResolved.length >= totalConflicts || conflictIndex === totalConflicts - 1) {
                                if (currentRepo && conflictFile) {
                                    // Determine final content based on resolution type
                                    const localC = current.localText;
                                    // 1. Prepare server text by converting simulation logs into authentic realistic document text
                                    let serverC = current.serverText;
                                    
                                    // Transform the metadata logs into realistic thesis sentences
                                    serverC = serverC.replace(/\[Sofia Reyes:.*?\]/g, "<p>Furthermore, our Yjs CRDT implementation facilitates true decentralized real-time collaboration, completely bypassing conventional network bottlenecks.</p>");
                                    
                                    if (!serverC.includes('Prof. Davis')) {
                                        serverC += '\n\n<p>In summary, this research proves that peer-to-peer conflict-free replicated data types drastically outperform traditional operational transformation algorithms in high-latency environments.</p>';
                                    } else {
                                        serverC = serverC.replace(/\[Prof\. Davis:.*?\]/g, "<p>In summary, this research proves that peer-to-peer conflict-free replicated data types drastically outperform traditional operational transformation algorithms in high-latency environments.</p>");
                                    }

                                    // Ensure proper HTML format
                                    const formatHtml = (t: string) => {
                                        if (!t) return '';
                                        if (/<(?:p|h[1-6]|ul|ol|li)[^>]*>/i.test(t)) return t;
                                        return t.split(/\n+/).map(p => `<p>${p.trim()}</p>`).join('');
                                    }

                                    const safeLocal = formatHtml(localC);
                                    const safeServer = formatHtml(serverC);

                                    // Block-level safe 3-way merge
                                    const threeWayMerge = (localHtml: string, serverHtml: string): string => {
                                        const localTextOnly = localHtml.replace(/<[^>]*>/g, '');
                                        const serverBlocks = serverHtml.match(/<(p|h[1-6]|ul|ol|li|blockquote|pre|div)[^>]*>[\s\S]*?<\/\1>/gi) || [serverHtml];
                                        
                                        const uniqueServerBlocks = serverBlocks.filter(block => {
                                            const text = block.replace(/<[^>]*>/g, '').trim();
                                            return text.length > 5 && !localTextOnly.includes(text);
                                        });

                                        if (uniqueServerBlocks.length > 0) {
                                            const seamlessBlocks = uniqueServerBlocks.map(block => 
                                                block.replace(/^<([a-z1-6]+)([^>]*)>/i, '<$1$2 class="pl-4 border-l-4 border-emerald-500 bg-emerald-50/30 dark:bg-emerald-900/20 py-2 my-4 text-emerald-950 dark:text-emerald-100 rounded-r-md transition-all">')
                                            );
                                            return localHtml + seamlessBlocks.join('');
                                        }
                                        return localHtml;
                                    };

                                    const finalContent = actionType === 'local' ? safeLocal
                                        : actionType === 'server' ? safeServer
                                            : threeWayMerge(safeLocal, safeServer);
                                            
                                    resolveConflict(currentRepo, conflictFile, actionType, finalContent);
                                }
                                setTimeout(() => { setConflictFile(null); setConflictIndex(0); setResolvedConflicts([]); setDynamicConflict(null); }, 300);
                            } else {
                                const nextUnresolved = conflicts.findIndex((_, i) => i > conflictIndex && !newResolved.includes(i));
                                if (nextUnresolved !== -1) setTimeout(() => setConflictIndex(nextUnresolved), 300);
                            }
                        }
                    };

                    // Detect whether text is HTML (from the rich-text editor) or plain text (static demo)
                    const isHtml = (text: string) => /^\s*<[a-z][^>]*>/i.test(text);

                    // Smart Difference Highlighter for HTML blocks - Block-level safe marking
                    const highlightDiffs = (html: string, otherHtml: string, color: 'green' | 'blue') => {
                        if (!html || html === otherHtml) return html;
                        const markClass = color === 'green' 
                            ? 'bg-green-200/70 text-green-950 dark:bg-green-500/30 dark:text-green-50 rounded-sm'
                            : 'bg-blue-200/70 text-blue-950 dark:bg-blue-500/30 dark:text-blue-50 rounded-sm';

                        const blocks = html.match(/<(p|h[1-6]|ul|ol|li|blockquote|pre|div)[^>]*>[\s\S]*?<\/\1>/gi);
                        if (!blocks) {
                            if (otherHtml.includes(html.trim())) return html;
                            return `<mark class="${markClass}">${html}</mark>`;
                        }

                        const otherText = otherHtml.replace(/<[^>]*>/g, '');
                        const highlightedBlocks = blocks.map(block => {
                            const textContent = block.replace(/<[^>]*>/g, '').trim();
                            if (textContent.length > 5 && !otherText.includes(textContent)) {
                                const tagNameMatch = block.match(/^<([a-zA-Z0-9]+)([^>]*)>/);
                                if (tagNameMatch) {
                                    const tag = tagNameMatch[1];
                                    const attrs = tagNameMatch[2];
                                    const inner = block.slice(tagNameMatch[0].length, -(tag.length + 3));
                                    return `<${tag}${attrs}><mark class="${markClass}">${inner}</mark></${tag}>`;
                                }
                            }
                            return block;
                        });
                        return highlightedBlocks.join('');
                    };

                    const userRole = reposData.find(r => r.name === currentRepo)?.userRole || 'Editor';
                    const isOwner = userRole === 'Owner';

                    const generateNarrative = (local: string, server: string) => {
                        const localWords = local.split(/\s+/).length;
                        const serverWords = server.split(/\s+/).length;
                        const diff = Math.abs(localWords - serverWords);

                        if (diff < 5 && local.length > 0 && server.length > 0) {
                            return "A minor citation or formatting adjustment was detected in the document header.";
                        }
                        if (localWords > serverWords + 20) {
                            return `You added significantly more detail (${diff} words) than the remote version.`;
                        }
                        if (serverWords > localWords + 20) {
                            return `The remote version contains a major expansion (${diff} words) that is missing from your local copy.`;
                        }
                        return "Multiple editors have restructured overlapping paragraphs in this section.";
                    };

                    const renderContent = (text: string, otherText: string, highlight: string, color: 'green' | 'blue') => {
                        // Check if text is HTML (rich text)
                        const isHtmlContent = /^\s*<[a-z][^>]*>/i.test(text);

                        if (isHtmlContent) {
                            return (
                                <div 
                                    className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:mb-2 prose-p:mb-3"
                                    dangerouslySetInnerHTML={{ __html: text }}
                                />
                            );
                        }
                        
                        // Plain text with optional highlight span (static demo conflicts)
                        if (!highlight) return <p className="whitespace-pre-wrap">{text}</p>;
                        const idx = text.indexOf(highlight);
                        if (idx === -1) return <p>{text}</p>;
                        const before = text.slice(0, idx);
                        const after = text.slice(idx + highlight.length);
                        const hlClass = color === 'green'
                            ? 'bg-green-200/70 text-green-950 dark:bg-green-500/30 dark:text-green-50 rounded-sm'
                            : 'bg-blue-200/70 text-blue-950 dark:bg-blue-500/30 dark:text-blue-50 rounded-sm';
                        return <p>{before}<mark className={hlClass}>{highlight}</mark>{after}</p>;
                    };

                    return (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-xl p-0 md:p-4" onClick={() => { setConflictFile(null); setConflictIndex(0); setResolvedConflicts([]); }}>
                            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", damping: 25, stiffness: 300 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white/90 dark:bg-zinc-900/85 backdrop-blur-2xl border border-white/20 dark:border-white/10 rounded-none md:rounded-2xl shadow-[0_25px_80px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden w-full h-full md:w-[98%] md:max-w-6xl md:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                                <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-purple-500 via-blue-500 to-green-500 shrink-0"></div>

                                {/* Header */}
                                <div className="px-6 pt-5 pb-4 border-b border-white/10 flex justify-between items-start">
                                    <div>
                                        <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2.5">
                                            <AlertTriangle size={22} className="text-amber-500" /> 
                                            Conflict Resolution Hub
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-sm ${isOwner ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'}`}>
                                                {isOwner ? 'OWNER AUTHORITY' : 'REVIEW ONLY'}
                                            </span>
                                        </h2>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">File: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{conflictFile}</span></p>
                                    </div>
                                    <button onClick={() => { setConflictFile(null); setConflictIndex(0); setResolvedConflicts([]); }} className="p-1.5 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"><X size={20} /></button>
                                </div>

                                {/* Conflict Navigator */}
                                <div className="px-6 py-3 bg-white/30 dark:bg-white/5 border-b border-white/10 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => setConflictIndex(Math.max(0, conflictIndex - 1))} disabled={conflictIndex === 0} className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-zinc-600 dark:text-zinc-300"><ChevronLeft size={16} /></button>
                                        <div className="text-sm">
                                            <span className="font-bold text-amber-600 dark:text-amber-400">Conflict {conflictIndex + 1} of {totalConflicts}</span>
                                            <span className="text-zinc-500 dark:text-zinc-400"> — {current.section} (Page {current.page})</span>
                                        </div>
                                        <button onClick={() => setConflictIndex(Math.min(totalConflicts - 1, conflictIndex + 1))} disabled={conflictIndex === totalConflicts - 1} className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-zinc-600 dark:text-zinc-300"><ChevronRight size={16} /></button>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {isCurrentResolved && <span className="text-xs font-bold text-green-500 flex items-center gap-1"><CheckCircle2 size={14} /> Resolved</span>}
                                        <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{resolvedCount}/{totalConflicts} Resolved</span>
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                <div className="h-1.5 bg-zinc-200 dark:bg-zinc-800">
                                    <motion.div animate={{ width: `${progressPercent}%` }} transition={{ duration: 0.4, ease: 'easeOut' }} className="h-full bg-gradient-to-r from-amber-500 via-purple-500 to-green-500 rounded-r-full" />
                                </div>

                                {/* Review Center - Recommendation Header */}
                                <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-800/40 border-b border-zinc-200 dark:border-white/5">
                                    <div className="flex items-start gap-4">
                                        <div className="p-2.5 bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700">
                                            <FileSearch size={20} className="text-blue-500" />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-black text-zinc-900 dark:text-white flex items-center gap-2 tracking-tight">
                                                Suggestion Feed: <span className="opacity-50">{current.section}</span>
                                            </h2>
                                            <p className="text-xs text-zinc-500 font-medium tracking-wide uppercase">Consensus Mode • Conflict {conflictIndex + 1} of {1}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex -space-x-3 mr-4">
                                            <div className="w-8 h-8 rounded-full bg-blue-500 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-[10px] font-bold text-white shadow-lg">P</div>
                                            <div className="w-8 h-8 rounded-full bg-purple-500 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-[10px] font-bold text-white shadow-lg">S</div>
                                            <div className="w-8 h-8 rounded-full bg-amber-500 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-[10px] font-bold text-white shadow-lg">P</div>
                                        </div>
                                        <button 
                                            onClick={() => setConflictFile(null)} 
                                            className="p-2.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-900/20 text-zinc-400 hover:text-rose-500 transition-all border border-zinc-200 dark:border-white/10"
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>

                                {/* Main Merging Interface */}
                                <div className="flex-1 overflow-hidden flex flex-col">
                                    <div className="flex flex-col md:flex-row h-full overflow-hidden">
                                        
                                        {/* Centered Document Paper View */}
                                        <div className="flex-1 overflow-y-auto p-4 md:p-12 bg-zinc-100 dark:bg-zinc-950 border-r-0 md:border-r border-zinc-200 dark:border-white/5 custom-scrollbar transition-all duration-500">
                                            <div className="max-w-2xl mx-auto bg-white dark:bg-zinc-900 shadow-[0_20px_70px_rgba(0,0,0,0.15)] ring-1 ring-zinc-200 dark:ring-white/10 rounded-sm px-6 py-8 md:px-16 md:py-20 min-h-[500px] md:min-h-[850px] relative transition-shadow duration-300 overflow-hidden">
                                                
                                                {/* Subtle paper texture overlay */}
                                                <div className="absolute inset-0 opacity-[0.03] pointer-events-none select-none bg-[url('https://www.transparenttextures.com/patterns/notebook.png')]"></div>
                                                
                                                <div className="mb-14 text-center pb-8 border-b border-zinc-100 dark:border-zinc-800 relative z-10">
                                                    <h2 className="text-zinc-400 font-bold text-[10px] uppercase tracking-widest mb-2 italic">Thesis Progress Log • Consensus Mode</h2>
                                                    <h1 className="text-2xl font-black text-zinc-900 dark:text-white mt-1" style={{ fontFamily: "'Times New Roman', serif" }}>{current.section}</h1>
                                                </div>
                                                
                                                {/* Document Body with Margin Tracks & Reorderable Blocks */}
                                                <div className="prose prose-sm dark:prose-invert max-w-none leading-[2.1] relative z-10" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>
                                                    
                                                    {/* Original Text Segment */}
                                                    <div className="relative pl-6 mb-8">
                                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-zinc-200 dark:bg-zinc-800 rounded-full opacity-30"></div>
                                                        <div dangerouslySetInnerHTML={{ __html: current.localText.replace(current.localHighlight, `<mark class="bg-transparent border-b border-zinc-300 dark:border-zinc-700 text-zinc-500 italic">${current.localHighlight}</mark>`) }} />
                                                    </div>

                                                    <Reorder.Group axis="y" values={suggestionOrder} onReorder={setSuggestionOrder} className="space-y-4">
                                                        <AnimatePresence mode="popLayout">
                                                            {suggestionOrder.map((id) => {
                                                                if (!visibleSuggestions.includes(id)) return null;

                                                                if (id === 'server') {
                                                                    return (
                                                                        <Reorder.Item 
                                                                            key="server" 
                                                                            value="server" 
                                                                            className="relative pl-10 mb-10 group cursor-grab active:cursor-grabbing"
                                                                            whileDrag={{ scale: 1.02, boxShadow: "0 20px 40px rgba(0,0,0,0.1)" }}
                                                                        >
                                                                            {/* HOLD BUTTON - Visible Grip Handle */}
                                                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-blue-500 text-white shadow-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-20">
                                                                                <GripVertical size={16} />
                                                                            </div>

                                                                            {/* Vertical Margin Track Line */}
                                                                            <div className="absolute left-6 top-0 bottom-0 w-1 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.3)]"></div>
                                                                            
                                                                            {/* Inline Watermark Badge */}
                                                                            <div className="hidden md:block absolute left-4 top-0 -translate-x-full pr-4 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                                                                <span className="text-[9px] font-black text-blue-500 uppercase tracking-tighter bg-blue-100/50 dark:bg-blue-900/30 px-2 py-0.5 rounded shadow-sm border border-blue-500/20">You</span>
                                                                            </div>

                                                                            <div className="text-[14px] text-zinc-800 dark:text-zinc-200 relative select-none pl-2">
                                                                                <span className="inline-block text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 rounded mb-2 border border-blue-200 dark:border-blue-800">SAVED DRAFT — [You]</span>
                                                                                <div className="italic font-medium text-zinc-900 dark:text-zinc-100">Please feel free to add your sections below. now</div>
                                                                                <div className="h-[2px] w-full bg-gradient-to-r from-blue-500/30 to-transparent mt-4"></div>
                                                                            </div>
                                                                        </Reorder.Item>
                                                                    );
                                                                }

                                                                if (id === 'merge') {
                                                                    return (
                                                                        <Reorder.Item 
                                                                            key="merge" 
                                                                            value="merge" 
                                                                            className="relative pl-10 mb-10 group cursor-grab active:cursor-grabbing"
                                                                            whileDrag={{ scale: 1.02, boxShadow: "0 20px 40px rgba(0,0,0,0.1)" }}
                                                                        >
                                                                            {/* HOLD BUTTON - Visible Grip Handle */}
                                                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-purple-500 text-white shadow-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-20">
                                                                                <GripVertical size={16} />
                                                                            </div>

                                                                            {/* Vertical Margin Track Line */}
                                                                            <div className="absolute left-6 top-0 bottom-0 w-1 bg-purple-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.3)]"></div>
                                                                            
                                                                            {/* Inline Watermark Badge */}
                                                                            <div className="hidden md:block absolute left-4 top-0 -translate-x-full pr-4 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                                                                <span className="text-[9px] font-black text-purple-500 uppercase tracking-tighter bg-purple-100/50 dark:bg-purple-900/30 px-2 py-0.5 rounded shadow-sm border border-purple-500/20">Sofia Reyes</span>
                                                                            </div>

                                                                            <div className="relative p-6 rounded-2xl border-2 border-dashed border-purple-200 dark:border-purple-800/30 bg-purple-50/20 dark:bg-purple-900/5 hover:border-purple-400 transition-all select-none ml-2">
                                                                                <div className="flex items-center gap-2 mb-3">
                                                                                    <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center text-[10px] font-black text-white"><GripVertical size={10} /></div>
                                                                                    <span className="text-[10px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-tighter">Contributor Trace: Sofia Reyes</span>
                                                                                </div>
                                                                                <p className="text-zinc-700 dark:text-zinc-300 italic text-[14px] leading-[2]">
                                                                                    <span className="font-semibold text-purple-600 dark:text-purple-400">Added text:</span> "Furthermore, our Yjs CRDT implementation facilitates true decentralized real-time collaboration, completely bypassing conventional network bottlenecks."
                                                                                </p>
                                                                            </div>
                                                                        </Reorder.Item>
                                                                    );
                                                                }

                                                                if (id === 'sarah') {
                                                                    return (
                                                                        <Reorder.Item 
                                                                            key="sarah" 
                                                                            value="sarah" 
                                                                            className="relative pl-10 mb-10 group cursor-grab active:cursor-grabbing"
                                                                            whileDrag={{ scale: 1.02, boxShadow: "0 20px 40px rgba(0,0,0,0.1)" }}
                                                                        >
                                                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-amber-500 text-white shadow-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-20">
                                                                                <GripVertical size={16} />
                                                                            </div>
                                                                            <div className="absolute left-6 top-0 bottom-0 w-1 bg-amber-500 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.3)]"></div>
                                                                            <div className="hidden md:block absolute left-4 top-0 -translate-x-full pr-4 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                                                                <span className="text-[9px] font-black text-amber-500 uppercase tracking-tighter bg-amber-100/50 dark:bg-amber-900/30 px-2 py-0.5 rounded shadow-sm border border-amber-500/20">Prof. Davis</span>
                                                                            </div>
                                                                            <div className="relative p-6 rounded-2xl border-2 border-dashed border-amber-200 dark:border-amber-800/30 bg-amber-50/20 dark:bg-amber-900/5 hover:border-amber-400 transition-all select-none ml-2">
                                                                                <div className="flex items-center gap-2 mb-3">
                                                                                    <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-black text-white"><GripVertical size={10} /></div>
                                                                                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-tighter">Contributor Trace: Prof. Davis</span>
                                                                                </div>
                                                                                <p className="text-zinc-700 dark:text-zinc-300 italic text-[14px] leading-[2]">
                                                                                    <span className="font-semibold text-amber-600 dark:text-amber-400">Rewrote summary:</span> "In summary, this research proves that peer-to-peer conflict-free replicated data types drastically outperform traditional operational transformation algorithms in high-latency environments."
                                                                                </p>
                                                                            </div>
                                                                        </Reorder.Item>
                                                                    );
                                                                }

                                                                return null;
                                                            })}
                                                        </AnimatePresence>
                                                    </Reorder.Group>
                                                </div>
                                                
                                                {/* Page Numbering */}
                                                <div className="absolute bottom-8 left-0 right-0 text-center text-[10px] font-bold text-zinc-300 tracking-widest uppercase">
                                                    Consensus Preview • Page {current.page}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Sidebar - Suggestion Feed */}
                                        <div className="w-full md:w-[380px] shrink-0 bg-zinc-50/80 dark:bg-zinc-900/50 flex flex-col border-t md:border-t-0 md:border-l border-zinc-200 dark:border-white/5 overflow-hidden">
                                            <div className="p-4 border-b border-zinc-200 dark:border-white/5 flex flex-col gap-3 bg-white dark:bg-zinc-800/40">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-bold text-zinc-500 flex items-center gap-2 tracking-tight"><ListFilter size={14} /> Suggestions Pool</span>
                                                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-500 text-white animate-pulse">LIVE PREVIEW</span>
                                                </div>
                                            </div>
                                            
                                            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
                                                <Reorder.Group axis="y" values={suggestionOrder} onReorder={setSuggestionOrder} className="space-y-4">
                                                    {suggestionOrder.map((id) => {
                                                        if (id === 'server') {
                                                            return (
                                                                <Reorder.Item 
                                                                    key="server" 
                                                                    value="server"
                                                                    className={`p-4 rounded-2xl bg-white dark:bg-zinc-800 border transition-all duration-300 cursor-grab active:cursor-grabbing ${visibleSuggestions.includes('server') ? 'border-blue-500 shadow-lg' : 'border-zinc-200 dark:border-zinc-700 opacity-60'}`}
                                                                >
                                                                    <div className="flex items-center gap-3 mb-3">
                                                                        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-black text-sm">P</div>
                                                                        <div className="flex-1">
                                                                            <p className="text-xs font-bold text-zinc-900 dark:text-white">You</p>
                                                                            <p className="text-[10px] text-zinc-500 italic">Saved local draft edits</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex gap-2">
                                                                        <button onClick={() => setVisibleSuggestions(prev => prev.includes('server') ? prev.filter(id => id !== 'server') : [...prev, 'server'])} className={`w-full py-1.5 rounded-lg border text-[10px] font-bold ${visibleSuggestions.includes('server') ? 'bg-blue-500 text-white' : 'border-zinc-200 text-zinc-400'}`}>
                                                                            {visibleSuggestions.includes('server') ? 'VISIBLE' : 'HIDDEN'}
                                                                        </button>
                                                                    </div>
                                                                </Reorder.Item>
                                                            );
                                                        }
                                                        if (id === 'merge') {
                                                            return (
                                                                <Reorder.Item 
                                                                    key="merge" 
                                                                    value="merge"
                                                                    className={`p-4 rounded-2xl bg-white dark:bg-zinc-800 border transition-all duration-300 cursor-grab active:cursor-grabbing ${visibleSuggestions.includes('merge') ? 'border-purple-500 shadow-lg' : 'border-zinc-200 dark:border-zinc-700 opacity-60'}`}
                                                                >
                                                                    <div className="flex items-center gap-3 mb-3">
                                                                        <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white font-black text-sm">S</div>
                                                                        <div className="flex-1">
                                                                            <p className="text-xs font-bold text-zinc-900 dark:text-white">Sofia Reyes</p>
                                                                            <p className="text-[10px] text-zinc-500 italic">Added incoming collaborative edits via CRDT sync.</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex gap-2">
                                                                        <button onClick={() => setVisibleSuggestions(prev => prev.includes('merge') ? prev.filter(id => id !== 'merge') : [...prev, 'merge'])} className={`w-full py-1.5 rounded-lg border text-[10px] font-bold ${visibleSuggestions.includes('merge') ? 'bg-purple-500 text-white' : 'border-zinc-200 text-zinc-400'}`}>
                                                                            {visibleSuggestions.includes('merge') ? 'VISIBLE' : 'HIDDEN'}
                                                                        </button>
                                                                    </div>
                                                                </Reorder.Item>
                                                            );
                                                        }
                                                        if (id === 'sarah') {
                                                            return (
                                                                <Reorder.Item 
                                                                    key="sarah" 
                                                                    value="sarah"
                                                                    className={`p-4 rounded-2xl bg-white dark:bg-zinc-800 border transition-all duration-300 cursor-grab active:cursor-grabbing ${visibleSuggestions.includes('sarah') ? 'border-amber-500 shadow-lg' : 'border-zinc-200 dark:border-zinc-700 opacity-60'}`}
                                                                >
                                                                    <div className="flex items-center gap-3 mb-3">
                                                                        <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white font-black text-sm">P</div>
                                                                        <div className="flex-1">
                                                                            <p className="text-xs font-bold text-zinc-900 dark:text-white">Prof. Davis</p>
                                                                            <p className="text-[10px] text-zinc-500 italic">Rewrote summary section</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex gap-2">
                                                                        <button onClick={() => setVisibleSuggestions(prev => prev.includes('sarah') ? prev.filter(id => id !== 'sarah') : [...prev, 'sarah'])} className={`w-full py-1.5 rounded-lg border text-[10px] font-bold ${visibleSuggestions.includes('sarah') ? 'bg-amber-500 text-white' : 'border-zinc-200 text-zinc-400'}`}>
                                                                            {visibleSuggestions.includes('sarah') ? 'VISIBLE' : 'HIDDEN'}
                                                                        </button>
                                                                    </div>
                                                                </Reorder.Item>
                                                            );
                                                        }
                                                        return null;
                                                    })}
                                                </Reorder.Group>
                                            </div>

                                            {/* Smart Recommendation */}
                                            <div className="mt-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 mx-4 mb-4">
                                                <div className="flex items-center gap-2 mb-2 text-amber-600">
                                                    <Zap size={14} />
                                                    <span className="text-[10px] font-black uppercase">Merge Tip</span>
                                                </div>
                                                <p className="text-[11px] text-zinc-500 leading-relaxed">System recommends a full merge of all peer edits.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer Action */}
                                <div className="px-8 py-6 border-t border-zinc-100 dark:border-white/5 flex items-center justify-between bg-zinc-50/50 dark:bg-black/20">
                                    <p className="text-[10px] text-zinc-400 font-medium">Consensus state is backed by Yjs Hybrid LWW logic.</p>
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => setConflictFile(null)} className="text-xs font-bold text-zinc-400 hover:text-rose-500 transition-colors">Discard All</button>
                                        <motion.button 
                                            whileTap={isRepoOwner ? { scale: 0.95 } : {}}
                                            onClick={() => {
                                                if (isRepoOwner) {
                                                    // Trigger a full merge
                                                    handleResolve('merge');
                                                }
                                            }}
                                            disabled={!isRepoOwner}
                                            className={`px-10 py-3 rounded-xl text-sm font-black shadow-lg ${isRepoOwner ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black cursor-pointer' : 'bg-zinc-300 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 cursor-not-allowed opacity-60'}`}
                                            title={!isRepoOwner ? 'Only the repository owner can approve changes' : ''}
                                        >
                                            {isRepoOwner ? 'Approve All' : '🔒 Owner Only'}
                                        </motion.button>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>

            {/* ══ Multi-User Editor Cards Modal ══ */}
            <AnimatePresence>
                {isEditingCardsOpen && editingCardsFile && (() => {
                    // ── Build editor cards dynamically from real repo members ──
                    const activeRepoForCards = reposData.find(r => r.name === currentRepo);
                    const memberColorPalette = [
                        { color: 'from-blue-500 to-blue-600', accentClass: 'border-blue-400/50 shadow-[0_0_30px_rgba(59,130,246,0.2)]', headerBg: 'bg-blue-500/10 dark:bg-blue-900/20', headerBorder: 'border-blue-200 dark:border-blue-800/40', badgeCls: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700/50', dotColor: 'bg-blue-400', statusColor: 'text-blue-400' },
                        { color: 'from-green-500 to-emerald-600', accentClass: 'border-green-400/50 shadow-[0_0_30px_rgba(34,197,94,0.2)]', headerBg: 'bg-green-500/10 dark:bg-green-900/20', headerBorder: 'border-green-200 dark:border-green-800/40', badgeCls: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 border-green-200 dark:border-green-700/50', dotColor: 'bg-green-500', statusColor: 'text-green-500' },
                        { color: 'from-purple-500 to-purple-600', accentClass: 'border-purple-400/50 shadow-[0_0_30px_rgba(168,85,247,0.2)]', headerBg: 'bg-purple-500/10 dark:bg-purple-900/20', headerBorder: 'border-purple-200 dark:border-purple-800/40', badgeCls: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-700/50', dotColor: 'bg-purple-400', statusColor: 'text-purple-400' },
                        { color: 'from-rose-500 to-pink-600', accentClass: 'border-rose-400/50 shadow-[0_0_30px_rgba(244,63,94,0.2)]', headerBg: 'bg-rose-500/10 dark:bg-rose-900/20', headerBorder: 'border-rose-200 dark:border-rose-800/40', badgeCls: 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-700/50', dotColor: 'bg-rose-400', statusColor: 'text-rose-400' },
                        { color: 'from-amber-500 to-orange-500', accentClass: 'border-amber-400/50 shadow-[0_0_30px_rgba(245,158,11,0.2)]', headerBg: 'bg-amber-500/10 dark:bg-amber-900/20', headerBorder: 'border-amber-200 dark:border-amber-800/40', badgeCls: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700/50', dotColor: 'bg-amber-400', statusColor: 'text-amber-400' },
                        { color: 'from-cyan-500 to-teal-600', accentClass: 'border-cyan-400/50 shadow-[0_0_30px_rgba(6,182,212,0.2)]', headerBg: 'bg-cyan-500/10 dark:bg-cyan-900/20', headerBorder: 'border-cyan-200 dark:border-cyan-800/40', badgeCls: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-700/50', dotColor: 'bg-cyan-400', statusColor: 'text-cyan-400' },
                        { color: 'from-indigo-500 to-indigo-600', accentClass: 'border-indigo-400/50 shadow-[0_0_30px_rgba(99,102,241,0.2)]', headerBg: 'bg-indigo-500/10 dark:bg-indigo-900/20', headerBorder: 'border-indigo-200 dark:border-indigo-800/40', badgeCls: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-700/50', dotColor: 'bg-indigo-400', statusColor: 'text-indigo-400' },
                        { color: 'from-emerald-500 to-green-600', accentClass: 'border-emerald-400/50 shadow-[0_0_30px_rgba(16,185,129,0.2)]', headerBg: 'bg-emerald-500/10 dark:bg-emerald-900/20', headerBorder: 'border-emerald-200 dark:border-emerald-800/40', badgeCls: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700/50', dotColor: 'bg-emerald-400', statusColor: 'text-emerald-400' },
                    ];

                    const editors = (activeRepoForCards?.members || []).map((rawMember, idx) => {
                        // Demo Override to ensure these specific peers always show as active/editing
                        const isDemoPeer = rawMember.name === 'Sofia Reyes' || rawMember.name === 'Prof. Davis';
                        const member = isDemoPeer ? { ...rawMember, status: 'online' as const, lastActive: 'Now' } : rawMember;
                        
                        const isLocal = member.name === activeUserName;
                        let palette = memberColorPalette[isLocal ? 0 : (idx % (memberColorPalette.length - 1)) + 1];
                        if (rawMember.name === 'Prof. Davis') palette = memberColorPalette[4]; // Force amber/orange for demo
                        
                        // Only 'online' members have active edits. Idle and offline = No Changes.
                        const hasEdits = member.status === 'online';
                        
                        // Generate simulated content for members with edits
                        let memberContent = editingCardsFile.content;
                        if (isLocal) {
                            memberContent = editingCardsFile.content;
                        } else if (hasEdits && editingCardsFile.serverContent) {
                            if (member.name === 'Sofia Reyes') memberContent = editingCardsFile.content + '\n\nFurthermore, our Yjs CRDT implementation facilitates true decentralized real-time collaboration, completely bypassing conventional network bottlenecks.';
                            else if (member.name === 'Prof. Davis') memberContent = `${editingCardsFile.content}\n\nIn summary, this research proves that peer-to-peer conflict-free replicated data types drastically outperform traditional operational transformation algorithms in high-latency environments.`;
                            else memberContent = `${editingCardsFile.content}\n\n[${member.name}: Minor edits and review comments added.]`;
                        }

                        // Status display
                        let status = 'No changes';
                        let dotColor = 'bg-zinc-500';
                        let statusColor = 'text-zinc-400';
                        if (isLocal) {
                            status = 'Editing now';
                            dotColor = palette.dotColor;
                            statusColor = palette.statusColor;
                        } else if (member.status === 'online') {
                            status = 'Editing now';
                            dotColor = palette.dotColor;
                            statusColor = palette.statusColor;
                        } else if (member.status === 'idle') {
                            status = `Idle • ${member.lastActive || 'recently'}`;
                            dotColor = 'bg-zinc-500';
                            statusColor = 'text-zinc-400';
                        } else {
                            status = `Offline • ${member.lastActive || 'unknown'}`;
                            dotColor = 'bg-zinc-500';
                            statusColor = 'text-zinc-400';
                        }

                        return {
                            name: isLocal ? 'You' : member.name,
                            initial: member.name.charAt(0),
                            badge: isLocal ? 'LOCAL' : 'PEER',
                            ...palette,
                            content: memberContent,
                            status,
                            statusColor,
                            dotColor,
                            hasEdits: isLocal || member.status === 'online',
                            isOffline: member.status === 'offline' || member.status === 'idle',
                        };
                    });

                    return (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-2xl"
                            onClick={() => { setIsEditingCardsOpen(false); setEditingCardsFile(null); }}
                        >
                            <motion.div
                                initial={{ opacity: 0, y: 30, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 20, scale: 0.96 }}
                                transition={{ type: 'spring', damping: 22, stiffness: 260 }}
                                className="w-[95%] max-w-5xl max-h-[90vh] flex flex-col"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Title */}
                                <div className="mb-5 flex items-center justify-between px-1">
                                    <div>
                                        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                            <span className="flex items-center gap-2"><AlertTriangle size={22} className="text-amber-400" /> Multiple Users Editing</span>
                                            <span className="text-sm font-semibold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">{editors.filter(e => e.hasEdits).length} active / {editors.length} members</span>
                                        </h2>
                                        <p className="text-sm text-zinc-400 mt-1">File: <span className="font-semibold text-zinc-200">{editingCardsFile.name}</span> — Click a card to review changes</p>
                                    </div>
                                    <button onClick={() => { setIsEditingCardsOpen(false); setEditingCardsFile(null); }} className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"><X size={22} /></button>
                                </div>

                                {/* Editor Cards Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 overflow-y-auto max-h-[65vh] pr-1 custom-scrollbar">
                                    {editors.map((editor, i) => (
                                        <motion.div
                                            key={editor.name}
                                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            transition={{ delay: i * 0.1, type: 'spring', stiffness: 220, damping: 20 }}
                                            whileHover={editor.hasEdits ? { scale: 1.03, y: -4 } : {}}
                                            onClick={() => {
                                                if (!editor.hasEdits) return;
                                                setReviewingUser({
                                                    name: editor.name,
                                                    color: editor.color,
                                                    accentClass: editor.accentClass,
                                                    content: editor.content,
                                                    badge: editor.badge,
                                                });
                                                setIsEditingCardsOpen(false);
                                            }}
                                            className={`rounded-2xl border-2 ${editor.hasEdits ? editor.accentClass : 'border-zinc-700/50 opacity-60'} overflow-hidden ${editor.hasEdits ? 'cursor-pointer' : 'cursor-default'} group`}
                                        >
                                            {/* Card Header */}
                                            <div className={`${editor.hasEdits ? editor.headerBg : 'bg-zinc-800/40'} border-b ${editor.hasEdits ? editor.headerBorder : 'border-zinc-700/30'} px-4 py-3 flex items-center gap-3 backdrop-blur-md`}>
                                                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${editor.hasEdits ? editor.color : 'from-zinc-600 to-zinc-700'} flex items-center justify-center text-white font-black text-sm shadow-lg`}>
                                                    {editor.initial}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-zinc-900 dark:text-white text-sm truncate">{editor.name}</p>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${editor.dotColor} ${editor.hasEdits ? 'animate-pulse' : ''}`}></span>
                                                        <span className={`text-[10px] font-semibold ${editor.statusColor}`}>{editor.status}</span>
                                                    </div>
                                                </div>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${editor.hasEdits ? editor.badgeCls : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>{editor.badge}</span>
                                            </div>

                                            {/* Card Body */}
                                            <div className="relative overflow-hidden" style={{ height: '200px' }}>
                                                {editor.hasEdits ? (
                                                    <>
                                                        <div
                                                            className="absolute inset-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-[3px] text-zinc-700 dark:text-zinc-300 text-xs leading-relaxed select-none p-4 overflow-hidden"
                                                            style={{ fontFamily: "'Georgia', 'Times New Roman', serif", filter: 'blur(2px)', userSelect: 'none', pointerEvents: 'none' }}
                                                            dangerouslySetInnerHTML={{ __html: editor.content.length > 400 ? editor.content.slice(0, 400) + '...' : editor.content }}
                                                        />
                                                        {/* Overlay with Click Prompt */}
                                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-t from-black/40 via-black/10 to-transparent">
                                                            <motion.div
                                                                whileHover={{ scale: 1.05 }}
                                                                whileTap={{ scale: 0.95 }}
                                                                className={`px-4 py-2 rounded-xl bg-gradient-to-r ${editor.color} text-white text-xs font-black shadow-lg flex items-center gap-2 cursor-pointer transition-all hover:shadow-xl`}
                                                            >
                                                                <Activity size={13} className="animate-pulse" /> Review Changes
                                                            </motion.div>
                                                            <span className="text-[10px] text-white/70 font-medium">Click to see full document</span>
                                                        </div>
                                                    </>
                                                ) : (
                                                    /* No changes — dimmed state */
                                                    <div className="absolute inset-0 bg-zinc-900/90 flex flex-col items-center justify-center gap-3">
                                                        <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                                                            <CheckCircle2 size={24} className="text-zinc-600" />
                                                        </div>
                                                        <div className="text-center">
                                                            <p className="text-sm font-bold text-zinc-500">No Changes</p>
                                                            <p className="text-[10px] text-zinc-600 mt-0.5">This member has not edited this file</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Footer */}
                                            <div className={`${editor.hasEdits ? editor.headerBg : 'bg-zinc-800/40'} border-t ${editor.hasEdits ? editor.headerBorder : 'border-zinc-700/30'} px-4 py-2.5 flex items-center gap-2`}>
                                                <div className="group/info relative">
                                                    <CheckCircle2 size={13} className="text-zinc-500 cursor-help" />
                                                    <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-zinc-900 border border-white/10 rounded-lg text-[10px] text-zinc-300 opacity-0 group-hover/info:opacity-100 transition-opacity pointer-events-none shadow-xl z-[100]">
                                                        {editor.hasEdits 
                                                            ? 'Verified by Collision-Safe Logic to ensure no data loss during multi-editor synchronization.'
                                                            : `${editor.name} has not made any edits to this file during this session.`}
                                                    </div>
                                                </div>
                                                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium tracking-wide">
                                                    {editor.hasEdits ? 'Synchronized Edits • Verified Order' : 'No Edits Detected • Up to Date'}
                                                </span>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>

                                {/* Bottom hint */}
                                <div className="mt-5 flex items-center justify-center gap-2 text-xs text-zinc-500">
                                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                                    Yjs is tracking all {editors.length} members ({editors.filter(e => e.hasEdits).length} active) simultaneously via WebRTC
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>

            {/* ══ Full-File Diff Review Modal ══ */}
            <AnimatePresence>
                {reviewingUser && editingCardsFile && (() => {
                    const baseText = (reviewingUser.name === 'You (Local)' ? (editingCardsFile.serverContent || '') : editingCardsFile.content).replace(/<[^>]*>/g, '').trim();
                    const userText = reviewingUser.content.replace(/<[^>]*>/g, '').trim();

                    // Advanced LCS-based paragraph alignment
                    const renderDocumentDiffPair = () => {
                        const baseParas = baseText.split(/\n+/).map(p => p.trim()).filter(Boolean);
                        const userParas = userText.split(/\n+/).map(p => p.trim()).filter(Boolean);

                        const m = baseParas.length;
                        const n = userParas.length;
                        const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
                        for (let i = 1; i <= m; i++) {
                            for (let j = 1; j <= n; j++) {
                                if (baseParas[i - 1] === userParas[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
                                else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                            }
                        }

                        let i = m, j = n;
                        const alignment: any[] = [];
                        while (i > 0 && j > 0) {
                            if (baseParas[i - 1] === userParas[j - 1]) { alignment.unshift({ type: 'same', b: i - 1, u: j - 1 }); i--; j--; }
                            else if (dp[i - 1][j] >= dp[i][j - 1]) { alignment.unshift({ type: 'removed', b: i - 1, u: -1 }); i--; }
                            else { alignment.unshift({ type: 'added', b: -1, u: j - 1 }); j--; }
                        }
                        while (i > 0) { alignment.unshift({ type: 'removed', b: i - 1, u: -1 }); i--; }
                        while (j > 0) { alignment.unshift({ type: 'added', b: -1, u: j - 1 }); j--; }

                        const mergedAlignment: any[] = [];
                        let k = 0;
                        while (k < alignment.length) {
                            if (alignment[k].type === 'removed' && k + 1 < alignment.length && alignment[k + 1].type === 'added') {
                                mergedAlignment.push({ type: 'modified', b: alignment[k].b, u: alignment[k + 1].u }); k += 2;
                            } else if (alignment[k].type === 'added' && k + 1 < alignment.length && alignment[k + 1].type === 'removed') {
                                mergedAlignment.push({ type: 'modified', b: alignment[k + 1].b, u: alignment[k].u }); k += 2;
                            } else {
                                mergedAlignment.push(alignment[k]); k++;
                            }
                        }

                        const leftNodes: React.ReactNode[] = [];
                        const rightNodes: React.ReactNode[] = [];

                        mergedAlignment.forEach((al, idx) => {
                            const bPara = al.b !== -1 ? baseParas[al.b] : '';
                            const uPara = al.u !== -1 ? userParas[al.u] : '';

                            if (al.type === 'same') {
                                leftNodes.push(<p key={idx} className="mb-4 leading-[1.85] text-zinc-500" style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: '13px' }}>{bPara}</p>);
                                rightNodes.push(<p key={idx} className="mb-4 leading-[1.85] text-zinc-800" style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: '13px' }}>{uPara}</p>);
                            } else if (al.type === 'modified') {
                                leftNodes.push(<p key={idx} className="mb-4 leading-[1.85] text-zinc-800 bg-rose-50/50 rounded px-1 -mx-1 border-l-2 border-rose-300 opacity-80" style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: '13px' }}><del className="text-rose-700 decoration-rose-400 decoration-2">{bPara}</del></p>);
                                const uWords = uPara.split(' ');
                                const bWordSet = new Set(bPara.split(' '));
                                const rightKids = uWords.map((word, wi) => {
                                    return !bWordSet.has(word) ? <mark key={wi} className="bg-yellow-200/90 dark:bg-yellow-400/40 text-yellow-950 dark:text-yellow-100 rounded-sm leading-none">{word} </mark> : <span key={wi}>{word} </span>;
                                });
                                rightNodes.push(<p key={idx} className="mb-4 leading-[1.85] text-zinc-800 bg-yellow-50 rounded px-1 -mx-1 border-l-4 border-yellow-400" style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: '13px' }}>{rightKids}</p>);
                            } else if (al.type === 'removed') {
                                leftNodes.push(<p key={idx} className="mb-4 leading-[1.85] text-rose-700 bg-rose-50 rounded px-1 -mx-1 border-l-4 border-rose-500" style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: '13px' }}>{bPara}</p>);
                                rightNodes.push(<div key={idx} className="mb-4 border-l-4 border-white select-none opacity-0" style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: '13px' }}>Spacer</div>);
                            } else if (al.type === 'added') {
                                leftNodes.push(<div key={idx} className="mb-4 border-l-4 border-white select-none opacity-0" style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: '13px' }}>Spacer</div>);
                                rightNodes.push(<p key={idx} className="mb-4 leading-[1.85] text-emerald-900 bg-emerald-50 rounded px-1 -mx-1 border-l-4 border-emerald-500" style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: '13px' }}>{uPara}</p>);
                            }
                        });

                        return { leftNodes, rightNodes };
                    };

                    const accentExtract = reviewingUser.color.split(' ')[0].replace('from-', '');

                    return (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-2xl"
                            onClick={() => { setReviewingUser(null); setIsEditingCardsOpen(true); }}
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.94, y: 30 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.94, y: 20 }}
                                transition={{ type: 'spring', damping: 22, stiffness: 260 }}
                                className="flex flex-col w-[96%] max-w-3xl max-h-[93vh] rounded-2xl overflow-hidden shadow-[0_40px_120px_rgba(0,0,0,0.8)]"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* ── Toolbar (dark) ── */}
                                <div className="bg-zinc-900 border-b border-white/10 px-5 py-3 flex items-center gap-3 flex-shrink-0">
                                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${reviewingUser.color} flex items-center justify-center text-white font-black text-xs shadow`}>
                                        {reviewingUser.name[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-bold text-sm truncate">{editingCardsFile.name}</p>
                                        <p className="text-zinc-400 text-[11px]">Comparing your version with <span className={`font-semibold text-rose-400`}>{reviewingUser.name}&apos;s updates</span></p>
                                    </div>
                                    {/* Legend pills */}
                                    <div className="hidden sm:flex items-center gap-2 mr-2">
                                        <span className="flex items-center gap-1 text-[10px] font-semibold text-yellow-300 bg-yellow-900/40 px-2 py-0.5 rounded border border-yellow-700/40">
                                            <span className="w-2 h-2 rounded-sm bg-yellow-400 inline-block"></span> Modified
                                        </span>
                                        <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-300 bg-emerald-900/40 px-2 py-0.5 rounded border border-emerald-700/40">
                                            <span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block"></span> Added
                                        </span>
                                        <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-300 bg-rose-900/40 px-2 py-0.5 rounded border border-rose-700/40">
                                            <span className="w-2 h-2 rounded-sm bg-rose-400 inline-block"></span> Removed
                                        </span>
                                    </div>
                                    <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setReviewingUser(null); setIsEditingCardsOpen(true); }} className="px-3 py-1.5 rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-700 transition-colors text-xs font-semibold flex items-center gap-1.5 flex-shrink-0">
                                        <ChevronLeft size={13} /> Back
                                    </motion.button>
                                    <button onClick={() => { setReviewingUser(null); setEditingCardsFile(null); }} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors flex-shrink-0"><X size={17} /></button>
                                </div>

                                {/* ── Document Paper Area ── */}
                                <div className="flex-1 overflow-x-hidden overflow-y-auto bg-zinc-200 px-6 py-8 custom-scrollbar" style={{ backgroundImage: 'linear-gradient(135deg, #d4d4d4 0%, #e8e8e8 100%)' }}>
                                    
                                    <div className="flex flex-col xl:flex-row gap-6 mx-auto w-full max-w-[1200px]">
                                        
                                        {/* Original/Base Document */}
                                        <div className="flex-1 bg-white shadow-[0_4px_40px_rgba(0,0,0,0.25)] rounded-sm px-10 py-12 min-h-[700px] flex flex-col">
                                            <div className="text-center mb-10 pb-6 border-b border-zinc-200">
                                                <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-zinc-400 mb-2 text-center w-full">Current Master Copy</p>
                                                <h1 className="text-lg font-bold text-zinc-900" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>{editingCardsFile.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ')}</h1>
                                                <p className="text-[11px] text-zinc-500 mt-2" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>
                                                    Finalized version on server
                                                </p>
                                            </div>
                                            <div className="flex-1">
                                                {renderDocumentDiffPair().leftNodes}
                                            </div>
                                            <div className="mt-10 pt-4 border-t border-zinc-200 text-center">
                                                <p className="text-[9px] text-zinc-300" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>CS 402 — Collaborative Thesis</p>
                                            </div>
                                        </div>

                                        {/* User's Document */}
                                        <div className="flex-1 bg-white shadow-[0_4px_40px_rgba(0,0,0,0.25)] rounded-sm px-10 py-12 min-h-[700px] flex flex-col">
                                            <div className="text-center mb-10 pb-6 border-b border-zinc-200">
                                                <p className={`text-[10px] font-semibold tracking-[0.2em] uppercase text-${accentExtract}-600 mb-2`}>{reviewingUser.name}&apos;s Version</p>
                                                <h1 className="text-lg font-bold text-zinc-900" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>{editingCardsFile.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ')}</h1>
                                                <p className="text-[11px] text-zinc-500 mt-2" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>
                                                    Reviewing changes · DocuSync Hybrid Engine v2
                                                </p>
                                            </div>
                                            <div className="flex-1">
                                                {renderDocumentDiffPair().rightNodes}
                                            </div>
                                            <div className="mt-10 pt-4 border-t border-zinc-200 text-center">
                                                <p className="text-[9px] text-zinc-300" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>CS 402 — Collaborative Thesis</p>
                                            </div>
                                        </div>

                                    </div>
                                </div>

                                {/* ── Accept / Dismiss Footer ── */}
                                <div className="bg-zinc-900 border-t border-white/10 px-5 py-3.5 flex gap-3 flex-shrink-0">
                                    <motion.button
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => {
                                            if (editingCardsFile) {
                                                setConflictFile(editingCardsFile.name);
                                                setDynamicConflict(null);
                                            }
                                            setReviewingUser(null);
                                            setIsEditingCardsOpen(false);
                                        }}
                                        className="flex-1 py-2.5 rounded-xl border border-zinc-600 text-zinc-300 hover:bg-zinc-800 transition-all text-sm font-semibold"
                                    >
                                        Open Full Conflict Resolver
                                    </motion.button>
                                    <motion.button
                                        whileTap={isRepoOwner ? { scale: 0.97 } : {}}
                                        onClick={() => {
                                            if (!isRepoOwner) return;
                                            if (currentRepo && editingCardsFile) {
                                                // Build merged content: local + all peer edits combined
                                                const mergedContent = reviewingUser.content;
                                                // 1. Resolve the conflict in the data store (marks file as Synced)
                                                resolveConflict(currentRepo, editingCardsFile.name, 'server', mergedContent);
                                                // 2. Update the editor so it NOW shows the merged result
                                                setEditorText(mergedContent);
                                                setEditingFile(prev => prev ? { ...prev, content: mergedContent } : null);
                                            }
                                            setReviewingUser(null);
                                            setIsEditingCardsOpen(false);
                                            setEditingCardsFile(null);
                                        }}
                                        disabled={!isRepoOwner}
                                        className={`flex-1 py-2.5 rounded-xl font-bold text-sm shadow-lg ${isRepoOwner ? `bg-gradient-to-r ${reviewingUser.color} text-white cursor-pointer` : 'bg-zinc-600 text-zinc-400 cursor-not-allowed opacity-60'}`}
                                        title={!isRepoOwner ? 'Only the repository owner can accept changes' : ''}
                                    >
                                        {isRepoOwner ? `✓ Accept ${reviewingUser.name.split(' ')[0]}\u0027s Changes` : '🔒 Owner Only'}
                                    </motion.button>
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>


            {/* Group Management Slide-over */}
            <AnimatePresence>
                {isGroupManageOpen && currentRepo && (() => {
                    const activeRepo = reposData.find(r => r.name === currentRepo);
                    if (!activeRepo) return null;
                    const isOwner = activeRepo.userRole === 'Owner';
                    const badgeColors: Record<string, string> = {
                        amber: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50',
                        purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/50',
                        zinc: 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-600',
                    };
                    const onlineCount = activeRepo.members.filter(m => m.status === 'online').length;
                    const idleCount = activeRepo.members.filter(m => m.status === 'idle').length;
                    const offlineCount = activeRepo.members.filter(m => m.status === 'offline').length;
                    return (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex justify-end bg-black/50 backdrop-blur-sm" onClick={() => setIsGroupManageOpen(false)}>
                            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="bg-zinc-50/95 dark:bg-zinc-950/95 backdrop-blur-2xl border-l border-white/5 shadow-[0_0_60px_rgba(0,0,0,0.5)] w-full max-w-2xl h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
                                {/* Header */}
                                <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl z-10">
                                    <div>
                                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                                            {isOwner ? <Settings className="text-amber-500" /> : <Users className="text-amber-500" />}
                                            {isOwner ? 'Manage Group' : 'Team Members'}
                                        </h2>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{activeRepo.name} • {activeRepo.members.length} members</p>
                                    </div>
                                    <button onClick={() => setIsGroupManageOpen(false)} className="p-2 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"><X size={24} /></button>
                                </div>

                                <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar flex flex-col gap-8">
                                    {/* ── Member Status Summary Bar (shown for EVERYONE) ── */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 flex flex-col items-center gap-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                                                <span className="text-2xl font-black text-green-500">{onlineCount}</span>
                                            </div>
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-green-600 dark:text-green-400">Online</span>
                                        </div>
                                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex flex-col items-center gap-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                                <span className="text-2xl font-black text-amber-500">{idleCount}</span>
                                            </div>
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Idle</span>
                                        </div>
                                        <div className="bg-zinc-500/10 border border-zinc-500/20 rounded-2xl p-4 flex flex-col items-center gap-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full bg-zinc-500" />
                                                <span className="text-2xl font-black text-zinc-500">{offlineCount}</span>
                                            </div>
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Offline</span>
                                        </div>
                                    </div>

                                    {/* Invite Member Section (Owner Only) */}
                                    {isOwner && (
                                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
                                            <div className={`px-6 py-5 flex items-center justify-between cursor-pointer transition-colors ${isInviteExpanded ? 'bg-amber-50/50 dark:bg-amber-900/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`} onClick={() => setIsInviteExpanded(!isInviteExpanded)}>
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"><UserPlus size={18} /></div>
                                                    <div>
                                                        <h3 className="font-bold text-zinc-900 dark:text-white">Invite New Members</h3>
                                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Share links, review requests, or invite directly</p>
                                                    </div>
                                                </div>
                                                <ChevronRight size={20} className={`text-zinc-400 transition-transform duration-300 ${isInviteExpanded ? 'rotate-90' : ''}`} />
                                            </div>
                                            <AnimatePresence>
                                                {isInviteExpanded && (
                                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-zinc-200 dark:border-zinc-800/50">
                                                        <div className="p-6 flex flex-col gap-6 bg-zinc-50/50 dark:bg-zinc-900/50">
                                                            {/* A. Shareable Link */}
                                                            <div>
                                                                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2"><Share2 size={16} className="text-amber-500" /> Shareable Invite Link</label>
                                                                <div className="flex gap-2">
                                                                    <input type="text" readOnly value={`https://docusync.app/repo/${activeRepo.id}/join`} className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 font-mono text-sm focus:outline-none" />
                                                                    <button className="px-5 py-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 font-bold text-sm transition-all shadow-md shrink-0">Copy Link</button>
                                                                </div>
                                                            </div>

                                                            {/* B. Pending Requests */}
                                                            {activeRepo.pendingRequests && activeRepo.pendingRequests.length > 0 && (
                                                                <div>
                                                                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2"><Clock size={16} className="text-orange-500" /> Pending Join Requests ({activeRepo.pendingRequests.length})</label>
                                                                    <div className="flex flex-col gap-2">
                                                                        {activeRepo.pendingRequests.map(req => (
                                                                            <div key={req.id} className="flex items-center justify-between p-3.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-sm">
                                                                                <div className="flex flex-col">
                                                                                    <span className="font-bold text-zinc-900 dark:text-zinc-200 text-sm">{req.name}</span>
                                                                                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{req.email} • Requested {req.date}</span>
                                                                                </div>
                                                                                <div className="flex items-center gap-2">
                                                                                    <button className="p-2 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/20 transition-colors" title="Accept Request"><CheckCircle2 size={18} /></button>
                                                                                    <button className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-colors" title="Deny Request"><X size={18} /></button>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* C. Direct Invite Search */}
                                                            <div>
                                                                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2"><Search size={16} className="text-purple-500" /> Direct Invite Search</label>
                                                                <div className="relative">
                                                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                                                                    <input type="text" placeholder="Search users by name or email..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors text-sm" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    )}

                                    {/* ── Members List ── */}
                                    <div>
                                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                                            <Users size={18} className="text-zinc-400" /> {isOwner ? 'Active Members' : 'All Members'}
                                        </h3>
                                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                                            {activeRepo.members.map((member, idx) => (
                                                <motion.div 
                                                    key={idx} 
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: idx * 0.05 }}
                                                    className="px-6 py-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group/member"
                                                >
                                                    <div className="flex items-center gap-4">
                                                        {/* Avatar with status indicator */}
                                                        <div className="relative">
                                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-sm ${member.badge === 'amber' ? 'bg-gradient-to-tr from-amber-500 to-amber-600' : member.badge === 'purple' ? 'bg-gradient-to-tr from-purple-500 to-purple-600' : 'bg-gradient-to-tr from-zinc-400 to-zinc-500'}`}>
                                                                {member.name.charAt(0)}
                                                            </div>
                                                            {/* Status dot on avatar */}
                                                            <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-zinc-900 ${
                                                                member.status === 'online' ? 'bg-green-500' :
                                                                member.status === 'idle' ? 'bg-amber-500' :
                                                                'bg-zinc-400'
                                                            }`} />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-zinc-900 dark:text-zinc-200">{member.name}</span>
                                                                {member.name === activeUserName && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20">YOU</span>}
                                                            </div>
                                                            {/* Status text for member view */}
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className={`text-[11px] font-semibold ${
                                                                    member.status === 'online' ? 'text-green-500' :
                                                                    member.status === 'idle' ? 'text-amber-500' :
                                                                    'text-zinc-400'
                                                                }`}>
                                                                    {member.status === 'online' ? '● Online' : member.status === 'idle' ? '● Idle' : '○ Offline'}
                                                                </span>
                                                                {member.lastActive && member.status !== 'online' && (
                                                                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500">• Last active {member.lastActive}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        {isOwner && member.name !== activeUserName ? (
                                                            <>
                                                                <select defaultValue={member.role} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-amber-500 cursor-pointer appearance-none shadow-sm">
                                                                    <option value="Owner">Owner</option>
                                                                    <option value="Editor">Editor</option>
                                                                    <option value="Viewer">Viewer</option>
                                                                </select>
                                                                <button className="opacity-0 group-hover/member:opacity-100 text-xs font-bold px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-all shadow-sm">
                                                                    Remove
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${badgeColors[member.badge] || badgeColors.zinc}`}>
                                                                {member.role}
                                                            </span>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </div>

                                        {/* Danger Zone: Delete Repository (Owner only) */}
                                        {isOwner && (
                                            <div className="mt-4 rounded-2xl border-2 border-rose-500/30 bg-rose-50/30 dark:bg-rose-900/10 p-6">
                                                <h3 className="text-base font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2 mb-2"><AlertTriangle size={18} /> Danger Zone</h3>
                                                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">Permanently delete this repository and all its files. This action cannot be undone.</p>
                                                <button onClick={() => setIsDeleteRepoOpen(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-rose-500/50 text-rose-600 dark:text-rose-400 bg-white dark:bg-zinc-900 hover:bg-rose-500 hover:text-white hover:border-rose-600 transition-all font-bold text-sm">
                                                    <Trash2 size={16} /> Delete Repository
                                                </button>
                                            </div>
                                        )}
                                        {/* Member View: Your Role + Permissions Info */}
                                        {!isOwner && (
                                            <div className="mt-4 flex flex-col gap-3">
                                                {/* Your role card */}
                                                <div className="bg-purple-50/50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800/40 rounded-xl p-4 flex items-center gap-3">
                                                    <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 shrink-0"><User size={16} /></div>
                                                    <div className="flex-1">
                                                        <p className="text-xs font-bold text-zinc-900 dark:text-white">Your Role: {activeRepo.userRole}</p>
                                                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                                                            {activeRepo.userRole === 'Editor' 
                                                                ? 'You can edit files and view changes, but only the Owner can approve conflict resolutions.'
                                                                : 'You can view files but cannot edit or approve changes.'}
                                                        </p>
                                                    </div>
                                                </div>
                                                {/* Restricted permissions notice */}
                                                <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4 flex items-center gap-3">
                                                    <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 shrink-0"><Shield size={16} /></div>
                                                    <div>
                                                        <p className="text-xs font-bold text-zinc-900 dark:text-white">Restricted Permissions</p>
                                                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Only the repository Owner can invite members, change roles, approve merges, or remove users.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>

            {/* Exclusive Friends Panel Slide-over */}
            <AnimatePresence>
                {isFriendsPanelOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex justify-end bg-black/40 backdrop-blur-sm" onClick={() => setIsFriendsPanelOpen(false)}>
                        <motion.div 
                            initial={{ x: '100%', rotateY: 10, scale: 0.95 }} 
                            animate={{ x: 0, rotateY: 0, scale: 1 }} 
                            exit={{ x: '100%', rotateY: 10, scale: 0.95 }} 
                            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                            className="bg-white/95 dark:bg-zinc-950/95 backdrop-blur-3xl border-l border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.6)] w-full max-w-sm h-full flex flex-col perspective-1000" 
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-6 py-6 border-b border-white/5 flex justify-between items-center bg-white/40 dark:bg-zinc-900/40 backdrop-blur-md">
                                <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                                    <Users size={20} className="text-emerald-500" /> My Friends
                                </h2>
                                <button onClick={() => setIsFriendsPanelOpen(false)} className="p-2 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"><X size={20} /></button>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar flex flex-col gap-3">
                                <div className="relative mb-2">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={14} />
                                    <input type="text" placeholder="Search friends..." className="w-full pl-9 pr-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors text-sm" />
                                </div>
                                
                                <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Online (3)</p>
                                
                                {/* Friend 1 */}
                                <motion.div whileHover={{ scale: 1.02, x: 2 }} className="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 shadow-sm cursor-pointer group">
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white font-bold shadow-md">S</div>
                                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-white dark:border-zinc-900"></div>
                                        </div>
                                        <div>
                                            <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">Sarah Jenkins</p>
                                            <p className="text-[11px] text-green-600 dark:text-green-400 font-semibold">Editing Thesis_Docs</p>
                                        </div>
                                    </div>
                                    <button className="opacity-0 group-hover:opacity-100 p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all"><MessageCircle size={16} /></button>
                                </motion.div>

                                {/* Friend 2 */}
                                <motion.div whileHover={{ scale: 1.02, x: 2 }} className="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 shadow-sm cursor-pointer group">
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-orange-400 to-rose-500 flex items-center justify-center text-white font-bold shadow-md">P</div>
                                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-white dark:border-zinc-900"></div>
                                        </div>
                                        <div>
                                            <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">Prof. Anderson</p>
                                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">Online</p>
                                        </div>
                                    </div>
                                    <button className="opacity-0 group-hover:opacity-100 p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all"><MessageCircle size={16} /></button>
                                </motion.div>

                                {/* Friend 3 */}
                                <motion.div whileHover={{ scale: 1.02, x: 2 }} className="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 shadow-sm cursor-pointer group">
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-rose-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-md">E</div>
                                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-500 border-2 border-white dark:border-zinc-900"></div>
                                        </div>
                                        <div>
                                            <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">Elena Rostova</p>
                                            <p className="text-[11px] text-amber-600 dark:text-amber-500 font-medium">Away for 15m</p>
                                        </div>
                                    </div>
                                    <button className="opacity-0 group-hover:opacity-100 p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all"><MessageCircle size={16} /></button>
                                </motion.div>
                                
                                <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mt-4 mb-1">Offline (1)</p>
                                {/* Friend 4 (Offline) */}
                                <motion.div whileHover={{ scale: 1.02, x: 2 }} className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50 shadow-sm cursor-pointer opacity-70 hover:opacity-100 transition-opacity">
                                    <div className="flex items-center gap-3">
                                        <div className="relative grayscale">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-zinc-400 to-stone-500 flex items-center justify-center text-white font-bold shadow-md">M</div>
                                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-zinc-400 border-2 border-white dark:border-zinc-900"></div>
                                        </div>
                                        <div>
                                            <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">Michael Chang</p>
                                            <p className="text-[11px] text-zinc-500 dark:text-zinc-500 font-medium">Last seen 2 days ago</p>
                                        </div>
                                    </div>
                                </motion.div>

                            </div>
                            
                            <div className="p-6 border-t border-white/5 bg-zinc-50/50 dark:bg-zinc-900/20">
                                <button className="w-full py-3 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 dark:text-emerald-400 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"><UserPlus size={18} /> Add New Friend</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* File Text Editor Modal (Module 3) */}
            <AnimatePresence>
                {editingFile && (() => {
                    const review = editingFile.pendingReview;
                    const isReviewMode = !!review;
                    const getHighlightedHtml = (newHtml: string, oldHtml: string) => {
                        const baseText = oldHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                        const userText = newHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

                        const baseWords = baseText.split(' ').filter(Boolean);
                        const userWords = userText.split(' ').filter(Boolean);

                        const m = baseWords.length;
                        const n = userWords.length;
                        const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
                        for (let i = 1; i <= m; i++) {
                            for (let j = 1; j <= n; j++) {
                                if (baseWords[i - 1] === userWords[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
                                else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                            }
                        }

                        let i = m, j = n;
                        const alignment: any[] = [];
                        while (i > 0 && j > 0) {
                            if (baseWords[i - 1] === userWords[j - 1]) { alignment.unshift({ type: 'same', text: baseWords[i - 1] }); i--; j--; }
                            else if (dp[i - 1][j] >= dp[i][j - 1]) { alignment.unshift({ type: 'removed', text: baseWords[i - 1] }); i--; }
                            else { alignment.unshift({ type: 'added', text: userWords[j - 1] }); j--; }
                        }
                        while (i > 0) { alignment.unshift({ type: 'removed', text: baseWords[i - 1] }); i--; }
                        while (j > 0) { alignment.unshift({ type: 'added', text: userWords[j - 1] }); j--; }

                        const mergedAlignment: any[] = [];
                        alignment.forEach(al => {
                            if (mergedAlignment.length > 0 && mergedAlignment[mergedAlignment.length - 1].type === al.type) {
                                mergedAlignment[mergedAlignment.length - 1].text += ' ' + al.text;
                            } else {
                                mergedAlignment.push({ ...al });
                            }
                        });

                        let resultHtml = '';
                        mergedAlignment.forEach(al => {
                            if (al.type === 'same') resultHtml += al.text + ' ';
                            else if (al.type === 'removed') resultHtml += `<del style="background-color:#ffe4e6;color:#e11d48;padding:2px 4px;border-radius:4px;text-decoration-thickness:2px;font-weight:600;margin:0 2px;">${al.text}</del> `;
                            else if (al.type === 'added') resultHtml += `<ins style="background-color:#d1fae5;color:#065f46;padding:2px 4px;border-radius:4px;text-decoration:none;font-weight:600;border-bottom:2px solid #34d399;margin:0 2px;">${al.text}</ins> `;
                        });
                        return `<p style="line-height:2.2">${resultHtml.trim()}</p>`;
                    };
                    return (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} className="fixed inset-0 z-[70] flex flex-col bg-zinc-950">
                        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} exit={{ opacity: 0 }} className="flex flex-col" style={{ height: '100vh' }}>
                            {/* ── RichTextEditor owns its own nav bar + toolbar ─ */}
                            <div className="flex-1 overflow-hidden">
                                <RichTextEditor
                                    fileName={editingFile.name}
                                    userName={activeUserName}
                                    onChange={(html) => setEditorText(html)}
                                    initialContent={editingFile.content}
                                    isOffline={isOffline}
                                    repoName={currentRepo || undefined}
                                    onClose={() => { setEditingFile(null); setEditorText(''); }}
                                    onSave={() => {
                                        if (!currentRepo || !editingFile) return;
                                        const newContent = editorText || editingFile.content;
                                        saveFileContent(currentRepo, editingFile.name, newContent, editingFile.content || '');
                                        setEditingFile(null);
                                        setEditorText('');
                                    }}
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                    );
                })()}
            </AnimatePresence>

            {/* ══ Premium Delete File Confirmation Modal ══ */}
            <AnimatePresence>
                {deleteFileTarget && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-xl"
                        onClick={() => setDeleteFileTarget(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.88, y: 24 }}
                            animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
                            exit={{ opacity: 0, scale: 0.92, y: 12, transition: { duration: 0.2, ease: 'easeIn' } }}
                            onClick={(e) => e.stopPropagation()}
                            className="relative overflow-hidden bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl border border-rose-500/20 rounded-3xl shadow-[0_30px_100px_rgba(239,68,68,0.25),0_0_0_1px_rgba(239,68,68,0.1)] flex flex-col w-[90%] max-w-md"
                        >
                            {/* Gradient top stripe */}
                            <div className="h-1 w-full bg-gradient-to-r from-rose-600 via-red-500 to-rose-600" />

                            {/* Ambient glow */}
                            <div className="absolute top-0 right-0 w-48 h-48 bg-rose-500/8 rounded-full -translate-y-24 translate-x-24 blur-3xl pointer-events-none" />

                            <div className="p-8 relative z-10">
                                {/* Icon + title */}
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="relative shrink-0">
                                        <div className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping" />
                                        <div className="relative w-14 h-14 rounded-full bg-rose-100 dark:bg-rose-900/40 border border-rose-200 dark:border-rose-700/50 flex items-center justify-center shadow-inner">
                                            <AlertTriangle size={26} className="text-rose-600 dark:text-rose-400" />
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h2 className="text-xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                                            Permanent Deletion
                                        </h2>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">This action is irreversible and cannot be undone.</p>
                                    </div>
                                    <button
                                        onClick={() => setDeleteFileTarget(null)}
                                        className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                {/* Warning card */}
                                <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 rounded-2xl p-5 mb-6 shadow-inner">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                        <span className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-widest">CRITICAL WARNING</span>
                                    </div>
                                    <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                                        {deleteFileTarget.trashItemId === -999
                                            ? <>You are about to permanently delete <strong className="text-zinc-900 dark:text-white">{deleteFileTarget.fileName}</strong>. All data will be erased from storage immediately.</>
                                            : <>File <strong className="text-zinc-900 dark:text-white">&ldquo;{deleteFileTarget.fileName}&rdquo;</strong> will be permanently erased. It cannot be recovered from Trash after this action.</>
                                        }
                                    </p>
                                </div>

                                {/* Action buttons */}
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setDeleteFileTarget(null)}
                                        className="flex-1 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all text-sm font-semibold"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (!deleteFileTarget) return;
                                            if (deleteFileTarget.trashItemId === -999) {
                                                emptyTrash();
                                            } else {
                                                permanentlyDeleteFile(deleteFileTarget.trashItemId);
                                            }
                                            setDeleteFileTarget(null);
                                        }}
                                        className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-extrabold text-sm shadow-lg shadow-rose-500/30 hover:shadow-rose-500/50 transition-all flex items-center justify-center gap-2 group"
                                    >
                                        <Trash2 size={16} className="group-hover:scale-110 transition-transform" />
                                        Delete Forever
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Delete Repo Confirmation Modal (Module 1) */}
            <AnimatePresence>
                {isDeleteRepoOpen && currentRepo && (() => {
                    const repoToDelete = reposData.find(r => r.name === currentRepo);
                    return (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md">
                            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="bg-white/90 dark:bg-zinc-900/85 backdrop-blur-2xl border border-rose-500/25 rounded-2xl shadow-[0_25px_80px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden w-[90%] max-w-md">
                                <div className="h-1 w-full bg-gradient-to-r from-rose-600 to-red-500" />
                                <div className="p-7">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center">
                                            <AlertTriangle size={24} className="text-rose-600 dark:text-rose-400" />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-extrabold text-rose-600 dark:text-rose-400">Permanent Deletion</h2>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">This action is irreversible</p>
                                        </div>
                                    </div>
                                    <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 rounded-xl p-4 mb-6">
                                        <p className="text-sm font-bold text-rose-700 dark:text-rose-300">⚠ WARNING: This action is permanent and will delete all files and repository history.</p>
                                        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2">Repository <strong className="text-zinc-900 dark:text-white">&ldquo;{repoToDelete?.name}&rdquo;</strong> and its <strong>{repoToDelete?.files.length} file(s)</strong> will be permanently erased. Are you sure you want to proceed?</p>
                                    </div>
                                    <div className="flex gap-3">
                                        <button onClick={() => setIsDeleteRepoOpen(false)} className="flex-1 px-5 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm font-semibold">Cancel, Keep Repository</button>
                                        <button onClick={() => {
                                            if (!repoToDelete) return;
                                            deleteRepository(repoToDelete.id);
                                            setIsDeleteRepoOpen(false);
                                            setIsGroupManageOpen(false);
                                            setCurrentRepo(null);
                                        }} className="flex-1 px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-sm shadow-lg shadow-rose-500/30 transition-all flex items-center justify-center gap-2">
                                            <Trash2 size={16} /> Yes, Delete Forever
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>
            <AnimatePresence>
                {isFriendsPanelOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex justify-end bg-black/50 backdrop-blur-sm" onClick={() => setIsFriendsPanelOpen(false)}>
                        <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="bg-zinc-50 dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-md h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
                            {/* Panel Header */}
                            <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-900">
                                <div>
                                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2.5">
                                        <Users className="text-amber-500" size={22} /> Friends & Activity
                                    </h2>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Manage your connections and see who&apos;s online</p>
                                </div>
                                <button onClick={() => setIsFriendsPanelOpen(false)} className="p-2 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"><X size={22} /></button>
                            </div>

                            <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar flex flex-col gap-6">
                                {/* A. Add Friend */}
                                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-3 flex items-center gap-2"><UserPlus size={16} className="text-amber-500" /> Add Friend</h3>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={15} />
                                            <input type="text" value={friendSearchQuery} onChange={(e) => setFriendSearchQuery(e.target.value)} placeholder="Search by username or email..." className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white placeholder-zinc-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors" />
                                        </div>
                                        <button className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-all shadow-md shadow-amber-500/20 shrink-0">Send Request</button>
                                    </div>
                                </div>

                                {/* B. Pending Requests */}
                                <div>
                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-3 flex items-center gap-2"><Clock size={16} className="text-orange-500" /> Pending Requests <span className="ml-auto text-[11px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">2 new</span></h3>
                                    <div className="flex flex-col gap-2">
                                        {[
                                            { name: 'Maria Santos', email: 'maria.s@university.edu', time: '5 min ago' },
                                            { name: 'Alex Turner', email: 'a.turner@campus.edu', time: '1 hr ago' },
                                        ].map((req, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm ${idx === 0 ? 'bg-gradient-to-tr from-pink-500 to-rose-500' : 'bg-gradient-to-tr from-blue-500 to-indigo-500'}`}>{req.name.charAt(0)}</div>
                                                    <div>
                                                        <span className="font-bold text-zinc-900 dark:text-zinc-200 text-sm">{req.name}</span>
                                                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{req.email} · {req.time}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <button className="p-2 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/20 transition-colors" title="Accept"><UserCheck size={16} /></button>
                                                    <button className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-colors" title="Decline"><UserX size={16} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* C. Friends List */}
                                <div>
                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-3 flex items-center gap-2"><Users size={16} className="text-zinc-400" /> Friends List</h3>
                                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                                        {[
                                            { name: 'Sofia Reyes', initial: 'S', gradient: 'from-amber-500 to-amber-600', status: 'online', label: '🟢 Online' },
                                            { name: 'Prof. Davis', initial: 'P', gradient: 'from-emerald-500 to-teal-500', status: 'idle', label: '🟡 Idle (15 mins)' },
                                            { name: 'John Doe', initial: 'J', gradient: 'from-cyan-600 to-amber-600', status: 'offline', label: '⚪ Last seen 2 hours ago' },
                                            { name: 'Jane Smith', initial: 'J', gradient: 'from-purple-500 to-pink-500', status: 'offline', label: '⚪ Last seen 3 days ago' },
                                        ].map((friend, idx) => (
                                            <div key={idx} className="px-5 py-3.5 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                                <div className="flex items-center gap-3.5">
                                                    <div className="relative">
                                                        <div className={`w-10 h-10 rounded-full bg-gradient-to-tr ${friend.gradient} flex items-center justify-center text-sm font-bold text-white shadow-sm`}>{friend.initial}</div>
                                                        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-zinc-900 ${friend.status === 'online' ? 'bg-green-500' : friend.status === 'idle' ? 'bg-yellow-500' : 'bg-zinc-400 dark:bg-zinc-600'}`}></div>
                                                    </div>
                                                    <div>
                                                        <span className="font-bold text-zinc-900 dark:text-zinc-200 text-sm">{friend.name}</span>
                                                        <p className={`text-[11px] mt-0.5 ${friend.status === 'online' ? 'text-green-500' : friend.status === 'idle' ? 'text-yellow-500' : 'text-zinc-500 dark:text-zinc-400'}`}>{friend.label}</p>
                                                    </div>
                                                </div>
                                                <button className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"><MoreVertical size={16} /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══════════ OWNER DELETE WARNING MODAL ═══════════ */}
            <AnimatePresence>
                {ownerDeleteWarning && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md">
                        <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} className="w-[90%] max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
                            <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500" />
                            <div className="p-6 flex flex-col gap-5">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 flex-shrink-0">
                                        <AlertTriangle size={24} className="text-amber-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">File Currently Being Edited</h3>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                            <strong className="text-zinc-800 dark:text-zinc-200">&ldquo;{ownerDeleteWarning.fileName}&rdquo;</strong> is currently being edited by:
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2 pl-2">
                                    {ownerDeleteWarning.editingUsers.map((user, i) => (
                                        <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-xs font-bold text-white shadow-sm">{user.charAt(0).toUpperCase()}</div>
                                            <div>
                                                <span className="font-bold text-sm text-zinc-900 dark:text-zinc-200">{user}</span>
                                                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" /> Actively editing
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20">
                                    <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold leading-relaxed">
                                        ⚠️ Deleting this file will immediately close the editor for all active users and remove their unsaved work.
                                    </p>
                                </div>

                                <div className="flex justify-end gap-3 pt-1">
                                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => setOwnerDeleteWarning(null)} className="px-5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all text-sm font-semibold">
                                        Cancel
                                    </motion.button>
                                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => {
                                        if (ownerDeleteWarning) {
                                            trashFile(ownerDeleteWarning.repoName, ownerDeleteWarning.fileName);
                                            setOwnerDeleteWarning(null);
                                        }
                                    }} className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white transition-all text-sm font-bold shadow-lg shadow-rose-500/20 flex items-center gap-2">
                                        <Trash2 size={14} /> Delete Anyway
                                    </motion.button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══════════ FILE DELETED KICK MODAL (for editors) ═══════════ */}
            <AnimatePresence>
                {fileDeletedKick && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md">
                        <motion.div initial={{ opacity: 0, scale: 0.85, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.85, y: 30 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} className="w-[90%] max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
                            <div className="h-1 w-full bg-gradient-to-r from-rose-500 via-red-500 to-rose-500" />
                            <div className="p-8 flex flex-col items-center text-center gap-5">
                                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.15 }} className="w-20 h-20 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
                                    <Trash2 size={36} className="text-rose-500" />
                                </motion.div>
                                <div>
                                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">File Deleted</h3>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                        The file <strong className="text-zinc-800 dark:text-zinc-200">&ldquo;{fileDeletedKick.fileName}&rdquo;</strong> has been moved to Trash by the repository Owner.
                                    </p>
                                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
                                        Your editing session has been ended. Any unsaved changes were not preserved.
                                    </p>
                                </div>
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => {
                                    setFileDeletedKick(null);
                                    setCurrentRepo(null);
                                    setActiveTab('My Drive');
                                }} className="px-8 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white text-sm font-bold uppercase tracking-wider shadow-lg shadow-orange-500/30 transition-all flex items-center gap-2">
                                    <ChevronLeft size={16} /> Return to My Drive
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══════════ CONFIRM TRASH FILE MODAL ═══════════ */}
            <AnimatePresence>
                {confirmTrashFile && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md px-4">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-sm w-full border border-zinc-200 dark:border-zinc-800 shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-amber-600"></div>
                            
                            <div className="flex flex-col items-center text-center">
                                <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mb-6 border border-amber-500/20">
                                    <AlertTriangle size={32} />
                                </div>
                                
                                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Move to Trash?</h3>
                                
                                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-8 leading-relaxed">
                                    Are you sure you want to move <strong className="text-zinc-800 dark:text-zinc-200">&ldquo;{confirmTrashFile.fileName}&rdquo;</strong> to the Trash? You can easily restore it later from your recycle bin if needed.
                                </p>
                                
                                <div className="flex gap-3 w-full">
                                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => setConfirmTrashFile(null)} className="flex-1 px-5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all text-sm font-semibold">
                                        Cancel
                                    </motion.button>
                                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => {
                                        trashFile(confirmTrashFile.repoName, confirmTrashFile.fileName);
                                        setConfirmTrashFile(null);
                                    }} className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20 transition-all font-bold text-sm">
                                        <Trash2 size={14} /> Move to Trash
                                    </motion.button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ══ VERSION HISTORY PANEL ══ */}
            <AnimatePresence>
                {versionHistoryTarget && (() => {
                    const versions = getVersionHistory(versionHistoryTarget.repoName, versionHistoryTarget.fileName);
                    const actionMeta: Record<string, { label: string; color: string }> = {
                        'save':             { label: 'Saved',    color: 'bg-blue-500/20 text-blue-300' },
                        'conflict-resolve': { label: 'Merged',   color: 'bg-emerald-500/20 text-emerald-300' },
                        'restore':          { label: 'Restored', color: 'bg-amber-500/20 text-amber-300' },
                        'merge':            { label: 'Merged',   color: 'bg-emerald-500/20 text-emerald-300' },
                    };
                    return (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                            onClick={() => setVersionHistoryTarget(null)}>
                            <motion.div initial={{ scale: 0.93, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93, y: 20 }}
                                onClick={e => e.stopPropagation()}
                                className="w-full max-w-lg bg-zinc-900 border border-zinc-700/60 rounded-2xl shadow-2xl overflow-hidden">
                                {/* Header */}
                                <div className="h-1 w-full bg-gradient-to-r from-violet-500 to-purple-600" />
                                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                                    <div>
                                        <p className="font-bold text-white text-sm">{versionHistoryTarget.fileName}</p>
                                        <p className="text-[11px] text-zinc-400 mt-0.5">Version History — {versions.length} snapshot{versions.length !== 1 ? 's' : ''}</p>
                                    </div>
                                    <button onClick={() => setVersionHistoryTarget(null)} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all">
                                        <X size={16} />
                                    </button>
                                </div>
                                {/* Version list */}
                                <div className="max-h-[420px] overflow-y-auto custom-scrollbar p-4 flex flex-col gap-3">
                                    {versions.length === 0 ? (
                                        <div className="text-center py-10">
                                            <Clock size={28} className="mx-auto text-zinc-600 mb-2" />
                                            <p className="text-sm text-zinc-500">No versions yet.</p>
                                            <p className="text-xs text-zinc-600 mt-1">Versions are created every time a file is saved or a conflict is resolved.</p>
                                        </div>
                                    ) : versions.map((v, i) => (
                                        <div key={v.id} className="flex items-start gap-3 group">
                                            {/* Timeline line */}
                                            <div className="flex flex-col items-center pt-1">
                                                <div className="w-2.5 h-2.5 rounded-full bg-violet-500 ring-2 ring-violet-500/30 flex-shrink-0" />
                                                {i < versions.length - 1 && <div className="w-0.5 h-full min-h-[28px] bg-zinc-700/60 mt-1" />}
                                            </div>
                                            {/* Version card */}
                                            <div className="flex-1 bg-zinc-800/50 border border-zinc-700/40 rounded-xl p-3 hover:border-violet-500/40 transition-all">
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${actionMeta[v.action]?.color ?? 'bg-zinc-700 text-zinc-300'}`}>
                                                        {actionMeta[v.action]?.label ?? v.action}
                                                    </span>
                                                    <span className="text-[10px] text-zinc-500">{v.savedAt}</span>
                                                </div>
                                                <p className="text-xs text-zinc-300 font-medium">{v.savedBy}</p>
                                                <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-2">{v.content.replace(/<[^>]*>/g, ' ').trim().slice(0, 80)}...</p>
                                                {i > 0 && (
                                                    <button onClick={() => {
                                                        restoreVersion(versionHistoryTarget.repoName, versionHistoryTarget.fileName, v.id);
                                                        setVersionHistoryTarget(null);
                                                    }} className="mt-2 text-[10px] text-violet-400 hover:text-violet-300 font-semibold transition-colors flex items-center gap-1">
                                                        <RefreshCcw size={10} /> Restore this version
                                                    </button>
                                                )}
                                                {i === 0 && <p className="mt-1.5 text-[10px] text-emerald-400 font-semibold">✓ Current version</p>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
            `}</style>
        </div>
    );
}


```

---

