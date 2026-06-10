# DocuSync — Hybrid File Synchronization Engine

## Overview

DocuSync is a **hybrid file synchronization engine** designed for the thesis titled
*"A Comparative Evaluation of Operational Transformation and Replicated Data Types
to Hybrid Conflict Resolution Algorithm"* at Pamantasan ng Cabuyao.

## Core Algorithms

### 1. Log-Based Sync (Event Log)
- Every edit is recorded as an **immutable event** in an append-only SQLite log.
- Events are ordered by **logical timestamps** derived from vector clocks.
- The log supports **compaction** without deletion — old entries are marked but never removed.

### 2. Vector Clocks (Fidge/Mattern)
- Each node maintains a **vector of counters**, one per peer in the network.
- On local edit: **increment own slot**.
- On receiving a remote event: **element-wise max then increment own slot**.
- Enables precise **causal ordering** and **concurrency detection**.

### 3. Last-Writer-Wins (LWW) Resolution
- When two edits are **causally concurrent** (neither vector clock dominates), a conflict is detected.
- The system **escalates to the repository owner** for resolution.
- Three resolution options: **Keep Original**, **LWW Auto-Merge**, **Accept Change**.

### 4. Delta Encoding (Myers Diff)
- Instead of transmitting full documents, only the **minimal edit script** is sent.
- Uses the **Myers O(ND) algorithm** for character-level differencing.
- Includes **FNV-1a checksums** for integrity verification.
- Files exceeding **4 MB** are split into content-defined chunks.

## Architecture

- **Transport:** Masterless P2P over WebSocket
- **Storage:** SQLite via Prisma ORM
- **UI Framework:** Electron + React + TipTap
- **Testing:** Jest (unit, integration, stress)
