'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { useEffect, useRef, useState } from 'react';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, List, ListOrdered, Quote, Code,
  AlignLeft, AlignCenter, AlignRight, Highlighter, File
} from 'lucide-react';

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
          apply: (tr, oldDecorationSet) => {
            // `this.options` on a Tiptap Extension is a computed getter that
            // merges configure()-time defaults, not a stable mutable object —
            // assigning `ext.options.cursors = ...` from outside silently
            // never persists (reads back as the original default on the
            // very next access). Passing the live cursor list through the
            // transaction's own meta is the reliable way to get fresh data
            // into a ProseMirror plugin's `apply`.
            const meta = tr.getMeta('remoteCursorsUpdate');
            if (!meta) {
              // No new cursor data on this transaction (e.g. the user just
              // typed) — keep showing the existing decorations, remapped
              // onto the new document positions.
              return oldDecorationSet.map(tr.mapping, tr.doc);
            }
            const cursors: RemoteCursor[] = meta;
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

const PaginationPluginKey = new PluginKey('pagination');

interface PaginationState {
  pushes: number[];
  decorations: DecorationSet;
}

/**
 * Applies the measured page-break offsets as ProseMirror node decorations.
 *
 * These used to be written straight onto the DOM (`el.style.marginTop`), but
 * ProseMirror owns that subtree: its DOM observer treats an outside mutation
 * as corruption and re-renders the node, which reverted every offset within
 * a frame or two (measured: ~10 node replacements a second, styles never
 * surviving). The offsets silently never applied, so text flowed straight
 * through the grey gap between page sheets instead of breaking onto the next
 * page. Going through decorations makes ProseMirror itself the one applying
 * the style, so it stops fighting us.
 */
const PaginationExtension = Extension.create({
  name: 'pagination',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: PaginationPluginKey,
        state: {
          init: (): PaginationState => ({ pushes: [], decorations: DecorationSet.empty }),
          apply: (tr, value: PaginationState, _oldState, newState): PaginationState => {
            const meta = tr.getMeta(PaginationPluginKey);
            const pushes: number[] = meta ? meta.pushes : value.pushes;

            // Rebuild against the current doc every time — block positions
            // shift on every edit, so a mapped-forward DecorationSet would
            // drift out of alignment with the blocks it's spacing.
            const decorations: Decoration[] = [];
            let i = 0;
            newState.doc.forEach((node, offset) => {
              const push = pushes[i];
              if (push && push > 0.5) {
                decorations.push(
                  Decoration.node(offset, offset + node.nodeSize, {
                    style: `margin-top:${push}px`,
                  })
                );
              }
              i += 1;
            });

            return { pushes, decorations: DecorationSet.create(newState.doc, decorations) };
          },
        },
        props: {
          decorations(state) {
            return PaginationPluginKey.getState(state)?.decorations;
          },
        },
      }),
    ];
  },
});

interface Props {
  content: string;
  onChange: (content: string) => void;
  cursors?: RemoteCursor[];
  onSelectionUpdate?: (from: number, to: number) => void;
  onUndo?: (discardedContent: string) => void;
  margin: string;
  onMarginChange: (m: string) => void;
  onHistoryRequest?: () => void;
}

const ToolBtn = ({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) => (
  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} style={{
    background: active ? 'var(--acb)' : 'transparent',
    border: active ? '1px solid var(--acbr)' : '1px solid transparent',
    borderRadius: 6, padding: '5px 7px', cursor: 'pointer',
    color: active ? 'var(--acc)' : 'var(--t1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s',
  }}>
    {children}
  </button>
);

