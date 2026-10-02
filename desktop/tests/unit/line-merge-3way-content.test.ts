/**
 * Line/segment attribution against content designed to break it.
 *
 * The merge must identify regions by exact line equality, never by
 * similarity. These cases are the ones where a fuzzy or offset-based matcher
 * goes wrong: repeated identical lines, lines that differ by one character,
 * blank lines, very long lines, edits on adjacent lines, and insertions whose
 * new text is identical to a line already present.
 *
 * Where several diff alignments are equally minimal — deleting one of three
 * identical lines, for instance — the assertion states what must be true of
 * ANY correct alignment (no edit lost, no line duplicated, both peers equal)
 * rather than pinning one arbitrary choice.
 */
import { mergeThreeWay } from '../../src/engine/lww/line-merge-3way';

/** Runs the merge from both peers' points of view; A wins contested regions. */
function bothWays(a: string, base: string, b: string) {
  const onA = mergeThreeWay(a, base, b, false);
  const onB = mergeThreeWay(b, base, a, true);
  return { onA, onB };
}

const nonEmpty = (s: string) => s.split('\n').filter((l) => l.length > 0);

describe('mergeThreeWay — attribution on difficult content', () => {
  it('keeps edits to two different occurrences of a repeated line', () => {
    const base = 'X repeated.\nX repeated.\nX repeated.\n';
    const a = 'X repeated.\nX repeated. FROM-A.\nX repeated.\n';
    const b = 'X repeated.\nX repeated.\nX repeated. FROM-B.\n';

    const { onA, onB } = bothWays(a, base, b);
    expect(onA.merged).toBe(onB.merged);
    expect(onA.merged).toContain('X repeated. FROM-A.');
    expect(onA.merged).toContain('X repeated. FROM-B.');
    expect(onA.conflictHunks).toBe(0);
    expect(nonEmpty(onA.merged).length).toBe(3);
  });

  it('does not let a near-identical line absorb another line’s edit', () => {
    const base = 'total: 10\ntotal: 20\ntotal: 30\n';
    const a = 'total: 11\ntotal: 20\ntotal: 30\n';
    const b = 'total: 10\ntotal: 20\ntotal: 33\n';

    const { onA, onB } = bothWays(a, base, b);
    expect(onA.merged).toBe(onB.merged);
    expect(onA.merged).toBe('total: 11\ntotal: 20\ntotal: 33\n');
    expect(onA.conflictHunks).toBe(0);
  });

  it('preserves blank lines and edits around them', () => {
    const base = 'para one.\n\npara two.\n\npara three.\n';
    const a = 'para one. FROM-A.\n\npara two.\n\npara three.\n';
    const b = 'para one.\n\npara two.\n\npara three. FROM-B.\n';

    const { onA, onB } = bothWays(a, base, b);
    expect(onA.merged).toBe(onB.merged);
    expect(onA.merged).toBe('para one. FROM-A.\n\npara two.\n\npara three. FROM-B.\n');
    // The two blank lines must still be there, in place.
    expect(onA.merged.split('\n').filter((l) => l.length === 0).length).toBe(3);
  });

  it('handles very long lines without confusing them', () => {
    const long1 = 'A'.repeat(5000);
    const long2 = 'B'.repeat(5000);
    const base = `${long1}\nmiddle.\n${long2}\n`;
    const a = `${long1} EDITED-A\nmiddle.\n${long2}\n`;
    const b = `${long1}\nmiddle.\n${long2} EDITED-B\n`;

    const { onA, onB } = bothWays(a, base, b);
    expect(onA.merged).toBe(onB.merged);
    expect(onA.merged).toContain('EDITED-A');
    expect(onA.merged).toContain('EDITED-B');
    expect(onA.merged).toContain('middle.');
    expect(onA.conflictHunks).toBe(0);
  });

  it('treats edits on adjacent lines as independent', () => {
    const base = 'row one.\nrow two.\nrow three.\nrow four.\n';
    const a = 'row one.\nrow two. FROM-A.\nrow three.\nrow four.\n';
    const b = 'row one.\nrow two.\nrow three. FROM-B.\nrow four.\n';

    const { onA, onB } = bothWays(a, base, b);
    expect(onA.merged).toBe(onB.merged);
    expect(onA.merged).toBe('row one.\nrow two. FROM-A.\nrow three. FROM-B.\nrow four.\n');
    expect(onA.conflictHunks).toBe(0);
  });

  it('inserts a line identical to an existing one without losing a far edit', () => {
    const base = 'dup.\nmiddle.\ntail.\n';
    const a = 'dup.\ndup.\nmiddle.\ntail.\n'; // inserts a second copy of "dup."
    const b = 'dup.\nmiddle.\ntail. FROM-B.\n';

    const { onA, onB } = bothWays(a, base, b);
    expect(onA.merged).toBe(onB.merged);
    expect(onA.merged).toContain('tail. FROM-B.');
    expect(nonEmpty(onA.merged).filter((l) => l === 'dup.').length).toBe(2);
    expect(nonEmpty(onA.merged).length).toBe(4);
  });

  it('deletes one of several identical lines without disturbing another edit', () => {
    const base = 'X.\nX.\nX.\nkeep.\n';
    const a = 'X.\nX.\nkeep.\n'; // removes one copy
    const b = 'X.\nX.\nX.\nkeep. FROM-B.\n';

    const { onA, onB } = bothWays(a, base, b);
    expect(onA.merged).toBe(onB.merged);
    expect(onA.merged).toContain('keep. FROM-B.');
    expect(nonEmpty(onA.merged).filter((l) => l === 'X.').length).toBe(2);
    expect(onA.conflictHunks).toBe(0);
  });

  it('merges different HTML paragraphs when two paragraphs share text', () => {
    const base = '<p>same text.</p>\n<p>same text.</p>\n<p>last.</p>\n';
    const a = '<p>same text. FROM-A.</p>\n<p>same text.</p>\n<p>last.</p>\n';
    const b = '<p>same text.</p>\n<p>same text.</p>\n<p>last. FROM-B.</p>\n';

    const { onA, onB } = bothWays(a, base, b);
    expect(onA.merged).toBe(onB.merged);
    expect(onA.merged).toContain('<p>same text. FROM-A.</p>');
    expect(onA.merged).toContain('<p>last. FROM-B.</p>');
    expect(onA.merged).toContain('<p>same text.</p>');
    expect(onA.conflictHunks).toBe(0);
  });

  it('contests only the shared paragraph when both rewrite the same block', () => {
    const base = '<p>one.</p>\n<p>two.</p>\n<p>three.</p>\n';
    const a = '<p>one. FROM-A.</p>\n<p>two.</p>\n<p>three. ALSO-A.</p>\n';
    const b = '<p>one. FROM-B.</p>\n<p>two.</p>\n<p>three.</p>\n';

    const { onA, onB } = bothWays(a, base, b);
    expect(onA.merged).toBe(onB.merged);
    expect(onA.conflictHunks).toBe(1);
    expect(onA.merged).toContain('<p>one. FROM-A.</p>');
    expect(onA.merged).not.toContain('FROM-B.');
    expect(onA.merged).toContain('<p>three. ALSO-A.</p>'); // uncontested, survives
    expect(onA.merged).toContain('<p>two.</p>');
  });

  it('is idempotent when the incoming change is already present', () => {
    // A stale or replayed event: the sender's change is already in our text.
    const base = 'one.\ntwo.\n';
    const already = 'one. DONE.\ntwo.\n';
    const r = mergeThreeWay(already, base, already, true);
    expect(r.merged).toBe(already);
    expect(r.hadConflict).toBe(false);
  });

  it('keeps a whole-document rewrite from duplicating content', () => {
    const base = 'a.\nb.\nc.\n';
    const a = 'totally different one.\ntotally different two.\n';
    const b = 'a.\nb.\nc. FROM-B.\n';

    const { onA, onB } = bothWays(a, base, b);
    expect(onA.merged).toBe(onB.merged);
    const lines = nonEmpty(onA.merged);
    expect(lines.length).toBe(new Set(lines).size); // no duplication
  });

  it('never emits a line that appears in none of the three inputs', () => {
    const base = 'alpha.\nbravo.\ncharlie.\ndelta.\n';
    const a = 'alpha. A1\nbravo.\ncharlie.\ndelta.\n';
    const b = 'alpha.\nbravo. B1\ncharlie.\nDELTA REWRITTEN.\n';

    const { onA } = bothWays(a, base, b);
    const known = new Set([
      ...nonEmpty(base), ...nonEmpty(a), ...nonEmpty(b),
    ]);
    for (const line of nonEmpty(onA.merged)) {
      expect(known.has(line)).toBe(true);
    }
  });
});
