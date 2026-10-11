/**
 * @file tests/unit/history-reconstruction.test.ts
 *
 * Does the desktop rebuild EVERY version of a document correctly, not just
 * the newest one?
 *
 * The desktop keeps history differently from the cloud relay. The relay
 * stores each version's full text, so reading version 4 is a lookup. The
 * desktop stores deltas and replays them from the beginning, so version 4
 * is the seed plus four successive applications — which means a single
 * delta that fails to apply does not spoil one row, it spoils that row and
 * every row after it. `file:history` catches the throw and reuses the last
 * content it managed to rebuild, so the failure surfaces as versions that
 * look plausible and are wrong, rather than as an error.
 *
 * These tests therefore replay the chain the same way the IPC handler does
 * and compare EVERY reconstructed version against the state the document
 * actually held at that point, over the kinds of edit people really make:
 * appends, single-word changes, deletions inside a paragraph, rewrites,
 * mid-document insertions, moves, emptying and retyping.
 *
 * **Thesis references:**
 * - [3]  Myers, E. W. (1986). O(ND) difference algorithm.
 * - [4]  Hunt, J. W., & McIlroy, M. D. (1976). Differential file comparison.
 * - [8]  Event sourcing / log-based synchronisation.
 *
 * @see ISO/IEC 25010 §4.2 — Reliability: data integrity, recoverability
 */

import { encode } from '../../src/engine/delta/delta-encoder';
import { decode } from '../../src/engine/delta/delta-decoder';

const FILE = 'chapter3.docx';

/** Paragraphs, so edits can be written the way a person makes them. */
const P = {
  intro: 'This chapter presents the methodology used in the study.',
  design: 'The research design is developmental, following an iterative build and test cycle.',
  resp: 'The respondents were thirty students from the College of Computing Studies.',
  instr: 'The instrument was a researcher made questionnaire validated by three experts.',
  stats: 'The data were analysed using weighted mean and standard deviation.',
  ethics: 'Ethical clearance was obtained before any data collection began.',
};
const doc = (parts: string[]) => parts.map((t) => `<p>${t}</p>`).join('');

/**
 * Every state the document passes through, in order — each one a partial
 * change that leaves most of the document alone.
 */
const STATES: { kind: string; html: string }[] = [
  { kind: 'initial import', html: doc([P.intro, P.design, P.resp, P.instr]) },
  { kind: 'paste two paragraphs at the end', html: doc([P.intro, P.design, P.resp, P.instr, P.stats, P.ethics]) },
  { kind: 'change one word only', html: doc([P.intro, P.design, P.resp.replace('thirty', 'forty-five'), P.instr, P.stats, P.ethics]) },
  { kind: 'delete half of one sentence', html: doc([P.intro, P.design, P.resp.replace('thirty', 'forty-five'), 'The instrument was a researcher made questionnaire.', P.stats, P.ethics]) },
  { kind: 'rewrite one paragraph', html: doc([P.intro, 'The study adopts an experimental design with a control group.', P.resp.replace('thirty', 'forty-five'), 'The instrument was a researcher made questionnaire.', P.stats, P.ethics]) },
  { kind: 'insert mid-paragraph', html: doc([P.intro + ' It also states the limitations.', 'The study adopts an experimental design with a control group.', P.resp.replace('thirty', 'forty-five'), 'The instrument was a researcher made questionnaire.', P.stats, P.ethics]) },
  { kind: 'remove a paragraph from the middle', html: doc([P.intro + ' It also states the limitations.', 'The study adopts an experimental design with a control group.', 'The instrument was a researcher made questionnaire.', P.stats, P.ethics]) },
  { kind: 'move a paragraph to the top', html: doc([P.ethics, P.intro + ' It also states the limitations.', 'The study adopts an experimental design with a control group.', 'The instrument was a researcher made questionnaire.', P.stats]) },
  { kind: 'fix three typos at once', html: doc([P.ethics.replace('Ethical', 'Ethics'), P.intro + ' It also states the limitations.', 'The study adopts an experimental design with a control group.', 'The instrument was a researcher-made questionnaire.', P.stats.replace('analysed', 'analyzed')]) },
  { kind: 'empty the document', html: '' },
  { kind: 'retype from empty', html: doc(['Fresh start after emptying.']) },
  { kind: 'paste a long block', html: doc(['Fresh start after emptying.', 'Long content. '.repeat(30).trim()]) },
  { kind: 'trim the long block', html: doc(['Fresh start after emptying.', 'Long content.']) },
  { kind: 'whitespace-only change', html: doc(['Fresh  start after emptying.', 'Long content.']) },
];

