/**
 * QA campaign — account provisioning.
 *
 * Creates the test accounts the campaign needs by driving the real
 * registration path (request → admin approve → claim access code → set
 * permanent password), so provisioning is itself a tested flow rather than a
 * fixture inserted behind the application's back.
 *
 * Idempotent: an account that already exists and still accepts its known
 * password is left alone.
 *
 * Run: node scripts/qa-campaign-setup.js
 */
const BASE = process.env.QA_BASE || 'http://localhost:3000';
const API = `${BASE}/api/auth`;

const ADMIN = { email: 'admin', pin: 'admin' };

/** The campaign's users. Passwords are deliberately > 6 chars. */
const USERS = [
  { id: 'A', email: 'qa-alpha', password: 'qaAlpha2026!' },
  { id: 'B', email: 'qa-bravo', password: 'qaBravo2026!' },
  { id: 'C', email: 'qa-charlie', password: 'qaCharlie2026!' },
  { id: 'D', email: 'qa-delta', password: 'qaDelta2026!' },
  { id: 'E', email: 'qa-echo', password: 'qaEcho2026!' },
];

const post = (body) =>
  fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }));

const get = (qs) => fetch(`${API}?${qs}`).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));

async function login(email, pin) {
  const r = await post({ action: 'login', email, pin });
  return r.ok && r.data.success ? r.data.user : null;
}

async function ensureUser(u) {
  // Already usable?
  const existing = await login(u.email, u.password);
  if (existing) return { ...u, userId: existing.id, created: false };

  // Request access.
  await post({ action: 'request', email: u.email });

  // Approve as admin.
  const pending = await get('action=sync');
  const req = (pending.data.pending || []).find(
    (p) => String(p.email).toLowerCase() === u.email.toLowerCase()
  );
  if (!req) return { ...u, error: 'request did not appear in the pending queue' };

  // approve() is keyed on the pending request's own id, not the email.
  const approved = await post({ action: 'approve', reqId: req.id });
  if (!approved.ok) return { ...u, error: `approve failed HTTP ${approved.status}` };

  // Claim the issued access code.
  const claim = await get(`action=claim_pin&email=${encodeURIComponent(u.email)}`);
  const code = claim.data?.pin;
  if (!code) return { ...u, error: 'no access code issued after approval' };

  // Exchange it for the permanent password.
  const set = await post({ action: 'set_password', email: u.email, pin: code, password: u.password });
  if (!set.ok || !set.data.success) return { ...u, error: `set_password failed HTTP ${set.status}` };

  const verify = await login(u.email, u.password);
  if (!verify) return { ...u, error: 'cannot log in with the new password' };

  return { ...u, userId: verify.id, created: true, accessCode: code };
}

(async () => {
  console.log(`QA account provisioning against ${BASE}\n`);

  const admin = await login(ADMIN.email, ADMIN.pin);
  if (!admin) {
    console.error('FATAL: cannot sign in as admin — provisioning requires it.');
    process.exitCode = 1;
    return;
  }
  console.log(`  admin signed in (${admin.id})\n`);

  const results = [];
  for (const u of USERS) {
    const r = await ensureUser(u);
    results.push(r);
    const state = r.error ? `ERROR ${r.error}` : r.created ? 'created' : 'already usable';
    console.log(`  User ${r.id}  ${r.email.padEnd(12)}  ${state}`);
  }

  const failed = results.filter((r) => r.error);
  console.log(`\n${results.length - failed.length}/${results.length} accounts ready`);
  if (failed.length) process.exitCode = 1;

  // Emit the roster the campaign consumes.
  const fs = require('fs');
  fs.writeFileSync(
    require('path').join(__dirname, 'qa-accounts.json'),
    JSON.stringify(results.filter((r) => !r.error).map(({ id, email, password, userId }) => ({ id, email, password, userId })), null, 2)
  );
  console.log('roster written to scripts/qa-accounts.json');
})();
