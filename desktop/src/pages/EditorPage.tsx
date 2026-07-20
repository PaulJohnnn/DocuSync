/**
 * @module EditorPage
 * TipTap rich-text document editor — route `/editor/:id`.
 * Full redesign: back button + filename, formatting toolbar, white editor, footer metrics.
 * Includes real-time collaborative cursor presence (Google Docs-style).
 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useElectronSync } from '@/context/ElectronSyncContext';
import {
  IconArrowLeft, IconBold, IconItalic, IconStrikethrough,
  IconH1, IconH2, IconList, IconQuote, IconCode, IconRefresh, IconHistory,
} from '@/components/Icons';
import { formatBytes, basename } from '@docusync/shared/utils/formatters';
import { notify } from '@docusync/shared/utils/notifications';
import SyncService from '@/services/SyncService';

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface RemoteCursor {
  nodeId: string;
  displayName: string;
  color: string;
  from: number;
  to: number;
}

const RemoteCursorsExtension = Extension.create({
  name: 'remoteCursors',
  addOptions() {
    return { cursors: [] as RemoteCursor[] };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('remoteCursors'),
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, oldState) => {
            const cursors = this.options.cursors;
            const decorations: Decoration[] = [];
            const docSize = tr.doc.nodeSize;

            cursors.forEach((c: RemoteCursor) => {
              const from = Math.max(0, Math.min(c.from, docSize - 2));
              const to = Math.max(0, Math.min(c.to, docSize - 2));

              if (from === to) {
                const cursorElement = document.createElement('span');
                cursorElement.classList.add('collaboration-cursor__caret');
                cursorElement.style.borderLeftColor = c.color;

                const labelElement = document.createElement('div');
                labelElement.classList.add('collaboration-cursor__label');
                labelElement.style.backgroundColor = c.color;
                labelElement.textContent = c.displayName;
                cursorElement.appendChild(labelElement);

                decorations.push(Decoration.widget(from, cursorElement, { side: 1 }));
              } else {
                decorations.push(
                  Decoration.inline(Math.min(from, to), Math.max(from, to), {
                    class: 'collaboration-cursor__selection',
                    style: `background-color: ${c.color}33`,
                  })
                );
              }
            });
            return DecorationSet.create(tr.doc, decorations);
          },
        },
        props: {
          decorations(state) { return this.getState(state); },
        },
      }),
    ];
  },
});

// ── Matchmaker URL (Vercel in production, localhost in dev) ──────────────────
// The env var VITE_MATCHMAKER is set in .env.local / Vercel env settings.
// Falls back to the live Vercel deployment so desktop dev still works.
const MATCHMAKER = (typeof import.meta !== 'undefined' && import.meta.env.DEV)
  ? 'http://localhost:3000/api/lobby'
  : 'https://docusync-pnc.vercel.app/api/lobby';

// ── Types ───────────────────────────────────────────────────────────────────

interface FileOpenData {
  fileId: number;
  filePath: string;
  content: string;
  contentLength: number;
  extension: string;
  vectorClock?: any;
}

interface FileSaveData {
  fileId: number;
  bytesSaved: number;
  deltaSize: number;
  peersNotified: number;
  vectorClock: Record<string, unknown>;
}


// ── ToolbarButton ───────────────────────────────────────────────────────────

const ToolbarBtn: React.FC<{
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ active, onClick, title, children }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      background: active ? 'rgba(79,125,248,0.15)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text-secondary)',
      border: active ? '1px solid rgba(79,125,248,0.25)' : '1px solid transparent',
      borderRadius: 6,
      height: 28,
      padding: '0 7px',
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    {children}
  </button>
);

// ── EditorPage ──────────────────────────────────────────────────────────────

const EditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileId = useMemo(() => { const n = parseInt(id ?? '', 10); return Number.isFinite(n) ? n : null; }, [id]);
  const { currentRoom, connectedPeers, matchmakerPeerCount, vectorClock, pendingConflicts, localNodeId } = useElectronSync();

  const [filePath, setFilePath] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastDeltaSize, setLastDeltaSize] = useState<number | null>(null);
  const [peersNotified, setPeersNotified] = useState(0);
  const [conflictBannerDismissed, setConflictBannerDismissed] = useState(false);
  const [incomingBanner, setIncomingBanner] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef<boolean>(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevConflictCount = useRef(pendingConflicts);
  // lastSyncedAt tracks which remote version we've already applied (LWW guard)
  const lastSyncedAt = useRef<number>(0);
  const myNodeId = localNodeId || `anon-${Math.random().toString(36).slice(2, 8)}`;
  const roomOtp = currentRoom?.id;

  // ── Remote Cursors ─────────────────────────────────────────────────────────
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor & { lastUpdate: number }>>({});
  const cursorThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!window.docuSync?.onCursorUpdate) return;
    const unsub = window.docuSync.onCursorUpdate((msg: any) => {
      if (msg.fileId !== fileId) return;
      const color = msg.nodeIndex === 0 ? '#3b82f6' : msg.nodeIndex === 1 ? '#10b981' : '#f59e0b';
      const displayName = msg.nodeIndex === 0 ? 'Desktop' : msg.nodeIndex === 1 ? 'Web' : 'Mobile';
      setRemoteCursors(prev => ({
        ...prev,
        [msg.nodeId]: {
          nodeId: msg.nodeId,
          displayName,
          color,
          from: msg.position,
          to: msg.position,
          lastUpdate: Date.now()
        }
      }));
    });
    return unsub;
  }, [fileId]);

  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
      setRemoteCursors(prev => {
        const next = { ...prev };
        let changed = false;
        for (const [id, c] of Object.entries(next)) {
          if (now - c.lastUpdate > 5000) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // ── TipTap ────────────────────────────────────────────────────────────────

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing… (auto-saves every 500 ms)' }),
      RemoteCursorsExtension.configure({ cursors: Object.values(remoteCursors) }),
    ],
    content: '',
    editorProps: { attributes: { class: 'ProseMirror', 'data-testid': 'tiptap-editor' } },
  });

  // ── Live remote delta listener ────────────────────────────────────────────
  // The main process fires 'evt:file-updated' (via onDeltaApplied) the instant
  // a peer's edit is merged. We apply it to the TipTap editor immediately so
  // collaborators see changes in real time instead of waiting for the 4s poll.
  useEffect(() => {
    if (!window.docuSync?.onFileUpdated) return;
    const unsub = window.docuSync.onFileUpdated((updatedFileId: number, newContent: string) => {
      if (updatedFileId !== fileId) return;
      if (isTypingRef.current) return; // Don't stomp on local typing
      if (!editor) return;
      const { from } = editor.state.selection;
      editor.commands.setContent(newContent, { emitUpdate: false });
      const maxPos = editor.state.doc.content.size;
      editor.commands.setTextSelection(Math.min(from, maxPos - 1));
      setIncomingBanner('↓ Remote edit received');
      setTimeout(() => setIncomingBanner(null), 4000);
    });
    return unsub;
  }, [fileId, editor]);

  useEffect(() => {
    if (pendingConflicts > prevConflictCount.current) setConflictBannerDismissed(false);
    prevConflictCount.current = pendingConflicts;
  }, [pendingConflicts]);



  // Re-configure cursors when remoteCursors changes
  useEffect(() => {
    if (editor) {
      const ext = editor.extensionManager.extensions.find(e => e.name === 'remoteCursors');
      if (ext) {
        ext.options.cursors = Object.values(remoteCursors);
        editor.view.dispatch(editor.state.tr.setMeta('remoteCursorsUpdate', true));
      }
    }
  }, [remoteCursors, editor]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const performSaveRef = useRef<((html: string, explicit?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => {
      isTypingRef.current = true;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        isTypingRef.current = false;
      }, 2000);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (performSaveRef.current) performSaveRef.current(editor.getHTML(), false);
      }, 500);
    };

    const handleSelectionUpdate = () => {
      if (cursorThrottleRef.current || !window.docuSync?.pushCursor) return;
      cursorThrottleRef.current = setTimeout(() => { cursorThrottleRef.current = null; }, 200);
      const { from } = editor.state.selection;
      window.docuSync.pushCursor({
        type: 'CURSOR_UPDATE',
        nodeId: myNodeId,
        nodeIndex: 0,
        fileId: String(fileId),
        position: from,
        timestamp: new Date().toISOString()
      });
    };

    editor.on('update', handleUpdate);
    editor.on('selectionUpdate', handleSelectionUpdate);
    return () => { 
      editor.off('update', handleUpdate); 
      editor.off('selectionUpdate', handleSelectionUpdate);
    };
  }, [editor, fileId, myNodeId]);

  // ── Real-time presence (dummy cursors for now) ────────────────────────────
  // Every 3 seconds, ask the matchmaker for the latest committed version.
  // If the remote version is newer than what we last applied (LWW), apply it.
  useEffect(() => {
    if (!fileId || !window.docuSync) return;
    const pollDoc = async () => {
      try {
        const res = await window.docuSync.openFile(fileId);
        if (!res.success || !res.data) return;
        const data = res.data as FileOpenData;
        const snap = {
          content: data.content,
          seq: data.vectorClock?.root?.children?.[0]?.counter || 0,
        };
        // Skip applying remote updates if actively typing
        if (isTypingRef.current) return;
        
        // This is a simplified check since we are using IPC. We rely on the local SQLite DB having the latest merged state.
        if (editor && snap.content && snap.content !== editor.getHTML()) {
            const { from } = editor.state.selection;
            editor.commands.setContent(snap.content, { emitUpdate: false });
            const maxPos = editor.state.doc.content.size;
            editor.commands.setTextSelection(Math.min(from, maxPos - 1));
            setIncomingBanner(`↓ Synced from local replica`);
            setTimeout(() => setIncomingBanner(null), 4000);
        }
      } catch { /* offline mode */ }
    };
    pollDoc();
    const iv = setInterval(pollDoc, 4000);
    return () => clearInterval(iv);
  }, [roomOtp, fileId, editor]);


  // ── File load ─────────────────────────────────────────────────────────────

  const loadFile = useCallback(async () => {
    if (fileId === null) { setLoadError('Invalid file ID.'); setLoading(false); return; }
    
      const mockMap: Record<number, { path: string; content: string }> = {
        101: { 
          path: 'C:/Users/Paul John Palamara/Documents/ProjectProposal.docx', 
          content: '<h2>📄 Word Document (.docx)</h2><p><strong>Use Case:</strong> Formal reports, essays, proposals, and structured business documents.</p><p><strong>DocuSync Behavior:</strong> This file represents a rich-text document. DocuSync extracts the raw text and formatting (like <strong>bold</strong>, <em>italics</em>, and headers) and allows real-time collaborative editing using Delta Encoding.</p><blockquote>"A successful thesis proposal requires clear architecture and robust synchronization logic."</blockquote>' 
        },
        102: { 
          path: 'C:/Users/Paul John Palamara/Documents/Notes.md', 
          content: '<h2>📝 Markdown File (.md)</h2><p><strong>Use Case:</strong> Developer documentation, README files, quick meeting notes, and knowledge base articles.</p><p><strong>DocuSync Behavior:</strong> Markdown is natively supported. It remains lightweight and is perfectly suited for DocuSync\'s CRDT (Conflict-Free Replicated Data Type) engine for high-speed P2P syncing.</p><ul><li>Supports lists</li><li>Supports code blocks</li><li>Extremely fast delta resolution</li></ul>' 
        },
        103: { 
          path: 'C:/Users/Paul John Palamara/Downloads/Data_Export.csv', 
          content: '<h2>📊 Comma-Separated Values (.csv)</h2><p><strong>Use Case:</strong> Tabular data exports, database backups, and spreadsheet data (Excel/Google Sheets).</p><p><strong>DocuSync Behavior:</strong> Since CSV is pure UTF-8 text, DocuSync can safely synchronize row changes. Each line represents a data record.</p><pre><code>id,first_name,last_name,role,sync_status\n1,Paul John,Palamara,Admin,Synced\n2,John,Doe,User,Pending\n3,Jane,Smith,Editor,Conflict</code></pre>' 
        },
        104: { 
          path: 'C:/Users/Paul John Palamara/Projects/DocuSync/package.json', 
          content: '<h2>⚙️ JSON Configuration (.json)</h2><p><strong>Use Case:</strong> Application configuration, API payloads, and dependency management (like NPM).</p><p><strong>DocuSync Behavior:</strong> DocuSync handles structured data effortlessly. You can safely co-edit JSON files without breaking the syntax thanks to precise line-level delta tracking.</p><pre><code>{\n  "name": "docusync-core",\n  "version": "1.0.0",\n  "description": "Hybrid P2P Synchronization Engine",\n  "author": "Palamara, Paul John G.",\n  "license": "MIT"\n}</code></pre>' 
        },
        105: { 
          path: 'C:/Users/Paul John Palamara/Projects/DocuSync/index.tsx', 
          content: '<h2>💻 React Source Code (.tsx)</h2><p><strong>Use Case:</strong> Frontend application logic, UI components, and TypeScript codebases.</p><p><strong>DocuSync Behavior:</strong> Perfect for pair-programming! DocuSync syncs code changes instantly across peers. It treats source code as a continuous stream of text, preventing merge conflicts during active development.</p><pre><code>import React from "react";\nimport { useElectronSync } from "@/context/ElectronSyncContext";\n\nexport default function App() {\n  const { syncStatus } = useElectronSync();\n  return (\n    &lt;div className="app"&gt;\n      &lt;h1&gt;DocuSync is running&lt;/h1&gt;\n      &lt;p&gt;Status: {syncStatus}&lt;/p&gt;\n    &lt;/div&gt;\n  );\n}</code></pre>' 
        },
        106: { 
          path: 'C:/Users/Paul John Palamara/Pictures/Architecture.png', 
          content: '<h2>🖼️ Image File (.png) — Rejected Format</h2><p><strong>Use Case:</strong> Graphics, architecture diagrams, photographs, and UI mockups.</p><p><strong>DocuSync Behavior:</strong> ❌ <em>Delta Encoding Not Applicable</em>. Because this is a compiled binary file rather than plain text, mathematical delta algorithms cannot accurately splice changes. Opening binary files will result in read-only mode or rejection by the engine.</p>' 
        },
        107: { 
          path: 'C:/Users/Paul John Palamara/Downloads/Archive.zip', 
          content: '<h2>📦 Compressed Archive (.zip) — Rejected Format</h2><p><strong>Use Case:</strong> Zipped folders, compressed backups, and packaged executables.</p><p><strong>DocuSync Behavior:</strong> ❌ <em>Delta Encoding Not Applicable</em>. This is a highly compressed binary blob. Attempting to sync byte-level changes in a ZIP file would corrupt the archive. DocuSync actively blocks binary formats to protect data integrity.</p>' 
        },
      };
      
      const mock = mockMap[fileId];
      if (mock) {
        setFilePath(mock.path);
        if (editor) editor.commands.setContent(mock.content);
        setLoading(false);
        return;
      }
    // ------------------------------

    if (!window.docuSync) { setLoadError('IPC bridge not available.'); setLoading(false); return; }
    setLoading(true); setLoadError(null);
    try {
      const res = await window.docuSync.openFile(fileId);
      if (!res.success || !res.data) throw new Error(res.error ?? 'No data.');
      const data = res.data as FileOpenData;
      setFilePath(data.filePath);
      if (editor && data.content) editor.commands.setContent(data.content);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [fileId, editor]);

  useEffect(() => { loadFile(); }, [fileId]);

  // ── Ctrl+S ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (editor) performSave(editor.getHTML(), true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editor]);

  // ── Save ──────────────────────────────────────────────────────────────────

  const performSave = useCallback(async (html: string, explicit = false) => {
    setSaving(true);
    try {
      let savedDeltaSize = 0;
      let savedPeersNotified = 0;

      // ── Step 1: Save to local SQLite via IPC (Desktop only) ──────────────
      if (fileId !== null && window.docuSync) {
        console.log(`[Desktop Test] Editing on Desktop. Local vector clock:`, JSON.stringify(vectorClock));
        const res = await window.docuSync.saveFile(fileId, html, vectorClock);
        if (!res.success) {
           if (res.error?.includes('escalated') || (res.data as any)?.escalated) {
              setSaving(false);
              notify.error('Conflict detected! Resolving in arbiter...');
              return;
           }
           throw new Error(res.error ?? 'Save error.');
        }
        const data = res.data as FileSaveData;
        savedDeltaSize = data.deltaSize ?? data.bytesSaved;
        savedPeersNotified = data.peersNotified ?? 0;
        setLastDeltaSize(savedDeltaSize);
        setPeersNotified(savedPeersNotified);
      }

      if (explicit) notify.saved(savedDeltaSize, savedPeersNotified);
    } catch (err) {
      if (explicit) notify.error(`Check-In failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setSaving(false); }
  }, [fileId, roomOtp, myNodeId, vectorClock]);

  useEffect(() => {
    performSaveRef.current = performSave;
  }, [performSave]);

  const handleExplicitSave = useCallback(async () => { if (editor) await performSave(editor.getHTML(), true); }, [editor, performSave]);

  // ── Sync ──────────────────────────────────────────────────────────────────

  const handleSyncNow = useCallback(async () => {
    if (editor) await performSave(editor.getHTML(), true);
  }, [editor, performSave]);

  const handleDeleteGroup = useCallback(async () => {
    if (window.confirm("WARNING: This will permanently terminate the active session and disconnect all users. Are you sure?")) {
      try {
        await SyncService.terminateSession();
        notify.success('Session terminated.');
        navigate('/');
      } catch {
        notify.error('Failed to terminate session.');
      }
    }
  }, [navigate]);

  // ── Clock display ─────────────────────────────────────────────────────────

  const clockDisplay = useMemo((): string => {
    if (!vectorClock) return '—';
    const raw = vectorClock as Record<string, unknown>;
    if (Array.isArray(raw.counters)) return `[${(raw.counters as number[]).join(', ')}]`;
    const s = JSON.stringify(vectorClock);
    return s.length > 60 ? s.slice(0, 57) + '…' : s;
  }, [vectorClock]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Topbar — sub navigation bar for editor */}
      <div style={{
        height: 46, background: 'var(--bg-sidebar)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: 10, flexShrink: 0,
      }}>
        <button className="ds-btn ds-btn-ghost" onClick={() => navigate('/')} style={{ height: 30, padding: '0 10px', fontSize: 12 }}>
          <IconArrowLeft size={13} /> Room
        </button>
        <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {filePath ? basename(filePath) : `File #${fileId}`}
            {saving && <span style={{ color: 'var(--amber)', fontSize: 11, fontWeight: 400, marginLeft: 8 }}>checking in…</span>}
          </div>
          {filePath && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {filePath}
            </div>
          )}
        </div>
        
        {currentRoom?.isHost && (
          <button
            onClick={handleDeleteGroup}
            style={{
              height: 28,
              padding: '0 12px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--bg-app)',
              background: 'var(--red)',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              marginLeft: 'auto'
            }}
          >
            Admin: Delete Group & End Session
          </button>
        )}
        
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="ds-btn ds-btn-ghost" onClick={() => navigate(`/history/${fileId}`)} style={{ height: 30, padding: '0 10px', fontSize: 12 }}>
            <IconHistory size={13} /> History
          </button>
          <button className="ds-btn ds-btn-primary" onClick={handleSyncNow} disabled={syncing} style={{ height: 30, padding: '0 12px', fontSize: 12 }}>
            <span className={syncing ? 'ds-spin' : ''} style={{ display: 'inline-flex' }}><IconRefresh size={13} /></span>
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Incoming sync banner — shown when a remote peer's Check-In is applied */}
      {incomingBanner && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 16px',
          background: 'rgba(34,197,94,0.12)',
          borderBottom: '1px solid rgba(34,197,94,0.25)',
          flexShrink: 0,
          fontSize: 12,
          fontWeight: 600,
          color: '#16a34a',
        }}>
          <span>🔄</span>
          <span>{incomingBanner}</span>
        </div>
      )}

      {/* Conflict banner */}
      {pendingConflicts > 0 && !conflictBannerDismissed && (
        <div className="ds-banner ds-banner-amber" style={{ margin: '0', borderRadius: 0, flexShrink: 0 }}>
          <span>⚠️</span>
          <span style={{ flex: 1, fontSize: '0.8rem' }}>
            {pendingConflicts} conflict{pendingConflicts !== 1 ? 's' : ''} detected — resolve before continuing.
          </span>
          <button className="ds-btn ds-btn-amber" onClick={() => navigate('/conflicts')} style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}>
            Review →
          </button>
          <button onClick={() => setConflictBannerDismissed(true)} style={{ background: 'transparent', border: 'none', color: 'var(--ds-text3)', cursor: 'pointer', fontSize: '1rem' }}>×</button>
        </div>
      )}

      {/* Load error */}
      {loadError && (
        <div className="ds-banner ds-banner-red" style={{ margin: '0', borderRadius: 0, flexShrink: 0 }}>
          <span>⛔</span>
          <span style={{ flex: 1 }}>Failed to load: {loadError}</span>
          <button className="ds-btn ds-btn-ghost" onClick={loadFile} style={{ fontSize: '0.72rem' }}>Retry</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ds-text3)' }}>
          <span className="ds-pulse">⏳</span>&nbsp;Loading…
        </div>
      )}

      {/* Editor */}
      {!loading && !loadError && editor && (
        <>
          {/* Formatting toolbar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            padding: '6px 16px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-sidebar)',
            flexShrink: 0, flexWrap: 'wrap',
          }}>
            <ToolbarBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold"><IconBold size={14} /></ToolbarBtn>
            <ToolbarBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic"><IconItalic size={14} /></ToolbarBtn>
            <ToolbarBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strike"><IconStrikethrough size={14} /></ToolbarBtn>
            <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 6px' }} />
            <ToolbarBtn active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="H1"><IconH1 size={14} /></ToolbarBtn>
            <ToolbarBtn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="H2"><IconH2 size={14} /></ToolbarBtn>
            <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 6px' }} />
            <ToolbarBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullets"><IconList size={14} /></ToolbarBtn>
            <ToolbarBtn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote"><IconQuote size={14} /></ToolbarBtn>
            <ToolbarBtn active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code"><IconCode size={14} /></ToolbarBtn>
            <div style={{ marginLeft: 'auto' }}>
              <button
                className="ds-btn ds-btn-primary"
                onClick={handleExplicitSave}
                disabled={saving}
                style={{ height: 30, fontSize: 12, padding: '0 14px' }}
              >
                {saving ? '↻ Checking In…' : '💾 Check-In'}
              </button>
            </div>
          </div>

          {/* Editor sheet — white with shadow + remote cursor overlays */}
          <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-base)', padding: '24px' }}>
            <div style={{ position: 'relative', background: '#fff', maxWidth: 760, margin: '0 auto', borderRadius: 12, boxShadow: '0 2px 20px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
              <EditorContent editor={editor} style={{ minHeight: 480 }} />
            </div>
          </div>
        </>
      )}

      {/* Footer metrics bar */}
      {!loading && !loadError && (
        <div style={{
          height: 28,
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-sidebar)',
          display: 'flex', alignItems: 'center',
          padding: '0 20px', gap: 20,
          flexShrink: 0, overflow: 'hidden',
        }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }} title="Vector clock">
            vc {clockDisplay}
          </span>
          {lastDeltaSize !== null && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Δ {formatBytes(lastDeltaSize)}</span>
          )}
          <span style={{ fontSize: 10, color: peersNotified > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
            {peersNotified > 0 ? `✓ ${peersNotified} notified` : `${Math.max(connectedPeers.length, matchmakerPeerCount - 1)} peers`}
          </span>
          <span style={{
            marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)',
            fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {filePath || `file #${fileId}`}
          </span>
        </div>
      )}
    </div>
  );
};

export default EditorPage;
