/**
 * @file tests/unit/lww-resolver.test.ts
 *
 * Unit test suite for the LWW (Last-Writer-Wins) Resolver module.
 *
 * Tests cover: `resolve()` for all four outcomes (a-wins, b-wins, escalated,
 * equal), `escalateToOwner()` writing a pending Conflict record,
 * `autoResolve()` updating status and constructing MERGE_ACCEPT, and error
 * handling for already-resolved conflicts.
 *
 * Uses in-memory mocks for PrismaClient and EventLogService.
 *
 * **Thesis references:**
 * - [45] Johnson, P. R., & Thomas, R. H. (1975). LWW registers.
 * - [47] Saito, Y., & Shapiro, M. (2005). Optimistic replication.
 *
 * @see ISO/IEC 25010 §4.1 — Functional suitability: conflict resolution
 */

import { LWWResolver } from '@/engine/lww/lww-resolver';
import type { SyncEvent, ResolveOutcome } from '@/engine/lww/lww-resolver';
import { createVectorClock, VectorClock } from '@/engine/vector-clock/vector-clock';
import type { VectorClockJSON } from '@/engine/vector-clock/vector-clock';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Services
// ─────────────────────────────────────────────────────────────────────────────

/** In-memory event log entries for mock. */
interface MockLogEntry {
  eventId: string;
  fileId: number;
  nodeId: string;
  eventType: string;
  logicalTimestamp: number;
  vectorClockJson: VectorClockJSON;
  payload: string;
  id: number;
  createdAt: Date;
  isCompacted: boolean;
}

function createMockEventLog() {
  const entries: MockLogEntry[] = [];
  let autoId = 1;

  return {
    appendEvent: jest.fn(async (input: any) => {
      const entry: MockLogEntry = {
        id: autoId++,
        eventId: input.eventId,
        fileId: input.fileId,
        nodeId: input.nodeId,
        eventType: input.eventType,
        logicalTimestamp: input.logicalTimestamp,
        vectorClockJson: input.vectorClockJson,
        payload: input.payload,
        createdAt: new Date(),
        isCompacted: false,
      };
      entries.push(entry);
      return entry;
    }),
    _entries: entries,
  };
}

