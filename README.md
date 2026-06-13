# DocuSync
Hybrid P2P File Synchronization Engine

## Thesis
A Comparative Evaluation of Operational 
Transformation and Replicated Data Types 
to Hybrid Conflict Resolution Algorithm

Pamantasan ng Cabuyao — College of Computing Studies
Paul John G. Palamara, 2026

## Applications
- Desktop: Electron app (Windows/macOS/Linux)
- Web: Next.js web application  
- Mobile: React Native (iOS/Android via Expo)

## Core Algorithms
1. Log-Based Synchronization
2. Vector Clocks (Tree Clock)
3. LWW Conflict Resolution
4. Delta Encoding

## Quick Start
Desktop: npm run dev:desktop
Web:     npm run dev:web
Mobile:  npm run dev:mobile

## Test Results (ISO/IEC 25010)
All 6 metrics passed. 72/72 tests passing.
Avg latency: 1.51ms (target < 50ms)
Throughput: 1,010/s (target ≥ 10/s)
