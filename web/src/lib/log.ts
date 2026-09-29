/**
 * @module log
 *
 * Console helpers that keep secrets and document text out of the browser
 * console.
 *
 * The console is not private: anyone who opens dev tools during a demo,
 * a defense, or a screen share sees everything written to it. Two classes
 * of value must never appear there:
 *
 *  - **Credentials and room codes.** A room's OTP is the join credential
 *    for that workspace, and it was being printed as part of the peer
 *    WebSocket URL (`ws://host:9000?token=ABC123`).
 *  - **Document content.** The sync path logged whole document bodies on
 *    every remote apply, which put the collaborators' text on screen.
 *
 * `devLog` is additionally a no-op outside development, so engine tracing
 * never reaches a production console at all.
 */

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Masks credential-bearing query parameters in a URL, keeping the part
 * that is actually useful when debugging (host and port).
 *
 * @example
 * redactUrl('ws://192.168.1.4:9000?token=7KDQ2M') // 'ws://192.168.1.4:9000?token=***'
 */
export function redactUrl(url: string): string {
  if (!url) return url;
  return url.replace(/([?&](?:token|otp|pin|code|key|secret)=)[^&#\s]+/gi, '$1***');
}

/**
 * Masks a room code or PIN, keeping only enough to correlate log lines.
 *
 * @example
 * redactCode('7KDQ2M') // '7K****'
 */
export function redactCode(code: string | null | undefined): string {
  if (!code) return '';
  const s = String(code);
  return s.length <= 2 ? '**' : s.slice(0, 2) + '*'.repeat(s.length - 2);
}

/**
 * Describes a document payload by shape rather than content, so sync
 * tracing stays useful without printing what anyone wrote.
 *
 * @example
 * describeContent('<p>Board minutes…</p>') // '[html 21 chars]'
 */
export function describeContent(content: unknown): string {
  if (content == null) return '[empty]';
  const s = typeof content === 'string' ? content : JSON.stringify(content);
  const kind = /^\s*</.test(s) ? 'html' : 'text';
  return `[${kind} ${s.length} chars]`;
}

/** Development-only log. Silent in production builds. */
export function devLog(...args: unknown[]): void {
  if (isDev) console.log(...args);
}

/** Development-only warning. Silent in production builds. */
export function devWarn(...args: unknown[]): void {
  if (isDev) console.warn(...args);
}
