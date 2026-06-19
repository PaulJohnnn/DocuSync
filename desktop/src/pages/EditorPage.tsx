/**
 * @module EditorPage
 * TipTap rich-text document editor — route `/editor/:id`.
 * Full redesign: back button + filename, formatting toolbar, white editor, footer metrics.
 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { toast } from 'sonner';
import { useElectronSync } from '@/context/ElectronSyncContext';
import {
  IconArrowLeft, IconBold, IconItalic, IconStrikethrough,
  IconH1, IconH2, IconList, IconQuote, IconCode, IconRefresh, IconHistory,
} from '@/components/Icons';

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

// ── Helpers ─────────────────────────────────────────────────────────────────

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p;
}

function formatBytes(b: number): string {
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
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
  const { connectedPeers, vectorClock, pendingConflicts } = useElectronSync();

  const [filePath, setFilePath] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastDeltaSize, setLastDeltaSize] = useState<number | null>(null);
  const [peersNotified, setPeersNotified] = useState(0);
  const [conflictBannerDismissed, setConflictBannerDismissed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevConflictCount = useRef(pendingConflicts);

  useEffect(() => {
    if (pendingConflicts > prevConflictCount.current) setConflictBannerDismissed(false);
    prevConflictCount.current = pendingConflicts;
  }, [pendingConflicts]);

  // ── TipTap ────────────────────────────────────────────────────────────────

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing… (auto-saves every 500 ms)' }),
    ],
    content: '',
    editorProps: { attributes: { class: 'ProseMirror', 'data-testid': 'tiptap-editor' } },
    onUpdate: ({ editor: e }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => { performSave(e.getHTML()); }, 500);
    },
  });

  useEffect(() => { return () => { if (debounceRef.current) clearTimeout(debounceRef.current); }; }, []);

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
      if (explicit) toast.success('Saved & synced', { description: `Δ ${formatBytes(data.deltaSize ?? 0)}`, duration: 2500 });
    } catch (err) {
      if (explicit) toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setSaving(false); }
  }, [fileId]);

  const handleExplicitSave = useCallback(async () => { if (editor) await performSave(editor.getHTML(), true); }, [editor, performSave]);

  // ── Sync ──────────────────────────────────────────────────────────────────

  const handleSyncNow = useCallback(async () => {
    if (!window.docuSync) return;
    setSyncing(true);
    try {
      const res = await window.docuSync.triggerSync();
      if (res.success) toast.success('Sync triggered'); else toast.error(`Sync failed: ${res.error}`);
    } catch (err) { toast.error(`Sync error: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setSyncing(false); }
  }, []);

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

          {/* Editor sheet — white with shadow */}
          <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-base)', padding: '24px' }}>
            <div style={{
              background: '#fff',
              maxWidth: 760,
              margin: '0 auto',
              borderRadius: 12,
              boxShadow: '0 2px 20px rgba(0,0,0,0.4)',
              overflow: 'hidden',
            }}>
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
