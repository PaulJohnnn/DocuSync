/**
 * @module LWWResolver
 *
 * Last-Writer-Wins conflict resolver for the DocuSync hybrid sync engine.
 *
 * When two peers independently edit the same file, their vector clocks will
 * diverge. The LWW resolver examines the clocks to determine causality:
 *
 * 1. **One clock dominates** → the dominating edit is the clear winner. The
 *    losing edit is already preserved in the {@link EventLogService}, so no
 *    data is lost. The winner's delta is dispatched to all peers.
 *
 * 2. **Clocks are concurrent** → neither edit causally precedes the other.
 *    This is a genuine write conflict. The resolver **escalates to the
 *    repository owner** by writing a pending {@link ConflictRecord} to the
 *    local SQLite `Conflict` table. The owner is notified via the UI and
 *    must choose a winner (side A or side B). Once accepted, the winning
 *    delta is applied and a `MERGE_ACCEPT` message is broadcast to all
 *    peers via WebSocket.
 *
 * **Critical invariant:** No edit is ever silently discarded. Both competing
 * events are always appended to the {@link EventLogService} before resolution
 * begins. The resolver only determines *which* version becomes the canonical
 * state going forward.
 *
 * **Thesis references:**
 * - [45] Johnson, P. R., & Thomas, R. H. (1975). The maintenance of
 *        duplicate databases. *RFC 677*. (Last-Writer-Wins register
 *        semantics and timestamp-based conflict resolution.)
 * - [47] Saito, Y., & Shapiro, M. (2005). Optimistic replication.
 *        *ACM Computing Surveys*, 37(1), 42–81. (Owner-arbitrated
 *        conflict escalation in optimistic replication systems.)
 *
 * @packageDocumentation
 */

import { VectorClock } from '../vector-clock/vector-clock';
import type { VectorClockJSON, ClockRelation } from '../vector-clock/vector-clock';
import type { EventLogEntry } from '../log-sync/event-log';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SyncEvent {
  eventId: string;
  fileId: number;
  nodeId: string;
  payload: string;
  logicalTimestamp: number;
  vectorClockJson: VectorClockJSON;
}

export type ResolveOutcome = 'a-wins' | 'b-wins' | 'escalated' | 'equal';

export interface ResolveResult {
  outcome: ResolveOutcome;
  winner: SyncEvent | null;
  loser: SyncEvent | null;
  relation: ClockRelation;
  conflictId: string | null;
}

export interface ConflictRecord {
  id: number;
  conflictId: string;
  fileId: number;
  eventIdA: string;
  nodeIdA: string;
  vectorClockJsonA: VectorClockJSON;
  payloadA: string;
  eventIdB: string;
  nodeIdB: string;
  vectorClockJsonB: VectorClockJSON;
  payloadB: string;
  status: 'pending' | 'resolved';
  winner: 'A' | 'B' | null;
  resolvedBy: string | null;
  detectedAt: Date;
  resolvedAt: Date | null;
}

export interface AutoResolveResult {
  conflict: ConflictRecord;
  eventLogEntry: EventLogEntry;
  mergeAcceptMessage: MergeAcceptMessage;
}

export interface MergeAcceptMessage {
  type: 'MERGE_ACCEPT';
  conflictId: string;
  fileId: number;
  winner: 'A' | 'B';
  winnerPayload: string;
  resolutionEventId: string;
  resolvedBy: string;
  logicalTimestamp: number;
  vectorClockJson: VectorClockJSON;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LWW Resolver interface to be implemented per environment.
 */
export interface LWWResolverService {
  resolve(eventA: SyncEvent, eventB: SyncEvent, vectorClockA: VectorClock, vectorClockB: VectorClock): Promise<ResolveResult>;
  escalateToOwner(eventA: SyncEvent, eventB: SyncEvent): Promise<string>;
  autoResolve(conflictId: string, winner: 'A' | 'B', resolvedBy: string, mergedClockJson: VectorClockJSON): Promise<AutoResolveResult>;
  getPendingConflicts(fileId: number): Promise<ConflictRecord[]>;
  getConflict(conflictId: string): Promise<ConflictRecord | null>;
  getResolvedConflicts(fileId: number): Promise<ConflictRecord[]>;
}
