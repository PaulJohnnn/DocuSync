'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import {
  Clock, FileEdit, GitMerge, AlertTriangle, ArrowLeft, Activity, RefreshCw, Scale, FilePlus, Trash2, Undo2, Eye, X
} from 'lucide-react';
import { uGet, uSet } from '@/lib/userStorage';
import { idbGetFile, idbSaveFile } from '@/lib/idb';
import { diffWords } from 'diff';
import { documentSignature } from '@/lib/documentSignature';

// Two real, full-size document pages side by side — the selected
// historical snapshot on the left, the current/latest version on the
// right — each rendering the ACTUAL stored HTML (headings, bold,
// alignment, lists, margins) inside a page-styled container that matches
// what the editor itself looks like, with the specific words that differ
// highlighted in place.
//
// This replaces an earlier version that stripped all HTML and dumped the
// result as one small monospace text block — readable as a diff, but
// nothing like "the actual page": no paragraphs, no formatting, no
// margins, wrong text positioning entirely.
//
// The diff itself still runs on the raw HTML strings rather than
// stripped text, so the highlighted spans can be re-inserted directly
// into the real markup instead of being reconstructed from plain text.
// For ordinary edits (typing/deleting words inside existing paragraphs)
// the surrounding tags land as unchanged, untouched tokens on both sides
// and only the actual changed words get wrapped — which is what real
// documents look like when they're edited. Structural edits (a whole new
// paragraph/list added) are a case diffWords doesn't reason about at the
// tag level, so an unmatched tag can end up on only one side; the browser's
// HTML parser is lenient enough that this renders as slightly odd
// formatting on that one page rather than breaking anything.
/** One block-level element of a stored document. */
interface DocBlock {
  /** The element exactly as stored, markup and all. */
  html: string;
  /** Its opening tag, used to rebuild it around marked-up text. */
  open: string;
  /** Its closing tag. */
  close: string;
  /** The words it shows, with tags and entities resolved. */
  text: string;
  /** A stable identity for alignment: the tag name plus its words. */
  key: string;
}

const BLOCK_PATTERN = /<(p|h[1-6]|li|blockquote|pre|td|th|figcaption)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi;

/** Text with HTML's five special characters escaped, safe to inject. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Splits a stored document into its block elements.
 *
 * Regex rather than DOMParser because this also has to produce the same
 * result during server rendering, where there is no document. Block tags do
 * not nest in what the editor emits, so a non-greedy match to the matching
 * close tag is sufficient here; anything the pattern does not recognise is
 * carried through verbatim as its own block, so nothing is ever dropped.
 */
function splitBlocks(html: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  BLOCK_PATTERN.lastIndex = 0;

  const addLiteral = (chunk: string) => {
    // Markup between blocks — the wrapping <div data-margin>, a <hr>, a
    // stray newline. Kept exactly, never diffed, so it cannot be split.
    if (chunk) blocks.push({ html: chunk, open: '', close: '', text: '', key: `~${chunk}` });
  };

  while ((match = BLOCK_PATTERN.exec(html)) !== null) {
    addLiteral(html.slice(lastIndex, match.index));
    const [full, tag, attrs = '', inner] = match;
    const text = stripHtml(inner);
    blocks.push({
      html: full,
      open: `<${tag}${attrs}>`,
      close: `</${tag}>`,
      text,
      key: `${tag.toLowerCase()}:${text}`,
    });
    lastIndex = match.index + full.length;
  }
  addLiteral(html.slice(lastIndex));
  return blocks;
}

/** Rebuilds a block around already-escaped inner HTML. */
function wrapBlock(block: DocBlock, inner: string): string {
  if (!block.open) return block.html;
  return `${block.open}${inner}${block.close}`;
}

/**
 * The block on the other side this one most likely came from.
 *
 * Longest shared prefix of words, which is enough to pair a paragraph with
 * its edited self without pairing it with an unrelated one. Returns nothing
 * when nothing is close, so a genuinely new block is marked whole rather
 * than diffed against a stranger.
 */
