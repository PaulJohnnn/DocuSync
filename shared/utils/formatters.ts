/**
 * Shared formatting utilities across all platforms (Desktop, Web, Mobile).
 */

/**
 * Formats a byte count into a human-readable string (e.g. "4.2 MB").
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Formats a char/byte count into KB or MB shorthand.
 * Alias for use in file size display contexts.
 */
export function formatSize(chars: number): string {
  return formatBytes(chars);
}

/**
 * Returns the basename (filename) from a full file path.
 * Works with both Unix and Windows path separators.
 */
export function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
}

/**
 * Returns a human-readable relative time string for an ISO date string.
 * e.g. "5 minutes ago", "3 days ago"
 * Returns 'never' if the input is null/undefined.
 */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  try {
    const diff = new Date(iso).getTime() - Date.now();
    const abs = Math.abs(diff);
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    if (abs < 60_000)       return rtf.format(Math.round(diff / 1_000), 'second');
    if (abs < 3_600_000)    return rtf.format(Math.round(diff / 60_000), 'minute');
    if (abs < 86_400_000)   return rtf.format(Math.round(diff / 3_600_000), 'hour');
    if (abs < 604_800_000)  return rtf.format(Math.round(diff / 86_400_000), 'day');
    return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso ?? '';
  }
}

/**
 * Formats a Unix timestamp (ms) as a relative time string.
 * e.g. "5 minutes ago", "just now"
 */
export function formatTimestampRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000)      return 'just now';
  if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)  return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString();
}

/**
 * Truncates a string to a given length, appending '…' if needed.
 * Strips newlines and tabs for single-line display.
 */
export function truncate(text: string, max = 100): string {
  if (!text) return '';
  const clean = text.replace(/[\r\n\t]+/g, ' ').trim();
  return clean.length <= max ? clean : clean.slice(0, max) + '…';
}
