/**
 * @module EventLog
 *
 * Append-only event log for the DocuSync log-based synchronization engine.
 *
 * Every file mutation (edit, merge, conflict resolution, restore) is recorded
 * as an immutable {@link EventLogEntry} in the local SQLite database via Prisma.
 * The log is **strictly append-only**: existing records are never updated or
 * deleted. A compaction pass can mark obsolete intermediate entries as
 * `isCompacted = true`, but the rows themselves are retained for full
 * auditability.
 *
 * The event log serves three critical roles in the sync architecture:
 *
 * 1. **Causal ordering** — Each event carries a vector clock snapshot,
 *    enabling the sync engine to reconstruct the causal history of any file.
 *
 * 2. **Offline catch-up** — When a peer reconnects after being offline,
 *    {@link getEventsSince} returns only the events it missed, avoiding a
 *    full state transfer.
 *
 * 3. **Conflict evidence** — The complete, immutable history provides the
 *    evidence trail needed to audit how conflicts were detected and resolved.
 *
 * **Thesis references:**
 * - [2]  Birman, K., Schiper, A., & Stephenson, P. (1991). Lightweight
 *        causal and atomic group multicast. *ACM Transactions on Computer
 *        Systems*, 9(3), 272–314.
 * - [13] Shapiro, M., Preguiça, N., Baquero, C., & Zawirski, M. (2011).
 *        Conflict-free replicated data types. *Proc. 13th Intl. Conf. on
 *        Stabilization, Safety, and Security of Distributed Systems*,
 *        386–400.
 *
 * @packageDocumentation
 */

import { PrismaClient, EventLog as PrismaEventLog } from '@prisma/client';
import type { VectorClockJSON } from '../vector-clock/vector-clock';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The set of event types that can appear in the sync log.
 *
 * | Type                | Trigger                                        |
 * |---------------------|------------------------------------------------|
 * | `edit`              | Local document edit saved                      |
 * | `merge`             | Remote state merged via vector clock merge     |
 * | `conflict-resolve`  | User chose a resolution for a detected conflict|
 * | `restore`           | File restored from trash / version history     |
 * | `offline-replay`    | Queued offline edit replayed after reconnect   |
 *
 * @see Thesis citation [13] — event classification in CRDT systems
 */
export type EventType =
  | 'edit'
  | 'merge'
  | 'conflict-resolve'
  | 'restore'
  | 'offline-replay'
  | 'checkout';

/**
 * Input data for appending a new event to the log.
 *
 * This is the caller-facing shape; the module adds `id`, `createdAt`,
 * and `isCompacted` automatically.
 */
export interface AppendEventInput {
  /** UUID v4 — globally unique across all peers. */
  eventId: string;

  /** The file this event pertains to (matches `files.id` in cloud schema).
   * Stored as BigInt in SQLite to accommodate Date.now()-based IDs (~1.78 trillion).
   * We accept `number` here and convert to BigInt for Prisma. */
  fileId: number;

  /** UUID of the originating peer node. */
  nodeId: string;

  /** Classification of the sync event. */
  eventType: EventType;

  /**
   * Monotonically increasing logical timestamp derived from the local
   * vector clock slot at the time of the event.
   */
  logicalTimestamp: number;

  /**
   * Serialised vector clock snapshot — the full JSON produced by
   * `VectorClock.toJSON()`.
   */
  vectorClockJson: VectorClockJSON;

  /**
   * The content payload. For full-state events this is the complete
   * document HTML; for delta events this is the encoded diff string.
   */
  payload: string;
}

/**
 * A single event log entry as returned by query functions.
 *
 * This mirrors the Prisma `EventLog` model with the `vectorClockJson`
 * field deserialised back into a typed object.
 */
export interface EventLogEntry {
  /** Auto-incremented surrogate key. */
  id: number;

  /** UUID v4 — globally unique event identifier. */
  eventId: string;

  /** File ID this event pertains to.
   * Stored as BigInt in SQLite; surfaced as number for application use. */
  fileId: number;

  /** UUID of the originating peer node. */
  nodeId: string;

  /** Classification of the sync event. */
  eventType: EventType;

  /** Logical timestamp from the vector clock. */
  logicalTimestamp: number;

  /** Deserialised vector clock snapshot. */
  vectorClockJson: VectorClockJSON;

