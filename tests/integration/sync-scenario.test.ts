/**
 * @file tests/integration/sync-scenario.test.ts
 *
 * Integration test suite simulating a 3-node P2P sync scenario.
 *
 * Unlike unit tests that mock dependencies, these tests exercise the actual
 * VectorClock, DeltaEncoder/Decoder, EventLog (mocked Prisma), and LWWResolver
 * working together to simulate real-world sync workflows.
 *
 * **Scenarios tested:**
 * 1. Node A edits → delta encoded → Node B applies → content matches.
 * 2. Node A and Node B edit concurrently → conflict detected → LWW resolves.
 * 3. Node C goes offline → A and B edit → C reconnects → catches up via
 *    `getEventsSince()` → all nodes converge.
 * 4. Vector clocks advance correctly after each edit and merge.
 * 5. Event log grows correctly (append-only).
 *
 * **Thesis references:**
 * - [2]  Birman et al. (1991) — causal ordering and catch-up sync.
 * - [8]  Fidge (1988) — vector clock correctness.
 * - [11] Mattern (1989) — merge rule.
 * - [45] Johnson & Thomas (1975) — LWW resolution.
 *
 * @see ISO/IEC 25010 §4.3 — Performance efficiency & reliability
 */

import { createVectorClock, VectorClock } from '@/engine/vector-clock/vector-clock';
import { encode } from '@/engine/delta/delta-encoder';
import { decode } from '@/engine/delta/delta-decoder';
import { EventLogService } from '@/engine/log-sync/event-log';
import { LWWResolver } from '@/engine/lww/lww-resolver';
import type { SyncEvent } from '@/engine/lww/lww-resolver';
import type { AppendEventInput } from '@/engine/log-sync/event-log';
import type { VectorClockJSON } from '@/engine/vector-clock/vector-clock';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Prisma (shared across all scenarios)
// ─────────────────────────────────────────────────────────────────────────────

interface MockRow {
  id: number;
  eventId: string;
  fileId: number;
  nodeId: string;
  eventType: string;
  logicalTimestamp: number;
  vectorClockJson: string;
  payload: string;
  createdAt: Date;
  isCompacted: boolean;
}

interface MockConflictRow {
  id: number;
  conflictId: string;
  fileId: number;
  eventIdA: string;
  nodeIdA: string;
  vectorClockJsonA: string;
  payloadA: string;
  eventIdB: string;
  nodeIdB: string;
  vectorClockJsonB: string;
  payloadB: string;
  status: string;
  winner: string | null;
  resolvedBy: string | null;
  detectedAt: Date;
  resolvedAt: Date | null;
}

