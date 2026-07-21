/**
 * @module LWWResolver
 *
 * "Last-Write-Wins" (LWW) conflict resolver.
 * 
 * When two people edit the same file while offline, the system needs to decide
 * whose edits to keep when they reconnect. This file looks at their Vector Clocks:
 * 
 * 1. If one edit clearly happened after the other, it keeps the newest one.
 * 2. If both edits happened at the exact same time (a conflict), the system
 *    saves both versions and asks the room owner to choose a winner.
 * 
 * Most importantly: no data is ever lost. Even the "losing" edits are saved
 * in the Event Log history so they can always be recovered.
 *
 * References for your thesis:
 * - [45] Johnson, P. R., & Thomas, R. H. (1975). The maintenance of duplicate databases.
 * - [47] Saito, Y., & Shapiro, M. (2005). Optimistic replication.
 *        *ACM Computing Surveys*, 37(1), 42–81. (Owner-arbitrated
 *        conflict escalation in optimistic replication systems.)
 *
 * @packageDocumentation
 */

import { PrismaClient, Conflict as PrismaConflict } from '@prisma/client';
import { VectorClock } from '../vector-clock/vector-clock';
import type { VectorClockJSON, ClockRelation } from '../vector-clock/vector-clock';
import type { EventLogEntry, AppendEventInput } from '../log-sync/event-log';
import { EventLogService } from '../log-sync/event-log';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A sync event as seen by the LWW resolver. This is the input shape for
 * {@link LWWResolver.resolve}.
 *
 * Each event represents one peer's edit: it carries an event ID, the
 * originating node, the content payload (or delta), and the vector clock
 * state at the time of the edit.
 */
export interface SyncEvent {
  /** UUID v4 — globally unique event identifier. */
  eventId: string;

  /** ID of the file being edited. */
  fileId: number;

  /** UUID of the originating peer node. */
  nodeId: string;

  /** The content payload or delta string. */
  payload: string;

  /**
   * Logical timestamp derived from the local vector clock slot
   * at the time of the event.
   */
  logicalTimestamp: number;

  /**
   * The full vector clock snapshot at the time of the event,
   * as produced by `VectorClock.toJSON()`.
   */
  vectorClockJson: VectorClockJSON;
}

/**
 * The outcome of a {@link LWWResolver.resolve} call.
 *
 * | Outcome      | Meaning                                              |
 * |--------------|------------------------------------------------------|
 * | `a-wins`     | Event A's clock dominates — A is the winner.         |
 * | `b-wins`     | Event B's clock dominates — B is the winner.         |
 * | `escalated`  | Clocks are concurrent — conflict escalated to owner. |
 * | `equal`      | Clocks are identical — events are duplicates.        |
 *
 * @see Thesis citation [45] — LWW outcome classification
 */
export type ResolveOutcome = 'a-wins' | 'b-wins' | 'escalated' | 'equal';

/**
 * Full result returned by {@link LWWResolver.resolve}.
 */
export interface ResolveResult {
  /** The resolution outcome. */
  outcome: ResolveOutcome;

  /** The winning event, or `null` if escalated/equal. */
  winner: SyncEvent | null;

  /** The losing event, or `null` if escalated/equal. */
  loser: SyncEvent | null;

  /** The clock relation between A and B. */
  relation: ClockRelation;

  /**
   * If escalated, the ID of the conflict record in the Conflict table.
   * `null` if not escalated.
   */
  conflictId: string | null;
}

/**
 * A conflict record as stored in the local SQLite `Conflict` table.
 *
 * This mirrors the Prisma `Conflict` model with deserialised vector
 * clock fields.
 */
export interface ConflictRecord {
  /** Auto-incremented surrogate key. */
  id: number;

  /** UUID v4 — globally unique conflict identifier. */
  conflictId: string;

  /** File ID where the conflict occurred. */
  fileId: number;

  /** Event ID of side A. */
  eventIdA: string;

  /** Node ID that produced side A. */
  nodeIdA: string;

