/**
 * @file tests/stress/performance.test.ts
 *
 * Performance and stress test suite producing metrics required by the
 * thesis ISO/IEC 25010 evaluation (Chapter IV).
 *
 * **Tests:**
 * 1. **Latency** — Measures encode+decode round-trip for 100 sequential edits.
 *    Target: avg < 50ms.
 * 2. **Throughput** — Processes 100 sync events as fast as possible.
 *    Target: ≥ 10 events/second.
 * 3. **Conflict Detection Rate** — 30 pairs of concurrent vector clocks.
 *    Target: 100% detection rate.
 * 4. **Data Loss** — 50 encode+decode round-trips on varying sizes.
 *    Target: 0% data loss.
 * 5. **Concurrent Users Simulation** — 15 nodes with vector clocks.
 *    Target: final merged clock reflects all 15 nodes.
 * 6. **Consistency Rate** — 100 encode+decode round-trips.
 *    Target: ≥ 95% consistency rate.
 *
 * Outputs a JSON metrics report suitable for direct inclusion in
 * Chapter IV of the thesis.
 *
 * **Thesis references:**
 * - [3]  Myers (1986) — delta encoding performance.
 * - [8]  Fidge (1988) — vector clock operations.
 * - [45] Johnson & Thomas (1975) — LWW resolution.
 *
 * @see ISO/IEC 25010 — Software product quality model
 */

import { createVectorClock, VectorClock } from '@/engine/vector-clock/vector-clock';
import { encode } from '@/engine/delta/delta-encoder';
import { decode } from '@/engine/delta/delta-decoder';

// ─────────────────────────────────────────────────────────────────────────────
// Metrics Report Structure
// ─────────────────────────────────────────────────────────────────────────────

interface MetricsReport {
  testSuite: string;
  timestamp: string;
  results: {
    latency: { avgMs: number; minMs: number; maxMs: number; p95Ms: number; passedTarget: boolean };
    throughput: { eventsPerSec: number; passedTarget: boolean };
    conflictDetectionRate: { percentage: number; passedTarget: boolean };
    dataLossRate: { percentage: number; passedTarget: boolean };
    concurrentUsers: { nodesSimulated: number; mergeOperations: number; passedTarget: boolean };
    consistencyRate: { percentage: number; passedTarget: boolean };
  };
}