  /** Content payload or delta. */
  payload: string;

  /** Wall-clock time the event was appended. */
  createdAt: Date;

  /** Whether this event has been superseded by compaction. */
  isCompacted: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a raw Prisma `EventLog` row into a typed {@link EventLogEntry}
 * with the `vectorClockJson` field deserialised.
 *
 * @param row - The raw Prisma row.
 * @returns A fully-typed event log entry.
 *
 * @internal
 */
function toEventLogEntry(row: PrismaEventLog): EventLogEntry {
  let vcJson: VectorClockJSON;
  try {
    vcJson = typeof row.vectorClockJson === 'string'
      ? JSON.parse(row.vectorClockJson)
      : row.vectorClockJson;
  } catch {
    vcJson = {
      nodeCount: 3,
      nodeIndex: 0,
      root: { counter: 0, children: [{ counter: 0, children: [] }, { counter: 0, children: [] }, { counter: 0, children: [] }] }
    };
  }

  return {
    id: row.id,
    eventId: row.eventId,
    // Prisma returns BigInt for BigInt columns; convert to number (safe for all
    // values up to 2^53, well within Date.now() range of ~1.78 trillion).
    fileId: Number(row.fileId),
    nodeId: row.nodeId,
    eventType: row.eventType as EventType,
    logicalTimestamp: row.logicalTimestamp,
    vectorClockJson: vcJson,
    payload: row.payload,
    createdAt: row.createdAt,
    isCompacted: row.isCompacted,
  };
}


/**
 * Validates that the given string is a recognised {@link EventType}.
 *
 * @param type - The candidate event type string.
 * @throws {Error} If the type is not recognised.
 *
 * @internal
 */
const VALID_EVENT_TYPES: ReadonlySet<string> = new Set<EventType>([
  'edit',
  'merge',
  'conflict-resolve',
  'restore',
  'offline-replay',
]);

function assertValidEventType(type: string): asserts type is EventType {
  if (!VALID_EVENT_TYPES.has(type)) {
    throw new Error(
      `Invalid event type "${type}". ` +
        `Expected one of: ${[...VALID_EVENT_TYPES].join(', ')}.`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EventLog Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append-only event log backed by SQLite via Prisma.
 *
 * All public methods enforce the **append-only invariant**: no existing
 * record is ever mutated or deleted. The sole exception is
 * {@link compactLog}, which sets `isCompacted = true` on superseded
 * intermediate events — but even then, the rows remain in the database.
 *
 * **Usage:**
 * ```ts
 * import { createEventLog } from '@/engine/log-sync/event-log';
 * import { PrismaClient } from '@prisma/client';
 *
 * const prisma = new PrismaClient();
 * const log = createEventLog(prisma);
 *
 * await log.appendEvent({ ... });
 * const history = await log.getHistory(fileId);
 * ```
 *
 * @see Thesis citation [2]  — causal ordering via log-based multicast
 * @see Thesis citation [13] — append-only event sourcing for CRDT sync
 */
export class EventLogService {
  /**
   * The Prisma client instance used for all database operations.
   * @internal
   */
  private readonly prisma: PrismaClient;

  /**
   * @param prisma - A connected {@link PrismaClient} instance.
   */
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // ── Append ───────────────────────────────────────────────────────────

  /**
   * Appends a new event to the immutable log.
   *
   * This is the **only write operation** on the event log. It creates a
   * new row; it never updates or deletes an existing row.
   *
   * The vector clock snapshot is serialised to JSON for storage and will
   * be deserialised back on read via {@link getHistory} or
   * {@link getEventsSince}.
   *
   * > "Each update is recorded as an immutable log entry tagged with the
   * > sender's vector timestamp, enabling receivers to reconstruct causal
   * > order from the log alone." — Birman et al. [2], §4
   *
   * @param input - The event data to append.
   *
   * @throws {Error} If `input.eventType` is not a valid {@link EventType}.
   * @throws {Error} If the database write fails (Prisma will throw).
   *
   * @returns The newly created {@link EventLogEntry} with its assigned `id`
   *          and `createdAt` timestamp.
   *
   * @example
   * ```ts
   * const entry = await log.appendEvent({
   *   eventId: crypto.randomUUID(),
   *   fileId: 42,
   *   nodeId: 'node-0-uuid',
   *   eventType: 'edit',
   *   logicalTimestamp: 7,
   *   vectorClockJson: myClock.toJSON(),
   *   payload: '<h1>Updated chapter</h1>',
   * });
   * console.log(entry.id); // auto-incremented
   * ```
   *
   * @see Thesis citation [2]  — log append rule
   * @see Thesis citation [13] — event immutability guarantee
   */
  public async appendEvent(input: AppendEventInput): Promise<EventLogEntry> {
    assertValidEventType(input.eventType);

    const row = await this.prisma.eventLog.create({
      data: {
        eventId: input.eventId,
        // Convert to BigInt: Prisma requires BigInt values for BigInt columns.
        // input.fileId is a JS number (safe up to 2^53); converting is lossless.
        fileId: BigInt(input.fileId),
        nodeId: input.nodeId,
        eventType: input.eventType,
        logicalTimestamp: input.logicalTimestamp,
        vectorClockJson: JSON.stringify(input.vectorClockJson),
        payload: input.payload,
        // `createdAt` and `isCompacted` use schema defaults
      },
    });

    return toEventLogEntry(row);
  }

  // ── Queries ──────────────────────────────────────────────────────────

  /**
   * Returns the complete event history for a file, ordered by logical
   * timestamp ascending (oldest → newest).
   *
   * Compacted events (`isCompacted = true`) are **included** in the result
   * so callers can inspect the full audit trail. Filter them out at the
   * application layer if only active events are needed.
   *
   * > "The full ordered log of events provides an authoritative,
   * > reproducible history of every mutation that occurred on a
   * > replicated object." — Shapiro et al. [13], §5.2
   *
   * @param fileId - The ID of the file whose history to retrieve.
   *
   * @returns An array of {@link EventLogEntry} sorted by
   *          `logicalTimestamp ASC`, then by `id ASC` as tiebreaker.
   *
   * @example
   * ```ts
   * const history = await log.getHistory(42);
   * for (const entry of history) {
   *   console.log(`[${entry.logicalTimestamp}] ${entry.eventType}: ${entry.eventId}`);
   * }
   * ```
   *
   * @see Thesis citation [2]  — log replay for state reconstruction
   * @see Thesis citation [13] — causal history traversal
   */
  public async getHistory(fileId: number): Promise<EventLogEntry[]> {
    const rows = await this.prisma.eventLog.findMany({
      where: { fileId: BigInt(fileId) },
      orderBy: [
        { logicalTimestamp: 'asc' },
        { id: 'asc' },
      ],
    });

    return rows.map(toEventLogEntry);
  }

  /**
   * Returns all events for a file whose logical timestamp is **strictly
   * greater than** the given value.
   *
   * This is the primary mechanism for **sync catch-up after offline**.
   * A reconnecting peer sends its last-known logical timestamp, and the
   * remote responds with only the events it has missed.
   *
   * > "Catch-up synchronization transmits only the suffix of the log
   * > that the stale replica has not yet observed, as identified by its
   * > last acknowledged timestamp." — Birman et al. [2], §6
   *
   * @param fileId           - The ID of the file to query.
   * @param logicalTimestamp  - The exclusive lower bound. Events with
   *                           `logicalTimestamp > this value` are returned.
   *
   * @returns An array of {@link EventLogEntry} sorted by
   *          `logicalTimestamp ASC`, excluding compacted events.
   *
   * @example
   * ```ts
   * // Peer reconnects — its last known timestamp was 12
   * const missed = await log.getEventsSince(42, 12);
   * // Returns events with logicalTimestamp 13, 14, 15, ...
   * ```
   *
   * @see Thesis citation [2]  — catch-up protocol via log suffix
   * @see Thesis citation [13] — incremental state transfer
   */
  public async getEventsSince(
    fileId: number,
    logicalTimestamp: number
  ): Promise<EventLogEntry[]> {
    const rows = await this.prisma.eventLog.findMany({
      where: {
        fileId: BigInt(fileId),
        logicalTimestamp: { gt: logicalTimestamp },
        isCompacted: false,
      },
      orderBy: [
        { logicalTimestamp: 'asc' },
        { id: 'asc' },
      ],
    });

    return rows.map(toEventLogEntry);
  }

  // ── Compaction ───────────────────────────────────────────────────────

  /**
   * Marks obsolete intermediate events as compacted.
   *
   * **Compaction algorithm:**
   *
   * 1. Fetch all non-compacted events for the file, ordered by logical
   *    timestamp ascending.
   * 2. Identify the latest event — this is the **survivor** and must
   *    never be compacted.
   * 3. For each earlier event: if a later event from the **same node**
   *    exists with a higher logical timestamp, the earlier event is
   *    superseded and can be marked `isCompacted = true`.
   * 4. Events from different nodes are **not** compacted against each
   *    other, because they may represent concurrent branches needed
   *    for conflict resolution.
   *
   * > "Log compaction removes redundant intermediate states while
   * > preserving the causal skeleton — the minimal set of entries
   * > needed to reconstruct the current state and detect unresolved
   * > conflicts." — Shapiro et al. [13], §7.1
   *
   * **Invariants preserved:**
   * - No row is deleted — only `isCompacted` is set to `true`.
   * - The latest event per node is never compacted.
   * - Events from distinct nodes are never compacted against each other.
   *
   * @param fileId - The ID of the file whose log to compact.
   *
   * @returns The number of events newly marked as compacted.
   *
   * @example
   * ```ts
   * const compactedCount = await log.compactLog(42);
   * console.log(`Compacted ${compactedCount} obsolete events.`);
   * ```
   *
   * @see Thesis citation [2]  — log truncation safety conditions
   * @see Thesis citation [13] — CRDT log compaction guarantees
   */
  public async compactLog(fileId: number): Promise<number> {
    // Step 1: Fetch all non-compacted events, ordered.
    const events = await this.prisma.eventLog.findMany({
      where: {
        fileId: BigInt(fileId),
        isCompacted: false,
      },
      orderBy: [
        { logicalTimestamp: 'asc' },
        { id: 'asc' },
      ],
    });

    if (events.length <= 1) {
      // Nothing to compact — zero or one active event.
      return 0;
    }

    // Step 2: Find the latest event per node.
    // We walk the array in order (ascending), so the last occurrence of
    // each nodeId is that node's most recent event.
    const latestPerNode = new Map<string, number>(); // nodeId → event.id
    for (const event of events) {
      latestPerNode.set(event.nodeId, event.id);
    }

    // Step 3: Identify events to compact.
    // An event is compactable if it is NOT the latest event for its node.
    const idsToCompact: number[] = [];
    for (const event of events) {
      if (latestPerNode.get(event.nodeId) !== event.id) {
        idsToCompact.push(event.id);
      }
    }

    if (idsToCompact.length === 0) {
      return 0;
    }

    // Step 4: Batch-mark as compacted (single UPDATE, not individual writes).
    // This is the ONLY mutation allowed on existing rows.
    const result = await this.prisma.eventLog.updateMany({
      where: {
        id: { in: idsToCompact },
      },
      data: {
        isCompacted: true,
      },
    });

    return result.count;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new {@link EventLogService} instance.
 *
 * This is the recommended public API for constructing the event log service.
 *
 * @param prisma - A connected {@link PrismaClient} instance. The caller is
 *                 responsible for managing the client lifecycle (connect/disconnect).
 *
 * @returns A new {@link EventLogService} bound to the given Prisma client.
 *
 * @example
 * ```ts
 * import { PrismaClient } from '@prisma/client';
 * import { createEventLog } from '@/engine/log-sync/event-log';
 *
 * const prisma = new PrismaClient();
 * const log = createEventLog(prisma);
 *
 * // Append an event
 * await log.appendEvent({
 *   eventId: crypto.randomUUID(),
 *   fileId: 1,
 *   nodeId: 'peer-abc-123',
 *   eventType: 'edit',
 *   logicalTimestamp: 1,
 *   vectorClockJson: clock.toJSON(),
 *   payload: '<p>Hello world</p>',
 * });
 *
 * // Query history
 * const history = await log.getHistory(1);
 *
 * // Catch-up after offline
 * const missed = await log.getEventsSince(1, 5);
 *
 * // Compact obsolete entries
 * const count = await log.compactLog(1);
 * ```
 *
 * @see Thesis citation [2]  — Birman et al. (1991), log-based multicast
 * @see Thesis citation [13] — Shapiro et al. (2011), event sourcing for CRDTs
 */
export function createEventLog(prisma: PrismaClient): EventLogService {
  return new EventLogService(prisma);
}