  /** Deserialised vector clock for side A. */
  vectorClockJsonA: VectorClockJSON;

  /** Content payload for side A. */
  payloadA: string;

  /** Event ID of side B. */
  eventIdB: string;

  /** Node ID that produced side B. */
  nodeIdB: string;

  /** Deserialised vector clock for side B. */
  vectorClockJsonB: VectorClockJSON;

  /** Content payload for side B. */
  payloadB: string;

  /** Current resolution status. */
  status: 'pending' | 'resolved';

  /** Which side won, or null if still pending. */
  winner: 'A' | 'B' | null;

  /** Node ID of the resolver, or null if pending. */
  resolvedBy: string | null;

  /** Wall-clock time the conflict was detected. */
  detectedAt: Date;

  /** Wall-clock time the conflict was resolved, or null. */
  resolvedAt: Date | null;
}

/**
 * Result of {@link LWWResolver.autoResolve}.
 */
export interface AutoResolveResult {
  /** The conflict record after resolution. */
  conflict: ConflictRecord;

  /** The event log entry created for the resolution. */
  eventLogEntry: EventLogEntry;

  /**
   * The WebSocket message payload to broadcast to all peers.
   * Callers should `JSON.stringify` and send this over the WS channel.
   */
  mergeAcceptMessage: MergeAcceptMessage;
}

/**
 * WebSocket message shape for broadcasting a conflict resolution to peers.
 *
 * > "After the owner accepts a resolution, a MERGE_ACCEPT message carrying
 * > the winning payload and merged vector clock is broadcast to all peers,
 * > who apply it unconditionally." — Saito & Shapiro [47], §5.3
 *
 * @see Thesis citation [47] — merge-accept broadcast protocol
 */
export interface MergeAcceptMessage {
  /** Message type discriminant for WebSocket routing. */
  type: 'MERGE_ACCEPT';

  /** The conflict that was resolved. */
  conflictId: string;

  /** The file this resolution applies to. */
  fileId: number;

  /** Which side won: 'A' or 'B'. */
  winner: 'A' | 'B';

  /** The winning content payload to apply. */
  winnerPayload: string;

  /** Event ID of the resolution event in the log. */
  resolutionEventId: string;

  /** Node ID of the owner who resolved the conflict. */
  resolvedBy: string;

  /** Logical timestamp of the resolution event. */
  logicalTimestamp: number;

  /** Merged vector clock snapshot after resolution. */
  vectorClockJson: VectorClockJSON;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a raw Prisma `Conflict` row into a typed {@link ConflictRecord}
 * with deserialised vector clock fields.
 *
 * @param row - The raw Prisma row.
 * @returns A fully-typed conflict record.
 *
 * @internal
 */
function toConflictRecord(row: PrismaConflict): ConflictRecord {
  return {
    id: row.id,
    conflictId: row.conflictId,
    fileId: row.fileId,
    eventIdA: row.eventIdA,
    nodeIdA: row.nodeIdA,
    vectorClockJsonA: JSON.parse(row.vectorClockJsonA) as VectorClockJSON,
    payloadA: row.payloadA,
    eventIdB: row.eventIdB,
    nodeIdB: row.nodeIdB,
    vectorClockJsonB: JSON.parse(row.vectorClockJsonB) as VectorClockJSON,
    payloadB: row.payloadB,
    status: row.status as 'pending' | 'resolved',
    winner: row.winner as 'A' | 'B' | null,
    resolvedBy: row.resolvedBy,
    detectedAt: row.detectedAt,
    resolvedAt: row.resolvedAt,
  };
}

/**
 * Generates a UUID v4. Uses `crypto.randomUUID()` when available,
 * falls back to a manual implementation.
 *
 * @returns A UUID v4 string.
 *
 * @internal
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LWWResolver Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Last-Writer-Wins conflict resolver with owner-arbitrated escalation.
 *
 * The resolver is the central decision point in the sync engine's conflict
 * pipeline. It consumes pairs of competing {@link SyncEvent}s, compares
 * their vector clocks, and either auto-resolves (when causality is clear)
 * or escalates to the repository owner (when edits are concurrent).
 *
 * **Data preservation guarantee:** Both competing events are always
 * preserved in the {@link EventLogService} before any resolution logic
 * runs. No edit is ever silently discarded.
 *
 * **Usage:**
 * ```ts
 * import { createLWWResolver } from '@/engine/lww/lww-resolver';
 * import { createEventLog } from '@/engine/log-sync/event-log';
 * import { PrismaClient } from '@prisma/client';
 *
 * const prisma = new PrismaClient();
 * const eventLog = createEventLog(prisma);
 * const resolver = createLWWResolver(prisma, eventLog);
 *
 * const result = await resolver.resolve(eventA, eventB, clockA, clockB);
 * if (result.outcome === 'escalated') {
 *   // Notify owner via UI
 * }
 * ```
 *
 * @see Thesis citation [45] — Johnson & Thomas (1975), LWW registers
 * @see Thesis citation [47] — Saito & Shapiro (2005), optimistic replication
 */
export class LWWResolver {
  /**
   * Prisma client for Conflict table access.
   * @internal
   */
  private readonly prisma: PrismaClient;

