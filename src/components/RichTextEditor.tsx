"use client";

import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';

// ── Helper: toolbar button ──────────────────────────────────────────────────
const ToolbarBtn = ({
    onClick,
    isActive,
    title,
    children,
}: {
    onClick: () => void;
    isActive?: boolean;
    title: string;
    children: React.ReactNode;
}) => (
    <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); onClick(); }}
        title={title}
        className={`
            w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-all
            ${isActive
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30'
                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white'
            }
        `}
    >
        {children}
    </button>
);

// ── Divider ─────────────────────────────────────────────────────────────────
const Divider = () => <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />;

// ── Props ────────────────────────────────────────────────────────────────────
interface RichTextEditorProps {
    content: string;   // Initial HTML or plain text content
    onChange: (html: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function RichTextEditor({ content, onChange }: RichTextEditorProps) {
    // Convert plain text to basic HTML paragraphs if needed
    const initialContent = content.startsWith('<')
        ? content
        : content.split('\n').map(line =>
            line.trim() ? `<p>${line}</p>` : '<p></p>'
        ).join('');

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
            }),
            Underline,
            Highlight.configure({ multicolor: false }),
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
        ],
        content: initialContent,
        editorProps: {
            attributes: {
                class: 'focus:outline-none',
                spellCheck: 'false',
            },
        },
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        immediatelyRender: false,
    });

    if (!editor) return null;

    return (
        <div className="flex flex-col h-full border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
            {/* ── Toolbar ── */}
            <div className="flex items-center flex-wrap gap-1 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 shrink-0">

                {/* Text style */}
                <ToolbarBtn
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    isActive={editor.isActive('bold')}
                    title="Bold (Ctrl+B)"
                >
                    <strong>B</strong>
                </ToolbarBtn>
                <ToolbarBtn
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    isActive={editor.isActive('italic')}
                    title="Italic (Ctrl+I)"
                >
                    <em>I</em>
                </ToolbarBtn>
                <ToolbarBtn
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    isActive={editor.isActive('underline')}
                    title="Underline (Ctrl+U)"
                >
                    <span className="underline">U</span>
                </ToolbarBtn>
                <ToolbarBtn
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    isActive={editor.isActive('strike')}
                    title="Strikethrough"
                >
                    <span className="line-through text-xs">S</span>
                </ToolbarBtn>
                <ToolbarBtn
                    onClick={() => editor.chain().focus().toggleHighlight().run()}
                    isActive={editor.isActive('highlight')}
                    title="Highlight"
                >
                    <span className="bg-yellow-300 text-zinc-900 px-0.5 rounded text-[11px] font-semibold">H</span>
                </ToolbarBtn>

                <Divider />

                {/* Headings */}
                <ToolbarBtn
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    isActive={editor.isActive('heading', { level: 1 })}
                    title="Heading 1"
                >
                    <span className="text-xs font-black">H1</span>
                </ToolbarBtn>
                <ToolbarBtn
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    isActive={editor.isActive('heading', { level: 2 })}
                    title="Heading 2"
                >
                    <span className="text-xs font-black">H2</span>
                </ToolbarBtn>

                <Divider />

                {/* Lists */}
                <ToolbarBtn
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    isActive={editor.isActive('bulletList')}
                    title="Bullet List"
                >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <circle cx="2.5" cy="4.5" r="1.5"/><rect x="6" y="3.5" width="9" height="2" rx="1"/>
                        <circle cx="2.5" cy="8" r="1.5"/><rect x="6" y="7" width="9" height="2" rx="1"/>
                        <circle cx="2.5" cy="11.5" r="1.5"/><rect x="6" y="10.5" width="9" height="2" rx="1"/>
                    </svg>
                </ToolbarBtn>
                <ToolbarBtn
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    isActive={editor.isActive('orderedList')}
                    title="Numbered List"
                >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <text x="0" y="5.5" fontSize="5" fontWeight="bold">1.</text>
                        <rect x="6" y="3.5" width="9" height="2" rx="1"/>
                        <text x="0" y="9.5" fontSize="5" fontWeight="bold">2.</text>
                        <rect x="6" y="7" width="9" height="2" rx="1"/>
                        <text x="0" y="13.5" fontSize="5" fontWeight="bold">3.</text>
                        <rect x="6" y="10.5" width="9" height="2" rx="1"/>
                    </svg>
                </ToolbarBtn>
                <ToolbarBtn
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    isActive={editor.isActive('blockquote')}
                    title="Blockquote"
                >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <rect x="1" y="2" width="3" height="12" rx="1.5"/>
                        <rect x="6" y="4" width="9" height="1.5" rx="0.75"/>
                        <rect x="6" y="7" width="7" height="1.5" rx="0.75"/>
                        <rect x="6" y="10" width="8" height="1.5" rx="0.75"/>
                    </svg>
                </ToolbarBtn>

                <Divider />

                {/* Alignment */}
                <ToolbarBtn
                    onClick={() => editor.chain().focus().setTextAlign('left').run()}
                    isActive={editor.isActive({ textAlign: 'left' })}
                    title="Align Left"
                >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <rect x="1" y="3" width="14" height="1.5" rx="0.75"/>
                        <rect x="1" y="7" width="9" height="1.5" rx="0.75"/>
                        <rect x="1" y="11" width="12" height="1.5" rx="0.75"/>
                    </svg>
                </ToolbarBtn>
                <ToolbarBtn
                    onClick={() => editor.chain().focus().setTextAlign('center').run()}
                    isActive={editor.isActive({ textAlign: 'center' })}
                    title="Align Center"
                >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <rect x="1" y="3" width="14" height="1.5" rx="0.75"/>
                        <rect x="3.5" y="7" width="9" height="1.5" rx="0.75"/>
                        <rect x="2" y="11" width="12" height="1.5" rx="0.75"/>
                    </svg>
                </ToolbarBtn>

                <Divider />

                {/* Undo / Redo */}
                <ToolbarBtn
                    onClick={() => editor.chain().focus().undo().run()}
                    isActive={false}
                    title="Undo (Ctrl+Z)"
                >
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 7.5C2 4.462 4.462 2 7.5 2a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5"/>
                        <path d="M2 4.5v3h3"/>
                    </svg>
                </ToolbarBtn>
                <ToolbarBtn
                    onClick={() => editor.chain().focus().redo().run()}
                    isActive={false}
                    title="Redo (Ctrl+Y)"
                >
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13 7.5C13 4.462 10.538 2 7.5 2A5.5 5.5 0 0 0 2 7.5 5.5 5.5 0 0 0 7.5 13"/>
                        <path d="M13 4.5v3h-3"/>
                    </svg>
                </ToolbarBtn>
            </div>

            {/* ── Document / Paper area ── */}
            <div className="flex-1 overflow-y-auto bg-zinc-200 dark:bg-zinc-700 p-6" style={{ minHeight: '380px' }}>
                {/* Paper sheet */}
                <div className="mx-auto bg-white shadow-xl rounded-sm" style={{ maxWidth: '680px', minHeight: '420px', boxShadow: '0 4px 24px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.10)' }}>
                    <EditorContent editor={editor} />
                </div>
            </div>
        </div>
    );
}
