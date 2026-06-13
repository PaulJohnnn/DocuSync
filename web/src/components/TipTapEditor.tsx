'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { useEffect, useRef } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, List, ListOrdered, Quote, Code,
  AlignLeft, AlignCenter, AlignRight, Highlighter
} from 'lucide-react';

interface Props {
  content: string;
  onChange: (content: string) => void;
}

export default function TipTapEditor({ content, onChange }: Props) {
  const initialized = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight,
      Underline,
      Placeholder.configure({ placeholder: 'Start typing your document...' }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: content || '<p></p>',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'tiptap',
      },
    },
  });

  useEffect(() => {
    if (editor && !initialized.current && content) {
      editor.commands.setContent(content);
      initialized.current = true;
    }
  }, [editor, content]);

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
