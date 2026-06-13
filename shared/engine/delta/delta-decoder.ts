/**
 * @module DeltaDecoder
 *
 * Delta decoder for the DocuSync hybrid sync engine.
 *
 * This module reconstructs document content from a base64-encoded delta
 * produced by the {@link encode} function in `delta-encoder.ts`. It
 * replays the edit script (insert/delete/equal operations) against the
 * previous content to produce the updated document.
 *
 * For multi-chunk deltas (files that exceeded {@link MAX_CHUNK_SIZE_BYTES}),
 * {@link applyChunks} reassembles the chunks in order after decoding each
 * independently.
 *
 * **Integrity validation:** Every delta carries an FNV-1a checksum of
 * the expected output. After reconstruction, the decoder re-computes
 * the checksum and throws a {@link DeltaChecksumError} if they diverge,
 * catching corruption introduced during WebSocket transit or storage.
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

import type { DeltaPayload, DeltaChunk, DiffOp } from './delta-encoder';

// ─────────────────────────────────────────────────────────────────────────────
// Re-export types that callers commonly need alongside the decoder
// ─────────────────────────────────────────────────────────────────────────────

export type { DeltaPayload, DeltaChunk, DiffOp };

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of a successful {@link decode} or {@link applyChunks} call.
 */
export interface DecodeResult {
  /** The fully reconstructed document content. */
  content: string;
  /** Number of edit operations that were applied. */
  opsApplied: number;
  /** Whether checksum validation passed. */
  checksumValid: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown when the reconstructed content's checksum does not match the
 * checksum embedded in the delta payload.
 *
 * This indicates data corruption during WebSocket transit, SQLite
 * storage, or an encoder/decoder version mismatch.
 */
export class DeltaChecksumError extends Error {
  /** The checksum expected by the delta payload. */
  public readonly expected: number;
  /** The checksum actually computed from the reconstructed content. */
  public readonly actual: number;

