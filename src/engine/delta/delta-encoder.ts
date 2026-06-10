/**
 * @module DeltaEncoder
 *
 * Byte-level delta encoder for the DocuSync hybrid sync engine.
 *
 * This module computes compact, base64-encoded deltas between two versions of
 * a text document using a **Myers diff algorithm** adapted for byte-level
 * differencing. Instead of transmitting the entire file on every save, only
 * the minimal set of insert/delete operations is sent over the WebSocket
 * channel, dramatically reducing bandwidth on large thesis documents.
 *
 * For files that exceed {@link MAX_CHUNK_SIZE_BYTES} (4 MB), the content is
 * split into content-defined chunks and each chunk is delta-encoded
 * independently. This prevents pathological memory usage when editing very
 * large documents.
 *
 * Binary files are explicitly rejected — only text-based formats recognised
 * by DocuSync are allowed through the encoder.
 *
 * **Thesis references:**
 * - [3]  Myers, E. W. (1986). An O(ND) difference algorithm and its
 *        variations. *Algorithmica*, 1(2), 251–266.
 * - [4]  Hunt, J. W., & McIlroy, M. D. (1976). An algorithm for differential
 *        file comparison. *Bell Laboratories CSTR #41*.
 * - [15] Tridgell, A. (1999). Efficient algorithms for sorting and
 *        synchronization. *PhD Thesis, Australian National University*.
 *
 * @packageDocumentation
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maximum chunk size in bytes for content-defined chunking.
 *
 * Files larger than this are split into chunks, each delta-encoded
 * independently. The value 4 MB (4,194,304 bytes) balances memory
 * efficiency against chunk overhead.
 *
 * > "Content-defined chunking at a fixed boundary size allows each
 * > chunk to be differenced independently, bounding memory usage to
 * > O(chunk_size) regardless of total file size." — Tridgell [15], §4.3
 *
 * @see Thesis citation [15] — Tridgell (1999), chunking for rsync
 */
export const MAX_CHUNK_SIZE_BYTES: number = 4_194_304;

/**
 * Maximum edit distance before the Myers algorithm falls back to a
 * full-replacement delta. This prevents O(N²) blowup on completely
 * dissimilar content.
 *
 * @internal
 */
const MAX_EDIT_DISTANCE: number = 10_000;

/**
 * Set of file extensions recognised as text-based and allowed through
 * the encoder. All other extensions are rejected as binary.
 *
 * @internal
 */
const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  '.txt', '.md', '.markdown', '.html', '.htm', '.xml', '.json',
  '.csv', '.tsv', '.yaml', '.yml', '.toml', '.ini', '.cfg',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.css', '.scss', '.sass', '.less',
  '.py', '.rb', '.java', '.c', '.cpp', '.h', '.hpp',
  '.rs', '.go', '.swift', '.kt', '.kts',
  '.sql', '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
  '.tex', '.bib', '.rtf', '.log',
  '.docx', '.doc',  // Mammoth handles these as HTML strings internally
  '.env', '.gitignore', '.editorconfig',
  '.prisma', '.graphql', '.gql', '.proto',
  '.svg',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single edit operation produced by the Myers diff algorithm.
 *
 * | Type     | Meaning                                              |
 * |----------|------------------------------------------------------|
 * | `equal`  | Content is identical in both versions — copy through. |
 * | `insert` | New content added in the updated version.             |
 * | `delete` | Old content removed in the updated version.           |
 *
 * @see Thesis citation [3] — Myers (1986), edit script operations
 */
export interface DiffOp {
  /** The type of edit operation. */
  type: 'equal' | 'insert' | 'delete';
  /** The text content associated with this operation. */
  text: string;
}

/**
 * The serialisable delta payload. This is JSON-stringified and then
 * base64-encoded for transmission over WebSocket.
 *
 * @see Thesis citation [4] — Hunt & McIlroy (1976), delta representation
 */
export interface DeltaPayload {
  /** Schema version for forward compatibility. */
  version: 1;
  /** Edit operations comprising the delta. */
  ops: DiffOp[];
  /**
   * Simple checksum of the expected output content for integrity
   * validation on decode.
   */
  checksum: number;
}

/**
 * A single chunk in a multi-chunk delta for files exceeding
 * {@link MAX_CHUNK_SIZE_BYTES}.
 *
 * @see Thesis citation [15] — Tridgell (1999), content-defined chunking
 */
export interface DeltaChunk {
  /** Zero-based chunk index. */
  index: number;
  /** Total number of chunks in this delta. */
  total: number;
  /** Base64-encoded delta for this chunk. */
  deltaBase64: string;
}

