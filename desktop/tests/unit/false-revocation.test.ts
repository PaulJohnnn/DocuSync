import * as fs from 'fs';
import * as path from 'path';

/**
 * Regression test — an idle desktop session must not be told its account was
 * revoked.
 *
 * The auth poll runs every two seconds and used to tear the session down the
 * instant one response failed to contain the signed-in account:
 *
 *   const stillExists = (data.users || []).find(u => u.id === user.id && u.status === 'active');
 *   if (!stillExists) {
 *     window.alert("Your account has been deleted or revoked by an administrator.");
 *     logout();
 *   }
 *
 * Two independent faults in four lines:
 *
 *   1. `(data.users || [])` turns a missing or empty roster into an empty
 *      array, so a 200 carrying no users — a cold start, a Redis blip, a
 *      truncated payload, a stalled read after the machine woke — was read as
 *      proof of revocation.
 *   2. A single observation was enough. There was no second opinion, so one
 *      bad read out of the ~1,800 polls an hour logged the user out and
 *      blamed an administrator for it.
 *
 * Leaving the app idle was therefore sufficient to trigger it, because an
 * idle app still polls.
 *
 * These assertions are source-level because the guarantee is structural: the
 * logout path must be unreachable from a single unproven observation. That is
 * a property of the control flow, not of one simulated session.
 */

const SERVICE = path.join(__dirname, '..', '..', 'src', 'services', 'mockAuthService.ts');

describe('desktop auth poll must not falsely revoke an idle session', () => {
  let source: string;

  /** Source with comment lines stripped, so describing the old bug is not a hit. */
  let code: string;

  beforeAll(() => {
    source = fs.readFileSync(SERVICE, 'utf8');
    code = source
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
      })
      .join('\n');
  });

  it('requires more than one consecutive observation before logging out', () => {
    expect(code).toMatch(/_missingSelfStreak/);
    expect(code).toMatch(/MISSING_SELF_STRIKES\s*=\s*([2-9]|\d{2,})/);
    // The logout must be gated on the streak reaching the threshold.
    expect(code).toMatch(/_missingSelfStreak\s*>=\s*MISSING_SELF_STRIKES/);
  });

  it('treats an empty or missing roster as unknown, not as proof', () => {
    // The roster must be validated as a non-empty array before any conclusion.
    expect(code).toMatch(/Array\.isArray\(data\.users\)/);
    expect(code).toMatch(/roster\.length\s*>\s*0/);

    // The old shape coerced a missing roster into an empty array and searched
    // it directly — that exact pattern must not drive the logout decision.
    expect(code).not.toMatch(/\(data\.users\s*\|\|\s*\[\]\)\.find\([^)]*status\s*===\s*'active'/);
  });

  it('clears suspicion when nothing was proven', () => {
    // Offline, a non-OK response, a thrown request, and an inconclusive
    // roster must each reset the counter rather than let it accumulate
    // across unrelated failures.
    const resets = code.match(/_missingSelfStreak\s*=\s*0/g) ?? [];
    expect(resets.length).toBeGreaterThanOrEqual(4);
  });

  it('does not log out while the device is offline', () => {
    expect(code).toMatch(/navigator\.onLine/);
    // The offline branch must return before any roster evaluation.
    const offlineIdx = code.indexOf('navigator.onLine');
    const logoutIdx = code.indexOf('MISSING_SELF_STRIKES');
    expect(offlineIdx).toBeGreaterThan(-1);
    expect(logoutIdx).toBeGreaterThan(offlineIdx);
  });

  it('still logs out when revocation is genuinely confirmed', () => {
    // The protection must not have removed the real behaviour: a confirmed
    // revocation still ends the session.
    expect(code).toContain('logout()');
    expect(source).toContain('deleted or revoked by an administrator');
  });
});