function createMockPrisma() {
  const eventRows: MockRow[] = [];
  const conflictRows: MockConflictRow[] = [];
  let eventAutoId = 1;
  let conflictAutoId = 1;

  return {
    eventLog: {
      create: jest.fn(async ({ data }: any) => {
        const row: MockRow = {
          id: eventAutoId++,
          eventId: data.eventId,
          fileId: data.fileId,
          nodeId: data.nodeId,
          eventType: data.eventType,
          logicalTimestamp: data.logicalTimestamp,
          vectorClockJson: data.vectorClockJson,
          payload: data.payload,
          createdAt: new Date(),
          isCompacted: false,
        };
        eventRows.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where, orderBy }: any = {}) => {
        let filtered = eventRows.filter((r) => {
          if (where?.fileId !== undefined && r.fileId !== where.fileId) return false;
          if (where?.logicalTimestamp?.gt !== undefined && r.logicalTimestamp <= where.logicalTimestamp.gt) return false;
          if (where?.isCompacted !== undefined && r.isCompacted !== where.isCompacted) return false;
          return true;
        });
        filtered.sort((a, b) => a.logicalTimestamp - b.logicalTimestamp || a.id - b.id);
        return filtered;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        const ids: number[] = where?.id?.in ?? [];
        for (const row of eventRows) {
          if (ids.includes(row.id)) {
            if (data.isCompacted !== undefined) row.isCompacted = data.isCompacted;
            count++;
          }
        }
        return { count };
      }),
    },
    conflict: {
      create: jest.fn(async ({ data }: any) => {
        const row: MockConflictRow = {
          id: conflictAutoId++,
          conflictId: data.conflictId,
          fileId: data.fileId,
          eventIdA: data.eventIdA,
          nodeIdA: data.nodeIdA,
          vectorClockJsonA: data.vectorClockJsonA,
          payloadA: data.payloadA,
          eventIdB: data.eventIdB,
          nodeIdB: data.nodeIdB,
          vectorClockJsonB: data.vectorClockJsonB,
          payloadB: data.payloadB,
          status: data.status,
          winner: null,
          resolvedBy: null,
          detectedAt: new Date(),
          resolvedAt: null,
        };
        conflictRows.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        return conflictRows.find((c) => c.conflictId === where.conflictId) ?? null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = conflictRows.find((c) => c.conflictId === where.conflictId);
        if (!row) return null;
        if (data.status !== undefined) row.status = data.status;
        if (data.winner !== undefined) row.winner = data.winner;
        if (data.resolvedBy !== undefined) row.resolvedBy = data.resolvedBy;
        if (data.resolvedAt !== undefined) row.resolvedAt = data.resolvedAt;
        return row;
      }),
      findMany: jest.fn(async () => conflictRows),
    },
    _eventRows: eventRows,
    _conflictRows: conflictRows,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Single edit propagation
// ─────────────────────────────────────────────────────────────────────────────

describe('Integration — Single edit propagation (A → B)', () => {
  /**
   * @test Node A edits a document → delta encoded → Node B applies →
   * Node B's content exactly matches Node A's content.
   *
   * @see Thesis [3] — Myers diff round-trip fidelity
   * @see Thesis [8] — vector clock advancement
   */
  it('should propagate edit from Node A to Node B with exact content match', () => {
    const originalContent = 'Chapter 1: Introduction\n\nThis is the introduction.';
    const editedContent = 'Chapter 1: Introduction\n\nThis is the UPDATED introduction.';

    // Node A encodes the delta.
    const encodeResult = encode(originalContent, editedContent, 'thesis.txt');
    expect(encodeResult.deltaBase64).toBeTruthy();

    // Node B decodes the delta.
    const decodeResult = decode(originalContent, encodeResult.deltaBase64!);

    // Content must match exactly.
    expect(decodeResult.content).toBe(editedContent);
    expect(decodeResult.checksumValid).toBe(true);
  });

  /**
   * @test Vector clocks advance correctly after the edit.
   */
  it('should advance vector clocks correctly', () => {
    const clockA = createVectorClock(3, 0);
    const clockB = createVectorClock(3, 1);

    // Node A makes an edit.
    clockA.increment(); // [1, 0, 0]
    expect(clockA.counters[0]).toBe(1);

    // Node B receives A's clock and merges.
    clockB.merge(clockA); // max([0,0,0], [1,0,0]) = [1,0,0], then inc own → [1, 1, 0]
    expect(clockB.counters[0]).toBe(1);
    expect(clockB.counters[1]).toBe(1);

    // A's edit is now causally before B's state.
    expect(clockB.dominates(clockA)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Concurrent edits → conflict → LWW resolves
// ─────────────────────────────────────────────────────────────────────────────

describe('Integration — Concurrent edits → conflict → resolution', () => {
  /**
   * @test Node A and Node B edit concurrently → conflict detected →
   * LWW resolver escalates to owner → owner picks winner →
   * all nodes converge on the winning content.
   *
   * @see Thesis [45] — LWW resolution on concurrent timestamps
   * @see Thesis [47] — owner-arbitrated escalation
   */
  it('should detect concurrent edits and resolve via LWW', async () => {
    const mockPrisma = createMockPrisma();
    const eventLog = new EventLogService(mockPrisma as any);
    const resolver = new LWWResolver(mockPrisma as any, eventLog);

    // Both nodes start from the same base.
    const clockA = createVectorClock(3, 0);
    const clockB = createVectorClock(3, 1);

    // Both edit independently (concurrent edits).
    clockA.increment(); // [1, 0, 0]
    clockB.increment(); // [0, 1, 0]

    expect(clockA.isConcurrent(clockB)).toBe(true);

    const eventA: SyncEvent = {
      eventId: 'evt-A',
      fileId: 1,
      nodeId: 'node-A',
      payload: '<p>Edit by Node A</p>',
      logicalTimestamp: 1,
      vectorClockJson: clockA.toJSON(),
    };

    const eventB: SyncEvent = {
      eventId: 'evt-B',
      fileId: 1,
      nodeId: 'node-B',
      payload: '<p>Edit by Node B</p>',
      logicalTimestamp: 1,
      vectorClockJson: clockB.toJSON(),
    };

    // Resolve conflict.
    const result = await resolver.resolve(eventA, eventB, clockA, clockB);

    expect(result.outcome).toBe('escalated');
    expect(result.conflictId).toBeTruthy();

    // Both events preserved in log.
    expect(mockPrisma._eventRows.length).toBe(2);

    // Owner resolves by picking A.
    const mergedClock = createVectorClock(3, 2);
    mergedClock.increment();

    const autoResult = await resolver.autoResolve(
      result.conflictId!,
      'A',
      'owner-node',
      mergedClock.toJSON()
    );

    expect(autoResult.conflict.status).toBe('resolved');
    expect(autoResult.conflict.winner).toBe('A');
    expect(autoResult.mergeAcceptMessage.winnerPayload).toBe('<p>Edit by Node A</p>');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Offline node catch-up
// ─────────────────────────────────────────────────────────────────────────────

describe('Integration — Offline node catch-up', () => {
  /**
   * @test Node C goes offline → A and B make edits → C reconnects →
   * getEventsSince() returns only missed events → C catches up.
   *
   * @see Thesis [2] §6 — catch-up synchronization
   */
  it('should catch up offline node via getEventsSince()', async () => {
    const mockPrisma = createMockPrisma();
    const eventLog = new EventLogService(mockPrisma as any);

    // C was online and has seen events up to logicalTimestamp=2.
    const vcJson: VectorClockJSON = {
      nodeCount: 3,
      nodeIndex: 0,
      root: { counter: 0, children: [{ counter: 0, children: [] }, { counter: 0, children: [] }, { counter: 0, children: [] }] },
    };

    // A and B make edits while C is offline.
    await eventLog.appendEvent({
      eventId: 'evt-1', fileId: 1, nodeId: 'node-A', eventType: 'edit',
      logicalTimestamp: 1, vectorClockJson: vcJson, payload: 'Edit 1 by A',
    });
    await eventLog.appendEvent({
      eventId: 'evt-2', fileId: 1, nodeId: 'node-B', eventType: 'edit',
      logicalTimestamp: 2, vectorClockJson: vcJson, payload: 'Edit 2 by B',
    });
    await eventLog.appendEvent({
      eventId: 'evt-3', fileId: 1, nodeId: 'node-A', eventType: 'edit',
      logicalTimestamp: 3, vectorClockJson: vcJson, payload: 'Edit 3 by A',
    });
    await eventLog.appendEvent({
      eventId: 'evt-4', fileId: 1, nodeId: 'node-B', eventType: 'edit',
      logicalTimestamp: 4, vectorClockJson: vcJson, payload: 'Edit 4 by B',
    });

    // C reconnects with lastKnownTimestamp=2.
    const missed = await eventLog.getEventsSince(1, 2);

    // Should get events 3 and 4 (timestamps > 2).
    expect(missed.length).toBe(2);
    expect(missed[0].logicalTimestamp).toBe(3);
    expect(missed[1].logicalTimestamp).toBe(4);
    expect(missed[0].eventId).toBe('evt-3');
    expect(missed[1].eventId).toBe('evt-4');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Vector clock correctness across edits and merges
// ─────────────────────────────────────────────────────────────────────────────

describe('Integration — Vector clock correctness', () => {
  /**
   * @test Verifies vector clocks advance correctly through a sequence of
   * edits and merges across 3 nodes.
   *
   * @see Thesis [8] — Fidge clock correctness
   * @see Thesis [11] — Mattern merge rule
   */
  it('should maintain correct clock state through edits and merges', () => {
    const clockA = createVectorClock(3, 0);
    const clockB = createVectorClock(3, 1);
    const clockC = createVectorClock(3, 2);

    // Step 1: A edits → [1, 0, 0]
    clockA.increment();
    expect([...clockA.counters]).toEqual([1, 0, 0]);

    // Step 2: B edits → [0, 1, 0]
    clockB.increment();
    expect([...clockB.counters]).toEqual([0, 1, 0]);

    // Step 3: C receives A's edit → merge → max([0,0,0], [1,0,0]) = [1,0,0], inc own → [1, 0, 1]
    clockC.merge(clockA);
    expect([...clockC.counters]).toEqual([1, 0, 1]);

    // Step 4: C receives B's edit → merge → max([1,0,1], [0,1,0]) = [1,1,1], inc own → [1, 1, 2]
    clockC.merge(clockB);
    expect([...clockC.counters]).toEqual([1, 1, 2]);

    // Step 5: C now dominates both A and B.
    expect(clockC.dominates(clockA)).toBe(true);
    expect(clockC.dominates(clockB)).toBe(true);

    // Step 6: A and B are concurrent.
    expect(clockA.isConcurrent(clockB)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Event log growth (append-only)
// ─────────────────────────────────────────────────────────────────────────────

describe('Integration — Event log append-only growth', () => {
  /**
   * @test Verifies event log grows monotonically and never shrinks.
   *
   * @see Thesis [13] §5.2 — append-only invariant
   */
  it('should grow monotonically with each append', async () => {
    const mockPrisma = createMockPrisma();
    const eventLog = new EventLogService(mockPrisma as any);

    const vcJson: VectorClockJSON = {
      nodeCount: 3, nodeIndex: 0,
      root: { counter: 0, children: [{ counter: 0, children: [] }, { counter: 0, children: [] }, { counter: 0, children: [] }] },
    };

    const sizes: number[] = [];

    for (let i = 1; i <= 10; i++) {
      await eventLog.appendEvent({
        eventId: `evt-${i}`, fileId: 1, nodeId: 'node-A',
        eventType: 'edit', logicalTimestamp: i,
        vectorClockJson: vcJson, payload: `Edit ${i}`,
      });

      const history = await eventLog.getHistory(1);
      sizes.push(history.length);
    }

    // Verify monotonic growth.
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    }
    expect(sizes[sizes.length - 1]).toBe(10);
  });
});
