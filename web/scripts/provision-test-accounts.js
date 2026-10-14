/**
 * Creates two clearly-named test accounts through the real approval flow:
 * request -> admin approve -> set password.
 *
 * Needed because the qa-* accounts only exist in the local Redis, so nothing
 * can sign in to the live site to verify cross-device collaboration.
 *
 * The names are prefixed `zz-test-` so they sort to the bottom of the admin
 * list and are obvious to revoke afterwards.
 *
 * Writes the credentials to scripts/live-accounts.json (gitignored).
 *
 * Run: node scripts/provision-test-accounts.js [baseUrl]
 */
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'https://docusync-dusky.vercel.app';
const API = `${BASE}/api/auth`;

const post = (body) => fetch(API, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const sync = () => fetch(`${API}?action=sync`).then((r) => r.json()).catch(() => null);

async function provision(email, password) {
  const deviceId = 'provision-' + Math.random().toString(36).slice(2);
  const req = await post({ action: 'request', email, deviceId });
  if (req.body?.success === false) return { email, error: req.body.error };

  const s = await sync();
  const pending = (s?.pending || []).find((p) => p.email === email);
  if (!pending) {
    const existing = (s?.users || []).find((u) => u.email === email);
    if (existing) return { email, note: 'already existed' };
    return { email, error: 'request did not appear in pending' };
  }

  const appr = await post({ action: 'approve', reqId: pending.id });
  const pin = appr.body?.pin || appr.body?.user?.pin;
  if (!pin) return { email, error: 'approve returned no PIN' };

  const setp = await post({ action: 'set_password', email, pin, password });
  if (setp.body?.success === false) {
    return { email, pin, error: `set_password: ${setp.body.error}`, note: 'sign in with the PIN instead' };
  }
  return { email, password, pin };
}

(async () => {
  console.log(`target: ${BASE}\n`);
  const stamp = Math.floor(Math.random() * 10000);
  const out = [];
  // Names can be passed in so a screenshot reads like a real room rather
  // than like a test harness. They still start `zz-test-` so they sort to
  // the bottom of the admin list and are obvious to revoke.
  const names = (process.env.TEST_NAMES || 'alpha,bravo').split(',');
  for (const [id, suffix] of [['A', names[0]], ['B', names[1] || 'bravo']]) {
    const email = `zz-test-${suffix}-${stamp}`;
    // Generated per run, never written into the repository.
    //
    // This was a fixed string in the source. These are real accounts on a
    // live system, so a password committed to a public repo is a password
    // anyone can read -- and every set of test accounts ever provisioned
    // shared it. The value goes only to the credentials file, which is
    // gitignored.
    const password = 'T' + require('crypto').randomBytes(12).toString('base64url') + '!9';
    const r = await provision(email, password);
    out.push({ id, ...r });
    console.log(`  ${id}: ${email}  ${r.error ? 'ERROR: ' + r.error : 'ready'}${r.pin ? ` (pin ${r.pin})` : ''}`);
  }
  const file = path.join(__dirname, 'live-accounts.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`\nwrote ${file}`);
  console.log('These are test accounts — revoke them from the admin console when done.');
})();