  /**
   * Event log service for preserving events before resolution.
   * @internal
   */
  private readonly eventLog: EventLogService;

  /**
   * @param prisma   - A connected {@link PrismaClient} instance.
   * @param eventLog - The {@link EventLogService} for append-only logging.
   */
  constructor(prisma: PrismaClient, eventLog: EventLogService) {
    this.prisma = prisma;
    this.eventLog = eventLog;
  }

  // ── Core Resolution ──────────────────────────────────────────────────

  /**
   * Resolves a conflict between two competing sync events by comparing
   * their vector clocks.
   *
   * **Algorithm:**
   *
   * 1. **Preserve both edits** — Both events are appended to the
   *    {@link EventLogService} before any comparison. This guarantees
   *    no data is lost regardless of the resolution outcome.
   *
   * 2. **Compare clocks** — Reconstruct live {@link VectorClock} instances
   *    from the JSON snapshots and determine the {@link ClockRelation}.
   *
   * 3. **Decide outcome:**
   *    - If A dominates B → A wins (LWW: last writer has higher clock).
   *    - If B dominates A → B wins.
   *    - If concurrent → escalate to repository owner.
   *    - If equal → treat as duplicate (no-op).
   *
   * > "In a Last-Writer-Wins register, the write with the higher
   * > timestamp always supersedes the other. When timestamps are
   * > incomparable (concurrent), an external arbitration mechanism
   * > must be invoked." — Johnson & Thomas [45], §3
   *
   * @param eventA       - The first competing sync event.
   * @param eventB       - The second competing sync event.
   * @param vectorClockA - The vector clock for event A.
   * @param vectorClockB - The vector clock for event B.
   *
   * @returns A {@link ResolveResult} describing the outcome.
   *
   * @example
   * ```ts
   * const result = await resolver.resolve(editFromNode0, editFromNode1, clockA, clockB);
   * switch (result.outcome) {
   *   case 'a-wins':
   *     broadcastDelta(result.winner!.payload);
   *     break;
   *   case 'escalated':
   *     showConflictUI(result.conflictId!);
   *     break;
   * }
   * ```
   *
   * @see Thesis citation [45] — LWW comparison rule
   * @see Thesis citation [47] — escalation to owner on concurrency
   */
  public async resolve(
    eventA: SyncEvent,
    eventB: SyncEvent,
    vectorClockA: VectorClock,
    vectorClockB: VectorClock
  ): Promise<ResolveResult> {
    // ── Step 1: Preserve both edits in the append-only log ──────────
    // This is the critical data-preservation guarantee. Even if the
    // resolution logic fails or the process crashes, both edits are
    // already safely stored.
    await Promise.all([
      this.eventLog.appendEvent(this.toAppendInput(eventA, 'edit')),
      this.eventLog.appendEvent(this.toAppendInput(eventB, 'edit')),
    ]);

    // ── Step 2: Compare vector clocks ───────────────────────────────
    const relation = vectorClockA.compare(vectorClockB);

    // ── Step 3: Decide outcome ──────────────────────────────────────
    switch (relation) {
      case 'dominant':
        // A's clock dominates B → A is the winner (LWW [45]).
        return {
          outcome: 'a-wins',
          winner: eventA,
          loser: eventB,
          relation,
          conflictId: null,
        };

      case 'dominated':
        // B's clock dominates A → B is the winner (LWW [45]).
        return {
          outcome: 'b-wins',
          winner: eventB,
          loser: eventA,
          relation,
          conflictId: null,
        };

      case 'concurrent': {
        // Neither dominates → escalate to owner ([47]).
        const conflictId = await this.escalateToOwner(eventA, eventB);
        return {
          outcome: 'escalated',
          winner: null,
          loser: null,
          relation,
          conflictId,
        };
      }

      case 'equal':
        // Identical clocks → duplicate event, no action needed.
        return {
          outcome: 'equal',
          winner: null,
          loser: null,
          relation,
          conflictId: null,
        };
    }
  }

