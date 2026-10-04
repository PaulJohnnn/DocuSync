import { NextResponse } from 'next/server';
import { diff_match_patch } from 'diff-match-patch';
import { redis, casSetIfNewer } from '@/lib/redis';
import { VectorClock } from '@/lib/vector-clock';
import type { VectorClockJSON, ClockRelation } from '@/lib/vector-clock';
import { documentSignature } from '@/lib/documentSignature';

export const dynamic = 'force-dynamic';

/**
 * How this push relates causally to the state already on the server.
 *
 * `null` means the question could not be asked — one of the two sides
 * carried no usable clock, which is the case for an older client and for
 * the very first write to a document.
 */
type CausalRelation = ClockRelation | null;

/**
 * Compares the pushing client's clock against the clock stored with the
 * current snapshot.
 *
 * Every client already sends its vector clock on this route and the server
 * already stores it — but nothing ever compared the two. Ordering was
 * decided entirely by `committedAt`, a wall-clock reading taken on the
 * client, which cannot distinguish the four cases that matter here: an
 * update that has seen everything the server has, one the server has
 * already incorporated, a duplicate, and a genuine concurrent edit. Two
 * laptops whose clocks differ by a minute produce the wrong answer for all
 * four. The clock is the thing that can answer it, so it is asked.
 *
 * Returning `null` rather than guessing keeps older clients working: the
 * content-based divergence test below still runs, exactly as before.
 *
 * @returns The relation of INCOMING to STORED, or `null` if undecidable.
 */
function compareCausally(
  incoming: VectorClockJSON | null | undefined,
  stored: VectorClockJSON | null | undefined
): CausalRelation {
  if (!incoming || !stored) return null;
  try {
    const a = VectorClock.fromJSON(incoming);
    const b = VectorClock.fromJSON(stored);
    // Clocks built with different node counts describe different trees and
    // cannot be compared component-wise; treating them as concurrent would
    // manufacture conflicts, so this declines to answer instead.
    if (incoming.nodeCount !== stored.nodeCount) return null;
    return a.compare(b);
  } catch {
    // A malformed or truncated clock is not evidence of anything.
    return null;
  }
}

/**
 * How far back the history log is checked before a state is accepted as a
 * new version. Two people editing the same document hand it back and forth,
 * so the state about to be logged is very often one that is already a few
 * rows down rather than the one directly above.
 */
const RECENT_HISTORY_WINDOW = 12;

/**
 * How long one author's consecutive saves keep collapsing into a single
 * version entry. Long enough to absorb a burst of autosaves while someone
 * types a sentence, short enough that pausing and coming back is recorded
 * as the separate revision it is.
 */
const HISTORY_FOLD_WINDOW_MS = 45_000;

/**
 * `@types/diff-match-patch` types `patch_make`/`patch_apply` as returning
 * `Array<typeof diff_match_patch.patch_obj>` — `typeof` there resolves to
 * the STATIC constructor type (`{ new(): patch_obj }`), not the instance
 * shape, so none of `start1`/`start2`/`length1`/`length2`/`diffs` actually
 * type-check on the array elements even though they exist at runtime. This
 * is the real instance shape; patches are cast through it below.
 */
interface PatchLike {
  diffs: [number, string][];
  start1: number | null;
  start2: number | null;
  length1: number;
  length2: number;
}

/**
 * Splits text into "lines" for line-granular diffing. A block-level HTML tag
 * boundary counts as a line break too (TipTap documents are HTML, not plain
 * text), so paragraphs/headings/list items are treated as the merge unit
 * for rich text, same as literal newlines are for plain text.
 */
function splitIntoLines(text: string): string[] {
  const withBreaks = text.replace(/(<\/(p|h1|h2|h3|h4|li|blockquote|tr)>)/gi, '$1\n');
  const lines = withBreaks.split('\n');
  // Re-attach the newline to every line but the last, mirroring how
  // diff-match-patch's own line-mode keeps line terminators attached so
  // reconstruction is a plain join with no separator logic needed.
  // Drop lines that carry no content. A document saved with literal newlines
  // between its block tags produces bare newline-only lines here, while the
  // same document re-serialised by the editor (which emits none) produces
  // no such lines — so the two sides had different line structures and the
  // merge could not align them. Patch hunks then addressed the wrong rows
  // and the splice ate whole paragraphs: a peer reconnecting after an
  // offline edit dropped the other peer's untouched leading line, and even
  // the opening wrapper tag, leaving malformed HTML. Whitespace carries no
  // meaning between HTML blocks, so ignoring it makes both sides agree.
  return lines
    .map((l, i) => (i < lines.length - 1 ? l + String.fromCharCode(10) : l))
    .filter(l => l.trim().length > 0);
}