// Global report accumulator.
const report: MetricsReport = {
  testSuite: 'stress',
  timestamp: new Date().toISOString(),
  results: {
    latency: { avgMs: 0, minMs: 0, maxMs: 0, p95Ms: 0, passedTarget: false },
    throughput: { eventsPerSec: 0, passedTarget: false },
    conflictDetectionRate: { percentage: 0, passedTarget: false },
    dataLossRate: { percentage: 0, passedTarget: false },
    concurrentUsers: { nodesSimulated: 0, mergeOperations: 0, passedTarget: false },
    consistencyRate: { percentage: 0, passedTarget: false },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Generates a random text document of the given approximate size (chars). */
function generateDocument(sizeChars: number): string {
  const words = [
    'the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog',
    'thesis', 'sync', 'delta', 'vector', 'clock', 'node', 'peer',
    'conflict', 'merge', 'resolve', 'encode', 'decode', 'payload',
    'distributed', 'system', 'replicated', 'causal', 'ordering',
  ];
  const parts: string[] = [];
  let total = 0;
  while (total < sizeChars) {
    const word = words[Math.floor(Math.random() * words.length)];
    parts.push(word);
    total += word.length + 1;
    if (Math.random() < 0.1) {
      parts.push('\n');
    }
  }
  return parts.join(' ').slice(0, sizeChars);
}

/** Randomly mutates a document by inserting/deleting/replacing text. */
function mutateDocument(doc: string): string {
  const pos = Math.floor(Math.random() * Math.max(doc.length - 1, 1));
  const action = Math.random();
  if (action < 0.33) {
    // Insert.
    return doc.slice(0, pos) + ' [INSERTED_TEXT] ' + doc.slice(pos);
  } else if (action < 0.66) {
    // Delete.
    const delLen = Math.min(20, doc.length - pos);
    return doc.slice(0, pos) + doc.slice(pos + delLen);
  } else {
    // Replace.
    const repLen = Math.min(15, doc.length - pos);
    return doc.slice(0, pos) + '[REPLACED]' + doc.slice(pos + repLen);
  }
}

/** Computes percentile from a sorted array. */
function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1 — Latency
// ─────────────────────────────────────────────────────────────────────────────

describe('Stress Test 1 — Latency', () => {
  /**
   * @test Measures time from encode() to decode() completion for 100
   * sequential edits.
   *
   * **Target:** Average latency < 50ms.
   * **Records:** min, max, avg, p95.
   *
   * @see Thesis [3] — Myers diff O(ND) complexity guarantees near-linear
   *   performance for typical thesis edits.
   * @see ISO/IEC 25010 §6.1.1 — Time behaviour
   */
  it('should have average encode+decode latency < 50ms', () => {
    const ITERATIONS = 100;
    const latencies: number[] = [];

    let content = generateDocument(2000);

    for (let i = 0; i < ITERATIONS; i++) {
      const modified = mutateDocument(content);

      const start = performance.now();
      const encoded = encode(content, modified, 'thesis.txt');
      const decoded = decode(content, encoded.deltaBase64!);
      const elapsed = performance.now() - start;

      latencies.push(elapsed);

      // Verify correctness as well.
      expect(decoded.content).toBe(modified);

      // Advance content for next iteration.
      content = modified;
    }

    latencies.sort((a, b) => a - b);
    const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;
    const min = latencies[0];
    const max = latencies[latencies.length - 1];
    const p95 = percentile(latencies, 95);

    report.results.latency = {
      avgMs: Math.round(avg * 100) / 100,
      minMs: Math.round(min * 100) / 100,
      maxMs: Math.round(max * 100) / 100,
      p95Ms: Math.round(p95 * 100) / 100,
      passedTarget: avg < 50,
    };

    console.log(`\n  [LATENCY] avg=${avg.toFixed(2)}ms, min=${min.toFixed(2)}ms, max=${max.toFixed(2)}ms, p95=${p95.toFixed(2)}ms`);

    expect(avg).toBeLessThan(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2 — Throughput
// ─────────────────────────────────────────────────────────────────────────────

describe('Stress Test 2 — Throughput', () => {
  /**
   * @test Processes 100 sync events (encode+decode) as fast as possible.
   *
   * **Target:** ≥ 10 events/second.
   *
   * @see ISO/IEC 25010 §6.1.2 — Resource utilisation / throughput
   */
  it('should process >= 10 events/second', () => {
    const EVENTS = 100;
    let content = generateDocument(1500);
    const events: Array<{ prev: string; next: string }> = [];

    // Pre-generate all events.
    for (let i = 0; i < EVENTS; i++) {
      const modified = mutateDocument(content);
      events.push({ prev: content, next: modified });
      content = modified;
    }

    const start = performance.now();
    for (const { prev, next } of events) {
      const encoded = encode(prev, next, 'thesis.txt');
      decode(prev, encoded.deltaBase64!);
    }
    const elapsed = (performance.now() - start) / 1000; // seconds
    const eventsPerSec = EVENTS / elapsed;

    report.results.throughput = {
      eventsPerSec: Math.round(eventsPerSec * 100) / 100,
      passedTarget: eventsPerSec >= 10,
    };

    console.log(`\n  [THROUGHPUT] ${eventsPerSec.toFixed(2)} events/sec (${elapsed.toFixed(2)}s for ${EVENTS} events)`);

    expect(eventsPerSec).toBeGreaterThanOrEqual(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3 — Conflict Detection Rate
// ─────────────────────────────────────────────────────────────────────────────

describe('Stress Test 3 — Conflict Detection Rate', () => {
  /**
   * @test Generates 30 pairs of concurrent vector clocks and verifies that
   * `isConcurrent()` correctly identifies all 30 as conflicts.
   *
   * **Target:** 100% detection rate.
   *
   * @see Thesis [8] §3.3 — concurrency detection
   * @see ISO/IEC 25010 §4.1.3 — Functional completeness
   */
  it('should detect all 30 concurrent pairs (100% rate)', () => {
    const PAIRS = 30;
    let detected = 0;

    for (let i = 0; i < PAIRS; i++) {
      const nodeCount = Math.max(2, Math.floor(Math.random() * 10) + 2);
      const idxA = 0;
      const idxB = 1;

      const clockA = createVectorClock(nodeCount, idxA);
      const clockB = createVectorClock(nodeCount, idxB);

      // Each node increments its own slot 1–5 times.
      const incA = Math.floor(Math.random() * 5) + 1;
      const incB = Math.floor(Math.random() * 5) + 1;
      for (let j = 0; j < incA; j++) clockA.increment();
      for (let j = 0; j < incB; j++) clockB.increment();

      // These are concurrent: A has [>0, 0, ...], B has [0, >0, ...]
      if (clockA.isConcurrent(clockB)) {
        detected++;
      }
    }

    const detectionRate = (detected / PAIRS) * 100;

    report.results.conflictDetectionRate = {
      percentage: detectionRate,
      passedTarget: detectionRate === 100,
    };

    console.log(`\n  [CONFLICT DETECTION] ${detected}/${PAIRS} = ${detectionRate}%`);

    expect(detectionRate).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4 — Data Loss
// ─────────────────────────────────────────────────────────────────────────────

describe('Stress Test 4 — Data Loss', () => {
  /**
   * @test Encodes and decodes 50 documents of varying sizes and verifies
   * that every decoded document exactly matches the original.
   *
   * **Target:** 0% data loss.
   *
   * @see Thesis [3] — diff/patch identity guarantee
   * @see ISO/IEC 25010 §4.2.1 — Data integrity
   */
  it('should have 0% data loss across 50 document round-trips', () => {
    const DOCS = 50;
    let lossCount = 0;

    for (let i = 0; i < DOCS; i++) {
      const size = Math.floor(Math.random() * 10000) + 100;
      const original = generateDocument(size);
      const modified = mutateDocument(original);

      const encoded = encode(original, modified, 'thesis.txt');
      const decoded = decode(original, encoded.deltaBase64!);

      if (decoded.content !== modified) {
        lossCount++;
      }

      // Also verify checksum.
      expect(decoded.checksumValid).toBe(true);
    }

    const dataLossRate = (lossCount / DOCS) * 100;

    report.results.dataLossRate = {
      percentage: dataLossRate,
      passedTarget: dataLossRate === 0,
    };

    console.log(`\n  [DATA LOSS] ${lossCount}/${DOCS} = ${dataLossRate}% loss`);

    expect(dataLossRate).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5 — Concurrent Users Simulation
// ─────────────────────────────────────────────────────────────────────────────

describe('Stress Test 5 — Concurrent Users (15 nodes)', () => {
  /**
   * @test Simulates 15 nodes all incrementing vector clocks, then runs
   * 10 merge operations simultaneously. Verifies the final merged clock
   * reflects all 15 nodes with no data corruption.
   *
   * **Target:** All 15 node slots reflected. No corruption.
   *
   * @see Thesis [11] — Mattern merge rule convergence
   * @see ISO/IEC 25010 §4.4 — Scalability
   */
  it('should handle 15 concurrent nodes with 10 merges', () => {
    const NODE_COUNT = 15;
    const MERGES = 10;

    // Create 15 clocks, each increments its own slot.
    const clocks = Array.from({ length: NODE_COUNT }, (_, i) =>
      createVectorClock(NODE_COUNT, i)
    );

    for (const clock of clocks) {
      const increments = Math.floor(Math.random() * 5) + 1;
      for (let j = 0; j < increments; j++) {
        clock.increment();
      }
    }

    // Converge: merge all clocks into clock[0].
    const collector = createVectorClock(NODE_COUNT, 0);
    // Set collector's own slot.
    collector.increment();

    for (let i = 1; i < NODE_COUNT; i++) {
      collector.merge(clocks[i]);
    }

    // Final clock should reflect all 15 nodes.
    for (let i = 0; i < NODE_COUNT; i++) {
      // Each slot should be >= 1 (each node incremented at least once).
      expect(collector.counters[i]).toBeGreaterThanOrEqual(1);
    }

    // Node 0's slot should be highest (it merged 14 times, incrementing each time).
    // Initial: 1 (own increment), then 14 merges, each adds 1 → 1 + 14 = 15.
    expect(collector.counters[0]).toBe(1 + (NODE_COUNT - 1));

    report.results.concurrentUsers = {
      nodesSimulated: NODE_COUNT,
      mergeOperations: NODE_COUNT - 1,
      passedTarget: true,
    };

    console.log(`\n  [CONCURRENT USERS] ${NODE_COUNT} nodes, ${NODE_COUNT - 1} merges, all slots valid`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6 — Consistency Rate
// ─────────────────────────────────────────────────────────────────────────────

describe('Stress Test 6 — Consistency Rate', () => {
  /**
   * @test Runs 100 encode+decode round-trips and measures the percentage
   * that produce identical content.
   *
   * **Target:** ≥ 95% consistency rate.
   *
   * @see Thesis [3] — deterministic diff/patch guarantee
   * @see ISO/IEC 25010 §4.2.2 — Consistency
   */
  it('should achieve >= 95% consistency across 100 round-trips', () => {
    const TRIPS = 100;
    let consistent = 0;

    for (let i = 0; i < TRIPS; i++) {
      const size = Math.floor(Math.random() * 5000) + 200;
      const original = generateDocument(size);
      const modified = mutateDocument(original);

      try {
        const encoded = encode(original, modified, 'thesis.txt');
        const decoded = decode(original, encoded.deltaBase64!);

        if (decoded.content === modified && decoded.checksumValid) {
          consistent++;
        }
      } catch {
        // Count as inconsistent.
      }
    }

    const rate = (consistent / TRIPS) * 100;

    report.results.consistencyRate = {
      percentage: rate,
      passedTarget: rate >= 95,
    };

    console.log(`\n  [CONSISTENCY] ${consistent}/${TRIPS} = ${rate}%`);

    expect(rate).toBeGreaterThanOrEqual(95);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Final Report Output
// ─────────────────────────────────────────────────────────────────────────────

afterAll(() => {
  report.timestamp = new Date().toISOString();

  console.log('\n\n' + '═'.repeat(72));
  console.log('  ISO/IEC 25010 PERFORMANCE METRICS REPORT');
  console.log('═'.repeat(72));
  console.log(JSON.stringify(report, null, 2));
  console.log('═'.repeat(72) + '\n');
});
