/**
 * Line-level conflict granularity, at the merge-function level.
 *
 * Every case is run from BOTH peers' points of view — peer A calls with
 * (existing = A, incoming = B), peer B with (existing = B, incoming = A) —
 * and both must produce the identical document. Convergence alone is not
 * accepted: each case also names the text that must survive, because two
 * peers agreeing on a document that lost an edit is the exact failure this
 * merge exists to prevent.
 *
 * `remoteWins` is what the caller derives from a strict total order over
 * (logicalTimestamp, nodeId). A peer is told "the other side wins" exactly
 * when the other peer is told "I win", so the mirrored calls below pass
 * `remoteWins = false` for A and `true` for B — i.e. A's text wins every
 * contested region in these cases.
 */
import { mergeThreeWay } from '../../src/engine/lww/line-merge-3way';

interface Case {
  id: string;
  base: string;
  a: string;
  b: string;
  /** Text that must appear in the merged result on both peers. */
  survives: string[];
  /** Text that must NOT appear. */
  gone?: string[];
  /** Expected contested-region count, when it is the point of the case. */
  conflicts?: number;
}

const rows = (n: number, replace?: [string, string]) => {
  let out = Array.from({ length: n }, (_, i) => `L10 row ${String(i + 1).padStart(2, '0')}.`).join('\n');
  if (replace) out = out.replace(replace[0], replace[1]);
  return out + '\n';
};

const cases: Case[] = [
  {
    id: 'L2 concurrent edits on different lines keep both',
    base: 'L2 region one.\nL2 region two.\nL2 region three.\n',
    a: 'L2 region one. FROM-A.\nL2 region two.\nL2 region three.\n',
    b: 'L2 region one.\nL2 region two.\nL2 region three. FROM-B.\n',
    survives: ['L2 region one. FROM-A.', 'L2 region two.', 'L2 region three. FROM-B.'],
    conflicts: 0,
  },
  {
    id: 'L3 concurrent edits on the same line contest only that line',
    base: 'L3 contested line.\nL3 bystander two.\nL3 bystander three.\n',
    a: 'L3 contested line. FROM-A.\nL3 bystander two.\nL3 bystander three.\n',
    b: 'L3 contested line. FROM-B.\nL3 bystander two.\nL3 bystander three.\n',
    survives: ['L3 contested line. FROM-A.', 'L3 bystander two.', 'L3 bystander three.'],
    gone: ['L3 contested line. FROM-B.'],
    conflicts: 1,
  },
  {
    id: 'L4 a contested line does not damage either side’s far edits',
    base: 'L4 contested one.\nL4 quiet two.\nL4 independent three.\nL4 b-region four.\n',
    a: 'L4 contested one. FROM-A.\nL4 quiet two.\nL4 independent three. ALSO-A.\nL4 b-region four.\n',
    b: 'L4 contested one. FROM-B.\nL4 quiet two.\nL4 independent three.\nL4 b-region four. ALSO-B.\n',
    survives: [
      'L4 contested one. FROM-A.',
      'L4 quiet two.',
      'L4 independent three. ALSO-A.',
      'L4 b-region four. ALSO-B.',
    ],
    gone: ['L4 contested one. FROM-B.'],
    conflicts: 1,
  },
  {
    id: 'L5 an insertion does not displace an edit further down',
    base: 'L5 head one.\nL5 middle two.\nL5 tail three.\n',
    a: 'L5 head one.\nL5 INSERTED-BY-A.\nL5 middle two.\nL5 tail three.\n',
    b: 'L5 head one.\nL5 middle two.\nL5 tail three. FROM-B.\n',
    survives: ['L5 head one.', 'L5 INSERTED-BY-A.', 'L5 middle two.', 'L5 tail three. FROM-B.'],
    conflicts: 0,
  },
  {
    id: 'L7 a deletion does not displace an edit further down',
    base: 'L7 keep one.\nL7 doomed two.\nL7 keep three.\nL7 edited four.\n',
    a: 'L7 keep one.\nL7 keep three.\nL7 edited four.\n',
    b: 'L7 keep one.\nL7 doomed two.\nL7 keep three.\nL7 edited four. FROM-B.\n',
    survives: ['L7 keep one.', 'L7 keep three.', 'L7 edited four. FROM-B.'],
    gone: ['L7 doomed two.'],
    conflicts: 0,
  },
  {
    id: 'L8 block granularity: different paragraphs merge, middle untouched',
    base: '<p>L8 para one.</p>\n<p>L8 para two.</p>\n<p>L8 para three.</p>\n',
    a: '<p>L8 para one. FROM-A.</p>\n<p>L8 para two.</p>\n<p>L8 para three.</p>\n',
    b: '<p>L8 para one.</p>\n<p>L8 para two.</p>\n<p>L8 para three. FROM-B.</p>\n',
    survives: ['L8 para one. FROM-A.', '<p>L8 para two.</p>', 'L8 para three. FROM-B.'],
    conflicts: 0,
  },
  {
    id: 'L10 one contested row of twelve leaves the other eleven intact',
    base: rows(12),
    a: rows(12, ['L10 row 06.', 'L10 row 06. FROM-A.']),
    b: rows(12, ['L10 row 06.', 'L10 row 06. FROM-B.']),
    survives: [
      'L10 row 01.', 'L10 row 02.', 'L10 row 03.', 'L10 row 04.', 'L10 row 05.',
      'L10 row 06. FROM-A.',
      'L10 row 07.', 'L10 row 08.', 'L10 row 09.', 'L10 row 10.', 'L10 row 11.', 'L10 row 12.',
    ],
    gone: ['L10 row 06. FROM-B.'],
    conflicts: 1,
  },
  {
    id: 'both sides insert into the same gap: contested, one survives',
    base: 'G head.\nG tail.\n',
    a: 'G head.\nG FROM-A inserted.\nG tail.\n',
    b: 'G head.\nG FROM-B inserted.\nG tail.\n',
    survives: ['G head.', 'G FROM-A inserted.', 'G tail.'],
    gone: ['G FROM-B inserted.'],
    conflicts: 1,
  },
  {
    id: 'both sides make the identical edit: no conflict',
    base: 'S one.\nS two.\n',
    a: 'S one. SAME.\nS two.\n',
    b: 'S one. SAME.\nS two.\n',
    survives: ['S one. SAME.', 'S two.'],
    conflicts: 0,
  },
  {
    id: 'one side deletes a line the other edits: contested, no duplication',
    base: 'D one.\nD two.\nD three.\n',
    a: 'D one.\nD three.\n',
    b: 'D one.\nD two. FROM-B.\nD three.\n',
    survives: ['D one.', 'D three.'],
    gone: ['D two.', 'D two. FROM-B.'],
    conflicts: 1,
  },
  {
    id: 'edits at opposite ends of a long document both land',
    base: rows(12),
    a: rows(12, ['L10 row 01.', 'L10 row 01. FROM-A.']),
    b: rows(12, ['L10 row 12.', 'L10 row 12. FROM-B.']),
    survives: ['L10 row 01. FROM-A.', 'L10 row 12. FROM-B.', 'L10 row 06.'],
    conflicts: 0,
  },
  {
    id: 'an insertion and a deletion in separate regions both land',
    base: 'M one.\nM two.\nM three.\nM four.\n',
    a: 'M one.\nM INSERTED.\nM two.\nM three.\nM four.\n',
    b: 'M one.\nM two.\nM four.\n',
    survives: ['M one.', 'M INSERTED.', 'M two.', 'M four.'],
    gone: ['M three.'],
    conflicts: 0,
  },
];

