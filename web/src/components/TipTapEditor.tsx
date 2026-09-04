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
          apply: (tr, _oldState) => {
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

interface Props {
  content: string;
  onChange: (content: string) => void;
  cursors?: RemoteCursor[];
  onSelectionUpdate?: (from: number, to: number) => void;
  onUndo?: (discardedContent: string) => void;
}

export default function TipTapEditor({ content, onChange, cursors = [], onSelectionUpdate, onUndo }: Props) {
  const initialized = useRef(false);
  const [pasteError, setPasteError] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight,
      Underline,
      Placeholder.configure({ placeholder: 'Start typing your document...' }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      RemoteCursorsExtension.configure({ cursors: [] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: content || '<p></p>',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
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
      editor.commands.setTextSelection({ from, to });
    }
  }, [editor, content]);

  useEffect(() => {
    if (editor) {
      const ext = editor.extensionManager.extensions.find(e => e.name === 'remoteCursors');
      if (ext) {
        ext.options.cursors = cursors;
        editor.view.dispatch(editor.state.tr.setMeta('remoteCursorsUpdate', true));
      }
    }
  }, [editor, cursors]);

  if (!editor) return null;

  const ToolBtn = ({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) => (
    <button onClick={onClick} style={{
      background: active ? 'var(--acb)' : 'transparent',
      border: active ? '1px solid var(--acbr)' : '1px solid transparent',
      borderRadius: 6, padding: '5px 7px', cursor: 'pointer',
      color: active ? 'var(--acc)' : 'var(--t3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.15s',
    }}>
      {children}
    </button>
  );

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
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
