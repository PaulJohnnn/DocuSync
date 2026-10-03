/**
 * @module line-merge-3way
 *
 * Base-anchored, line-granular 3-way merge for concurrent document edits.
 *
 * This exists because replaying one peer's patches onto the other peer's
 * document — what {@link ../lww/line-merge.mergeConcurrentEdit} does — cannot
 * express the property the engine actually needs:
 *
 *   A conflict belongs to the specific logical text region concurrently
 *   edited by multiple users. Independent edits on other regions must
 *   continue normally and must never be damaged by that conflict.
 *
 * Patch replay fails that in three measured ways:
 *
 *   - `Match_Threshold = 0` makes a hunk apply only at the exact offset it
 *     had in the base. One peer inserting or deleting a line shifts every
 *     later line, so the other peer's untouched-region hunks stop matching,
 *     are reported as conflicts, and are then discarded. An insertion on
 *     line 2 silently destroyed an unrelated edit on line 3.
 *   - diff cleanup can coalesce two distant changes into a single hunk, so
 *     one genuinely contested line drags an uncontested one down with it.
 *   - `Patch_Margin = 0` makes dmp's `patch_addContext_` loop forever on a
 *     pure insertion: it grows the context by `Patch_Margin` until the
 *     pattern is unique, the padding never grows, and an insertion's pattern
 *     is the empty string, whose `indexOf` and `lastIndexOf` never agree in a
 *     non-empty document. That is a synchronous spin on the main thread — the
 *     process stops answering IPC entirely.
 *
 * This merge is anchored on the base instead. Both sides are diffed against
 * the common ancestor at line granularity, every edit is attributed to the
 * base line (or the gap between base lines) it belongs to, and the two
 * attributions are combined position by position. Nothing is matched
 * fuzzily and no offset is ever searched for, so an edit in one region
 * cannot be disturbed by an edit in another.
 *
 * Determinism: the two peers call this with mirrored arguments — A has
 * (existing = A, incoming = B), B has (existing = B, incoming = A) — so the
 * merge must not prefer "existing" or "incoming" on its own. It does not.
 * Every decision is either position-local and symmetric, or, for a region
 * both sides changed, taken from `remoteWins`, which the caller derives from
 * a strict total order both peers compute identically. Both peers therefore
 * reach byte-identical output in one pass, with no extra round trip.
 */

import { diff_match_patch } from 'diff-match-patch';

export interface ThreeWayMergeResult {
  /** The merged document. */
  merged: string;
  /** True when at least one region was changed by both sides. */
  hadConflict: boolean;
  /** How many distinct regions were contested. */
  conflictHunks: number;
}

const DIFF_DELETE = -1;
const DIFF_INSERT = 1;
const DIFF_EQUAL = 0;

/**
 * Splits text into the units the merge treats as indivisible.
 *
 * A block-level HTML tag boundary counts as a line break, so a paragraph,
 * heading or list item is the merge unit for rich text exactly as a newline
 * is for plain text. Kept identical to `line-merge.ts` so both merges agree
 * on what a "line" is.
 */
function splitIntoLines(text: string): string[] {
  const withBreaks = text.replace(/(<\/(p|h1|h2|h3|h4|li|blockquote|tr)>)/gi, '$1\n');
  const lines = withBreaks.split('\n');
  return lines
    .map((l, i) => (i < lines.length - 1 ? l + '\n' : l))
    .filter((l) => l.length > 0);
}

/**
 * Encodes several texts against one shared line vocabulary, so each text
 * becomes a string in which every character stands for one whole line. This
 * turns diff-match-patch's character diff into a line diff where a line
 * either matches another exactly or does not match at all.
 */
