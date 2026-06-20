# SYSTEM OVERVIEW: DocuSync

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## SECTION 1 — WHAT IS DOCUSYNC?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**What the system does:**
DocuSync is a hybrid peer-to-peer (P2P) file synchronization engine that allows multiple users to edit documents collaboratively. It tracks changes, merges edits, and resolves conflicts across different devices without relying on a central server.

**What problem it solves:**
When people collaborate on a file while offline or on unstable internet connections, their edits often clash, leading to lost work or messy conflict files. DocuSync solves this by allowing users to work locally and automatically merging their changes in a smart, decentralized way when they connect to peers.

**Who uses it:**
It is designed for teams, researchers, and individuals who need reliable offline-first collaboration, privacy (since there is no central server storing the data), and decentralized document sharing.

**How it compares to Google Drive and Google Docs:**
Google Drive and Google Docs require a continuous internet connection to a central Google server. If you lose connection, real-time collaboration stops. Google Docs uses a central server to manage changes (Operational Transformation). DocuSync works entirely peer-to-peer; every device holds a complete copy of the engine and the data, making it resilient to internet outages and fully private.

**Why a hybrid algorithm is better than a single algorithm:**
A single algorithm like Last-Writer-Wins (LWW) is too simple and can overwrite important work, while complex algorithms like CRDTs consume massive amounts of memory. By combining Log-Based Sync, Vector Clocks, LWW, and Delta Encoding, DocuSync achieves high performance, minimal data loss, and low bandwidth usage—offering the best of both worlds.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## SECTION 2 — THE FOUR ALGORITHMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### Algorithm 1: Log-Based Synchronization
- **What it does:** It keeps a historical, append-only record of every single edit made to a file.
- **Why it is needed:** It provides the timeline of events. When peers connect, they exchange these logs to see what they missed.
- **How it works step by step:** 1) A user makes an edit. 2) The edit is saved as an "event" in a local database. 3) The event is never deleted or modified. 4) When peers sync, they compare logs and fetch only the events they don't have.
- **What happens without it:** Devices wouldn't know the history of a file, making it impossible to accurately merge offline changes.
- **Thesis Citation:** Baseline reference.

### Algorithm 2: Vector Clocks
- **What it does:** It tracks the exact sequence and timeline of changes across different devices using an array of counters.
- **Why it is needed:** It determines the precise order of events in a decentralized network where devices don't share a universal clock (since system clocks can be wrong).
- **How it works step by step:** 1) Each device has an ID and a counter. 2) Before sending an edit, a device increments its counter. 3) The device attaches this "vector clock" to the edit. 4) When receiving an edit, a device compares the clocks to determine if the edit is new, old, or concurrent (a conflict).
- **What happens without it:** The system wouldn't know if two users edited a file at the exact same time, leading to accidental overwriting.
- **Thesis Citation:** Tree Clock algorithm implementation.

### Algorithm 3: LWW Conflict Resolution (Last-Writer-Wins)
- **What it does:** It automatically decides which version of a file to keep when two users edit the exact same part at the exact same time.
- **Why it is needed:** To prevent the system from halting or breaking when concurrent conflicts occur.
- **How it works step by step:** 1) Vector clocks detect a concurrent conflict. 2) The LWW algorithm looks at the logical timestamps (or system time as a fallback) of both edits. 3) The edit with the latest timestamp "wins" and becomes the current state, while the "losing" edit is stored safely for manual review if needed.
- **What happens without it:** Conflicts would corrupt the file or force the user to manually resolve every single clash before they could continue working.
- **Thesis Citation:** Baseline conflict resolution strategy.

### Algorithm 4: Delta Encoding
- **What it does:** It calculates the exact difference (the "delta") between an old version of a file and a new version.
- **Why it is needed:** To drastically reduce the amount of data sent over the network. Instead of sending a 10MB file, it sends only the 5 bytes that changed.
- **How it works step by step:** 1) A user types a new word. 2) The algorithm compares the new document state to the previous state. 3) It generates a tiny instruction (e.g., "add 'hello' at line 5"). 4) Only this instruction is broadcast to peers.
- **What happens without it:** The system would waste massive amounts of bandwidth and memory by sending full copies of files for every minor keystroke.
- **Thesis Citation:** Optimization technique.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## SECTION 3 — THE THREE PLATFORMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### Platform 1: Desktop (Electron)
- **What it is:** A native application installed on a computer (Windows, macOS, or Linux).
- **Who would use it:** Power users who want their files stored directly on their local hard drive and need robust offline capabilities.
- **How to run it:** Run `npm run dev:electron` in the `desktop/` folder.
- **What technology it uses:** Electron, React, TypeScript, SQLite, and IPC (Inter-Process Communication).
- **What is unique about it:** It directly interacts with the computer's file system and hosts the core SQLite database and P2P networking logic locally.
- **Screenshot/demo instructions:** Open the app, view the Sidebar, and navigate to the local `desktop/tests/manual-evidence/output` folder.

