/**
 * Reported: selecting several users in the admin console and revoking them
 * only affects one.
 *
 * Creates five accounts, revokes them the way the old UI did (all at once)
 * and the way it does now (one at a time), and counts how many actually
 * changed status.
 *
 * Run: node scripts/probe-admin-bulk.js [baseUrl]
 */
const BASE = process.argv[2] || process.env.DEMO_BASE || 'http://localhost:3000';
const API = `${BASE}/api/auth`;

const post = (body) => fetch(API, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const sync = () => fetch(`${API}?action=sync`).then((r) => r.json()).catch(() => null);

async function makeUsers(n, tag) {
  const names = [];
  for (let i = 0; i < n; i++) {
    const email = `bulk-${tag}-${i}-${Math.floor(Math.random() * 10000)}`;
    // A unique device per account so the per-device request cap is not hit.
    await post({ action: 'request', email, deviceId: `dev-${tag}-${i}-${Math.random()}` });
    names.push(email);
  }
  const s = await sync();
  const ids = [];
  for (const email of names) {
    const p = (s?.pending || []).find((x) => x.email === email);
    if (p) {
      await post({ action: 'approve', reqId: p.id });
    }
  }
  const s2 = await sync();
  for (const email of names) {
    const u = (s2?.users || []).find((x) => x.email === email);
    if (u) ids.push({ id: u.id, email });
  }
  return ids;
}

const activeCount = async (ids) => {
  const s = await sync();
  return ids.filter(({ id }) => (s?.users || []).find((u) => u.id === id)?.status === 'active').length;
};

(async () => {
  console.log('PARALLEL (what the old UI did)');
  const a = await makeUsers(5, 'par');
  console.log(`  created ${a.length} active users`);
  await Promise.all(a.map(({ id }) => post({ action: 'revoke', userId: id })));
  const leftA = await activeCount(a);
  console.log(`  after revoking all 5 at once: ${leftA} still active  ->  ${5 - leftA} revoked`);
  console.log(`  ${leftA === 0 ? 'all revoked' : 'BUG: some survived the bulk revoke'}\n`);

  console.log('SEQUENTIAL (what the UI does now)');
  const b = await makeUsers(5, 'seq');
  console.log(`  created ${b.length} active users`);
  for (const { id } of b) await post({ action: 'revoke', userId: id });
  const leftB = await activeCount(b);
  console.log(`  after revoking one at a time: ${leftB} still active  ->  ${5 - leftB} revoked`);
  console.log(`  ${leftB === 0 ? 'all revoked — fixed' : 'still failing'}`);
})();
