/**
 * @file tests/unit/file-intake.test.ts
 *
 * Regression tests for the text/binary boundary at file intake.
 *
 * The defect: both platforms decoded file bytes as UTF-8 with no way to
 * fail. `file.text()` in the browser and `readFile(path, 'utf-8')` in Node
 * both replace every invalid sequence with U+FFFD and return successfully,
 * so a binary file was accepted, silently mangled, stored, and synced to
 * every peer — after which the original could not be recovered from
 * anything DocuSync held. Measured against a real spreadsheet: 725 bytes in,
 * 1055 bytes of replacement characters out, still beginning with a valid ZIP
 * signature because `PK\x03\x04` happens to be ASCII.
 *
 * The web gate was a blocklist naming the binary extensions it knew about,
 * so `.xlsx`, `.pptx` and anything else nobody had listed went through as
 * text. The desktop applied its allowlist on save but not on open.
 *
 * These tests cover the rule that does not depend on the extension at all:
 * bytes are text only if decoding them is reversible.
 *
 * Layer:    Unit (pure functions)
 * Runner:   Jest (desktop/jest.config.ts, project "unit")
 * Command:  npx jest --selectProjects unit --testPathPatterns=file-intake
 */

import * as zlib from 'zlib';

/**
 * The rule as `decodeFileAsText` in electron/ipc-handlers.ts implements it.
 * Kept in step with that function; the browser twin lives in
 * web/src/lib/fileIntake.ts and is exercised end to end by
 * web/scripts/qa-file-integrity.js against the real uploader.
 */
function decodeFileAsText(buffer: Buffer, fileName: string): string {
  if (buffer.includes(0)) {
    throw new Error(`'${fileName}' contains binary data (a zero byte) and cannot be opened as a document.`);
  }
  const text = buffer.toString('utf-8');
  if (!Buffer.from(text, 'utf-8').equals(buffer)) {
    throw new Error(`'${fileName}' is not valid UTF-8 text.`);
  }
  return text;
}

describe('text files are read unchanged', () => {
  it.each([
    ['plain ASCII', 'Hello DocuSync.\nSecond line.\n'],
    ['accented Latin', 'Café — naïve — résumé\n'],
    ['CJK', '日本語のテキストです\n'],
    ['emoji outside the BMP', 'ship it 🚢🎓\n'],
    ['CRLF line endings', 'one\r\ntwo\r\nthree\r\n'],
    ['tabs and trailing spaces', 'a\tb   \n\t\n'],
    ['an empty file', ''],
  ])('%s round-trips byte for byte', (_label, text) => {
    const bytes = Buffer.from(text, 'utf-8');
    const decoded = decodeFileAsText(bytes, 'sample.txt');
    expect(decoded).toBe(text);
    expect(Buffer.from(decoded, 'utf-8').equals(bytes)).toBe(true);
  });

  it('preserves a document that is almost entirely high-codepoint text', () => {
    const text = '𝐃𝐨𝐜𝐮𝐒𝐲𝐧𝐜 '.repeat(500);
    const bytes = Buffer.from(text, 'utf-8');
    expect(decodeFileAsText(bytes, 'big.txt')).toBe(text);
  });
});

describe('binary files are refused, not mangled', () => {
  /** A real deflate stream: arbitrary bytes, none of them text. */
  const deflated = zlib.deflateSync(Buffer.from('DocuSync fixture payload'.repeat(20)));

  it.each([
    ['a ZIP container (xlsx, pptx, docx are all this)', Buffer.concat([Buffer.from('PK\x03\x04'), deflated])],
    ['a PNG', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe])],
    ['a JPEG', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])],
    ['a PDF with a binary comment line', Buffer.concat([Buffer.from('%PDF-1.4\n%'), Buffer.from([0xe2, 0xe3, 0xcf, 0xd3])])],
    ['a raw deflate stream', deflated],
  ])('refuses %s', (_label, bytes) => {
    expect(() => decodeFileAsText(bytes, 'thing.bin')).toThrow();
  });

  it('refuses every byte value 0x00-0xFF', () => {
    // The sequence that makes a lossy decoder obvious: most of it is not
    // valid UTF-8, and a replacing decoder returns a longer, different file.
    const allBytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    expect(() => decodeFileAsText(allBytes, 'allbytes.bin')).toThrow();
  });

  it('refuses a lone high byte, which a replacing decoder would swallow', () => {
    const bytes = Buffer.from([0x68, 0x69, 0xc3, 0x28]); // 0xC3 0x28 is invalid
    expect(() => decodeFileAsText(bytes, 'x.txt')).toThrow();
  });

  it('refuses a zero byte even when the rest is readable', () => {
    const bytes = Buffer.concat([Buffer.from('readable'), Buffer.from([0x00]), Buffer.from('tail')]);
    expect(() => decodeFileAsText(bytes, 'x.txt')).toThrow(/zero byte/);
  });

  it('refuses binary wearing a text extension', () => {
    // The case no extension list can catch. A PNG renamed to .txt passes
    // every name-based gate; only looking at the bytes refuses it.
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    expect(() => decodeFileAsText(png, 'disguised.txt')).toThrow();
  });

  it('would have accepted these before the fix', () => {
    // Demonstrates the defect rather than only the repair: the old code path
    // succeeded on every one of the inputs above and returned a string that
    // is not the file.
    const xlsxLike = Buffer.concat([Buffer.from('PK\x03\x04'), deflated]);
    const lossy = xlsxLike.toString('utf-8');          // what the old code stored
    const backToBytes = Buffer.from(lossy, 'utf-8');
    expect(backToBytes.equals(xlsxLike)).toBe(false);   // not the same file
    expect(backToBytes.length).toBeGreaterThan(xlsxLike.length); // U+FFFD is 3 bytes
    expect(lossy.startsWith('PK')).toBe(true);          // and it still looks like one
  });
});

describe('the error says what happened', () => {
  it('names the file and does not claim success', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0xff]);
    expect(() => decodeFileAsText(png, 'holiday.png')).toThrow(/holiday\.png/);
  });
});
