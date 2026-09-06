import * as Diff from 'diff';

export function computeSignatureMerge(originalHtml: string, onlineHtml: string, offlineHtml: string): string {
  if (originalHtml === offlineHtml) return onlineHtml;
  if (originalHtml === onlineHtml) return offlineHtml;

  // Simple HTML stripper
  const stripHtml = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  
  const origText = stripHtml(originalHtml);
  const onlineText = stripHtml(onlineHtml);
  const offlineText = stripHtml(offlineHtml);

  // We perform a 3-way merge on words.
  // diff3 algorithms can be complex, but we can approximate it by applying online diffs to the offline text.
  // Actually, standard diff3 requires applying a patch. Let's use Diff.diffWords to generate a patch.
  
  const patch = Diff.createPatch('doc', origText, onlineText, '', '');
  const applyResult = Diff.applyPatch(offlineText, patch);
  
  if (applyResult) {
    // If patch applied cleanly, wrap in <p> and return
    return `<p>${applyResult}</p>`;
  }
  
  // If patch fails (conflict), we manually combine the additions.
  // A simple heuristic for text merging: 
  // 1. Find the online suffix addition if it's an append.
  if (onlineText.startsWith(origText) && onlineText.length > origText.length) {
    const appendedText = onlineText.substring(origText.length);
    const match = offlineHtml.match(/(<\/[^>]+>)+$/);
    if (match) {
      const closingTags = match[0];
      const baseHtml = offlineHtml.substring(0, offlineHtml.length - closingTags.length);
      return baseHtml + appendedText + closingTags;
    }
    return offlineHtml + appendedText;
  }

  // 2. If it's not a simple append, we concatenate the changes or just return the offline version with a warning.
  // The user specifically wanted:
  // orig: "im happy with you always"
  // online: "im happy with you always because im comfortable with you "
  // offline: "im very happy with you my love, always"
  // merged: "im very happy with you my love, always because im comfortable with you "
  
  // In this case, online appended text, but offline modified the middle.
  // To solve this, let's check if the online diff is purely an addition at the END of the word diffs.
  const onlineDiffs = Diff.diffWords(origText, onlineText);
  let onlineAppendedWords = '';
  
  // Find trailing additions in online
  for (let i = onlineDiffs.length - 1; i >= 0; i--) {
    if (onlineDiffs[i].added) {
      onlineAppendedWords = onlineDiffs[i].value + onlineAppendedWords;
    } else if (onlineDiffs[i].removed) {
      // Ignored
    } else {
      break;
    }
  }

  if (onlineAppendedWords.trim().length > 0) {
    // Inject the trailing addition into offlineHtml before the closing p tag
    const match = offlineHtml.match(/(<\/[^>]+>)+$/);
    if (match) {
      const closingTags = match[0];
      const baseHtml = offlineHtml.substring(0, offlineHtml.length - closingTags.length);
      return baseHtml + onlineAppendedWords + closingTags;
    }
    return offlineHtml + onlineAppendedWords;
  }

  // Fallback: If we really can't merge safely, keep offline
  return offlineHtml;
}