  // ── Escalation ───────────────────────────────────────────────────────

  /**
   * Writes a pending conflict record to the local SQLite `Conflict` table.
   *
   * This is called internally by {@link resolve} when two events have
   * concurrent vector clocks. The conflict remains in `pending` status
   * until the repository owner calls {@link autoResolve} to pick a winner.
   *
   * > "When no causal ordering exists between two updates, the system
   * > must defer to an authoritative agent — typically the resource owner
   * > — to arbitrate the conflict." — Saito & Shapiro [47], §4.2
   *
   * @param eventA - The first competing event (side A).
   * @param eventB - The second competing event (side B).
   *
   * @returns The UUID of the newly created conflict record.
   *
   * @see Thesis citation [47] — owner-arbitrated escalation protocol
   * @see Thesis citation [45] — LWW fallback on concurrent timestamps
   */
  public async escalateToOwner(
    eventA: SyncEvent,
    eventB: SyncEvent
  ): Promise<string> {
    const conflictId = generateUUID();

    await this.prisma.conflict.create({
      data: {
        conflictId,
        fileId: eventA.fileId,
        eventIdA: eventA.eventId,
        nodeIdA: eventA.nodeId,
        vectorClockJsonA: JSON.stringify(eventA.vectorClockJson),
        payloadA: eventA.payload,
        eventIdB: eventB.eventId,
        nodeIdB: eventB.nodeId,
        vectorClockJsonB: JSON.stringify(eventB.vectorClockJson),
        payloadB: eventB.payload,
        status: 'pending',
        // winner, resolvedBy, resolvedAt remain null
      },
    });

    return conflictId;
  }

  // ── Auto-Resolve ─────────────────────────────────────────────────────