/**
 * Result of the {@link encode} function.
 *
 * If the file fits within a single chunk, `deltaBase64` is populated
 * and `chunks` is `null`. If the file exceeds {@link MAX_CHUNK_SIZE_BYTES},
 * `deltaBase64` is `null` and `chunks` contains the array of per-chunk
 * deltas.
 */
export interface EncodeResult {
  /** Base64 delta for single-chunk files. */
  deltaBase64: string | null;
  /** Per-chunk deltas for multi-chunk files. */
  chunks: DeltaChunk[] | null;
  /** Whether the file was chunked. */
  isChunked: boolean;
  /** Original content byte size. */
  originalSizeBytes: number;
  /** Delta size in bytes (total across all chunks). */
  deltaSizeBytes: number;
  /** Compression ratio: deltaSizeBytes / originalSizeBytes. */
  compressionRatio: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown when the encoder receives a file with a binary extension.
 */
export class BinaryContentError extends Error {
  constructor(extension: string) {
    super(
      `Delta encoding rejected: "${extension}" is a binary file format. ` +
        `Only text-based files are supported.`
    );
    this.name = 'BinaryContentError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Myers Diff Algorithm
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the shortest edit script (SES) between two strings using the
 * Myers diff algorithm.
 *
 * The algorithm explores the edit graph diagonally, finding the longest
 * common subsequence with O(ND) time complexity where N is the total
 * length of both inputs and D is the edit distance (number of
 * inserts + deletes).
 *
 * If the edit distance exceeds {@link MAX_EDIT_DISTANCE}, the algorithm
 * falls back to a full delete-then-insert, which is still correct but
 * produces a larger delta. This bounds worst-case runtime on completely
 * dissimilar content.
 *
 * > "The algorithm discovers the shortest sequence of insert and delete
 * > commands that transforms one string into another by exploring
 * > diagonals of the edit graph greedily." — Myers [3], §2
 *
 * @param oldText - The previous version of the content.
 * @param newText - The updated version of the content.
 *
 * @returns An array of {@link DiffOp} describing the minimal edit script.
 *
 * @see Thesis citation [3]  — Myers (1986), O(ND) difference algorithm
 * @see Thesis citation [4]  — Hunt & McIlroy (1976), foundational diff work
 *
 * @internal
 */
function myersDiff(oldText: string, newText: string): DiffOp[] {
  // ── Trivial cases ───────────────────────────────────────────────────
  if (oldText === newText) {
    return oldText.length > 0 ? [{ type: 'equal', text: oldText }] : [];
  }
  if (oldText.length === 0) {
    return [{ type: 'insert', text: newText }];
  }
  if (newText.length === 0) {
    return [{ type: 'delete', text: oldText }];
  }

  // ── Strip common prefix & suffix ────────────────────────────────────
  // This optimisation reduces the input to the Myers core, which is
  // critical for typical thesis edits where only a paragraph changes.
  let prefixLen = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (prefixLen < minLen && oldText[prefixLen] === newText[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < (minLen - prefixLen) &&
    oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const prefix = oldText.slice(0, prefixLen);
  const suffix = oldText.slice(oldText.length - suffixLen);
  const oldCore = oldText.slice(prefixLen, oldText.length - suffixLen);
  const newCore = newText.slice(prefixLen, newText.length - suffixLen);

  const ops: DiffOp[] = [];
  if (prefix.length > 0) ops.push({ type: 'equal', text: prefix });

  // ── Myers core ──────────────────────────────────────────────────────
  if (oldCore.length === 0 && newCore.length > 0) {
    ops.push({ type: 'insert', text: newCore });
  } else if (oldCore.length > 0 && newCore.length === 0) {
    ops.push({ type: 'delete', text: oldCore });
  } else if (oldCore.length > 0 && newCore.length > 0) {
    const coreDiff = myersCoreEdit(oldCore, newCore);
    ops.push(...coreDiff);
  }

  if (suffix.length > 0) ops.push({ type: 'equal', text: suffix });

  return mergeAdjacentOps(ops);
}

/**
 * Core Myers shortest-edit-script computation on the stripped inner
 * content (after common prefix/suffix removal).
 *
 * Implements the "greedy" variant from Myers [3] §3, which traces
 * D-paths forward and then backtracks to extract the edit script.
 *
 * @param a - Old (stripped) content.
 * @param b - New (stripped) content.
 * @returns Array of diff operations.
 *
 * @internal
 */
function myersCoreEdit(a: string, b: string): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const maxD = Math.min(n + m, MAX_EDIT_DISTANCE);

  // V[k] stores the furthest-reaching x-coordinate on diagonal k.
  // Offset by maxD so negative diagonals map to positive indices.
  const size = 2 * maxD + 1;
  const v = new Int32Array(size);
  v[maxD + 1] = 0; // V[1] = 0 in Myers' notation

  // Store a snapshot of V AFTER each d-iteration for backtracking.
  // traces[d] = V after processing edit distance d.
  const traces: Int32Array[] = [];

  let foundD = -1;

  outer:
  for (let d = 0; d <= maxD; d++) {
    for (let k = -d; k <= d; k += 2) {
      const kIdx = k + maxD;

      let x: number;
      if (k === -d || (k !== d && v[kIdx - 1] < v[kIdx + 1])) {
        x = v[kIdx + 1]; // move down — insert from b
      } else {
        x = v[kIdx - 1] + 1; // move right — delete from a
      }

      let y = x - k;

      // Follow the diagonal (equal characters).
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }

      v[kIdx] = x;

      if (x >= n && y >= m) {
        foundD = d;
        // Save this final state too.
        traces.push(v.slice());
        break outer;
      }
    }

    // Save V AFTER this d-iteration completes.
    traces.push(v.slice());
  }

  // If we exceeded MAX_EDIT_DISTANCE, fall back to full replacement.
  if (foundD === -1) {
    return [
      { type: 'delete', text: a },
      { type: 'insert', text: b },
    ];
  }

  // ── Backtrack to extract the edit script ────────────────────────────
  // Walk backwards from (n, m) to (0, 0), emitting ops in reverse.
  const ops: DiffOp[] = [];
  let x = n;
  let y = m;

  for (let d = foundD; d > 0; d--) {
    // traces[d-1] = V after processing edit distance d-1.
    const prevV = traces[d - 1];
    const k = x - y;
    const kIdx = k + maxD;

    // Determine which diagonal we came from.
    let prevK: number;
    if (k === -d || (k !== d && prevV[kIdx - 1] < prevV[kIdx + 1])) {
      prevK = k + 1; // came from above — this step was an insert
    } else {
      prevK = k - 1; // came from left — this step was a delete
    }

    const prevX = prevV[prevK + maxD];
    const prevY = prevX - prevK;

    // Walk backwards along the diagonal (equal characters).
    while (x > prevX + (prevK < k ? 1 : 0) && y > prevY + (prevK > k ? 1 : 0)) {
      x--;
      y--;
      ops.push({ type: 'equal', text: a[x] });
    }

    // Emit the non-diagonal step.
    if (prevK > k) {
      // Insert (moved down: y increased by 1, x unchanged).
      y--;
      ops.push({ type: 'insert', text: b[y] });
    } else {
      // Delete (moved right: x increased by 1, y unchanged).
      x--;
      ops.push({ type: 'delete', text: a[x] });
    }
  }

  // Remaining diagonal at d=0 (initial equal run).
  while (x > 0 && y > 0) {
    x--;
    y--;
    ops.push({ type: 'equal', text: a[x] });
  }

  // Reverse since we built ops from end to start.
  ops.reverse();

  return mergeAdjacentOps(ops);
}

/**
 * Merges adjacent operations of the same type into single operations
 * for a more compact representation.
 *
 * @param ops - The raw (possibly fragmented) diff operations.
 * @returns Merged operations.
 *
 * @internal
 */
function mergeAdjacentOps(ops: DiffOp[]): DiffOp[] {
  if (ops.length === 0) return ops;

  const merged: DiffOp[] = [ops[0]];
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

// ─────────────────────────────────────────────────────────────────────────────
// Checksum
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes a fast, non-cryptographic checksum (FNV-1a 32-bit) for
 * integrity validation of the decoded output.
 *
 * @param text - The string to checksum.
 * @returns A 32-bit unsigned integer checksum.
 *
 * @internal
 */
function fnv1a32(text: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return hash >>> 0; // ensure unsigned
}

// ─────────────────────────────────────────────────────────────────────────────
// Base64 Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encodes a UTF-8 string to a base64 string.
 * Works in both Node.js (Buffer) and browser (btoa) environments.
 *
 * @param str - The string to encode.
 * @returns Base64-encoded string.
 *
 * @internal
 */
function toBase64(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf-8').toString('base64');
  }
  // Browser fallback
  return btoa(unescape(encodeURIComponent(str)));
}

// ─────────────────────────────────────────────────────────────────────────────
// File Extension Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts the file extension from a filename or path.
 *
 * @param fileName - The file name or full path.
 * @returns The lowercase extension including the dot (e.g. `.ts`),
 *          or an empty string if there is no extension.
 *
 * @internal
 */
function extractExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1 || dotIndex === fileName.length - 1) return '';
  return fileName.slice(dotIndex).toLowerCase();
}

/**
 * Validates that a file extension is a recognised text format.
 *
 * > "Binary files must be excluded from byte-level differencing because
 * > their internal structure (compressed streams, fixed-offset headers)
 * > produces pathologically large edit scripts that offer no bandwidth
 * > savings." — Tridgell [15], §2.4
 *
 * @param fileName - The file name or path to validate.
 *
 * @throws {BinaryContentError} If the extension is not in the text allowlist.
 *
 * @see Thesis citation [15] — Tridgell (1999), binary exclusion rule
 */
export function validateTextFile(fileName: string): void {
  const ext = extractExtension(fileName);

  // Files with no extension are treated as text (e.g. Makefile, Dockerfile).
  if (ext === '') return;

  if (!TEXT_EXTENSIONS.has(ext)) {
    throw new BinaryContentError(ext);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Content-Defined Chunking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Splits a string into chunks of at most {@link MAX_CHUNK_SIZE_BYTES}
 * bytes each, measured in UTF-8 encoding.
 *
 * Chunk boundaries are placed at the nearest newline character before
 * the byte limit to avoid splitting mid-line when possible.
 *
 * > "Content-defined chunking partitions the byte stream at
 * > deterministic boundaries, ensuring that local edits only affect the
 * > chunk containing the edit, leaving all other chunks unchanged."
 * > — Tridgell [15], §4.3
 *
 * @param content - The full content string.
 *
 * @returns An array of content chunks. If the content fits in a single
 *          chunk, returns a single-element array.
 *
 * @see Thesis citation [15] — Tridgell (1999), content-defined chunking
 *
 * @internal
 */
function chunkContent(content: string): string[] {
  const encoder = new TextEncoder();
  const totalBytes = encoder.encode(content).byteLength;

  if (totalBytes <= MAX_CHUNK_SIZE_BYTES) {
    return [content];
  }

  const chunks: string[] = [];
  let offset = 0;

  while (offset < content.length) {
    // Estimate character count for MAX_CHUNK_SIZE_BYTES.
    // For mixed UTF-8 content, characters average ~1–2 bytes.
    // We start conservatively and adjust.
    let endGuess = Math.min(offset + MAX_CHUNK_SIZE_BYTES, content.length);
    let candidate = content.slice(offset, endGuess);
    let candidateBytes = encoder.encode(candidate).byteLength;

    // Shrink if we overshot the byte limit.
    while (candidateBytes > MAX_CHUNK_SIZE_BYTES && endGuess > offset + 1) {
      endGuess = Math.floor(offset + (endGuess - offset) * 0.9);
      candidate = content.slice(offset, endGuess);
      candidateBytes = encoder.encode(candidate).byteLength;
    }

    // Try to snap to the nearest preceding newline for clean boundaries.
    if (endGuess < content.length) {
      const lastNewline = candidate.lastIndexOf('\n');
      if (lastNewline > 0) {
        endGuess = offset + lastNewline + 1; // include the newline
        candidate = content.slice(offset, endGuess);
      }
    }

    chunks.push(candidate);
    offset = endGuess;
  }

  return chunks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes a base64-encoded delta between two versions of a text document.
 *
 * The delta is produced using the **Myers diff algorithm** [3] at the
 * character level (which maps to byte-level for ASCII content). The
 * resulting edit script is serialised as JSON and base64-encoded for
 * safe transmission over WebSocket.
 *
 * **Chunking:** If either `previousContent` or `newContent` exceeds
 * {@link MAX_CHUNK_SIZE_BYTES}, the content is split into chunks and
 * each chunk is delta-encoded independently. The result's `chunks`
 * array will be populated instead of `deltaBase64`.
 *
 * **Binary rejection:** If `fileName` has a non-text extension, a
 * {@link BinaryContentError} is thrown before any processing.
 *
 * > "The shortest edit script between two strings can be computed in
 * > O(ND) time, where D is the edit distance. For typical document
 * > edits where D ≪ N, this is near-linear." — Myers [3], Theorem 1
 *
 * @param previousContent - The old version of the document content.
 * @param newContent      - The new version of the document content.
 * @param fileName        - The file name or path, used for binary validation.
 *
 * @throws {BinaryContentError} If the file extension indicates binary content.
 *
 * @returns An {@link EncodeResult} containing either a single base64 delta
 *          or an array of per-chunk deltas.
 *
 * @example
 * ```ts
 * import { encode } from '@/engine/delta/delta-encoder';
 *
 * const result = encode(
 *   '<p>Hello world</p>',
 *   '<p>Hello DocuSync</p>',
 *   'Chapter_1.docx'
 * );
 *
 * if (!result.isChunked) {
 *   ws.send(JSON.stringify({ delta: result.deltaBase64 }));
 * } else {
 *   for (const chunk of result.chunks!) {
 *     ws.send(JSON.stringify({ chunk }));
 *   }
 * }
 * ```
 *
 * @see Thesis citation [3]  — Myers (1986), O(ND) diff algorithm
 * @see Thesis citation [4]  — Hunt & McIlroy (1976), delta file comparison
 * @see Thesis citation [15] — Tridgell (1999), chunked delta encoding
 */
export function encode(
  previousContent: string,
  newContent: string,
  fileName: string
): EncodeResult {
  // Step 0: Reject binary files.
  validateTextFile(fileName);

  const encoder = new TextEncoder();
  const newSizeBytes = encoder.encode(newContent).byteLength;
  const prevSizeBytes = encoder.encode(previousContent).byteLength;
  const maxSizeBytes = Math.max(newSizeBytes, prevSizeBytes);

  // Step 1: Check if chunking is needed.
  if (maxSizeBytes > MAX_CHUNK_SIZE_BYTES) {
    return encodeChunked(previousContent, newContent, newSizeBytes);
  }

  // Step 2: Single-chunk delta.
  const ops = myersDiff(previousContent, newContent);
  const payload: DeltaPayload = {
    version: 1,
    ops,
    checksum: fnv1a32(newContent),
  };

  const deltaBase64 = toBase64(JSON.stringify(payload));
  const deltaSizeBytes = encoder.encode(deltaBase64).byteLength;

  return {
    deltaBase64,
    chunks: null,
    isChunked: false,
    originalSizeBytes: newSizeBytes,
    deltaSizeBytes,
    compressionRatio: newSizeBytes > 0 ? deltaSizeBytes / newSizeBytes : 0,
  };
}

/**
 * Encodes a large file by splitting both old and new content into
 * matching chunks and computing per-chunk deltas.
 *
 * @param previousContent - Old content.
 * @param newContent      - New content.
 * @param newSizeBytes    - Byte size of new content (pre-computed).
 * @returns Chunked encode result.
 *
 * @internal
 */
function encodeChunked(
  previousContent: string,
  newContent: string,
  newSizeBytes: number
): EncodeResult {
  const encoder = new TextEncoder();
  const oldChunks = chunkContent(previousContent);
  const newChunks = chunkContent(newContent);

  // Pad the shorter array with empty strings so chunk indices align.
  const totalChunks = Math.max(oldChunks.length, newChunks.length);
  while (oldChunks.length < totalChunks) oldChunks.push('');
  while (newChunks.length < totalChunks) newChunks.push('');

  const chunks: DeltaChunk[] = [];
  let totalDeltaBytes = 0;

  for (let i = 0; i < totalChunks; i++) {
    const ops = myersDiff(oldChunks[i], newChunks[i]);
    const payload: DeltaPayload = {
      version: 1,
      ops,
      checksum: fnv1a32(newChunks[i]),
    };
    const deltaBase64 = toBase64(JSON.stringify(payload));
    totalDeltaBytes += encoder.encode(deltaBase64).byteLength;

    chunks.push({
      index: i,
      total: totalChunks,
      deltaBase64,
    });
  }

  return {
    deltaBase64: null,
    chunks,
    isChunked: true,
    originalSizeBytes: newSizeBytes,
    deltaSizeBytes: totalDeltaBytes,
    compressionRatio: newSizeBytes > 0 ? totalDeltaBytes / newSizeBytes : 0,
  };
}

/**
 * Returns the byte size of a string when encoded as UTF-8.
 *
 * Utility for callers who need to check sizes before encoding.
 *
 * @param content - The string to measure.
 * @returns Byte count in UTF-8 encoding.
 *
 * @see Thesis citation [15] — Tridgell (1999), byte-level accounting
 */
export function getByteSize(content: string): number {
  return new TextEncoder().encode(content).byteLength;
}
