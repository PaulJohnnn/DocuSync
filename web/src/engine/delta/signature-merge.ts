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
    const pageBreak = `<hr class="offline-page-break" style="page-break-before: always; border: 2px dashed #ef4444; margin: 40px 0;" />`;
    const header = `<h3 style="color: #ef4444; font-family: monospace; background: #fee2e2; padding: 8px; border-radius: 4px;">⚠️ [Offline Edit appended by ${authorName}]</h3>`;
    
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