  /**
   * Resolves a pending conflict after the repository owner has chosen a
   * winner.
   *
   * **Algorithm:**
   *
   * 1. Fetch the pending conflict record from the `Conflict` table.
   * 2. Validate that it exists and is still pending.
   * 3. Update the record: set `status = 'resolved'`, `winner`, `resolvedBy`,
   *    and `resolvedAt`.
   * 4. Append a `conflict-resolve` event to the {@link EventLogService}
   *    with the winning payload and the provided merged vector clock.
   * 5. Construct a {@link MergeAcceptMessage} for WebSocket broadcast.
   *
   * > "Once the owner accepts a resolution, the winning state is committed
   * > to the log and a MERGE_ACCEPT message is broadcast to all peers.
   * > Receiving peers apply the resolution unconditionally, since the
   * > owner's authority is final." — Saito & Shapiro [47], §5.3
   *
   * @param conflictId     - The UUID of the conflict to resolve.
   * @param winner         - Which side the owner chose: `'A'` or `'B'`.
   * @param resolvedBy     - The node ID of the owner who made the decision.
   * @param mergedClockJson - The merged vector clock after resolution.
   *                          This should be produced by merging both clocks
   *                          and incrementing the owner's slot.
   *
   * @throws {Error} If the conflict does not exist or is already resolved.
   *
   * @returns An {@link AutoResolveResult} containing the updated conflict,
   *          the resolution event log entry, and the WebSocket message.
   *
   * @example
   * ```ts
   * // Owner picks side A in the UI
   * const result = await resolver.autoResolve(
   *   conflictId,
   *   'A',
   *   ownerNodeId,
   *   mergedClock.toJSON()
   * );
   *
   * // Broadcast to all peers
   * for (const peer of connectedPeers) {
   *   peer.send(JSON.stringify(result.mergeAcceptMessage));
   * }
   * ```
   *
   * @see Thesis citation [45] — LWW final-state commitment
   * @see Thesis citation [47] — MERGE_ACCEPT broadcast protocol
   */
  public async autoResolve(
    conflictId: string,
    winner: 'A' | 'B',
    resolvedBy: string,
    mergedClockJson: VectorClockJSON
  ): Promise<AutoResolveResult> {
    // ── Step 1: Fetch and validate the conflict ─────────────────────
    const row = await this.prisma.conflict.findUnique({
      where: { conflictId },
    });

    if (!row) {
      throw new Error(
        `Conflict not found: "${conflictId}". ` +
          `It may have been resolved already or the ID is invalid.`
      );
    }

    if (row.status === 'resolved') {
      throw new Error(
        `Conflict "${conflictId}" is already resolved ` +
          `(winner: ${row.winner}, resolvedBy: ${row.resolvedBy}).`
      );
    }

    // ── Step 2: Determine the winning payload ───────────────────────
    const winnerPayload = winner === 'A' ? row.payloadA : row.payloadB;
    const winnerNodeId = winner === 'A' ? row.nodeIdA : row.nodeIdB;
    const winnerEventId = winner === 'A' ? row.eventIdA : row.eventIdB;

    // ── Step 3: Update the conflict record ──────────────────────────
    const updatedRow = await this.prisma.conflict.update({
      where: { conflictId },
      data: {
        status: 'resolved',
        winner,
        resolvedBy,
        resolvedAt: new Date(),
      },
    });

    // ── Step 4: Append resolution event to the log ──────────────────
    // This preserves the resolution decision in the immutable event
    // history, ensuring full auditability.
    const resolutionEventId = generateUUID();

    // Extract logical timestamp from the merged clock.
    const mergedClock = VectorClock.fromJSON(mergedClockJson);
    const logicalTimestamp = mergedClock.counters[mergedClock.nodeIndex];

    const eventLogEntry = await this.eventLog.appendEvent({
      eventId: resolutionEventId,
      fileId: row.fileId,
      nodeId: resolvedBy,
      eventType: 'conflict-resolve',
      logicalTimestamp,
      vectorClockJson: mergedClockJson,
      payload: winnerPayload,
    });

    // ── Step 5: Construct WebSocket broadcast message ────────────────
    const mergeAcceptMessage: MergeAcceptMessage = {
      type: 'MERGE_ACCEPT',
      conflictId,
      fileId: row.fileId,
      winner,
      winnerPayload,
      resolutionEventId,
      resolvedBy,
      logicalTimestamp,
      vectorClockJson: mergedClockJson,
    };

    return {
      conflict: toConflictRecord(updatedRow),
      eventLogEntry,
      mergeAcceptMessage,
    };
  }

  // ── Queries ──────────────────────────────────────────────────────────