/** In-memory conflict table for mock. */
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
  const conflicts: MockConflictRow[] = [];
  let autoId = 1;

  return {
    conflict: {
      create: jest.fn(async ({ data }: any) => {
        const row: MockConflictRow = {
          id: autoId++,
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
          winner: data.winner ?? null,
          resolvedBy: data.resolvedBy ?? null,
          detectedAt: new Date(),
          resolvedAt: data.resolvedAt ?? null,
        };
        conflicts.push(row);
        return row;
      }),

      findUnique: jest.fn(async ({ where }: any) => {
        return conflicts.find((c) => c.conflictId === where.conflictId) ?? null;
      }),

      update: jest.fn(async ({ where, data }: any) => {
        const row = conflicts.find((c) => c.conflictId === where.conflictId);
        if (!row) return null;
        if (data.status !== undefined) row.status = data.status;
        if (data.winner !== undefined) row.winner = data.winner;
        if (data.resolvedBy !== undefined) row.resolvedBy = data.resolvedBy;
        if (data.resolvedAt !== undefined) row.resolvedAt = data.resolvedAt;
        return row;
      }),

      findMany: jest.fn(async () => conflicts),
    },
    _conflicts: conflicts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeSyncEvent(overrides: Partial<SyncEvent> = {}): SyncEvent {
  const vc = createVectorClock(3, 0);
  return {
    eventId: `evt-${Math.random().toString(36).slice(2, 10)}`,
    fileId: 1,
    nodeId: 'node-0',
    payload: '<p>Content A</p>',
    logicalTimestamp: 1,
    vectorClockJson: vc.toJSON(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// resolve()
// ─────────────────────────────────────────────────────────────────────────────

describe('LWWResolver — resolve()', () => {
  /**
   * @test Returns `a-wins` when clockA strictly dominates clockB.
   *
   * @see Thesis [45] §3 — LWW: higher timestamp wins
   */
  it('should return a-wins when clockA dominates', async () => {
    const mockPrisma = createMockPrisma();
    const mockLog = createMockEventLog();
    const resolver = new LWWResolver(mockPrisma as any, mockLog as any);

    const clockA = createVectorClock(3, 0);
    clockA.increment().increment(); // [2, 0, 0]

    const clockB = createVectorClock(3, 1);
    clockB.increment(); // [0, 1, 0]

    // A dominates: A has [2,0,0], B has [0,1,0] → actually concurrent!
    // Need to make A truly dominate B.
    const clockA2 = createVectorClock(3, 0);
    clockA2.increment().increment(); // [2, 0, 0]

    const clockB2 = createVectorClock(3, 0);
    clockB2.increment(); // [1, 0, 0]

    const eventA = makeSyncEvent({ nodeId: 'node-0', vectorClockJson: clockA2.toJSON() });
    const eventB = makeSyncEvent({ nodeId: 'node-1', vectorClockJson: clockB2.toJSON() });

    const result = await resolver.resolve(eventA, eventB, clockA2, clockB2);

    expect(result.outcome).toBe('a-wins' as ResolveOutcome);
    expect(result.winner).toBe(eventA);
    expect(result.loser).toBe(eventB);
    expect(result.relation).toBe('dominant');
    expect(result.conflictId).toBeNull();
  });

  /**
   * @test Returns `b-wins` when clockB strictly dominates clockA.
   *
   * @see Thesis [45] §3 — LWW: lower timestamp loses
   */
  it('should return b-wins when clockB dominates', async () => {
    const mockPrisma = createMockPrisma();
    const mockLog = createMockEventLog();
    const resolver = new LWWResolver(mockPrisma as any, mockLog as any);

    const clockA = createVectorClock(3, 0);
    clockA.increment(); // [1, 0, 0]

    const clockB = createVectorClock(3, 0);
    clockB.increment().increment(); // [2, 0, 0]

    const eventA = makeSyncEvent({ vectorClockJson: clockA.toJSON() });
    const eventB = makeSyncEvent({ vectorClockJson: clockB.toJSON() });

    const result = await resolver.resolve(eventA, eventB, clockA, clockB);

    expect(result.outcome).toBe('b-wins' as ResolveOutcome);
    expect(result.winner).toBe(eventB);
    expect(result.loser).toBe(eventA);
    expect(result.relation).toBe('dominated');
  });

  /**
   * @test Returns `escalated` when clocks are concurrent.
   *
   * @see Thesis [47] §4.2 — escalation on concurrency
   */
  it('should return escalated when clocks are concurrent', async () => {
    const mockPrisma = createMockPrisma();
    const mockLog = createMockEventLog();
    const resolver = new LWWResolver(mockPrisma as any, mockLog as any);

    const clockA = createVectorClock(2, 0);
    clockA.increment(); // [1, 0]

    const clockB = createVectorClock(2, 1);
    clockB.increment(); // [0, 1]

    const eventA = makeSyncEvent({ nodeId: 'node-0', vectorClockJson: clockA.toJSON() });
    const eventB = makeSyncEvent({ nodeId: 'node-1', vectorClockJson: clockB.toJSON() });

    const result = await resolver.resolve(eventA, eventB, clockA, clockB);

    expect(result.outcome).toBe('escalated' as ResolveOutcome);
    expect(result.winner).toBeNull();
    expect(result.loser).toBeNull();
    expect(result.relation).toBe('concurrent');
    expect(result.conflictId).toBeTruthy();
  });

  /**
   * @test Returns `equal` when clocks are identical.
   */
  it('should return equal when clocks are identical', async () => {
    const mockPrisma = createMockPrisma();
    const mockLog = createMockEventLog();
    const resolver = new LWWResolver(mockPrisma as any, mockLog as any);

    const clock = createVectorClock(2, 0);
    clock.increment(); // [1, 0]

    const clockClone = VectorClock.fromJSON(clock.toJSON());

    const eventA = makeSyncEvent({ vectorClockJson: clock.toJSON() });
    const eventB = makeSyncEvent({ vectorClockJson: clockClone.toJSON() });

    const result = await resolver.resolve(eventA, eventB, clock, clockClone);

    expect(result.outcome).toBe('equal' as ResolveOutcome);
    expect(result.winner).toBeNull();
    expect(result.loser).toBeNull();
    expect(result.conflictId).toBeNull();
  });

  /**
   * @test Both events are always appended to the log BEFORE resolution.
   *
   * @see Thesis [45] — data preservation guarantee
   */
  it('should append both events to the log before resolution', async () => {
    const mockPrisma = createMockPrisma();
    const mockLog = createMockEventLog();
    const resolver = new LWWResolver(mockPrisma as any, mockLog as any);

    const clockA = createVectorClock(2, 0);
    clockA.increment();

    const clockB = createVectorClock(2, 0);
    clockB.increment().increment();

    const eventA = makeSyncEvent({ eventId: 'evt-A', vectorClockJson: clockA.toJSON() });
    const eventB = makeSyncEvent({ eventId: 'evt-B', vectorClockJson: clockB.toJSON() });

    await resolver.resolve(eventA, eventB, clockA, clockB);

    // Both events must be in the log.
    expect(mockLog.appendEvent).toHaveBeenCalledTimes(2);
    const loggedIds = mockLog._entries.map((e) => e.eventId);
    expect(loggedIds).toContain('evt-A');
    expect(loggedIds).toContain('evt-B');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// escalateToOwner()
// ─────────────────────────────────────────────────────────────────────────────

describe('LWWResolver — escalateToOwner()', () => {
  /**
   * @test Writes a pending Conflict record to the database.
   *
   * @see Thesis [47] §4.2 — pending conflict creation
   */
  it('should write a pending Conflict record', async () => {
    const mockPrisma = createMockPrisma();
    const mockLog = createMockEventLog();
    const resolver = new LWWResolver(mockPrisma as any, mockLog as any);

    const eventA = makeSyncEvent({ eventId: 'evt-A', nodeId: 'node-0', payload: 'Content A' });
    const eventB = makeSyncEvent({ eventId: 'evt-B', nodeId: 'node-1', payload: 'Content B' });

    const conflictId = await resolver.escalateToOwner(eventA, eventB);

    expect(typeof conflictId).toBe('string');
    expect(conflictId.length).toBeGreaterThan(0);
    expect(mockPrisma.conflict.create).toHaveBeenCalledTimes(1);

    const created = mockPrisma._conflicts[0];
    expect(created.status).toBe('pending');
    expect(created.payloadA).toBe('Content A');
    expect(created.payloadB).toBe('Content B');
    expect(created.nodeIdA).toBe('node-0');
    expect(created.nodeIdB).toBe('node-1');
    expect(created.winner).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// autoResolve()
// ─────────────────────────────────────────────────────────────────────────────

describe('LWWResolver — autoResolve()', () => {
  /**
   * @test Updates conflict status to `resolved` and sets winner.
   *
   * @see Thesis [47] §5.3 — owner commits resolution
   */
  it('should update status to resolved and set winner', async () => {
    const mockPrisma = createMockPrisma();
    const mockLog = createMockEventLog();
    const resolver = new LWWResolver(mockPrisma as any, mockLog as any);

    // Create a pending conflict first.
    const eventA = makeSyncEvent({ eventId: 'evt-A', nodeId: 'node-0', payload: 'Content A' });
    const eventB = makeSyncEvent({ eventId: 'evt-B', nodeId: 'node-1', payload: 'Content B' });
    const conflictId = await resolver.escalateToOwner(eventA, eventB);

    // Build a merged clock.
    const mergedClock = createVectorClock(3, 0);
    mergedClock.increment();

    const result = await resolver.autoResolve(conflictId, 'A', 'owner-node', mergedClock.toJSON());

    expect(result.conflict.status).toBe('resolved');
    expect(result.conflict.winner).toBe('A');
    expect(result.conflict.resolvedBy).toBe('owner-node');
  });

  /**
   * @test Throws on already-resolved conflict.
   */
  it('should throw on already-resolved conflict', async () => {
    const mockPrisma = createMockPrisma();
    const mockLog = createMockEventLog();
    const resolver = new LWWResolver(mockPrisma as any, mockLog as any);

    const eventA = makeSyncEvent({ eventId: 'evt-A' });
    const eventB = makeSyncEvent({ eventId: 'evt-B' });
    const conflictId = await resolver.escalateToOwner(eventA, eventB);

    const mergedClock = createVectorClock(3, 0);
    mergedClock.increment();

    // First resolve succeeds.
    await resolver.autoResolve(conflictId, 'A', 'owner-node', mergedClock.toJSON());

    // Second resolve should throw.
    await expect(
      resolver.autoResolve(conflictId, 'B', 'owner-node', mergedClock.toJSON())
    ).rejects.toThrow('already resolved');
  });

  /**
   * @test Constructs correct MERGE_ACCEPT message.
   *
   * @see Thesis [47] §5.3 — MERGE_ACCEPT broadcast
   */
  it('should construct correct MERGE_ACCEPT message', async () => {
    const mockPrisma = createMockPrisma();
    const mockLog = createMockEventLog();
    const resolver = new LWWResolver(mockPrisma as any, mockLog as any);

    const eventA = makeSyncEvent({ eventId: 'evt-A', nodeId: 'node-0', payload: 'Winner Content' });
    const eventB = makeSyncEvent({ eventId: 'evt-B', nodeId: 'node-1', payload: 'Loser Content' });
    const conflictId = await resolver.escalateToOwner(eventA, eventB);

    const mergedClock = createVectorClock(3, 0);
    mergedClock.increment();

    const result = await resolver.autoResolve(conflictId, 'A', 'owner-node', mergedClock.toJSON());
    const msg = result.mergeAcceptMessage;

    expect(msg.type).toBe('MERGE_ACCEPT');
    expect(msg.conflictId).toBe(conflictId);
    expect(msg.winner).toBe('A');
    expect(msg.winnerPayload).toBe('Winner Content');
    expect(msg.resolvedBy).toBe('owner-node');
    expect(msg.fileId).toBe('1');
    expect(msg.vectorClockJson).toBeTruthy();
    expect(msg.resolutionEventId).toBeTruthy();
  });

  /**
   * @test Throws on non-existent conflictId.
   */
  it('should throw on non-existent conflictId', async () => {
    const mockPrisma = createMockPrisma();
    const mockLog = createMockEventLog();
    const resolver = new LWWResolver(mockPrisma as any, mockLog as any);

    const mergedClock = createVectorClock(3, 0);
    mergedClock.increment();

    await expect(
      resolver.autoResolve('non-existent-id', 'A', 'owner', mergedClock.toJSON())
    ).rejects.toThrow('not found');
  });
});