### Platform 2: Web (Next.js)
- **What it is:** A browser-based version of the DocuSync application.
- **Who would use it:** Users who want quick access to their documents from any computer without installing software.
- **How to run it:** Run `npm run dev` in the `web/` folder or visit the live Vercel URL.
- **What technology it uses:** Next.js, React, Tailwind CSS.
- **What is unique about it:** It provides a lightweight, instantly accessible interface that mimics the desktop experience entirely within a web browser.
- **Screenshot/demo instructions:** Visit `http://localhost:3000/home` to see the public landing page, or the dashboard for the main interface.

### Platform 3: Mobile (React Native + Expo)
- **What it is:** A smartphone application for iOS and Android.
- **Who would use it:** On-the-go users who need to review documents, resolve conflicts, or check peer connections from their phone.
- **How to run it:** Run `npm run dev:mobile` in the root folder, and scan the QR code with the Expo Go app.
- **What technology it uses:** React Native, Expo, AsyncStorage.
- **What is unique about it:** It uses `AsyncStorage` for local persistence instead of SQLite, allowing the P2P engine to run completely locally on a mobile device without native database plugins.
- **Screenshot/demo instructions:** Open the Expo Go app, view the themed bottom tab bar, and toggle Dark/Light mode in Settings.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## SECTION 4 — EVERY FILE IN THE SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**desktop/electron/**
- `main.ts` → Initializes the Electron application window and manages the app lifecycle.
- `preload.ts` → Securely exposes specific native desktop APIs to the React frontend.
- `ipc-handlers.ts` → Acts as the bridge between the React frontend and the backend engine/database.