describe('mergeThreeWay — line-level conflict granularity', () => {
  for (const c of cases) {
    it(c.id, () => {
      // A is told it wins contested regions; B is told the remote (A) wins.
      const onA = mergeThreeWay(c.a, c.base, c.b, false);
      const onB = mergeThreeWay(c.b, c.base, c.a, true);

      expect(onA.merged).toBe(onB.merged);

      for (const text of c.survives) {
        expect(onA.merged).toContain(text);
        expect(onB.merged).toContain(text);
      }
      for (const text of c.gone ?? []) {
        expect(onA.merged).not.toContain(text);
        expect(onB.merged).not.toContain(text);
      }
      if (c.conflicts !== undefined) {
        expect(onA.conflictHunks).toBe(c.conflicts);
        expect(onB.conflictHunks).toBe(c.conflicts);
      }

      // No line may appear twice as a result of merging.
      const lines = onA.merged.split('\n').filter((l) => l.length > 0);
      expect(lines.length).toBe(new Set(lines).size);
    });
  }

  it('terminates on a pure insertion, which patch replay could not', () => {
    const t0 = Date.now();
    const r = mergeThreeWay(
      'X one.\nX two. EDITED.\n',
      'X one.\nX two.\n',
      'X one.\nX INSERTED.\nX two.\n',
      true
    );
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(r.merged).toContain('X INSERTED.');
    expect(r.merged).toContain('X two. EDITED.');
  });

  it('is unchanged by which side is called the winner when nothing is contested', () => {
    const base = 'N one.\nN two.\nN three.\n';
    const a = 'N one. A.\nN two.\nN three.\n';
    const b = 'N one.\nN two.\nN three. B.\n';
    expect(mergeThreeWay(a, base, b, true).merged).toBe(mergeThreeWay(a, base, b, false).merged);
  });

  it('returns the other side verbatim when this side made no change', () => {
    const base = 'P one.\nP two.\n';
    const b = 'P one. CHANGED.\nP two.\n';
    expect(mergeThreeWay(base, base, b, false).merged).toBe(b);
  });
});
