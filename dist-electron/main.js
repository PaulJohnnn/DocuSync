"use strict";
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const require$$0 = require(".prisma/client/default");
const require$$0$4 = require("events");
const require$$1$1 = require("https");
const require$$2 = require("http");
const require$$3 = require("net");
const require$$4 = require("tls");
const require$$1 = require("crypto");
const require$$0$3 = require("stream");
const require$$7 = require("url");
const require$$0$1 = require("zlib");
const require$$0$2 = require("buffer");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var _default;
var hasRequired_default;
function require_default() {
  if (hasRequired_default) return _default;
  hasRequired_default = 1;
  _default = {
    ...require$$0
  };
  return _default;
}
var _defaultExports = /* @__PURE__ */ require_default();
function toEventLogEntry(row) {
  return {
    id: row.id,
    eventId: row.eventId,
    fileId: row.fileId,
    nodeId: row.nodeId,
    eventType: row.eventType,
    logicalTimestamp: row.logicalTimestamp,
    vectorClockJson: JSON.parse(row.vectorClockJson),
    payload: row.payload,
    createdAt: row.createdAt,
    isCompacted: row.isCompacted
  };
}
const VALID_EVENT_TYPES = /* @__PURE__ */ new Set([
  "edit",
  "merge",
  "conflict-resolve",
  "restore",
  "offline-replay"
]);
function assertValidEventType(type) {
  if (!VALID_EVENT_TYPES.has(type)) {
    throw new Error(
      `Invalid event type "${type}". Expected one of: ${[...VALID_EVENT_TYPES].join(", ")}.`
    );
  }
}
class EventLogService {
  /**
   * @param prisma - A connected {@link PrismaClient} instance.
   */
  constructor(prisma) {
    /**
     * The Prisma client instance used for all database operations.
     * @internal
     */
    __publicField(this, "prisma");
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
  async appendEvent(input) {
    assertValidEventType(input.eventType);
    const row = await this.prisma.eventLog.create({
      data: {
        eventId: input.eventId,
        fileId: input.fileId,
        nodeId: input.nodeId,
        eventType: input.eventType,
        logicalTimestamp: input.logicalTimestamp,
        vectorClockJson: JSON.stringify(input.vectorClockJson),
        payload: input.payload
        // `createdAt` and `isCompacted` use schema defaults
      }
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
  async getHistory(fileId) {
    const rows = await this.prisma.eventLog.findMany({
      where: { fileId },
      orderBy: [
        { logicalTimestamp: "asc" },
        { id: "asc" }
      ]
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
  async getEventsSince(fileId, logicalTimestamp) {
    const rows = await this.prisma.eventLog.findMany({
      where: {
        fileId,
        logicalTimestamp: { gt: logicalTimestamp },
        isCompacted: false
      },
      orderBy: [
        { logicalTimestamp: "asc" },
        { id: "asc" }
      ]
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
  async compactLog(fileId) {
    const events = await this.prisma.eventLog.findMany({
      where: {
        fileId,
        isCompacted: false
      },
      orderBy: [
        { logicalTimestamp: "asc" },
        { id: "asc" }
      ]
    });
    if (events.length <= 1) {
      return 0;
    }
    const latestPerNode = /* @__PURE__ */ new Map();
    for (const event of events) {
      latestPerNode.set(event.nodeId, event.id);
    }
    const idsToCompact = [];
    for (const event of events) {
      if (latestPerNode.get(event.nodeId) !== event.id) {
        idsToCompact.push(event.id);
      }
    }
    if (idsToCompact.length === 0) {
      return 0;
    }
    const result = await this.prisma.eventLog.updateMany({
      where: {
        id: { in: idsToCompact }
      },
      data: {
        isCompacted: true
      }
    });
    return result.count;
  }
}
function createEventLog(prisma) {
  return new EventLogService(prisma);
}
const MAX_CHUNK_SIZE_BYTES = 4194304;
const MAX_EDIT_DISTANCE = 1e4;
const TEXT_EXTENSIONS = /* @__PURE__ */ new Set([
  ".txt",
  ".md",
  ".markdown",
  ".html",
  ".htm",
  ".xml",
  ".json",
  ".csv",
  ".tsv",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".py",
  ".rb",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".rs",
  ".go",
  ".swift",
  ".kt",
  ".kts",
  ".sql",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".bat",
  ".cmd",
  ".tex",
  ".bib",
  ".rtf",
  ".log",
  ".docx",
  ".doc",
  // Mammoth handles these as HTML strings internally
  ".env",
  ".gitignore",
  ".editorconfig",
  ".prisma",
  ".graphql",
  ".gql",
  ".proto",
  ".svg"
]);
class BinaryContentError extends Error {
  constructor(extension2) {
    super(
      `Delta encoding rejected: "${extension2}" is a binary file format. Only text-based files are supported.`
    );
    this.name = "BinaryContentError";
  }
}
function myersDiff(oldText, newText) {
  if (oldText === newText) {
    return oldText.length > 0 ? [{ type: "equal", text: oldText }] : [];
  }
  if (oldText.length === 0) {
    return [{ type: "insert", text: newText }];
  }
  if (newText.length === 0) {
    return [{ type: "delete", text: oldText }];
  }
  let prefixLen = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (prefixLen < minLen && oldText[prefixLen] === newText[prefixLen]) {
    prefixLen++;
  }
  let suffixLen = 0;
  while (suffixLen < minLen - prefixLen && oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]) {
    suffixLen++;
  }
  const prefix = oldText.slice(0, prefixLen);
  const suffix = oldText.slice(oldText.length - suffixLen);
  const oldCore = oldText.slice(prefixLen, oldText.length - suffixLen);
  const newCore = newText.slice(prefixLen, newText.length - suffixLen);
  const ops = [];
  if (prefix.length > 0) ops.push({ type: "equal", text: prefix });
  if (oldCore.length === 0 && newCore.length > 0) {
    ops.push({ type: "insert", text: newCore });
  } else if (oldCore.length > 0 && newCore.length === 0) {
    ops.push({ type: "delete", text: oldCore });
  } else if (oldCore.length > 0 && newCore.length > 0) {
    const coreDiff = myersCoreEdit(oldCore, newCore);
    ops.push(...coreDiff);
  }
  if (suffix.length > 0) ops.push({ type: "equal", text: suffix });
  return mergeAdjacentOps(ops);
}
function myersCoreEdit(a, b) {
  const n = a.length;
  const m = b.length;
  const maxD = Math.min(n + m, MAX_EDIT_DISTANCE);
  const size = 2 * maxD + 1;
  const v = new Int32Array(size);
  v[maxD + 1] = 0;
  const traces = [];
  let foundD = -1;
  outer:
    for (let d = 0; d <= maxD; d++) {
      for (let k = -d; k <= d; k += 2) {
        const kIdx = k + maxD;
        let x2;
        if (k === -d || k !== d && v[kIdx - 1] < v[kIdx + 1]) {
          x2 = v[kIdx + 1];
        } else {
          x2 = v[kIdx - 1] + 1;
        }
        let y2 = x2 - k;
        while (x2 < n && y2 < m && a[x2] === b[y2]) {
          x2++;
          y2++;
        }
        v[kIdx] = x2;
        if (x2 >= n && y2 >= m) {
          foundD = d;
          traces.push(v.slice());
          break outer;
        }
      }
      traces.push(v.slice());
    }
  if (foundD === -1) {
    return [
      { type: "delete", text: a },
      { type: "insert", text: b }
    ];
  }
  const ops = [];
  let x = n;
  let y = m;
  for (let d = foundD; d > 0; d--) {
    const prevV = traces[d - 1];
    const k = x - y;
    const kIdx = k + maxD;
    let prevK;
    if (k === -d || k !== d && prevV[kIdx - 1] < prevV[kIdx + 1]) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = prevV[prevK + maxD];
    const prevY = prevX - prevK;
    while (x > prevX + (prevK < k ? 1 : 0) && y > prevY + (prevK > k ? 1 : 0)) {
      x--;
      y--;
      ops.push({ type: "equal", text: a[x] });
    }
    if (prevK > k) {
      y--;
      ops.push({ type: "insert", text: b[y] });
    } else {
      x--;
      ops.push({ type: "delete", text: a[x] });
    }
  }
  while (x > 0 && y > 0) {
    x--;
    y--;
    ops.push({ type: "equal", text: a[x] });
  }
  ops.reverse();
  return mergeAdjacentOps(ops);
}
function mergeAdjacentOps(ops) {
  if (ops.length === 0) return ops;
  const merged = [ops[0]];
  for (let i = 1; i < ops.length; i++) {
    const last = merged[merged.length - 1];
    if (last.type === ops[i].type) {
      last.text += ops[i].text;
    } else {
      merged.push({ ...ops[i] });
    }
  }
  return merged;
}
function fnv1a32$1(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function toBase64(str) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "utf-8").toString("base64");
  }
  return btoa(unescape(encodeURIComponent(str)));
}
function extractExtension(fileName) {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === fileName.length - 1) return "";
  return fileName.slice(dotIndex).toLowerCase();
}
function validateTextFile(fileName) {
  const ext = extractExtension(fileName);
  if (ext === "") return;
  if (!TEXT_EXTENSIONS.has(ext)) {
    throw new BinaryContentError(ext);
  }
}
function chunkContent(content) {
  const encoder = new TextEncoder();
  const totalBytes = encoder.encode(content).byteLength;
  if (totalBytes <= MAX_CHUNK_SIZE_BYTES) {
    return [content];
  }
  const chunks = [];
  let offset = 0;
  while (offset < content.length) {
    let endGuess = Math.min(offset + MAX_CHUNK_SIZE_BYTES, content.length);
    let candidate = content.slice(offset, endGuess);
    let candidateBytes = encoder.encode(candidate).byteLength;
    while (candidateBytes > MAX_CHUNK_SIZE_BYTES && endGuess > offset + 1) {
      endGuess = Math.floor(offset + (endGuess - offset) * 0.9);
      candidate = content.slice(offset, endGuess);
      candidateBytes = encoder.encode(candidate).byteLength;
    }
    if (endGuess < content.length) {
      const lastNewline = candidate.lastIndexOf("\n");
      if (lastNewline > 0) {
        endGuess = offset + lastNewline + 1;
        candidate = content.slice(offset, endGuess);
      }
    }
    chunks.push(candidate);
    offset = endGuess;
  }
  return chunks;
}
function encode(previousContent, newContent, fileName) {
  validateTextFile(fileName);
  const encoder = new TextEncoder();
  const newSizeBytes = encoder.encode(newContent).byteLength;
  const prevSizeBytes = encoder.encode(previousContent).byteLength;
  const maxSizeBytes = Math.max(newSizeBytes, prevSizeBytes);
  if (maxSizeBytes > MAX_CHUNK_SIZE_BYTES) {
    return encodeChunked(previousContent, newContent, newSizeBytes);
  }
  const ops = myersDiff(previousContent, newContent);
  const payload = {
    version: 1,
    ops,
    checksum: fnv1a32$1(newContent)
  };
  const deltaBase64 = toBase64(JSON.stringify(payload));
  const deltaSizeBytes = encoder.encode(deltaBase64).byteLength;
  return {
    deltaBase64,
    chunks: null,
    isChunked: false,
    originalSizeBytes: newSizeBytes,
    deltaSizeBytes,
    compressionRatio: newSizeBytes > 0 ? deltaSizeBytes / newSizeBytes : 0
  };
}
function encodeChunked(previousContent, newContent, newSizeBytes) {
  const encoder = new TextEncoder();
  const oldChunks = chunkContent(previousContent);
  const newChunks = chunkContent(newContent);
  const totalChunks = Math.max(oldChunks.length, newChunks.length);
  while (oldChunks.length < totalChunks) oldChunks.push("");
  while (newChunks.length < totalChunks) newChunks.push("");
  const chunks = [];
  let totalDeltaBytes = 0;
  for (let i = 0; i < totalChunks; i++) {
    const ops = myersDiff(oldChunks[i], newChunks[i]);
    const payload = {
      version: 1,
      ops,
      checksum: fnv1a32$1(newChunks[i])
    };
    const deltaBase64 = toBase64(JSON.stringify(payload));
    totalDeltaBytes += encoder.encode(deltaBase64).byteLength;
    chunks.push({
      index: i,
      total: totalChunks,
      deltaBase64
    });
  }
  return {
    deltaBase64: null,
    chunks,
    isChunked: true,
    originalSizeBytes: newSizeBytes,
    deltaSizeBytes: totalDeltaBytes,
    compressionRatio: newSizeBytes > 0 ? totalDeltaBytes / newSizeBytes : 0
  };
}
class DeltaChecksumError extends Error {
  constructor(expected, actual) {
    super(
      `Delta checksum mismatch: expected ${expected}, got ${actual}. The delta may have been corrupted in transit.`
    );
    /** The checksum expected by the delta payload. */
    __publicField(this, "expected");
    /** The checksum actually computed from the reconstructed content. */
    __publicField(this, "actual");
    this.name = "DeltaChecksumError";
    this.expected = expected;
    this.actual = actual;
  }
}
class DeltaMalformedError extends Error {
  constructor(reason) {
    super(`Malformed delta payload: ${reason}`);
    this.name = "DeltaMalformedError";
  }
}
function fromBase64(base64) {
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(base64, "base64").toString("utf-8");
    }
    return decodeURIComponent(escape(atob(base64)));
  } catch {
    throw new DeltaMalformedError("Invalid base64 encoding.");
  }
}
function fnv1a32(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function parseDeltaPayload(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new DeltaMalformedError("Invalid JSON in delta payload.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new DeltaMalformedError("Delta payload is not an object.");
  }
  const obj = parsed;
  if (obj["version"] !== 1) {
    throw new DeltaMalformedError(
      `Unsupported delta version: ${String(obj["version"])}. Expected 1.`
    );
  }
  if (!Array.isArray(obj["ops"])) {
    throw new DeltaMalformedError('Delta payload missing "ops" array.');
  }
  if (typeof obj["checksum"] !== "number") {
    throw new DeltaMalformedError('Delta payload missing numeric "checksum".');
  }
  for (let i = 0; i < obj["ops"].length; i++) {
    const op = obj["ops"][i];
    if (!op || typeof op["type"] !== "string" || typeof op["text"] !== "string") {
      throw new DeltaMalformedError(
        `Invalid op at index ${i}: must have string "type" and "text".`
      );
    }
    if (op["type"] !== "equal" && op["type"] !== "insert" && op["type"] !== "delete") {
      throw new DeltaMalformedError(
        `Invalid op type "${String(op["type"])}" at index ${i}. Expected "equal", "insert", or "delete".`
      );
    }
  }
  return parsed;
}
function applyOps(previousContent, ops) {
  const parts = [];
  let cursor = 0;
  for (const op of ops) {
    switch (op.type) {
      case "equal":
        parts.push(previousContent.slice(cursor, cursor + op.text.length));
        cursor += op.text.length;
        break;
      case "delete":
        cursor += op.text.length;
        break;
      case "insert":
        parts.push(op.text);
        break;
    }
  }
  return parts.join("");
}
function decode(previousContent, deltaBase64) {
  const json = fromBase64(deltaBase64);
  const payload = parseDeltaPayload(json);
  const content = applyOps(previousContent, payload.ops);
  const actualChecksum = fnv1a32(content);
  if (actualChecksum !== payload.checksum) {
    throw new DeltaChecksumError(payload.checksum, actualChecksum);
  }
  return {
    content,
    opsApplied: payload.ops.length,
    checksumValid: true
  };
}
const OVERFLOW_THRESHOLD = Math.floor(Number.MAX_SAFE_INTEGER / 2);
class VectorClockOverflowError extends Error {
  constructor(slotIndex, value) {
    super(
      `VectorClock overflow: slot ${slotIndex} reached ${value}, exceeding safe threshold ${OVERFLOW_THRESHOLD}. Initiate a coordinated clock-reset protocol.`
    );
    this.name = "VectorClockOverflowError";
  }
}
function buildTree(nodeCount) {
  const children = [];
  for (let i = 0; i < nodeCount; i++) {
    children.push({ counter: 0, children: [] });
  }
  return { counter: 0, children };
}
function cloneTree(node) {
  return {
    counter: node.counter,
    children: node.children.map(cloneTree)
  };
}
function flattenCounters(node) {
  if (node.children.length === 0) {
    return [node.counter];
  }
  const result = [];
  for (const child of node.children) {
    result.push(...flattenCounters(child));
  }
  return result;
}
function mergeTreeInPlace(target, source) {
  if (target.children.length !== source.children.length) {
    throw new Error(
      `VectorClock merge failed: tree topology mismatch (${target.children.length} vs ${source.children.length} children).`
    );
  }
  if (target.children.length === 0) {
    target.counter = Math.max(target.counter, source.counter);
    return;
  }
  for (let i = 0; i < target.children.length; i++) {
    mergeTreeInPlace(target.children[i], source.children[i]);
  }
}
function checkOverflow(node, index) {
  if (node.children.length === 0) {
    if (node.counter > OVERFLOW_THRESHOLD) {
      throw new VectorClockOverflowError(index.value, node.counter);
    }
    index.value++;
    return;
  }
  for (const child of node.children) {
    checkOverflow(child, index);
  }
}
function setLeafCounter(node, targetIndex, value, currentIndex) {
  if (node.children.length === 0) {
    if (currentIndex.value === targetIndex) {
      node.counter = value;
    }
    currentIndex.value++;
    return;
  }
  for (const child of node.children) {
    setLeafCounter(child, targetIndex, value, currentIndex);
    if (currentIndex.value > targetIndex) return;
  }
}
function getLeafCounter(node, targetIndex, currentIndex) {
  if (node.children.length === 0) {
    const result = currentIndex.value === targetIndex ? node.counter : -1;
    currentIndex.value++;
    return result;
  }
  for (const child of node.children) {
    const result = getLeafCounter(child, targetIndex, currentIndex);
    if (result !== -1) return result;
  }
  return -1;
}
class VectorClock {
  /**
   * Constructs a new VectorClock.
   *
   * Prefer {@link createVectorClock} for public construction.
   *
   * @param nodeCount - Total number of nodes in the P2P network.
   * @param nodeIndex - The index (0-based) of the local node.
   * @param root      - Optional pre-built tree (used by {@link fromJSON}).
   *
   * @throws {RangeError} If `nodeCount < 1` or `nodeIndex` is out of range.
   */
  constructor(nodeCount, nodeIndex, root) {
    /**
     * The tree clock root node. Each leaf corresponds to one participant
     * in the distributed system.
     *
     * @internal
     */
    __publicField(this, "_root");
    /**
     * Total number of participant nodes this clock was created for.
     * @readonly
     */
    __publicField(this, "nodeCount");
    /**
     * Index of the local node that owns this clock instance (0-based).
     * @readonly
     */
    __publicField(this, "nodeIndex");
    if (nodeCount < 1) {
      throw new RangeError(`nodeCount must be ≥ 1, received ${nodeCount}.`);
    }
    if (nodeIndex < 0 || nodeIndex >= nodeCount) {
      throw new RangeError(
        `nodeIndex must be in [0, ${nodeCount - 1}], received ${nodeIndex}.`
      );
    }
    if (!Number.isInteger(nodeCount) || !Number.isInteger(nodeIndex)) {
      throw new RangeError(
        `nodeCount and nodeIndex must be integers. Received nodeCount=${nodeCount}, nodeIndex=${nodeIndex}.`
      );
    }
    this.nodeCount = nodeCount;
    this.nodeIndex = nodeIndex;
    this._root = root ? cloneTree(root) : buildTree(nodeCount);
  }
  // ── Accessors ──────────────────────────────────────────────────────────
  /**
   * Returns a deep clone of the internal tree clock structure.
   *
   * Useful for inspection and debugging without risking mutation of
   * internal state.
   *
   * @returns A deep copy of the root {@link TreeClockNode}.
   */
  get root() {
    return cloneTree(this._root);
  }
  /**
   * Returns the flat array of all leaf counters in left-to-right DFS order.
   *
   * This is a convenience accessor; the canonical data structure is the
   * tree itself.
   *
   * @returns Array of counter values, length === `nodeCount`.
   */
  get counters() {
    return flattenCounters(this._root);
  }
  // ── Core Operations ────────────────────────────────────────────────────
  /**
   * Increments the local node's slot in the vector clock.
   *
   * Called on every local edit event (file write, document change) to
   * advance the causal timestamp before broadcasting to peers.
   *
   * > "Each process increments its own element of the vector clock before
   * > each event." — Fidge [8], §2.1
   *
   * @throws {VectorClockOverflowError} If the incremented value exceeds
   *   {@link OVERFLOW_THRESHOLD}.
   *
   * @returns `this` for method chaining.
   *
   * @example
   * ```ts
   * const vc = createVectorClock(3, 0);
   * vc.increment(); // counters: [1, 0, 0]
   * vc.increment(); // counters: [2, 0, 0]
   * ```
   *
   * @see Thesis citation [8] — Fidge (1988), vector timestamp increment rule
   */
  increment() {
    const current = getLeafCounter(this._root, this.nodeIndex, { value: 0 });
    const next = current + 1;
    if (next > OVERFLOW_THRESHOLD) {
      throw new VectorClockOverflowError(this.nodeIndex, next);
    }
    setLeafCounter(this._root, this.nodeIndex, next, { value: 0 });
    return this;
  }
  /**
   * Merges a remote vector clock into this one by taking the element-wise
   * maximum of all corresponding leaf counters, then increments the local
   * node's slot.
   *
   * This implements the standard receive-event rule from Mattern [11]:
   *
   * > "Upon receiving a message, the recipient takes the component-wise
   * > maximum of its own clock and the timestamp on the message, then
   * > increments its own component." — Mattern [11], §3
   *
   * @param remote - The remote vector clock received over WebSocket.
   *
   * @throws {Error} If `remote.nodeCount !== this.nodeCount` (topology mismatch).
   * @throws {VectorClockOverflowError} If any merged counter exceeds the
   *   safe threshold.
   *
   * @returns `this` for method chaining.
   *
   * @example
   * ```ts
   * const local  = createVectorClock(3, 0).increment(); // [1, 0, 0]
   * const remote = createVectorClock(3, 1).increment(); // [0, 1, 0]
   * local.merge(remote); // [2, 1, 0]  (max + increment own)
   * ```
   *
   * @see Thesis citation [11] — Mattern (1989), merge rule
   * @see Thesis citation [8]  — Fidge (1988), message receive handling
   */
  merge(remote) {
    if (remote.nodeCount !== this.nodeCount) {
      throw new Error(
        `Cannot merge vector clocks with different node counts: ${this.nodeCount} vs ${remote.nodeCount}.`
      );
    }
    mergeTreeInPlace(this._root, remote._root);
    checkOverflow(this._root, { value: 0 });
    this.increment();
    return this;
  }
  /**
   * Determines whether this vector clock **strictly dominates** another.
   *
   * Clock A dominates Clock B iff:
   * - For every slot `i`: `A[i] >= B[i]`
   * - There exists at least one slot `j` where `A[j] > B[j]`
   *
   * If A dominates B, the event represented by A is causally *after*
   * the event represented by B — no conflict exists, and A's state is
   * the most recent.
   *
   * > "Event e causally precedes event f iff V(e) < V(f), where < is
   * > the strict partial order on vector timestamps." — Fidge [8], §3.2
   *
   * @param other - The vector clock to compare against.
   *
   * @throws {Error} If `other.nodeCount !== this.nodeCount`.
   *
   * @returns `true` if this clock strictly dominates `other`.
   *
   * @example
   * ```ts
   * const a = createVectorClock(2, 0).increment().increment(); // [2, 0]
   * const b = createVectorClock(2, 0).increment();              // [1, 0]
   * a.dominates(b); // true
   * b.dominates(a); // false
   * ```
   *
   * @see Thesis citation [8] — Fidge (1988), partial ordering definition
   */
  dominates(other) {
    return this.compare(other) === "dominant";
  }
  /**
   * Determines whether this clock and another are **concurrent** — meaning
   * neither dominates the other, indicating a write conflict.
   *
   * Concurrency arises when two nodes make independent edits without
   * having received each other's latest state. The sync engine must
   * then invoke the LWW (Last-Writer-Wins) or delta-merge resolver.
   *
   * > "Two events are concurrent iff neither's timestamp dominates the
   * > other's." — Fidge [8], §3.3
   *
   * @param other - The vector clock to compare against.
   *
   * @throws {Error} If `other.nodeCount !== this.nodeCount`.
   *
   * @returns `true` if the clocks are concurrent (conflict detected).
   *
   * @example
   * ```ts
   * const a = createVectorClock(2, 0).increment(); // [1, 0]
   * const b = createVectorClock(2, 1).increment(); // [0, 1]
   * a.isConcurrent(b); // true — conflict!
   * ```
   *
   * @see Thesis citation [8]  — Fidge (1988), concurrency definition
   * @see Thesis citation [11] — Mattern (1989), conflict detection
   */
  isConcurrent(other) {
    return this.compare(other) === "concurrent";
  }
  /**
   * Full four-way comparison of two vector clocks.
   *
   * @param other - The vector clock to compare against.
   *
   * @throws {Error} If `other.nodeCount !== this.nodeCount`.
   *
   * @returns The {@link ClockRelation} between `this` and `other`.
   *
   * @see Thesis citation [8] — Fidge (1988), comparison algorithm
   */
  compare(other) {
    if (other.nodeCount !== this.nodeCount) {
      throw new Error(
        `Cannot compare vector clocks with different node counts: ${this.nodeCount} vs ${other.nodeCount}.`
      );
    }
    const thisCounters = flattenCounters(this._root);
    const otherCounters = flattenCounters(other._root);
    let hasGreater = false;
    let hasLesser = false;
    for (let i = 0; i < thisCounters.length; i++) {
      if (thisCounters[i] > otherCounters[i]) {
        hasGreater = true;
      } else if (thisCounters[i] < otherCounters[i]) {
        hasLesser = true;
      }
      if (hasGreater && hasLesser) {
        return "concurrent";
      }
    }
    if (hasGreater && !hasLesser) return "dominant";
    if (!hasGreater && hasLesser) return "dominated";
    return "equal";
  }
  // ── Serialization ──────────────────────────────────────────────────────
  /**
   * Serialises this vector clock to a JSON-safe plain object.
   *
   * The output is suitable for:
   * - Transmission over WebSocket (`JSON.stringify`)
   * - Storage in SQLite via Prisma (as a JSON column)
   * - Logging and debugging
   *
   * @returns A {@link VectorClockJSON} object.
   *
   * @example
   * ```ts
   * const vc = createVectorClock(3, 0).increment();
   * const json = vc.toJSON();
   * // Send over WebSocket:
   * ws.send(JSON.stringify({ type: 'sync', clock: json }));
   * ```
   *
   * @see Thesis citation [8] — Fidge (1988), serialisation for message passing
   */
  toJSON() {
    return {
      nodeCount: this.nodeCount,
      nodeIndex: this.nodeIndex,
      root: cloneTree(this._root)
    };
  }
  /**
   * Deserialises a {@link VectorClockJSON} object back into a live
   * {@link VectorClock} instance.
   *
   * Use this on the receiving end of a WebSocket message to reconstruct
   * the remote peer's clock for merge/comparison.
   *
   * @param json - The serialised clock data.
   *
   * @throws {RangeError} If the JSON contains invalid `nodeCount` or `nodeIndex`.
   * @throws {Error} If the tree structure is missing or malformed.
   *
   * @returns A new {@link VectorClock} instance.
   *
   * @example
   * ```ts
   * ws.onmessage = (event) => {
   *   const msg = JSON.parse(event.data);
   *   const remoteClock = VectorClock.fromJSON(msg.clock);
   *   localClock.merge(remoteClock);
   * };
   * ```
   *
   * @see Thesis citation [11] — Mattern (1989), clock reconstruction on receive
   */
  static fromJSON(json) {
    if (!json || typeof json.nodeCount !== "number" || typeof json.nodeIndex !== "number") {
      throw new Error(
        "Invalid VectorClockJSON: missing or invalid nodeCount/nodeIndex."
      );
    }
    if (!json.root || typeof json.root.counter !== "number") {
      throw new Error(
        "Invalid VectorClockJSON: missing or malformed root tree node."
      );
    }
    return new VectorClock(json.nodeCount, json.nodeIndex, json.root);
  }
  // ── Debug ──────────────────────────────────────────────────────────────
  /**
   * Returns a human-readable string representation for debugging.
   *
   * @returns A string like `VectorClock(node=0, [2, 1, 0])`.
   */
  toString() {
    return `VectorClock(node=${this.nodeIndex}, [${this.counters.join(", ")}])`;
  }
}
function createVectorClock(nodeCount, nodeIndex) {
  return new VectorClock(nodeCount, nodeIndex);
}
function toConflictRecord(row) {
  return {
    id: row.id,
    conflictId: row.conflictId,
    fileId: row.fileId,
    eventIdA: row.eventIdA,
    nodeIdA: row.nodeIdA,
    vectorClockJsonA: JSON.parse(row.vectorClockJsonA),
    payloadA: row.payloadA,
    eventIdB: row.eventIdB,
    nodeIdB: row.nodeIdB,
    vectorClockJsonB: JSON.parse(row.vectorClockJsonB),
    payloadB: row.payloadB,
    status: row.status,
    winner: row.winner,
    resolvedBy: row.resolvedBy,
    detectedAt: row.detectedAt,
    resolvedAt: row.resolvedAt
  };
}
function generateUUID$1() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
class LWWResolver {
  /**
   * @param prisma   - A connected {@link PrismaClient} instance.
   * @param eventLog - The {@link EventLogService} for append-only logging.
   */
  constructor(prisma, eventLog) {
    /**
     * Prisma client for Conflict table access.
     * @internal
     */
    __publicField(this, "prisma");
    /**
     * Event log service for preserving events before resolution.
     * @internal
     */
    __publicField(this, "eventLog");
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
  async resolve(eventA, eventB, vectorClockA, vectorClockB) {
    await Promise.all([
      this.eventLog.appendEvent(this.toAppendInput(eventA, "edit")),
      this.eventLog.appendEvent(this.toAppendInput(eventB, "edit"))
    ]);
    const relation = vectorClockA.compare(vectorClockB);
    switch (relation) {
      case "dominant":
        return {
          outcome: "a-wins",
          winner: eventA,
          loser: eventB,
          relation,
          conflictId: null
        };
      case "dominated":
        return {
          outcome: "b-wins",
          winner: eventB,
          loser: eventA,
          relation,
          conflictId: null
        };
      case "concurrent": {
        const conflictId = await this.escalateToOwner(eventA, eventB);
        return {
          outcome: "escalated",
          winner: null,
          loser: null,
          relation,
          conflictId
        };
      }
      case "equal":
        return {
          outcome: "equal",
          winner: null,
          loser: null,
          relation,
          conflictId: null
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
  async escalateToOwner(eventA, eventB) {
    const conflictId = generateUUID$1();
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
        status: "pending"
        // winner, resolvedBy, resolvedAt remain null
      }
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
  async autoResolve(conflictId, winner, resolvedBy, mergedClockJson) {
    const row = await this.prisma.conflict.findUnique({
      where: { conflictId }
    });
    if (!row) {
      throw new Error(
        `Conflict not found: "${conflictId}". It may have been resolved already or the ID is invalid.`
      );
    }
    if (row.status === "resolved") {
      throw new Error(
        `Conflict "${conflictId}" is already resolved (winner: ${row.winner}, resolvedBy: ${row.resolvedBy}).`
      );
    }
    const winnerPayload = winner === "A" ? row.payloadA : row.payloadB;
    winner === "A" ? row.nodeIdA : row.nodeIdB;
    winner === "A" ? row.eventIdA : row.eventIdB;
    const updatedRow = await this.prisma.conflict.update({
      where: { conflictId },
      data: {
        status: "resolved",
        winner,
        resolvedBy,
        resolvedAt: /* @__PURE__ */ new Date()
      }
    });
    const resolutionEventId = generateUUID$1();
    const mergedClock = VectorClock.fromJSON(mergedClockJson);
    const logicalTimestamp = mergedClock.counters[mergedClock.nodeIndex];
    const eventLogEntry = await this.eventLog.appendEvent({
      eventId: resolutionEventId,
      fileId: row.fileId,
      nodeId: resolvedBy,
      eventType: "conflict-resolve",
      logicalTimestamp,
      vectorClockJson: mergedClockJson,
      payload: winnerPayload
    });
    const mergeAcceptMessage = {
      type: "MERGE_ACCEPT",
      conflictId,
      fileId: row.fileId,
      winner,
      winnerPayload,
      resolutionEventId,
      resolvedBy,
      logicalTimestamp,
      vectorClockJson: mergedClockJson
    };
    return {
      conflict: toConflictRecord(updatedRow),
      eventLogEntry,
      mergeAcceptMessage
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
  async getPendingConflicts(fileId) {
    const rows = await this.prisma.conflict.findMany({
      where: {
        fileId,
        status: "pending"
      },
      orderBy: { detectedAt: "asc" }
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
  async getConflict(conflictId) {
    const row = await this.prisma.conflict.findUnique({
      where: { conflictId }
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
  async getResolvedConflicts(fileId) {
    const rows = await this.prisma.conflict.findMany({
      where: {
        fileId,
        status: "resolved"
      },
      orderBy: { resolvedAt: "desc" }
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
  toAppendInput(event, eventType) {
    return {
      eventId: event.eventId,
      fileId: event.fileId,
      nodeId: event.nodeId,
      eventType,
      logicalTimestamp: event.logicalTimestamp,
      vectorClockJson: event.vectorClockJson,
      payload: event.payload
    };
  }
}
function createLWWResolver(prisma, eventLog) {
  return new LWWResolver(prisma, eventLog);
}
var bufferUtil = { exports: {} };
var constants;
var hasRequiredConstants;
function requireConstants() {
  if (hasRequiredConstants) return constants;
  hasRequiredConstants = 1;
  const BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
  const hasBlob = typeof Blob !== "undefined";
  if (hasBlob) BINARY_TYPES.push("blob");
  constants = {
    BINARY_TYPES,
    CLOSE_TIMEOUT: 3e4,
    EMPTY_BUFFER: Buffer.alloc(0),
    GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
    hasBlob,
    kForOnEventAttribute: Symbol("kIsForOnEventAttribute"),
    kListener: Symbol("kListener"),
    kStatusCode: Symbol("status-code"),
    kWebSocket: Symbol("websocket"),
    NOOP: () => {
    }
  };
  return constants;
}
var hasRequiredBufferUtil;
function requireBufferUtil() {
  if (hasRequiredBufferUtil) return bufferUtil.exports;
  hasRequiredBufferUtil = 1;
  const { EMPTY_BUFFER } = requireConstants();
  const FastBuffer = Buffer[Symbol.species];
  function concat(list, totalLength) {
    if (list.length === 0) return EMPTY_BUFFER;
    if (list.length === 1) return list[0];
    const target = Buffer.allocUnsafe(totalLength);
    let offset = 0;
    for (let i = 0; i < list.length; i++) {
      const buf = list[i];
      target.set(buf, offset);
      offset += buf.length;
    }
    if (offset < totalLength) {
      return new FastBuffer(target.buffer, target.byteOffset, offset);
    }
    return target;
  }
  function _mask(source, mask, output, offset, length) {
    for (let i = 0; i < length; i++) {
      output[offset + i] = source[i] ^ mask[i & 3];
    }
  }
  function _unmask(buffer, mask) {
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] ^= mask[i & 3];
    }
  }
  function toArrayBuffer(buf) {
    if (buf.length === buf.buffer.byteLength) {
      return buf.buffer;
    }
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
  }
  function toBuffer(data) {
    toBuffer.readOnly = true;
    if (Buffer.isBuffer(data)) return data;
    let buf;
    if (data instanceof ArrayBuffer) {
      buf = new FastBuffer(data);
    } else if (ArrayBuffer.isView(data)) {
      buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
    } else {
      buf = Buffer.from(data);
      toBuffer.readOnly = false;
    }
    return buf;
  }
  bufferUtil.exports = {
    concat,
    mask: _mask,
    toArrayBuffer,
    toBuffer,
    unmask: _unmask
  };
  if (!process.env.WS_NO_BUFFER_UTIL) {
    try {
      const bufferUtil$1 = require("bufferutil");
      bufferUtil.exports.mask = function(source, mask, output, offset, length) {
        if (length < 48) _mask(source, mask, output, offset, length);
        else bufferUtil$1.mask(source, mask, output, offset, length);
      };
      bufferUtil.exports.unmask = function(buffer, mask) {
        if (buffer.length < 32) _unmask(buffer, mask);
        else bufferUtil$1.unmask(buffer, mask);
      };
    } catch (e) {
    }
  }
  return bufferUtil.exports;
}
var limiter;
var hasRequiredLimiter;
function requireLimiter() {
  if (hasRequiredLimiter) return limiter;
  hasRequiredLimiter = 1;
  const kDone = Symbol("kDone");
  const kRun = Symbol("kRun");
  class Limiter {
    /**
     * Creates a new `Limiter`.
     *
     * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
     *     to run concurrently
     */
    constructor(concurrency) {
      this[kDone] = () => {
        this.pending--;
        this[kRun]();
      };
      this.concurrency = concurrency || Infinity;
      this.jobs = [];
      this.pending = 0;
    }
    /**
     * Adds a job to the queue.
     *
     * @param {Function} job The job to run
     * @public
     */
    add(job) {
      this.jobs.push(job);
      this[kRun]();
    }
    /**
     * Removes a job from the queue and runs it if possible.
     *
     * @private
     */
    [kRun]() {
      if (this.pending === this.concurrency) return;
      if (this.jobs.length) {
        const job = this.jobs.shift();
        this.pending++;
        job(this[kDone]);
      }
    }
  }
  limiter = Limiter;
  return limiter;
}
var permessageDeflate;
var hasRequiredPermessageDeflate;
function requirePermessageDeflate() {
  if (hasRequiredPermessageDeflate) return permessageDeflate;
  hasRequiredPermessageDeflate = 1;
  const zlib = require$$0$1;
  const bufferUtil2 = requireBufferUtil();
  const Limiter = requireLimiter();
  const { kStatusCode } = requireConstants();
  const FastBuffer = Buffer[Symbol.species];
  const TRAILER = Buffer.from([0, 0, 255, 255]);
  const kPerMessageDeflate = Symbol("permessage-deflate");
  const kTotalLength = Symbol("total-length");
  const kCallback = Symbol("callback");
  const kBuffers = Symbol("buffers");
  const kError = Symbol("error");
  let zlibLimiter;
  class PerMessageDeflate {
    /**
     * Creates a PerMessageDeflate instance.
     *
     * @param {Object} [options] Configuration options
     * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
     *     for, or request, a custom client window size
     * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
     *     acknowledge disabling of client context takeover
     * @param {Number} [options.concurrencyLimit=10] The number of concurrent
     *     calls to zlib
     * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
     *     use of a custom server window size
     * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
     *     disabling of server context takeover
     * @param {Number} [options.threshold=1024] Size (in bytes) below which
     *     messages should not be compressed if context takeover is disabled
     * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
     *     deflate
     * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
     *     inflate
     * @param {Boolean} [isServer=false] Create the instance in either server or
     *     client mode
     * @param {Number} [maxPayload=0] The maximum allowed message length
     */
    constructor(options, isServer, maxPayload) {
      this._maxPayload = maxPayload | 0;
      this._options = options || {};
      this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
      this._isServer = !!isServer;
      this._deflate = null;
      this._inflate = null;
      this.params = null;
      if (!zlibLimiter) {
        const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
        zlibLimiter = new Limiter(concurrency);
      }
    }
    /**
     * @type {String}
     */
    static get extensionName() {
      return "permessage-deflate";
    }
    /**
     * Create an extension negotiation offer.
     *
     * @return {Object} Extension parameters
     * @public
     */
    offer() {
      const params = {};
      if (this._options.serverNoContextTakeover) {
        params.server_no_context_takeover = true;
      }
      if (this._options.clientNoContextTakeover) {
        params.client_no_context_takeover = true;
      }
      if (this._options.serverMaxWindowBits) {
        params.server_max_window_bits = this._options.serverMaxWindowBits;
      }
      if (this._options.clientMaxWindowBits) {
        params.client_max_window_bits = this._options.clientMaxWindowBits;
      } else if (this._options.clientMaxWindowBits == null) {
        params.client_max_window_bits = true;
      }
      return params;
    }
    /**
     * Accept an extension negotiation offer/response.
     *
     * @param {Array} configurations The extension negotiation offers/reponse
     * @return {Object} Accepted configuration
     * @public
     */
    accept(configurations) {
      configurations = this.normalizeParams(configurations);
      this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
      return this.params;
    }
    /**
     * Releases all resources used by the extension.
     *
     * @public
     */
    cleanup() {
      if (this._inflate) {
        this._inflate.close();
        this._inflate = null;
      }
      if (this._deflate) {
        const callback = this._deflate[kCallback];
        this._deflate.close();
        this._deflate = null;
        if (callback) {
          callback(
            new Error(
              "The deflate stream was closed while data was being processed"
            )
          );
        }
      }
    }
    /**
     *  Accept an extension negotiation offer.
     *
     * @param {Array} offers The extension negotiation offers
     * @return {Object} Accepted configuration
     * @private
     */
    acceptAsServer(offers) {
      const opts = this._options;
      const accepted = offers.find((params) => {
        if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
          return false;
        }
        return true;
      });
      if (!accepted) {
        throw new Error("None of the extension offers can be accepted");
      }
      if (opts.serverNoContextTakeover) {
        accepted.server_no_context_takeover = true;
      }
      if (opts.clientNoContextTakeover) {
        accepted.client_no_context_takeover = true;
      }
      if (typeof opts.serverMaxWindowBits === "number") {
        accepted.server_max_window_bits = opts.serverMaxWindowBits;
      }
      if (typeof opts.clientMaxWindowBits === "number") {
        accepted.client_max_window_bits = opts.clientMaxWindowBits;
      } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
        delete accepted.client_max_window_bits;
      }
      return accepted;
    }
    /**
     * Accept the extension negotiation response.
     *
     * @param {Array} response The extension negotiation response
     * @return {Object} Accepted configuration
     * @private
     */
    acceptAsClient(response) {
      const params = response[0];
      if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
        throw new Error('Unexpected parameter "client_no_context_takeover"');
      }
      if (!params.client_max_window_bits) {
        if (typeof this._options.clientMaxWindowBits === "number") {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        }
      } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
        throw new Error(
          'Unexpected or invalid parameter "client_max_window_bits"'
        );
      }
      return params;
    }
    /**
     * Normalize parameters.
     *
     * @param {Array} configurations The extension negotiation offers/reponse
     * @return {Array} The offers/response with normalized parameters
     * @private
     */
    normalizeParams(configurations) {
      configurations.forEach((params) => {
        Object.keys(params).forEach((key) => {
          let value = params[key];
          if (value.length > 1) {
            throw new Error(`Parameter "${key}" must have only a single value`);
          }
          value = value[0];
          if (key === "client_max_window_bits") {
            if (value !== true) {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (!this._isServer) {
              throw new TypeError(
                `Invalid value for parameter "${key}": ${value}`
              );
            }
          } else if (key === "server_max_window_bits") {
            const num = +value;
            if (!Number.isInteger(num) || num < 8 || num > 15) {
              throw new TypeError(
                `Invalid value for parameter "${key}": ${value}`
              );
            }
            value = num;
          } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
            if (value !== true) {
              throw new TypeError(
                `Invalid value for parameter "${key}": ${value}`
              );
            }
          } else {
            throw new Error(`Unknown parameter "${key}"`);
          }
          params[key] = value;
        });
      });
      return configurations;
    }
    /**
     * Decompress data. Concurrency limited.
     *
     * @param {Buffer} data Compressed data
     * @param {Boolean} fin Specifies whether or not this is the last fragment
     * @param {Function} callback Callback
     * @public
     */
    decompress(data, fin, callback) {
      zlibLimiter.add((done) => {
        this._decompress(data, fin, (err, result) => {
          done();
          callback(err, result);
        });
      });
    }
    /**
     * Compress data. Concurrency limited.
     *
     * @param {(Buffer|String)} data Data to compress
     * @param {Boolean} fin Specifies whether or not this is the last fragment
     * @param {Function} callback Callback
     * @public
     */
    compress(data, fin, callback) {
      zlibLimiter.add((done) => {
        this._compress(data, fin, (err, result) => {
          done();
          callback(err, result);
        });
      });
    }
    /**
     * Decompress data.
     *
     * @param {Buffer} data Compressed data
     * @param {Boolean} fin Specifies whether or not this is the last fragment
     * @param {Function} callback Callback
     * @private
     */
    _decompress(data, fin, callback) {
      const endpoint = this._isServer ? "client" : "server";
      if (!this._inflate) {
        const key = `${endpoint}_max_window_bits`;
        const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
        this._inflate = zlib.createInflateRaw({
          ...this._options.zlibInflateOptions,
          windowBits
        });
        this._inflate[kPerMessageDeflate] = this;
        this._inflate[kTotalLength] = 0;
        this._inflate[kBuffers] = [];
        this._inflate.on("error", inflateOnError);
        this._inflate.on("data", inflateOnData);
      }
      this._inflate[kCallback] = callback;
      this._inflate.write(data);
      if (fin) this._inflate.write(TRAILER);
      this._inflate.flush(() => {
        const err = this._inflate[kError];
        if (err) {
          this._inflate.close();
          this._inflate = null;
          callback(err);
          return;
        }
        const data2 = bufferUtil2.concat(
          this._inflate[kBuffers],
          this._inflate[kTotalLength]
        );
        if (this._inflate._readableState.endEmitted) {
          this._inflate.close();
          this._inflate = null;
        } else {
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._inflate.reset();
          }
        }
        callback(null, data2);
      });
    }
    /**
     * Compress data.
     *
     * @param {(Buffer|String)} data Data to compress
     * @param {Boolean} fin Specifies whether or not this is the last fragment
     * @param {Function} callback Callback
     * @private
     */
    _compress(data, fin, callback) {
      const endpoint = this._isServer ? "server" : "client";
      if (!this._deflate) {
        const key = `${endpoint}_max_window_bits`;
        const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
        this._deflate = zlib.createDeflateRaw({
          ...this._options.zlibDeflateOptions,
          windowBits
        });
        this._deflate[kTotalLength] = 0;
        this._deflate[kBuffers] = [];
        this._deflate.on("data", deflateOnData);
      }
      this._deflate[kCallback] = callback;
      this._deflate.write(data);
      this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
        if (!this._deflate) {
          return;
        }
        let data2 = bufferUtil2.concat(
          this._deflate[kBuffers],
          this._deflate[kTotalLength]
        );
        if (fin) {
          data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
        }
        this._deflate[kCallback] = null;
        this._deflate[kTotalLength] = 0;
        this._deflate[kBuffers] = [];
        if (fin && this.params[`${endpoint}_no_context_takeover`]) {
          this._deflate.reset();
        }
        callback(null, data2);
      });
    }
  }
  permessageDeflate = PerMessageDeflate;
  function deflateOnData(chunk) {
    this[kBuffers].push(chunk);
    this[kTotalLength] += chunk.length;
  }
  function inflateOnData(chunk) {
    this[kTotalLength] += chunk.length;
    if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
      this[kBuffers].push(chunk);
      return;
    }
    this[kError] = new RangeError("Max payload size exceeded");
    this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
    this[kError][kStatusCode] = 1009;
    this.removeListener("data", inflateOnData);
    this.reset();
  }
  function inflateOnError(err) {
    this[kPerMessageDeflate]._inflate = null;
    if (this[kError]) {
      this[kCallback](this[kError]);
      return;
    }
    err[kStatusCode] = 1007;
    this[kCallback](err);
  }
  return permessageDeflate;
}
var validation = { exports: {} };
var hasRequiredValidation;
function requireValidation() {
  if (hasRequiredValidation) return validation.exports;
  hasRequiredValidation = 1;
  const { isUtf8 } = require$$0$2;
  const { hasBlob } = requireConstants();
  const tokenChars = [
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    // 0 - 15
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    // 16 - 31
    0,
    1,
    0,
    1,
    1,
    1,
    1,
    1,
    0,
    0,
    1,
    1,
    0,
    1,
    1,
    0,
    // 32 - 47
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    // 48 - 63
    0,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    // 64 - 79
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    0,
    0,
    0,
    1,
    1,
    // 80 - 95
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    // 96 - 111
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    0,
    1,
    0,
    1,
    0
    // 112 - 127
  ];
  function isValidStatusCode(code) {
    return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
  }
  function _isValidUTF8(buf) {
    const len = buf.length;
    let i = 0;
    while (i < len) {
      if ((buf[i] & 128) === 0) {
        i++;
      } else if ((buf[i] & 224) === 192) {
        if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
          return false;
        }
        i += 2;
      } else if ((buf[i] & 240) === 224) {
        if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
        buf[i] === 237 && (buf[i + 1] & 224) === 160) {
          return false;
        }
        i += 3;
      } else if ((buf[i] & 248) === 240) {
        if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
        buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
          return false;
        }
        i += 4;
      } else {
        return false;
      }
    }
    return true;
  }
  function isBlob(value) {
    return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
  }
  validation.exports = {
    isBlob,
    isValidStatusCode,
    isValidUTF8: _isValidUTF8,
    tokenChars
  };
  if (isUtf8) {
    validation.exports.isValidUTF8 = function(buf) {
      return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
    };
  } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
    try {
      const isValidUTF8 = require("utf-8-validate");
      validation.exports.isValidUTF8 = function(buf) {
        return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
      };
    } catch (e) {
    }
  }
  return validation.exports;
}
var receiver;
var hasRequiredReceiver;
function requireReceiver() {
  if (hasRequiredReceiver) return receiver;
  hasRequiredReceiver = 1;
  const { Writable } = require$$0$3;
  const PerMessageDeflate = requirePermessageDeflate();
  const {
    BINARY_TYPES,
    EMPTY_BUFFER,
    kStatusCode,
    kWebSocket
  } = requireConstants();
  const { concat, toArrayBuffer, unmask } = requireBufferUtil();
  const { isValidStatusCode, isValidUTF8 } = requireValidation();
  const FastBuffer = Buffer[Symbol.species];
  const GET_INFO = 0;
  const GET_PAYLOAD_LENGTH_16 = 1;
  const GET_PAYLOAD_LENGTH_64 = 2;
  const GET_MASK = 3;
  const GET_DATA = 4;
  const INFLATING = 5;
  const DEFER_EVENT = 6;
  class Receiver extends Writable {
    /**
     * Creates a Receiver instance.
     *
     * @param {Object} [options] Options object
     * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
     *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
     *     multiple times in the same tick
     * @param {String} [options.binaryType=nodebuffer] The type for binary data
     * @param {Object} [options.extensions] An object containing the negotiated
     *     extensions
     * @param {Boolean} [options.isServer=false] Specifies whether to operate in
     *     client or server mode
     * @param {Number} [options.maxPayload=0] The maximum allowed message length
     * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
     *     not to skip UTF-8 validation for text and close messages
     */
    constructor(options = {}) {
      super();
      this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
      this._binaryType = options.binaryType || BINARY_TYPES[0];
      this._extensions = options.extensions || {};
      this._isServer = !!options.isServer;
      this._maxPayload = options.maxPayload | 0;
      this._skipUTF8Validation = !!options.skipUTF8Validation;
      this[kWebSocket] = void 0;
      this._bufferedBytes = 0;
      this._buffers = [];
      this._compressed = false;
      this._payloadLength = 0;
      this._mask = void 0;
      this._fragmented = 0;
      this._masked = false;
      this._fin = false;
      this._opcode = 0;
      this._totalPayloadLength = 0;
      this._messageLength = 0;
      this._fragments = [];
      this._errored = false;
      this._loop = false;
      this._state = GET_INFO;
    }
    /**
     * Implements `Writable.prototype._write()`.
     *
     * @param {Buffer} chunk The chunk of data to write
     * @param {String} encoding The character encoding of `chunk`
     * @param {Function} cb Callback
     * @private
     */
    _write(chunk, encoding, cb) {
      if (this._opcode === 8 && this._state == GET_INFO) return cb();
      this._bufferedBytes += chunk.length;
      this._buffers.push(chunk);
      this.startLoop(cb);
    }
    /**
     * Consumes `n` bytes from the buffered data.
     *
     * @param {Number} n The number of bytes to consume
     * @return {Buffer} The consumed bytes
     * @private
     */
    consume(n) {
      this._bufferedBytes -= n;
      if (n === this._buffers[0].length) return this._buffers.shift();
      if (n < this._buffers[0].length) {
        const buf = this._buffers[0];
        this._buffers[0] = new FastBuffer(
          buf.buffer,
          buf.byteOffset + n,
          buf.length - n
        );
        return new FastBuffer(buf.buffer, buf.byteOffset, n);
      }
      const dst = Buffer.allocUnsafe(n);
      do {
        const buf = this._buffers[0];
        const offset = dst.length - n;
        if (n >= buf.length) {
          dst.set(this._buffers.shift(), offset);
        } else {
          dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
        }
        n -= buf.length;
      } while (n > 0);
      return dst;
    }
    /**
     * Starts the parsing loop.
     *
     * @param {Function} cb Callback
     * @private
     */
    startLoop(cb) {
      this._loop = true;
      do {
        switch (this._state) {
          case GET_INFO:
            this.getInfo(cb);
            break;
          case GET_PAYLOAD_LENGTH_16:
            this.getPayloadLength16(cb);
            break;
          case GET_PAYLOAD_LENGTH_64:
            this.getPayloadLength64(cb);
            break;
          case GET_MASK:
            this.getMask();
            break;
          case GET_DATA:
            this.getData(cb);
            break;
          case INFLATING:
          case DEFER_EVENT:
            this._loop = false;
            return;
        }
      } while (this._loop);
      if (!this._errored) cb();
    }
    /**
     * Reads the first two bytes of a frame.
     *
     * @param {Function} cb Callback
     * @private
     */
    getInfo(cb) {
      if (this._bufferedBytes < 2) {
        this._loop = false;
        return;
      }
      const buf = this.consume(2);
      if ((buf[0] & 48) !== 0) {
        const error = this.createError(
          RangeError,
          "RSV2 and RSV3 must be clear",
          true,
          1002,
          "WS_ERR_UNEXPECTED_RSV_2_3"
        );
        cb(error);
        return;
      }
      const compressed = (buf[0] & 64) === 64;
      if (compressed && !this._extensions[PerMessageDeflate.extensionName]) {
        const error = this.createError(
          RangeError,
          "RSV1 must be clear",
          true,
          1002,
          "WS_ERR_UNEXPECTED_RSV_1"
        );
        cb(error);
        return;
      }
      this._fin = (buf[0] & 128) === 128;
      this._opcode = buf[0] & 15;
      this._payloadLength = buf[1] & 127;
      if (this._opcode === 0) {
        if (compressed) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        if (!this._fragmented) {
          const error = this.createError(
            RangeError,
            "invalid opcode 0",
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        this._opcode = this._fragmented;
      } else if (this._opcode === 1 || this._opcode === 2) {
        if (this._fragmented) {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        this._compressed = compressed;
      } else if (this._opcode > 7 && this._opcode < 11) {
        if (!this._fin) {
          const error = this.createError(
            RangeError,
            "FIN must be set",
            true,
            1002,
            "WS_ERR_EXPECTED_FIN"
          );
          cb(error);
          return;
        }
        if (compressed) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
          const error = this.createError(
            RangeError,
            `invalid payload length ${this._payloadLength}`,
            true,
            1002,
            "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
      } else {
        const error = this.createError(
          RangeError,
          `invalid opcode ${this._opcode}`,
          true,
          1002,
          "WS_ERR_INVALID_OPCODE"
        );
        cb(error);
        return;
      }
      if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
      this._masked = (buf[1] & 128) === 128;
      if (this._isServer) {
        if (!this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be set",
            true,
            1002,
            "WS_ERR_EXPECTED_MASK"
          );
          cb(error);
          return;
        }
      } else if (this._masked) {
        const error = this.createError(
          RangeError,
          "MASK must be clear",
          true,
          1002,
          "WS_ERR_UNEXPECTED_MASK"
        );
        cb(error);
        return;
      }
      if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
      else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
      else this.haveLength(cb);
    }
    /**
     * Gets extended payload length (7+16).
     *
     * @param {Function} cb Callback
     * @private
     */
    getPayloadLength16(cb) {
      if (this._bufferedBytes < 2) {
        this._loop = false;
        return;
      }
      this._payloadLength = this.consume(2).readUInt16BE(0);
      this.haveLength(cb);
    }
    /**
     * Gets extended payload length (7+64).
     *
     * @param {Function} cb Callback
     * @private
     */
    getPayloadLength64(cb) {
      if (this._bufferedBytes < 8) {
        this._loop = false;
        return;
      }
      const buf = this.consume(8);
      const num = buf.readUInt32BE(0);
      if (num > Math.pow(2, 53 - 32) - 1) {
        const error = this.createError(
          RangeError,
          "Unsupported WebSocket frame: payload length > 2^53 - 1",
          false,
          1009,
          "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
        );
        cb(error);
        return;
      }
      this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
      this.haveLength(cb);
    }
    /**
     * Payload length has been read.
     *
     * @param {Function} cb Callback
     * @private
     */
    haveLength(cb) {
      if (this._payloadLength && this._opcode < 8) {
        this._totalPayloadLength += this._payloadLength;
        if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
          const error = this.createError(
            RangeError,
            "Max payload size exceeded",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
          );
          cb(error);
          return;
        }
      }
      if (this._masked) this._state = GET_MASK;
      else this._state = GET_DATA;
    }
    /**
     * Reads mask bytes.
     *
     * @private
     */
    getMask() {
      if (this._bufferedBytes < 4) {
        this._loop = false;
        return;
      }
      this._mask = this.consume(4);
      this._state = GET_DATA;
    }
    /**
     * Reads data bytes.
     *
     * @param {Function} cb Callback
     * @private
     */
    getData(cb) {
      let data = EMPTY_BUFFER;
      if (this._payloadLength) {
        if (this._bufferedBytes < this._payloadLength) {
          this._loop = false;
          return;
        }
        data = this.consume(this._payloadLength);
        if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
          unmask(data, this._mask);
        }
      }
      if (this._opcode > 7) {
        this.controlMessage(data, cb);
        return;
      }
      if (this._compressed) {
        this._state = INFLATING;
        this.decompress(data, cb);
        return;
      }
      if (data.length) {
        this._messageLength = this._totalPayloadLength;
        this._fragments.push(data);
      }
      this.dataMessage(cb);
    }
    /**
     * Decompresses data.
     *
     * @param {Buffer} data Compressed data
     * @param {Function} cb Callback
     * @private
     */
    decompress(data, cb) {
      const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
      perMessageDeflate.decompress(data, this._fin, (err, buf) => {
        if (err) return cb(err);
        if (buf.length) {
          this._messageLength += buf.length;
          if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
          this._fragments.push(buf);
        }
        this.dataMessage(cb);
        if (this._state === GET_INFO) this.startLoop(cb);
      });
    }
    /**
     * Handles a data message.
     *
     * @param {Function} cb Callback
     * @private
     */
    dataMessage(cb) {
      if (!this._fin) {
        this._state = GET_INFO;
        return;
      }
      const messageLength = this._messageLength;
      const fragments = this._fragments;
      this._totalPayloadLength = 0;
      this._messageLength = 0;
      this._fragmented = 0;
      this._fragments = [];
      if (this._opcode === 2) {
        let data;
        if (this._binaryType === "nodebuffer") {
          data = concat(fragments, messageLength);
        } else if (this._binaryType === "arraybuffer") {
          data = toArrayBuffer(concat(fragments, messageLength));
        } else if (this._binaryType === "blob") {
          data = new Blob(fragments);
        } else {
          data = fragments;
        }
        if (this._allowSynchronousEvents) {
          this.emit("message", data, true);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit("message", data, true);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      } else {
        const buf = concat(fragments, messageLength);
        if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
          const error = this.createError(
            Error,
            "invalid UTF-8 sequence",
            true,
            1007,
            "WS_ERR_INVALID_UTF8"
          );
          cb(error);
          return;
        }
        if (this._state === INFLATING || this._allowSynchronousEvents) {
          this.emit("message", buf, false);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit("message", buf, false);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
    }
    /**
     * Handles a control message.
     *
     * @param {Buffer} data Data to handle
     * @return {(Error|RangeError|undefined)} A possible error
     * @private
     */
    controlMessage(data, cb) {
      if (this._opcode === 8) {
        if (data.length === 0) {
          this._loop = false;
          this.emit("conclude", 1005, EMPTY_BUFFER);
          this.end();
        } else {
          const code = data.readUInt16BE(0);
          if (!isValidStatusCode(code)) {
            const error = this.createError(
              RangeError,
              `invalid status code ${code}`,
              true,
              1002,
              "WS_ERR_INVALID_CLOSE_CODE"
            );
            cb(error);
            return;
          }
          const buf = new FastBuffer(
            data.buffer,
            data.byteOffset + 2,
            data.length - 2
          );
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          this._loop = false;
          this.emit("conclude", code, buf);
          this.end();
        }
        this._state = GET_INFO;
        return;
      }
      if (this._allowSynchronousEvents) {
        this.emit(this._opcode === 9 ? "ping" : "pong", data);
        this._state = GET_INFO;
      } else {
        this._state = DEFER_EVENT;
        setImmediate(() => {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
          this.startLoop(cb);
        });
      }
    }
    /**
     * Builds an error object.
     *
     * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
     * @param {String} message The error message
     * @param {Boolean} prefix Specifies whether or not to add a default prefix to
     *     `message`
     * @param {Number} statusCode The status code
     * @param {String} errorCode The exposed error code
     * @return {(Error|RangeError)} The error
     * @private
     */
    createError(ErrorCtor, message, prefix, statusCode, errorCode) {
      this._loop = false;
      this._errored = true;
      const err = new ErrorCtor(
        prefix ? `Invalid WebSocket frame: ${message}` : message
      );
      Error.captureStackTrace(err, this.createError);
      err.code = errorCode;
      err[kStatusCode] = statusCode;
      return err;
    }
  }
  receiver = Receiver;
  return receiver;
}
var sender;
var hasRequiredSender;
function requireSender() {
  if (hasRequiredSender) return sender;
  hasRequiredSender = 1;
  const { Duplex } = require$$0$3;
  const { randomFillSync } = require$$1;
  const PerMessageDeflate = requirePermessageDeflate();
  const { EMPTY_BUFFER, kWebSocket, NOOP } = requireConstants();
  const { isBlob, isValidStatusCode } = requireValidation();
  const { mask: applyMask, toBuffer } = requireBufferUtil();
  const kByteLength = Symbol("kByteLength");
  const maskBuffer = Buffer.alloc(4);
  const RANDOM_POOL_SIZE = 8 * 1024;
  let randomPool;
  let randomPoolPointer = RANDOM_POOL_SIZE;
  const DEFAULT = 0;
  const DEFLATING = 1;
  const GET_BLOB_DATA = 2;
  class Sender {
    /**
     * Creates a Sender instance.
     *
     * @param {Duplex} socket The connection socket
     * @param {Object} [extensions] An object containing the negotiated extensions
     * @param {Function} [generateMask] The function used to generate the masking
     *     key
     */
    constructor(socket, extensions, generateMask) {
      this._extensions = extensions || {};
      if (generateMask) {
        this._generateMask = generateMask;
        this._maskBuffer = Buffer.alloc(4);
      }
      this._socket = socket;
      this._firstFragment = true;
      this._compress = false;
      this._bufferedBytes = 0;
      this._queue = [];
      this._state = DEFAULT;
      this.onerror = NOOP;
      this[kWebSocket] = void 0;
    }
    /**
     * Frames a piece of data according to the HyBi WebSocket protocol.
     *
     * @param {(Buffer|String)} data The data to frame
     * @param {Object} options Options object
     * @param {Boolean} [options.fin=false] Specifies whether or not to set the
     *     FIN bit
     * @param {Function} [options.generateMask] The function used to generate the
     *     masking key
     * @param {Boolean} [options.mask=false] Specifies whether or not to mask
     *     `data`
     * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
     *     key
     * @param {Number} options.opcode The opcode
     * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
     *     modified
     * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
     *     RSV1 bit
     * @return {(Buffer|String)[]} The framed data
     * @public
     */
    static frame(data, options) {
      let mask;
      let merge = false;
      let offset = 2;
      let skipMasking = false;
      if (options.mask) {
        mask = options.maskBuffer || maskBuffer;
        if (options.generateMask) {
          options.generateMask(mask);
        } else {
          if (randomPoolPointer === RANDOM_POOL_SIZE) {
            if (randomPool === void 0) {
              randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
            }
            randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
            randomPoolPointer = 0;
          }
          mask[0] = randomPool[randomPoolPointer++];
          mask[1] = randomPool[randomPoolPointer++];
          mask[2] = randomPool[randomPoolPointer++];
          mask[3] = randomPool[randomPoolPointer++];
        }
        skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
        offset = 6;
      }
      let dataLength;
      if (typeof data === "string") {
        if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
          dataLength = options[kByteLength];
        } else {
          data = Buffer.from(data);
          dataLength = data.length;
        }
      } else {
        dataLength = data.length;
        merge = options.mask && options.readOnly && !skipMasking;
      }
      let payloadLength = dataLength;
      if (dataLength >= 65536) {
        offset += 8;
        payloadLength = 127;
      } else if (dataLength > 125) {
        offset += 2;
        payloadLength = 126;
      }
      const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
      target[0] = options.fin ? options.opcode | 128 : options.opcode;
      if (options.rsv1) target[0] |= 64;
      target[1] = payloadLength;
      if (payloadLength === 126) {
        target.writeUInt16BE(dataLength, 2);
      } else if (payloadLength === 127) {
        target[2] = target[3] = 0;
        target.writeUIntBE(dataLength, 4, 6);
      }
      if (!options.mask) return [target, data];
      target[1] |= 128;
      target[offset - 4] = mask[0];
      target[offset - 3] = mask[1];
      target[offset - 2] = mask[2];
      target[offset - 1] = mask[3];
      if (skipMasking) return [target, data];
      if (merge) {
        applyMask(data, mask, target, offset, dataLength);
        return [target];
      }
      applyMask(data, mask, data, 0, dataLength);
      return [target, data];
    }
    /**
     * Sends a close message to the other peer.
     *
     * @param {Number} [code] The status code component of the body
     * @param {(String|Buffer)} [data] The message component of the body
     * @param {Boolean} [mask=false] Specifies whether or not to mask the message
     * @param {Function} [cb] Callback
     * @public
     */
    close(code, data, mask, cb) {
      let buf;
      if (code === void 0) {
        buf = EMPTY_BUFFER;
      } else if (typeof code !== "number" || !isValidStatusCode(code)) {
        throw new TypeError("First argument must be a valid error code number");
      } else if (data === void 0 || !data.length) {
        buf = Buffer.allocUnsafe(2);
        buf.writeUInt16BE(code, 0);
      } else {
        const length = Buffer.byteLength(data);
        if (length > 123) {
          throw new RangeError("The message must not be greater than 123 bytes");
        }
        buf = Buffer.allocUnsafe(2 + length);
        buf.writeUInt16BE(code, 0);
        if (typeof data === "string") {
          buf.write(data, 2);
        } else {
          buf.set(data, 2);
        }
      }
      const options = {
        [kByteLength]: buf.length,
        fin: true,
        generateMask: this._generateMask,
        mask,
        maskBuffer: this._maskBuffer,
        opcode: 8,
        readOnly: false,
        rsv1: false
      };
      if (this._state !== DEFAULT) {
        this.enqueue([this.dispatch, buf, false, options, cb]);
      } else {
        this.sendFrame(Sender.frame(buf, options), cb);
      }
    }
    /**
     * Sends a ping message to the other peer.
     *
     * @param {*} data The message to send
     * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
     * @param {Function} [cb] Callback
     * @public
     */
    ping(data, mask, cb) {
      let byteLength;
      let readOnly;
      if (typeof data === "string") {
        byteLength = Buffer.byteLength(data);
        readOnly = false;
      } else if (isBlob(data)) {
        byteLength = data.size;
        readOnly = false;
      } else {
        data = toBuffer(data);
        byteLength = data.length;
        readOnly = toBuffer.readOnly;
      }
      if (byteLength > 125) {
        throw new RangeError("The data size must not be greater than 125 bytes");
      }
      const options = {
        [kByteLength]: byteLength,
        fin: true,
        generateMask: this._generateMask,
        mask,
        maskBuffer: this._maskBuffer,
        opcode: 9,
        readOnly,
        rsv1: false
      };
      if (isBlob(data)) {
        if (this._state !== DEFAULT) {
          this.enqueue([this.getBlobData, data, false, options, cb]);
        } else {
          this.getBlobData(data, false, options, cb);
        }
      } else if (this._state !== DEFAULT) {
        this.enqueue([this.dispatch, data, false, options, cb]);
      } else {
        this.sendFrame(Sender.frame(data, options), cb);
      }
    }
    /**
     * Sends a pong message to the other peer.
     *
     * @param {*} data The message to send
     * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
     * @param {Function} [cb] Callback
     * @public
     */
    pong(data, mask, cb) {
      let byteLength;
      let readOnly;
      if (typeof data === "string") {
        byteLength = Buffer.byteLength(data);
        readOnly = false;
      } else if (isBlob(data)) {
        byteLength = data.size;
        readOnly = false;
      } else {
        data = toBuffer(data);
        byteLength = data.length;
        readOnly = toBuffer.readOnly;
      }
      if (byteLength > 125) {
        throw new RangeError("The data size must not be greater than 125 bytes");
      }
      const options = {
        [kByteLength]: byteLength,
        fin: true,
        generateMask: this._generateMask,
        mask,
        maskBuffer: this._maskBuffer,
        opcode: 10,
        readOnly,
        rsv1: false
      };
      if (isBlob(data)) {
        if (this._state !== DEFAULT) {
          this.enqueue([this.getBlobData, data, false, options, cb]);
        } else {
          this.getBlobData(data, false, options, cb);
        }
      } else if (this._state !== DEFAULT) {
        this.enqueue([this.dispatch, data, false, options, cb]);
      } else {
        this.sendFrame(Sender.frame(data, options), cb);
      }
    }
    /**
     * Sends a data message to the other peer.
     *
     * @param {*} data The message to send
     * @param {Object} options Options object
     * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
     *     or text
     * @param {Boolean} [options.compress=false] Specifies whether or not to
     *     compress `data`
     * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
     *     last one
     * @param {Boolean} [options.mask=false] Specifies whether or not to mask
     *     `data`
     * @param {Function} [cb] Callback
     * @public
     */
    send(data, options, cb) {
      const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
      let opcode = options.binary ? 2 : 1;
      let rsv1 = options.compress;
      let byteLength;
      let readOnly;
      if (typeof data === "string") {
        byteLength = Buffer.byteLength(data);
        readOnly = false;
      } else if (isBlob(data)) {
        byteLength = data.size;
        readOnly = false;
      } else {
        data = toBuffer(data);
        byteLength = data.length;
        readOnly = toBuffer.readOnly;
      }
      if (this._firstFragment) {
        this._firstFragment = false;
        if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
          rsv1 = byteLength >= perMessageDeflate._threshold;
        }
        this._compress = rsv1;
      } else {
        rsv1 = false;
        opcode = 0;
      }
      if (options.fin) this._firstFragment = true;
      const opts = {
        [kByteLength]: byteLength,
        fin: options.fin,
        generateMask: this._generateMask,
        mask: options.mask,
        maskBuffer: this._maskBuffer,
        opcode,
        readOnly,
        rsv1
      };
      if (isBlob(data)) {
        if (this._state !== DEFAULT) {
          this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
        } else {
          this.getBlobData(data, this._compress, opts, cb);
        }
      } else if (this._state !== DEFAULT) {
        this.enqueue([this.dispatch, data, this._compress, opts, cb]);
      } else {
        this.dispatch(data, this._compress, opts, cb);
      }
    }
    /**
     * Gets the contents of a blob as binary data.
     *
     * @param {Blob} blob The blob
     * @param {Boolean} [compress=false] Specifies whether or not to compress
     *     the data
     * @param {Object} options Options object
     * @param {Boolean} [options.fin=false] Specifies whether or not to set the
     *     FIN bit
     * @param {Function} [options.generateMask] The function used to generate the
     *     masking key
     * @param {Boolean} [options.mask=false] Specifies whether or not to mask
     *     `data`
     * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
     *     key
     * @param {Number} options.opcode The opcode
     * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
     *     modified
     * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
     *     RSV1 bit
     * @param {Function} [cb] Callback
     * @private
     */
    getBlobData(blob, compress, options, cb) {
      this._bufferedBytes += options[kByteLength];
      this._state = GET_BLOB_DATA;
      blob.arrayBuffer().then((arrayBuffer) => {
        if (this._socket.destroyed) {
          const err = new Error(
            "The socket was closed while the blob was being read"
          );
          process.nextTick(callCallbacks, this, err, cb);
          return;
        }
        this._bufferedBytes -= options[kByteLength];
        const data = toBuffer(arrayBuffer);
        if (!compress) {
          this._state = DEFAULT;
          this.sendFrame(Sender.frame(data, options), cb);
          this.dequeue();
        } else {
          this.dispatch(data, compress, options, cb);
        }
      }).catch((err) => {
        process.nextTick(onError, this, err, cb);
      });
    }
    /**
     * Dispatches a message.
     *
     * @param {(Buffer|String)} data The message to send
     * @param {Boolean} [compress=false] Specifies whether or not to compress
     *     `data`
     * @param {Object} options Options object
     * @param {Boolean} [options.fin=false] Specifies whether or not to set the
     *     FIN bit
     * @param {Function} [options.generateMask] The function used to generate the
     *     masking key
     * @param {Boolean} [options.mask=false] Specifies whether or not to mask
     *     `data`
     * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
     *     key
     * @param {Number} options.opcode The opcode
     * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
     *     modified
     * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
     *     RSV1 bit
     * @param {Function} [cb] Callback
     * @private
     */
    dispatch(data, compress, options, cb) {
      if (!compress) {
        this.sendFrame(Sender.frame(data, options), cb);
        return;
      }
      const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
      this._bufferedBytes += options[kByteLength];
      this._state = DEFLATING;
      perMessageDeflate.compress(data, options.fin, (_, buf) => {
        if (this._socket.destroyed) {
          const err = new Error(
            "The socket was closed while data was being compressed"
          );
          callCallbacks(this, err, cb);
          return;
        }
        this._bufferedBytes -= options[kByteLength];
        this._state = DEFAULT;
        options.readOnly = false;
        this.sendFrame(Sender.frame(buf, options), cb);
        this.dequeue();
      });
    }
    /**
     * Executes queued send operations.
     *
     * @private
     */
    dequeue() {
      while (this._state === DEFAULT && this._queue.length) {
        const params = this._queue.shift();
        this._bufferedBytes -= params[3][kByteLength];
        Reflect.apply(params[0], this, params.slice(1));
      }
    }
    /**
     * Enqueues a send operation.
     *
     * @param {Array} params Send operation parameters.
     * @private
     */
    enqueue(params) {
      this._bufferedBytes += params[3][kByteLength];
      this._queue.push(params);
    }
    /**
     * Sends a frame.
     *
     * @param {(Buffer | String)[]} list The frame to send
     * @param {Function} [cb] Callback
     * @private
     */
    sendFrame(list, cb) {
      if (list.length === 2) {
        this._socket.cork();
        this._socket.write(list[0]);
        this._socket.write(list[1], cb);
        this._socket.uncork();
      } else {
        this._socket.write(list[0], cb);
      }
    }
  }
  sender = Sender;
  function callCallbacks(sender2, err, cb) {
    if (typeof cb === "function") cb(err);
    for (let i = 0; i < sender2._queue.length; i++) {
      const params = sender2._queue[i];
      const callback = params[params.length - 1];
      if (typeof callback === "function") callback(err);
    }
  }
  function onError(sender2, err, cb) {
    callCallbacks(sender2, err, cb);
    sender2.onerror(err);
  }
  return sender;
}
var eventTarget;
var hasRequiredEventTarget;
function requireEventTarget() {
  if (hasRequiredEventTarget) return eventTarget;
  hasRequiredEventTarget = 1;
  const { kForOnEventAttribute, kListener } = requireConstants();
  const kCode = Symbol("kCode");
  const kData = Symbol("kData");
  const kError = Symbol("kError");
  const kMessage = Symbol("kMessage");
  const kReason = Symbol("kReason");
  const kTarget = Symbol("kTarget");
  const kType = Symbol("kType");
  const kWasClean = Symbol("kWasClean");
  class Event {
    /**
     * Create a new `Event`.
     *
     * @param {String} type The name of the event
     * @throws {TypeError} If the `type` argument is not specified
     */
    constructor(type) {
      this[kTarget] = null;
      this[kType] = type;
    }
    /**
     * @type {*}
     */
    get target() {
      return this[kTarget];
    }
    /**
     * @type {String}
     */
    get type() {
      return this[kType];
    }
  }
  Object.defineProperty(Event.prototype, "target", { enumerable: true });
  Object.defineProperty(Event.prototype, "type", { enumerable: true });
  class CloseEvent extends Event {
    /**
     * Create a new `CloseEvent`.
     *
     * @param {String} type The name of the event
     * @param {Object} [options] A dictionary object that allows for setting
     *     attributes via object members of the same name
     * @param {Number} [options.code=0] The status code explaining why the
     *     connection was closed
     * @param {String} [options.reason=''] A human-readable string explaining why
     *     the connection was closed
     * @param {Boolean} [options.wasClean=false] Indicates whether or not the
     *     connection was cleanly closed
     */
    constructor(type, options = {}) {
      super(type);
      this[kCode] = options.code === void 0 ? 0 : options.code;
      this[kReason] = options.reason === void 0 ? "" : options.reason;
      this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
    }
    /**
     * @type {Number}
     */
    get code() {
      return this[kCode];
    }
    /**
     * @type {String}
     */
    get reason() {
      return this[kReason];
    }
    /**
     * @type {Boolean}
     */
    get wasClean() {
      return this[kWasClean];
    }
  }
  Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
  Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
  Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
  class ErrorEvent extends Event {
    /**
     * Create a new `ErrorEvent`.
     *
     * @param {String} type The name of the event
     * @param {Object} [options] A dictionary object that allows for setting
     *     attributes via object members of the same name
     * @param {*} [options.error=null] The error that generated this event
     * @param {String} [options.message=''] The error message
     */
    constructor(type, options = {}) {
      super(type);
      this[kError] = options.error === void 0 ? null : options.error;
      this[kMessage] = options.message === void 0 ? "" : options.message;
    }
    /**
     * @type {*}
     */
    get error() {
      return this[kError];
    }
    /**
     * @type {String}
     */
    get message() {
      return this[kMessage];
    }
  }
  Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
  Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
  class MessageEvent extends Event {
    /**
     * Create a new `MessageEvent`.
     *
     * @param {String} type The name of the event
     * @param {Object} [options] A dictionary object that allows for setting
     *     attributes via object members of the same name
     * @param {*} [options.data=null] The message content
     */
    constructor(type, options = {}) {
      super(type);
      this[kData] = options.data === void 0 ? null : options.data;
    }
    /**
     * @type {*}
     */
    get data() {
      return this[kData];
    }
  }
  Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
  const EventTarget = {
    /**
     * Register an event listener.
     *
     * @param {String} type A string representing the event type to listen for
     * @param {(Function|Object)} handler The listener to add
     * @param {Object} [options] An options object specifies characteristics about
     *     the event listener
     * @param {Boolean} [options.once=false] A `Boolean` indicating that the
     *     listener should be invoked at most once after being added. If `true`,
     *     the listener would be automatically removed when invoked.
     * @public
     */
    addEventListener(type, handler, options = {}) {
      for (const listener of this.listeners(type)) {
        if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
          return;
        }
      }
      let wrapper;
      if (type === "message") {
        wrapper = function onMessage(data, isBinary) {
          const event = new MessageEvent("message", {
            data: isBinary ? data : data.toString()
          });
          event[kTarget] = this;
          callListener(handler, this, event);
        };
      } else if (type === "close") {
        wrapper = function onClose(code, message) {
          const event = new CloseEvent("close", {
            code,
            reason: message.toString(),
            wasClean: this._closeFrameReceived && this._closeFrameSent
          });
          event[kTarget] = this;
          callListener(handler, this, event);
        };
      } else if (type === "error") {
        wrapper = function onError(error) {
          const event = new ErrorEvent("error", {
            error,
            message: error.message
          });
          event[kTarget] = this;
          callListener(handler, this, event);
        };
      } else if (type === "open") {
        wrapper = function onOpen() {
          const event = new Event("open");
          event[kTarget] = this;
          callListener(handler, this, event);
        };
      } else {
        return;
      }
      wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
      wrapper[kListener] = handler;
      if (options.once) {
        this.once(type, wrapper);
      } else {
        this.on(type, wrapper);
      }
    },
    /**
     * Remove an event listener.
     *
     * @param {String} type A string representing the event type to remove
     * @param {(Function|Object)} handler The listener to remove
     * @public
     */
    removeEventListener(type, handler) {
      for (const listener of this.listeners(type)) {
        if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
          this.removeListener(type, listener);
          break;
        }
      }
    }
  };
  eventTarget = {
    CloseEvent,
    ErrorEvent,
    Event,
    EventTarget,
    MessageEvent
  };
  function callListener(listener, thisArg, event) {
    if (typeof listener === "object" && listener.handleEvent) {
      listener.handleEvent.call(listener, event);
    } else {
      listener.call(thisArg, event);
    }
  }
  return eventTarget;
}
var extension;
var hasRequiredExtension;
function requireExtension() {
  if (hasRequiredExtension) return extension;
  hasRequiredExtension = 1;
  const { tokenChars } = requireValidation();
  function push(dest, name, elem) {
    if (dest[name] === void 0) dest[name] = [elem];
    else dest[name].push(elem);
  }
  function parse(header) {
    const offers = /* @__PURE__ */ Object.create(null);
    let params = /* @__PURE__ */ Object.create(null);
    let mustUnescape = false;
    let isEscaping = false;
    let inQuotes = false;
    let extensionName;
    let paramName;
    let start = -1;
    let code = -1;
    let end = -1;
    let i = 0;
    for (; i < header.length; i++) {
      code = header.charCodeAt(i);
      if (extensionName === void 0) {
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 59 || code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const name = header.slice(start, end);
          if (code === 44) {
            push(offers, name, params);
            params = /* @__PURE__ */ Object.create(null);
          } else {
            extensionName = name;
          }
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      } else if (paramName === void 0) {
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (code === 32 || code === 9) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 59 || code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          push(params, header.slice(start, end), true);
          if (code === 44) {
            push(offers, extensionName, params);
            params = /* @__PURE__ */ Object.create(null);
            extensionName = void 0;
          }
          start = end = -1;
        } else if (code === 61 && start !== -1 && end === -1) {
          paramName = header.slice(start, i);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      } else {
        if (isEscaping) {
          if (tokenChars[code] !== 1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (start === -1) start = i;
          else if (!mustUnescape) mustUnescape = true;
          isEscaping = false;
        } else if (inQuotes) {
          if (tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 34 && start !== -1) {
            inQuotes = false;
            end = i;
          } else if (code === 92) {
            isEscaping = true;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
          inQuotes = true;
        } else if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (start !== -1 && (code === 32 || code === 9)) {
          if (end === -1) end = i;
        } else if (code === 59 || code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          let value = header.slice(start, end);
          if (mustUnescape) {
            value = value.replace(/\\/g, "");
            mustUnescape = false;
          }
          push(params, paramName, value);
          if (code === 44) {
            push(offers, extensionName, params);
            params = /* @__PURE__ */ Object.create(null);
            extensionName = void 0;
          }
          paramName = void 0;
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
    }
    if (start === -1 || inQuotes || code === 32 || code === 9) {
      throw new SyntaxError("Unexpected end of input");
    }
    if (end === -1) end = i;
    const token = header.slice(start, end);
    if (extensionName === void 0) {
      push(offers, token, params);
    } else {
      if (paramName === void 0) {
        push(params, token, true);
      } else if (mustUnescape) {
        push(params, paramName, token.replace(/\\/g, ""));
      } else {
        push(params, paramName, token);
      }
      push(offers, extensionName, params);
    }
    return offers;
  }
  function format(extensions) {
    return Object.keys(extensions).map((extension2) => {
      let configurations = extensions[extension2];
      if (!Array.isArray(configurations)) configurations = [configurations];
      return configurations.map((params) => {
        return [extension2].concat(
          Object.keys(params).map((k) => {
            let values = params[k];
            if (!Array.isArray(values)) values = [values];
            return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
          })
        ).join("; ");
      }).join(", ");
    }).join(", ");
  }
  extension = { format, parse };
  return extension;
}
var websocket;
var hasRequiredWebsocket;
function requireWebsocket() {
  if (hasRequiredWebsocket) return websocket;
  hasRequiredWebsocket = 1;
  const EventEmitter = require$$0$4;
  const https = require$$1$1;
  const http = require$$2;
  const net = require$$3;
  const tls = require$$4;
  const { randomBytes, createHash } = require$$1;
  const { Duplex, Readable } = require$$0$3;
  const { URL } = require$$7;
  const PerMessageDeflate = requirePermessageDeflate();
  const Receiver = requireReceiver();
  const Sender = requireSender();
  const { isBlob } = requireValidation();
  const {
    BINARY_TYPES,
    CLOSE_TIMEOUT,
    EMPTY_BUFFER,
    GUID,
    kForOnEventAttribute,
    kListener,
    kStatusCode,
    kWebSocket,
    NOOP
  } = requireConstants();
  const {
    EventTarget: { addEventListener, removeEventListener }
  } = requireEventTarget();
  const { format, parse } = requireExtension();
  const { toBuffer } = requireBufferUtil();
  const kAborted = Symbol("kAborted");
  const protocolVersions = [8, 13];
  const readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
  const subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
  class WebSocket2 extends EventEmitter {
    /**
     * Create a new `WebSocket`.
     *
     * @param {(String|URL)} address The URL to which to connect
     * @param {(String|String[])} [protocols] The subprotocols
     * @param {Object} [options] Connection options
     */
    constructor(address, protocols, options) {
      super();
      this._binaryType = BINARY_TYPES[0];
      this._closeCode = 1006;
      this._closeFrameReceived = false;
      this._closeFrameSent = false;
      this._closeMessage = EMPTY_BUFFER;
      this._closeTimer = null;
      this._errorEmitted = false;
      this._extensions = {};
      this._paused = false;
      this._protocol = "";
      this._readyState = WebSocket2.CONNECTING;
      this._receiver = null;
      this._sender = null;
      this._socket = null;
      if (address !== null) {
        this._bufferedAmount = 0;
        this._isServer = false;
        this._redirects = 0;
        if (protocols === void 0) {
          protocols = [];
        } else if (!Array.isArray(protocols)) {
          if (typeof protocols === "object" && protocols !== null) {
            options = protocols;
            protocols = [];
          } else {
            protocols = [protocols];
          }
        }
        initAsClient(this, address, protocols, options);
      } else {
        this._autoPong = options.autoPong;
        this._closeTimeout = options.closeTimeout;
        this._isServer = true;
      }
    }
    /**
     * For historical reasons, the custom "nodebuffer" type is used by the default
     * instead of "blob".
     *
     * @type {String}
     */
    get binaryType() {
      return this._binaryType;
    }
    set binaryType(type) {
      if (!BINARY_TYPES.includes(type)) return;
      this._binaryType = type;
      if (this._receiver) this._receiver._binaryType = type;
    }
    /**
     * @type {Number}
     */
    get bufferedAmount() {
      if (!this._socket) return this._bufferedAmount;
      return this._socket._writableState.length + this._sender._bufferedBytes;
    }
    /**
     * @type {String}
     */
    get extensions() {
      return Object.keys(this._extensions).join();
    }
    /**
     * @type {Boolean}
     */
    get isPaused() {
      return this._paused;
    }
    /**
     * @type {Function}
     */
    /* istanbul ignore next */
    get onclose() {
      return null;
    }
    /**
     * @type {Function}
     */
    /* istanbul ignore next */
    get onerror() {
      return null;
    }
    /**
     * @type {Function}
     */
    /* istanbul ignore next */
    get onopen() {
      return null;
    }
    /**
     * @type {Function}
     */
    /* istanbul ignore next */
    get onmessage() {
      return null;
    }
    /**
     * @type {String}
     */
    get protocol() {
      return this._protocol;
    }
    /**
     * @type {Number}
     */
    get readyState() {
      return this._readyState;
    }
    /**
     * @type {String}
     */
    get url() {
      return this._url;
    }
    /**
     * Set up the socket and the internal resources.
     *
     * @param {Duplex} socket The network socket between the server and client
     * @param {Buffer} head The first packet of the upgraded stream
     * @param {Object} options Options object
     * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
     *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
     *     multiple times in the same tick
     * @param {Function} [options.generateMask] The function used to generate the
     *     masking key
     * @param {Number} [options.maxPayload=0] The maximum allowed message size
     * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
     *     not to skip UTF-8 validation for text and close messages
     * @private
     */
    setSocket(socket, head, options) {
      const receiver2 = new Receiver({
        allowSynchronousEvents: options.allowSynchronousEvents,
        binaryType: this.binaryType,
        extensions: this._extensions,
        isServer: this._isServer,
        maxPayload: options.maxPayload,
        skipUTF8Validation: options.skipUTF8Validation
      });
      const sender2 = new Sender(socket, this._extensions, options.generateMask);
      this._receiver = receiver2;
      this._sender = sender2;
      this._socket = socket;
      receiver2[kWebSocket] = this;
      sender2[kWebSocket] = this;
      socket[kWebSocket] = this;
      receiver2.on("conclude", receiverOnConclude);
      receiver2.on("drain", receiverOnDrain);
      receiver2.on("error", receiverOnError);
      receiver2.on("message", receiverOnMessage);
      receiver2.on("ping", receiverOnPing);
      receiver2.on("pong", receiverOnPong);
      sender2.onerror = senderOnError;
      if (socket.setTimeout) socket.setTimeout(0);
      if (socket.setNoDelay) socket.setNoDelay();
      if (head.length > 0) socket.unshift(head);
      socket.on("close", socketOnClose);
      socket.on("data", socketOnData);
      socket.on("end", socketOnEnd);
      socket.on("error", socketOnError);
      this._readyState = WebSocket2.OPEN;
      this.emit("open");
    }
    /**
     * Emit the `'close'` event.
     *
     * @private
     */
    emitClose() {
      if (!this._socket) {
        this._readyState = WebSocket2.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
        return;
      }
      if (this._extensions[PerMessageDeflate.extensionName]) {
        this._extensions[PerMessageDeflate.extensionName].cleanup();
      }
      this._receiver.removeAllListeners();
      this._readyState = WebSocket2.CLOSED;
      this.emit("close", this._closeCode, this._closeMessage);
    }
    /**
     * Start a closing handshake.
     *
     *          +----------+   +-----------+   +----------+
     *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
     *    |     +----------+   +-----------+   +----------+     |
     *          +----------+   +-----------+         |
     * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
     *          +----------+   +-----------+   |
     *    |           |                        |   +---+        |
     *                +------------------------+-->|fin| - - - -
     *    |         +---+                      |   +---+
     *     - - - - -|fin|<---------------------+
     *              +---+
     *
     * @param {Number} [code] Status code explaining why the connection is closing
     * @param {(String|Buffer)} [data] The reason why the connection is
     *     closing
     * @public
     */
    close(code, data) {
      if (this.readyState === WebSocket2.CLOSED) return;
      if (this.readyState === WebSocket2.CONNECTING) {
        const msg = "WebSocket was closed before the connection was established";
        abortHandshake(this, this._req, msg);
        return;
      }
      if (this.readyState === WebSocket2.CLOSING) {
        if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
          this._socket.end();
        }
        return;
      }
      this._readyState = WebSocket2.CLOSING;
      this._sender.close(code, data, !this._isServer, (err) => {
        if (err) return;
        this._closeFrameSent = true;
        if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
          this._socket.end();
        }
      });
      setCloseTimer(this);
    }
    /**
     * Pause the socket.
     *
     * @public
     */
    pause() {
      if (this.readyState === WebSocket2.CONNECTING || this.readyState === WebSocket2.CLOSED) {
        return;
      }
      this._paused = true;
      this._socket.pause();
    }
    /**
     * Send a ping.
     *
     * @param {*} [data] The data to send
     * @param {Boolean} [mask] Indicates whether or not to mask `data`
     * @param {Function} [cb] Callback which is executed when the ping is sent
     * @public
     */
    ping(data, mask, cb) {
      if (this.readyState === WebSocket2.CONNECTING) {
        throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
      }
      if (typeof data === "function") {
        cb = data;
        data = mask = void 0;
      } else if (typeof mask === "function") {
        cb = mask;
        mask = void 0;
      }
      if (typeof data === "number") data = data.toString();
      if (this.readyState !== WebSocket2.OPEN) {
        sendAfterClose(this, data, cb);
        return;
      }
      if (mask === void 0) mask = !this._isServer;
      this._sender.ping(data || EMPTY_BUFFER, mask, cb);
    }
    /**
     * Send a pong.
     *
     * @param {*} [data] The data to send
     * @param {Boolean} [mask] Indicates whether or not to mask `data`
     * @param {Function} [cb] Callback which is executed when the pong is sent
     * @public
     */
    pong(data, mask, cb) {
      if (this.readyState === WebSocket2.CONNECTING) {
        throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
      }
      if (typeof data === "function") {
        cb = data;
        data = mask = void 0;
      } else if (typeof mask === "function") {
        cb = mask;
        mask = void 0;
      }
      if (typeof data === "number") data = data.toString();
      if (this.readyState !== WebSocket2.OPEN) {
        sendAfterClose(this, data, cb);
        return;
      }
      if (mask === void 0) mask = !this._isServer;
      this._sender.pong(data || EMPTY_BUFFER, mask, cb);
    }
    /**
     * Resume the socket.
     *
     * @public
     */
    resume() {
      if (this.readyState === WebSocket2.CONNECTING || this.readyState === WebSocket2.CLOSED) {
        return;
      }
      this._paused = false;
      if (!this._receiver._writableState.needDrain) this._socket.resume();
    }
    /**
     * Send a data message.
     *
     * @param {*} data The message to send
     * @param {Object} [options] Options object
     * @param {Boolean} [options.binary] Specifies whether `data` is binary or
     *     text
     * @param {Boolean} [options.compress] Specifies whether or not to compress
     *     `data`
     * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
     *     last one
     * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
     * @param {Function} [cb] Callback which is executed when data is written out
     * @public
     */
    send(data, options, cb) {
      if (this.readyState === WebSocket2.CONNECTING) {
        throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
      }
      if (typeof options === "function") {
        cb = options;
        options = {};
      }
      if (typeof data === "number") data = data.toString();
      if (this.readyState !== WebSocket2.OPEN) {
        sendAfterClose(this, data, cb);
        return;
      }
      const opts = {
        binary: typeof data !== "string",
        mask: !this._isServer,
        compress: true,
        fin: true,
        ...options
      };
      if (!this._extensions[PerMessageDeflate.extensionName]) {
        opts.compress = false;
      }
      this._sender.send(data || EMPTY_BUFFER, opts, cb);
    }
    /**
     * Forcibly close the connection.
     *
     * @public
     */
    terminate() {
      if (this.readyState === WebSocket2.CLOSED) return;
      if (this.readyState === WebSocket2.CONNECTING) {
        const msg = "WebSocket was closed before the connection was established";
        abortHandshake(this, this._req, msg);
        return;
      }
      if (this._socket) {
        this._readyState = WebSocket2.CLOSING;
        this._socket.destroy();
      }
    }
  }
  Object.defineProperty(WebSocket2, "CONNECTING", {
    enumerable: true,
    value: readyStates.indexOf("CONNECTING")
  });
  Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
    enumerable: true,
    value: readyStates.indexOf("CONNECTING")
  });
  Object.defineProperty(WebSocket2, "OPEN", {
    enumerable: true,
    value: readyStates.indexOf("OPEN")
  });
  Object.defineProperty(WebSocket2.prototype, "OPEN", {
    enumerable: true,
    value: readyStates.indexOf("OPEN")
  });
  Object.defineProperty(WebSocket2, "CLOSING", {
    enumerable: true,
    value: readyStates.indexOf("CLOSING")
  });
  Object.defineProperty(WebSocket2.prototype, "CLOSING", {
    enumerable: true,
    value: readyStates.indexOf("CLOSING")
  });
  Object.defineProperty(WebSocket2, "CLOSED", {
    enumerable: true,
    value: readyStates.indexOf("CLOSED")
  });
  Object.defineProperty(WebSocket2.prototype, "CLOSED", {
    enumerable: true,
    value: readyStates.indexOf("CLOSED")
  });
  [
    "binaryType",
    "bufferedAmount",
    "extensions",
    "isPaused",
    "protocol",
    "readyState",
    "url"
  ].forEach((property) => {
    Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
  });
  ["open", "error", "close", "message"].forEach((method) => {
    Object.defineProperty(WebSocket2.prototype, `on${method}`, {
      enumerable: true,
      get() {
        for (const listener of this.listeners(method)) {
          if (listener[kForOnEventAttribute]) return listener[kListener];
        }
        return null;
      },
      set(handler) {
        for (const listener of this.listeners(method)) {
          if (listener[kForOnEventAttribute]) {
            this.removeListener(method, listener);
            break;
          }
        }
        if (typeof handler !== "function") return;
        this.addEventListener(method, handler, {
          [kForOnEventAttribute]: true
        });
      }
    });
  });
  WebSocket2.prototype.addEventListener = addEventListener;
  WebSocket2.prototype.removeEventListener = removeEventListener;
  websocket = WebSocket2;
  function initAsClient(websocket2, address, protocols, options) {
    const opts = {
      allowSynchronousEvents: true,
      autoPong: true,
      closeTimeout: CLOSE_TIMEOUT,
      protocolVersion: protocolVersions[1],
      maxPayload: 100 * 1024 * 1024,
      skipUTF8Validation: false,
      perMessageDeflate: true,
      followRedirects: false,
      maxRedirects: 10,
      ...options,
      socketPath: void 0,
      hostname: void 0,
      protocol: void 0,
      timeout: void 0,
      method: "GET",
      host: void 0,
      path: void 0,
      port: void 0
    };
    websocket2._autoPong = opts.autoPong;
    websocket2._closeTimeout = opts.closeTimeout;
    if (!protocolVersions.includes(opts.protocolVersion)) {
      throw new RangeError(
        `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
      );
    }
    let parsedUrl;
    if (address instanceof URL) {
      parsedUrl = address;
    } else {
      try {
        parsedUrl = new URL(address);
      } catch (e) {
        throw new SyntaxError(`Invalid URL: ${address}`);
      }
    }
    if (parsedUrl.protocol === "http:") {
      parsedUrl.protocol = "ws:";
    } else if (parsedUrl.protocol === "https:") {
      parsedUrl.protocol = "wss:";
    }
    websocket2._url = parsedUrl.href;
    const isSecure = parsedUrl.protocol === "wss:";
    const isIpcUrl = parsedUrl.protocol === "ws+unix:";
    let invalidUrlMessage;
    if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
      invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
    } else if (isIpcUrl && !parsedUrl.pathname) {
      invalidUrlMessage = "The URL's pathname is empty";
    } else if (parsedUrl.hash) {
      invalidUrlMessage = "The URL contains a fragment identifier";
    }
    if (invalidUrlMessage) {
      const err = new SyntaxError(invalidUrlMessage);
      if (websocket2._redirects === 0) {
        throw err;
      } else {
        emitErrorAndClose(websocket2, err);
        return;
      }
    }
    const defaultPort = isSecure ? 443 : 80;
    const key = randomBytes(16).toString("base64");
    const request = isSecure ? https.request : http.request;
    const protocolSet = /* @__PURE__ */ new Set();
    let perMessageDeflate;
    opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
    opts.defaultPort = opts.defaultPort || defaultPort;
    opts.port = parsedUrl.port || defaultPort;
    opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
    opts.headers = {
      ...opts.headers,
      "Sec-WebSocket-Version": opts.protocolVersion,
      "Sec-WebSocket-Key": key,
      Connection: "Upgrade",
      Upgrade: "websocket"
    };
    opts.path = parsedUrl.pathname + parsedUrl.search;
    opts.timeout = opts.handshakeTimeout;
    if (opts.perMessageDeflate) {
      perMessageDeflate = new PerMessageDeflate(
        opts.perMessageDeflate !== true ? opts.perMessageDeflate : {},
        false,
        opts.maxPayload
      );
      opts.headers["Sec-WebSocket-Extensions"] = format({
        [PerMessageDeflate.extensionName]: perMessageDeflate.offer()
      });
    }
    if (protocols.length) {
      for (const protocol of protocols) {
        if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
          throw new SyntaxError(
            "An invalid or duplicated subprotocol was specified"
          );
        }
        protocolSet.add(protocol);
      }
      opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
    }
    if (opts.origin) {
      if (opts.protocolVersion < 13) {
        opts.headers["Sec-WebSocket-Origin"] = opts.origin;
      } else {
        opts.headers.Origin = opts.origin;
      }
    }
    if (parsedUrl.username || parsedUrl.password) {
      opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
    }
    if (isIpcUrl) {
      const parts = opts.path.split(":");
      opts.socketPath = parts[0];
      opts.path = parts[1];
    }
    let req;
    if (opts.followRedirects) {
      if (websocket2._redirects === 0) {
        websocket2._originalIpc = isIpcUrl;
        websocket2._originalSecure = isSecure;
        websocket2._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
        const headers = options && options.headers;
        options = { ...options, headers: {} };
        if (headers) {
          for (const [key2, value] of Object.entries(headers)) {
            options.headers[key2.toLowerCase()] = value;
          }
        }
      } else if (websocket2.listenerCount("redirect") === 0) {
        const isSameHost = isIpcUrl ? websocket2._originalIpc ? opts.socketPath === websocket2._originalHostOrSocketPath : false : websocket2._originalIpc ? false : parsedUrl.host === websocket2._originalHostOrSocketPath;
        if (!isSameHost || websocket2._originalSecure && !isSecure) {
          delete opts.headers.authorization;
          delete opts.headers.cookie;
          if (!isSameHost) delete opts.headers.host;
          opts.auth = void 0;
        }
      }
      if (opts.auth && !options.headers.authorization) {
        options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
      }
      req = websocket2._req = request(opts);
      if (websocket2._redirects) {
        websocket2.emit("redirect", websocket2.url, req);
      }
    } else {
      req = websocket2._req = request(opts);
    }
    if (opts.timeout) {
      req.on("timeout", () => {
        abortHandshake(websocket2, req, "Opening handshake has timed out");
      });
    }
    req.on("error", (err) => {
      if (req === null || req[kAborted]) return;
      req = websocket2._req = null;
      emitErrorAndClose(websocket2, err);
    });
    req.on("response", (res) => {
      const location = res.headers.location;
      const statusCode = res.statusCode;
      if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
        if (++websocket2._redirects > opts.maxRedirects) {
          abortHandshake(websocket2, req, "Maximum redirects exceeded");
          return;
        }
        req.abort();
        let addr;
        try {
          addr = new URL(location, address);
        } catch (e) {
          const err = new SyntaxError(`Invalid URL: ${location}`);
          emitErrorAndClose(websocket2, err);
          return;
        }
        initAsClient(websocket2, addr, protocols, options);
      } else if (!websocket2.emit("unexpected-response", req, res)) {
        abortHandshake(
          websocket2,
          req,
          `Unexpected server response: ${res.statusCode}`
        );
      }
    });
    req.on("upgrade", (res, socket, head) => {
      websocket2.emit("upgrade", res);
      if (websocket2.readyState !== WebSocket2.CONNECTING) return;
      req = websocket2._req = null;
      const upgrade = res.headers.upgrade;
      if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
        abortHandshake(websocket2, socket, "Invalid Upgrade header");
        return;
      }
      const digest = createHash("sha1").update(key + GUID).digest("base64");
      if (res.headers["sec-websocket-accept"] !== digest) {
        abortHandshake(websocket2, socket, "Invalid Sec-WebSocket-Accept header");
        return;
      }
      const serverProt = res.headers["sec-websocket-protocol"];
      let protError;
      if (serverProt !== void 0) {
        if (!protocolSet.size) {
          protError = "Server sent a subprotocol but none was requested";
        } else if (!protocolSet.has(serverProt)) {
          protError = "Server sent an invalid subprotocol";
        }
      } else if (protocolSet.size) {
        protError = "Server sent no subprotocol";
      }
      if (protError) {
        abortHandshake(websocket2, socket, protError);
        return;
      }
      if (serverProt) websocket2._protocol = serverProt;
      const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
      if (secWebSocketExtensions !== void 0) {
        if (!perMessageDeflate) {
          const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
          abortHandshake(websocket2, socket, message);
          return;
        }
        let extensions;
        try {
          extensions = parse(secWebSocketExtensions);
        } catch (err) {
          const message = "Invalid Sec-WebSocket-Extensions header";
          abortHandshake(websocket2, socket, message);
          return;
        }
        const extensionNames = Object.keys(extensions);
        if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate.extensionName) {
          const message = "Server indicated an extension that was not requested";
          abortHandshake(websocket2, socket, message);
          return;
        }
        try {
          perMessageDeflate.accept(extensions[PerMessageDeflate.extensionName]);
        } catch (err) {
          const message = "Invalid Sec-WebSocket-Extensions header";
          abortHandshake(websocket2, socket, message);
          return;
        }
        websocket2._extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
      }
      websocket2.setSocket(socket, head, {
        allowSynchronousEvents: opts.allowSynchronousEvents,
        generateMask: opts.generateMask,
        maxPayload: opts.maxPayload,
        skipUTF8Validation: opts.skipUTF8Validation
      });
    });
    if (opts.finishRequest) {
      opts.finishRequest(req, websocket2);
    } else {
      req.end();
    }
  }
  function emitErrorAndClose(websocket2, err) {
    websocket2._readyState = WebSocket2.CLOSING;
    websocket2._errorEmitted = true;
    websocket2.emit("error", err);
    websocket2.emitClose();
  }
  function netConnect(options) {
    options.path = options.socketPath;
    return net.connect(options);
  }
  function tlsConnect(options) {
    options.path = void 0;
    if (!options.servername && options.servername !== "") {
      options.servername = net.isIP(options.host) ? "" : options.host;
    }
    return tls.connect(options);
  }
  function abortHandshake(websocket2, stream2, message) {
    websocket2._readyState = WebSocket2.CLOSING;
    const err = new Error(message);
    Error.captureStackTrace(err, abortHandshake);
    if (stream2.setHeader) {
      stream2[kAborted] = true;
      stream2.abort();
      if (stream2.socket && !stream2.socket.destroyed) {
        stream2.socket.destroy();
      }
      process.nextTick(emitErrorAndClose, websocket2, err);
    } else {
      stream2.destroy(err);
      stream2.once("error", websocket2.emit.bind(websocket2, "error"));
      stream2.once("close", websocket2.emitClose.bind(websocket2));
    }
  }
  function sendAfterClose(websocket2, data, cb) {
    if (data) {
      const length = isBlob(data) ? data.size : toBuffer(data).length;
      if (websocket2._socket) websocket2._sender._bufferedBytes += length;
      else websocket2._bufferedAmount += length;
    }
    if (cb) {
      const err = new Error(
        `WebSocket is not open: readyState ${websocket2.readyState} (${readyStates[websocket2.readyState]})`
      );
      process.nextTick(cb, err);
    }
  }
  function receiverOnConclude(code, reason) {
    const websocket2 = this[kWebSocket];
    websocket2._closeFrameReceived = true;
    websocket2._closeMessage = reason;
    websocket2._closeCode = code;
    if (websocket2._socket[kWebSocket] === void 0) return;
    websocket2._socket.removeListener("data", socketOnData);
    process.nextTick(resume, websocket2._socket);
    if (code === 1005) websocket2.close();
    else websocket2.close(code, reason);
  }
  function receiverOnDrain() {
    const websocket2 = this[kWebSocket];
    if (!websocket2.isPaused) websocket2._socket.resume();
  }
  function receiverOnError(err) {
    const websocket2 = this[kWebSocket];
    if (websocket2._socket[kWebSocket] !== void 0) {
      websocket2._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket2._socket);
      websocket2.close(err[kStatusCode]);
    }
    if (!websocket2._errorEmitted) {
      websocket2._errorEmitted = true;
      websocket2.emit("error", err);
    }
  }
  function receiverOnFinish() {
    this[kWebSocket].emitClose();
  }
  function receiverOnMessage(data, isBinary) {
    this[kWebSocket].emit("message", data, isBinary);
  }
  function receiverOnPing(data) {
    const websocket2 = this[kWebSocket];
    if (websocket2._autoPong) websocket2.pong(data, !this._isServer, NOOP);
    websocket2.emit("ping", data);
  }
  function receiverOnPong(data) {
    this[kWebSocket].emit("pong", data);
  }
  function resume(stream2) {
    stream2.resume();
  }
  function senderOnError(err) {
    const websocket2 = this[kWebSocket];
    if (websocket2.readyState === WebSocket2.CLOSED) return;
    if (websocket2.readyState === WebSocket2.OPEN) {
      websocket2._readyState = WebSocket2.CLOSING;
      setCloseTimer(websocket2);
    }
    this._socket.end();
    if (!websocket2._errorEmitted) {
      websocket2._errorEmitted = true;
      websocket2.emit("error", err);
    }
  }
  function setCloseTimer(websocket2) {
    websocket2._closeTimer = setTimeout(
      websocket2._socket.destroy.bind(websocket2._socket),
      websocket2._closeTimeout
    );
  }
  function socketOnClose() {
    const websocket2 = this[kWebSocket];
    this.removeListener("close", socketOnClose);
    this.removeListener("data", socketOnData);
    this.removeListener("end", socketOnEnd);
    websocket2._readyState = WebSocket2.CLOSING;
    if (!this._readableState.endEmitted && !websocket2._closeFrameReceived && !websocket2._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
      const chunk = this.read(this._readableState.length);
      websocket2._receiver.write(chunk);
    }
    websocket2._receiver.end();
    this[kWebSocket] = void 0;
    clearTimeout(websocket2._closeTimer);
    if (websocket2._receiver._writableState.finished || websocket2._receiver._writableState.errorEmitted) {
      websocket2.emitClose();
    } else {
      websocket2._receiver.on("error", receiverOnFinish);
      websocket2._receiver.on("finish", receiverOnFinish);
    }
  }
  function socketOnData(chunk) {
    if (!this[kWebSocket]._receiver.write(chunk)) {
      this.pause();
    }
  }
  function socketOnEnd() {
    const websocket2 = this[kWebSocket];
    websocket2._readyState = WebSocket2.CLOSING;
    websocket2._receiver.end();
    this.end();
  }
  function socketOnError() {
    const websocket2 = this[kWebSocket];
    this.removeListener("error", socketOnError);
    this.on("error", NOOP);
    if (websocket2) {
      websocket2._readyState = WebSocket2.CLOSING;
      this.destroy();
    }
  }
  return websocket;
}
var stream;
var hasRequiredStream;
function requireStream() {
  if (hasRequiredStream) return stream;
  hasRequiredStream = 1;
  requireWebsocket();
  const { Duplex } = require$$0$3;
  function emitClose(stream2) {
    stream2.emit("close");
  }
  function duplexOnEnd() {
    if (!this.destroyed && this._writableState.finished) {
      this.destroy();
    }
  }
  function duplexOnError(err) {
    this.removeListener("error", duplexOnError);
    this.destroy();
    if (this.listenerCount("error") === 0) {
      this.emit("error", err);
    }
  }
  function createWebSocketStream(ws, options) {
    let terminateOnDestroy = true;
    const duplex = new Duplex({
      ...options,
      autoDestroy: false,
      emitClose: false,
      objectMode: false,
      writableObjectMode: false
    });
    ws.on("message", function message(msg, isBinary) {
      const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
      if (!duplex.push(data)) ws.pause();
    });
    ws.once("error", function error(err) {
      if (duplex.destroyed) return;
      terminateOnDestroy = false;
      duplex.destroy(err);
    });
    ws.once("close", function close() {
      if (duplex.destroyed) return;
      duplex.push(null);
    });
    duplex._destroy = function(err, callback) {
      if (ws.readyState === ws.CLOSED) {
        callback(err);
        process.nextTick(emitClose, duplex);
        return;
      }
      let called = false;
      ws.once("error", function error(err2) {
        called = true;
        callback(err2);
      });
      ws.once("close", function close() {
        if (!called) callback(err);
        process.nextTick(emitClose, duplex);
      });
      if (terminateOnDestroy) ws.terminate();
    };
    duplex._final = function(callback) {
      if (ws.readyState === ws.CONNECTING) {
        ws.once("open", function open() {
          duplex._final(callback);
        });
        return;
      }
      if (ws._socket === null) return;
      if (ws._socket._writableState.finished) {
        callback();
        if (duplex._readableState.endEmitted) duplex.destroy();
      } else {
        ws._socket.once("finish", function finish() {
          callback();
        });
        ws.close();
      }
    };
    duplex._read = function() {
      if (ws.isPaused) ws.resume();
    };
    duplex._write = function(chunk, encoding, callback) {
      if (ws.readyState === ws.CONNECTING) {
        ws.once("open", function open() {
          duplex._write(chunk, encoding, callback);
        });
        return;
      }
      ws.send(chunk, callback);
    };
    duplex.on("end", duplexOnEnd);
    duplex.on("error", duplexOnError);
    return duplex;
  }
  stream = createWebSocketStream;
  return stream;
}
requireStream();
requireReceiver();
requireSender();
var websocketExports = requireWebsocket();
const WebSocket = /* @__PURE__ */ getDefaultExportFromCjs(websocketExports);
var subprotocol;
var hasRequiredSubprotocol;
function requireSubprotocol() {
  if (hasRequiredSubprotocol) return subprotocol;
  hasRequiredSubprotocol = 1;
  const { tokenChars } = requireValidation();
  function parse(header) {
    const protocols = /* @__PURE__ */ new Set();
    let start = -1;
    let end = -1;
    let i = 0;
    for (i; i < header.length; i++) {
      const code = header.charCodeAt(i);
      if (end === -1 && tokenChars[code] === 1) {
        if (start === -1) start = i;
      } else if (i !== 0 && (code === 32 || code === 9)) {
        if (end === -1 && start !== -1) end = i;
      } else if (code === 44) {
        if (start === -1) {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
        if (end === -1) end = i;
        const protocol2 = header.slice(start, end);
        if (protocols.has(protocol2)) {
          throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
        }
        protocols.add(protocol2);
        start = end = -1;
      } else {
        throw new SyntaxError(`Unexpected character at index ${i}`);
      }
    }
    if (start === -1 || end !== -1) {
      throw new SyntaxError("Unexpected end of input");
    }
    const protocol = header.slice(start, i);
    if (protocols.has(protocol)) {
      throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
    }
    protocols.add(protocol);
    return protocols;
  }
  subprotocol = { parse };
  return subprotocol;
}
var websocketServer;
var hasRequiredWebsocketServer;
function requireWebsocketServer() {
  if (hasRequiredWebsocketServer) return websocketServer;
  hasRequiredWebsocketServer = 1;
  const EventEmitter = require$$0$4;
  const http = require$$2;
  const { Duplex } = require$$0$3;
  const { createHash } = require$$1;
  const extension2 = requireExtension();
  const PerMessageDeflate = requirePermessageDeflate();
  const subprotocol2 = requireSubprotocol();
  const WebSocket2 = requireWebsocket();
  const { CLOSE_TIMEOUT, GUID, kWebSocket } = requireConstants();
  const keyRegex = /^[+/0-9A-Za-z]{22}==$/;
  const RUNNING = 0;
  const CLOSING = 1;
  const CLOSED = 2;
  class WebSocketServer2 extends EventEmitter {
    /**
     * Create a `WebSocketServer` instance.
     *
     * @param {Object} options Configuration options
     * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
     *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
     *     multiple times in the same tick
     * @param {Boolean} [options.autoPong=true] Specifies whether or not to
     *     automatically send a pong in response to a ping
     * @param {Number} [options.backlog=511] The maximum length of the queue of
     *     pending connections
     * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
     *     track clients
     * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
     *     wait for the closing handshake to finish after `websocket.close()` is
     *     called
     * @param {Function} [options.handleProtocols] A hook to handle protocols
     * @param {String} [options.host] The hostname where to bind the server
     * @param {Number} [options.maxPayload=104857600] The maximum allowed message
     *     size
     * @param {Boolean} [options.noServer=false] Enable no server mode
     * @param {String} [options.path] Accept only connections matching this path
     * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
     *     permessage-deflate
     * @param {Number} [options.port] The port where to bind the server
     * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
     *     server to use
     * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
     *     not to skip UTF-8 validation for text and close messages
     * @param {Function} [options.verifyClient] A hook to reject connections
     * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
     *     class to use. It must be the `WebSocket` class or class that extends it
     * @param {Function} [callback] A listener for the `listening` event
     */
    constructor(options, callback) {
      super();
      options = {
        allowSynchronousEvents: true,
        autoPong: true,
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: false,
        handleProtocols: null,
        clientTracking: true,
        closeTimeout: CLOSE_TIMEOUT,
        verifyClient: null,
        noServer: false,
        backlog: null,
        // use default (511 as implemented in net.js)
        server: null,
        host: null,
        path: null,
        port: null,
        WebSocket: WebSocket2,
        ...options
      };
      if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
        throw new TypeError(
          'One and only one of the "port", "server", or "noServer" options must be specified'
        );
      }
      if (options.port != null) {
        this._server = http.createServer((req, res) => {
          const body = http.STATUS_CODES[426];
          res.writeHead(426, {
            "Content-Length": body.length,
            "Content-Type": "text/plain"
          });
          res.end(body);
        });
        this._server.listen(
          options.port,
          options.host,
          options.backlog,
          callback
        );
      } else if (options.server) {
        this._server = options.server;
      }
      if (this._server) {
        const emitConnection = this.emit.bind(this, "connection");
        this._removeListeners = addListeners(this._server, {
          listening: this.emit.bind(this, "listening"),
          error: this.emit.bind(this, "error"),
          upgrade: (req, socket, head) => {
            this.handleUpgrade(req, socket, head, emitConnection);
          }
        });
      }
      if (options.perMessageDeflate === true) options.perMessageDeflate = {};
      if (options.clientTracking) {
        this.clients = /* @__PURE__ */ new Set();
        this._shouldEmitClose = false;
      }
      this.options = options;
      this._state = RUNNING;
    }
    /**
     * Returns the bound address, the address family name, and port of the server
     * as reported by the operating system if listening on an IP socket.
     * If the server is listening on a pipe or UNIX domain socket, the name is
     * returned as a string.
     *
     * @return {(Object|String|null)} The address of the server
     * @public
     */
    address() {
      if (this.options.noServer) {
        throw new Error('The server is operating in "noServer" mode');
      }
      if (!this._server) return null;
      return this._server.address();
    }
    /**
     * Stop the server from accepting new connections and emit the `'close'` event
     * when all existing connections are closed.
     *
     * @param {Function} [cb] A one-time listener for the `'close'` event
     * @public
     */
    close(cb) {
      if (this._state === CLOSED) {
        if (cb) {
          this.once("close", () => {
            cb(new Error("The server is not running"));
          });
        }
        process.nextTick(emitClose, this);
        return;
      }
      if (cb) this.once("close", cb);
      if (this._state === CLOSING) return;
      this._state = CLOSING;
      if (this.options.noServer || this.options.server) {
        if (this._server) {
          this._removeListeners();
          this._removeListeners = this._server = null;
        }
        if (this.clients) {
          if (!this.clients.size) {
            process.nextTick(emitClose, this);
          } else {
            this._shouldEmitClose = true;
          }
        } else {
          process.nextTick(emitClose, this);
        }
      } else {
        const server = this._server;
        this._removeListeners();
        this._removeListeners = this._server = null;
        server.close(() => {
          emitClose(this);
        });
      }
    }
    /**
     * See if a given request should be handled by this server instance.
     *
     * @param {http.IncomingMessage} req Request object to inspect
     * @return {Boolean} `true` if the request is valid, else `false`
     * @public
     */
    shouldHandle(req) {
      if (this.options.path) {
        const index = req.url.indexOf("?");
        const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
        if (pathname !== this.options.path) return false;
      }
      return true;
    }
    /**
     * Handle a HTTP Upgrade request.
     *
     * @param {http.IncomingMessage} req The request object
     * @param {Duplex} socket The network socket between the server and client
     * @param {Buffer} head The first packet of the upgraded stream
     * @param {Function} cb Callback
     * @public
     */
    handleUpgrade(req, socket, head, cb) {
      socket.on("error", socketOnError);
      const key = req.headers["sec-websocket-key"];
      const upgrade = req.headers.upgrade;
      const version = +req.headers["sec-websocket-version"];
      if (req.method !== "GET") {
        const message = "Invalid HTTP method";
        abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
        return;
      }
      if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
        const message = "Invalid Upgrade header";
        abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
        return;
      }
      if (key === void 0 || !keyRegex.test(key)) {
        const message = "Missing or invalid Sec-WebSocket-Key header";
        abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
        return;
      }
      if (version !== 13 && version !== 8) {
        const message = "Missing or invalid Sec-WebSocket-Version header";
        abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
          "Sec-WebSocket-Version": "13, 8"
        });
        return;
      }
      if (!this.shouldHandle(req)) {
        abortHandshake(socket, 400);
        return;
      }
      const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
      let protocols = /* @__PURE__ */ new Set();
      if (secWebSocketProtocol !== void 0) {
        try {
          protocols = subprotocol2.parse(secWebSocketProtocol);
        } catch (err) {
          const message = "Invalid Sec-WebSocket-Protocol header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
      }
      const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
      const extensions = {};
      if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
        const perMessageDeflate = new PerMessageDeflate(
          this.options.perMessageDeflate,
          true,
          this.options.maxPayload
        );
        try {
          const offers = extension2.parse(secWebSocketExtensions);
          if (offers[PerMessageDeflate.extensionName]) {
            perMessageDeflate.accept(offers[PerMessageDeflate.extensionName]);
            extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
          }
        } catch (err) {
          const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
      }
      if (this.options.verifyClient) {
        const info = {
          origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
          secure: !!(req.socket.authorized || req.socket.encrypted),
          req
        };
        if (this.options.verifyClient.length === 2) {
          this.options.verifyClient(info, (verified, code, message, headers) => {
            if (!verified) {
              return abortHandshake(socket, code || 401, message, headers);
            }
            this.completeUpgrade(
              extensions,
              key,
              protocols,
              req,
              socket,
              head,
              cb
            );
          });
          return;
        }
        if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
      }
      this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
    }
    /**
     * Upgrade the connection to WebSocket.
     *
     * @param {Object} extensions The accepted extensions
     * @param {String} key The value of the `Sec-WebSocket-Key` header
     * @param {Set} protocols The subprotocols
     * @param {http.IncomingMessage} req The request object
     * @param {Duplex} socket The network socket between the server and client
     * @param {Buffer} head The first packet of the upgraded stream
     * @param {Function} cb Callback
     * @throws {Error} If called more than once with the same socket
     * @private
     */
    completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
      if (!socket.readable || !socket.writable) return socket.destroy();
      if (socket[kWebSocket]) {
        throw new Error(
          "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
        );
      }
      if (this._state > RUNNING) return abortHandshake(socket, 503);
      const digest = createHash("sha1").update(key + GUID).digest("base64");
      const headers = [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${digest}`
      ];
      const ws = new this.options.WebSocket(null, void 0, this.options);
      if (protocols.size) {
        const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
        if (protocol) {
          headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
          ws._protocol = protocol;
        }
      }
      if (extensions[PerMessageDeflate.extensionName]) {
        const params = extensions[PerMessageDeflate.extensionName].params;
        const value = extension2.format({
          [PerMessageDeflate.extensionName]: [params]
        });
        headers.push(`Sec-WebSocket-Extensions: ${value}`);
        ws._extensions = extensions;
      }
      this.emit("headers", headers, req);
      socket.write(headers.concat("\r\n").join("\r\n"));
      socket.removeListener("error", socketOnError);
      ws.setSocket(socket, head, {
        allowSynchronousEvents: this.options.allowSynchronousEvents,
        maxPayload: this.options.maxPayload,
        skipUTF8Validation: this.options.skipUTF8Validation
      });
      if (this.clients) {
        this.clients.add(ws);
        ws.on("close", () => {
          this.clients.delete(ws);
          if (this._shouldEmitClose && !this.clients.size) {
            process.nextTick(emitClose, this);
          }
        });
      }
      cb(ws, req);
    }
  }
  websocketServer = WebSocketServer2;
  function addListeners(server, map) {
    for (const event of Object.keys(map)) server.on(event, map[event]);
    return function removeListeners() {
      for (const event of Object.keys(map)) {
        server.removeListener(event, map[event]);
      }
    };
  }
  function emitClose(server) {
    server._state = CLOSED;
    server.emit("close");
  }
  function socketOnError() {
    this.destroy();
  }
  function abortHandshake(socket, code, message, headers) {
    message = message || http.STATUS_CODES[code];
    headers = {
      Connection: "close",
      "Content-Type": "text/html",
      "Content-Length": Buffer.byteLength(message),
      ...headers
    };
    socket.once("finish", socket.destroy);
    socket.end(
      `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
    );
  }
  function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
    if (server.listenerCount("wsClientError")) {
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
      server.emit("wsClientError", err, socket, req);
    } else {
      abortHandshake(socket, code, message, headers);
    }
  }
  return websocketServer;
}
var websocketServerExports = requireWebsocketServer();
const WebSocketServer = /* @__PURE__ */ getDefaultExportFromCjs(websocketServerExports);
const VALID_MESSAGE_TYPES = /* @__PURE__ */ new Set([
  "PEER_HELLO",
  "PEER_BYE",
  "DELTA_PUSH",
  "DELTA_ACK",
  "SYNC_REQUEST",
  "CONFLICT_NOTIFY",
  "MERGE_ACCEPT",
  "MERGE_REJECT"
]);
const MESSAGE_FIELD_SPECS = {
  PEER_HELLO: {
    nodeId: "string",
    displayName: "string",
    nodeCount: "number",
    nodeIndex: "number",
    timestamp: "string"
  },
  PEER_BYE: {
    nodeId: "string",
    timestamp: "string"
  },
  DELTA_PUSH: {
    eventId: "string",
    nodeId: "string",
    fileId: "number",
    deltaBase64: "string",
    logicalTimestamp: "number",
    vectorClockJson: "object",
    timestamp: "string"
  },
  DELTA_ACK: {
    eventId: "string",
    nodeId: "string",
    fileId: "number",
    timestamp: "string"
  },
  SYNC_REQUEST: {
    nodeId: "string",
    fileId: "number",
    sinceTimestamp: "number",
    timestamp: "string"
  },
  CONFLICT_NOTIFY: {
    conflictId: "string",
    fileId: "number",
    eventIdA: "string",
    nodeIdA: "string",
    eventIdB: "string",
    nodeIdB: "string",
    summary: "string",
    timestamp: "string"
  },
  MERGE_ACCEPT: {
    conflictId: "string",
    fileId: "number",
    winner: "string",
    winnerPayload: "string",
    resolutionEventId: "string",
    resolvedBy: "string",
    logicalTimestamp: "number",
    vectorClockJson: "object",
    timestamp: "string"
  },
  MERGE_REJECT: {
    conflictId: "string",
    fileId: "number",
    reason: "string",
    rejectedBy: "string",
    timestamp: "string"
  }
};
function validateMessage(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, error: "Invalid JSON." };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { valid: false, error: "Message must be a JSON object." };
  }
  const obj = parsed;
  if (typeof obj["type"] !== "string") {
    return { valid: false, error: 'Missing or non-string "type" field.' };
  }
  const msgType = obj["type"];
  if (!VALID_MESSAGE_TYPES.has(msgType)) {
    return {
      valid: false,
      error: `Unknown message type "${msgType}". Expected one of: ${[...VALID_MESSAGE_TYPES].join(", ")}.`
    };
  }
  const spec = MESSAGE_FIELD_SPECS[msgType];
  for (const [field, expectedType] of Object.entries(spec)) {
    const actual = typeof obj[field];
    if (actual !== expectedType) {
      return {
        valid: false,
        error: `Field "${field}" must be ${expectedType}, got ${actual} in ${msgType} message.`
      };
    }
  }
  if (msgType === "MERGE_ACCEPT") {
    const winner = obj["winner"];
    if (winner !== "A" && winner !== "B") {
      return {
        valid: false,
        error: `MERGE_ACCEPT "winner" must be "A" or "B", got "${winner}".`
      };
    }
  }
  if (msgType === "DELTA_PUSH") {
    const vcj = obj["vectorClockJson"];
    if (typeof vcj["nodeCount"] !== "number" || typeof vcj["nodeIndex"] !== "number") {
      return {
        valid: false,
        error: "DELTA_PUSH vectorClockJson must have numeric nodeCount and nodeIndex."
      };
    }
  }
  if (msgType === "MERGE_ACCEPT") {
    const vcj = obj["vectorClockJson"];
    if (typeof vcj["nodeCount"] !== "number" || typeof vcj["nodeIndex"] !== "number") {
      return {
        valid: false,
        error: "MERGE_ACCEPT vectorClockJson must have numeric nodeCount and nodeIndex."
      };
    }
  }
  if (msgType === "PEER_HELLO") {
    const nodeCount = obj["nodeCount"];
    const nodeIndex = obj["nodeIndex"];
    if (nodeCount < 1 || nodeIndex < 0 || nodeIndex >= nodeCount) {
      return {
        valid: false,
        error: `PEER_HELLO nodeIndex (${nodeIndex}) must be in [0, ${nodeCount - 1}].`
      };
    }
  }
  return { valid: true, message: parsed };
}
function serialiseMessage(message) {
  return JSON.stringify(message);
}
const MAX_MESSAGES_PER_SECOND = 10;
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 3e4;
const HEARTBEAT_INTERVAL_MS = 3e4;
class PeerManager {
  /**
   * @param config - The peer manager configuration.
   */
  constructor(config) {
    /** Configuration. @internal */
    __publicField(this, "config");
    /** All currently connected peers. @internal */
    __publicField(this, "peers", /* @__PURE__ */ new Map());
    /** Rate limiter state per socket. @internal */
    __publicField(this, "rateLimiters", /* @__PURE__ */ new Map());
    /** The WebSocket server instance (if started). @internal */
    __publicField(this, "server", null);
    /** Heartbeat interval handle. @internal */
    __publicField(this, "heartbeatTimer", null);
    /** Rate limiter cleanup interval handle. @internal */
    __publicField(this, "cleanupTimer", null);
    this.config = config;
  }
  // ── Server ──────────────────────────────────────────────────────────
  /**
   * Starts a WebSocket server on the given port to accept inbound
   * peer connections.
   *
   * Each inbound connection is wrapped in a {@link ConnectedPeer},
   * assigned a rate limiter, and wired to the message handler pipeline.
   * The server emits log messages for connection events.
   *
   * @param port - The TCP port to listen on.
   *
   * @returns A promise that resolves when the server is listening.
   *
   * @throws {Error} If the server is already started.
   *
   * @example
   * ```ts
   * await manager.startServer(9000);
   * console.log('DocuSync P2P server listening on :9000');
   * ```
   */
  startServer(port) {
    if (this.server) {
      throw new Error("WebSocket server is already running.");
    }
    return new Promise((resolve, reject) => {
      this.server = new WebSocketServer({ port });
      this.server.on("listening", () => {
        console.log(`[PeerManager] Server listening on port ${port}`);
        this.startTimers();
        resolve();
      });
      this.server.on("error", (err) => {
        console.error(`[PeerManager] Server error:`, err);
        reject(err);
      });
      this.server.on("connection", (socket, req) => {
        const remoteAddr = req.socket.remoteAddress ?? "unknown";
        const remotePort = req.socket.remotePort ?? 0;
        console.log(`[PeerManager] Inbound connection from ${remoteAddr}:${remotePort}`);
        this.registerSocket(socket, remoteAddr, remotePort, "inbound");
      });
    });
  }
  // ── Client ──────────────────────────────────────────────────────────
  /**
   * Connects to a known peer at the given address and port.
   *
   * After the connection is established, a PEER_HELLO message is
   * automatically sent to announce this node.
   *
   * @param address - The IP address or hostname of the peer.
   * @param port    - The WebSocket port of the peer.
   *
   * @returns A promise that resolves when the connection is open and
   *          the PEER_HELLO has been sent.
   *
   * @example
   * ```ts
   * await manager.connectToPeer('192.168.1.10', 9000);
   * ```
   */
  connectToPeer(address, port) {
    return new Promise((resolve, reject) => {
      const url = `ws://${address}:${port}`;
      console.log(`[PeerManager] Connecting to ${url}...`);
      const socket = new WebSocket(url);
      socket.on("open", () => {
        console.log(`[PeerManager] Connected to ${url}`);
        this.registerSocket(socket, address, port, "outbound");
        this.sendHello(socket);
        resolve();
      });
      socket.on("error", (err) => {
        console.error(`[PeerManager] Connection error to ${url}:`, err.message);
        reject(err);
      });
    });
  }
  // ── Broadcast ───────────────────────────────────────────────────────
  /**
   * Sends a message to all connected and authenticated peers.
   *
   * Only peers that have completed the PEER_HELLO handshake receive
   * the message. Peers with closed sockets are skipped and cleaned up.
   *
   * @param message - The typed message to broadcast.
   *
   * @returns The number of peers the message was sent to.
   *
   * @example
   * ```ts
   * const sentCount = manager.broadcast({
   *   type: 'DELTA_PUSH',
   *   eventId: uuid(),
   *   nodeId: myNodeId,
   *   fileId: 42,
   *   deltaBase64: encodedDelta,
   *   logicalTimestamp: clock.counters[clock.nodeIndex],
   *   vectorClockJson: clock.toJSON(),
   *   timestamp: new Date().toISOString(),
   * });
   * console.log(`Delta pushed to ${sentCount} peers`);
   * ```
   */
  broadcast(message) {
    const data = serialiseMessage(message);
    let sentCount = 0;
    for (const [socket, peer] of this.peers) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue;
      }
      if (!peer.isAuthenticated) {
        continue;
      }
      try {
        socket.send(data);
        sentCount++;
      } catch (err) {
        console.error(
          `[PeerManager] Failed to send to ${peer.nodeId ?? "unknown"}:`,
          err
        );
      }
    }
    return sentCount;
  }
  /**
   * Sends a message to a specific peer by nodeId.
   *
   * @param nodeId  - The UUID of the target peer.
   * @param message - The typed message to send.
   *
   * @returns `true` if the message was sent, `false` if the peer was
   *          not found or not connected.
   */
  sendTo(nodeId, message) {
    for (const [socket, peer] of this.peers) {
      if (peer.nodeId === nodeId && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(serialiseMessage(message));
          return true;
        } catch {
          return false;
        }
      }
    }
    return false;
  }
  // ── Shutdown ────────────────────────────────────────────────────────
  /**
   * Gracefully shuts down the peer manager.
   *
   * Sends PEER_BYE to all connected peers, closes all sockets, and
   * stops the WebSocket server.
   *
   * @returns A promise that resolves when shutdown is complete.
   */
  async shutdown() {
    console.log("[PeerManager] Shutting down...");
    const byeMessage = {
      type: "PEER_BYE",
      nodeId: this.config.localNodeId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.broadcast(byeMessage);
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const [socket] of this.peers) {
      try {
        socket.close(1e3, "Shutting down");
      } catch {
      }
    }
    this.peers.clear();
    this.rateLimiters.clear();
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(() => resolve());
      });
      this.server = null;
    }
    console.log("[PeerManager] Shutdown complete.");
  }
  // ── Status ──────────────────────────────────────────────────────────
  /**
   * Returns the list of currently connected and authenticated peer nodeIds.
   *
   * @returns Array of peer nodeId strings.
   */
  getConnectedPeerIds() {
    const ids = [];
    for (const [socket, peer] of this.peers) {
      if (peer.isAuthenticated && peer.nodeId && socket.readyState === WebSocket.OPEN) {
        ids.push(peer.nodeId);
      }
    }
    return ids;
  }
  /**
   * Returns the total number of active connections (including
   * unauthenticated ones).
   */
  get connectionCount() {
    return this.peers.size;
  }
  // ── Internal: Socket Registration ───────────────────────────────────
  /**
   * Registers a new socket connection, sets up event handlers, and
   * initialises the rate limiter.
   *
   * @param socket    - The WebSocket connection.
   * @param address   - Remote address.
   * @param port      - Remote port.
   * @param direction - Whether this is an inbound or outbound connection.
   *
   * @internal
   */
  registerSocket(socket, address, port, direction) {
    const peer = {
      socket,
      nodeId: null,
      displayName: "",
      address,
      port,
      direction,
      isAuthenticated: false
    };
    this.peers.set(socket, peer);
    this.rateLimiters.set(socket, { timestamps: [] });
    socket.on("message", (data) => {
      this.handleRawMessage(socket, data.toString());
    });
    socket.on("close", (code, reason) => {
      const nodeId = peer.nodeId ?? "unknown";
      console.log(
        `[PeerManager] Connection closed: ${nodeId} (code=${code}, reason=${(reason == null ? void 0 : reason.toString()) ?? "none"})`
      );
      this.handleDisconnect(socket);
    });
    socket.on("error", (err) => {
      const nodeId = peer.nodeId ?? "unknown";
      console.error(`[PeerManager] Socket error for ${nodeId}:`, err.message);
    });
    socket["_isAlive"] = true;
    socket.on("pong", () => {
      socket["_isAlive"] = true;
    });
  }
  // ── Internal: Rate Limiting ─────────────────────────────────────────
  /**
   * Checks whether a socket has exceeded the rate limit.
   *
   * Uses a sliding-window algorithm: timestamps older than 1 second
   * are pruned, and the remaining count is checked against
   * {@link MAX_MESSAGES_PER_SECOND}.
   *
   * @param socket - The socket to check.
   * @returns `true` if the rate limit is exceeded (message should be rejected).
   *
   * @internal
   */
  isRateLimited(socket) {
    const entry = this.rateLimiters.get(socket);
    if (!entry) return false;
    const now = Date.now();
    const windowStart = now - 1e3;
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
    if (entry.timestamps.length >= MAX_MESSAGES_PER_SECOND) {
      return true;
    }
    entry.timestamps.push(now);
    return false;
  }
  // ── Internal: Message Handling ──────────────────────────────────────
  /**
   * Handles a raw WebSocket message: validates, rate-checks, and routes.
   *
   * @param socket - The source socket.
   * @param raw    - The raw message string.
   *
   * @internal
   */
  handleRawMessage(socket, raw) {
    if (this.isRateLimited(socket)) {
      const peer = this.peers.get(socket);
      console.warn(
        `[PeerManager] Rate limit exceeded for ${(peer == null ? void 0 : peer.nodeId) ?? "unknown"}. Disconnecting.`
      );
      socket.close(4029, "Rate limit exceeded");
      this.handleDisconnect(socket);
      return;
    }
    const result = validateMessage(raw);
    if (!result.valid) {
      console.warn(`[PeerManager] Rejected malformed message: ${result.error}`);
      return;
    }
    const msg = result.message;
    switch (msg.type) {
      case "PEER_HELLO":
        this.handlePeerHello(socket, msg);
        break;
      case "PEER_BYE":
        this.handlePeerBye(socket, msg);
        break;
      case "DELTA_PUSH":
        this.handleDeltaPush(socket, msg);
        break;
      case "DELTA_ACK":
        console.log(
          `[PeerManager] DELTA_ACK from ${msg.nodeId} for event ${msg.eventId}`
        );
        break;
      case "SYNC_REQUEST":
        this.handleSyncRequest(socket, msg);
        break;
      case "CONFLICT_NOTIFY":
        if (this.config.onConflictNotified) {
          this.config.onConflictNotified(
            msg.conflictId,
            msg.fileId,
            msg.summary
          );
        }
        break;
      case "MERGE_ACCEPT":
        this.handleMergeAccept(socket, msg);
        break;
      case "MERGE_REJECT":
        console.log(
          `[PeerManager] MERGE_REJECT for conflict ${msg.conflictId}: ${msg.reason}`
        );
        break;
    }
  }
  // ── Internal: PEER_HELLO Handler ────────────────────────────────────
  /**
   * Handles a PEER_HELLO message: registers the peer in the local
   * PeerRegistry table and marks the connection as authenticated.
   *
   * If this is an inbound connection, sends back our own PEER_HELLO
   * so the remote peer can register us.
   *
   * @param socket - The source socket.
   * @param msg    - The validated PEER_HELLO message.
   *
   * @internal
   */
  async handlePeerHello(socket, msg) {
    const peer = this.peers.get(socket);
    if (!peer) return;
    peer.nodeId = msg.nodeId;
    peer.displayName = msg.displayName;
    peer.isAuthenticated = true;
    console.log(
      `[PeerManager] PEER_HELLO from ${msg.displayName} (${msg.nodeId})`
    );
    try {
      await this.config.prisma.peerRegistry.upsert({
        where: { nodeId: msg.nodeId },
        create: {
          nodeId: msg.nodeId,
          displayName: msg.displayName,
          address: peer.address,
          port: peer.port,
          isOnline: true,
          lastSeen: /* @__PURE__ */ new Date()
        },
        update: {
          displayName: msg.displayName,
          address: peer.address,
          port: peer.port,
          isOnline: true,
          lastSeen: /* @__PURE__ */ new Date()
        }
      });
    } catch (err) {
      console.error("[PeerManager] Failed to upsert PeerRegistry:", err);
    }
    if (peer.direction === "inbound") {
      this.sendHello(socket);
    }
  }
  // ── Internal: PEER_BYE Handler ──────────────────────────────────────
  /**
   * Handles a PEER_BYE message: marks the peer as offline in the
   * PeerRegistry and closes the connection.
   *
   * @param socket - The source socket.
   * @param msg    - The validated PEER_BYE message.
   *
   * @internal
   */
  async handlePeerBye(socket, msg) {
    console.log(`[PeerManager] PEER_BYE from ${msg.nodeId}`);
    try {
      await this.config.prisma.peerRegistry.updateMany({
        where: { nodeId: msg.nodeId },
        data: { isOnline: false, lastSeen: /* @__PURE__ */ new Date() }
      });
    } catch (err) {
      console.error("[PeerManager] Failed to update PeerRegistry:", err);
    }
    socket.close(1e3, "Peer said goodbye");
    this.peers.delete(socket);
    this.rateLimiters.delete(socket);
  }
  // ── Internal: DELTA_PUSH Handler ────────────────────────────────────
  /**
   * Handles a DELTA_PUSH message:
   *
   * 1. Retrieves the current local file content.
   * 2. Decodes the delta against the local content.
   * 3. Appends a `merge` event to the EventLog.
   * 4. Invokes the `onDeltaApplied` callback so the app can write the
   *    new content to disk.
   * 5. Sends a DELTA_ACK back to the sender.
   *
   * If delta decoding fails (checksum mismatch, malformed payload),
   * the error is logged but the connection is preserved.
   *
   * @param socket - The source socket.
   * @param msg    - The validated DELTA_PUSH message.
   *
   * @internal
   */
  async handleDeltaPush(socket, msg) {
    console.log(
      `[PeerManager] DELTA_PUSH from ${msg.nodeId} for file ${msg.fileId}`
    );
    try {
      const currentContent = await this.config.getFileContent(msg.fileId);
      const decodeResult = decode(currentContent, msg.deltaBase64);
      const newContent = decodeResult.content;
      await this.config.eventLog.appendEvent({
        eventId: msg.eventId,
        fileId: msg.fileId,
        nodeId: msg.nodeId,
        eventType: "merge",
        logicalTimestamp: msg.logicalTimestamp,
        vectorClockJson: msg.vectorClockJson,
        payload: msg.deltaBase64
      });
      if (this.config.onDeltaApplied) {
        await this.config.onDeltaApplied(
          msg.fileId,
          newContent,
          msg.eventId,
          msg.nodeId,
          msg.vectorClockJson
        );
      }
      const ack = {
        type: "DELTA_ACK",
        eventId: msg.eventId,
        nodeId: this.config.localNodeId,
        fileId: msg.fileId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(serialiseMessage(ack));
      }
      console.log(
        `[PeerManager] Applied delta for file ${msg.fileId} (${decodeResult.opsApplied} ops)`
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[PeerManager] Failed to apply DELTA_PUSH for file ${msg.fileId}: ${errMsg}`
      );
    }
  }
  // ── Internal: SYNC_REQUEST Handler ──────────────────────────────────
  /**
   * Handles a SYNC_REQUEST message by invoking the `onSyncRequested`
   * callback. The application layer is responsible for querying the
   * EventLog and sending the missed events back.
   *
   * @param socket - The source socket.
   * @param msg    - The validated SYNC_REQUEST message.
   *
   * @internal
   */
  async handleSyncRequest(_socket, msg) {
    console.log(
      `[PeerManager] SYNC_REQUEST from ${msg.nodeId} for file ${msg.fileId} since ts=${msg.sinceTimestamp}`
    );
    if (this.config.onSyncRequested) {
      await this.config.onSyncRequested(
        msg.nodeId,
        msg.fileId,
        msg.sinceTimestamp
      );
    }
  }
  // ── Internal: MERGE_ACCEPT Handler ──────────────────────────────────
  /**
   * Handles a MERGE_ACCEPT message by invoking the `onMergeAccepted`
   * callback so the application layer can apply the winning payload.
   *
   * @param socket - The source socket.
   * @param msg    - The validated MERGE_ACCEPT message.
   *
   * @internal
   */
  async handleMergeAccept(_socket, msg) {
    console.log(
      `[PeerManager] MERGE_ACCEPT for conflict ${msg.conflictId} (winner: ${msg.winner}, resolvedBy: ${msg.resolvedBy})`
    );
    if (this.config.onMergeAccepted) {
      await this.config.onMergeAccepted(
        msg.conflictId,
        msg.fileId,
        msg.winnerPayload,
        msg.vectorClockJson
      );
    }
  }
  // ── Internal: Disconnect Handler ────────────────────────────────────
  /**
   * Handles a peer disconnection — cleans up internal state and marks
   * the peer as offline in the PeerRegistry.
   *
   * @param socket - The disconnected socket.
   *
   * @internal
   */
  async handleDisconnect(socket) {
    const peer = this.peers.get(socket);
    if (peer == null ? void 0 : peer.nodeId) {
      try {
        await this.config.prisma.peerRegistry.updateMany({
          where: { nodeId: peer.nodeId },
          data: { isOnline: false, lastSeen: /* @__PURE__ */ new Date() }
        });
      } catch (err) {
        console.error("[PeerManager] Failed to update PeerRegistry:", err);
      }
    }
    this.peers.delete(socket);
    this.rateLimiters.delete(socket);
  }
  // ── Internal: PEER_HELLO Sender ─────────────────────────────────────
  /**
   * Sends a PEER_HELLO message on the given socket.
   *
   * @param socket - The target socket.
   *
   * @internal
   */
  sendHello(socket) {
    const hello = {
      type: "PEER_HELLO",
      nodeId: this.config.localNodeId,
      displayName: this.config.localDisplayName,
      nodeCount: this.config.nodeCount,
      nodeIndex: this.config.nodeIndex,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(serialiseMessage(hello));
    }
  }
  // ── Internal: Timers ────────────────────────────────────────────────
  /**
   * Starts the heartbeat and rate-limiter cleanup timers.
   *
   * @internal
   */
  startTimers() {
    this.heartbeatTimer = setInterval(() => {
      for (const [socket, peer] of this.peers) {
        const isAlive = socket["_isAlive"];
        if (isAlive === false) {
          console.log(
            `[PeerManager] Heartbeat timeout for ${peer.nodeId ?? "unknown"}`
          );
          socket.terminate();
          this.handleDisconnect(socket);
          continue;
        }
        socket["_isAlive"] = false;
        socket.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const windowStart = now - 1e3;
      for (const [, entry] of this.rateLimiters) {
        entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
      }
    }, RATE_LIMIT_CLEANUP_INTERVAL_MS);
  }
}
function createPeerManager(config) {
  return new PeerManager(config);
}
const ALLOWED_EXTENSIONS = /* @__PURE__ */ new Set([
  // Documents
  ".txt",
  ".md",
  ".markdown",
  ".rtf",
  ".tex",
  ".bib",
  ".log",
  ".docx",
  ".doc",
  // Web
  ".html",
  ".htm",
  ".xml",
  ".svg",
  // Data
  ".json",
  ".csv",
  ".tsv",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  // Code
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".py",
  ".rb",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".rs",
  ".go",
  ".swift",
  ".kt",
  ".kts",
  ".sql",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".bat",
  ".cmd",
  // Config
  ".env",
  ".gitignore",
  ".editorconfig",
  ".prisma",
  ".graphql",
  ".gql",
  ".proto"
]);
function generateUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
function validateExtension(filePath) {
  const ext = path__namespace.extname(filePath).toLowerCase();
  if (ext === "") {
    return null;
  }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return `File extension "${ext}" is not supported. DocuSync only syncs text-based files. Allowed: ${[...ALLOWED_EXTENSIONS].slice(0, 10).join(", ")}, ...`;
  }
  return null;
}
function safeHandler(handler) {
  return async (_event, ...args) => {
    try {
      const data = await handler(...args);
      return { success: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[IPC] Handler error:", message);
      return { success: false, error: message };
    }
  };
}
async function initEngine(nodeCount = 3, nodeIndex = 0, wsPort = 9e3) {
  const localNodeId = generateUUID();
  const prisma = new _defaultExports.PrismaClient();
  await prisma.$connect();
  console.log("[Engine] Prisma connected to SQLite.");
  const eventLog = createEventLog(prisma);
  const vectorClock = createVectorClock(nodeCount, nodeIndex);
  const lwwResolver = createLWWResolver(prisma, eventLog);
  const openFiles = /* @__PURE__ */ new Map();
  const fileContents = /* @__PURE__ */ new Map();
  const peerManager = createPeerManager({
    localNodeId,
    localDisplayName: require("os").hostname(),
    nodeCount,
    nodeIndex,
    prisma,
    eventLog,
    getFileContent: async (fileId) => {
      return fileContents.get(fileId) ?? "";
    },
    onDeltaApplied: async (fileId, newContent, _eventId, _nodeId, _vcJson) => {
      fileContents.set(fileId, newContent);
      const filePath = openFiles.get(fileId);
      if (filePath) {
        await fs__namespace.promises.writeFile(filePath, newContent, "utf-8");
        console.log(`[IPC] Applied remote delta to ${filePath}`);
      }
    },
    onConflictNotified: async (conflictId, fileId, summary) => {
      var _a;
      console.log(
        `[IPC] Conflict detected: ${conflictId} on file ${fileId} — ${summary}`
      );
      (_a = electron.BrowserWindow.getAllWindows()[0]) == null ? void 0 : _a.webContents.send(
        "conflict:detected",
        conflictId,
        fileId,
        summary
      );
    },
    onMergeAccepted: async (conflictId, fileId, winnerPayload, _vcJson) => {
      fileContents.set(fileId, winnerPayload);
      const filePath = openFiles.get(fileId);
      if (filePath) {
        await fs__namespace.promises.writeFile(filePath, winnerPayload, "utf-8");
        console.log(`[IPC] Applied merge resolution to ${filePath}`);
      }
    }
  });
  const MAX_PORT_RETRIES = 10;
  let boundPort = wsPort;
  let serverStarted = false;
  for (let attempt = 0; attempt <= MAX_PORT_RETRIES; attempt++) {
    const tryPort = wsPort + attempt;
    try {
      await peerManager.startServer(tryPort);
      boundPort = tryPort;
      serverStarted = true;
      break;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isAddrInUse = errMsg.includes("EADDRINUSE") || err instanceof Error && "code" in err && err.code === "EADDRINUSE";
      if (isAddrInUse && attempt < MAX_PORT_RETRIES) {
        console.warn(
          `[Engine] Port ${tryPort} is in use, trying ${tryPort + 1}...`
        );
        continue;
      }
      throw err;
    }
  }
  if (!serverStarted) {
    throw new Error(
      `[Engine] Failed to bind WebSocket server on ports ${wsPort}–${wsPort + MAX_PORT_RETRIES}.`
    );
  }
  console.log(`[Engine] P2P WebSocket server started on port ${boundPort}.`);
  return {
    prisma,
    eventLog,
    vectorClock,
    lwwResolver,
    peerManager,
    localNodeId,
    openFiles,
    fileContents,
    nextFileId: 1
  };
}
function registerIPCHandlers(services) {
  const {
    prisma,
    eventLog,
    vectorClock,
    lwwResolver,
    peerManager,
    localNodeId,
    openFiles,
    fileContents
  } = services;
  electron.ipcMain.handle(
    "file:open",
    safeHandler(async (...args) => {
      let fileId;
      let filePath;
      const firstArg = args[0];
      if (typeof firstArg === "number") {
        fileId = firstArg;
        filePath = openFiles.get(fileId);
      } else if (typeof firstArg === "string" && /^\d+$/.test(firstArg)) {
        fileId = parseInt(firstArg, 10);
        filePath = openFiles.get(fileId);
      } else {
        filePath = firstArg;
      }
      if (fileId !== void 0 && filePath) {
        const content2 = fileContents.get(fileId) ?? "";
        const ext2 = path__namespace.extname(filePath).toLowerCase();
        return {
          fileId,
          filePath,
          fileName: path__namespace.basename(filePath),
          content: content2,
          extension: ext2.replace(".", ""),
          sizeBytes: Buffer.byteLength(content2, "utf-8")
        };
      }
      if (!filePath) {
        const result = await electron.dialog.showOpenDialog({
          properties: ["openFile"],
          filters: [
            {
              name: "Text Files",
              extensions: [...ALLOWED_EXTENSIONS].map((e) => e.replace(".", ""))
            },
            { name: "All Files", extensions: ["*"] }
          ]
        });
        if (result.canceled || result.filePaths.length === 0) {
          throw new Error("File open cancelled by user.");
        }
        filePath = result.filePaths[0];
      }
      const extError = validateExtension(filePath);
      if (extError) {
        throw new Error(extError);
      }
      if (!fs__namespace.existsSync(filePath)) {
        throw new Error(`File not found: "${filePath}".`);
      }
      const content = await fs__namespace.promises.readFile(filePath, "utf-8");
      const ext = path__namespace.extname(filePath).toLowerCase();
      const newFileId = services.nextFileId++;
      openFiles.set(newFileId, filePath);
      fileContents.set(newFileId, content);
      console.log(`[IPC] file:open → ${filePath} (fileId=${newFileId})`);
      return {
        fileId: newFileId,
        filePath,
        fileName: path__namespace.basename(filePath),
        content,
        extension: ext,
        sizeBytes: Buffer.byteLength(content, "utf-8")
      };
    })
  );
  electron.ipcMain.handle(
    "file:save",
    safeHandler(async (...args) => {
      const fileId = args[0];
      const newContent = args[1];
      if (typeof fileId !== "number" || typeof newContent !== "string") {
        throw new Error("file:save requires (fileId: number, newContent: string).");
      }
      const filePath = openFiles.get(fileId);
      if (!filePath) {
        throw new Error(`File ID ${fileId} is not open.`);
      }
      const previousContent = fileContents.get(fileId) ?? "";
      await fs__namespace.promises.writeFile(filePath, newContent, "utf-8");
      const fileName = path__namespace.basename(filePath);
      try {
        validateTextFile(fileName);
      } catch {
        fileContents.set(fileId, newContent);
        return {
          fileId,
          saved: true,
          synced: false,
          reason: "File type not eligible for delta sync."
        };
      }
      const encodeResult = encode(previousContent, newContent, fileName);
      fileContents.set(fileId, newContent);
      vectorClock.increment();
      const vcJson = vectorClock.toJSON();
      const logicalTimestamp = vectorClock.counters[vectorClock.nodeIndex];
      const eventId = generateUUID();
      const payload = encodeResult.deltaBase64 ?? JSON.stringify(encodeResult.chunks);
      await eventLog.appendEvent({
        eventId,
        fileId,
        nodeId: localNodeId,
        eventType: "edit",
        logicalTimestamp,
        vectorClockJson: vcJson,
        payload
      });
      let peersNotified = 0;
      if (encodeResult.deltaBase64) {
        const pushMsg = {
          type: "DELTA_PUSH",
          eventId,
          nodeId: localNodeId,
          fileId,
          deltaBase64: encodeResult.deltaBase64,
          logicalTimestamp,
          vectorClockJson: vcJson,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        };
        peersNotified = peerManager.broadcast(pushMsg);
      }
      console.log(
        `[IPC] file:save → ${fileName} (delta=${encodeResult.deltaSizeBytes}B, peers=${peersNotified})`
      );
      return {
        fileId,
        saved: true,
        synced: true,
        deltaSizeBytes: encodeResult.deltaSizeBytes,
        compressionRatio: encodeResult.compressionRatio,
        peersNotified,
        eventId
      };
    })
  );
  electron.ipcMain.handle(
    "file:history",
    safeHandler(async (...args) => {
      const fileId = args[0];
      if (typeof fileId !== "number") {
        throw new Error("file:history requires (fileId: number).");
      }
      const history = await eventLog.getHistory(fileId);
      console.log(`[IPC] file:history → fileId=${fileId}, entries=${history.length}`);
      return {
        fileId,
        entries: history.map((entry) => ({
          id: entry.id,
          eventId: entry.eventId,
          nodeId: entry.nodeId,
          eventType: entry.eventType,
          logicalTimestamp: entry.logicalTimestamp,
          createdAt: entry.createdAt.toISOString(),
          isCompacted: entry.isCompacted,
          // Omit payload for performance — it can be large.
          payloadPreview: entry.payload.slice(0, 200)
        })),
        totalEntries: history.length
      };
    })
  );
  electron.ipcMain.handle(
    "file:restore",
    safeHandler(async (...args) => {
      const fileId = args[0];
      const targetEventId = args[1];
      if (typeof fileId !== "number" || typeof targetEventId !== "string") {
        throw new Error("file:restore requires (fileId: number, eventId: string).");
      }
      const filePath = openFiles.get(fileId);
      if (!filePath) {
        throw new Error(`File ID ${fileId} is not open.`);
      }
      const history = await eventLog.getHistory(fileId);
      const targetEvent = history.find((e) => e.eventId === targetEventId);
      if (!targetEvent) {
        throw new Error(`Event "${targetEventId}" not found in history for file ${fileId}.`);
      }
      let content = "";
      for (const event of history) {
        if (event.isCompacted) continue;
        try {
          if (event.eventType === "edit" || event.eventType === "merge") {
            const decodeResult = decode(content, event.payload);
            content = decodeResult.content;
          } else if (event.eventType === "restore") {
            content = event.payload;
          }
        } catch {
          content = event.payload;
        }
        if (event.eventId === targetEventId) break;
      }
      await fs__namespace.promises.writeFile(filePath, content, "utf-8");
      fileContents.set(fileId, content);
      vectorClock.increment();
      const vcJson = vectorClock.toJSON();
      const restoreEventId = generateUUID();
      await eventLog.appendEvent({
        eventId: restoreEventId,
        fileId,
        nodeId: localNodeId,
        eventType: "restore",
        logicalTimestamp: vectorClock.counters[vectorClock.nodeIndex],
        vectorClockJson: vcJson,
        payload: content
      });
      console.log(`[IPC] file:restore → fileId=${fileId}, to=${targetEventId}`);
      return {
        fileId,
        restoredToEventId: targetEventId,
        restoreEventId,
        contentLength: content.length
      };
    })
  );
  electron.ipcMain.handle(
    "sync:status",
    safeHandler(async () => {
      const connectedPeers = peerManager.getConnectedPeerIds();
      let pendingConflicts = 0;
      for (const [fileId] of openFiles) {
        const conflicts = await lwwResolver.getPendingConflicts(fileId);
        pendingConflicts += conflicts.length;
      }
      return {
        localNodeId,
        vectorClock: vectorClock.toJSON(),
        counters: [...vectorClock.counters],
        connectedPeers,
        peerCount: connectedPeers.length,
        totalConnections: peerManager.connectionCount,
        openFileCount: openFiles.size,
        pendingConflicts
      };
    })
  );
  electron.ipcMain.handle(
    "sync:trigger",
    safeHandler(async () => {
      const connectedPeers = peerManager.getConnectedPeerIds();
      let filesSynced = 0;
      for (const [fileId] of openFiles) {
        const history = await eventLog.getHistory(fileId);
        const latestTs = history.length > 0 ? history[history.length - 1].logicalTimestamp : 0;
        const syncMsg = {
          type: "SYNC_REQUEST",
          nodeId: localNodeId,
          fileId,
          sinceTimestamp: latestTs,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        };
        peerManager.broadcast(syncMsg);
        filesSynced++;
      }
      console.log(
        `[IPC] sync:trigger → ${filesSynced} files, ${connectedPeers.length} peers`
      );
      return {
        filesSynced,
        peersContacted: connectedPeers.length,
        peerIds: connectedPeers
      };
    })
  );
  electron.ipcMain.handle(
    "conflict:list",
    safeHandler(async () => {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
      const allConflicts = [];
      for (const [fId] of openFiles) {
        const pending = await lwwResolver.getPendingConflicts(fId);
        for (const c of pending) {
          const tsA = ((_d = (_c = (_b = (_a = c.vectorClockJsonA) == null ? void 0 : _a.root) == null ? void 0 : _b.children) == null ? void 0 : _c[0]) == null ? void 0 : _d.counter) ?? 0;
          const tsB = ((_h = (_g = (_f = (_e = c.vectorClockJsonB) == null ? void 0 : _e.root) == null ? void 0 : _f.children) == null ? void 0 : _g[0]) == null ? void 0 : _h.counter) ?? 0;
          allConflicts.push({
            conflictId: c.conflictId,
            fileId: c.fileId,
            eventIdA: c.eventIdA,
            nodeIdA: c.nodeIdA,
            payloadA: c.payloadA,
            logicalTimestampA: tsA,
            eventIdB: c.eventIdB,
            nodeIdB: c.nodeIdB,
            payloadB: c.payloadB,
            logicalTimestampB: tsB,
            status: c.status,
            detectedAt: c.detectedAt.toISOString()
          });
        }
      }
      const allPending = await prisma.conflict.findMany({
        where: { status: "pending" },
        orderBy: { detectedAt: "asc" }
      });
      for (const row of allPending) {
        if (allConflicts.some((c) => c.conflictId === row.conflictId)) continue;
        const vcA = JSON.parse(row.vectorClockJsonA);
        const vcB = JSON.parse(row.vectorClockJsonB);
        const tsA = ((_k = (_j = (_i = vcA == null ? void 0 : vcA.root) == null ? void 0 : _i.children) == null ? void 0 : _j[0]) == null ? void 0 : _k.counter) ?? 0;
        const tsB = ((_n = (_m = (_l = vcB == null ? void 0 : vcB.root) == null ? void 0 : _l.children) == null ? void 0 : _m[0]) == null ? void 0 : _n.counter) ?? 0;
        allConflicts.push({
          conflictId: row.conflictId,
          fileId: row.fileId,
          eventIdA: row.eventIdA,
          nodeIdA: row.nodeIdA,
          payloadA: row.payloadA,
          logicalTimestampA: tsA,
          eventIdB: row.eventIdB,
          nodeIdB: row.nodeIdB,
          payloadB: row.payloadB,
          logicalTimestampB: tsB,
          status: row.status,
          detectedAt: row.detectedAt.toISOString()
        });
      }
      console.log(`[IPC] conflict:list → ${allConflicts.length} pending conflicts`);
      return {
        conflicts: allConflicts,
        totalPending: allConflicts.length
      };
    })
  );
  electron.ipcMain.handle(
    "conflict:detail",
    safeHandler(async (...args) => {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i;
      const conflictId = args[0];
      if (typeof conflictId !== "string" || conflictId.length === 0) {
        throw new Error("conflict:detail requires (conflictId: string).");
      }
      const conflict = await lwwResolver.getConflict(conflictId);
      if (!conflict) {
        throw new Error(`Conflict "${conflictId}" not found.`);
      }
      const tsA = ((_d = (_c = (_b = (_a = conflict.vectorClockJsonA) == null ? void 0 : _a.root) == null ? void 0 : _b.children) == null ? void 0 : _c[0]) == null ? void 0 : _d.counter) ?? 0;
      const tsB = ((_h = (_g = (_f = (_e = conflict.vectorClockJsonB) == null ? void 0 : _e.root) == null ? void 0 : _f.children) == null ? void 0 : _g[0]) == null ? void 0 : _h.counter) ?? 0;
      console.log(`[IPC] conflict:detail → ${conflictId}`);
      return {
        conflictId: conflict.conflictId,
        fileId: conflict.fileId,
        eventIdA: conflict.eventIdA,
        nodeIdA: conflict.nodeIdA,
        payloadA: conflict.payloadA,
        logicalTimestampA: tsA,
        eventIdB: conflict.eventIdB,
        nodeIdB: conflict.nodeIdB,
        payloadB: conflict.payloadB,
        logicalTimestampB: tsB,
        status: conflict.status,
        winner: conflict.winner,
        resolvedBy: conflict.resolvedBy,
        detectedAt: conflict.detectedAt.toISOString(),
        resolvedAt: ((_i = conflict.resolvedAt) == null ? void 0 : _i.toISOString()) ?? null
      };
    })
  );
  electron.ipcMain.handle(
    "conflict:resolve",
    safeHandler(async (...args) => {
      const conflictId = args[0];
      const winner = args[1];
      if (typeof conflictId !== "string") {
        throw new Error('conflict:resolve requires (conflictId: string, winner: "A"|"B").');
      }
      if (winner !== "A" && winner !== "B") {
        throw new Error(`Winner must be "A" or "B", got "${String(winner)}".`);
      }
      const conflict = await lwwResolver.getConflict(conflictId);
      if (!conflict) {
        throw new Error(`Conflict "${conflictId}" not found.`);
      }
      const clockA = VectorClock.fromJSON(conflict.vectorClockJsonA);
      const clockB = VectorClock.fromJSON(conflict.vectorClockJsonB);
      const mergedClock = VectorClock.fromJSON(conflict.vectorClockJsonA);
      mergedClock.merge(clockB);
      const result = await lwwResolver.autoResolve(
        conflictId,
        winner,
        localNodeId,
        mergedClock.toJSON()
      );
      const acceptMsg = {
        ...result.mergeAcceptMessage,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      const peersNotified = peerManager.broadcast(acceptMsg);
      const winnerPayload = winner === "A" ? conflict.payloadA : conflict.payloadB;
      fileContents.set(conflict.fileId, winnerPayload);
      const filePath = openFiles.get(conflict.fileId);
      if (filePath) {
        await fs__namespace.promises.writeFile(filePath, winnerPayload, "utf-8");
      }
      console.log(
        `[IPC] conflict:resolve → ${conflictId} winner=${winner}, peers=${peersNotified}`
      );
      return {
        conflictId,
        winner,
        resolvedBy: localNodeId,
        peersNotified,
        fileId: conflict.fileId
      };
    })
  );
  electron.ipcMain.handle(
    "peer:list",
    safeHandler(async () => {
      const peers = await prisma.peerRegistry.findMany({
        orderBy: { lastSeen: "desc" }
      });
      return {
        peers: peers.map((p) => ({
          nodeId: p.nodeId,
          displayName: p.displayName,
          address: p.address,
          port: p.port,
          isOnline: p.isOnline,
          firstSeen: p.firstSeen.toISOString(),
          lastSeen: p.lastSeen.toISOString()
        })),
        totalPeers: peers.length,
        onlinePeers: peers.filter((p) => p.isOnline).length
      };
    })
  );
  electron.ipcMain.handle(
    "peer:connect",
    safeHandler(async (...args) => {
      const address = args[0];
      const port = args[1];
      if (typeof address !== "string" || typeof port !== "number") {
        throw new Error("peer:connect requires (address: string, port: number).");
      }
      if (port < 1 || port > 65535 || !Number.isInteger(port)) {
        throw new Error(`Invalid port: ${port}. Must be 1–65535.`);
      }
      await peerManager.connectToPeer(address, port);
      console.log(`[IPC] peer:connect → ${address}:${port}`);
      return {
        connected: true,
        address,
        port,
        connectedPeers: peerManager.getConnectedPeerIds()
      };
    })
  );
  console.log("[IPC] All handlers registered.");
}
async function cleanupIPCHandlers(services) {
  console.log("[IPC] Cleaning up...");
  const channels = [
    "file:open",
    "file:save",
    "file:history",
    "file:restore",
    "sync:status",
    "sync:trigger",
    "conflict:list",
    "conflict:detail",
    "conflict:resolve",
    "peer:list",
    "peer:connect"
  ];
  for (const channel of channels) {
    electron.ipcMain.removeHandler(channel);
  }
  await services.peerManager.shutdown();
  await services.prisma.$disconnect();
  console.log("[IPC] Cleanup complete.");
}
process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = electron.app.isPackaged ? process.env.DIST : path.join(process.env.DIST, "../public");
let win;
let engineServices = null;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const ALL_IPC_CHANNELS = [
  "file:open",
  "file:save",
  "file:history",
  "file:restore",
  "sync:status",
  "sync:trigger",
  "conflict:list",
  "conflict:detail",
  "conflict:resolve",
  "peer:list",
  "peer:connect"
];
function registerFallbackIPCHandlers() {
  for (const channel of ALL_IPC_CHANNELS) {
    try {
      electron.ipcMain.handle(channel, async () => ({
        success: false,
        error: "Engine not initialised. The sync engine failed to start — please restart the application."
      }));
    } catch {
    }
  }
  console.warn("[IPC] Fallback handlers registered (engine unavailable).");
}
async function createWindow() {
  win = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC, "favicon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(process.env.DIST, "index.html"));
  }
}
async function bootstrap() {
  try {
    const nodeCount = parseInt(process.env["DOCUSYNC_NODE_COUNT"] ?? "3", 10);
    const nodeIndex = parseInt(process.env["DOCUSYNC_NODE_INDEX"] ?? "0", 10);
    const wsPort = parseInt(process.env["DOCUSYNC_WS_PORT"] ?? "9000", 10);
    engineServices = await initEngine(nodeCount, nodeIndex, wsPort);
    registerIPCHandlers(engineServices);
    console.log("[Main] Engine initialised and IPC handlers registered.");
  } catch (err) {
    console.error("[Main] Failed to initialise engine:", err);
    registerFallbackIPCHandlers();
  }
  await createWindow();
}
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
    win = null;
  }
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
electron.app.on("before-quit", async () => {
  if (engineServices) {
    await cleanupIPCHandlers(engineServices);
    engineServices = null;
  }
});
electron.app.whenReady().then(bootstrap);