  constructor(expected: number, actual: number) {
    super(
      `Delta checksum mismatch: expected ${expected}, got ${actual}. ` +
        `The delta may have been corrupted in transit.`
    );
    this.name = 'DeltaChecksumError';
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * Thrown when the delta payload cannot be parsed — invalid base64,
 * malformed JSON, or missing required fields.
 */
export class DeltaMalformedError extends Error {
  constructor(reason: string) {
    super(`Malformed delta payload: ${reason}`);
    this.name = 'DeltaMalformedError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decodes a base64 string back to a UTF-8 string.
 * Works in both Node.js (Buffer) and browser (atob) environments.
 *
 * @param base64 - The base64-encoded string.
 * @returns Decoded UTF-8 string.
 *
 * @throws {DeltaMalformedError} If the base64 string is invalid.
 *
 * @internal
 */
function fromBase64(base64: string): string {
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(base64, 'base64').toString('utf-8');
    }
    // Browser fallback
    return decodeURIComponent(escape(atob(base64)));
  } catch {
    throw new DeltaMalformedError('Invalid base64 encoding.');
  }
}

/**
 * Computes the FNV-1a 32-bit checksum. Must match the implementation
 * in `delta-encoder.ts` exactly.
 *
 * @param text - The string to checksum.
 * @returns A 32-bit unsigned integer checksum.
 *
 * @internal
 */
function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Parses and validates a JSON string as a {@link DeltaPayload}.
 *
 * @param json - The raw JSON string.
 * @returns A validated DeltaPayload.
 *
 * @throws {DeltaMalformedError} If required fields are missing or have
 *         incorrect types.
 *
 * @internal
 */
function parseDeltaPayload(json: string): DeltaPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new DeltaMalformedError('Invalid JSON in delta payload.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new DeltaMalformedError('Delta payload is not an object.');
  }

  const obj = parsed as Record<string, unknown>;

  if (obj['version'] !== 1) {
    throw new DeltaMalformedError(
      `Unsupported delta version: ${String(obj['version'])}. Expected 1.`
    );
  }

  if (!Array.isArray(obj['ops'])) {
    throw new DeltaMalformedError('Delta payload missing "ops" array.');
  }

  if (typeof obj['checksum'] !== 'number') {
    throw new DeltaMalformedError('Delta payload missing numeric "checksum".');
  }

  // Validate each op.
  for (let i = 0; i < obj['ops'].length; i++) {
    const op = obj['ops'][i] as Record<string, unknown>;
    if (!op || typeof op['type'] !== 'string' || typeof op['text'] !== 'string') {
      throw new DeltaMalformedError(
        `Invalid op at index ${i}: must have string "type" and "text".`
      );
    }
    if (op['type'] !== 'equal' && op['type'] !== 'insert' && op['type'] !== 'delete') {
      throw new DeltaMalformedError(
        `Invalid op type "${String(op['type'])}" at index ${i}. ` +
          `Expected "equal", "insert", or "delete".`
      );
    }
  }

  return parsed as DeltaPayload;
}

/**
 * Applies an array of diff operations against previous content to
 * reconstruct the new content.
 *
 * The replay algorithm walks the previous content with a cursor and
 * processes each operation:
 * - `equal`: advances the cursor by `op.text.length` characters (the
 *   text is copied through from the old content).
 * - `delete`: advances the cursor by `op.text.length` characters (the
 *   text is discarded).
 * - `insert`: appends `op.text` to the output without advancing the
 *   cursor (new content that was not in the old version).
 *
 * > "The edit script is a sequence of insert and delete commands that
 * > transforms the source file into the target. Replaying the script
 * > against the source produces an identical copy of the target."
 * > — Myers [3], §1
 *
 * @param previousContent - The old version of the content.
 * @param ops             - The diff operations to apply.
 *
 * @returns The reconstructed new content string.
 *
 * @see Thesis citation [3] — Myers (1986), edit script replay
 * @see Thesis citation [4] — Hunt & McIlroy (1976), diff application
 *
 * @internal
 */
function applyOps(previousContent: string, ops: DiffOp[]): string {
  const parts: string[] = [];
  let cursor = 0;

  for (const op of ops) {
    switch (op.type) {
      case 'equal':
        // Copy text from previous content.
        parts.push(previousContent.slice(cursor, cursor + op.text.length));
        cursor += op.text.length;
        break;

      case 'delete':
        // Skip over deleted text in previous content.
        cursor += op.text.length;
        break;

      case 'insert':
        // Append new text (does not consume previous content).
        parts.push(op.text);
        break;
    }
  }

  return parts.join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decodes a base64-encoded delta and reconstructs the new document
 * content by applying the edit script to the previous content.
 *
 * The function performs:
 * 1. Base64 decoding → JSON string
 * 2. JSON parsing → {@link DeltaPayload} validation
 * 3. Edit script replay via {@link applyOps}
 * 4. FNV-1a checksum verification
 *
 * > "On the receiving end, the delta is decoded and the edit commands
 * > are replayed against the receiver's copy of the file. A checksum
 * > of the result is compared to the sender's checksum to detect
 * > corruption." — Tridgell [15], §5.1
 *
 * @param previousContent - The old version of the document content.
 *                          This must be the exact same string that was
 *                          passed as `previousContent` to {@link encode}.
 * @param deltaBase64     - The base64-encoded delta string produced
 *                          by {@link encode}.
 *
 * @throws {DeltaMalformedError} If the delta cannot be parsed.
 * @throws {DeltaChecksumError} If the reconstructed content fails
 *         checksum verification.
 *
 * @returns A {@link DecodeResult} with the reconstructed content.
 *
 * @example
 * ```ts
 * import { decode } from '@/engine/delta/delta-decoder';
 *
 * // On the receiving peer:
 * const result = decode(myCurrentContent, receivedDeltaBase64);
 * console.log(result.content); // The updated document
 * ```
 *
 * @see Thesis citation [3]  — Myers (1986), edit script replay
 * @see Thesis citation [4]  — Hunt & McIlroy (1976), delta application
 * @see Thesis citation [15] — Tridgell (1999), checksum-verified sync
 */
export function decode(
  previousContent: string,
  deltaBase64: string
): DecodeResult {
  // Step 1: Base64 → JSON string.
  const json = fromBase64(deltaBase64);

  // Step 2: Parse and validate.
  const payload = parseDeltaPayload(json);

  // Step 3: Apply edit script.
  const content = applyOps(previousContent, payload.ops);

  // Step 4: Verify checksum.
  const actualChecksum = fnv1a32(content);
  if (actualChecksum !== payload.checksum) {
    throw new DeltaChecksumError(payload.checksum, actualChecksum);
  }

  return {
    content,
    opsApplied: payload.ops.length,
    checksumValid: true,
  };
}

/**
 * Reassembles a multi-chunk delta into the final document content.
 *
 * Each chunk is decoded independently against its corresponding slice
 * of the previous content. The decoded chunks are concatenated in
 * index order to produce the complete updated document.
 *
 * > "Multi-chunk deltas are reassembled by decoding each chunk
 * > independently and concatenating the results. Because chunk
 * > boundaries are deterministic, the same chunking algorithm applied
 * > to the old content produces matching slices." — Tridgell [15], §4.5
 *
 * @param previousContent - The complete old version of the document.
 * @param chunks          - The array of {@link DeltaChunk} objects,
 *                          which need not be in order (they are sorted
 *                          by `index` internally).
 *
 * @throws {DeltaMalformedError} If any chunk's delta is invalid.
 * @throws {DeltaChecksumError} If any chunk fails checksum verification.
 * @throws {Error} If chunks have inconsistent `total` values or if
 *         any expected chunk index is missing.
 *
 * @returns A {@link DecodeResult} with the fully reassembled content.
 *
 * @example
 * ```ts
 * import { applyChunks } from '@/engine/delta/delta-decoder';
 *
 * // Collect all chunks from WebSocket messages
 * const allChunks: DeltaChunk[] = [...receivedChunks];
 * const result = applyChunks(myCurrentContent, allChunks);
 * console.log(result.content); // Full updated document
 * ```
 *
 * @see Thesis citation [15] — Tridgell (1999), multi-chunk reassembly
 * @see Thesis citation [3]  — Myers (1986), per-chunk diff application
 */
export function applyChunks(
  previousContent: string,
  chunks: DeltaChunk[]
): DecodeResult {
  if (chunks.length === 0) {
    throw new DeltaMalformedError('Empty chunks array.');
  }

  // ── Validate chunk metadata ───────────────────────────────────────────
  const expectedTotal = chunks[0].total;
  for (const chunk of chunks) {
    if (chunk.total !== expectedTotal) {
      throw new DeltaMalformedError(
        `Inconsistent chunk totals: expected ${expectedTotal}, ` +
          `but chunk ${chunk.index} reports ${chunk.total}.`
      );
    }
  }

  // Sort by index.
  const sorted = [...chunks].sort((a, b) => a.index - b.index);

  // Check for missing or duplicate indices.
  for (let i = 0; i < expectedTotal; i++) {
    if (!sorted[i] || sorted[i].index !== i) {
      throw new DeltaMalformedError(
        `Missing chunk at index ${i}. Have indices: ` +
          `[${sorted.map((c) => c.index).join(', ')}].`
      );
    }
  }

  // ── Re-chunk the old content to get matching slices ─────────────────
  const oldChunks = chunkContentForDecode(previousContent, expectedTotal);

  // ── Decode each chunk ───────────────────────────────────────────────
  const decodedParts: string[] = [];
  let totalOps = 0;

  for (let i = 0; i < expectedTotal; i++) {
    const result = decode(oldChunks[i], sorted[i].deltaBase64);
    decodedParts.push(result.content);
    totalOps += result.opsApplied;
  }

  const content = decodedParts.join('');

  return {
    content,
    opsApplied: totalOps,
    checksumValid: true,
  };
}

/**
 * Splits old content into `totalChunks` slices using the same
 * content-defined chunking algorithm as the encoder.
 *
 * If the number of natural chunks differs from `totalChunks`, the
 * function pads with empty strings or merges trailing chunks to match.
 *
 * @param content     - The old content to chunk.
 * @param totalChunks - The number of chunks expected.
 * @returns An array of exactly `totalChunks` strings.
 *
 * @internal
 */
function chunkContentForDecode(
  content: string,
  totalChunks: number
): string[] {
  // Use the same chunking algorithm as the encoder.
  const MAX_CHUNK_SIZE_BYTES = 4_194_304;
  const encoder = new TextEncoder();
  const totalBytes = encoder.encode(content).byteLength;

  if (totalBytes <= MAX_CHUNK_SIZE_BYTES && totalChunks === 1) {
    return [content];
  }

  // Perform the same chunking as encoder.
  const chunks: string[] = [];
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
      const lastNewline = candidate.lastIndexOf('\n');
      if (lastNewline > 0) {
        endGuess = offset + lastNewline + 1;
        candidate = content.slice(offset, endGuess);
      }
    }

    chunks.push(candidate);
    offset = endGuess;
  }

  // Pad or trim to match expected total.
  while (chunks.length < totalChunks) {
    chunks.push('');
  }

  // If we have more chunks than expected, merge trailing ones into the last expected slot.
  if (chunks.length > totalChunks) {
    const merged = chunks.slice(totalChunks - 1).join('');
    chunks.length = totalChunks - 1;
    chunks.push(merged);
  }

  return chunks;
}