function nearestBlock(block: DocBlock, candidates: DocBlock[]): DocBlock | null {
  const words = block.text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  let best: DocBlock | null = null;
  let bestScore = 0;
  let bestLength = 0;
  for (const candidate of candidates) {
    if (!candidate.open) continue;
    const other = candidate.text.split(/\s+/).filter(Boolean);
    let shared = 0;
    while (shared < words.length && shared < other.length && words[shared] === other[shared]) shared++;
    if (shared > bestScore) { bestScore = shared; bestLength = other.length; best = candidate; }
  }

  // At least a third of the shorter of the two blocks has to line up before
  // they are called versions of each other. Below that they are more likely
  // to be different paragraphs that happen to open with the same word, and
  // diffing them against each other marks up nearly every word in both.
  const shorter = Math.min(words.length, bestLength || words.length);
  return bestScore > 0 && bestScore * 3 >= shorter ? best : null;
}

function renderDiff(oldHtml: string, newHtml: string) {
  // The diff runs block by block, and within a block on its words — never on
  // the markup as one string.
  //
  // It used to diff the raw HTML and wrap each changed token in <mark>. Word
  // boundaries fall inside tags, so a structural change split one: the two
  // halves of `</div>` landed on opposite sides of the diff and the page
  // rendered the orphan `div>` as literal text, next to a highlighted
  // `<p></p>` that was never anything the author typed. The reader was shown
  // markup, and the markup that was built was not valid.
  //
  // Working a block at a time means a tag is never cut in half. Unchanged
  // blocks are emitted exactly as they were stored, so headings, bold, lists
  // and alignment survive untouched. Only a block whose words changed has its
  // text re-rendered with the differences marked, and only that block loses
  // its inline formatting — a contained cost, where the previous approach
  // could corrupt the whole document.
  const oldBlocks = splitBlocks(oldHtml || '');
  const newBlocks = splitBlocks(newHtml || '');

  const buildSide = (side: 'previous' | 'current') => {
    const blocks = side === 'previous' ? oldBlocks : newBlocks;
    const other = side === 'previous' ? newBlocks : oldBlocks;
    const bg = side === 'previous' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.25)';
    const deco = side === 'previous' ? 'text-decoration:line-through;' : '';
    const mark = (text: string) =>
      `<mark style="background:${bg};${deco}border-radius:2px;padding:0 1px;">${escapeHtml(text)}</mark>`;

    const otherTexts = new Set(other.map((b) => b.text.trim()));

    return blocks
      .map((block) => {
        const text = block.text.trim();
        // Present on both sides, unchanged: emit the original markup.
        if (otherTexts.has(text)) return block.html;

        // Changed or new: find its closest counterpart and mark the words
        // that differ, inside the block's own tag.
        const counterpart = nearestBlock(block, other);
        if (!counterpart) {
          return wrapBlock(block, mark(block.text));
        }
        const wordOps = diffWords(
          side === 'previous' ? block.text : counterpart.text,
          side === 'previous' ? counterpart.text : block.text,
        );
        const inner = wordOps
          .filter((p: { added?: boolean; removed?: boolean }) =>
            side === 'previous' ? !p.added : !p.removed)
          .map((p: { added?: boolean; removed?: boolean; value: string }) =>
            (side === 'previous' ? p.removed : p.added) ? mark(p.value) : escapeHtml(p.value))
          .join('');
        return wrapBlock(block, inner);
      })
      .join('');
  };

  const pageStyle = {
    flex: 1, minWidth: 0, background: '#ffffff', color: '#0f172a',
    border: '1px solid #e2e8f0', borderRadius: 8,
    padding: '40px 48px', minHeight: 420, maxHeight: 520, overflowY: 'auto' as const,
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 14, lineHeight: 1.7,
  };
  const emptyHtml = '<p style="color:#94a3b8">No data</p>';

  return (
    <div style={{ display: 'flex', gap: 20, width: '100%', alignItems: 'stretch' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#ef4444', fontWeight: 700, marginBottom: 10, borderBottom: '2px solid #ef4444', paddingBottom: 6, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Previous Version
        </div>
        <div className="tiptap" style={pageStyle} dangerouslySetInnerHTML={{ __html: buildSide('previous') || emptyHtml }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#10b981', fontWeight: 700, marginBottom: 10, borderBottom: '2px solid #10b981', paddingBottom: 6, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Current Version (Latest)
        </div>
        <div className="tiptap" style={pageStyle} dangerouslySetInnerHTML={{ __html: buildSide('current') || emptyHtml }} />
      </div>
    </div>
  );
}

// Helper to strip HTML
function stripHtml(html: string) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

interface HistoryEntry {
  eventId: string;
  fileId: string;
  nodeId: string;
  eventType: 'edit' | 'merge' | 'conflict-resolve' | 'restore' | 'delete' | string;
  logicalTimestamp: number;
  payloadPreview: string | null;
  fullContent?: string;
  createdAt: string;
  isCompacted: boolean;
  /** Server-assigned position in the log. Absent on older entries. */
  seqNo?: number;
  /** Server wall-clock time of the record, in ms. Absent on older entries. */
  recordedAt?: number;
  /** Row id, the desktop host's equivalent of `seqNo`. */
  id?: number;
}

/**
 * When this version was recorded, as every device should agree it happened.
 *
 * `logicalTimestamp` is the AUTHOR's clock — the field Last-Write-Wins
 * arbitrates on, and correctly so — but two laptops whose clocks differ by
 * a few minutes then print different times for the same shared version and
 * disagree about which one is newest. Whatever the server stamped is used
 * for display instead, and the author's clock only as a last resort for
 * entries written before that field existed.
 */
const versionTime = (ev: HistoryEntry): number => {
  if (typeof ev.recordedAt === 'number') return ev.recordedAt;
  const parsed = ev.createdAt ? Date.parse(ev.createdAt) : NaN;
  return Number.isNaN(parsed) ? ev.logicalTimestamp : parsed;
};

/**
 * Newest first, by the order the server actually wrote the entries.
 *
 * Sorting on the author's clock put a device running five minutes slow
 * underneath versions it was written after, so the list showed the wrong
 * version as "latest". `seqNo` (cloud) and `id` (desktop host) are both
 * assigned by the one machine all peers talk to, so they always reflect
 * real order; time is the tie-break for entries that predate them.
 */
function orderVersions(list: HistoryEntry[]): HistoryEntry[] {
  const sorted = [...list].sort((a, b) => {
    const sa = a.seqNo ?? a.id;
    const sb = b.seqNo ?? b.id;
    if (typeof sa === 'number' && typeof sb === 'number' && sa !== sb) return sb - sa;
    return versionTime(b) - versionTime(a);
  });

  // Identical content logged twice is one version, however it got there —
  // a room edited before the server-side de-duplication landed still has
  // runs of repeats sitting in Redis, and they should not be shown. Done
  // after sorting so the copy that survives is the most recent one, which
  // is the one "Restore" should bring back.
  // Rows are kept by their document text, not by what the log calls them:
  // a resolution and the save that produced it carry the same words, and to
  // a reader that is one version listed twice. The newest copy wins, and
  // since a resolution is written after the save it settles, the row that
  // survives is the one that says a conflict happened.
  //
  // A conflict row is never dropped — it carries the one thing no other row
  // does, that two people disagreed — but it still claims its text, so the
  // ordinary save holding the same words below it goes.
  //
  // Compared on what the page renders, not on the markup string: two
  // versions can differ only by an empty paragraph the user left behind, or
  // by a line break the merge put between block tags. Invisible on screen,
  // different as strings — and the list filled with rows nobody could tell
  // apart. Same rule the server uses when deciding whether to log a version.
  const seen = new Set<string>();
  return sorted.filter((ev) => {
    const body = documentSignature(ev.fullContent ?? ev.payloadPreview ?? '');
    if (!body) return true;
    // Conflicts used to be exempt from this check, on the reasoning that a
    // conflict row carries something no other row does. It does — but a run
    // of conflict rows all holding the SAME page carries it nine times, and
    // opening any of them showed two identical panels, which is the opposite
    // of informative. The rows are sorted newest first and a resolution is
    // written after the save it settles, so the copy that survives is
    // already the one that says a conflict happened.
    if (seen.has(body)) return false;
    seen.add(body);
    return true;
  });
}

// Each label says what happened to the document, in the order a reader
// scans: what kind of change, then who, then when. The old set described
// where the row sat in the list instead of what it was ("Previous Edit"
// was printed over the newest version, and every conflict read "Edit
// History (Manual)" whether or not anyone had resolved anything by hand).
const EVENT_ICONS: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  'edit': { icon: FileEdit, color: 'var(--acc)', bg: 'var(--acb)', label: 'Edited' },
  'session-snapshot': { icon: RefreshCw, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'Saved' },
  'merge': { icon: GitMerge, color: 'var(--pur)', bg: 'rgba(168, 85, 247, 0.15)', label: 'Merged automatically (Last-Write-Wins)' },
  'conflict-resolve': { icon: Scale, color: 'var(--amb)', bg: 'var(--amb-bg)', label: 'Conflict resolved' },
  'restore': { icon: FilePlus, color: 'var(--grn)', bg: 'rgba(16, 185, 129, 0.15)', label: 'Restored an earlier version' },
  'delete': { icon: Trash2, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', label: 'File Deleted' },
  'offline-replay': { icon: Activity, color: 'var(--tel)', bg: 'rgba(20, 184, 166, 0.15)', label: 'Offline edit merged on reconnect' },
};

export default function HistoryPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params.id as string;
  const [events, setEvents] = useState<HistoryEntry[]>([]);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [restoring, setRestoring] = useState<Record<string, boolean>>({});
  const [activeConflicts, setActiveConflicts] = useState<any[]>([]);
  const [viewFullEvent, setViewFullEvent] = useState<HistoryEntry | null>(null);
  /**
   * The version the user has asked to restore, held while they confirm.
   *
   * Restoring overwrites the document for everyone in the room, so it asks
   * first. The button used to do it on the single click with no warning.
   */
  const [confirmRestore, setConfirmRestore] = useState<HistoryEntry | null>(null);
  const [offlineWarning, setOfflineWarning] = useState('');

  const fetchHistory = useCallback(async () => {
    if (fileId === 'all') {
      setErrorMsg('Cannot fetch history for all files from host.');
      setLoading(false);
      return;
    }
    setLoading(true);
    
    try {
      const roomStr = uGet('current_room');
      const room = roomStr ? JSON.parse(roomStr) : null;

      const filesStr = uGet('files');
      if (filesStr) {
        const files = JSON.parse(filesStr);
        const f = files.find((f: any) => String(f.id) === String(fileId));
        if (f) setFileName(f.name);
      }

      let fetchedData = null;
      let hostError = null;

      // ── One log, for every device in the room ────────────────────────
      //
      // This used to ask the desktop host first and fall back to the room's
      // log only if that failed. Those are two different logs: the host keeps
      // its own SQLite event log for the local engine, the room keeps the
      // shared one. So a desktop that could reach the host read its private
      // history and a browser that could not read the shared one — and the
      // same file showed a different list of versions on every device,
      // which is not a history anybody can rely on.
      //
      // The room's log is the one all devices can see and the one every
      // device writes to, so it is the only one this page reads.
      if (room && room.otp) {
        try {
          const mmRes = await fetch(`/api/lobby/history?otp=${room.otp}&fileId=${fileId}`);
          if (mmRes.ok) {
            const result = await mmRes.json();
            if (result.success && result.data) {
              fetchedData = result.data.entries;
            }
          } else {
            hostError = new Error(`The room's history could not be read (HTTP ${mmRes.status}).`);
          }
        } catch (e: any) {
          hostError = e;
        }
      }

      if (fetchedData) {
        const uniqueMap = new Map();
        fetchedData.forEach((ev: any) => uniqueMap.set(ev.eventId, ev));
        const sorted = orderVersions(Array.from(uniqueMap.values()));
        setEvents(sorted);
        setErrorMsg('');
        setOfflineWarning('');
      } else {
        // Fallback to local offline conflicts
        let localConflicts: HistoryEntry[] = [];
        try {
          const histKey = `docusync_offline_history_${fileId}`;
          const offlineHist = JSON.parse(uGet(histKey) || '[]');
          if (Array.isArray(offlineHist) && offlineHist.length > 0) {
            localConflicts = [...localConflicts, ...offlineHist];
          }
          
          const stored = uGet('docusync_web_conflicts');
          if (stored) {
            const arr = JSON.parse(stored);
            localConflicts = arr
              .filter((c: any) => String(c.fileId) === String(fileId))
              .map((c: any) => ({
                eventId: c.id || `conflict-${c.timestamp}`,
                fileId: c.fileId,
                nodeId: 'local-offline',
                eventType: 'offline-replay',
                logicalTimestamp: c.timestamp,
                payloadPreview: c.localContent,
                fullContent: c.localContent,
                createdAt: new Date(c.timestamp).toISOString(),
                isCompacted: false
              }));
          }
        } catch (_e) {}
        
        if (localConflicts.length > 0) {
          const sorted = orderVersions(localConflicts);
          setEvents(sorted);
          setErrorMsg('');
          setOfflineWarning('Offline mode: Showing locally queued edits only.');
        } else {
          throw new Error(hostError?.message || 'Failed to fetch history from host or cloud, and no offline edits found.');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || String(err));
      console.error('History fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    fetchHistory();
    const checkConflicts = () => {
      try {
        const stored = uGet('docusync_web_conflicts');
        if (stored) {
          const arr = JSON.parse(stored);
          const active = arr.filter((c: any) => String(c.fileId) === String(fileId));
          // One divergence is one card. Rooms edited before the server-side
          // de-duplication landed still hold a run of records filed by the
          // poll loop for the same divergence, each with the local draft a
          // keystroke further along — which is why this page showed a column
          // of merge notifications that all looked alike. Collapse them on
          // the way in, keeping the newest view of each.
          const seen = new Set<string>();
          const unique = active.filter((c: any) => {
            // Keyed on the server state alone, matching how the API now
            // identifies a conflict: this device has one local draft, so
            // one divergence point is one card however much that draft has
            // moved since.
            const key = String(c.serverContent ?? '');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setActiveConflicts(unique);
        } else {
          setActiveConflicts([]);
        }
      } catch (_e) {}
    };
    checkConflicts();
    const iv = setInterval(checkConflicts, 2000);
    return () => clearInterval(iv);
  }, [fetchHistory, fileId]);

  const handleRestore = async (eventId: string, contentToRestore?: string) => {
    setRestoring(prev => ({ ...prev, [eventId]: true }));
    try {
      const roomStr = uGet('current_room');
      const room = roomStr ? JSON.parse(roomStr) : null;
      let finalContent = contentToRestore;

      // The version being restored came from the room's log, which this page
      // already holds in full — so the text to restore is in hand and there
      // is nothing to fetch. Asking the desktop host to rebuild it was how
      // one device restored a version from the host's own private log while
      // another restored a different one from the room's, leaving the two
      // showing different documents afterwards.
      if (!finalContent) {
        const fromList = events.find((e) => e.eventId === eventId);
        finalContent = fromList?.fullContent ?? fromList?.payloadPreview ?? undefined;
      }

      if (!finalContent) {
        throw new Error("That version's content is not available to restore.");
      }

      try {
        const stored = await idbGetFile(String(fileId));
        if (stored) {
          stored.content = finalContent;
          stored.updatedAt = new Date().toISOString();
          await idbSaveFile(stored);
        }
      } catch (e) {}
      
      if (room && room.otp) {
        try {
          await fetch('/api/lobby/doc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              otp: room.otp,
              fileId: String(fileId),
              authorNodeId: 'web-client',
              authorName: 'Web User',
              content: finalContent,
              vectorClock: {},
              isDone: true
            })
          });
        } catch (e) {}
      }

      router.push(`/app/editor/${fileId}`);
    } catch (err: any) {
      alert(err.message || String(err));
      setRestoring(prev => ({ ...prev, [eventId]: false }));
    }
  };

  const resolveAndReturn = async (customPayload: string, conflictIdToRemove: string) => {
    try {
      const stored = await idbGetFile(String(fileId));
      if (stored) {
        stored.content = customPayload;
        stored.updatedAt = new Date().toISOString();
        await idbSaveFile(stored);
      }
    } catch (e) {}
    
    rejectConflict(conflictIdToRemove);
    if (activeConflicts.length <= 1) {
      router.push(`/app/editor/${fileId}`);
    }
  };

  const rejectConflict = (conflictIdToRemove: string) => {
    try {
      const stored = uGet('docusync_web_conflicts');
      if (stored) {
        let arr = JSON.parse(stored);
        arr = arr.filter((c: any) => String(c.fileId) !== String(fileId) || (c.conflictId || c.id) !== conflictIdToRemove);
        uSet('docusync_web_conflicts', JSON.stringify(arr));
        if (arr.length === 0) uSet('docusync_web_conflict', '');
        
        setActiveConflicts(arr.filter((c: any) => String(c.fileId) === String(fileId)));
        
        const roomStr = uGet('current_room');
        const room = roomStr ? JSON.parse(roomStr) : null;
        if (room?.otp) {
          const _WEB_BASE = process.env.NEXT_PUBLIC_MATCHMAKER_URL || `${window.location.origin}/api/lobby`;
          fetch(`${_WEB_BASE}/conflicts?otp=${room.otp}&conflictId=${conflictIdToRemove}`, {
            method: 'DELETE',
          }).catch(() => {});
        }
      }
    } catch (e) {}
  };

  return (
    <PageShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="ds-btn" onClick={() => router.back()}>
            <ArrowLeft size={14} /> Back
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Document History</h1>
            <p style={{ fontSize: 13, color: 'var(--t3)', margin: '4px 0 0' }}>
              {fileName || `File ID: ${fileId}`} • {events.length} event{events.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/*
        The "Needs your review" panel used to live here: a stack of
        AUTOMATIC MERGE NOTIFICATION cards, one per divergence the editor
        had already resolved by itself.

        It is gone because it reported the same events twice. Every one of
        those cards describes a merge that has already happened, and the
        version list below records that merge as a "Conflict resolved"
        row — with the resulting document, the author, the time, and a
        Restore button that brings any of it back. The cards added a second,
        louder account of the same thing above it, and because an automatic
        merge needs no decision, "Needs your review" was asking for one that
        was not required.

        Nothing is lost by removing them: the merge is still recorded, the
        losing side is still kept as its own version, and both are still
        restorable from the list.
      */}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--t3)' }}>
          <RefreshCw size={24} className="spin" style={{ marginBottom: 12, opacity: 0.5, animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: 14 }}>Loading history from Host...</p>
        </div>
      ) : errorMsg ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#ef4444' }}>
          <AlertTriangle size={32} style={{ marginBottom: 12, opacity: 0.8 }} />
          <p style={{ fontSize: 14, fontWeight: 600 }}>Error</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>{errorMsg}</p>
        </div>
      ) : events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--t3)' }}>
          <Clock size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
          <p style={{ fontSize: 14 }}>No events yet</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>Edit a file to start generating history</p>
        </div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 24, paddingBottom: 40 }}>
          {offlineWarning && (
            <div style={{ 
              background: 'var(--amb-bg)', border: '1px solid var(--amb)', 
              color: 'var(--amb)', padding: '12px 16px', borderRadius: 8, 
              marginBottom: 20, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 
            }}>
              <AlertTriangle size={16} />
              {offlineWarning}
            </div>
          )}
          <div style={{ position: 'absolute', left: 11, top: 0, bottom: 0, width: 2, background: 'var(--b1)' }} />

          {events.map((ev, i) => {
            const isLatest = i === 0;
            const evInfo = EVENT_ICONS[ev.eventType] || EVENT_ICONS['edit'];
            const Icon = evInfo.icon;
            
            return (
              <div key={`${ev.eventId}-${i}`} style={{ position: 'relative', marginBottom: 16, opacity: ev.isCompacted ? 0.5 : 1 }}>
                <div style={{
                  position: 'absolute', left: -18, top: 16, width: 16, height: 16, borderRadius: '50%',
                  background: evInfo.bg, border: `2px solid ${evInfo.color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
                }}>
                  <Icon size={8} style={{ color: evInfo.color }} />
                </div>

                <div className="ds-card" style={{ padding: '12px 16px', marginLeft: 8, background: 'var(--s1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>v{events.length - i}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: evInfo.color }}>
                          {evInfo.label || ev.eventType}
                        </span>
                        {/*
                          The author's own clock, which is what Last-Write-
                          Wins arbitrates on. Shown as a labelled chip rather
                          than a bare `ts=1791070797258`: the raw number sat
                          next to the version number looking like the time of
                          the edit, and since it comes from whichever laptop
                          made it, two devices print different numbers for
                          the same version. The time on the right is the
                          server's, and is the same everywhere.
                        */}
                        <span
                          title={`Last-Write-Wins clock from ${ev.nodeId}: ${new Date(ev.logicalTimestamp).toLocaleString()}`}
                          style={{ fontSize: 10, color: 'var(--t3)', background: 'var(--b2)', padding: '2px 6px', borderRadius: 12, fontFamily: 'monospace', letterSpacing: 0.3 }}
                        >
                          LWW {ev.logicalTimestamp}
                        </span>
                        {isLatest && <span style={{ fontSize: 11, color: 'var(--grn)', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: 12, fontWeight: 600 }}>latest</span>}
                        {ev.isCompacted && <span style={{ fontSize: 11, color: 'var(--t3)', background: 'var(--b1)', padding: '2px 6px', borderRadius: 12 }}>compacted</span>}
                      </div>
                      
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 6 }}>
                        Modified by: <span style={{ fontFamily: 'monospace', color: 'var(--t2)' }}>{ev.nodeId}</span>
                      </div>
                    </div>
                    
                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 500, textAlign: 'right' }}>
                        {new Date(versionTime(ev)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        <br />
                        <span style={{ fontSize: 9 }}>{new Date(versionTime(ev)).toLocaleDateString()}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        <button
                          className="ds-btn ds-btn-ghost"
                          onClick={() => setViewFullEvent(ev)}
                          style={{ padding: '6px 10px', fontSize: 11, gap: 4 }}
                        >
                          <Eye size={12} /> View
                        </button>
                        {ev.eventType !== 'merge' && (
                          <button
                            className="ds-btn ds-btn-primary ds-btn-animate"
                            onClick={() => setConfirmRestore(ev)}
                            disabled={restoring[ev.eventId]}
                            style={{ padding: '6px 16px', fontSize: 13, gap: 6 }}
                          >
                            {restoring[ev.eventId] ? 'Restoring...' : 'Restore'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>


                </div>
              </div>
            );
          })}
        </div>
      )}

      {/*
        Restoring replaces the document for everyone in the room, so it asks
        first. The Restore button on each row used to do it on a single click
        with no warning at all; only the one inside the comparison view had a
        confirmation.
      */}
      {confirmRestore && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-restore-title"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={() => setConfirmRestore(null)}
        >
          <div
            className="ds-card"
            style={{
              background: 'var(--bg)', width: '100%', maxWidth: 520, padding: 24,
              border: '1px solid var(--b1)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-restore-title" style={{ margin: '0 0 10px', fontSize: 17, color: 'var(--t1)' }}>
              Restore this version?
            </h3>
            <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--t2)', lineHeight: 1.6 }}>
              The document will go back to how it was at{' '}
              <strong>{new Date(versionTime(confirmRestore)).toLocaleString()}</strong>, saved by{' '}
              <strong style={{ fontFamily: 'monospace' }}>{confirmRestore.nodeId}</strong>.
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--t2)', lineHeight: 1.6 }}>
              This replaces what everyone in the room is looking at now. The current
              version is not lost — it stays in this list, and the restore is added to
              it as well, so you can come back to either.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="ds-btn ds-btn-ghost" onClick={() => setConfirmRestore(null)}>
                No, cancel
              </button>
              <button
                className="ds-btn ds-btn-primary ds-btn-animate"
                disabled={!!restoring[confirmRestore.eventId]}
                onClick={() => {
                  const target = confirmRestore;
                  setConfirmRestore(null);
                  handleRestore(target.eventId, target.fullContent);
                }}
              >
                {restoring[confirmRestore.eventId] ? 'Restoring…' : 'Yes, restore it'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewFullEvent && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div className="ds-card" style={{
            background: 'var(--bg)', width: '100%', maxWidth: 1200, maxHeight: '85vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', border: '1px solid var(--b1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--b1)' }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Snapshot Content</h3>
              <button onClick={() => setViewFullEvent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t2)' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '0 20px', marginTop: 16 }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--t2)', marginBottom: 12 }}>
                Comparing the selected historical version against the <strong>latest version</strong>.
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: '0.8rem', color: 'var(--t3)', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'inline-block', width: 12, height: 12, background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', borderRadius: 2 }}></span> What will be removed from latest</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'inline-block', width: 12, height: 12, background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10b981', borderRadius: 2 }}></span> What will be restored (added)</div>
              </div>
            </div>

            <div style={{ padding: '0 20px 20px', overflowY: 'auto', flex: 1, fontSize: 14, color: 'var(--t1)' }}>
              {events.length > 0 && events[0].eventId === viewFullEvent.eventId && (
                <div style={{ fontSize: '0.85rem', color: 'var(--t2)', marginBottom: 12, fontStyle: 'italic' }}>
                  This is already the latest version — both pages below are identical.
                </div>
              )}
              {events.length > 0 ? renderDiff(viewFullEvent.fullContent || viewFullEvent.payloadPreview || '', events[0].fullContent || events[0].payloadPreview || '') : null}
            </div>

            <div style={{ padding: '12px 16px', background: 'var(--amb-bg)', border: '1px solid var(--amb)', color: 'var(--amb)', margin: '0 20px 16px', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <div style={{ flex: 1, fontSize: '0.85rem' }}>
                <strong>Warning:</strong> Restoring this historical version will overwrite the current content of the file. A new "Restore" event will be appended to the history log, preserving this moment.
              </div>
            </div>
            
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--b1)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="ds-btn ds-btn-ghost" onClick={() => setViewFullEvent(null)}>Cancel</button>
              <button
                className="ds-btn ds-btn-primary ds-btn-animate"
                style={{ background: '#10b981', borderColor: '#10b981' }}
                onClick={() => {
                  handleRestore(viewFullEvent.eventId, viewFullEvent.fullContent || viewFullEvent.payloadPreview || '');
                  setViewFullEvent(null);
                }}
              >
                Confirm and Restore
              </button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .ds-btn-animate {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .ds-btn-animate:hover:not(:disabled) {
          transform: translateY(-1px) scale(1.02);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);
        }
        .ds-btn-animate:active:not(:disabled) {
          transform: translateY(0) scale(0.98);
        }
      `}} />
    </PageShell>
  );
}