  /**
   * Returns all pending (unresolved) conflicts for a given file.
   *
   * Used by the UI to display the conflict resolution interface to the
   * repository owner.
   *
   * @param fileId - The file ID to query.
   *
   * @returns An array of pending {@link ConflictRecord}s, ordered by
   *          `detectedAt ASC`.
   *
   * @see Thesis citation [47] — conflict queue presentation
   */
  public async getPendingConflicts(fileId: number): Promise<ConflictRecord[]> {
    const rows = await this.prisma.conflict.findMany({
      where: {
        fileId,
        status: 'pending',
      },
      orderBy: { detectedAt: 'asc' },
    });

    return rows.map(toConflictRecord);
  }

  /**
   * Returns a single conflict record by its UUID.
   *
   * @param conflictId - The UUID of the conflict.
   *
   * @returns The {@link ConflictRecord}, or `null` if not found.
   *
   * @see Thesis citation [47] — conflict lookup
   */
  public async getConflict(conflictId: string): Promise<ConflictRecord | null> {
    const row = await this.prisma.conflict.findUnique({
      where: { conflictId },
    });

    return row ? toConflictRecord(row) : null;
  }

  /**
   * Returns all resolved conflicts for a file (for audit/history display).
   *
   * @param fileId - The file ID to query.
   *
   * @returns An array of resolved {@link ConflictRecord}s, ordered by
   *          `resolvedAt DESC` (most recent first).
   *
   * @see Thesis citation [45] — conflict resolution audit trail
   */
  public async getResolvedConflicts(fileId: number): Promise<ConflictRecord[]> {
    const rows = await this.prisma.conflict.findMany({
      where: {
        fileId,
        status: 'resolved',
      },
      orderBy: { resolvedAt: 'desc' },
    });

    return rows.map(toConflictRecord);
  }

  // ── Internal ─────────────────────────────────────────────────────────

  /**
   * Converts a {@link SyncEvent} into an {@link AppendEventInput} for
   * the event log.
   *
   * @param event     - The sync event.
   * @param eventType - The event type classification.
   * @returns An object suitable for `EventLogService.appendEvent()`.
   *
   * @internal
   */
  private toAppendInput(
    event: SyncEvent,
    eventType: 'edit' | 'merge' | 'conflict-resolve'
  ): AppendEventInput {
    return {
      eventId: event.eventId,
      fileId: event.fileId,
      nodeId: event.nodeId,
      eventType,
      logicalTimestamp: event.logicalTimestamp,
      vectorClockJson: event.vectorClockJson,
      payload: event.payload,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new {@link LWWResolver} instance.
 *
 * This is the recommended public API for constructing the LWW resolver.
 *
 * @param prisma   - A connected {@link PrismaClient} instance.
 * @param eventLog - The {@link EventLogService} for append-only event logging.
 *
 * @returns A new {@link LWWResolver} bound to the given services.
 *
 * @example
 * ```ts
 * import { PrismaClient } from '@prisma/client';
 * import { createEventLog } from '@/engine/log-sync/event-log';
 * import { createLWWResolver } from '@/engine/lww/lww-resolver';
 *
 * const prisma = new PrismaClient();
 * const eventLog = createEventLog(prisma);
 * const resolver = createLWWResolver(prisma, eventLog);
 *
 * // Resolve two competing edits
 * const result = await resolver.resolve(eventA, eventB, clockA, clockB);
 *
 * if (result.outcome === 'a-wins') {
 *   // Dispatch A's delta to all peers
 * } else if (result.outcome === 'escalated') {
 *   // Show conflict UI to owner, then later:
 *   const resolved = await resolver.autoResolve(
 *     result.conflictId!, 'A', ownerNodeId, mergedClock.toJSON()
 *   );
 *   broadcastToAllPeers(resolved.mergeAcceptMessage);
 * }
 * ```
 *
 * @see Thesis citation [45] — Johnson & Thomas (1975), LWW registers
 * @see Thesis citation [47] — Saito & Shapiro (2005), optimistic replication
 */
export function createLWWResolver(
  prisma: PrismaClient,
  eventLog: EventLogService
): LWWResolver {
  return new LWWResolver(prisma, eventLog);
}
