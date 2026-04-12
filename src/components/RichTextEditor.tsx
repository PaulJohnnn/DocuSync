"use client";

import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

const PAUL_CONTENT = `<h2>Introduction</h2><p>Hi I'm Paul... I'm on Cabuyao City... I'm on section CS 402, nice to meet you all groupmates.</p><p>This document is part of our collaborative thesis project, managed through DocuSync. Please feel free to add your sections below.</p>`;
const CURSOR_COLORS = ['#f97316', '#8b5cf6', '#06b6d4', '#10b981', '#ef4444', '#f59e0b'];
const pickColor = (name: string) => CURSOR_COLORS[name.charCodeAt(0) % CURSOR_COLORS.length];

// ── Toolbar primitives ────────────────────────────────────────────────────────
const RibbonBtn = ({ onClick, isActive, title, children, disabled }: {
    onClick: () => void; isActive?: boolean; title: string;
    children: React.ReactNode; disabled?: boolean;
}) => (
    <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); if (!disabled) onClick(); }}
        title={title}
        disabled={disabled}
        className={`
            min-w-[28px] h-[26px] px-1.5 flex items-center justify-center rounded text-[13px] font-medium transition-all select-none
            ${isActive
                ? 'bg-blue-600 text-white shadow-sm'
                : disabled
                    ? 'text-zinc-300 cursor-not-allowed'
                    : 'text-zinc-700 hover:bg-zinc-200 active:bg-zinc-300'
            }
        `}
    >
        {children}
    </button>
);

const Sep = () => <div className="w-px h-6 bg-zinc-300 mx-1 flex-shrink-0" />;

// ── Props ────────────────────────────────────────────────────────────────────
interface RichTextEditorProps {
    fileName: string;
    userName: string;
    onChange: (html: string) => void;
    initialContent?: string;
    isOffline?: boolean;
}

// ── Main component ───────────────────────────────────────────────────────────
export default function RichTextEditor(props: RichTextEditorProps) {
    const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
    const [provider, setProvider] = useState<WebrtcProvider | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const doc = new Y.Doc();
        setYdoc(doc);
        const prov = new WebrtcProvider(`docusync-file-${props.fileName}`, doc, {
            signaling: ['wss://signaling.yjs.dev'],
        });
        setProvider(prov);
        return () => { prov.destroy(); doc.destroy(); };
    }, [props.fileName]);

    if (!ydoc || !provider) {
        return (
            <div className="flex items-center justify-center h-full min-h-[400px] bg-zinc-100">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm font-medium text-zinc-500">Loading editor…</p>
                </div>
            </div>
        );
    }

    return <InnerEditor ydoc={ydoc} provider={provider} {...props} />;
}