/**
 * Builds the delta chain the engine would store, then replays it exactly as
 * `file:history` does: start from empty, apply each delta in turn, and keep
 * what each step produced.
 */
function replayChain(states: { kind: string; html: string }[]) {
  const stored: string[] = [];
  let prev = '';
  for (const s of states) {
    const result = encode(prev, s.html, FILE);
    // Chunked payloads take the same path in the handler; the single-delta
    // case is what every state here produces, and a chunked one would be
    // reassembled before decode.
    stored.push(result.deltaBase64 ?? '');
    prev = s.html;
  }

  const rebuilt: { kind: string; content: string; ok: boolean }[] = [];
  let current = '';
  for (let i = 0; i < stored.length; i++) {
    let ok = true;
    try {
      current = decode(current, stored[i]).content;
    } catch {
      ok = false; // handler keeps the last good content and flags the row
    }
    rebuilt.push({ kind: states[i].kind, content: current, ok });
  }
  return rebuilt;
}

describe('desktop history: every version rebuilds exactly', () => {
  const rebuilt = replayChain(STATES);

  it('rebuilds every version without a broken delta', () => {
    const broken = rebuilt.filter((r) => !r.ok).map((r) => r.kind);
    expect(broken).toEqual([]);
  });

  // Each version is asserted on its own, so a failure names the edit that
  // broke the chain rather than reporting "history is wrong".
  STATES.forEach((state, i) => {
    it(`version ${i + 1} (${state.kind}) matches what the document held`, () => {
      expect(rebuilt[i].content).toBe(state.html);
    });
  });

  it('every version is distinct except the deliberately identical ones', () => {
    const seen = new Map<string, number>();
    for (const r of rebuilt) seen.set(r.content, (seen.get(r.content) ?? 0) + 1);
    const repeated = [...seen.entries()].filter(([, n]) => n > 1);
    expect(repeated).toEqual([]);
  });

  it('keeps every sentence recoverable somewhere in the chain', () => {
    const all = rebuilt.map((r) => r.content).join(' || ');
    const fragments = new Set<string>();
    for (const s of STATES) {
      for (const m of s.html.matchAll(/<p>(.*?)<\/p>/g)) {
        if (m[1].trim()) fragments.add(m[1]);
      }
    }
    const missing = [...fragments].filter((f) => !all.includes(f));
    expect(missing).toEqual([]);
  });
});

describe('desktop history: the replay survives awkward content', () => {
  // Each case is a chain in its own right, because the failure being
  // guarded against is cumulative: a delta that misapplies corrupts every
  // version after it, so one bad character early is worse than a bad
  // document late.
  const CASES: { name: string; states: string[] }[] = [
    {
      name: 'a document that becomes empty and comes back',
      states: ['<p>One</p><p>Two</p>', '', '<p>Three</p>', '', '<p>Four</p>'],
    },
    {
      name: 'repeated identical lines, where line matching can slip',
      states: [
        '<p>Same</p><p>Same</p><p>Same</p>',
        '<p>Same</p><p>Same</p>',
        '<p>Same</p><p>Changed</p><p>Same</p>',
        '<p>Same</p><p>Same</p><p>Same</p><p>Same</p>',
      ],
    },
    {
      name: 'leading and trailing whitespace changes only',
      states: ['<p>Text</p>', '<p>Text </p>', '<p> Text </p>', '<p>Text</p>'],
    },
    {
      name: 'non-ASCII content',
      states: [
        '<p>Pamantasan ng Cabuyao</p>',
        '<p>Pamantasan ng Cabuyao — thesis</p>',
        '<p>Pamantasan ng Cabuyao — thesis ✓</p>',
        '<p>Pamantasan ng Cabuyao</p>',
      ],
    },
    {
      name: 'a very long single paragraph edited at the end',
      states: [
        `<p>${'word '.repeat(400).trim()}</p>`,
        `<p>${'word '.repeat(400).trim()} END</p>`,
        `<p>${'word '.repeat(400).trim()}</p>`,
      ],
    },
    {
      name: 'reordering paragraphs without changing their text',
      states: [
        '<p>Alpha</p><p>Bravo</p><p>Charlie</p>',
        '<p>Charlie</p><p>Alpha</p><p>Bravo</p>',
        '<p>Bravo</p><p>Charlie</p><p>Alpha</p>',
      ],
    },
  ];

  CASES.forEach(({ name, states }) => {
    it(`rebuilds every version: ${name}`, () => {
      const rebuilt = replayChain(states.map((html, i) => ({ kind: `v${i + 1}`, html })));
      expect(rebuilt.every((r) => r.ok)).toBe(true);
      states.forEach((expected, i) => {
        expect(rebuilt[i].content).toBe(expected);
      });
    });
  });
});
