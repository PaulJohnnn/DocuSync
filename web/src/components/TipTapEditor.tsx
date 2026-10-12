'use client';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { useEffect, useRef, useState } from 'react';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, List, ListOrdered, Quote, Code,
  AlignLeft, AlignCenter, AlignRight, Highlighter, File, Lock,
  Table as TableIcon, Rows3, Columns3, Trash
} from 'lucide-react';

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { visibleContentKey } from '@/lib/documentSignature';

export interface RemoteCursor {
  nodeId: string;
  displayName: string;
  color: string;
  from: number;
  to: number;
  /**
   * A fingerprint of the document the sender measured this position
   * against, where they sent one.
   *
   * A position only means something relative to one specific text. While
   * this editor holds different text -- the second or so between someone
   * typing and the edit arriving here -- applying their number puts the
   * caret somewhere they are not. In prose that is a few characters out
   * and nobody notices; inside a table it is one cell over and obvious.
   */
  docKey?: string | null;
}

/** A remote caret as this editor currently believes it to be placed. */
interface TrackedCursor extends RemoteCursor {
  /** The exact position its owner last reported, used to spot a real move. */
  reportedFrom: number;
  reportedTo: number;
  /**
   * When this caret was first held back for describing a document this
   * editor does not have. Zero when it is not being held.
   */
  heldSince?: number;
}

/**
 * How long a caret may be held at its last known-good position while the
 * two documents differ. Long enough to cover an ordinary sync, short
 * enough that a caret never looks stuck.
 */
const HOLD_STALE_MS = 2000;

interface RemoteCursorsState {
  byNode: Map<string, TrackedCursor>;
  decorations: DecorationSet;
}

