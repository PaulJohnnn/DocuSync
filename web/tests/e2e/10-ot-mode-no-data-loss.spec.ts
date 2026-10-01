import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Regression test — a room created with algorithm 'ot' must not discard
 * unsaved local work.
 *
 * The editor's poll loop used to carry a separate branch for `algorithm ===
 * 'ot'`:
 *
 *   if (room.algorithm === 'ot') {
 *     setContentAndRef(data.content);   // take the server's copy
 *     lastSave.current = data.content;  // and forget what the user had
 *   }
 *
 * It ran inside `if (isTypingRef.current || hasPendingChangesRef.current)` —
 * precisely when unsaved work existed — so selecting "OT" turned every
 * remote update into silent data loss. It was also invisible to the
 * evaluation: `lostChars` is only incremented inside the server's merge, and
 * this branch reset the client before any divergence reached the server, so
 * the mode that destroyed the most work reported the least.
 *
 * These assertions are source-level on purpose. The defect was the existence
 * of a divergent code path, and the guarantee being protected is that no such
 * path exists — a property of the source, not of one observed session.
 */

const EDITOR = path.join(
  __dirname, '..', '..', 'src', 'app', 'app', 'editor', '[id]', 'page.tsx'
);
const PEERS = path.join(__dirname, '..', '..', 'src', 'app', 'app', 'peers', 'page.tsx');

/** Source with comment lines removed, so documenting the defect is not a hit. */
function executableSource(file: string): string {
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

test.describe('OT mode must not be a data-loss path', () => {
  test('the editor contains no algorithm branch that overwrites local content', () => {
    const code = executableSource(EDITOR);

    // No conditional on the OT algorithm may remain in the sync path.
    expect(code).not.toMatch(/algorithm\s*===\s*['"]ot['"]/);

    // And the tell-tale status messages of that branch must be gone.
    expect(code).not.toContain('Synced via OT');
  });

  test('the merge path is reached unconditionally when local work exists', () => {
    const code = executableSource(EDITOR);

    // Both poll branches must call the three-way merge. Two call sites, one
    // for the direct-host poll and one for the cloud poll.
    const mergeCalls = code.match(/computeSignatureMerge\(/g) ?? [];
    expect(mergeCalls.length).toBeGreaterThanOrEqual(2);

    // Each merge must still record both sides for review, so a conflict stays
    // recoverable rather than being silently resolved.
    const conflictPosts = code.match(/localContent:\s*currentContentRef\.current/g) ?? [];
    expect(conflictPosts.length).toBeGreaterThanOrEqual(2);
  });

  test('the room-creation UI no longer claims OT or CRDT behaviour', () => {
    const peers = fs.readFileSync(PEERS, 'utf8');

    // The old copy asserted both techniques; neither is implemented.
    expect(peers).not.toContain('Operational Transformation logic using pure CRDT trees');
    expect(peers).not.toContain('LWW overwrite loop is bypassed');

    // The option must state plainly that OT is not implemented.
    expect(peers).toContain('NOT IMPLEMENTED');
  });
});