/**
 * Encodes several texts against one shared line vocabulary, so each text
 * becomes a string where every "character" is really one whole line. This
 * turns diff-match-patch's character-level diff/patch engine into a robust
 * line-level one for free: a hunk either matches a whole line or it
 * doesn't — there's no more mid-word fuzzy matching to go wrong.
 */
function encodeLines(...texts: string[]): { encoded: string[]; lineArray: string[] } {
  const lineArray: string[] = [''];
  const lineHash = new Map<string, number>();
  const encoded = texts.map(text => {
    let chars = '';
    for (const line of splitIntoLines(text)) {
      let idx = lineHash.get(line);
      if (idx === undefined) {
        lineArray.push(line);
        idx = lineArray.length - 1;
        lineHash.set(line, idx);
      }
      chars += String.fromCharCode(idx);
    }
    return chars;
  });
  return { encoded, lineArray };
}

function decodeLines(encoded: string, lineArray: string[]): string {
  let out = '';
  for (let i = 0; i < encoded.length; i++) out += lineArray[encoded.charCodeAt(i)] ?? '';
  return out;
}

/**
 * Merges a concurrent edit against the current server content using a
 * position-aware, line-granular 3-way diff, instead of picking one
 * whole-document winner.
 *
 * `baseContent` is what the pushing client started editing from. Diffing
 * base→incoming (at line granularity) gives us exactly which lines/blocks
 * that client changed, as a set of patches. Replaying those patches onto
 * the CURRENT server content (which may have moved on due to another
 * peer's push) succeeds line-by-line:
 *
 * - A hunk whose lines are untouched on the server applies cleanly —
 *   that's an edit to a different line/paragraph, so it merges
 *   automatically with no conflict (OT-like behavior).
 * - A hunk whose lines have changed on the server fails to apply — that
 *   means another peer edited those exact lines concurrently. Only that
 *   hunk is a genuine conflict; every other hunk's merge result is left
 *   untouched.
 *
 * Genuine conflicts are resolved by LWW using commit timestamps, and the
 * replacement is spliced in as whole lines — never mid-word — so a
 * conflict can only ever corrupt the specific line(s) in question, not
 * adjacent text.
 */
