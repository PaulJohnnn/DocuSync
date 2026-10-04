import * as Diff from 'diff';

export function computeSignatureMerge(originalHtml: string, onlineHtml: string, offlineHtml: string, authorName: string = 'User'): string {
  if (originalHtml === offlineHtml) return onlineHtml;
  if (originalHtml === onlineHtml) return offlineHtml;

  // Simple HTML stripper for diffing logic
  const stripHtml = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  
  const origText = stripHtml(originalHtml);
  const offlineText = stripHtml(offlineHtml);

  // Instead of a destructive inline merge, we extract exactly what the offline user ADDED,
  // and we append it as a brand new isolated page at the bottom of the document.
  // This explicitly guarantees zero data loss (vanishing edits) for the online content.
  
  const diffs = Diff.diffWords(origText, offlineText);
  const additions = diffs.filter(d => d.added).map(d => `<p>${d.value}</p>`).join('');

  if (additions.trim().length > 0) {
    // Styled by class, not by inline style.
    //
    // These two elements used to carry `margin: 40px 0` and their own padding
    // inline. The pagination measurement assumes every block's margin-top is
    // zero — globals.css resets it — and works out each page break from the
    // block's own height plus its margin-BOTTOM. An inline margin-top beats
    // that reset, so from the moment an offline edit was merged in, every
    // page boundary below it was computed against the wrong origin and the
    // text ran across the page edge instead of starting a new page.
    //
    // The classes are defined in globals.css with margin-top: 0, which keeps
    // the measurement's assumption true while leaving the banner just as
    // visible.
    const pageBreak = `<hr class="offline-page-break" />`;
    const header = `<h3 class="offline-edit-banner">[Offline edit merged in — by ${authorName}]</h3>`;

    // Inject the new page right before the absolute closing tags of the online HTML, or simply append.
    const match = onlineHtml.match(/(<\/[^>]+>)+$/);
    if (match) {
      const closingTags = match[0];
      const baseHtml = onlineHtml.substring(0, onlineHtml.length - closingTags.length);
      return baseHtml + pageBreak + header + additions + closingTags;
    }
    return onlineHtml + pageBreak + header + additions;
  }

  // If they didn't add anything (only deleted text offline), we reject the deletions to protect the online file.
  return onlineHtml;
}
