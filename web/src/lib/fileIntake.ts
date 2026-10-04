/**
 * What DocuSync will accept as a document, and how it decides.
 *
 * DocuSync edits text collaboratively: an imported file becomes an editable
 * document, which peers then diff and merge. That design only works on text,
 * so the uploader has always refused binary formats — but it refused them
 * with a BLOCKLIST, naming the extensions it knew about and letting
 * everything else through to `file.text()`.
 *
 * `file.text()` decodes bytes as UTF-8. Bytes that are not valid UTF-8 are
 * not rejected, they are replaced with U+FFFD, one per bad sequence. The
 * result is a plausible-looking string that cannot be turned back into the
 * file. Measured against a real spreadsheet: 725 bytes in, 1055 bytes of
 * replacement characters stored, and because `PK\x03\x04` is ASCII the saved
 * data still began with a valid ZIP signature — so the file passed a
 * magic-number check while its contents had been destroyed. `.xlsx` and
 * `.pptx` were simply missing from the blocklist. So were `.odt`, `.epub`,
 * `.key`, `.pages`, and every format nobody thought of.
 *
 * The gate is now the list of formats the application can actually read,
 * and the bytes are checked as well as the name: a file is accepted only if
 * decoding it as text is reversible. That second check is what makes this
 * robust against the next format nobody thought of, since it does not
 * depend on the extension being recognised at all.
 *
 * What this module does NOT do is preserve binary files. DocuSync has no
 * binary synchronisation path — no block-level chunking, no byte-level
 * delta, nowhere that stores an opaque blob — and this module does not
 * pretend otherwise. It refuses such files clearly instead of accepting
 * them and ruining them.
 */

import { ACCEPTED_UPLOAD_EXTS } from './exportDocument';

/** The extension of a file name, lowercased, with its dot. '' if none. */
export function extensionOf(fileName: string): string {
  const match = /(\.[^./\\]+)$/.exec(fileName || '');
  return match ? match[1].toLowerCase() : '';
}

/**
 * Is this a format the editor can read?
 *
 * An allowlist, not a blocklist. The previous gate named the binary types it
 * knew to refuse, so every type it had not heard of was treated as text.
 */
export function isAcceptedUpload(fileName: string): boolean {
  return ACCEPTED_UPLOAD_EXTS.includes(extensionOf(fileName));
}

/** Why a file was refused, in words a user can act on. */
export function rejectionReason(fileName: string): string {
  const ext = extensionOf(fileName);
  const list = ACCEPTED_UPLOAD_EXTS.join(', ');
  if (!ext) {
    return `This file has no extension, so DocuSync cannot tell what format it is. `
      + `Documents can be imported as: ${list}.`;
  }
  return `DocuSync edits documents as text, so that peers can merge each other's `
    + `changes line by line. ${ext} is not a text format and would have to be `
    + `converted to be stored, which would not survive being converted back — `
    + `so it is refused rather than damaged. Documents can be imported as: ${list}.`;
}

/** The outcome of trying to read a file's bytes as text. */
export type TextDecodeResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

/**
 * Decodes bytes as UTF-8 only if doing so loses nothing.
 *
 * The test is the round trip: text that came from these bytes must encode
 * back to exactly these bytes. Where it does not, the decoder has silently
 * substituted replacement characters, and keeping the result would mean
 * storing something that is no longer the file. A NUL byte is refused
 * outright — it survives the round trip, but nothing the editor can
 * meaningfully display contains one, and it is the clearest single signal
 * that the data is not a document.
 *
 * This is the check that does not depend on knowing the format. A `.txt`
 * that is really a renamed archive fails here, and so would any binary
 * format added to the allowlist by mistake.
 */
export function decodeAsText(bytes: Uint8Array): TextDecodeResult {
  if (bytes.includes(0)) {
    return { ok: false, reason: 'the file contains binary data (a zero byte), so it is not text' };
  }

  let text: string;
  try {
    // `fatal` makes the decoder throw on an invalid sequence instead of
    // quietly substituting U+FFFD, which is the behaviour that destroyed
    // files here.
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, reason: 'the file is not valid UTF-8 text' };
  }

  // Belt and braces: confirm the round trip byte for byte, in case a
  // platform's decoder is more forgiving than its flag suggests.
  const reEncoded = new TextEncoder().encode(text);
  if (reEncoded.length !== bytes.length) {
    return { ok: false, reason: 'the file does not survive being read as text' };
  }
  for (let i = 0; i < bytes.length; i++) {
    if (reEncoded[i] !== bytes[i]) {
      return { ok: false, reason: 'the file does not survive being read as text' };
    }
  }

  return { ok: true, text };
}

/**
 * Reads an uploaded file as text, refusing anything that would be damaged.
 *
 * Reads the bytes rather than calling `file.text()`, because `file.text()`
 * is the lossy step: it has no way to report that the decode went wrong.
 */
export async function readUploadAsText(file: File): Promise<TextDecodeResult> {
  if (!isAcceptedUpload(file.name)) {
    return { ok: false, reason: rejectionReason(file.name) };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const decoded = decodeAsText(bytes);
  if (!decoded.ok) {
    return {
      ok: false,
      reason: `"${file.name}" is named like a text document but ${decoded.reason}. `
        + `It has not been imported, because storing it would have replaced the parts `
        + `that are not text and the file could not be recovered afterwards.`,
    };
  }
  return decoded;
}
