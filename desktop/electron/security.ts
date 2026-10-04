/**
 * @module Security
 *
 * The privilege boundary between the DocuSync renderer and the machine it
 * runs on.
 *
 * **Why this module exists separately.** In production the renderer is not
 * local code — `main.ts` loads `https://docusync-dusky.vercel.app`, and the
 * preload bridge is attached to that window. Everything running on that
 * origin therefore holds `window.docuSync`, and through it the filesystem
 * and database handlers in `ipc-handlers.ts`. A cross-site scripting flaw
 * on the website, a compromised dependency in its bundle, or a hostile
 * third-party script is, in the desktop app, local code execution. The
 * renderer is treated here as untrusted input, not as part of the program.
 *
 * These guards previously lived inline in one handler, with the unit test
 * holding its own re-implementation of the rule rather than importing it.
 * That arrangement passes whether or not the real handler is correct, and it
 * covered one of the handlers that take a renderer-supplied path. The rules
 * live here so that the code under test and the code that runs are the same
 * code, and so every caller gets the same rule.
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Windows filesystems are case-insensitive, so `C:\Users\...` and
 * `c:\users\...` name the same directory. Comparing them literally rejects
 * legitimate paths — a fail-closed bug rather than a hole, but a bug.
 */
const CASE_INSENSITIVE_FS = process.platform === 'win32' || process.platform === 'darwin';

const forCompare = (p: string): string => (CASE_INSENSITIVE_FS ? p.toLowerCase() : p);

/**
 * Resolves a path all the way to its real location on disk, following any
 * symbolic links.
 *
 * Containment has to be decided on the real target, not on the name used to
 * reach it. A symlink placed inside the allowed directory and pointing at
 * `C:\Windows\System32` resolves, by name, to a path that starts with the
 * allowed root — and `path.resolve` alone would accept it. Where the path
 * does not exist yet (the usual case for a file about to be written), the
 * nearest existing ancestor is resolved instead and the remainder appended,
 * which closes the same hole for a link anywhere in the parent chain.
 */
function realise(target: string): string {
  let current = path.resolve(target);
  const trailing: string[] = [];

  // Walk up to the first component that exists, remembering what was
  // stripped, then resolve that and put the remainder back.
  for (let guard = 0; guard < 64; guard++) {
    try {
      return path.join(fs.realpathSync.native(current), ...trailing.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(target); // reached the root
      trailing.push(path.basename(current));
      current = parent;
    }
  }
  return path.resolve(target);
}

/**
 * Is `candidatePath` inside `allowedRoot`?
 *
 * Strictly inside: the root itself is not a valid target, since every
 * caller here is naming a file to read or write rather than the directory.
 *
 * @param candidatePath - A path from an untrusted caller.
 * @param allowedRoot - The only directory tree that caller may reach.
 * @returns `true` only when the resolved real path lies under the root.
 */
export function isPathInAllowedDirectory(candidatePath: string, allowedRoot: string): boolean {
  if (typeof candidatePath !== 'string' || candidatePath.length === 0) return false;
  if (typeof allowedRoot !== 'string' || allowedRoot.length === 0) return false;
  // A NUL byte truncates the path inside some native filesystem calls, so a
  // name that passes this check can address a different file by the time it
  // is opened.
  if (candidatePath.includes('\0')) return false;

  const resolvedCandidate = realise(candidatePath);
  // The separator is appended so that a sibling directory whose name merely
  // begins with the root's name — `DocuSync-Evil` against root `DocuSync` —
  // is not read as being inside it.
  const resolvedRoot = realise(allowedRoot) + path.sep;

  return forCompare(resolvedCandidate).startsWith(forCompare(resolvedRoot));
}

/**
 * Thrown when a renderer-supplied path or name is rejected. Carries no
 * absolute path, so the message can be surfaced or logged without
 * disclosing the layout of the user's disk.
 */
export class UnsafePathError extends Error {
  constructor(operation: string, reason: string) {
    super(`${operation}: ${reason}`);
    this.name = 'UnsafePathError';
  }
}

/**
 * Turns a renderer-supplied *file name* into a safe absolute path inside
 * `allowedRoot`, or throws.
 *
 * This closes a real traversal: `file:import-room-file` took a name from the
 * renderer and passed it straight to `path.join(downloadsDir, name)`. A name
 * like `..\..\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\x.bat`
 * walks out of the directory, and the handler then writes renderer-supplied
 * content there — on the production build, that is a website being able to
 * drop a file into the user's startup folder.
 *
 * A name is required to be a name: one path component, no separators, no
 * drive letter, no `..`, and not a reserved Windows device name.
 *
 * @param fileName - The untrusted name.
 * @param allowedRoot - The directory the file must land in.
 * @param operation - Channel name, used only in the error message.
 * @returns The absolute path to write to.
 * @throws {UnsafePathError} If the name is not a plain, contained file name.
 */
export function resolveSafeFileName(
  fileName: unknown,
  allowedRoot: string,
  operation: string
): string {
  if (typeof fileName !== 'string' || fileName.trim().length === 0) {
    throw new UnsafePathError(operation, 'a file name is required');
  }
  if (fileName.includes('\0')) {
    throw new UnsafePathError(operation, 'file name contains an invalid character');
  }
  // Reject anything that is not a single, plain component. `path.basename`
  // is deliberately NOT used to "clean up" the input: silently rewriting a
  // hostile name into a different file is harder to reason about than
  // refusing it, and a legitimate caller never sends one.
  if (/[\\/]/.test(fileName) || fileName === '.' || fileName === '..') {
    throw new UnsafePathError(operation, 'file name must not contain a path');
  }
  if (/^[a-zA-Z]:/.test(fileName)) {
    throw new UnsafePathError(operation, 'file name must not be an absolute path');
  }
  // CON, PRN, AUX, NUL, COM1-9, LPT1-9 address devices on Windows whatever
  // directory they appear in, with or without an extension.
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(fileName)) {
    throw new UnsafePathError(operation, 'file name is reserved by the operating system');
  }

  const destination = path.join(allowedRoot, fileName);
  // Checked again against the resolved result, so the rules above are a
  // first line rather than the only one.
  if (!isPathInAllowedDirectory(destination, allowedRoot)) {
    throw new UnsafePathError(operation, 'resolved path is outside the allowed directory');
  }
  return destination;
}

/**
 * The origins the privileged window may display.
 *
 * The preload bridge travels with the window, not with the page, so a
 * navigation away from the application hands `window.docuSync` to whatever
 * loads next. Any origin not listed here is refused.
 */
export const ALLOWED_ORIGINS: readonly string[] = [
  'https://docusync-dusky.vercel.app',
];

/**
 * May the privileged window navigate to `targetUrl`?
 *
 * `file:` is permitted so the locally bundled renderer still loads, and
 * `http://localhost` / `http://127.0.0.1` so the Vite dev server does.
 * Everything else — including other Vercel preview deployments, which are
 * separate origins that can be deployed by anyone with repository access —
 * is refused.
 */
export function isNavigationAllowed(targetUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return false;
  }

  if (parsed.protocol === 'file:') return true;

  if (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
    return true;
  }

  // Compared on the parsed origin rather than by prefix, so that
  // `https://docusync-dusky.vercel.app.attacker.test` does not match.
  return ALLOWED_ORIGINS.includes(parsed.origin);
}
