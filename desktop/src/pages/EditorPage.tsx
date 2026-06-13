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
      background: active ? 'var(--ds-accent-bg)' : 'transparent',
      color: active ? 'var(--ds-accent)' : 'var(--ds-text2)',
      border: active ? '1px solid var(--ds-accent-border)' : '1px solid transparent',
      borderRadius: 'var(--ds-radius-sm)',
      padding: '4px 7px',
      cursor: 'pointer',
      transition: 'all var(--ds-transition)',
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
      {/* Topbar */}
      <div className="ds-topbar">
        <button className="ds-btn ds-btn-ghost" onClick={() => navigate('/')} style={{ gap: '0.3rem' }}>
          <IconArrowLeft size={14} /> Files
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="ds-topbar-title">
            {filePath ? basename(filePath) : `File #${fileId}`}
          </span>
          {saving && <span style={{ color: 'var(--ds-amber)', fontSize: '0.72rem', marginLeft: '0.5rem' }}>saving…</span>}
          {filePath && (
            <div style={{ fontSize: '0.65rem', color: 'var(--ds-text3)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {filePath}
            </div>
          )}
        </div>
        <div className="ds-topbar-actions">
          <button className="ds-btn ds-btn-ghost" onClick={() => navigate(`/history/${fileId}`)}><IconHistory size={14} /> History</button>
          <button className="ds-btn ds-btn-primary" onClick={handleSyncNow} disabled={syncing}>
            <span className={syncing ? 'ds-spin' : ''} style={{ display: 'inline-flex' }}><IconRefresh size={14} /></span>
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
            display: 'flex', alignItems: 'center', gap: '2px',
            padding: '0.4rem 0.75rem', borderBottom: '1px solid var(--ds-border)',
            background: 'var(--ds-bg2)', flexShrink: 0, flexWrap: 'wrap',
          }}>
            <ToolbarBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold"><IconBold size={14} /></ToolbarBtn>
            <ToolbarBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic"><IconItalic size={14} /></ToolbarBtn>
            <ToolbarBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strike"><IconStrikethrough size={14} /></ToolbarBtn>
            <div style={{ width: 1, height: 16, background: 'var(--ds-border)', margin: '0 4px' }} />
            <ToolbarBtn active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="H1"><IconH1 size={14} /></ToolbarBtn>
            <ToolbarBtn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="H2"><IconH2 size={14} /></ToolbarBtn>
            <div style={{ width: 1, height: 16, background: 'var(--ds-border)', margin: '0 4px' }} />
            <ToolbarBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullets"><IconList size={14} /></ToolbarBtn>
            <ToolbarBtn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote"><IconQuote size={14} /></ToolbarBtn>
            <ToolbarBtn active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code"><IconCode size={14} /></ToolbarBtn>
            <div style={{ marginLeft: 'auto' }}>
              <button className="ds-btn ds-btn-primary" onClick={handleExplicitSave} disabled={saving} style={{ fontSize: '0.72rem', padding: '0.25rem 0.65rem' }}>
                {saving ? '↻ Saving…' : '💾 Save'}
              </button>
            </div>
          </div>

          {/* Editor content — white area */}
          <div style={{ flex: 1, overflow: 'auto', background: '#fff' }}>
            <EditorContent editor={editor} style={{ minHeight: '100%' }} />
          </div>
        </>
      )}

      {/* Footer metrics bar (28px) */}
      {!loading && !loadError && (
        <div style={{
          height: 28, borderTop: '1px solid var(--ds-border)',
          background: 'var(--ds-bg2)', display: 'flex', alignItems: 'center',
          padding: '0 1rem', gap: '1.25rem', flexShrink: 0, overflow: 'hidden',
        }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--ds-text3)', fontFamily: 'monospace' }} title="Vector clock">
            vc {clockDisplay}
          </span>
          {lastDeltaSize !== null && (
            <span style={{ fontSize: '0.65rem', color: 'var(--ds-text3)' }}>Δ {formatBytes(lastDeltaSize)}</span>
          )}
          <span style={{ fontSize: '0.65rem', color: peersNotified > 0 ? 'var(--ds-green)' : 'var(--ds-text3)' }}>
            {peersNotified > 0 ? `✓ ${peersNotified} notified` : `${connectedPeers.length} peers`}
          </span>
          <span style={{
            marginLeft: 'auto', fontSize: '0.6rem', color: 'var(--ds-text3)',
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
