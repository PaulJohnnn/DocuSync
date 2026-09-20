import { NextResponse } from 'next/server';
import { diff_match_patch } from 'diff-match-patch';
import { redis, casSetIfNewer } from '@/lib/redis';

export const dynamic = 'force-dynamic';

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
  return lines.map((l, i) => (i < lines.length - 1 ? l + '\n' : l)).filter(l => l.length > 0);
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
  incomingCommittedAt: number
): { merged: string; hadConflict: boolean; conflictHunks: number; lostChars: number } {
  const { encoded: [baseEnc, incomingEnc, existingEnc], lineArray } = encodeLines(
    baseContent, incomingContent, existingContent
  );

  const dmp = new diff_match_patch();
  // Force exact matching. At line granularity each "character" is really
  // a whole line/block, so any fuzziness at all can make a 1-line hunk
  // match against an unrelated line that merely LOOKS similar under
  // bitap's length-normalized scoring — exactly the case that must be
  // treated as a conflict, not silently applied in the wrong place.
  dmp.Match_Threshold = 0;
  dmp.Match_Distance = 1000;
  dmp.Patch_DeleteThreshold = 0;
  // Default context margin pads each hunk with a few extra unchanged
  // lines on either side for anchoring. On a short document that padding
  // can swallow nearly the whole file, so an edit to line 3 ends up
  // anchored on line 1 too — and fails to match if some OTHER peer's
  // unrelated edit already changed line 1. Each hunk is already a whole
  // line here, so no extra anchor context is needed at all.
  dmp.Patch_Margin = 0;

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
  const incomingWins = incomingCommittedAt >= existingCommittedAt;
  if (incomingWins) {
    // Apply in reverse index order so each hunk's own offset stays valid
    // as earlier splices shift the string.
    [...failedIndices].reverse().forEach((i: number) => {
      const patch = patches[i];
      const start2 = patch.start2 ?? 0;
      const newLinesEnc = incomingEnc.slice(start2, start2 + patch.length2);
      const pos = Math.max(0, Math.min(start2, finalEnc.length));
      const removeLen = Math.min(patch.length1, finalEnc.length - pos);
      const losingText = decodeLines(finalEnc.slice(pos, pos + removeLen), lineArray);
      lostChars += losingText.length;
      finalEnc = finalEnc.slice(0, pos) + newLinesEnc + finalEnc.slice(pos + removeLen);
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

    const clientSince = parseInt(since, 10);
    const isUpToDate = clientSince >= (snapshot.committedAt || 0) && clientSince > 0;

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

    if (existing && baseContent !== undefined && baseContent !== null && baseContent !== existing.content) {
      // The pushing client's base has diverged from the current server
      // state — someone else committed in between. Merge position-aware
      // instead of blindly picking one whole snapshot.
      mergeAttempted = true;
      let result;
      try {
        result = mergeConcurrentEdit(
          existing.content,
          baseContent,
          content,
          existing.committedAt || 0,
          incomingCommittedAt
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
        vectorClock: vectorClock || null,
        seq,
        committedAt: Date.now(),
      };
      await redis.set(key, snapshot, { ex: 60 * 60 * 24 });
    } else {
      // First write, or the client was already in sync with the server
      // (base === current) — a plain fast-forward write is correct and
      // needs no merge. Keep the atomic CAS here as a safety net against
      // a genuinely simultaneous first-write race.
      const casResult = await casSetIfNewer(
        key,
        { content, authorNodeId, vectorClock: vectorClock || null, seq, committedAt: incomingCommittedAt },
        60 * 60 * 24
      );
      written = casResult.written;
      snapshot = casResult.snapshot;
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
      let skipLog = false;
      const latestRaw = await redis.lindex(historyKey, 0);
      if (latestRaw) {
        try {
          // The Redis client sometimes auto-deserializes list entries back
          // into objects instead of returning the raw JSON string — handle
          // both, otherwise JSON.parse throws on an object, is silently
          // swallowed below, and this dedup check never actually fires.
          const latest = typeof latestRaw === 'string' ? JSON.parse(latestRaw) : latestRaw;
          if (latest.fullContent === finalContent) {
            skipLog = true;
          }
        } catch (e) {}
      }

      if (!skipLog) {
        // 'offline-replay': a peer reconnecting after editing offline had a
        // genuine overlap with what happened on the server meanwhile —
        // surfaced distinctly from an ordinary online concurrent-edit
        // conflict, since the causes (and what the user needs to review)
        // are different.
        const eventType = hadConflict
          ? (isOfflineReconnect ? 'offline-replay' : 'conflict-resolve')
          : (isSessionEnd ? 'session-snapshot' : 'edit');
        const historyEvent = {
          eventId: Date.now().toString(),
          fileId,
          nodeId: authorNodeId,
          eventType,
          logicalTimestamp: incomingCommittedAt,
          payloadPreview: finalContent.substring(0, 100), // Preview only to save space
          fullContent: finalContent, // Keep full content for conflict diff viewing
          conflictHunks: hadConflict ? conflictHunks : undefined,
          createdAt: new Date().toISOString(),
          isCompacted: false,
        };
        await redis.lpush(historyKey, JSON.stringify(historyEvent));
        // Trim history to 50 items
        await redis.ltrim(historyKey, 0, 49);
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