function mergeConcurrentEdit(
  existingContent: string,
  baseContent: string,
  incomingContent: string,
  existingCommittedAt: number,
  incomingCommittedAt: number,
  /**
   * When the server stored the existing snapshot. Present for anything
   * written since snapshots began carrying a server clock; absent for older
   * ones, which fall back to comparing the authors' own clocks.
   */
  existingStoredAt?: number
): { merged: string; hadConflict: boolean; conflictHunks: number; lostChars: number } {
  const { encoded: [baseEnc, incomingEnc, existingEnc], lineArray } = encodeLines(
    baseContent, incomingContent, existingContent
  );

  const dmp = new diff_match_patch();
  // Bitap scores a candidate as `errors / patternLength +
  // distanceFromExpectedSpot / Match_Distance`. Each "character" here is a
  // whole line, so ANY error means a different line and must be rejected
  // — but a hunk whose lines are intact and merely SHIFTED (a peer inserted
  // paragraphs above it) must still be found, or the OT-like "edits to
  // different paragraphs merge cleanly" promise above breaks and every
  // such edit becomes a spurious conflict spliced at a stale offset. A
  // threshold of exactly 0 rejected those shifts too, since any distance
  // scores above 0. This pair accepts an exact-content match up to 200
  // lines from where it was expected (200 / 10000 = 0.02) while still
  // rejecting even one wrong line, whose cost is at least
  // 1 / Match_MaxBits = 1 / 32 ≈ 0.031. Patch_DeleteThreshold = 0 is a
  // second gate on the same rule.
  dmp.Match_Threshold = 0.02;
  dmp.Match_Distance = 10000;
  dmp.Patch_DeleteThreshold = 0;
  // Default context margin pads each hunk with a few extra unchanged
  // lines on either side for anchoring. On a short document that padding
  // can swallow nearly the whole file, so an edit to line 3 ends up
  // anchored on line 1 too — and fails to match if some OTHER peer's
  // unrelated edit already changed line 1. Each hunk is already a whole
  // line here, so no extra anchor context is needed at all.
  //
  dmp.Patch_Margin = 0;
  // A zero margin alone is a trap, though. patch_addContext_ grows its
  // anchor by `padding += Patch_Margin` inside a `while` loop that runs
  // until the anchor is unique in the text — with a margin of 0 the anchor
  // never changes and the loop never exits. It is entered by any hunk whose
  // pattern occurs more than once, which includes the EMPTY pattern of every
  // insertion-only hunk (someone adds a paragraph while a peer has also
  // pushed): `indexOf('')` is 0 but `lastIndexOf('')` is the text length.
  // That pinned the server at 100% CPU with no clients attached (stack
  // captured live: patch_addContext_ ← patch_make), and on Vercel it means
  // the push times out and silently fails. So context-adding is disabled
  // outright — that IS the behaviour a zero margin was meant to produce,
  // minus the hang. The margin itself must still be 0: patch_addPadding
  // assumes a hunk with no leading context sits at position 0 and shifts
  // it by the margin, so a non-zero margin would make every hunk that
  // isn't on the first line fail to apply.
  (dmp as any).patch_addContext_ = () => {};

  const patches = dmp.patch_make(baseEnc, incomingEnc) as unknown as PatchLike[];

  if (patches.length === 0) {
    return { merged: existingContent, hadConflict: false, conflictHunks: 0, lostChars: 0 };
  }

  const [mergedEnc, results] = dmp.patch_apply(patches as any, existingEnc);
  const failedIndices = results
    .map((ok: boolean, i: number) => (ok ? -1 : i))
    .filter((i: number) => i >= 0);

  if (failedIndices.length === 0) {
    return { merged: decodeLines(mergedEnc, lineArray), hadConflict: false, conflictHunks: 0, lostChars: 0 };
  }

  // Some line-hunks didn't find their expected lines — those exact
  // lines/blocks were edited by someone else concurrently. Decide those
  // hunks by LWW; every cleanly-merged hunk is left exactly as
  // `patch_apply` left it. Because everything here operates one whole
  // line at a time, a forced replacement can only ever swap out whole
  // lines — it can never land mid-word or duplicate a fragment.
  //
  // `lostChars` is measured for the thesis's Data Loss Rate metric: the
  // character length of whichever side's text on a conflicting line did
  // NOT make it into the final document — i.e. genuinely overwritten by
  // the LWW tie-break, as distinct from a user's own deliberate deletion
  // (that never triggers this branch at all, since it isn't a conflict).
  let finalEnc = mergedEnc;
  let lostChars = 0;
  // Which side of a contested line survives.
  //
  // This compared two AUTHOR clocks — the time each device stamped on its own
  // push. Across two laptops those clocks disagree, so the winner was decided
  // by whose system clock happened to be further ahead, not by who typed
  // last. Reported from the demo machine: one person finishes a sentence,
  // the other adds a single letter to the same line, and the single letter
  // wins because that machine's clock was fast.
  //
  // The server sees both writes arrive, on one clock, in a definite order.
  // The write being processed now is by definition the later arrival, so it
  // is the last write. That is the rule a user means by last-write-wins, and
  // it does not depend on anybody's clock being right.
  //
  // `storedAt` is written by the server on every snapshot. Where it is
  // missing — a snapshot stored before that field existed — there is nothing
  // to order by except the author clocks, so those are used as before.
  const canOrderByArrival = typeof existingStoredAt === 'number';
  const incomingWins = canOrderByArrival
    ? true
    : incomingCommittedAt >= existingCommittedAt;
  if (incomingWins) {
    // A failed hunk's `start1`/`length1` are positions in the BASE text.
    // The merged document is not the base: the other peer may have added
    // or removed lines above the conflict, and every hunk that did apply
    // cleanly has shifted what follows it. Splicing at the raw base offset
    // therefore replaced whichever line happened to sit there now — a
    // neighbour of the real conflict — leaving the peer's line in place
    // and destroying an unrelated one. Map both ends of the hunk through
    // the base → merged diff instead, which lands on the peer's version of
    // the same logical lines however far they moved, and absorbs a peer
    // that replaced N lines with M.
    const baseToMerged = dmp.diff_main(baseEnc, mergedEnc);
    const spans = failedIndices.map((i: number) => {
      const patch = patches[i];
      const start1 = patch.start1 ?? 0;
      const from = dmp.diff_xIndex(baseToMerged, start1);
      const to = dmp.diff_xIndex(baseToMerged, start1 + patch.length1);
      return { i, from: Math.min(from, to), to: Math.max(from, to) };
    });
    // Splice from the bottom up so earlier spans' offsets stay valid.
    spans.sort((a, b) => b.from - a.from).forEach(({ i, from, to }) => {
      const patch = patches[i];
      const start2 = patch.start2 ?? 0;
      const newLinesEnc = incomingEnc.slice(start2, start2 + patch.length2);
      const pos = Math.max(0, Math.min(from, finalEnc.length));
      const end = Math.max(pos, Math.min(to, finalEnc.length));
      const losingText = decodeLines(finalEnc.slice(pos, end), lineArray);
      lostChars += losingText.length;
      finalEnc = finalEnc.slice(0, pos) + newLinesEnc + finalEnc.slice(end);
    });
  } else {
    // else: incoming is the older edit — the server's lines at those spots
    // stay untouched (already true from `patch_apply`), so incoming's own
    // attempted text is what didn't make it in.
    failedIndices.forEach((i: number) => {
      const patch = patches[i];
      const start2 = patch.start2 ?? 0;
      const incomingText = decodeLines(incomingEnc.slice(start2, start2 + patch.length2), lineArray);
      lostChars += incomingText.length;
    });
  }

  return { merged: decodeLines(finalEnc, lineArray), hadConflict: true, conflictHunks: failedIndices.length, lostChars };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * Cheap, stable fingerprint of a document (FNV-1a, 32-bit, base 36).
 * The client computes this over the content it currently holds and sends it
 * as `have`; an identical value means there is nothing to send. Must stay
 * byte-for-byte identical to the copy in the editor.
 */
function contentFingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const otp = searchParams.get('otp');
  const fileId = searchParams.get('fileId');
  const since = searchParams.get('since') || '0';

  if (!otp || !fileId) {
    return NextResponse.json({ error: 'Missing otp or fileId' }, { status: 400, headers: corsHeaders });
  }

  try {
    const key = `doc_snapshot:${otp}:${fileId}`;
    const snapshot = await redis.get(key) as any;

    if (!snapshot) {
      return NextResponse.json({ upToDate: true, snapshot: null }, { headers: corsHeaders });
    }

    // Whether the caller already holds this exact document.
    //
    // This used to be a timestamp comparison, which cannot answer the
    // question: a peer whose edit lost a Last-Write-Wins arbitration holds
    // DIFFERENT content at the SAME point in time, and was told it was up to
    // date — so it never received the winning text and stayed permanently out
    // of step with everyone else. Comparing a hash of what the caller
    // actually has answers it exactly, and still costs one short query
    // parameter instead of shipping the document on every poll.
    const have = searchParams.get('have');
    const isUpToDate = have != null
      ? have === contentFingerprint(snapshot.content || '')
      : (() => { const cs = parseInt(since, 10); return cs >= (snapshot.committedAt || 0) && cs > 0; })();

    return NextResponse.json({
      upToDate: isUpToDate,
      snapshot: isUpToDate ? null : snapshot,
      content: isUpToDate ? null : snapshot.content,
      authorNodeId: snapshot.authorNodeId,
    }, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}

/**
 * The clock a merged snapshot should carry.
 *
 * A merge result reflects BOTH sides, so the state it leaves behind has seen
 * everything both clients had. Storing only the incoming clock — which is
 * what happened before — throws away the server's half of that history, so
 * the next client is compared against a clock that no longer describes the
 * document it is being compared with, and a genuinely stale push reads as
 * concurrent. Component-wise maximum is the merge a vector clock defines for
 * exactly this situation.
 */
function mergedClock(
  incoming: VectorClockJSON | null | undefined,
  stored: VectorClockJSON | null | undefined
): VectorClockJSON | null {
  if (!incoming) return stored ?? null;
  if (!stored) return incoming;
  try {
    if (incoming.nodeCount !== stored.nodeCount) return incoming;
    const merged = VectorClock.fromJSON(incoming);
    merged.merge(VectorClock.fromJSON(stored));
    return merged.toJSON();
  } catch {
    return incoming;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { otp, fileId, content, authorNodeId, vectorClock, seq, committedAt, isSessionEnd, isDone, baseContent, isOfflineReconnect, concurrentPeers } = body;

    if (!otp || !fileId || content === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders });
    }

    const key = `doc_snapshot:${otp}:${fileId}`;
    const now = Date.now();
    const incomingCommittedAt = committedAt || now;

    let written = true;
    let snapshot: any;
    let hadConflict = false;
    let conflictHunks = 0;
    let lostChars = 0;
    let mergeAttempted = false;
    let mergeErrored = false;
    const mergeT0 = Date.now();

    const existing = (await redis.get(key)) as any;

    // What the causal history says about this push, before any content is
    // looked at. `null` where it cannot be decided — an older client, or the
    // first write to this document — in which case everything below falls
    // through to the content comparison that has always been here.
    const relation = compareCausally(vectorClock, existing?.vectorClock);

    // Whether this push can be dropped on the strength of the clock alone.
    //
    // The web client's clock has three slots — one host, two peers — so a
    // third device in the room shares a slot with one of the others and the
    // two become causally indistinguishable. Under a shared slot, "equal"
    // and "dominated" stop meaning what they say: a genuine new edit from
    // one device can read as a duplicate of, or as older than, an unrelated
    // edit from the device it collides with. Dropping it would delete
    // somebody's work with nothing to show for it.
    //
    // So a push is only ever dropped when it came from the SAME author the
    // stored state came from. That is where duplicates actually originate —
    // a retry, a reconnect replay, an editor pushing twice — and one author
    // cannot collide with themselves. Anything from a different peer goes to
    // the merge below, which keeps both sides, however the clocks compare.
    const sameAuthor = !!authorNodeId && existing?.authorNodeId === authorNodeId;

    // The server has already incorporated this exact state. Re-applying it
    // is at best wasted work and at worst a second history entry for one
    // edit, so it is acknowledged and dropped. This is what makes a
    // duplicate delivery — a retry, a reconnect replay, a message arriving
    // twice — harmless rather than visible.
    if (relation === 'equal' && sameAuthor) {
      return NextResponse.json(
        { success: true, ignored: true, reason: 'duplicate', snapshot: existing },
        { headers: corsHeaders }
      );
    }

    // The stored state strictly dominates this push: the server already has
    // everything the client knew, plus more the client has not seen. From
    // the same author, that is an out-of-order retry of their own earlier
    // state, and writing it would roll the document back to a point they
    // have already moved past — which is exactly what the old wall-clock
    // comparison did whenever the stale push carried the later timestamp.
    // The client is handed the current state instead and pushes again from
    // it. From a different author the same reading may only be a shared
    // clock slot, so it is merged rather than refused.
    if (relation === 'dominated' && sameAuthor) {
      return NextResponse.json(
        { success: true, ignored: true, reason: 'stale', snapshot: existing },
        { headers: corsHeaders }
      );
    }

    // `relation === 'dominant'` means this client has seen everything the
    // server has, so its push is a straightforward continuation and needs no
    // merge however the content compares. `relation === 'concurrent'` means
    // neither side has seen the other, which is a genuine conflict and must
    // be merged even if the content heuristic below would have missed it.
    const causallyConcurrent = relation === 'concurrent';
    const causallyAhead = relation === 'dominant';

    if (!causallyAhead
        && existing
        && (causallyConcurrent
            || (baseContent !== undefined && baseContent !== null && baseContent !== existing.content))) {
      // The pushing client's base has diverged from the current server
      // state — someone else committed in between. Merge position-aware
      // instead of blindly picking one whole snapshot.
      mergeAttempted = true;
      // A client whose clock says it is concurrent may still not have sent a
      // base. Falling back to the server's current content makes the merge
      // degenerate to applying this client's changes over it, which is the
      // safe reading: it can add, but cannot silently revert what it never
      // saw, which passing `undefined` here would have done.
      const effectiveBase = typeof baseContent === 'string' ? baseContent : existing.content;
      let result;
      try {
        result = mergeConcurrentEdit(
          existing.content,
          effectiveBase,
          content,
          existing.committedAt || 0,
          incomingCommittedAt,
          existing.storedAt
        );
      } catch (mergeErr) {
        // Fall back to keeping the server's current content rather than
        // corrupting it — and record the failure honestly for the
        // Resolution Accuracy metric instead of silently pretending it
        // succeeded.
        mergeErrored = true;
        result = { merged: existing.content, hadConflict: true, conflictHunks: 1, lostChars: content.length };
      }
      hadConflict = result.hadConflict;
      conflictHunks = result.conflictHunks;
      lostChars = result.lostChars;

      snapshot = {
        content: result.merged,
        authorNodeId,
        vectorClock: mergedClock(vectorClock, existing?.vectorClock),
        seq,
        committedAt: Date.now(),
        // The server's own clock, written on every snapshot. `committedAt`
        // is the AUTHOR's, because Last-Write-Wins arbitrates on it, so it
        // can move backwards between two snapshots when two authors' clocks
        // differ — and a client using it to tell new state from old would
        // sit frozen, ignoring real updates stamped by a slower machine.
        // This one only ever increases.
        storedAt: Date.now(),
      };
      await redis.set(key, snapshot, { ex: 60 * 60 * 24 });
    } else {
      // First write, or the client was already in sync with the server
      // (base === current) — a plain fast-forward write is correct and
      // needs no merge. Keep the atomic CAS here as a safety net against
      // a genuinely simultaneous first-write race.
      const casResult = await casSetIfNewer(
        key,
        { content, authorNodeId, vectorClock: vectorClock || null, seq, committedAt: incomingCommittedAt, storedAt: Date.now() },
        60 * 60 * 24
      );
      written = casResult.written;
      snapshot = casResult.snapshot;

      // The divergence test above was made against a snapshot read BEFORE
      // this write. When two clients post from the same base at the same
      // moment, neither read sees the other, so both take this branch and
      // neither merges — and `casSetIfNewer` then resolves them by
      // timestamp, which is whole-document last-write-wins. The later edit
      // replaces the earlier one outright. Measured: two clients editing
      // different paragraphs from the same base, and one paragraph's edit
      // was simply gone.
      //
      // Re-read after writing and check again. The writer that lost the
      // race now sees content that is neither its own nor the base it
      // started from, which is precisely the condition the merge exists
      // for, so it merges and commits the result. The writer that won sees
      // its own content and does nothing.
      if (baseContent !== undefined && baseContent !== null) {
        const after = (await redis.get(key)) as any;
        const theirs = after?.content;
        if (
          typeof theirs === 'string' &&
          theirs !== content &&
          theirs !== baseContent
        ) {
          mergeAttempted = true;
          let result;
          try {
            result = mergeConcurrentEdit(
              theirs,
              baseContent,
              content,
              after?.committedAt || 0,
              incomingCommittedAt,
              after?.storedAt
            );
          } catch {
            mergeErrored = true;
            result = { merged: theirs, hadConflict: true, conflictHunks: 1, lostChars: content.length };
          }
          hadConflict = result.hadConflict;
          conflictHunks = result.conflictHunks;
          lostChars = result.lostChars;

          snapshot = {
            content: result.merged,
            authorNodeId,
            vectorClock: mergedClock(vectorClock, after?.vectorClock),
            seq,
            committedAt: Date.now(),
            storedAt: Date.now(),
          };
          await redis.set(key, snapshot, { ex: 60 * 60 * 24 });
          written = true;
        }
      }
    }

    if (!written) {
      return NextResponse.json({ success: true, ignored: true, snapshot }, { headers: corsHeaders });
    }

    const finalContent = snapshot.content;

    // Record history if the user explicitly saves, or a genuine conflict
    // hunk was just resolved — that's exactly the kind of event this log
    // exists to make auditable.
    if (isSessionEnd || isDone || hadConflict) {
      const historyKey = `doc_history:${otp}:${fileId}`;
      const parseEntry = (raw: any) => {
        // The Redis client sometimes auto-deserializes list entries back
        // into objects instead of returning the raw JSON string — handle
        // both, otherwise JSON.parse throws on an object, is silently
        // swallowed below, and the dedup checks never actually fire.
        try {
          return typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch {
          return null;
        }
      };

      // Only the head of the list used to be checked, so a document two
      // people were both editing logged a new version on every single
      // exchange: A's state, B's state, A's state again — each one "not
      // equal to the one before it", none of them new. A minute of normal
      // two-person editing produced the wall of near-identical versions
      // this timeline is supposed to summarise. A state that is already
      // in the recent history is not a new version, wherever it sits.
      const recentRaw = await redis.lrange(historyKey, 0, RECENT_HISTORY_WINDOW - 1);
      const recent = recentRaw.map(parseEntry).filter(Boolean);
      // Whitespace-insensitive, because the merge re-serialises the document
      // and can return the same words with a newline added between two tags.
      // Compared literally, that counts as a new version and the page shows
      // two rows a reader cannot tell apart.
      // Compared on what the page renders, not on the markup string. Two
      // saves can differ only by an empty paragraph the user left behind, or
      // by `<p></p>` versus `<p><br></p>` for the same empty paragraph, or by
      // a line break the merge inserted between block tags — all invisible,
      // all different strings. See lib/documentSignature.ts.
      const normalise = documentSignature;
      const finalNorm = normalise(finalContent);
      // A conflict is always recorded, even when the text it settles on
      // happens to match a version already in the log. The entry is not
      // there to describe the resulting words — it is there to say that two
      // people disagreed and how it was decided, which is the one thing a
      // reader cannot reconstruct from the versions themselves.
      const alreadyLogged = !hadConflict && recent.some(
        (e: any) => typeof e.fullContent === 'string' && normalise(e.fullContent) === finalNorm
      );

      if (!alreadyLogged) {
        // 'offline-replay': a peer reconnecting after editing offline had a
        // genuine overlap with what happened on the server meanwhile —
        // surfaced distinctly from an ordinary online concurrent-edit
        // conflict, since the causes (and what the user needs to review)
        // are different.
        const eventType = hadConflict
          ? (isOfflineReconnect ? 'offline-replay' : 'conflict-resolve')
          : (isSessionEnd ? 'session-snapshot' : 'edit');

        // Ordering and display both run off server time, never off
        // `logicalTimestamp`. That field carries the AUTHOR's clock,
        // because Last-Write-Wins arbitration above is defined on it — but
        // two devices whose clocks differ by a few minutes then disagree
        // about which version is newer, and each shows the shared log in
        // its own order with its own times. `seqNo` is assigned by the one
        // machine every peer talks to, so every device sorts identically.
        const seqNo = await redis.incr(`doc_history_seq:${otp}:${fileId}`);
        const recordedAt = Date.now();
        const historyEvent = {
          // Date.now() alone collides whenever two peers commit inside the
          // same millisecond, and the page keys and de-duplicates on this.
          eventId: `${recordedAt}-${seqNo}`,
          seqNo,
          fileId,
          nodeId: authorNodeId,
          eventType,
          logicalTimestamp: incomingCommittedAt,
          recordedAt,
          payloadPreview: finalContent.substring(0, 100), // Preview only to save space
          fullContent: finalContent, // Keep full content for conflict diff viewing
          conflictHunks: hadConflict ? conflictHunks : undefined,
          createdAt: new Date(recordedAt).toISOString(),
          isCompacted: false,
        };

        // One person typing is one version, not one per autosave. If the
        // newest entry is the same author continuing the same kind of edit
        // moments ago, this supersedes it in place rather than stacking
        // another row — the same reason a word processor shows "edited by
        // Zyra, 10:42" once instead of forty times. A conflict is never
        // folded away: that is the event the log exists to show.
        const head = recent[0];
        const canFold =
          head &&
          !hadConflict &&
          // Deliberately NOT also requiring the same event type. The editor
          // alternates between an autosave and an explicit save as the user
          // works, which arrive as 'edit' and 'session-snapshot', so
          // requiring a match meant one person typing for a minute produced a
          // row per keystroke-burst — the two flags took turns and nothing
          // ever folded. What matters is that it is the same person
          // continuing, not which flag their client happened to send.
          head.nodeId === authorNodeId &&
          // A conflict is never folded away, in either direction: it is the
          // one event the log exists to show.
          head.eventType !== 'conflict-resolve' &&
          head.eventType !== 'offline-replay' &&
          typeof head.recordedAt === 'number' &&
          recordedAt - head.recordedAt < HISTORY_FOLD_WINDOW_MS;

        if (canFold) {
          await redis.lset(historyKey, 0, JSON.stringify({ ...historyEvent, seqNo: head.seqNo ?? seqNo }));
        } else {
          // When Last-Write-Wins settles a same-line disagreement, the text
          // that lost is not in the merged result and was not in the log
          // either — only the winning version was ever written. The author
          // who lost had no way back to their own words, from a page whose
          // whole purpose is restoring earlier versions. Their submission is
          // kept as its own version, directly beneath the resolution, so the
          // arbitration is visible AND reversible.
          // Compared with whitespace collapsed: the merge re-serialises the
          // document and can hand back the author's own text differing only
          // by a newline between tags. Logged as-is that reads on screen as
          // two versions with identical words, which is the duplication this
          // page is meant to be free of.
          const sameWords = (x: string, y: string) => normalise(x) === normalise(y);
          if (hadConflict && typeof content === 'string' && content && !sameWords(content, finalContent)
              && !recent.some((e: any) => typeof e.fullContent === 'string' && sameWords(e.fullContent, content))) {
            const losingSeq = await redis.incr(`doc_history_seq:${otp}:${fileId}`);
            await redis.lpush(historyKey, JSON.stringify({
              ...historyEvent,
              eventId: `${recordedAt}-${losingSeq}`,
              seqNo: losingSeq,
              eventType: 'edit',
              payloadPreview: content.substring(0, 100),
              fullContent: content,
              conflictHunks: undefined,
            }));
            // The resolution is written after, so it takes the higher
            // sequence number and sits above this on every device.
            const resolvedSeq = await redis.incr(`doc_history_seq:${otp}:${fileId}`);
            historyEvent.seqNo = resolvedSeq;
            historyEvent.eventId = `${recordedAt}-${resolvedSeq}`;
          }
          await redis.lpush(historyKey, JSON.stringify(historyEvent));
          // Trim history to 50 items
          await redis.ltrim(historyKey, 0, 49);
        }
      }
    }

    // Real, measured counters backing the thesis's RQ4/RQ5 metrics — see
    // `/api/lobby/metrics` for how these are turned into the actual named
    // formulas (Latency, Throughput, Conflict Resolution Time, Data Loss
    // Rate, Consistency Success Rate, System Scalability). Nothing here is
    // a placeholder: every field is incremented from what this specific
    // request actually did.
    try {
      const statsKey = `doc_stats:${otp}`;
      const stats = ((await redis.get(statsKey)) as any) || {
        sessionStartedAt: Date.now(),
        totalPushes: 0,
        successfulPushes: 0,
        totalConflicts: 0,
        totalMergeMs: 0,
        totalChars: 0,
        totalLostChars: 0,
        mergeAttempts: 0,
        mergeErrors: 0,
        // Throughput bucketed by how many peers were connected at push
        // time — this is what System Scalability (SS = T_N / T_baseline)
        // is actually measured against: real solo-session throughput vs.
        // real multi-user throughput, not an assumed curve. Each bucket
        // tracks its OWN first/last push timestamp — using "time since
        // session start" for both would make an early solo push look
        // like it happened in ~0ms (session just started), producing an
        // absurd, artificially inflated solo throughput.
        soloPushes: 0,
        soloFirstAt: 0,
        soloLastAt: 0,
        multiPushes: 0,
        multiFirstAt: 0,
        multiLastAt: 0,
      };
      stats.totalPushes += 1;
      stats.successfulPushes += 1; // reaching here means the write succeeded
      stats.totalChars += finalContent.length;
      if (mergeAttempted) stats.mergeAttempts += 1;
      if (mergeErrored) stats.mergeErrors += 1;
      if (hadConflict) {
        stats.totalConflicts += 1;
        stats.totalMergeMs += (Date.now() - mergeT0);
        stats.totalLostChars += lostChars;
      }
      const pushNow = Date.now();
      if ((concurrentPeers || 1) <= 1) {
        stats.soloPushes += 1;
        if (!stats.soloFirstAt) stats.soloFirstAt = pushNow;
        stats.soloLastAt = pushNow;
      } else {
        stats.multiPushes += 1;
        if (!stats.multiFirstAt) stats.multiFirstAt = pushNow;
        stats.multiLastAt = pushNow;
      }
      await redis.set(statsKey, stats, { ex: 60 * 60 * 24 * 7 });
    } catch (_e) {
      // Stats are informational for the metrics dashboard; never fail the
      // actual sync write over a stats-tracking hiccup.
    }

    return NextResponse.json({ success: true, snapshot, hadConflict, conflictHunks }, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
