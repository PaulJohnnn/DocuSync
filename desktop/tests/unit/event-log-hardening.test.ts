/**
 * @file tests/unit/event-log-hardening.test.ts
 *
 * Regression tests added during the Minor Fix Phase.
 *
 * These tests protect against:
 * 1. Silent vectorClockJson corruption — after Fix 1, the catch block now
 *    warns. Tests verify the warn fires AND the fallback still functions.
 * 2. Duplicate event idempotency — appendEvent with an already-seen eventId
 *    must return the existing entry without duplication.
 * 3. Invalid event-type rejection — assertValidEventType must throw for
 *    unrecognised types.
 * 4. Event ordering — getHistory must preserve insertion order (id ASC),
 *    not logical-timestamp order, to keep delta-replay chains valid.
 *    Payload integrity is verified: what was stored must come back exactly.
 *
 * Layer:    Unit (no real database — in-memory Prisma mock)
 * Runner:   Jest (desktop/jest.config.ts, project "unit")
 * Command:  npx jest --testPathPattern=event-log-hardening
 */

import { EventLogService } from '@/engine/log-sync/event-log';
import type { AppendEventInput } from '@/engine/log-sync/event-log';
import type { VectorClockJSON } from '@/engine/vector-clock/vector-clock';

// ─────────────────────────────────────────────────────────────────────────────
// In-memory Prisma mock (same pattern as event-log.test.ts)
// ─────────────────────────────────────────────────────────────────────────────

interface MockRow {
  id: number;
  eventId: string;
  fileId: string;          // stored as string in schema
  nodeId: string;
  eventType: string;
  logicalTimestamp: number;
  vectorClockJson: string; // raw stored string — can be corrupt
  payload: string;
  createdAt: Date;
  isCompacted: boolean;
}

