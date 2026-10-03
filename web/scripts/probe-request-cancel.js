/**
 * Reported: after cancelling an account request, the same username cannot be
 * requested again.
 *
 * Drives the real API the way the client does: request, cancel, request the
 * same name again. Also exercises the device limit, because the request
 * counter is per device and a cancel may not give the slot back.
 *
 * Run: node scripts/probe-request-cancel.js [baseUrl]
 */
const BASE = process.argv[2] || process.env.DEMO_BASE || 'http://localhost:3000';
const API = `${BASE}/api/auth`;

const post = async (body) => {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let j = null;
  const t = await r.text();
  try { j = JSON.parse(t); } catch { }
  return { status: r.status, body: j ?? t.slice(0, 120) };
};

const sync = async () => {
  const r = await fetch(`${API}?action=sync`);
  const j = await r.json().catch(() => null);
  return j;
};

const show = (label, r) =>
  console.log(`  ${label.padEnd(34)} ${r.status}  ${JSON.stringify(r.body).slice(0, 110)}`);

(async () => {
  const name = 'cancel-probe-' + Math.floor(Math.random() * 100000);
  const deviceId = 'probe-device-' + Math.floor(Math.random() * 100000);
  console.log(`name: ${name}\ndevice: ${deviceId}\n`);

  console.log('STEP 1 — request the account');
  show('request', await post({ action: 'request', email: name, deviceId }));

  let s = await sync();
  let pending = (s?.pending || []).filter((p) => p.email === name);
  console.log(`  pending now contains it: ${pending.length === 1}`);

  console.log('\nSTEP 2 — cancel the request');
  show('cancel_request', await post({ action: 'cancel_request', email: name }));

  s = await sync();
  pending = (s?.pending || []).filter((p) => p.email === name);
  const users = (s?.users || []).filter((u) => u.email === name);
  console.log(`  still in pending: ${pending.length > 0}  (should be false)`);
  console.log(`  a user record exists: ${users.length > 0}  (should be false)`);
  if (users.length) console.log(`  user status: ${users.map((u) => u.status).join(',')}`);

  console.log('\nSTEP 3 — request the SAME name again');
  const again = await post({ action: 'request', email: name, deviceId });
  show('request (same name)', again);

  const ok = again.status === 200 && again.body?.success !== false;
  console.log(`\n  VERDICT: ${ok ? 'the name can be reused' : 'THE NAME IS BLOCKED — bug reproduced'}`);
  if (!ok) console.log(`  reason given: ${again.body?.error}`);

  console.log('\nSTEP 4 — how many times can one device request before it is capped?');
  for (let i = 1; i <= 4; i++) {
    const n = `${name}-x${i}`;
    const r = await post({ action: 'request', email: n, deviceId });
    console.log(`  attempt ${i} (${n}): ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
    await post({ action: 'cancel_request', email: n });
  }
  console.log('  (each attempt was cancelled straight after, so a cancel that');
  console.log('   returned the slot would let all four through)');
})();
