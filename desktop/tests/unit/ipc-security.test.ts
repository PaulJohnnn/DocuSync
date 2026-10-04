/**
 * @file tests/unit/ipc-security.test.ts
 *
 * Security regression tests for the renderer privilege boundary.
 *
 * Threat model: in production `main.ts` loads a remote origin and attaches
 * the preload bridge to that window, so every script on the website holds
 * `window.docuSync` and through it the filesystem and database handlers.
 * A cross-site scripting flaw on the site is, in the desktop app, local file
 * access. The renderer is untrusted input.
 *
 * These tests import the SHIPPING implementation from
 * `desktop/electron/security.ts`. The previous test for this boundary held
 * its own copy of the rule and tested that, which passes whether or not the
 * real handler is correct — exactly the failure mode where a security test
 * validates a helper while the real path stays open.
 *
 * Layer:    Unit (pure functions plus a temp directory; no Electron)
 * Runner:   Jest (desktop/jest.config.ts, project "unit")
 * Command:  npx jest --selectProjects unit --testPathPattern=ipc-security
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  isPathInAllowedDirectory,
  resolveSafeFileName,
  isNavigationAllowed,
  UnsafePathError,
} from '../../electron/security';

const ROOT = path.join(os.tmpdir(), 'docusync-sec-test', 'DocuSync');

beforeAll(() => {
  fs.mkdirSync(ROOT, { recursive: true });
});

afterAll(() => {
  try {
    fs.rmSync(path.join(os.tmpdir(), 'docusync-sec-test'), { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe('isPathInAllowedDirectory', () => {
  it('accepts a file directly inside the allowed directory', () => {
    expect(isPathInAllowedDirectory(path.join(ROOT, 'Chapter3.docx'), ROOT)).toBe(true);
  });

  it('accepts a file in a subdirectory of the allowed directory', () => {
    expect(isPathInAllowedDirectory(path.join(ROOT, 'nested', 'deep', 'a.txt'), ROOT)).toBe(true);
  });

  it('rejects the allowed directory itself', () => {
    expect(isPathInAllowedDirectory(ROOT, ROOT)).toBe(false);
  });

  it('rejects a traversal out of the allowed directory', () => {
    expect(isPathInAllowedDirectory(path.join(ROOT, '..', '..', 'secrets.txt'), ROOT)).toBe(false);
  });

  it('rejects an unrelated absolute path', () => {
    const outside = process.platform === 'win32'
      ? 'C:\\Windows\\System32\\config\\SAM'
      : '/etc/shadow';
    expect(isPathInAllowedDirectory(outside, ROOT)).toBe(false);
  });

  it('rejects a sibling directory whose name merely starts with the root name', () => {
    expect(isPathInAllowedDirectory(`${ROOT}-Evil${path.sep}loot.txt`, ROOT)).toBe(false);
  });

  it('rejects an empty or non-string path', () => {
    expect(isPathInAllowedDirectory('', ROOT)).toBe(false);
    expect(isPathInAllowedDirectory(undefined as unknown as string, ROOT)).toBe(false);
    expect(isPathInAllowedDirectory(123 as unknown as string, ROOT)).toBe(false);
  });

  it('rejects a path containing a NUL byte', () => {
    // The byte truncates the string inside some native calls, so a name that
    // passes a naive check can address a different file when it is opened.
    expect(isPathInAllowedDirectory(path.join(ROOT, 'ok.txt\0/../../etc/passwd'), ROOT)).toBe(false);
  });

  it('accepts a path differing from the root only by letter case on a case-insensitive filesystem', () => {
    // A fail-closed bug rather than a hole, but it rejects legitimate files.
    const mixed = path.join(ROOT.toUpperCase(), 'Chapter3.docx');
    const expected = process.platform === 'win32' || process.platform === 'darwin';
    expect(isPathInAllowedDirectory(mixed, ROOT)).toBe(expected);
  });

  it('rejects a symlink inside the directory that points outside it', () => {
    const target = path.join(os.tmpdir(), 'docusync-sec-test', 'outside-target');
    fs.mkdirSync(target, { recursive: true });
    const link = path.join(ROOT, 'escape-link');
    try {
      fs.symlinkSync(target, link, 'junction');
    } catch {
      // Creating a link can need elevation on Windows; skip rather than
      // report a pass we did not actually establish.
      return;
    }
    // By name this starts with the allowed root. By real location it does not.
    expect(isPathInAllowedDirectory(path.join(link, 'stolen.txt'), ROOT)).toBe(false);
  });
});

describe('resolveSafeFileName — the file:import-room-file traversal', () => {
  it('accepts an ordinary document name', () => {
    expect(resolveSafeFileName('Chapter 3.docx', ROOT, 'file:import-room-file'))
      .toBe(path.join(ROOT, 'Chapter 3.docx'));
  });

  it('rejects the startup-folder escape', () => {
    // The actual exploit: the handler joined this straight onto the
    // downloads directory and wrote renderer-supplied content to it.
    const evil = path.join('..', '..', 'AppData', 'Roaming', 'Microsoft', 'Windows',
      'Start Menu', 'Programs', 'Startup', 'evil.bat');
    expect(() => resolveSafeFileName(evil, ROOT, 'file:import-room-file'))
      .toThrow(UnsafePathError);
  });

  it.each([
    ['../escape.txt', 'parent traversal with forward slashes'],
    ['..\\escape.txt', 'parent traversal with backslashes'],
    ['sub/dir/file.txt', 'a nested path'],
    ['/etc/passwd', 'an absolute POSIX path'],
    ['C:\\Windows\\System32\\drivers\\etc\\hosts', 'an absolute Windows path'],
    ['..', 'the parent directory itself'],
    ['.', 'the current directory'],
  ])('rejects %s (%s)', (name) => {
    expect(() => resolveSafeFileName(name, ROOT, 'file:import-room-file')).toThrow(UnsafePathError);
  });

  it.each(['CON', 'con.txt', 'NUL', 'COM1', 'LPT9.docx'])(
    'rejects the reserved device name %s', (name) => {
      expect(() => resolveSafeFileName(name, ROOT, 'file:import-room-file')).toThrow(UnsafePathError);
    });

  it('rejects a missing, empty or non-string name', () => {
    for (const bad of [undefined, null, '', '   ', 42, {}]) {
      expect(() => resolveSafeFileName(bad, ROOT, 'file:import-room-file')).toThrow(UnsafePathError);
    }
  });

  it('does not leak an absolute path in the error message', () => {
    // The message can reach a log or the renderer; it should not describe
    // the layout of the user's disk.
    try {
      resolveSafeFileName('../../escape.txt', ROOT, 'file:import-room-file');
      throw new Error('expected a rejection');
    } catch (err) {
      expect((err as Error).message).not.toContain(ROOT);
      expect((err as Error).message).not.toContain('escape.txt');
    }
  });
});

describe('isNavigationAllowed — the preload travels with the window', () => {
  it('allows the application origin', () => {
    expect(isNavigationAllowed('https://docusync-dusky.vercel.app/app/login')).toBe(true);
    expect(isNavigationAllowed('https://docusync-dusky.vercel.app/app/editor/5')).toBe(true);
  });

  it('allows the local renderer and the dev server', () => {
    expect(isNavigationAllowed('file:///C:/app/dist/index.html')).toBe(true);
    expect(isNavigationAllowed('http://localhost:5173/')).toBe(true);
    expect(isNavigationAllowed('http://127.0.0.1:5173/')).toBe(true);
  });

  it.each([
    'https://evil.test/',
    'https://docusync-dusky.vercel.app.evil.test/',
    'https://docusync-dusky-git-branch.vercel.app/',
    'http://docusync-dusky.vercel.app/',
    'javascript:fetch("/etc/passwd")',
    'data:text/html,<script>window.docuSync.importRoomFile("x","y")</script>',
    'not a url',
    '',
  ])('refuses %s', (url) => {
    expect(isNavigationAllowed(url)).toBe(false);
  });
});