function buildCursorDecorations(
  cursors: TrackedCursor[],
  doc: ProseMirrorNode
): DecorationSet {
  const decorations: Decoration[] = [];
  const maxPos = Math.max(0, doc.nodeSize - 2);

  cursors.forEach((c) => {
    const from = Math.max(0, Math.min(c.from, maxPos));
    const to = Math.max(0, Math.min(c.to, maxPos));

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

  return DecorationSet.create(doc, decorations);
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
      new Plugin<RemoteCursorsState>({
        key: new PluginKey('remoteCursors'),
        state: {
          init: () => ({ byNode: new Map(), decorations: DecorationSet.empty }),
          apply: (tr, prev) => {
            // Each peer reports an ABSOLUTE position, measured in ITS OWN
            // copy of the document. The moment anyone types, those numbers
            // stop describing this copy: insert a word above someone's caret
            // and their reported position now points several characters
            // earlier than where they actually are.
            //
            // The decorations were rebuilt from the reported numbers on every
            // poll, so a peer who was sitting perfectly still had their caret
            // jump around the page as soon as somebody else typed — the thing
            // this is meant to show (where that person is) was the one thing
            // it got wrong.
            //
            // Each caret is now carried forward through every local edit by
            // the same position mapping ProseMirror uses for its own
            // selection, and a peer's stored position is only replaced when
            // THAT PEER reports a different one from the last we heard. An
            // unchanged report is a peer who has not moved, so their caret is
            // left exactly where this document says it now is.
            const byNode = new Map<string, TrackedCursor>();
            let moved = false;

            // Carry every known caret through this transaction's changes.
            prev.byNode.forEach((c, nodeId) => {
              // Biased LEFT (assoc -1), which decides what happens when text
              // is inserted at EXACTLY the spot a remote caret sits. Biased
              // right, the caret is pushed along in front of every character
              // typed — so when two people have their carets in the same
              // place, the other person's name tag ran across the page as
              // this one typed, which is the "their cursor moves when I type"
              // report. Biased left, the typing flows past them and their
              // caret stays where they put it, which is what a word processor
              // does and what the owner of that caret expects to see.
              const from = tr.mapping.map(c.from, -1);
              const to = tr.mapping.map(c.to, -1);
              if (from !== c.from || to !== c.to) moved = true;
              byNode.set(nodeId, { ...c, from, to });
            });

            // `this.options` on a Tiptap Extension is a computed getter that
            // merges configure()-time defaults, not a stable mutable object —
            // assigning `ext.options.cursors = ...` from outside silently
            // never persists. Passing the live list through the transaction's
            // own meta is the reliable way to get fresh data in here.
            const meta = tr.getMeta('remoteCursorsUpdate') as
              { cursors: RemoteCursor[]; localDocKey?: string } | undefined;
            if (meta) {
              const here = meta.localDocKey;
              const seen = new Set<string>();
              meta.cursors.forEach((c) => {
                seen.add(c.nodeId);
                const known = byNode.get(c.nodeId);
                // A report identical to the last one from this peer means
                // they have not moved; keep the position already carried
                // through our edits rather than snapping back to a number
                // that was true before we typed.
                if (known && known.reportedFrom === c.from && known.reportedTo === c.to) {
                  byNode.set(c.nodeId, { ...known, color: c.color, displayName: c.displayName });
                  return;
                }
                // Measured against text this editor does not have yet.
                //
                // The number is right for the sender's document and wrong
                // for this one, so it is held back until the edit that
                // justifies it arrives -- the peer stays in the map, so
                // their caret remains on screen at the last place that was
                // genuinely true rather than jumping somewhere they have
                // never been. Measured before this: a caret sat outside
                // the table for about a second after its owner typed in a
                // cell.
                //
                // Bounded, though. Holding it indefinitely assumes the two
                // documents will converge promptly, and when they do not
                // the caret simply stops moving -- which is worse than
                // being briefly a cell out, because it never corrects. So
                // after HOLD_STALE_MS the reported position is used
                // regardless: a short pause while things settle, never a
                // frozen caret. Clients too old to send a key are
                // unaffected.
                const heldSince = known?.heldSince ?? 0;
                const mismatched = !!(c.docKey && here && c.docKey !== here);
                if (known && mismatched) {
                  const since = heldSince || Date.now();
                  if (Date.now() - since < HOLD_STALE_MS) {
                    byNode.set(c.nodeId, {
                      ...known, color: c.color, displayName: c.displayName, heldSince: since,
                    });
                    return;
                  }
                }
                byNode.set(c.nodeId, {
                  ...c,
                  reportedFrom: c.from,
                  reportedTo: c.to,
                  heldSince: 0,
                });
                moved = true;
              });
              // Anyone who has gone away stops being drawn.
              const stale: string[] = [];
              byNode.forEach((_c, nodeId) => { if (!seen.has(nodeId)) stale.push(nodeId); });
              stale.forEach((nodeId) => { byNode.delete(nodeId); moved = true; });
            }

            if (!moved && !tr.docChanged) {
              return { byNode, decorations: prev.decorations };
            }
            return { byNode, decorations: buildCursorDecorations(Array.from(byNode.values()), tr.doc) };
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

/**
 * How content from anyone else is parsed back into the document.
 *
 * ProseMirror's HTML parser collapses runs of whitespace by default, the way
 * a browser renders HTML. So a sentence someone typed with three spaces in it
 * arrived at every other peer with one, and the two screens disagreed about a
 * document neither had changed. `preserveWhitespace: 'full'` keeps the spaces
 * and the newlines exactly as they were written.
 *
 * `emitUpdate: false` is unchanged and still essential: it stops a remote
 * edit being echoed straight back out as if this user had typed it.
 */
const PARSE_KEEPING_SPACES = {
  emitUpdate: false,
  parseOptions: { preserveWhitespace: 'full' as const },
};

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
  /**
   * False when the host has locked this file and this device is not on the
   * allowed list. The toolbar goes away and ProseMirror stops accepting
   * input — but the document stays on screen and stays scrollable, because
   * the request was "allow viewing only", not "hide it".
   */
  canEdit?: boolean;
  /** Why editing is off, shown in place of the toolbar. */
  lockReason?: string;
  /** Fingerprint of the text THIS editor is currently showing. */
  localDocKey?: string;
}

/**
 * How much text before the caret is used to find it again after the
 * document is rewritten. Long enough to be distinctive in ordinary prose,
 * short enough that an edit a line or two above does not spoil the match.
 */
const BLOCK_SEP = String.fromCharCode(10);

const CARET_ANCHOR_CHARS = 40;

/**
 * Where the caret should sit in a freshly written document.
 *
 * `setContent` replaces the document wholesale, so ProseMirror has no
 * mapping to carry the old position across -- the integer is simply an
 * offset into something that no longer exists. Keeping the number means
 * the caret stays where it was while the words move, which reads to the
 * person using it as the caret jumping on its own.
 *
 * So the caret is placed against its WORDS instead: the characters that
 * were immediately in front of it are looked for in the new document, and
 * the caret goes just after them. Where several copies of that text exist
 * -- a repeated heading, say -- the one nearest the old position wins, so
 * an unchanged document never moves the caret at all. If the text is gone
 * entirely, the old position is used, which is the best guess available.
 */
function anchoredPosition(editor: Editor, anchorText: string, fallback: number): number {
  if (!anchorText) return fallback;
  const doc = editor.state.doc;
  const full = doc.textBetween(0, doc.content.size, BLOCK_SEP, BLOCK_SEP);

  // Every place the anchor text appears, as a text offset.
  const hits: number[] = [];
  for (let at = full.indexOf(anchorText); at !== -1; at = full.indexOf(anchorText, at + 1)) {
    hits.push(at + anchorText.length);
    if (hits.length > 64) break; // pathological input; the nearest is enough
  }
  if (!hits.length) return fallback;

  // Text offsets and document positions differ, because a position counts
  // node boundaries too. Walking the text nodes converts between them.
  const toDocPos = (textOffset: number): number => {
    let seen = 0;
    let result = fallback;
    doc.descendants((node, pos) => {
      if (!node.isText) return true;
      const len = node.text ? node.text.length : 0;
      if (seen + len >= textOffset) {
        result = pos + (textOffset - seen);
        return false;
      }
      seen += len;
      return true;
    });
    return result;
  };

  // The occurrence closest to where the caret already was.
  const fallbackText = Math.max(0, Math.min(fallback, full.length));
  let best = hits[0];
  for (const h of hits) {
    if (Math.abs(h - fallbackText) < Math.abs(best - fallbackText)) best = h;
  }
  return toDocPos(best);
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

export default function TipTapEditor({ content, onChange, cursors = [], onSelectionUpdate, onUndo, margin, onMarginChange, onHistoryRequest, canEdit = true, lockReason, localDocKey }: Props) {
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
      // This build of StarterKit already brings Underline. Registering it a
      // second time made Tiptap warn about a duplicate extension name, and
      // two marks answering to one name is not a state worth shipping when
      // the toolbar button toggles it and the exporter reads it back.
      StarterKit,
      Highlight,
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
    // Set here as the initial value, and kept in step by the effect below —
    // useEditor does not re-run when a prop changes, so a file locked while
    // somebody already had it open would otherwise stay editable until they
    // navigated away.
    editable: canEdit,
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

  // The host can lock or release a file while this editor is already open,
  // so the live editor is kept in step with the prop. Without this the lock
  // only took effect on the next page load.
  useEffect(() => {
    if (editor && editor.isEditable !== canEdit) {
      editor.setEditable(canEdit);
    }
  }, [editor, canEdit]);

  /**
   * Tells the pagination loop that the layout has changed.
   *
   * Lives in a ref because the loop and the content writer are separate
   * effects, and content applied with `emitUpdate: false` raises no editor
   * event for the loop to hear.
   */
  const markDirtyRef = useRef<() => void>(() => { });

  useEffect(() => {
    if (!editor || !content) return;
    
    if (!initialized.current) {
      editor.commands.setContent(content, PARSE_KEEPING_SPACES);
      initialized.current = true;
      markDirtyRef.current();
      return;
    }

    // Compared on what the document renders, not on the exact markup string.
    //
    // `setContent` replaces the WHOLE document: every node is rebuilt, the
    // caret is put back by offset, and the page breaks are measured again.
    // Doing that when nothing actually changed is what makes the page jump
    // while someone is typing — and it was happening constantly, because the
    // stored copy and `editor.getHTML()` differ in ways no reader can see.
    // The editor re-serialises what it was given: a line break between two
    // block tags, an attribute in a different order, an empty paragraph
    // spelled `<p></p>` on one side and `<p><br></p>` on the other. Every one
    // of those compared as "different" and triggered a full rebuild, up to
    // once per poll.
    // `visibleContentKey`, not `documentSignature`. The signature collapses
    // runs of whitespace — right for deciding whether two saved versions are
    // the same version, wrong here: an edit that only changed spacing then
    // compared equal to what was on screen and was never applied, so the
    // person typing saw their spaces and nobody else did until some
    // unrelated edit finally made the two differ.
    if (visibleContentKey(content) !== visibleContentKey(editor.getHTML())) {
      const { from, to } = editor.state.selection;
      // The words immediately before the caret, used to find it again in
      // the rewritten document -- see `anchoredPosition`.
      const anchor = editor.state.doc.textBetween(0, from, BLOCK_SEP, BLOCK_SEP).slice(-CARET_ANCHOR_CHARS);

      editor.commands.setContent(content, PARSE_KEEPING_SPACES);

      // Put the caret back where its TEXT went, not where its number was.
      //
      // `setContent` replaces the whole document, so the old position is
      // just an integer into a document that no longer exists. Restoring
      // it unchanged -- clamped only to the new length -- meant that when
      // somebody inserted text ABOVE the caret, the text slid down and the
      // caret stayed put: it appeared to jump backwards by however much
      // had been added. Measured: a seven-character insertion at the start
      // of the paragraph moved the caret into the NEXT paragraph.
      //
      // Finding the characters that were in front of the caret puts it
      // back against the same words, which is where its owner left it.
      const newSize = editor.state.doc.content.size;
      const clamp = (n: number) => Math.max(0, Math.min(n, newSize > 0 ? newSize - 1 : 0));
      const mapped = anchoredPosition(editor, anchor, clamp(from));
      const safeFrom = clamp(mapped);
      const safeTo = clamp(mapped + (to - from));
      editor.commands.setTextSelection({ from: safeFrom, to: safeTo });

      // And tell everyone else, because the number they hold for this
      // caret has just stopped meaning what it meant. A peer who is not
      // touching anything never fires a selection change, so without this
      // their caret is drawn at a stale offset on every other screen and
      // drifts further with each edit -- the "someone else's cursor moves
      // although they are not typing" complaint.
      if (onSelectionUpdate) onSelectionUpdate(safeFrom, safeTo);
      // The text just changed underneath the page breaks measured for the
      // old text, so they have to be measured again.
      markDirtyRef.current();
    }
  }, [editor, content]);

  useEffect(() => {
    if (editor) {
      // Pass the cursor list itself as the transaction meta payload (see
      // the plugin's `apply` above for why — `ext.options` mutation
      // doesn't work here).
      // The whole list goes through, with this editor's own key alongside
      // it. Filtering the list instead would have the plugin treat the
      // missing peer as having left and delete their caret outright --
      // a disappearing cursor in place of a misplaced one.
      editor.view.dispatch(
        editor.state.tr.setMeta('remoteCursorsUpdate', { cursors, localDocKey })
      );
    }
  }, [editor, cursors, localDocKey]);

  useEffect(() => {
    if (!editor) return;
    let animFrame: number;

    // Re-measuring every single frame forces a full layout of the document on
    // every tick, which on a long paste (tens of thousands of characters) is
    // both visibly janky and pointless — the layout only moves when the
    // document, the margin or the viewport changes. So measure only while
    // there is something to settle, then idle until something marks it dirty
    // again.
    let dirty = true;
    const markDirty = () => { dirty = true; };
    markDirtyRef.current = markDirty;
    editor.on('update', markDirty);
    window.addEventListener('resize', markDirty);

    // `editor.on('update')` does NOT fire for content applied programmatically:
    // the effect that writes a peer's text in passes `emitUpdate: false`, to
    // avoid echoing it straight back out as a local edit. So a document that
    // arrived from someone else was never marked for re-measurement, and it
    // kept whatever page breaks the PREVIOUS text had — none at all, if this
    // peer had not typed yet. On a device that is mostly receiving, which is
    // the other person's device during any demo, the text simply ran on past
    // the bottom of the page. See markDirtyRef, called wherever content is set.

    // A hidden or minimised window has requestAnimationFrame suspended, so the
    // loop below stops entirely; anything that changed while it was away needs
    // re-measuring when it comes back.
    document.addEventListener('visibilitychange', markDirty);

    // Web fonts land after first paint and change every line's height, which
    // moves every page boundary measured before they arrived.
    if (document.fonts?.ready) document.fonts.ready.then(markDirty).catch(() => { });

    const adjustPages = () => {
      const pm = editor.view.dom as HTMLElement;
      if (!dirty) { animFrame = requestAnimationFrame(adjustPages); return; }
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

        // offsetTop and offsetHeight are rounded to whole pixels, while the
        // push written back is fractional. Applying a fractional push shifts
        // the rounded reading by a pixel, which flips the computed push back,
        // which dispatches again — the editor visibly shook every frame and
        // never settled on a long document. getBoundingClientRect reports
        // subpixel values, so measurement and correction are in the same
        // units and the loop reaches a fixed point.
        const pmRect = pm.getBoundingClientRect();
        const pmStyle = getComputedStyle(pm);
        // Rects are measured from the border box; offsetTop was measured from
        // the content box, so discount the top border and padding to keep the
        // origin identical to what the push maths below assumes.
        const pmOrigin = pmRect.top
          + (parseFloat(pmStyle.borderTopWidth) || 0)
          + (parseFloat(pmStyle.paddingTop) || 0);

        blocks.forEach((el, i) => {
          const alreadyPushed = applied[i] || 0;
          const rect = el.getBoundingClientRect();
          const h = rect.height; // unaffected by margin-top
          const naturalTop = (rect.top - pmOrigin) - alreadyPushed;
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
          // Still converging — the dispatch relays out, so measure again next
          // frame. `dirty` stays set.
          editor.view.dispatch(
            editor.state.tr.setMeta(PaginationPluginKey, { pushes: next })
          );
        } else {
          // Reached the fixed point. Stop measuring until something changes.
          dirty = false;
        }

        setPageCount(Math.max(1, pageIndex + 1));
      }
      animFrame = requestAnimationFrame(adjustPages);
    };

    animFrame = requestAnimationFrame(adjustPages);
    return () => {
      cancelAnimationFrame(animFrame);
      editor.off('update', markDirty);
      window.removeEventListener('resize', markDirty);
      document.removeEventListener('visibilitychange', markDirty);
    };
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

      {/* View-only banner, in place of the toolbar.
          Offering formatting buttons that silently do nothing is worse than
          offering none, so when the file is locked to this device the
          toolbar is replaced by the reason it is gone. */}
      {!canEdit && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderBottom: '1px solid var(--b1)',
          background: 'rgba(245, 158, 11, 0.1)', color: 'var(--t1)',
          fontSize: 13, fontWeight: 600,
        }}>
          <Lock size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <span>{lockReason || 'View only — the room host has locked this file.'}</span>
        </div>
      )}

      {/* Toolbar */}
      {canEdit && (
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

        {/* Tables.
            The extensions were loaded all along, so a table pasted in from
            Word rendered correctly -- but nothing in the interface could
            make one, which is what the panel raised: a table is part of a
            document's text, and this was the one part the editor could
            display and not produce. The row and column controls only
            appear once the caret is inside a table, so the toolbar does
            not grow four permanently dead buttons. */}
        <ToolBtn
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          active={editor.isActive('table')}
        >
          <TableIcon size={14} />
        </ToolBtn>
        {editor.isActive('table') && (
          <>
            <ToolBtn onClick={() => editor.chain().focus().addRowAfter().run()}>
              <Rows3 size={14} />
            </ToolBtn>
            <ToolBtn onClick={() => editor.chain().focus().addColumnAfter().run()}>
              <Columns3 size={14} />
            </ToolBtn>
            <ToolBtn onClick={() => editor.chain().focus().deleteRow().run()}>
              <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1 }}>-R</span>
            </ToolBtn>
            <ToolBtn onClick={() => editor.chain().focus().deleteColumn().run()}>
              <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1 }}>-C</span>
            </ToolBtn>
            <ToolBtn onClick={() => editor.chain().focus().deleteTable().run()}>
              <Trash size={14} />
            </ToolBtn>
          </>
        )}

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
      )}
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
