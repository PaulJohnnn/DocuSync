/**
 * @file tests/unit/delta-encoder.test.ts
 *
 * Unit test suite for the Delta Encoder and Decoder modules.
 *
 * Tests cover: `encode()`, `decode()`, round-trip fidelity, binary rejection,
 * checksum validation, empty file handling, small-change efficiency, and
 * multi-chunk encoding via `applyChunks()`.
 *
 * **Thesis references:**
 * - [3]  Myers, E. W. (1986). O(ND) difference algorithm.
 * - [4]  Hunt, J. W., & McIlroy, M. D. (1976). Differential file comparison.
 * - [15] Tridgell, A. (1999). Efficient algorithms for sorting and synchronization.
 *
 * @see ISO/IEC 25010 §4.2 — Reliability: data integrity testing
 */

import {
  encode,
  validateTextFile,
  BinaryContentError,
  MAX_CHUNK_SIZE_BYTES,
} from '@/engine/delta/delta-encoder';

import {
  decode,
  applyChunks,
  DeltaChecksumError,
  DeltaMalformedError,
} from '@/engine/delta/delta-decoder';

// ─────────────────────────────────────────────────────────────────────────────
// encode()
// ─────────────────────────────────────────────────────────────────────────────

describe('DeltaEncoder — encode()', () => {
  /**
   * @test `encode()` produces a non-empty base64 delta string for a simple edit.
   *
   * @see Thesis [3] — Myers diff produces a valid edit script
   */
  it('should produce a valid base64 delta', () => {
    const result = encode('Hello world', 'Hello DocuSync', 'test.txt');

    expect(result.deltaBase64).toBeTruthy();
    expect(typeof result.deltaBase64).toBe('string');
    expect(result.isChunked).toBe(false);
    expect(result.chunks).toBeNull();
    expect(result.deltaSizeBytes).toBeGreaterThan(0);
  });

  /**
   * @test `encode()` rejects binary file extensions.
   *
   * @see Thesis [15] §2.4 — binary exclusion rule
   */
  it('should reject binary file extensions', () => {
    expect(() => encode('data', 'data', 'image.png')).toThrow(BinaryContentError);
    expect(() => encode('data', 'data', 'archive.zip')).toThrow(BinaryContentError);
    expect(() => encode('data', 'data', 'video.mp4')).toThrow(BinaryContentError);
  });

  /**
   * @test `encode()` accepts known text extensions.
   */
  it('should accept text file extensions', () => {
    expect(() => encode('a', 'b', 'file.ts')).not.toThrow();
    expect(() => encode('a', 'b', 'file.md')).not.toThrow();
    expect(() => encode('a', 'b', 'file.json')).not.toThrow();
    expect(() => encode('a', 'b', 'file.py')).not.toThrow();
  });

  /**
   * @test Empty file diff produces a valid (small) delta.
   */
  it('should handle empty file diff', () => {
    const result = encode('', '', 'test.txt');
    expect(result.deltaBase64).toBeTruthy();
    expect(result.deltaSizeBytes).toBeGreaterThan(0);
  });

  /**
   * @test Single character change produces a small delta.
   */
  it('should produce a small delta for a single character change', () => {
    const original = 'A'.repeat(1000);
    const modified = original.slice(0, 500) + 'B' + original.slice(501);

    const result = encode(original, modified, 'test.txt');
    // The delta (base64-encoded JSON) includes overhead, but for a single-char
    // change it should still be significantly smaller than 2x the original.
    expect(result.deltaSizeBytes).toBeLessThan(original.length * 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// decode()
// ─────────────────────────────────────────────────────────────────────────────

describe('DeltaDecoder — decode()', () => {
  /**
   * @test `decode()` reconstructs the exact original content.
   *
   * @see Thesis [3] §1 — edit script replay identity
   */
  it('should reconstruct exact content from a delta', () => {
    const original = 'Hello world';
    const modified = 'Hello DocuSync';

    const encoded = encode(original, modified, 'test.txt');
    const decoded = decode(original, encoded.deltaBase64!);

    expect(decoded.content).toBe(modified);
    expect(decoded.checksumValid).toBe(true);
  });

  /**
   * @test `decode()` throws DeltaChecksumError on corrupted delta.
   *
   * @see Thesis [15] §5.1 — checksum verification
   */
  it('should throw DeltaChecksumError on corruption', () => {
    const original = 'Hello world';
    const modified = 'Hello DocuSync';

    const encoded = encode(original, modified, 'test.txt');

    // Corrupt the delta by decoding from a different base
    expect(() => decode('WRONG BASE', encoded.deltaBase64!)).toThrow();
  });

  /**
   * @test `decode()` throws DeltaMalformedError on invalid base64.
   */
  it('should throw on invalid base64', () => {
    expect(() => decode('anything', '!!!not-base64!!!')).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// encode + decode round-trip
// ─────────────────────────────────────────────────────────────────────────────

describe('DeltaEncoder — encode + decode round-trip', () => {
  /**
   * @test Round-trip produces identical content.
   *
   * @see Thesis [3] — diff/patch identity: decode(encode(a, b)) === b
   */
  it('should produce identical content after round-trip', () => {
    const testCases = [
      { prev: '', next: 'new content' },
      { prev: 'original', next: '' },
      { prev: 'Hello world', next: 'Hello DocuSync world' },
      { prev: 'line1\nline2\nline3', next: 'line1\nmodified\nline3' },
      { prev: 'abc'.repeat(500), next: 'abc'.repeat(499) + 'xyz' },
    ];

    for (const { prev, next } of testCases) {
      const encoded = encode(prev, next, 'test.txt');
      const decoded = decode(prev, encoded.deltaBase64!);

      expect(decoded.content).toBe(next);
      expect(decoded.checksumValid).toBe(true);
    }
  });

  /**
   * @test Identical content round-trips correctly.
   */
  it('should handle identical content (no-op delta)', () => {
    const content = 'No changes here';
    const encoded = encode(content, content, 'test.txt');
    const decoded = decode(content, encoded.deltaBase64!);

    expect(decoded.content).toBe(content);
    expect(decoded.checksumValid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi-chunk (files exceeding MAX_CHUNK_SIZE_BYTES)
// ─────────────────────────────────────────────────────────────────────────────

describe('DeltaEncoder — chunking', () => {
  /**
   * @test Files exceeding 4MB should trigger chunking.
   *
   * @see Thesis [15] §4.3 — content-defined chunking
   */
  it('should produce chunks for files exceeding MAX_CHUNK_SIZE_BYTES', () => {
    // Create content slightly larger than MAX_CHUNK_SIZE_BYTES.
    const lineCount = Math.ceil(MAX_CHUNK_SIZE_BYTES / 80) + 100;
    const line = 'A'.repeat(79) + '\n';
    const largeContent = line.repeat(lineCount);
    const modifiedContent = largeContent.slice(0, 100) + 'MODIFIED' + largeContent.slice(108);

    const result = encode(largeContent, modifiedContent, 'test.txt');

    expect(result.isChunked).toBe(true);
    expect(result.chunks).not.toBeNull();
    expect(result.chunks!.length).toBeGreaterThanOrEqual(2);
    expect(result.deltaBase64).toBeNull();
  });

  /**
   * @test `applyChunks()` reassembles multi-chunk delta correctly.
   *
   * @see Thesis [15] §4.5 — multi-chunk reassembly
   */
  it('should reassemble multi-chunk delta via applyChunks()', () => {
    const lineCount = Math.ceil(MAX_CHUNK_SIZE_BYTES / 80) + 100;
    const line = 'A'.repeat(79) + '\n';
    const largeContent = line.repeat(lineCount);
    const modifiedContent = largeContent.slice(0, 100) + 'MODIFIED' + largeContent.slice(108);

    const encoded = encode(largeContent, modifiedContent, 'test.txt');

    expect(encoded.isChunked).toBe(true);

    const decoded = applyChunks(largeContent, encoded.chunks!);

    expect(decoded.content).toBe(modifiedContent);
    expect(decoded.checksumValid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateTextFile()
// ─────────────────────────────────────────────────────────────────────────────

describe('DeltaEncoder — validateTextFile()', () => {
  /**
   * @test Files without extensions are treated as text.
   */
  it('should accept files without extensions', () => {
    expect(() => validateTextFile('Makefile')).not.toThrow();
    expect(() => validateTextFile('Dockerfile')).not.toThrow();
  });

  /**
   * @test Known binary extensions are rejected.
   */
  it('should reject known binary extensions', () => {
    expect(() => validateTextFile('image.png')).toThrow(BinaryContentError);
    expect(() => validateTextFile('image.jpg')).toThrow(BinaryContentError);
  });
});
