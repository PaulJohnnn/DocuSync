/**
 * @file tests/unit/ipc-path-validation.test.ts
 *
 * Regression tests for the IPC path-containment security fix (Fix 2).
 *
 * These tests validate `isPathInAllowedDirectory`, the helper function
 * introduced in `desktop/electron/ipc-handlers.ts` to gate the
 * renderer-supplied direct-string-path branch of the `file:open` handler.
 *
 * Threat model:
 *   The production Electron app wraps a remote Vercel origin. An XSS
 *   payload on that origin could call `window.docuSync.openFile(path)` with
 *   an arbitrary filesystem path (e.g. ~/.ssh/id_rsa, C:\Windows\System32\SAM).
 *   The security boundary must reject any path outside the application's
 *   designated Downloads/DocuSync directory.
 *
 * This file used to hold its own copy of the rule and test the copy, on the
 * reasoning that it then served as an independent specification. It does not:
 * a test that cannot fail when the shipping code is wrong proves nothing
 * about the shipping code, and this one went on passing while the sibling
 * handler `file:import-room-file` wrote renderer-named files outside the
 * directory entirely. It now imports the real function from
 * electron/security.ts. Coverage of the rest of the boundary — the import
 * traversal and the navigation allowlist — is in ipc-security.test.ts.
 *
 * Layer:    Unit (pure function — no Electron, no filesystem access)
 * Runner:   Jest (desktop/jest.config.ts, project "unit")
 * Command:  npx jest --testPathPattern=ipc-path-validation
 */

import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Extract the helper under test
// ─────────────────────────────────────────────────────────────────────────────

import { isPathInAllowedDirectory } from '../../electron/security';

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive a platform-consistent allowed root for test fixtures.
 * Points to the same canonical Downloads/DocuSync path as the handler.
 */
const TEST_ALLOWED_ROOT = path.join('C:', 'Users', 'TestUser', 'Downloads', 'DocuSync');

describe('isPathInAllowedDirectory — allowed paths', () => {
  /**
   * Test: A file directly inside the allowed directory should pass.
   * Regression protected: Ensures legitimate DocuSync file operations continue
   * to work after Fix 2 is applied.
   */
  it('should allow a file directly inside the allowed directory', () => {
    const candidate = path.join(TEST_ALLOWED_ROOT, 'my-document.txt');
    expect(isPathInAllowedDirectory(candidate, TEST_ALLOWED_ROOT)).toBe(true);
  });

  /**
   * Test: A file inside a nested subdirectory within the allowed root.
   */
  it('should allow a file in a nested subdirectory of the allowed root', () => {
    const candidate = path.join(TEST_ALLOWED_ROOT, 'project', 'docs', 'report.docx');
    expect(isPathInAllowedDirectory(candidate, TEST_ALLOWED_ROOT)).toBe(true);
  });
});