function encodeLines(texts: string[]): { encoded: string[]; lineArray: string[] } {
  const lineArray: string[] = [''];
  const lineHash = new Map<string, number>();
  const encoded = texts.map((text) => {
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

/**
 * One side's edit, expressed entirely in terms of base positions.
 *
 * `replacement[i]` is what this side put in place of base line `i`: the base
 * line itself when untouched, an empty array when deleted, or one or more
 * lines when rewritten. `insertBefore[i]` is what this side added in the gap
 * immediately before base line `i`, and index `base.length` is the gap after
 * the final line.
 */
interface SideEdit {
  replacement: string[][];
  insertBefore: string[][];
  changedLine: boolean[];
  changedGap: boolean[];
}

/**
 * Attributes every change between `baseEnc` and `sideEnc` to a base line or
 * to a gap between base lines.
 *
 * A DELETE immediately followed by an INSERT is a rewrite, not a removal
 * plus an unrelated addition, so the inserted lines are attached to the
 * first deleted base line. Without that normalisation, two peers rewriting
 * the same line would be recorded as deleting the same line (one conflict,
 * correctly) *and* inserting into the same gap (a second region, where the
 * loser's text would reappear) — producing both versions in the output.
 */
function attribute(baseEnc: string, sideEnc: string, baseLines: string[], lineArray: string[]): SideEdit {
  const n = baseLines.length;
  const edit: SideEdit = {
    replacement: baseLines.map((l) => [l]),
    insertBefore: Array.from({ length: n + 1 }, () => [] as string[]),
    changedLine: new Array(n).fill(false),
    changedGap: new Array(n + 1).fill(false),
  };

  const dmp = new diff_match_patch();
  // No cleanup pass. Cleanup exists to make diffs read naturally for humans
  // and it merges small equalities into surrounding edits — which is exactly
  // how an uncontested line gets swept into a contested hunk. The raw,
  // minimal diff keeps each line's attribution precise.
  const diffs = dmp.diff_main(baseEnc, sideEnc) as [number, string][];

  let bi = 0; // current base line index
  for (let k = 0; k < diffs.length; k++) {
    const [op, data] = diffs[k];

    if (op === DIFF_EQUAL) {
      bi += data.length;
      continue;
    }

    if (op === DIFF_DELETE) {
      const next = diffs[k + 1];
      const inserted =
        next && next[0] === DIFF_INSERT
          ? Array.from(next[1]).map((ch) => lineArray[ch.charCodeAt(0)] ?? '')
          : [];
      if (inserted.length) k++; // consumed as the rewrite's new text

      for (let d = 0; d < data.length; d++) {
        const target = bi + d;
        if (target >= n) break;
        // The whole rewrite lands on the first deleted line; the rest of the
        // deleted run becomes empty. The region is the run, decided as one.
        edit.replacement[target] = d === 0 ? inserted : [];
        edit.changedLine[target] = true;
      }
      bi += data.length;
      continue;
    }

    // A pure insertion: nothing was removed, so it belongs to the gap.
    const lines = Array.from(data).map((ch) => lineArray[ch.charCodeAt(0)] ?? '');
    const gap = Math.min(bi, n);
    edit.insertBefore[gap] = edit.insertBefore[gap].concat(lines);
    edit.changedGap[gap] = true;
  }

  return edit;
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** What one side did to a base document, region by region. */
export interface SideAttribution {
  /** What replaced base line `i`: the line itself, `[]`, or new lines. */
  replacement: string[][];
  /** Lines added in the gap before base line `i`; index `n` is the tail. */
  insertBefore: string[][];
  changedLine: boolean[];
  changedGap: boolean[];
}

/**
 * Attributes `sideContent`'s differences from `baseContent` to base regions.
 *
 * Exposed so a caller can work out WHICH regions a particular event touched,
 * which is what per-region provenance needs. Every attribution is taken
 * against the same base, so region indices are stable across events even
 * when lines are inserted or deleted.
 */
export function attributeAgainstBase(baseContent: string, sideContent: string): SideAttribution {
  const { encoded, lineArray } = encodeLines([baseContent, sideContent]);
  const [baseEnc, sideEnc] = encoded;
  return attribute(baseEnc, sideEnc, splitIntoLines(baseContent), lineArray);
}

/** True when two attributions disagree about a base line. */
export function lineDiffers(a: SideAttribution, b: SideAttribution, i: number): boolean {
  return !same(a.replacement[i] ?? [], b.replacement[i] ?? []);
}

/** True when two attributions disagree about a gap between base lines. */
export function gapDiffers(a: SideAttribution, b: SideAttribution, i: number): boolean {
  return !same(a.insertBefore[i] ?? [], b.insertBefore[i] ?? []);
}

/**
 * Decides a region that both sides changed. `kind`/`index` identify the
 * region; returning true gives it to the incoming side.
 */
export type RegionDecider = (kind: 'line' | 'gap', index: number) => boolean;

/**
 * Merges two concurrent edits of one common ancestor, line by line.
 *
 * @param existingContent - this peer's current document
 * @param baseContent     - the common ancestor both edits were made from
 * @param incomingContent - the other peer's document
 * @param remoteWins      - who takes a region BOTH sides changed. The caller
 *                          must compute this from an order both peers agree
 *                          on, and pass the same verdict on both sides.
 *
 * @returns the merged document, and how many regions were contested.
 */
export function mergeThreeWay(
  existingContent: string,
  baseContent: string,
  incomingContent: string,
  remoteWins: boolean,
  decideRegion?: RegionDecider
): ThreeWayMergeResult {
  // Fast paths: a side that made no change contributes nothing to merge.
  if (baseContent === existingContent) {
    return { merged: incomingContent, hadConflict: false, conflictHunks: 0 };
  }
  if (baseContent === incomingContent) {
    return { merged: existingContent, hadConflict: false, conflictHunks: 0 };
  }
  if (existingContent === incomingContent) {
    return { merged: existingContent, hadConflict: false, conflictHunks: 0 };
  }

  const { encoded, lineArray } = encodeLines([baseContent, existingContent, incomingContent]);
  const [baseEnc, existingEnc, incomingEnc] = encoded;
  const baseLines = splitIntoLines(baseContent);

  const mine = attribute(baseEnc, existingEnc, baseLines, lineArray);
  const theirs = attribute(baseEnc, incomingEnc, baseLines, lineArray);

  const out: string[] = [];
  let conflicts = 0;

  const mergeRegion = (
    kind: 'line' | 'gap',
    index: number,
    changedMine: boolean,
    changedTheirs: boolean,
    valueMine: string[],
    valueTheirs: string[],
    fallback: string[]
  ): string[] => {
    if (changedMine && changedTheirs) {
      if (same(valueMine, valueTheirs)) return valueMine; // same edit, no contest
      conflicts++;
      // `decideRegion` resolves the region against the identity of the edit
      // that actually wrote THIS region, which is the only comparison that
      // every peer agrees on. `remoteWins` is a document-wide fallback for
      // when that identity cannot be established.
      const takeTheirs = decideRegion ? decideRegion(kind, index) : remoteWins;
      return takeTheirs ? valueTheirs : valueMine;
    }
    if (changedMine) return valueMine;
    if (changedTheirs) return valueTheirs;
    return fallback;
  };

  for (let i = 0; i < baseLines.length; i++) {
    out.push(
      ...mergeRegion(
        'gap', i,
        mine.changedGap[i],
        theirs.changedGap[i],
        mine.insertBefore[i],
        theirs.insertBefore[i],
        []
      )
    );
    out.push(
      ...mergeRegion(
        'line', i,
        mine.changedLine[i],
        theirs.changedLine[i],
        mine.replacement[i],
        theirs.replacement[i],
        [baseLines[i]]
      )
    );
  }

  const tail = baseLines.length;
  out.push(
    ...mergeRegion(
      'gap', tail,
      mine.changedGap[tail],
      theirs.changedGap[tail],
      mine.insertBefore[tail],
      theirs.insertBefore[tail],
      []
    )
  );

  return { merged: out.join(''), hadConflict: conflicts > 0, conflictHunks: conflicts };
}
