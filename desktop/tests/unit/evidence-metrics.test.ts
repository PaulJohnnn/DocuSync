import * as fs from 'fs';
import * as path from 'path';

/**
 * Regression test for the hardcoded Chapter IV reliability metrics.
 *
 * The evidence generator used to write its reliability figures into the
 * output as string literals:
 *
 *   reliability: {
 *     dataLossRate: '0%',
 *     consistencySuccessRate: '100%',
 *     autoResolveSuccessRate: '100%',
 *     ...
 *   }
 *
 * Nothing computed them. Every neighbouring field was derived from a test
 * result, so the block looked measured while three of its values were
 * asserted — the output reported 0% data loss and 100% consistency as
 * evidence. One of those assertions was also demonstrably wrong: test 4C
 * escalated a conflict that was still `pending`, so auto-resolution was not
 * 100%.
 *
 * These tests fail against the original file and pass against the fixed one.
 * They are deliberately source-level: the defect was that a literal sat where
 * a computation belonged, and that is a property of the source, not of any
 * single generated run.
 */

const GENERATOR = path.join(__dirname, '..', 'manual-evidence', 'generate-evidence.ts');

/** The `reliability: { ... }` object literal inside the metrics builder. */
function reliabilityBlock(source: string): string {
  const start = source.indexOf('reliability: {');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('},', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('Chapter IV evidence — reliability metrics must be measured, not asserted', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(GENERATOR, 'utf8');
  });

  it('the generator exists and builds a reliability block', () => {
    expect(source.length).toBeGreaterThan(0);
    expect(reliabilityBlock(source)).toContain('reliability: {');
  });

  it('does not assign a hardcoded percentage to any reliability metric', () => {
    const block = reliabilityBlock(source);

    // A reliability key assigned a bare quoted percentage, e.g.
    //   dataLossRate: '0%',   consistencySuccessRate: "100%",
    // Comment lines are stripped first so that documenting the old defect in
    // prose does not re-trigger the test.
    const code = block
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .join('\n');

    const hardcoded = code.match(/^\s*\w*(?:Rate|Loss|Success)\w*\s*:\s*['"][\d.]+%['"]/gim);

    expect(hardcoded ?? []).toEqual([]);
  });

  it('derives the data-loss figures from a measured test rather than a constant', () => {
    const block = reliabilityBlock(source);
    // Must read from the measurement test's recorded output.
    expect(block).toMatch(/activeViewDataLossRate:\s*test4G\.actualOutput/);
    expect(block).toMatch(/permanentDataLossRate:\s*test4G\.actualOutput/);
  });

  it('derives the auto-resolution rate from counted conflict outcomes', () => {
    const block = reliabilityBlock(source);
    expect(block).toMatch(/autoResolveSuccessRate:\s*autoResolveRate/);

    // And the rate itself must be computed from the recorded outcomes.
    expect(source).toMatch(/const autoResolveRate\s*=/);
    expect(source).toContain('autoResolvedCount / conflictOutcomes.length');
  });

  it('counts an escalated conflict as NOT auto-resolved', () => {
    // The original 100% was wrong because an escalation still pending was
    // counted as a success. The escalation branch must be identified
    // separately from the resolved branch.
    expect(source).toMatch(/escalatedCount\s*=/);
    expect(source).toContain("=== 'escalated'");
    expect(source).toContain("=== 'pending'");
  });

  it('refuses to publish a consistency rate below the minimum sample size', () => {
    // The running system suppresses rates computed from too few samples
    // (MIN_SAMPLES = 5 in the metrics API). The evidence generator must not
    // be more confident than the system it is measuring.
    expect(source).toMatch(/CONSISTENCY_MIN_SAMPLES\s*=\s*5/);
    expect(source).toContain('insufficient data');
  });

  it('includes a test that actually measures data loss', () => {
    expect(source).toContain("runTest('4G'");
    // It must count characters, not restate a conclusion.
    expect(source).toMatch(/activeViewLostChars/);
    expect(source).toMatch(/permanentlyLostChars/);
    // And it must verify recoverability by reading the record back.
    expect(source).toMatch(/lwwResolver\.getConflict\(/);
  });
});
