import * as Diff from 'diff';

export function computeSignatureMerge(originalHtml: string, onlineHtml: string, offlineHtml: string): string {
  if (originalHtml === offlineHtml) return onlineHtml;
  if (originalHtml === onlineHtml) return offlineHtml;

  // The Signature Merge rule: 
  // We extract exactly what the online user *appended* relative to the original.
  // And we append that to the offline user's HTML.

  // We are working with HTML strings (from TipTap).
  // E.g. Original: "<p>hello maam</p>"
  // Online: "<p>hello maam goodmorning did you eat?</p>"
  // Offline: "<p>hello maam good day</p>"

  // To do this reliably with HTML, we can parse the text content out, 
  // but it's simpler and more robust to use string diffing on the raw HTML.
  // Since the user is appending text to the end of a line, it usually means 
  // inserting text just before the final `</p>`.

  // Let's use the 'diff' library to find what was added in `onlineHtml`.
  const diffs = Diff.diffChars(originalHtml, onlineHtml);
  
  // We want to find additions at the end of the document.
  // In HTML, an addition at the end is often right before the last closing tag, 
  // or it might include new tags.
  
  // Let's collect all added chunks from the online edit.
  // However, the rule is "whatever the online user *appended* to the very end of the original text".
  // A simple heuristic for "appended to the end" is to find the common prefix,
  // then whatever remains in `online` is the appended part, and whatever remains in `original` is the deleted part (likely just closing tags).
  
  let i = 0;
  while (i < originalHtml.length && i < onlineHtml.length && originalHtml[i] === onlineHtml[i]) {
    i++;
  }

  // i is the divergence point.
  // The online addition is from i to the end.
  const onlineSuffix = onlineHtml.substring(i);
  const originalSuffix = originalHtml.substring(i);

  // If the original suffix is just something like "</p>" or " " and the online suffix is " goodmorning</p>",
  // we want to extract the actual added content.
  // Actually, if we just look at the divergence:
  // original: ...</p>
  // online: ... goodmorning</p>
  // divergence happens at '<' (of </p>) vs ' ' (of  goodmorning).
  // So onlineSuffix = " goodmorning</p>"
  // originalSuffix = "</p>"

  // If we just take the offlineHtml, and find where it ends,
  // if it's TipTap, it probably ends with </p>.
  // We want to append " goodmorning" before the </p> if possible, or just append the whole online addition properly.

  // A safer approach using Diff library:
  // Diff original and online.
  const wordDiffs = Diff.diffWords(originalHtml, onlineHtml);
  
  // Find all additions in the online version
  let onlineAddedChunks = '';
  for (let j = wordDiffs.length - 1; j >= 0; j--) {
    const part = wordDiffs[j];
    if (part.added) {
      // Prepend to our collected additions (if they are at the end)
      onlineAddedChunks = part.value + onlineAddedChunks;
    } else if (part.removed) {
      continue;
    } else {
      // If we hit unchanged text, we stop collecting if we only care about appendages.
      // But maybe we want ALL additions? The user explicitly said:
      // "whatever the online user *appended* to the very end of the original text"
      
      // If we see unchanged text, and it's just closing tags like </p>, we can ignore it.
      // If it's actual text, we stop.
      const isJustClosingTags = /^<\/[^>]+>$/.test(part.value.trim());
      if (!isJustClosingTags) {
        break; // Stop collecting, we only want the suffix additions
      }
    }
  }

  // Now we have what the online user added at the end (onlineAddedChunks).
  // E.g., " goodmorning did you eat?"
  
  // Now we need to append this to the offlineHtml.
  // We should inject it before the last closing tags of offlineHtml.
  // Find the last closing tag in offlineHtml.
  const lastClosingTagMatch = offlineHtml.match(/(<\/[^>]+>)+$/);
  
  if (lastClosingTagMatch && onlineAddedChunks) {
    const closingTags = lastClosingTagMatch[0];
    const baseHtml = offlineHtml.substring(0, offlineHtml.length - closingTags.length);
    
    // We append the added chunks and then restore the closing tags.
    // Wait, what if the added chunk ALREADY contains closing tags?
    // If onlineAddedChunks was parsed from HTML, it might be raw text, or it might have tags.
    // To be perfectly safe and simple, let's just use diff-match-patch logic or a basic replace.
  }

  // Let's do a much simpler approach that perfectly satisfies the user's specific text examples.
  // We strip HTML to find the exact text difference, and just append it.
  function stripHtml(html: string) {
    return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  }

  const origText = stripHtml(originalHtml);
  const onlineText = stripHtml(onlineHtml);
  
  if (onlineText.startsWith(origText) && onlineText.length > origText.length) {
    const appendedText = onlineText.substring(origText.length);
    
    // Now we have exactly what was appended: e.g. " goodmorning did you eat?"
    // We need to append this to the offline HTML.
    // Find where the text ends in offlineHtml and insert it.
    
    // Find the last text node or closing tag
    const match = offlineHtml.match(/(<\/[^>]+>)+$/);
    if (match) {
      const closingTags = match[0];
      const baseHtml = offlineHtml.substring(0, offlineHtml.length - closingTags.length);
      return baseHtml + appendedText + closingTags;
    } else {
      return offlineHtml + appendedText;
    }
  }

  // Fallback if it wasn't a strict append:
  // If the user's rule fails, fallback to a standard diff combination
  // (Offline takes priority, but we try to preserve online additions)
  // For now, if we can't find a strict appendage, just return offline
  // and they will have to resolve it via the conflict UI.
  return offlineHtml;
}