**desktop/src/pages/**
- `FilesPage.tsx` → Displays a list of all synchronized documents with their metadata and sync status.
- `EditorPage.tsx` → Provides a rich text interface for users to actively type and edit documents.
- `ConflictsPage.tsx` → Shows concurrent edits side-by-side and allows users to manually or automatically resolve them.
- `HistoryPage.tsx` → Displays the chronological event log and timeline of all changes made to a file.
- `PeersPage.tsx` → Lists currently connected P2P nodes and allows the user to manually connect via IP/Port.
- `MetricsPage.tsx` → Displays a dashboard of real-time ISO/IEC 25010 performance test results.
- `SettingsPage.tsx` → Allows the user to customize the application theme and view their unique Node ID.

**desktop/src/components/**
- `Sidebar.tsx` → Provides the main left-hand navigation menu for switching between pages.
- `TitleBar.tsx` → Replaces the default OS window controls with a custom, draggable application header.
- `RightPanel.tsx` → Displays contextual information, such as real-time peer connection status and logs.

**desktop/src/context/**
- `ElectronSyncContext.tsx` → Manages the global state of the React application by listening to backend IPC events.

**shared/engine/**
- `vector-clock/vector-clock.ts` → Implements the logical time-keeping algorithm to order events.
- `log-sync/event-log.ts` → Manages the append-only ledger of document edits.
- `delta/delta-encoder.ts` → Calculates the exact differences between two strings to save bandwidth.
- `delta/delta-decoder.ts` → Applies small encoded differences back into a full document.
- `lww/lww-resolver.ts` → Automatically resolves conflicts by choosing the edit with the latest timestamp.
- `peer/message-schema.ts` → Defines the strict data structures for P2P network communication.
- `peer/peer-manager.ts` → Handles WebSocket connections, sending messages, and receiving data from other devices.

**desktop/prisma/**
- `schema.prisma` → Defines the structure of the SQLite database tables (EventLog, Conflict, PeerRegistry).

**web/src/app/**
- `page.tsx` → The main dashboard redirect or entry point for the web app.
- `editor/[id]/page.tsx` → The web-based rich text editor for modifying a specific document.
- `conflicts/page.tsx` → The web interface for viewing and resolving file conflicts.
- `history/[id]/page.tsx` → The web interface for viewing a file's edit history.
- `peers/page.tsx` → The web interface for managing peer connections.
- `metrics/page.tsx` → The web dashboard displaying performance evaluation metrics.
- `home/page.tsx` → The public-facing landing page explaining the product.
- `download/page.tsx` → The public-facing page providing download links for the desktop and mobile apps.

**mobile/screens/**
- `FilesScreen.tsx` → The mobile list view of all tracked documents.
- `EditorScreen.tsx` → The mobile-optimized text editing interface.
- `ConflictsScreen.tsx` → The mobile view for reviewing conflicting edits.
- `PeersScreen.tsx` → The mobile interface for connecting to P2P nodes.
- `MetricsScreen.tsx` → The mobile dashboard for viewing evaluation statistics.

**tests/**
- `unit/vector-clock.test.ts` → Verifies that logical timestamps increment and compare correctly.
- `unit/event-log.test.ts` → Ensures that events are appended and retrieved accurately without corruption.
- `unit/delta-encoder.test.ts` → Proves that text differences are calculated efficiently.
- `unit/lww-resolver.test.ts` → Validates that conflicts are correctly awarded to the latest timestamp.
- `integration/sync-scenario.test.ts` → Simulates multiple nodes connecting and syncing simultaneously to prove system stability.
- `stress/performance.test.ts` → Blasts the engine with thousands of operations to measure latency and throughput.
- `manual-evidence/generate-evidence.ts` → A script that generates physical file outputs for panel review.
- `manual-evidence/output/` → Contains actual generated files proving the engine works on disk.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## SECTION 5 — HOW THE SYSTEM WORKS
(Step by step flow)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### Scenario A — Opening and editing a file:
1. **User clicks Open File:** The user clicks the button in the UI.
2. **OS file picker appears:** The native file dialog opens.
3. **User selects thesis.md:** The file is imported into DocuSync.
4. **What happens in the engine?:** The engine creates an initial "File Created" event in the database and assigns a Vector Clock.
5. **File appears in the list:** The UI updates to show the new file.
6. **User opens the editor:** The user navigates to the Editor page.
7. **User types new content:** The user adds a paragraph.
8. **Auto-save triggers after 500ms:** The system waits for a pause in typing, then initiates a save.
9. **Delta encoding computes the diff:** The engine calculates only the new paragraph added, rather than copying the whole file.
10. **Vector clock increments:** The device updates its logical timestamp to prove this edit is the newest.
11. **Event logged to database:** The delta and the clock are saved immutably to the EventLog.
12. **Delta broadcast to connected peers:** The tiny update is sent over WebSockets to anyone online.
13. **What happens on the peer's device?:** The peer receives the delta, decodes it, updates their own database, and their UI updates in real-time.

### Scenario B — Two users edit simultaneously (conflict):
1. **User A edits line 5:** On their device.
2. **User B also edits line 5 at same time:** On their device.
3. **Both save:** Both devices generate an event.
4. **Vector clocks compared:** When the devices sync, they see that the Vector Clocks did not know about each other.
5. **Concurrent edit detected:** The engine flags this as a simultaneous conflict.
6. **Conflict record created in database:** Both versions are safely stored in the Conflict table.
7. **UI shows conflict banner:** A red warning appears alerting the user.
8. **User goes to Conflicts page:** To review the issue.
9. **Sees Side A vs Side B diff:** The UI highlights exactly what changed.
10. **Clicks LWW Auto-Merge:** The user asks the system to resolve it.
11. **What happens to resolve it?:** The LWW algorithm looks at the timestamps and automatically applies the edit that happened a millisecond later.
12. **Event logged, peers notified:** A "Resolved" event is generated and broadcast so all peers agree on the final state.

### Scenario C — Peer goes offline then reconnects:
When a peer loses internet, they continue logging events locally. Upon reconnecting, their device sends a request to peers containing their current Vector Clock. The peers use the `getEventsSince()` function to scan their EventLog and bundle up only the events that happened *after* that clock. The offline node receives this bundle, applies the missed deltas, and is instantly caught up without downloading full files.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## SECTION 6 — DATABASE TABLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### EventLog table:
- **What it stores:** Every single edit or action (like creating or deleting a file).
- **Why it is append-only (never deleted):** To ensure a permanent, tamper-proof history of the document that can be reconstructed at any time.
- **Each column and what it means:**
  - `id`: A unique database row number.
  - `eventId`: A global unique identifier for the specific edit.
  - `fileId`: Which document this edit belongs to.
  - `nodeId`: Which device made the edit.
  - `payload`: The actual text changes (deltas).
  - `logicalTimestamp`: The vector clock value.
  - `createdAt`: The exact date and time.
- **Example row with real data:** `(1, "evt-xyz", "file-123", "node-paul", "+hello", 5, "2026-06-20 10:00:00")`

### Conflict table:
- **What it stores:** Instances where two edits clashed concurrently.
- **How a conflict gets created:** When Vector Clocks indicate two users edited blindly at the same time.
- **How it gets resolved:** Through manual user choice or the automated LWW algorithm.
- **Each column and what it means:**
  - `id`: Unique row ID.
  - `fileId`: The document involved.
  - `payloadA` / `nodeIdA`: The edit from the first user.
  - `payloadB` / `nodeIdB`: The edit from the second user.
  - `status`: "pending" or "resolved".
  - `winner`: Which side won ("A" or "B").

### PeerRegistry table:
- **What it stores:** A list of known devices/nodes that this app has connected to.
- **How peers are discovered:** Via manual IP/Port entry or local network discovery.
- **Each column and what it means:**
  - `id`: Unique row ID.
  - `nodeId`: The remote device's unique name.
  - `address`: The IP address of the device.
  - `port`: The network port to connect to.
  - `lastSeen`: The last time this device was online.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## SECTION 7 — IPC CHANNELS
(How desktop UI talks to the engine)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**What IPC means:** Inter-Process Communication. It is the secure bridge that allows the visual user interface (frontend) to send commands to the invisible system engine (backend) running on the computer.

- `file:open` → Opens the native OS file picker and imports a file. Returns the new FileRecord.
- `file:save` → Takes the text from the editor, generates a delta, and saves it to the database. Returns success status.
- `file:history` → Fetches the chronological list of edits from the EventLog.
- `file:restore` → Reverts a document back to a specific point in time based on the history log.
- `sync:status` → Requests the current status of the synchronization engine (syncing, idle).
- `sync:trigger` → Manually forces the engine to exchange logs with connected peers.
- `conflict:resolve` → Tells the database which side of a conflict won and applies it.
- `conflict:list` → Fetches all pending conflicts to display on the Conflicts page.
- `conflict:detail` → Fetches the exact text differences for a specific conflict.
- `peer:list` → Fetches the list of all known devices from the PeerRegistry.
- `peer:connect` → Commands the backend WebSocket server to dial an IP address and connect to a peer.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## SECTION 8 — TEST RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**Unit Tests (60 tests):**
- **What was tested:** Individual, isolated pieces of code (functions and classes).
- **What each module test proves:** Proves that algorithms like Vector Clocks strictly follow math rules and Delta Encoders don't mangle text.

**Integration Tests (6 tests):**
- **What scenarios were simulated:** Complex workflows, like three simulated peers connecting, editing simultaneously, and disconnecting.
- **What was proven:** Proves that the modules work together flawlessly in real-world peer-to-peer situations.

**Stress Tests (6 tests):**
- **What metrics were measured:** Latency (speed) and Throughput (volume capacity) under heavy load.
- **All results with targets vs actuals:** Engine processed 1,010 ops/sec (target: 10 ops/sec). Average latency was 1.51ms (target: < 50ms).

**Manual Evidence Tests (20 tests):**
- **What was tested manually:** Physical file generation, UI clicking, and manual conflict resolution.
- **Pass rate and findings:** 100% pass rate. Proven by physical output files generated in the `tests/manual-evidence/output` folder.

**Overall:** 92 tests, 100% pass rate.

**ISO/IEC 25010 Results Table:**

| Metric | Target | Actual | Status |
|---|---|---|---|
| Average Sync Latency | < 50ms | 1.51ms | Passed |
| p95 Latency | < 50ms | 3.01ms | Passed |
| Max Latency | < 50ms | 4.55ms | Passed |
| Sync Throughput | ≥ 10 ops/s | 1,010 ops/s | Passed |
| Conflict Detection Rate | > 95% | 100% | Passed |
| Data Loss Rate | 0% | 0% | Passed |
| Eventual Consistency | ≥ 95% | 100% | Passed |
| Concurrent Nodes | 15 nodes | 15 nodes | Passed |
| Manual Tests | 20/20 | 100% | Passed |
| Automated Tests | 72/72 | 100% | Passed |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## SECTION 9 — HOW TO RUN THE SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**Prerequisites:**
- Node.js (v18+)
- npm (v9+)
- Git
- Expo Go installed on your smartphone

**Running Desktop:**
```bash
cd "C:\Users\Paul John Palamara\Downloads\ThesisSync\desktop"
npm install
npm run dev:electron
```

**Running Web (local):**
```bash
cd "C:\Users\Paul John Palamara\Downloads\ThesisSync\web"
npm install
npm run dev
# Open: http://localhost:3000
```

**Running Web (live):**
Open: [https://docusync-pnc.vercel.app](https://docusync-pnc.vercel.app)

**Running Mobile:**
```bash
cd "C:\Users\Paul John Palamara\Downloads\ThesisSync\mobile"
npx expo start
# Scan the QR code with the Expo Go app on your phone
```

**Running Tests:**
```bash
cd "C:\Users\Paul John Palamara\Downloads\ThesisSync\desktop"
npm run test
# Runs the 72 automated tests
npm run test:evidence
# Runs the 20 manual evidence generation tests
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## SECTION 10 — THESIS INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**Title:** A Comparative Evaluation of Operational Transformation and Replicated Data Types to Hybrid Conflict Resolution Algorithm

**System Name:** DocuSync  
**Institution:** Pamantasan ng Cabuyao  
**College:** College of Computing Studies  
**Degree:** BS Computer Science  
**Year:** 2026  

**Researchers:**
- Paul John G. Palamara — Solo Developer  
- Bajado, John Benedict B. — Co-Researcher  
- Palma, John Lloyd P. — Co-Researcher  
- Venancio, Zyra P. — Co-Researcher  

**Methodology:** Experimental Prototyping  
**Evaluation Standard:** ISO/IEC 25010  
**Baseline Systems Compared:**
- Google Drive (uses pure LWW)  
- Google Docs (uses pure OT)  

**Key Findings:**
- Average latency: 1.51ms (target < 50ms)  
- Throughput: 1,010 events/sec (target ≥ 10)  
- Conflict detection: 100% (target > 95%)  
- Data loss: 0% (target = 0%)  
- Consistency: 100% (target ≥ 95%)  

**GitHub:** [https://github.com/PaulJohnnn/DocuSync](https://github.com/PaulJohnnn/DocuSync)  
**Web App:** [https://docusync-pnc.vercel.app](https://docusync-pnc.vercel.app)  

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## SECTION 11 — PANEL DEFENSE Q&A
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Q1: Why did you choose Electron over a pure web app for the desktop?**
A: A pure web app running in a browser is strictly sandboxed for security reasons, meaning it cannot read or write directly to a user's local hard drive without constant permission prompts. It also cannot securely host a local peer-to-peer WebSocket server. Electron bypasses these limitations by packaging a native Node.js environment alongside the interface. This provides the deep system access required to build a truly decentralized, offline-first application that stores its own local SQLite database.

**Q2: Why SQLite and not a cloud database like Supabase or Firebase?**
A: The core thesis of this project is to demonstrate genuine decentralized peer-to-peer synchronization without a central authority. Using a cloud database like Firebase or Supabase would create a single point of failure, effectively making it a traditional client-server architecture. SQLite allows every individual device to host its own independent, robust relational database entirely offline. This proves that our hybrid algorithm can function effectively when each node acts as its own server.

**Q3: How is DocuSync actually different from Google Drive?**
A: Google Drive relies entirely on a central server to manage files and uses a simple Last-Writer-Wins approach; if two people upload a file simultaneously, one completely overwrites the other. DocuSync removes the central server, allowing devices to sync directly with one another over the network. More importantly, DocuSync utilizes a sophisticated hybrid algorithm that tracks exact granular changes (deltas) and logical time. This means concurrent edits are intelligently merged or flagged as conflicts without losing any user data.

**Q4: What happens when the internet connection is lost?**
A: Because DocuSync is offline-first, users will not notice any disruption to their workflow when the internet drops. Every keystroke and edit continues to be saved instantly and immutably to their local EventLog database. Once the internet connection is restored, the system's `getEventsSince()` function kicks in. It automatically identifies all the offline edits that were missed and seamlessly broadcasts them to connected peers to bring everyone up to date.

**Q5: Can more than 15 users connect at the same time?**
A: Yes, the decentralized architecture is highly scalable and not artificially limited to 15 users. During our ISO/IEC 25010 performance evaluations, we stressed the system with 15 concurrent nodes simultaneously to prove stability, which it passed flawlessly. The actual theoretical limit of concurrent connections is determined by the processing power and network bandwidth of the host machine running the DocuSync application.

**Q6: Why does the system have no user accounts or login?**
A: Traditional user accounts require a central authentication server to securely store and verify passwords, which contradicts our peer-to-peer architecture. Instead, DocuSync devices identify themselves using automatically generated, cryptographic Node IDs. When a user creates a document, their unique Node ID is attached to every edit they make. This establishes identity and tracks authorship securely across the network without relying on a centralized login system.

**Q7: What is the difference between Operational Transformation (OT), CRDTs, and your hybrid approach?**
A: Operational Transformation (OT) requires a central server to dictate the final order of operations, which isn't possible in a peer-to-peer network. Conflict-free Replicated Data Types (CRDTs) work without a server but consume massive amounts of memory because they embed hidden tracking metadata into every single character of a document. Our hybrid approach solves both problems: it uses Vector Clocks to achieve decentralized ordering without a server, and Delta Encoding to compress the data, avoiding the memory bloat of CRDTs.

**Q8: How exactly did you measure the 1.51ms average latency? Is that realistic?**
A: To measure latency accurately during our Stress Tests, the system recorded a high-resolution microsecond timestamp the exact moment an edit was initiated. We then recorded a second timestamp the millisecond the event was fully processed, encoded, and persisted to the local SQLite database. The difference between these timestamps averaged 1.51ms across thousands of operations. This is highly realistic for local database writes, proving the engine is exceptionally fast before network transmission occurs.

**Q9: What file types are supported and why are binary files rejected?**
A: The system is designed specifically for text-based files, such as Markdown, plain text, JSON, and CSV. This is because our Delta Encoding algorithm operates by calculating granular, line-by-line and character-by-character differences in text to save bandwidth. Binary files, such as images or compiled executables, do not have a readable text structure that can be easily diffed. Attempting to sync binary files would require replacing the entire file upon every save, defeating the purpose of the algorithm.

**Q10: What would you improve in future work if you had more time?**
A: If given more time, the first major improvement would be implementing End-to-End Encryption (E2EE) so that intercepted peer-to-peer messages cannot be read by malicious actors on the same network. Secondly, I would integrate automated NAT traversal techniques, like WebRTC or STUN/TURN servers. This would allow users on entirely different internet networks and routers to discover and connect to each other automatically, without needing to manually input IP addresses and ports.

**Q11: How does delta encoding actually save bandwidth? Give a concrete example.**
A: Without delta encoding, if you add a single comma to a 10-megabyte text document, the system would have to transmit the entire 10-megabyte file over the network. With delta encoding, the system calculates the exact difference. It creates a tiny instruction, such as: "At line 45, position 12, insert the character ','". This instruction is only a few bytes in size. By sending only this tiny delta instead of the full file, we save massive amounts of network bandwidth and memory.

**Q12: What happens if two users edit the exact same character at the exact same millisecond?**
A: The system's Vector Clocks will immediately detect that neither user knew about the other's edit, flagging it as a concurrent conflict. The local database safely stores both conflicting versions to ensure zero data loss. To prevent the application from crashing or halting, the Last-Writer-Wins (LWW) algorithm automatically selects the edit with the latest logical timestamp to display temporarily. Users can then open the Conflicts page to review both sides and manually choose the correct version.

**Q13: Is the data encrypted? Is it secure?**
A: At rest, the data is stored securely within a local SQLite database file, which is protected by the host operating system's native file permission model. During transmission over the network, the WebSockets can be configured to use WSS (WebSocket Secure) to encrypt the transport layer. However, true cryptographic End-to-End Encryption (E2EE) of the payload itself is currently outside the scope of this prototype and is reserved as a primary goal for future iterations.

**Q14: How does the system know which edit came first without a central server?**
A: The system completely ignores standard computer clocks, which are often inaccurate or out of sync across different time zones. Instead, it utilizes an algorithm called Vector Clocks. A Vector Clock is a mathematical array of logical counters; every time a device makes an edit, its specific counter increments by one. By mathematically comparing these arrays when devices sync, the system can definitively prove the exact sequence of events and identify exactly which edit occurred first.

**Q15: Why did you build three separate platforms instead of just the desktop?**
A: The goal of the thesis was to evaluate the hybrid algorithm itself, not just a single application. By building three platforms, we proved that the underlying core engine is highly portable, universally applicable, and truly interoperable. The fact that the exact same hybrid synchronization logic functions flawlessly whether it's saving to a native SQLite database on desktop, AsyncStorage on a mobile phone, or running in a web browser, proves the robust and flexible nature of the algorithm.