function InnerEditor({ ydoc, provider, fileName, userName, onChange, initialContent, isOffline }: { ydoc: Y.Doc; provider: WebrtcProvider } & RichTextEditorProps) {
    const [users, setUsers] = useState<any[]>([]);
    const [zoom, setZoom] = useState(100);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
            Underline,
            Highlight.configure({ multicolor: false }),
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Collaboration.configure({ document: ydoc }),
            CollaborationCursor.configure({
                provider,
                user: { name: userName || 'User', color: pickColor(userName || 'User') },
            }),
        ],
        editorProps: {
            attributes: {
                class: 'word-paper focus:outline-none',
                spellCheck: 'true',
            },
        },
        onUpdate: ({ editor }) => onChange(editor.getHTML()),
        immediatelyRender: false,
    });

    useEffect(() => {
        if (!editor || !provider) return;
        const t = setTimeout(() => {
            if (editor.isEmpty) editor.commands.setContent(initialContent || PAUL_CONTENT);
        }, 200);
        return () => clearTimeout(t);
    }, [editor, provider, initialContent]);

    useEffect(() => {
        if (!provider) return;
        const update = () => {
            const arr: any[] = [];
            provider.awareness.getStates().forEach((s: any) => { if (s.user) arr.push(s.user); });
            setUsers(arr);
        };
        provider.awareness.on('change', update);
        update();
        return () => provider.awareness.off('change', update);
    }, [provider]);

    if (!editor) return null;

    const fontSize = editor.getAttributes('textStyle').fontSize || '12pt';

    return (
        <div className="flex flex-col h-full overflow-hidden" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
            {/* ── Ribbon Toolbar ─────────────────────────────────────────── */}
            <div className="flex-shrink-0 bg-[#f3f3f3] border-b border-zinc-300 shadow-sm">
                {/* Top bar — file name area */}
                <div className="flex items-center px-3 py-1 border-b border-zinc-300 bg-white gap-3">
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${isOffline ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-green-100 border-green-300 text-green-700'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full inline-block ${isOffline ? 'bg-amber-500' : 'bg-green-500 animate-pulse'}`} />
                        {isOffline ? 'LOCAL OFFLINE MODE' : 'CRDT Live'} · {fileName}
                    </div>
                    <div className="flex-1" />
                    {/* Collaborator avatars */}
                    <div className="flex items-center -space-x-1.5">
                        {users.map((u, i) => (
                            <div
                                key={i}
                                className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-white shadow-sm hover:scale-110 transition-transform cursor-help"
                                style={{ backgroundColor: u.color || '#3b82f6' }}
                                title={u.name}
                            >
                                {u.name.charAt(0).toUpperCase()}
                            </div>
                        ))}
                    </div>
                    {/* Zoom control */}
                    <div className="flex items-center gap-1 text-xs text-zinc-600">
                        <button onMouseDown={() => setZoom(z => Math.max(50, z - 10))} className="w-5 h-5 rounded hover:bg-zinc-200 flex items-center justify-center font-bold transition-colors">−</button>
                        <span className="w-10 text-center font-medium">{zoom}%</span>
                        <button onMouseDown={() => setZoom(z => Math.min(200, z + 10))} className="w-5 h-5 rounded hover:bg-zinc-200 flex items-center justify-center font-bold transition-colors">+</button>
                    </div>
                </div>

                {/* Ribbon buttons row */}
                <div className="flex items-center flex-wrap gap-0.5 px-2 py-1.5">

                    {/* Undo / Redo */}
                    <RibbonBtn onClick={() => editor.chain().focus().undo().run()} isActive={false} title="Undo (Ctrl+Z)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M3 13A9 9 0 1 0 5.7 5.7"/></svg>
                    </RibbonBtn>
                    <RibbonBtn onClick={() => editor.chain().focus().redo().run()} isActive={false} title="Redo (Ctrl+Y)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M21 13A9 9 0 1 1 18.3 5.7"/></svg>
                    </RibbonBtn>

                    <Sep />

                    {/* Font family (static label — full font picker would require FontFamily extension) */}
                    <div className="flex items-center h-[26px] px-2 border border-zinc-300 rounded bg-white text-xs text-zinc-700 cursor-default select-none min-w-[110px] gap-1">
                        <span className="flex-1 truncate">Times New Roman</span>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M5 7L1 3h8z"/></svg>
                    </div>

                    {/* Font size (static label) */}
                    <div className="flex items-center h-[26px] px-2 border border-zinc-300 rounded bg-white text-xs text-zinc-700 cursor-default select-none w-[44px] gap-1">
                        <span className="flex-1 text-center">12</span>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M5 7L1 3h8z"/></svg>
                    </div>

                    <Sep />

                    {/* Bold / Italic / Underline / Strike */}
                    <RibbonBtn onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Bold (Ctrl+B)">
                        <strong className="text-[14px]">B</strong>
                    </RibbonBtn>
                    <RibbonBtn onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Italic (Ctrl+I)">
                        <em className="text-[14px]">I</em>
                    </RibbonBtn>
                    <RibbonBtn onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} title="Underline (Ctrl+U)">
                        <span className="underline decoration-2 text-[13px]">U</span>
                    </RibbonBtn>
                    <RibbonBtn onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title="Strikethrough">
                        <span className="line-through text-[13px]">S</span>
                    </RibbonBtn>
                    <RibbonBtn onClick={() => editor.chain().focus().toggleHighlight().run()} isActive={editor.isActive('highlight')} title="Highlight text">
                        <span className="text-[13px] font-bold" style={{ textDecoration: 'underline', textDecorationColor: '#facc15', textDecorationThickness: '3px' }}>A</span>
                    </RibbonBtn>

                    <Sep />

                    {/* Alignment */}
                    <RibbonBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} title="Align Left">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="1" width="14" height="2" rx="1"/><rect x="0" y="5" width="10" height="2" rx="1"/><rect x="0" y="9" width="14" height="2" rx="1"/><rect x="0" y="13" width="7" height="1" rx=".5"/></svg>
                    </RibbonBtn>
                    <RibbonBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} title="Center">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="1" width="14" height="2" rx="1"/><rect x="2" y="5" width="10" height="2" rx="1"/><rect x="0" y="9" width="14" height="2" rx="1"/><rect x="3.5" y="13" width="7" height="1" rx=".5"/></svg>
                    </RibbonBtn>
                    <RibbonBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} title="Align Right">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="1" width="14" height="2" rx="1"/><rect x="4" y="5" width="10" height="2" rx="1"/><rect x="0" y="9" width="14" height="2" rx="1"/><rect x="7" y="13" width="7" height="1" rx=".5"/></svg>
                    </RibbonBtn>
                    <RibbonBtn onClick={() => editor.chain().focus().setTextAlign('justify').run()} isActive={editor.isActive({ textAlign: 'justify' })} title="Justify">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="1" width="14" height="2" rx="1"/><rect x="0" y="5" width="14" height="2" rx="1"/><rect x="0" y="9" width="14" height="2" rx="1"/><rect x="0" y="13" width="14" height="1" rx=".5"/></svg>
                    </RibbonBtn>

                    <Sep />

                    {/* Lists */}
                    <RibbonBtn onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="Bullet List">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="2" cy="3.5" r="1.5"/><rect x="5" y="2.5" width="9" height="2" rx="1"/><circle cx="2" cy="7" r="1.5"/><rect x="5" y="6" width="9" height="2" rx="1"/><circle cx="2" cy="10.5" r="1.5"/><rect x="5" y="9.5" width="9" height="2" rx="1"/></svg>
                    </RibbonBtn>
                    <RibbonBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Numbered List">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><text x="0" y="5" fontSize="4.5" fontWeight="bold">1.</text><rect x="5" y="2.5" width="9" height="2" rx="1"/><text x="0" y="9" fontSize="4.5" fontWeight="bold">2.</text><rect x="5" y="6" width="9" height="2" rx="1"/><text x="0" y="13" fontSize="4.5" fontWeight="bold">3.</text><rect x="5" y="9.5" width="9" height="2" rx="1"/></svg>
                    </RibbonBtn>

                    <Sep />

                    {/* Headings */}
                    <RibbonBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} title="Heading 1">
                        <span className="text-[11px] font-black">H1</span>
                    </RibbonBtn>
                    <RibbonBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} title="Heading 2">
                        <span className="text-[11px] font-black">H2</span>
                    </RibbonBtn>
                    <RibbonBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} title="Heading 3">
                        <span className="text-[11px] font-black">H3</span>
                    </RibbonBtn>

                </div>
            </div>

            {/* ── Page / Paper area (WPS-style grey background) ─────────── */}
            <div
                className="flex-1 overflow-y-auto bg-[#b2b2b2] px-8 py-8 custom-scrollbar"
                style={{ backgroundImage: 'repeating-linear-gradient(transparent 0px, transparent 27px, rgba(0,0,0,0.04) 27px, rgba(0,0,0,0.04) 28px)' }}
            >
                <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', transition: 'transform 0.15s ease' }}>
                    <EditorContent editor={editor} />
                </div>
            </div>

            {/* ── Status Bar ─────────────────────────────────────────────── */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-1 bg-[#2b579a] text-white text-[11px]">
                <span className="opacity-80">DocuSync Editor · {fileName}</span>
                <div className="flex items-center gap-4 opacity-80">
                    <span>{users.length > 0 ? `${users.length} collaborator${users.length > 1 ? 's' : ''} online` : 'Solo editing'}</span>
                    <span>Zoom: {zoom}%</span>
                </div>
            </div>

            <style>{`
                .word-paper {
                    width: 100%;
                    max-width: 816px;
                    min-height: 1056px;
                    margin: 0 auto;
                    padding: 96px 96px;
                    box-sizing: border-box;
                    background-color: #ffffff !important;
                    outline: none;
                    font-family: 'Times New Roman', Georgia, serif;
                    font-size: 12pt;
                    line-height: 1.75;
                    color: #000000 !important;
                    box-shadow: 0 2px 12px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.08);
                }

                .word-paper h1 {
                    font-size: 20pt;
                    font-weight: bold;
                    margin: 14pt 0 6pt;
                    font-family: 'Times New Roman', serif;
                    color: #000 !important;
                    text-align: center;
                }
                .word-paper h2 {
                    font-size: 14pt;
                    font-weight: bold;
                    margin: 12pt 0 4pt;
                    font-family: 'Times New Roman', serif;
                    color: #000 !important;
                    text-align: center;
                }
                .word-paper h3 {
                    font-size: 12pt;
                    font-weight: bold;
                    font-style: italic;
                    margin: 10pt 0 4pt;
                    font-family: 'Times New Roman', serif;
                    color: #000 !important;
                }
                .word-paper p {
                    margin: 0 0 8pt 0;
                    color: #000 !important;
                    text-indent: 36pt;
                }
                .word-paper p:first-child { text-indent: 0; }
                .word-paper ul, .word-paper ol { padding-left: 28pt; margin: 6pt 0; color: #000 !important; }
                .word-paper li { margin-bottom: 3pt; }
                .word-paper blockquote {
                    border-left: 4px solid #2b579a;
                    padding-left: 14pt;
                    margin: 8pt 0 8pt 24pt;
                    color: #444;
                    font-style: italic;
                }
                .word-paper mark {
                    background-color: #ffff00;
                    color: #000 !important;
                }
                .word-paper strong { font-weight: bold; color: #000 !important; }
                .word-paper em { font-style: italic; color: #000 !important; }

                /* Collaboration cursors */
                .collaboration-cursor__caret {
                    border-left: 2px solid currentColor;
                    border-right: 2px solid currentColor;
                    margin-left: -1px; margin-right: -1px;
                    pointer-events: none; position: relative;
                }
                .collaboration-cursor__label {
                    border-radius: 4px 4px 4px 0; color: #fff; font-size: 10px;
                    font-style: normal; font-weight: 700; left: -1px; line-height: normal;
                    padding: 2px 6px; position: absolute; top: -1.5em;
                    user-select: none; white-space: nowrap;
                }
            `}</style>
        </div>
    );
}
