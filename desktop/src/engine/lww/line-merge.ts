/**
 * @module line-merge
 *
 * Position-aware, line-granular 3-way merge for concurrent document edits.
 *
 * This is the counterpart to `web/src/app/api/lobby/doc/route.ts`'s merge
 * logic — kept behaviorally identical so a room behaves the same whether
 * it's hosted by the Desktop P2P engine or falling back to the web cloud
 * relay. See that file's doc comment for the full rationale; summary:
 *
 * - Diffing base→incoming (the pushing peer's edit) at LINE/BLOCK
 *   granularity — not raw characters — tells us exactly which lines that
 *   peer changed. Character-level diffing is dangerous here: once one
 *   peer's edit replaces a word, the "old" text to search for is simply
 *   gone, and fuzzy character matching can silently reapply a hunk at the
 *   wrong location (e.g. an unrelated line that merely looks similar).
 *   Line-granularity avoids that — a line either matches exactly or it
 *   doesn't, no ambiguity.
 * - Replaying those line-hunks onto the CURRENT server content succeeds
 *   hunk-by-hunk: a hunk whose line is untouched by anyone else applies
 *   cleanly (different-line edits merge automatically, OT-like). A hunk
 *   whose line was also changed concurrently fails to apply — that's a
 *   genuine conflict, resolved by LWW timestamp, scoped to just that
 *   line/block. Every other hunk's merge result is left untouched.
 */

import { diff_match_patch } from 'diff-match-patch';

export interface MergeResult {
  merged: string;
  hadConflict: boolean;
  conflictHunks: number;
}

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
 * Splits text into "lines" for line-granular diffing. A block-level HTML
 * tag boundary counts as a line break too, so paragraphs/headings/list
 * items are the merge unit for rich text, same as literal newlines are
 * for plain text.
 */
function splitIntoLines(text: string): string[] {
  const withBreaks = text.replace(/(<\/(p|h1|h2|h3|h4|li|blockquote|tr)>)/gi, '$1\n');
  const lines = withBreaks.split('\n');
  return lines.map((l, i) => (i < lines.length - 1 ? l + '\n' : l)).filter(l => l.length > 0);
}

/**
 * Encodes several texts against one shared line vocabulary, so each text
 * becomes a string where every "character" is really one whole line. This
 * turns diff-match-patch's character-level diff/patch engine into a
 * robust line-level one: a hunk either matches a whole line or it
 * doesn't — no mid-word fuzzy matching to go wrong.
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
 * Merges a concurrent edit against the current server content instead of
 * picking one whole-document winner. See module doc comment for the
 * algorithm. `existingCommittedAt`/`incomingCommittedAt` decide, by LWW,
 * which side wins ONLY for the specific line(s) that genuinely conflict.
 */
export function mergeConcurrentEdit(
  existingContent: string,
  baseContent: string,
  incomingContent: string,
  existingCommittedAt: number,
  incomingCommittedAt: number
): MergeResult {
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
    return { merged: existingContent, hadConflict: false, conflictHunks: 0 };
  }

  const [mergedEnc, results] = dmp.patch_apply(patches as any, existingEnc);
  const failedIndices = (results as boolean[])
    .map((ok, i) => (ok ? -1 : i))
    .filter(i => i >= 0);

  if (failedIndices.length === 0) {
    return { merged: decodeLines(mergedEnc, lineArray), hadConflict: false, conflictHunks: 0 };
  }

  // Some line-hunks didn't find their expected lines — those exact
  // lines/blocks were edited by someone else concurrently. Decide those
  // hunks by LWW; every cleanly-merged hunk is left exactly as
  // `patch_apply` left it. Because everything here operates one whole
  // line at a time, a forced replacement can only ever swap out whole
  // lines — it can never land mid-word or duplicate a fragment.
  let finalEnc = mergedEnc;
  if (incomingCommittedAt >= existingCommittedAt) {
    [...failedIndices].reverse().forEach((i: number) => {
      const patch = patches[i];
      const start2 = patch.start2 ?? 0;
      const newLinesEnc = incomingEnc.slice(start2, start2 + patch.length2);
      const pos = Math.max(0, Math.min(start2, finalEnc.length));
      const removeLen = Math.min(patch.length1, finalEnc.length - pos);
      finalEnc = finalEnc.slice(0, pos) + newLinesEnc + finalEnc.slice(pos + removeLen);
    });
  }
  // else: incoming is the older edit — leave the server's lines at those
  // spots untouched, which `patch_apply` already did for failed hunks.

  return { merged: decodeLines(finalEnc, lineArray), hadConflict: true, conflictHunks: failedIndices.length };
}
