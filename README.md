# DocuSync
Hybrid P2P File Synchronization Engine

## Thesis
A Comparative Evaluation of Operational Transformation and Replicated Data Types to Hybrid Conflict Resolution Algorithm

Pamantasan ng Cabuyao — College of Computing Studies
Paul John G. Palamara, 2026

## Applications
- **Desktop**: Electron app (Windows/macOS/Linux)
- **Web**: Next.js web application  
- **Mobile**: React Native (iOS/Android via Expo)

## Core Algorithms
1. Log-Based Synchronization
2. Vector Clocks (Tree Clock)
3. LWW Conflict Resolution
4. Delta Encoding

## Quick Start
```bash
# Desktop
npm run dev:desktop

# Web
npm run dev:web

# Mobile
npm run dev:mobile
```

## Test Results (ISO/IEC 25010)
- All 6 metrics passed. 72/72 tests passing.
- Avg latency: 1.51ms (target < 50ms)
- Throughput: 1,010/s (target ≥ 10/s)

---

## Development Log & Progress

> A day-by-day record of architectural decisions, feature implementations, and system integrations.

- **May 28, 2026**: Initial monorepo architecture planning and repository setup.
- **June 1, 2026**: Bootstrapped core P2P engine and WebSocket infrastructure.
- **June 4, 2026**: Implemented hybrid conflict resolution algorithm (LWW + Vector Clocks).
- **June 8, 2026**: Set up Prisma SQLite schema, integrated local database layer.
- **June 12, 2026**: Developed Delta Encoding module for optimized file diffing and bandwidth reduction.
- **June 15, 2026**: Web app initialization. Built Next.js Dashboard, routing, and Lobby pages.
- **June 19, 2026**: Integrated secure Local Vault encryption and PIN authentication system.
- **June 23, 2026**: Desktop app initialization using Electron + Vite. Ported core engine and IPC handlers.
- **June 26, 2026**: Mobile app bootstrapped using Expo React Native. Implemented QR code scanning.
- **June 29, 2026**: Comprehensive UI/UX overhaul across all platforms (Premium Dark Theme, Glassmorphism, animations).
- **July 1, 2026**: ISO/IEC 25010 metrics testing, performance profiling, and latency optimization.
- **July 2, 2026**: Final bug fixes for cross-platform room synchronization, UI alignment, and peer discovery.
