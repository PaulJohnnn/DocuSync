/**
 * Reproduces the reported bug: with three or more devices in a room, the
 * member count and the list of who is editing do not reflect reality.
 *
 * Three real browser sessions join one room, open the same document, and
 * each one is then asked what IT believes the room contains — the peer list
 * the app itself is holding, not a server value. That is what the user sees.
 *
 * Run: node scripts/probe-member-count.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.DEMO_BASE || 'http://localhost:3000';
const accounts = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa-accounts.json'), 'utf8'));
const U = Object.fromEntries(accounts.map((a) => [a.id, a]));

const beat = (p, ms) => p.waitForTimeout(ms);

async function login(page, name, acct) {
  await page.goto(`${BASE}/app/login`);
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 60000 });
  await page.fill('input[placeholder="Enter your username"]', acct.email);
  await page.fill('input[placeholder="Enter your password"]', acct.password);
  await page.click('button:has-text("Log In")');
  await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), { timeout: 40000 });
  await page.evaluate((n) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    u.name = n; sessionStorage.setItem('docusync_auth_user', JSON.stringify(u));
  }, name);
}

/** What this session believes about the room, read from its own state. */
const view = (page) => page.evaluate(() => {
  // Storage is namespaced per user as `ds_{userId}_{key}`, so read by suffix
  // rather than by the bare key name.
  const bySuffix = (suffix) => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.endsWith('_' + suffix)) return localStorage.getItem(k);
    }
    return null;
  };
  let peers = [];
  try { peers = JSON.parse(bySuffix('peers') || '[]'); } catch { }
  let room = null;
  try { room = JSON.parse(bySuffix('current_room') || 'null'); } catch { }
  return {
    otp: room?.otp ?? null,
    peerCount: Array.isArray(peers) ? peers.length : 0,
    peerNames: Array.isArray(peers) ? peers.map((p) => p.displayName || p.id?.slice(0, 8)) : [],
    editingHere: Array.isArray(peers) ? peers.filter((p) => p.openFileId).length : 0,
  };
});

(async () => {
  const browser = await chromium.launch();
  const made = [];
  const mk = async (label, acct) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    await login(page, label, acct);
    made.push({ label, ctx, page });
    return page;
  };

  try {
    console.log('signing in three sessions...');
    const paul = await mk('Paul', U.A);
    const zyra = await mk('Zyra', U.B);
    const cora = await mk('Cora', U.C);

    // Paul creates the room.
    await paul.goto(`${BASE}/app/peers`);
    await beat(paul, 1200);
    await paul.click('button:has-text("Create Room")');
    await beat(paul, 600);
    await paul.fill('input[placeholder*="Thesis Project"]', 'Member Count Probe');
    await beat(paul, 400);
    await paul.click('button:has-text("Generate Room")');
    await paul.waitForSelector('text=INVITE CODE', { timeout: 40000 });
    const otp = (await paul.locator('text=INVITE CODE').locator('xpath=following-sibling::*[1]').innerText()).trim();
    console.log('room:', otp);
    await paul.click('text=Enter Workspace');
    await beat(paul, 1500);

    // The other two join.
    for (const [page, who] of [[zyra, 'Zyra'], [cora, 'Cora']]) {
      await page.goto(`${BASE}/app/peers`);
      await beat(page, 900);
      await page.click('button:has-text("Join Room")');
      await beat(page, 500);
      await page.locator('input[maxlength="6"]').fill(otp);
      await page.waitForFunction((c) => document.querySelector('input[maxlength="6"]')?.value === c, otp, { timeout: 10000 });
      await beat(page, 400);
      await page.locator('button:has-text("Join Room")').last().click();
      try { await page.waitForSelector('text=Joined Room!', { timeout: 25000 }); }
      catch { console.log(`  ! ${who} join did not confirm`); }
      await beat(page, 900);
      await page.click('text=Enter Workspace').catch(() => { });
      await beat(page, 1200);
      console.log(`  ${who} joined`);
    }

    // Everyone opens the same document.
    const fileId = String(Date.now()).slice(-6);
    const doc = '<div data-margin="96"><p>LINE A.</p><p>LINE B.</p><p>LINE C.</p></div>';
    for (const p of [paul, zyra, cora]) {
      await p.evaluate(async ({ otp, fileId, doc }) => {
        await fetch('/api/lobby/doc', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otp, fileId, content: doc, authorNodeId: 'seed', seq: 1, committedAt: Date.now(), isSessionEnd: true }),
        });
      }, { otp, fileId, doc });
      await p.goto(`${BASE}/app/editor/${fileId}`);
      await p.waitForSelector('.ProseMirror', { timeout: 40000 }).catch(() => { });
    }

    console.log('\nwaiting for presence to settle, sampling every 6s\n');
    for (let round = 1; round <= 4; round++) {
      await beat(paul, 6000);
      const [a, b, c] = await Promise.all([view(paul), view(zyra), view(cora)]);
      console.log(`round ${round}`);
      for (const [who, v] of [['Paul', a], ['Zyra', b], ['Cora', c]]) {
        console.log(`   ${who.padEnd(5)} sees ${v.peerCount} other peer(s): [${v.peerNames.join(', ')}]  editing-this-file=${v.editingHere}`);
      }
      const expected = 2; // each should see the other two
      const ok = [a, b, c].every((v) => v.peerCount === expected);
      console.log(`   -> ${ok ? 'CORRECT' : 'WRONG'} (each should see ${expected})\n`);
    }

    // Visual proof of what each session actually displays.
    const shotDir = path.join(__dirname, 'ui-shots');
    fs.mkdirSync(shotDir, { recursive: true });
    for (const [page, who] of [[paul, 'Paul'], [zyra, 'Zyra'], [cora, 'Cora']]) {
      await page.screenshot({ path: path.join(shotDir, `editor-3dev-${who}.png`) });
    }
    console.log('screenshots written to scripts/ui-shots/editor-3dev-*.png');

    // What the server itself reports.
    const srv = await paul.evaluate(async () => {
      const r = await fetch('/api/lobby/list');
      const j = await r.json();
      return (j.rooms || []).map((x) => ({ id: x.id, peersJoined: x.peersJoined }));
    });
    console.log('server /api/lobby/list says:', JSON.stringify(srv.slice(0, 5)));
  } catch (e) {
    console.error('PROBE FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    for (const m of made) await m.ctx.close().catch(() => { });
    await browser.close();
  }
})();
