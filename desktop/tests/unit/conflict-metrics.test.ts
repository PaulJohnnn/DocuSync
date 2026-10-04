/**
 * @file tests/unit/conflict-metrics.test.ts
 *
 * Regression tests for the conflict-lifecycle accounting in PeerManager.
 *
 * Two defects are covered, both found by reading the code rather than by a
 * failing test:
 *
 *  1. `conflictEscalatedAt` was written to and never read or cleared, so it
 *     grew for the lifetime of the host process — one entry per escalated
 *     conflict, never released.
 *
 *  2. Because nothing read it, `conflictsResolvedThisSession` and
 *     `conflictTotalResolveMs` were never incremented either, so the
 *     `/metrics` endpoint reported no Conflict Resolution Time however many
 *     conflicts had actually been resolved. The thesis reports that figure.
 *
 * The same endpoint also returned `pendingConflicts: this.config.vectorClock ? 0 : 0`
 * — zero on both branches — and a hardcoded `dataLossRate: 0`. Those are
 * covered here as measured quantities.
 *
 * Layer:    Unit (PeerManager instantiated directly; no sockets are opened)
 * Runner:   Jest (desktop/jest.config.ts, project "unit")
 * Command:  npx jest --selectProjects unit --testPathPatterns=conflict-metrics
 */

import { PeerManager } from '../../src/engine/peer/peer-manager';

/**
 * A PeerManager with just enough configuration to construct. None of these
 * tests start the HTTP/WebSocket server, so the collaborators are only ever
 * held, never called.
 */
function makeManager(): PeerManager {
  return new PeerManager({
    localNodeId: 'test-node',
    port: 0,
  } as unknown as ConstructorParameters<typeof PeerManager>[0]);
}

describe('escalation bookkeeping does not grow without bound', () => {
  it('releases a conflict’s entry once it is resolved', () => {
    const pm = makeManager();
    pm.noteConflictEscalated('c-1');
    expect(pm.getMetricsSnapshot().openConflictCount).toBe(1);

    pm.recordConflictResolved('c-1');
    expect(pm.getMetricsSnapshot().openConflictCount).toBe(0);
  });

  it('holds a bounded number of entries no matter how many are escalated', () => {
    const pm = makeManager();
    // Far more than the cap, none of them ever resolved — the exact shape of
    // the original leak.
    for (let i = 0; i < 5000; i++) pm.noteConflictEscalated(`c-${i}`);

    const { openConflictCount } = pm.getMetricsSnapshot();
    expect(openConflictCount).toBeLessThanOrEqual(512);
    expect(openConflictCount).toBeGreaterThan(0);
  });

  it('keeps the most recent escalations when it has to drop some', () => {
    const pm = makeManager();
    for (let i = 0; i < 1000; i++) pm.noteConflictEscalated(`c-${i}`);

    // The newest is still timed; one of the earliest has been released.
    expect(pm.recordConflictResolved('c-999')).not.toBeNull();
    expect(pm.recordConflictResolved('c-0')).toBeNull();
  });

  it('does not grow when the same conflict is escalated repeatedly', () => {
    const pm = makeManager();
    for (let i = 0; i < 100; i++) pm.noteConflictEscalated('c-same');
    expect(pm.getMetricsSnapshot().openConflictCount).toBe(1);
  });
});

describe('conflict resolution time is measured, not assumed', () => {
  it('counts a resolution and accumulates a real interval', async () => {
    const pm = makeManager();
    pm.noteConflictEscalated('c-timed');
    await new Promise((r) => setTimeout(r, 25));

    const elapsed = pm.recordConflictResolved('c-timed');
    expect(elapsed).not.toBeNull();
    expect(elapsed as number).toBeGreaterThanOrEqual(20);

    const m = pm.getMetricsSnapshot();
    expect(m.conflictsResolvedThisSession).toBe(1);
    expect(m.conflictTotalResolveMs).toBeGreaterThanOrEqual(20);
  });

  it('counts a resolution for a conflict it never escalated, but times nothing', () => {
    // A resolution can arrive from another host. Counting it is right;
    // inventing a duration for it is not.
    const pm = makeManager();
    expect(pm.recordConflictResolved('never-seen-here')).toBeNull();

    const m = pm.getMetricsSnapshot();
    expect(m.conflictsResolvedThisSession).toBe(1);
    expect(m.conflictTotalResolveMs).toBe(0);
  });

  it('reports no average before anything has been resolved', () => {
    const pm = makeManager();
    const m = pm.getMetricsSnapshot();
    expect(m.conflictsResolvedThisSession).toBe(0);
    expect(m.conflictTotalResolveMs).toBe(0);
  });
});

describe('pending conflicts and data loss are counted', () => {
  it('reports the conflicts still awaiting a decision', () => {
    const pm = makeManager();
    pm.noteConflictEscalated('c-a');
    pm.noteConflictEscalated('c-b');
    pm.noteConflictEscalated('c-c');
    expect(pm.getMetricsSnapshot().pendingConflicts).toBe(3);

    pm.recordConflictResolved('c-b');
    expect(pm.getMetricsSnapshot().pendingConflicts).toBe(2);
  });

  it('accumulates what a Last-Write-Wins decision kept and discarded', () => {
    const pm = makeManager();
    pm.recordLwwOutcome(100, 0);
    pm.recordLwwOutcome(80, 20);

    const m = pm.getMetricsSnapshot();
    expect(m.charsAccepted).toBe(180);
    expect(m.charsDiscardedByLww).toBe(20);
    // 20 / 200 — a figure derived from the two counters, not a constant.
    expect(m.charsDiscardedByLww / (m.charsAccepted + m.charsDiscardedByLww)).toBeCloseTo(0.1);
  });

  it('ignores negative counts rather than letting them cancel real loss', () => {
    const pm = makeManager();
    pm.recordLwwOutcome(-5, -5);
    const m = pm.getMetricsSnapshot();
    expect(m.charsAccepted).toBe(0);
    expect(m.charsDiscardedByLww).toBe(0);
  });
});
