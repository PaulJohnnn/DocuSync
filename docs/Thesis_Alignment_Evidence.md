# Thesis Alignment Evidence Report

**Generated during**: Minor Fix Phase (post-forensic audit)  
**Date**: 2026-10-04  
**Scope**: Evidence-based evaluation of implementation status for all thesis claims.  
**Method**: Source code verification only. UI labels, comments, variable names alone do not constitute evidence.

---

> [!CAUTION]
> This document reports the **current implementation status** of the system.
> It does NOT modify Chapter 4 results, Chapter 5 conclusions, benchmark CSV files,
> or any experimental data. It is an honest evidence registry only.

---

## Thesis Claim Alignment Table

| Thesis Claim | Source Evidence | Implementation Status | Notes |
|---|---|---|---|
| **Event Sourcing** | `desktop/src/engine/log-sync/event-log.ts` — `EventLogService.appendEvent()` writes immutable rows. SQLite `event_log` table. | **PARTIALLY SUPPORTED** | Event log exists and is append-only in the native engine. However, the web/production path uses Redis as primary state store, not the event log. The event log is authoritative only when the native desktop engine is active. |
| **Vector Clock** | `desktop/src/engine/vector-clock/vector-clock.ts` — `createVectorClock`, `VectorClock.increment`, `VectorClock.compare`. | **PARTIALLY SUPPORTED** | Vector Clock is implemented and transmitted in `DELTA_PUSH` payloads. However, in `peer-manager.ts:2036`, the comparison is overridden from `compare()` to a scalar `logicalTimestamp` check during concurrent merge arbitration. |
| **LWW (Last-Write-Wins)** | `web/src/app/api/lobby/doc/route.ts` — `casSetIfNewer()` in `lib/redis.ts`. Scalar timestamp comparison in `peer-manager.ts:2036`. | **SUPPORTED** | LWW is the primary production conflict resolution mechanism. Both the cloud API (`casSetIfNewer`) and native engine peer reconnection (`logicalTimestamp` scalar comparison) use LWW. |
| **Myers Diff** | `web/src/app/api/lobby/doc/route.ts` uses `diff_match_patch` library (Myers' diff algorithm). | **SUPPORTED** | Myers Diff is used for the line-granular three-way merge in the web API. The library is a correct implementation of Myers' diff. |
| **Three-Way Merge** | `desktop/src/engine/peer/line-merge-3way.ts` — `mergeThreeWay()`. Also used in `peer-manager.ts:2067`. Web API's `mergeConcurrentEdit()` in `route.ts`. | **SUPPORTED** | Three-way merge is implemented and executed in both the native engine and the web API. |
| **OT (Operational Transformation)** | `web/src/app/app/peers/page.tsx:608` — `NOT IMPLEMENTED` badge hardcoded in UI. No OT transform/compose functions found anywhere. | **NOT SUPPORTED** | OT is not implemented. The UI toggle is a placebo that routes to identical LWW logic. |
| **CRDT** | Global search across entire repository: no Yjs, Automerge, RGA, LSEQ, Logoot, or CRDT-specific structures found. | **NOT SUPPORTED** | CRDT is not implemented anywhere in the codebase. |
| **Hybrid Algorithm** | Claims combination of Event Sourcing + Vector Clock + Three-Way Merge + LWW + Owner Arbitration. | **PARTIALLY SUPPORTED** | Event Sourcing, Three-Way Merge, and LWW are all present. Vector Clock is partially bypassed. Owner Arbitration is programmatically suppressed in `ipc-handlers.ts:1330` — conflict records are deleted before the user can arbitrate. |
| **Offline-First** | `web/src/lib/idb.ts` — IndexedDB buffering for mid-session disconnections. `desktop/electron/main.ts:60` — `loadURL('https://docu-sync-client.vercel.app')` unconditionally. | **PARTIALLY SUPPORTED** | Mid-session edits are buffered in IndexedDB and flushed on reconnect. Cold-boot offline is not possible on any platform: all three require the Vercel bundle to load. |
| **P2P (Peer-to-Peer)** | `desktop/src/engine/peer/peer-manager.ts` — WebSocket mesh with `DELTA_PUSH`, `SYNC_REQUEST`. | **PARTIALLY SUPPORTED** | P2P WebSocket mesh exists in the native engine. In production, the Electron app loads a remote Vercel URL and does not invoke the native engine; the cloud API acts as a centralized hub. P2P is available only in the isolated native-engine environment. |
| **Conflict Resolution** | `desktop/electron/ipc-handlers.ts:1277` — `lwwResolver.resolve()`. `peer-manager.ts:2036` — concurrent delta resolution. `route.ts:312` — `mergeConcurrentEdit()`. | **PARTIALLY SUPPORTED** | Conflict detection works. Resolution executes. However, Owner Arbitration (user choosing between versions) is suppressed: `ipc-handlers.ts:1330` deletes the conflict record and yields to automatic merge instead. |
| **Zero Data Loss** | `ipc-handlers.ts:1330` — `prisma.conflict.delete()` called after concurrent edit detection. `peer-manager.ts:2036` — `remoteWins` scalar override silently discards the losing peer's edit. | **NOT SUPPORTED** | There are two code paths that silently delete one party's edits: during live concurrent editing and during offline reconnection. The system achieves convergence but does so at the cost of discarding one side's changes without user notification. |
| **Eventual Consistency** | `casSetIfNewer` in Redis ensures last-writer-wins convergence. `mergeThreeWay` achieves line-granular convergence. `DELTA_PUSH` mesh propagates all changes. | **SUPPORTED** | All peers eventually converge to the same document state. The system guarantees eventual consistency, though not zero-loss consistency. |

---

## Summary

| Status | Count | Claims |
|---|---|---|
| **SUPPORTED** | 4 | LWW, Myers Diff, Three-Way Merge, Eventual Consistency |
| **PARTIALLY SUPPORTED** | 5 | Event Sourcing, Vector Clock, Hybrid Algorithm, Offline-First, P2P, Conflict Resolution |
| **NOT SUPPORTED** | 3 | OT, CRDT, Zero Data Loss |

---

## Notes on Evidence Methodology

The following are NOT treated as evidence:
- UI labels (e.g., `"OT"` button label in peers page)
- Variables named after algorithms (e.g., `otMode`)
- Thesis text or comments in code
- Benchmark labels (e.g., tests named `lww` or `ot`)
- File names (e.g., `lww-resolver.ts`)

Only executable code paths reachable in normal application usage are treated as evidence.

---

## Major Issues That Require Future Phases

The following are documented here but are OUT OF SCOPE for the Minor Fix Phase:

1. **Owner Arbitration suppression** — `ipc-handlers.ts:1330` deletes conflict records.
2. **Vector Clock scalar bypass** — `peer-manager.ts:2036` abandons VC comparison.
3. **Offline reconnection data loss** — `resolveConcurrentDelta` applies `remoteWins` unconditionally.
4. **Electron production architecture** — desktop loads remote Vercel URL, native engine is dormant.
5. **OT not implemented** — requires new algorithm development.
6. **CRDT not implemented** — requires new data structure library integration.