function createMockPrisma() {
  const rows: MockRow[] = [];
  let autoId = 1;

  return {
    eventLog: {
      findUnique: jest.fn(async ({ where }: { where: any }) =>
        rows.find((r) => r.eventId === where.eventId) ?? null
      ),
      create: jest.fn(async ({ data }: { data: any }) => {
        const row: MockRow = {
          id:                autoId++,
          eventId:           data.eventId,
          fileId:            data.fileId,
          nodeId:            data.nodeId,
          eventType:         data.eventType,
          logicalTimestamp:  data.logicalTimestamp,
          vectorClockJson:   data.vectorClockJson,
          payload:           data.payload,
          createdAt:         new Date(),
          isCompacted:       false,
        };
        rows.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where, orderBy }: any) => {
        let filtered = rows.filter((r) => {
          if (where?.fileId !== undefined && r.fileId !== where.fileId) return false;
          if (where?.logicalTimestamp?.gt !== undefined &&
              r.logicalTimestamp <= where.logicalTimestamp.gt) return false;
          if (where?.isCompacted !== undefined && r.isCompacted !== where.isCompacted) return false;
          return true;
        });

        // Respect orderBy.id asc (getHistory ordering)
        if (orderBy?.[0]?.id === 'asc') {
          filtered = filtered.slice().sort((a, b) => a.id - b.id);
        } else {
          filtered = filtered.slice().sort(
            (a, b) => a.logicalTimestamp - b.logicalTimestamp || a.id - b.id
          );
        }
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

function makeVCJson(nodeCount = 3, nodeIndex = 0): VectorClockJSON {
  return {
    nodeCount,
    nodeIndex,
    root: {
      counter: 0,
      children: Array.from({ length: nodeCount }, () => ({ counter: 0, children: [] })),
    },
  };
}

function makeEvent(overrides: Partial<AppendEventInput> = {}): AppendEventInput {
  return {
    eventId:          `evt-${Math.random().toString(36).slice(2, 10)}`,
    fileId:           1,
    nodeId:           'node-0',
    eventType:        'edit',
    logicalTimestamp: 1,
    vectorClockJson:  makeVCJson(),
    payload:          '<p>Hello</p>',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1 — Corrupted VectorClockJSON fallback (Fix 1 regression)
// ─────────────────────────────────────────────────────────────────────────────

describe('EventLog — corrupted vectorClockJson (Fix 1 regression)', () => {
  /**
   * Purpose: After Fix 1, toEventLogEntry emits console.warn when the stored
   * vectorClockJson cannot be parsed. This test verifies:
   *   a) The warn fires with the expected structured metadata.
   *   b) getHistory still returns the row (fallback to zero-clock).
   *   c) The returned entry has a syntactically valid VectorClockJSON.
   *
   * Regression protected: Before Fix 1, the catch was completely silent.
   * If the fix broke the fallback path, getHistory would throw instead.
   *
   * Expected result: 1 warn fired, 1 entry returned with zero-clock fallback.
   */
  it('should warn and fall back to zero-clock when vectorClockJson is corrupt', async () => {
    const mockPrisma = createMockPrisma();
    const log = new EventLogService(mockPrisma as any);

    // Append a normal event first so the row exists.
    const input = makeEvent({ logicalTimestamp: 1 });
    await log.appendEvent(input);

    // Corrupt the stored vectorClockJson directly in the mock store.
    mockPrisma._rows[0].vectorClockJson = '{ not valid json !!!';

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const history = await log.getHistory(1);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnArgs = warnSpy.mock.calls[0];
    // Fix 1 log message check
    expect(warnArgs[0]).toContain('[EventLog]');
    // Structured metadata must include eventId and fallback type
    expect(warnArgs[1]).toMatchObject({
      eventId: input.eventId,
      field: 'vectorClockJson',
      fallback: 'zero-vector-clock',
    });

    // Entry is still returned — fallback in effect.
    expect(history.length).toBe(1);
    // Fallback clock is the zero-vector-clock shape.
    expect(history[0].vectorClockJson).toMatchObject({
      nodeCount: expect.any(Number),
      nodeIndex: expect.any(Number),
      root: expect.any(Object),
    });

    warnSpy.mockRestore();
  });

  /**
   * Purpose: A valid vectorClockJson must NOT produce a warn.
   * Regression protected: Verifies the warn is NOT a false-positive on normal data.
   */
  it('should NOT warn when vectorClockJson is valid', async () => {
    const mockPrisma = createMockPrisma();
    const log = new EventLogService(mockPrisma as any);

    await log.appendEvent(makeEvent({ logicalTimestamp: 1 }));

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await log.getHistory(1);

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2 — Duplicate event idempotency
// ─────────────────────────────────────────────────────────────────────────────

describe('EventLog — duplicate event idempotency', () => {
  /**
   * Purpose: appendEvent with a duplicate eventId must return the EXISTING
   * entry and must NOT create a second database row.
   *
   * Source behavior: EventLogService.appendEvent() calls findUnique first and
   * returns early when the eventId already exists (verified in event-log.ts
   * lines 300-305).
   *
   * Regression protected: Any future refactor that removes the idempotency
   * guard would cause test failure, alerting developers to the regression.
   *
   * Expected result: create called once; second call returns id=1 (first row).
   */
  it('should return the existing entry on duplicate eventId, not create a second row', async () => {
    const mockPrisma = createMockPrisma();
    const log = new EventLogService(mockPrisma as any);

    const input = makeEvent({ logicalTimestamp: 1, payload: '<p>First</p>' });
    const first = await log.appendEvent(input);

    // Send the exact same eventId again.
    const second = await log.appendEvent({ ...input, payload: '<p>Duplicate attempt</p>' });

    expect(mockPrisma.eventLog.create).toHaveBeenCalledTimes(1);
    expect(second.id).toBe(first.id);
    expect(second.payload).toBe('<p>First</p>');   // original payload preserved
    expect(mockPrisma._rows.length).toBe(1);       // only one row in DB
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3 — Invalid event type rejection
// ─────────────────────────────────────────────────────────────────────────────

describe('EventLog — invalid event type rejection', () => {
  /**
   * Purpose: assertValidEventType must throw for unrecognised event types.
   * Source behavior: assertValidEventType (event-log.ts lines 195-202)
   * throws with the message 'Invalid event type'.
   *
   * Regression protected: Any future removal of the type guard would
   * allow arbitrary strings into the database, breaking downstream
   * type assertions.
   *
   * Expected result: Promise rejects with 'Invalid event type'.
   */
  it('should reject unrecognised event types', async () => {
    const mockPrisma = createMockPrisma();
    const log = new EventLogService(mockPrisma as any);

    await expect(
      log.appendEvent(makeEvent({ eventType: 'hacked-type' as any }))
    ).rejects.toThrow('Invalid event type');

    expect(mockPrisma.eventLog.create).not.toHaveBeenCalled();
  });

  /**
   * Purpose: All documented event types must be accepted.
   * Regression protected: Ensures the valid-type set is not accidentally shrunk.
   */
  it('should accept all documented event types', async () => {
    const mockPrisma = createMockPrisma();
    const log = new EventLogService(mockPrisma as any);

    const validTypes = ['edit', 'merge', 'conflict-resolve', 'restore', 'offline-replay', 'delete'];
    for (const eventType of validTypes) {
      await expect(
        log.appendEvent(makeEvent({ eventType: eventType as any, eventId: `evt-${eventType}` }))
      ).resolves.toBeDefined();
    }

    expect(mockPrisma.eventLog.create).toHaveBeenCalledTimes(validTypes.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4 — Event ordering and payload reconstruction
// ─────────────────────────────────────────────────────────────────────────────

describe('EventLog — event ordering and payload reconstruction', () => {
  /**
   * Purpose: getHistory returns events in insertion order (id ASC), NOT
   * logicalTimestamp order. This is critical because each delta encodes
   * against the previous delta in insertion order — timestamp order
   * would corrupt replay chains.
   *
   * Source behavior: getHistory uses `orderBy: [{ id: 'asc' }]`
   * (event-log.ts line 368).
   *
   * Regression protected: A future change to order by logicalTimestamp
   * would produce logically correct ordering that breaks actual delta
   * replay. This test would catch that.
   *
   * Expected result: 3 events retrieved in insertion order; payloads intact.
   */
  it('should return events in insertion (id ASC) order with payloads intact', async () => {
    const mockPrisma = createMockPrisma();
    const log = new EventLogService(mockPrisma as any);

    // Insert with timestamps out of insertion order to expose ordering difference.
    const e1 = makeEvent({ logicalTimestamp: 5, payload: '<p>State A</p>' });
    const e2 = makeEvent({ logicalTimestamp: 1, payload: '<p>State B</p>' });
    const e3 = makeEvent({ logicalTimestamp: 3, payload: '<p>State C</p>' });

    await log.appendEvent(e1);
    await log.appendEvent(e2);
    await log.appendEvent(e3);

    const history = await log.getHistory(1);

    expect(history.length).toBe(3);
    // Insertion order: e1 first (id=1), e2 second (id=2), e3 third (id=3).
    expect(history[0].payload).toBe('<p>State A</p>');
    expect(history[1].payload).toBe('<p>State B</p>');
    expect(history[2].payload).toBe('<p>State C</p>');
    // IDs confirm insertion order.
    expect(history[0].id).toBeLessThan(history[1].id);
    expect(history[1].id).toBeLessThan(history[2].id);
  });

  /**
   * Purpose: Verify that replay is NOT exposed by the current EventLogService.
   *
   * Source behavior: EventLogService has no `replayEvents()` or
   * `reconstructState()` method. It is a persistence layer only. State
   * reconstruction is the responsibility of the application layer
   * (PeerManager / IPC handlers).
   *
   * NOTE: Replay is NOT exposed by the current EventLogService implementation.
   *       This is documented as a known limitation in the final report.
   */
  it('LIMITATION: EventLogService does not expose a replay/state-reconstruction method', () => {
    const mockPrisma = createMockPrisma();
    const log = new EventLogService(mockPrisma as any);

    // Confirm the service API surface does not include replay.
    expect(typeof (log as any).replayEvents).toBe('undefined');
    expect(typeof (log as any).reconstructState).toBe('undefined');
  });
});
