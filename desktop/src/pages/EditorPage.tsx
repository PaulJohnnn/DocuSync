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
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { useElectronSync } from '@/context/ElectronSyncContext';
import {
  IconArrowLeft, IconBold, IconItalic, IconStrikethrough,
  IconH1, IconH2, IconList, IconQuote, IconCode, IconRefresh, IconHistory,
} from '@/components/Icons';
import { formatBytes, basename } from '@docusync/shared/utils/formatters';
import { notify } from '@docusync/shared/utils/notifications';
import SyncService from '@/services/SyncService';

// ── Cursor Presence Config ───────────────────────────────────────────────────

const MATCHMAKER = 'http://localhost:3000/api/lobby';

/** 8 distinct peer cursor colours */
const CURSOR_COLORS = [
  '#e05252', '#e07e52', '#d4b84a', '#52aa5e',
  '#4a90d9', '#7c52e0', '#d452b8', '#52c9d4',
];

function colorForNode(nodeId: string): string {
  let hash = 0;
  for (let i = 0; i < nodeId.length; i++) hash = (hash * 31 + nodeId.charCodeAt(i)) | 0;
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

interface RemoteCursor {
  nodeId: string;
  displayName: string;
  color: string;
  from: number;
  to: number;
}

const RemoteCursorsExtension = Extension.create({
  name: 'remoteCursors',
  addOptions() {
    return {
      cursors: [] as RemoteCursor[],
    };
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

                decorations.push(
                  Decoration.widget(from, cursorElement, { side: 1 })
                );
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
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

// ── Types ───────────────────────────────────────────────────────────────────

interface FileOpenData {
  fileId: number;
  filePath: string;
  content: string;
  contentLength: number;
  extension: string;
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
  const { currentRoom, connectedPeers, vectorClock, pendingConflicts, localNodeId } = useElectronSync();

  const [filePath, setFilePath] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastDeltaSize, setLastDeltaSize] = useState<number | null>(null);
  const [peersNotified, setPeersNotified] = useState(0);
  const [conflictBannerDismissed, setConflictBannerDismissed] = useState(false);
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorBroadcastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevConflictCount = useRef(pendingConflicts);
  const myNodeId = localNodeId || `anon-${Math.random().toString(36).slice(2, 8)}`;
  const myColor = colorForNode(myNodeId);
  const roomOtp = currentRoom?.id;

  useEffect(() => {
    if (pendingConflicts > prevConflictCount.current) setConflictBannerDismissed(false);
    prevConflictCount.current = pendingConflicts;
  }, [pendingConflicts]);

  // ── TipTap ────────────────────────────────────────────────────────────────

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing… (auto-saves every 500 ms)' }),
      RemoteCursorsExtension.configure({ cursors: [] }),
    ],
    content: '',
    editorProps: { attributes: { class: 'ProseMirror', 'data-testid': 'tiptap-editor' } },
    onUpdate: ({ editor: e }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => { performSave(e.getHTML()); }, 500);
    },
    onSelectionUpdate: ({ editor: e }) => {
      // Broadcast cursor position to matchmaker whenever selection changes
      if (!roomOtp || !fileId) return;
      const { from, to } = e.state.selection;
      if (cursorBroadcastRef.current) clearTimeout(cursorBroadcastRef.current);
      cursorBroadcastRef.current = setTimeout(() => {
        fetch(`${MATCHMAKER}/cursors`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            otp: roomOtp,
            nodeId: myNodeId,
            displayName: myNodeId.slice(0, 8),
            color: myColor,
            from,
            to,
            fileId,
          }),
        }).catch(() => {});
      }, 100);
    },
  });

  // Cleanup debounce and cursor broadcast on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (cursorBroadcastRef.current) clearTimeout(cursorBroadcastRef.current);
    };
  }, []);

  // ── Poll remote cursors ───────────────────────────────────────────────────

  useEffect(() => {
    if (!roomOtp || !fileId) return;
    const poll = async () => {
      try {
        const res = await fetch(`${MATCHMAKER}/cursors?otp=${roomOtp}&nodeId=${encodeURIComponent(myNodeId)}&fileId=${fileId}`);
        if (!res.ok) return;
        const data = await res.json();
        setRemoteCursors(data.cursors || []);
        
        // Update TipTap RemoteCursorsExtension
        if (editor) {
          const ext = editor.extensionManager.extensions.find(e => e.name === 'remoteCursors');
          if (ext) {
            ext.options.cursors = data.cursors || [];
            editor.view.dispatch(editor.state.tr.setMeta('remoteCursorsUpdate', true));
          }
        }
      } catch { /* matchmaker not running */ }
    };
    poll();
    const iv = setInterval(poll, 1000);
    return () => clearInterval(iv);
  }, [roomOtp, fileId, myNodeId, editor]);

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
    if (fileId === null || !window.docuSync) return;
    setSaving(true);
    try {
      const res = await window.docuSync.saveFile(fileId, html);
      if (!res.success) throw new Error(res.error ?? 'Save error.');
      const data = res.data as FileSaveData;
      setLastDeltaSize(data.deltaSize ?? data.bytesSaved);
      setPeersNotified(data.peersNotified ?? 0);
      if (explicit) notify.saved(data.deltaSize ?? 0, data.peersNotified ?? 0);
    } catch (err) {
      if (explicit) notify.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setSaving(false); }
  }, [fileId]);

  const handleExplicitSave = useCallback(async () => { if (editor) await performSave(editor.getHTML(), true); }, [editor, performSave]);

  // ── Sync ──────────────────────────────────────────────────────────────────

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await SyncService.trigger();
      notify.success('Sync triggered');
    } catch (err) { notify.error(`Sync error: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setSyncing(false); }
  }, []);

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
          <IconArrowLeft size={13} /> Files
        </button>
        <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {filePath ? basename(filePath) : `File #${fileId}`}
            {saving && <span style={{ color: 'var(--amber)', fontSize: 11, fontWeight: 400, marginLeft: 8 }}>saving…</span>}
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
          {/* Active users bar — shown when in a room with remote peers */}
          {remoteCursors.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 16px',
              background: 'rgba(79,125,248,0.06)',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>Also editing:</span>
              {remoteCursors.map(c => (
                <span
                  key={c.nodeId}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: `${c.color}22`,
                    border: `1px solid ${c.color}66`,
                    borderRadius: 99,
                    padding: '1px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: c.color,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, display: 'inline-block' }} />
                  {c.displayName}
                </span>
              ))}
            </div>
          )}

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
                {saving ? '↻ Saving…' : '💾 Save'}
              </button>
            </div>
          </div>

          {/* Editor sheet — white with shadow + remote cursor overlays */}
          <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-base)', padding: '24px' }}>
            <div style={{ position: 'relative', background: '#fff', maxWidth: 760, margin: '0 auto', borderRadius: 12, boxShadow: '0 2px 20px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
              <EditorContent editor={editor} style={{ minHeight: 480 }} />

              {/* Remote cursor carets — rendered as thin lines with labels */}
              {remoteCursors.map(cursor => {
                // Find the DOM position of the cursor using ProseMirror's coordsAtPos
                try {
                  const coords = editor.view.coordsAtPos(Math.min(cursor.from, editor.state.doc.content.size));
                  const editorDom = editor.view.dom.getBoundingClientRect();
                  const left = coords.left - editorDom.left;
                  const top = coords.top - editorDom.top;
                  return (
                    <div
                      key={cursor.nodeId}
                      style={{
                        position: 'absolute',
                        left: Math.max(0, left),
                        top: Math.max(0, top),
                        pointerEvents: 'none',
                        zIndex: 10,
                      }}
                    >
                      {/* The blinking caret line */}
                      <div style={{
                        width: 2,
                        height: 20,
                        background: cursor.color,
                        borderRadius: 1,
                        animation: 'ds-cursor-blink 1.1s ease-in-out infinite',
                      }} />
                      {/* The name label above the caret */}
                      <div style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: 0,
                        background: cursor.color,
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: '3px 3px 3px 0',
                        whiteSpace: 'nowrap',
                        marginBottom: 1,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        letterSpacing: '0.02em',
                      }}>
                        {cursor.displayName}
                      </div>
                    </div>
                  );
                } catch {
                  return null;
                }
              })}
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
            {peersNotified > 0 ? `✓ ${peersNotified} notified` : `${connectedPeers.length} peers`}
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
