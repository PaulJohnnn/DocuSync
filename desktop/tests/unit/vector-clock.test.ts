/**
 * @file tests/unit/vector-clock.test.ts
 *
 * Unit test suite for the VectorClock module — the causal ordering primitive
 * of the DocuSync P2P sync engine.
 *
 * Tests cover all public methods of the {@link VectorClock} class:
 * `increment`, `merge`, `dominates`, `isConcurrent`, `compare`, `toJSON`,
 * `fromJSON`, and overflow protection.
 *
 * **Thesis references:**
 * - [8]  Fidge, C. (1988). Timestamps in message-passing systems.
 * - [11] Mattern, F. (1989). Virtual time and global states.
 *
 * @see ISO/IEC 25010 §4.1 — Functional suitability: correctness testing
 */

import {
  createVectorClock,
  VectorClock,
  VectorClockOverflowError,
} from '@/engine/vector-clock/vector-clock';
import type { ClockRelation } from '@/engine/vector-clock/vector-clock';

// ─────────────────────────────────────────────────────────────────────────────
// increment()
// ─────────────────────────────────────────────────────────────────────────────

describe('VectorClock — increment()', () => {
  /**
   * @test Verifies that `increment()` advances only the local node's slot.
   * After incrementing node 0 in a 3-node clock, only counters[0] should be 1.
   *
   * @see Thesis [8] §2.1 — "Each process increments its own element"
   */
  it('should advance only the local slot', () => {
    const vc = createVectorClock(3, 0);
    vc.increment();

    expect(vc.counters[0]).toBe(1);
    expect(vc.counters[1]).toBe(0);
    expect(vc.counters[2]).toBe(0);
  });

  /**
   * @test Multiple increments should accumulate in the local slot.
   */
  it('should accumulate on repeated calls', () => {
    const vc = createVectorClock(3, 1);
    vc.increment().increment().increment();

    expect(vc.counters[0]).toBe(0);
    expect(vc.counters[1]).toBe(3);
    expect(vc.counters[2]).toBe(0);
  });

  /**
   * @test `increment()` should return `this` for method chaining.
   */
  it('should return this for method chaining', () => {
    const vc = createVectorClock(2, 0);
    const result = vc.increment();
    expect(result).toBe(vc);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// merge()
// ─────────────────────────────────────────────────────────────────────────────

describe('VectorClock — merge()', () => {
  /**
   * @test Merge takes element-wise max, then increments own slot.
   * local = [1, 0, 0], remote = [0, 2, 0] → after merge: [1, 2, 0] + inc own → [2, 2, 0]
   *
   * @see Thesis [11] §3 — receive-event rule
   */
  it('should take element-wise max then increment own slot', () => {
    const local = createVectorClock(3, 0);
    local.increment(); // [1, 0, 0]

    const remote = createVectorClock(3, 1);
    remote.increment().increment(); // [0, 2, 0]

    local.merge(remote); // max → [1, 2, 0], then inc own → [2, 2, 0]

    expect(local.counters[0]).toBe(2);
    expect(local.counters[1]).toBe(2);
    expect(local.counters[2]).toBe(0);
  });

  /**
   * @test Merging a dominated clock should still increment own slot.
   */
  it('should increment own slot even when local already dominates', () => {
    const local = createVectorClock(2, 0);
    local.increment().increment(); // [2, 0]

    const remote = createVectorClock(2, 1);
    remote.increment(); // [0, 1]

    local.merge(remote); // max → [2, 1], inc → [3, 1]

    expect(local.counters[0]).toBe(3);
    expect(local.counters[1]).toBe(1);
  });

  /**
   * @test Merge should dynamically pad the tree on node count mismatch rather than throwing.
   */
  it('should dynamically pad the tree on node count mismatch', () => {
    const a = createVectorClock(3, 0);
    const b = createVectorClock(2, 0);

    expect(() => a.merge(b)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// dominates()
// ─────────────────────────────────────────────────────────────────────────────

describe('VectorClock — dominates()', () => {
  /**
   * @test Returns true when all slots >= and at least one >.
   *
   * @see Thesis [8] §3.2 — strict partial order definition
   */
  it('should return true when all slots >= and one >', () => {
    const a = createVectorClock(3, 0);
    a.increment().increment(); // [2, 0, 0]

    const b = createVectorClock(3, 0);
    b.increment(); // [1, 0, 0]

    expect(a.dominates(b)).toBe(true);
    expect(b.dominates(a)).toBe(false);
  });

  /**
   * @test Neither dominates when clocks are concurrent.
   */
  it('should return false when clocks are concurrent', () => {
    const a = createVectorClock(2, 0);
    a.increment(); // [1, 0]

    const b = createVectorClock(2, 1);
    b.increment(); // [0, 1]

    expect(a.dominates(b)).toBe(false);
    expect(b.dominates(a)).toBe(false);
  });

  /**
   * @test Identical clocks do not dominate each other.
   */
  it('should return false for identical clocks', () => {
    const a = createVectorClock(2, 0);
    a.increment(); // [1, 0]

    const b = VectorClock.fromJSON(a.toJSON());

    expect(a.dominates(b)).toBe(false);
    expect(b.dominates(a)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isConcurrent()
// ─────────────────────────────────────────────────────────────────────────────

describe('VectorClock — isConcurrent()', () => {
  /**
   * @test Concurrent when neither dominates.
   * a = [1, 0], b = [0, 1] → concurrent.
   *
   * @see Thesis [8] §3.3 — concurrency definition
   */
  it('should return true when neither dominates', () => {
    const a = createVectorClock(2, 0);
    a.increment(); // [1, 0]

    const b = createVectorClock(2, 1);
    b.increment(); // [0, 1]

    expect(a.isConcurrent(b)).toBe(true);
  });

  /**
   * @test Not concurrent when one dominates.
   */
  it('should return false when one dominates the other', () => {
    const a = createVectorClock(2, 0);
    a.increment().increment(); // [2, 0]

    const b = createVectorClock(2, 0);
    b.increment(); // [1, 0]

    expect(a.isConcurrent(b)).toBe(false);
  });

  /**
   * @test Not concurrent when clocks are identical.
   */
  it('should return false for identical clocks', () => {
    const a = createVectorClock(2, 0);
    a.increment(); // [1, 0]

    const b = VectorClock.fromJSON(a.toJSON());

    expect(a.isConcurrent(b)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// compare()
// ─────────────────────────────────────────────────────────────────────────────

describe('VectorClock — compare()', () => {
  /**
   * @test All four relations are correctly returned.
   *
   * @see Thesis [8] — comparison algorithm
   */
  it('should return "dominant" when this > other', () => {
    const a = createVectorClock(2, 0);
    a.increment().increment(); // [2, 0]

    const b = createVectorClock(2, 0);
    b.increment(); // [1, 0]

    expect(a.compare(b)).toBe('dominant' as ClockRelation);
  });

  it('should return "dominated" when other > this', () => {
    const a = createVectorClock(2, 0);
    a.increment(); // [1, 0]

    const b = createVectorClock(2, 0);
    b.increment().increment(); // [2, 0]

    expect(a.compare(b)).toBe('dominated' as ClockRelation);
  });

  it('should return "concurrent" when neither dominates', () => {
    const a = createVectorClock(2, 0);
    a.increment(); // [1, 0]

    const b = createVectorClock(2, 1);
    b.increment(); // [0, 1]

    expect(a.compare(b)).toBe('concurrent' as ClockRelation);
  });

  it('should return "equal" for identical clocks', () => {
    const a = createVectorClock(2, 0);
    a.increment(); // [1, 0]

    const b = VectorClock.fromJSON(a.toJSON());

    expect(a.compare(b)).toBe('equal' as ClockRelation);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toJSON() / fromJSON()
// ─────────────────────────────────────────────────────────────────────────────

describe('VectorClock — toJSON() / fromJSON()', () => {
  /**
   * @test Round-trip serialisation preserves all state.
   */
  it('should round-trip correctly', () => {
    const original = createVectorClock(3, 1);
    original.increment().increment(); // [0, 2, 0]

    const json = original.toJSON();
    const restored = VectorClock.fromJSON(json);

    expect(restored.nodeCount).toBe(3);
    expect(restored.nodeIndex).toBe(1);
    expect([...restored.counters]).toEqual([...original.counters]);
  });

  /**
   * @test JSON is a plain object suitable for JSON.stringify.
   */
  it('should produce a JSON-safe object', () => {
    const vc = createVectorClock(2, 0);
    vc.increment();

    const json = vc.toJSON();
    const str = JSON.stringify(json);
    const parsed = JSON.parse(str);
    const restored = VectorClock.fromJSON(parsed);

    expect([...restored.counters]).toEqual([...vc.counters]);
  });

  /**
   * @test fromJSON should throw on invalid input.
   */
  it('should throw on invalid JSON', () => {
    expect(() => VectorClock.fromJSON({} as any)).toThrow();
    expect(() => VectorClock.fromJSON(null as any)).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Overflow Protection
// ─────────────────────────────────────────────────────────────────────────────

describe('VectorClock — overflow protection', () => {
  /**
   * @test Throws VectorClockOverflowError when a counter exceeds the safe threshold.
   *
   * We simulate this by creating a clock from JSON with a near-overflow counter,
   * then incrementing it.
   */
  it('should throw VectorClockOverflowError on overflow', () => {
    const threshold = Math.floor(Number.MAX_SAFE_INTEGER / 2);

    const json = {
      nodeCount: 1,
      nodeIndex: 0,
      root: {
        counter: 0,
        children: [{ counter: threshold, children: [] }],
      },
    };

    const vc = VectorClock.fromJSON(json);

    expect(() => vc.increment()).toThrow(VectorClockOverflowError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge Cases
// ─────────────────────────────────────────────────────────────────────────────

describe('VectorClock — edge cases', () => {
  /**
   * @test Single-node clock works correctly.
   */
  it('should work with a single node', () => {
    const vc = createVectorClock(1, 0);
    vc.increment().increment().increment();

    expect(vc.counters[0]).toBe(3);
    expect(vc.nodeCount).toBe(1);
  });

  /**
   * @test 15-node clock works correctly (large P2P mesh).
   */
  it('should work with 15 nodes', () => {
    const clocks = Array.from({ length: 15 }, (_, i) =>
      createVectorClock(15, i)
    );

    // Each node increments its own slot twice.
    for (const vc of clocks) {
      vc.increment().increment();
    }

    // Node 0 merges with node 14.
    clocks[0].merge(clocks[14]);

    // After merge: node 0's slot = 2 (max) + 1 (increment) = 3
    expect(clocks[0].counters[0]).toBe(3);
    // Node 14's slot in node 0's clock should be 2 (from merge max)
    expect(clocks[0].counters[14]).toBe(2);
    // Node 7's slot should be 0 (never merged)
    expect(clocks[0].counters[7]).toBe(0);
  });

  /**
   * @test Identical clocks compare as equal.
   */
  it('should report equal for two fresh clocks', () => {
    const a = createVectorClock(3, 0);
    const b = createVectorClock(3, 1);

    expect(a.compare(b)).toBe('equal');
  });

  /**
   * @test Constructor rejects invalid arguments.
   */
  it('should reject nodeCount < 1', () => {
    expect(() => createVectorClock(0, 0)).toThrow(RangeError);
  });

  it('should reject nodeIndex out of range', () => {
    expect(() => createVectorClock(3, -1)).toThrow(RangeError);
  });
});
