/**
 * When are two saved versions of a document the same version?
 *
 * The history log compared the stored HTML as a string, so a save that
 * changed nothing a reader could see still counted as a new version. Pressing
 * Enter and not typing leaves `<p></p>` behind; the editor re-serialises the
 * same paragraph as `<p><br></p>` or `<p>&nbsp;</p>` depending on how it was
 * reached; the merge inserts a newline between block tags where the editor
 * emits none. Each of those is a different string and an identical page, and
 * the version list filled with entries nobody could tell apart — four rows
 * reading "Nakatira sa mabuhay / pepe", four times over.
 *
 * The signature is what the page actually renders: its words, and the block
 * structure that carries them. Two documents with the same signature are the
 * same version however their markup was spelled.
 *
 * Structure is kept rather than reduced to plain text, because a heading
 * demoted to a paragraph IS a change a reader sees, even though the words are
 * untouched. Inline formatting is kept for the same reason.
 *
 * Pure string work, no DOM: this runs on the server (the history log) and in
 * the browser (the version list), and both have to agree.
 */

/** Block elements whose emptiness is invisible on the page. */
const BLOCK_TAGS = 'p|div|h[1-6]|li|blockquote|pre|td|th|figcaption';

/**
 * A block holding nothing but line breaks, non-breaking spaces or whitespace.
 * Written to allow attributes, since the editor stamps alignment and
 * indentation onto paragraphs that are otherwise empty.
 */
const EMPTY_BLOCK = new RegExp(
  `<(${BLOCK_TAGS})(\\s[^>]*)?>(\\s|&nbsp;|&#160;| |<br\\s*/?>)*</\\1>`,
  'gi'
);

/**
 * The rendered identity of a document.
 *
 * @param html - Stored document markup.
 * @returns A string equal for any two documents that render the same.
 */
export function documentSignature(html: string | null | undefined): string {
  if (typeof html !== 'string') return '';

  let s = html;

  // Blocks that render as nothing. Repeated, because removing one can leave
  // its parent empty in turn — an empty list item inside an otherwise empty
  // list, say. Bounded so a pathological document cannot spin here.
  for (let pass = 0; pass < 8; pass++) {
    const next = s.replace(EMPTY_BLOCK, '');
    if (next === s) break;
    s = next;
  }

  return s
    // Every flavour of space is one space, so a non-breaking space typed by
    // the user and one emitted by the serialiser compare equal.
    .replace(/&nbsp;|&#160;| /gi, ' ')
    // A line break between block tags is the merge's doing, not the author's.
    .replace(/>\s+</g, '><')
    // Trailing breaks at the end of a block are invisible.
    .replace(/(<br\s*\/?>)+(?=<\/)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What the reader would see, with the spacing they would see it with.
 *
 * {@link documentSignature} deliberately collapses runs of whitespace, which
 * is right for deciding whether two SAVED VERSIONS are the same version — but
 * wrong for deciding whether to show someone the document that just arrived.
 * Used there, an edit that only changed spacing compared equal to what was
 * already on screen and was never applied: the person typing saw their spaces,
 * everyone else saw one, and the real spacing only appeared later when some
 * unrelated edit finally made the two differ.
 *
 * This keeps every space in the text and ignores only what no reader can see:
 * whitespace BETWEEN tags, empty blocks, and the difference between a
 * non-breaking space and an ordinary one.
 */
export function visibleContentKey(html: string | null | undefined): string {
  if (typeof html !== 'string') return '';

  let s = html;
  for (let pass = 0; pass < 8; pass++) {
    const next = s.replace(EMPTY_BLOCK, '');
    if (next === s) break;
    s = next;
  }

  return s
    // One entity becomes one space, so the count is preserved.
    .replace(/&nbsp;|&#160;| /gi, ' ')
    // Between tags only — this cannot touch the text itself.
    .replace(/>[\t\n\r ]+</g, '><')
    .replace(/(<br\s*\/?>)+(?=<\/)/gi, '')
    .trim();
}

/** Do these two documents render the same? */
export function rendersIdentically(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  return documentSignature(a) === documentSignature(b);
}