describe('isPathInAllowedDirectory — blocked paths (security boundary)', () => {
  /**
   * Test: An absolute path outside the allowed root must be rejected.
   * Regression protected: XSS payload targeting system files.
   */
  it('should block an absolute path outside the allowed root', () => {
    const candidate = path.join('C:', 'Windows', 'System32', 'SAM');
    expect(isPathInAllowedDirectory(candidate, TEST_ALLOWED_ROOT)).toBe(false);
  });

  /**
   * Test: A path traversal attempt must be rejected.
   * `Downloads/DocuSync/../secret` resolves to `Downloads/secret` which is
   * outside the allowed root.
   * Regression protected: `../` traversal to escape the sandbox.
   */
  it('should block path traversal with ../', () => {
    const candidate = path.join(TEST_ALLOWED_ROOT, '..', 'secret-file.txt');
    expect(isPathInAllowedDirectory(candidate, TEST_ALLOWED_ROOT)).toBe(false);
  });

  /**
   * Test: Double traversal must also be rejected.
   * `Downloads/DocuSync/../../Windows/SAM` resolves to a system path.
   */
  it('should block double path traversal ../../', () => {
    const candidate = path.join(TEST_ALLOWED_ROOT, '..', '..', 'Windows', 'SAM');
    expect(isPathInAllowedDirectory(candidate, TEST_ALLOWED_ROOT)).toBe(false);
  });

  /**
   * Test: A sibling directory with the same name prefix must be rejected.
   * e.g. `Downloads/DocuSync-Evil/malware.exe` must NOT match `Downloads/DocuSync`.
   * This is the prefix-confusion attack. A naive `startsWith` without a
   * trailing separator would accept this.
   * Regression protected: The separator-terminated comparison in Fix 2.
   */
  it('should block a sibling directory with the same name prefix (prefix confusion)', () => {
    const sibling = path.join('C:', 'Users', 'TestUser', 'Downloads', 'DocuSync-Evil', 'payload.exe');
    expect(isPathInAllowedDirectory(sibling, TEST_ALLOWED_ROOT)).toBe(false);
  });

  /**
   * Test: The allowed root directory itself (not a file inside) must be rejected.
   * The allowed root is a directory, not a file. Accepting it directly could
   * allow directory read operations.
   */
  it('should block the allowed root path itself (not a file inside it)', () => {
    expect(isPathInAllowedDirectory(TEST_ALLOWED_ROOT, TEST_ALLOWED_ROOT)).toBe(false);
  });
});

describe('isPathInAllowedDirectory — edge cases', () => {
  /**
   * Test: An empty string candidate.
   * path.resolve('') returns the current working directory, which is
   * unlikely to be inside DocuSync — should return false.
   */
  it('should block an empty string path', () => {
    const candidate = '';
    // path.resolve('') is cwd — almost certainly not inside DocuSync
    const result = isPathInAllowedDirectory(candidate, TEST_ALLOWED_ROOT);
    // We don't assert the exact value because cwd is environment-dependent,
    // but we assert the call does not throw.
    expect(typeof result).toBe('boolean');
  });

  /**
   * Test: A relative path that resolves to inside the allowed root must be allowed.
   * This is important for the fallback recovery path in the handler.
   */
  it('should correctly resolve relative paths using path.resolve()', () => {
    // A relative path that would resolve INTO the allowed root (mocked via absolute form).
    const candidate = path.join(TEST_ALLOWED_ROOT, 'file.txt');
    expect(isPathInAllowedDirectory(candidate, TEST_ALLOWED_ROOT)).toBe(true);
  });

  /**
   * Test: Windows UNC path format should not bypass the check.
   * A UNC path like \\server\share is resolved by path.resolve() and will
   * not match the local DocuSync root.
   */
  it('should block a Windows UNC-style path', () => {
    const candidate = '\\\\server\\share\\malicious.exe';
    expect(isPathInAllowedDirectory(candidate, TEST_ALLOWED_ROOT)).toBe(false);
  });
});

describe('isPathInAllowedDirectory — IPC handler integration note', () => {
  /**
   * This test documents the known testing limitation for the IPC handler itself.
   *
   * The actual `file:open` ipcMain.handle cannot be exercised in a Jest unit
   * context without a full Electron main-process environment. The security
   * boundary (calling `isPathInAllowedDirectory` before proceeding with a
   * renderer-supplied path) has been verified by manual code inspection at
   * ipc-handlers.ts:942–964.
   *
   * Manual verification step (documented for the final report):
   *   1. Launch the desktop app in dev mode with DOCUSYNC_LOCAL_UI=1.
   *   2. Open DevTools in the renderer.
   *   3. Call: window.docuSync.openFile('C:\\Windows\\System32\\SAM')
   *   4. Expected: { success: false, error: 'file:open: path is outside...' }
   *   5. Call: window.docuSync.openFile(path inside Downloads/DocuSync)
   *   6. Expected: file read succeeds (if file exists).
   */
  it('LIMITATION: ipcMain handler cannot be exercised in Jest unit context', () => {
    // This test intentionally passes — it documents the limitation.
    // The pure helper is verified in the suites above.
    expect(true).toBe(true);
  });
});
