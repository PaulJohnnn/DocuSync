/**
 * @file tests/unit/event-log.test.ts
 *
 * Unit test suite for the EventLog module — the append-only event log
 * that records all file mutations in the DocuSync sync engine.
 *
 * Tests use an in-memory mock of PrismaClient to verify the event log's
 * core invariants without requiring a real SQLite database.
 *
 * **Thesis references:**
 * - [2]  Birman, K., et al. (1991). Lightweight causal and atomic group multicast.
 * - [13] Shapiro, M., et al. (2011). Conflict-free replicated data types.
 *
 * @see ISO/IEC 25010 §4.1 — Functional suitability: append-only invariant
 */

import { EventLogService } from '@/engine/log-sync/event-log';
import type { AppendEventInput, EventLogEntry } from '@/engine/log-sync/event-log';
import type { VectorClockJSON } from '@/engine/vector-clock/vector-clock';

// ─────────────────────────────────────────────────────────────────────────────
// Mock PrismaClient
// ─────────────────────────────────────────────────────────────────────────────

/**
 * In-memory store that simulates the Prisma EventLog table.
 * Avoids requiring a real database for unit tests.
 */
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

function createMockPrisma() {
  const rows: MockRow[] = [];
  let autoId = 1;

  return {
    eventLog: {
      create: jest.fn(async ({ data }: { data: any }) => {
        const row: MockRow = {
          id: autoId++,
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
        rows.push(row);
        return row;
      }),

      findMany: jest.fn(async ({ where, orderBy }: any) => {
        let filtered = rows.filter((r) => {
          if (where?.fileId !== undefined && r.fileId !== where.fileId) return false;
          if (where?.logicalTimestamp?.gt !== undefined && r.logicalTimestamp <= where.logicalTimestamp.gt) return false;
          if (where?.isCompacted !== undefined && r.isCompacted !== where.isCompacted) return false;
          return true;
        });

        // Sort by logicalTimestamp ASC, then id ASC.
        filtered.sort((a, b) => {
          const tsDiff = a.logicalTimestamp - b.logicalTimestamp;
          return tsDiff !== 0 ? tsDiff : a.id - b.id;
        });

        return filtered;
      }),

      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        const ids: number[] = where?.id?.in ?? [];
        for (const row of rows) {
          if (ids.includes(row.id)) {
            if (data.isCompacted !== undefined) row.isCompacted = data.isCompacted;
            count++;
          }
        }
        return { count };
      }),
    },
    _rows: rows,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Creates a minimal VectorClockJSON for testing. */
function makeVCJson(nodeCount = 3, nodeIndex = 0): VectorClockJSON {
  return {
    nodeCount,
    nodeIndex,
    root: {
      counter: 0,
      children: Array.from({ length: nodeCount }, () => ({
        counter: 0,
        children: [],
      })),
    },
  };
}

/** Creates a valid AppendEventInput. */
function makeEvent(overrides: Partial<AppendEventInput> = {}): AppendEventInput {
  return {
    eventId: `evt-${Math.random().toString(36).slice(2, 10)}`,
    fileId: 1,
    nodeId: 'node-0',
    eventType: 'edit',
    logicalTimestamp: 1,
    vectorClockJson: makeVCJson(),
    payload: '<p>Hello</p>',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// appendEvent()
// ─────────────────────────────────────────────────────────────────────────────

describe('EventLog — appendEvent()', () => {
  /**
   * @test `appendEvent()` creates an immutable record.
   *
   * @see Thesis [2] §4 — immutable log entry append
   */
  it('should create an immutable record with auto-assigned id and createdAt', async () => {
    const mockPrisma = createMockPrisma();
    const log = new EventLogService(mockPrisma as any);

    const input = makeEvent({ logicalTimestamp: 1 });
    const entry = await log.appendEvent(input);

    expect(entry.id).toBe(1);
    expect(entry.eventId).toBe(input.eventId);
    expect(entry.fileId).toBe(1);
    expect(entry.nodeId).toBe('node-0');
    expect(entry.eventType).toBe('edit');
    expect(entry.logicalTimestamp).toBe(1);
    expect(entry.createdAt).toBeInstanceOf(Date);
    expect(entry.isCompacted).toBe(false);
    expect(entry.payload).toBe('<p>Hello</p>');
  });

  /**
   * @test `appendEvent()` never updates existing records — it always creates new ones.
   *
   * @see Thesis [13] §5.2 — append-only invariant
   */
  it('should never update existing records (always creates new)', async () => {
    const mockPrisma = createMockPrisma();
    const log = new EventLogService(mockPrisma as any);

    await log.appendEvent(makeEvent({ logicalTimestamp: 1 }));
    await log.appendEvent(makeEvent({ logicalTimestamp: 2 }));
    await log.appendEvent(makeEvent({ logicalTimestamp: 3 }));

    expect(mockPrisma.eventLog.create).toHaveBeenCalledTimes(3);
    expect(mockPrisma._rows.length).toBe(3);
    // Each has a unique auto-incremented id.
    expect(mockPrisma._rows[0].id).toBe(1);
    expect(mockPrisma._rows[1].id).toBe(2);
    expect(mockPrisma._rows[2].id).toBe(3);
  });

  /**
   * @test Rejects invalid event types.
   */
  it('should reject invalid event types', async () => {
    const mockPrisma = createMockPrisma();
    const log = new EventLogService(mockPrisma as any);

    await expect(
      log.appendEvent(makeEvent({ eventType: 'invalid-type' as any }))
    ).rejects.toThrow('Invalid event type');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getHistory()
// ─────────────────────────────────────────────────────────────────────────────

describe('EventLog — getHistory()', () => {
  /**
   * @test Returns events in logicalTimestamp ASC order.
   *
   * @see Thesis [2] §6 — ordered log replay
   */
  it('should return events ordered by logicalTimestamp ASC', async () => {
    const mockPrisma = createMockPrisma();
    const log = new EventLogService(mockPrisma as any);

    // Append out of order.
    await log.appendEvent(makeEvent({ logicalTimestamp: 3 }));
    await log.appendEvent(makeEvent({ logicalTimestamp: 1 }));
    await log.appendEvent(makeEvent({ logicalTimestamp: 2 }));

    const history = await log.getHistory(1);

    expect(history.length).toBe(3);
    expect(history[0].logicalTimestamp).toBe(1);
    expect(history[1].logicalTimestamp).toBe(2);
    expect(history[2].logicalTimestamp).toBe(3);
  });

  /**
   * @test Returns empty array when no events exist for the file.
   */
  it('should return empty array for a file with no events', async () => {
    const mockPrisma = createMockPrisma();
    const log = new EventLogService(mockPrisma as any);

    const history = await log.getHistory(999);
    expect(history).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getEventsSince()
// ─────────────────────────────────────────────────────────────────────────────

describe('EventLog — getEventsSince()', () => {
  /**
   * @test Returns only events after the given timestamp.
   *
   * @see Thesis [2] §6 — catch-up via log suffix
   */
  it('should return only events after the given timestamp', async () => {
    const mockPrisma = createMockPrisma();
    const log = new EventLogService(mockPrisma as any);

    await log.appendEvent(makeEvent({ logicalTimestamp: 1 }));
    await log.appendEvent(makeEvent({ logicalTimestamp: 2 }));
    await log.appendEvent(makeEvent({ logicalTimestamp: 3 }));
    await log.appendEvent(makeEvent({ logicalTimestamp: 4 }));

    const since = await log.getEventsSince(1, 2);

    expect(since.length).toBe(2);
    expect(since[0].logicalTimestamp).toBe(3);
    expect(since[1].logicalTimestamp).toBe(4);
  });

  /**
   * @test Excludes compacted events.
   */
  it('should exclude compacted events from catch-up results', async () => {
    const mockPrisma = createMockPrisma();
    const log = new EventLogService(mockPrisma as any);

    await log.appendEvent(makeEvent({ logicalTimestamp: 1 }));
    await log.appendEvent(makeEvent({ logicalTimestamp: 2 }));
    await log.appendEvent(makeEvent({ logicalTimestamp: 3 }));

    // Manually compact the middle event.
    mockPrisma._rows[1].isCompacted = true;

    const since = await log.getEventsSince(1, 0);

    // Should return ts=1 and ts=3, but not ts=2 (compacted).
    const timestamps = since.map((e) => e.logicalTimestamp);
    expect(timestamps).toContain(1);
    expect(timestamps).toContain(3);
    expect(timestamps).not.toContain(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// compactLog()
// ─────────────────────────────────────────────────────────────────────────────

describe('EventLog — compactLog()', () => {
  /**
   * @test Marks obsolete events as `isCompacted = true`.
   *
   * @see Thesis [13] §7.1 — log compaction
   */
  it('should mark obsolete events as isCompacted=true', async () => {
    const mockPrisma = createMockPrisma();
    const log = new EventLogService(mockPrisma as any);

    // Same node, multiple events — earlier ones should be compacted.
    await log.appendEvent(makeEvent({ nodeId: 'node-0', logicalTimestamp: 1 }));
    await log.appendEvent(makeEvent({ nodeId: 'node-0', logicalTimestamp: 2 }));
    await log.appendEvent(makeEvent({ nodeId: 'node-0', logicalTimestamp: 3 }));

    const count = await log.compactLog(1);

    // First 2 events should be compacted, latest survives.
    expect(count).toBe(2);
  });

  /**
   * @test Never deletes rows — only sets isCompacted.
   *
   * @see Thesis [13] §7.1 — rows are never deleted
   */
  it('should never delete rows from the database', async () => {
    const mockPrisma = createMockPrisma();
    const log = new EventLogService(mockPrisma as any);

    await log.appendEvent(makeEvent({ nodeId: 'node-0', logicalTimestamp: 1 }));
    await log.appendEvent(makeEvent({ nodeId: 'node-0', logicalTimestamp: 2 }));
    await log.appendEvent(makeEvent({ nodeId: 'node-0', logicalTimestamp: 3 }));

    await log.compactLog(1);

    // All 3 rows still exist.
    expect(mockPrisma._rows.length).toBe(3);
  });

  /**
   * @test Never compacts the latest event per node.
   *
   * @see Thesis [13] §7.1 — survivor preservation
   */
  it('should never compact the latest event per node', async () => {
    const mockPrisma = createMockPrisma();
    const log = new EventLogService(mockPrisma as any);

    await log.appendEvent(makeEvent({ nodeId: 'node-0', logicalTimestamp: 1 }));
    await log.appendEvent(makeEvent({ nodeId: 'node-0', logicalTimestamp: 2 }));
    await log.appendEvent(makeEvent({ nodeId: 'node-1', logicalTimestamp: 1 }));
    await log.appendEvent(makeEvent({ nodeId: 'node-1', logicalTimestamp: 2 }));

    const count = await log.compactLog(1);

    // Each node had 2 events, so 1 per node is compacted = 2 total.
    expect(count).toBe(2);

    // The latest events (id=2 for node-0, id=4 for node-1) should not be compacted.
    const compactedIds = (mockPrisma.eventLog.updateMany.mock.calls[0] as any)[0].where.id.in;
    expect(compactedIds).not.toContain(2); // latest for node-0
    expect(compactedIds).not.toContain(4); // latest for node-1
  });

  /**
   * @test Returns 0 when there is nothing to compact.
   */
  it('should return 0 when there is nothing to compact', async () => {
    const mockPrisma = createMockPrisma();
    const log = new EventLogService(mockPrisma as any);

    // Only one event — nothing to compact.
    await log.appendEvent(makeEvent({ nodeId: 'node-0', logicalTimestamp: 1 }));

    const count = await log.compactLog(1);
    expect(count).toBe(0);
  });
});
