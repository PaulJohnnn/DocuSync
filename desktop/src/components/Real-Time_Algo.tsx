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
                <MetricsOverlay deltaBytes={deltaBytes} peerCount={collaborators.length} vectorClock={vectorClock} syncStatus={isOffline ? 'offline' : 'idle'} />
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