export default function TipTapEditor({ content, onChange, cursors = [], onSelectionUpdate, onUndo, margin, onMarginChange, onHistoryRequest }: Props) {
  const initialized = useRef(false);
  const [pasteError, setPasteError] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
  const [pageCount, setPageCount] = useState(1);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight,
      Underline,
      Placeholder.configure({ placeholder: 'Start writing, or wait for teammates to join this room.' }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      RemoteCursorsExtension.configure({ cursors: [] }),
      PaginationExtension,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: content || '<p></p>',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      // TELEMETRY INTERCEPT: Bump ops for Dashboard matrix visualization
      const currentOps = parseInt(localStorage.getItem('web_telemetry_ops') || '0');
      localStorage.setItem('web_telemetry_ops', (currentOps + 1).toString());
    },
    onSelectionUpdate: ({ editor }) => {
      if (onSelectionUpdate) {
        const { from, to } = editor.state.selection;
        onSelectionUpdate(from, to);
      }
    },
    editorProps: {
      attributes: {
        class: 'tiptap',
      },
      handleDrop: (view, event, _slice, _moved) => {
        const items = event.dataTransfer?.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image/') === 0) {
              setPasteError(true);
              return true;
            }
          }
        }
        return false;
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image/') === 0) {
              setPasteError(true);
              return true; // prevent TipTap from processing it
            }
          }
        }
        return false;
      },
      handleKeyDown: (view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
          if (onUndo) {
            onUndo(view.dom.innerHTML);
          }
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (!editor || !content) return;
    
    if (!initialized.current) {
      editor.commands.setContent(content, { emitUpdate: false });
      initialized.current = true;
      return;
    }

    if (content !== editor.getHTML()) {
      const { from, to } = editor.state.selection;
      editor.commands.setContent(content, { emitUpdate: false });
      const newDocSize = editor.state.doc.content.size;
      const safeFrom = Math.min(from, newDocSize > 0 ? newDocSize - 1 : 0);
      const safeTo = Math.min(to, newDocSize > 0 ? newDocSize - 1 : 0);
      editor.commands.setTextSelection({ from: safeFrom, to: safeTo });
    }
  }, [editor, content]);

  useEffect(() => {
    if (editor) {
      // Pass the cursor list itself as the transaction meta payload (see
      // the plugin's `apply` above for why — `ext.options` mutation
      // doesn't work here).
      editor.view.dispatch(editor.state.tr.setMeta('remoteCursorsUpdate', cursors));
    }
  }, [editor, cursors]);

  useEffect(() => {
    if (!editor) return;
    let animFrame: number;

    const adjustPages = () => {
      const pm = editor.view.dom as HTMLElement;
      if (pm && pm.isConnected) {
        const PAGE_HEIGHT = 1123;
        const GAP_HEIGHT = 48; // Physical grey gap between pages
        const MARGIN = parseInt(margin) || 96;
        const USABLE = PAGE_HEIGHT - MARGIN * 2;
        const PAGE_STRIDE = PAGE_HEIGHT + GAP_HEIGHT;

        const applied: number[] = PaginationPluginKey.getState(editor.state)?.pushes ?? [];
        const blocks = Array.from(pm.children).filter(
          (el) => !el.classList.contains('collaboration-cursor__caret')
        ) as HTMLElement[];

        // Track which page we're filling and how much of its usable height
        // is already consumed. Unlike a "does this block straddle a raw
        // boundary" check, this catches every block that lands on a new
        // page — including ones that fit entirely within a page's height
        // but whose page index has already advanced because of blocks
        // before them.
        const next: number[] = [];
        let pageIndex = 0;
        let pageUsed = 0;
        let changed = blocks.length !== applied.length;

        blocks.forEach((el, i) => {
          const alreadyPushed = applied[i] || 0;
          const h = el.offsetHeight; // unaffected by margin-top
          const naturalTop = el.offsetTop - alreadyPushed;
          // Every block's margin-top is reset to 0 in globals.css, so the
          // only real gap before the NEXT block is this element's own
          // margin-bottom — a static CSS value, unaffected by whatever
          // push is currently applied to any element. Summing offsetHeight
          // alone (the previous approach) ignored this gap entirely, which
          // silently let ~1-2 extra blocks' worth of content pile onto a
          // page before the overflow check ever tripped.
          const gapBelow = parseFloat(getComputedStyle(el).marginBottom) || 0;

          // Doesn't fit in what's left of the current page → start a new one.
          if (pageUsed > 0 && pageUsed + h > USABLE) {
            pageIndex += 1;
            pageUsed = 0;
          }

          // offsetTop is measured from ProseMirror's own content box, which
          // .ds-paginated-editor-layer has already inset by one top margin.
          // So a page's content origin is just its stride multiple — adding
          // MARGIN here as well double-counted that padding and pushed every
          // block a full margin too far down.
          const target = pageIndex * PAGE_STRIDE + pageUsed;
          const push = Math.max(0, target - naturalTop);

          next.push(push);
          if (Math.abs(push - alreadyPushed) > 0.5) changed = true;

          pageUsed += h + gapBelow;
        });

        // Only dispatch when something actually moved, otherwise this would
        // loop forever re-rendering the editor every animation frame.
        if (changed) {
          editor.view.dispatch(
            editor.state.tr.setMeta(PaginationPluginKey, { pushes: next })
          );
        }

        setPageCount(Math.max(1, pageIndex + 1));
      }
      animFrame = requestAnimationFrame(adjustPages);
    };

    animFrame = requestAnimationFrame(adjustPages);
    return () => cancelAnimationFrame(animFrame);
  }, [editor, margin]);

  if (!editor) return null;

  return (
    <div>
      {/* Unsupported Media Modal */}
      {pasteError && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            background: 'var(--bg)', border: '1px solid var(--b1)', borderRadius: 16,
            padding: '40px 56px', display: 'flex', flexDirection: 'column', alignItems: 'center',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)', width: 480, maxWidth: '90%',
            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: 16, borderRadius: '50%', marginBottom: 16 }}>
              <File style={{ color: '#ef4444' }} size={32} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--t1)', textAlign: 'center' }}>Unsupported Media</h2>
            <p style={{ color: 'var(--t2)', fontSize: 14, marginTop: 12, marginBottom: 20, textAlign: 'center', lineHeight: 1.6 }}>
              Pasting images or binary objects directly into the editor is not supported.<br/><br/>
              DocuSync&apos;s real-time engine only synchronizes text and document structures to ensure maximum performance across peers.
            </p>
            <button className="ds-btn ds-btn-primary" style={{ width: '100%', justifyContent: 'center', height: 44, fontSize: 14 }} onClick={() => setPasteError(false)}>
              Understood
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        padding: '6px 12px', borderBottom: '1px solid var(--b1)',
        background: 'var(--bg2)', flexWrap: 'wrap',
      }}>
        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')}><Bold size={14} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')}><Italic size={14} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')}><UnderlineIcon size={14} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')}><Strikethrough size={14} /></ToolBtn>
        <div style={{ width: 1, height: 20, background: 'var(--b1)', margin: '0 4px' }} />
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })}><Heading1 size={14} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}><Heading2 size={14} /></ToolBtn>
        <div style={{ width: 1, height: 20, background: 'var(--b1)', margin: '0 4px' }} />
        <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')}><List size={14} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')}><ListOrdered size={14} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')}><Quote size={14} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')}><Code size={14} /></ToolBtn>
        <div style={{ width: 1, height: 20, background: 'var(--b1)', margin: '0 4px' }} />
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })}><AlignLeft size={14} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })}><AlignCenter size={14} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })}><AlignRight size={14} /></ToolBtn>
        <div style={{ width: 1, height: 20, background: 'var(--b1)', margin: '0 4px' }} />
        <ToolBtn onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')}><Highlighter size={14} /></ToolBtn>
        <div style={{ width: 1, height: 20, background: 'var(--b1)', margin: '0 4px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--t2)', fontWeight: 500 }}>Margin:</span>
          <select 
            value={margin} 
            onChange={(e) => onMarginChange(e.target.value)}
            style={{ background: 'var(--bg)', border: '1px solid var(--b1)', color: 'var(--t1)', borderRadius: 4, padding: '4px 8px', fontSize: 12, outline: 'none', cursor: 'pointer' }}
          >
            <option value="48">Narrow (48px)</option>
            <option value="96">Normal (96px)</option>
            <option value="144">Wide (144px)</option>
          </select>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        /* Remove internal TipTap margin as we control virtual margins programatically via the wrapper layout */
      `}} />
      <div className="ds-editor-canvas" style={{ position: 'relative', width: 794, margin: '0 auto' }}>

        {/* Render True Physical A4 Background Pages — desktop-only affordance, hidden on mobile where the canvas goes fluid */}
        <div className="ds-editor-canvas-bg" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: 48, zIndex: 0 }}>
          {Array.from({ length: pageCount }).map((_, i) => (
            <div key={i} className="ds-editor-page-sheet" style={{
              width: 794, height: 1123, background: '#ffffff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
              flexShrink: 0, borderRadius: 2
            }} />
          ))}
        </div>

        {/* Editor Layer overlay mapping text flawlessly onto the pages */}
        <div 
          className="ds-paginated-editor-layer"
          onContextMenu={(e) => {
            if (!onHistoryRequest) return;
            const selection = window.getSelection();
            if (selection && selection.toString().trim().length > 0) {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY });
            }
          }}
          style={{ position: 'relative', zIndex: 1, paddingLeft: parseInt(margin), paddingRight: parseInt(margin), paddingTop: parseInt(margin), paddingBottom: parseInt(margin) }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>

      {contextMenu && (
        <div style={{
          position: 'fixed', top: contextMenu.y, left: contextMenu.x,
          background: 'var(--bg)', border: '1px solid var(--b1)', borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 10000, padding: 4
        }}>
          <button className="ds-btn ds-btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', fontSize: 13 }} onClick={() => {
            onHistoryRequest?.();
            setContextMenu(null);
          }}>
            <File size={14} style={{ marginRight: 6 }} /> View edit history for this selection
          </button>
        </div>
      )}
    </div>
  );
}
