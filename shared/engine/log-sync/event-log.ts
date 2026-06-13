/**
 * @module EventLog
 *
 * Append-only event log for the DocuSync log-based synchronization engine.
 *
 * Every file mutation (edit, merge, conflict resolution, restore) is recorded
 * as an immutable {@link EventLogEntry}.
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

import type { VectorClockJSON } from '../vector-clock/vector-clock';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The set of event types that can appear in the sync log.
 */
export type EventType =
  | 'edit'
  | 'merge'
  | 'conflict-resolve'
  | 'restore'
  | 'offline-replay';

/**
 * Input data for appending a new event to the log.
 */
export interface AppendEventInput {
  eventId: string;
  fileId: number;
  nodeId: string;
  eventType: EventType;
  logicalTimestamp: number;
  vectorClockJson: VectorClockJSON;
  payload: string;
}

/**
 * A single event log entry as returned by query functions.
 */
export interface EventLogEntry {
  id: number;
  eventId: string;
  fileId: number;
  nodeId: string;
  eventType: EventType;
  logicalTimestamp: number;
  vectorClockJson: VectorClockJSON;
  payload: string;
  createdAt: Date;
  isCompacted: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Event Log Service interface to be implemented per environment (Desktop: SQLite, Web/Mobile: LocalStorage/AsyncStorage).
 */
export interface EventLogService {
  appendEvent(input: AppendEventInput): Promise<EventLogEntry>;
  getHistory(fileId: number): Promise<EventLogEntry[]>;
  getEventsSince(fileId: number, logicalTimestamp: number): Promise<EventLogEntry[]>;
  compactLog(fileId: number): Promise<number>;
}
