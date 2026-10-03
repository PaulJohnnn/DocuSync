/**
 * Does the Sync Rooms page notice when someone else joins?
 *
 * Paul sits on the peers page and does not touch it. Zyra, then Cora, join
 * the room from elsewhere. The count Paul is looking at must change on its
 * own — before the fix it only ever refreshed on Paul's own actions, so it
 * showed whatever it said when he arrived.
 *
 * Run: node scripts/probe-peers-page.js
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

/** The peer count as actually rendered on the Sync Rooms card. */
const shownCount = (page) => page.evaluate(() => {
  const m = document.body.innerText.match(/(\d+)\s+peers?\b/);
  return m ? Number(m[1]) : null;
});

async function join(page, otp, who) {
  await page.goto(`${BASE}/app/peers`);
  await beat(page, 900);
  await page.click('button:has-text("Join Room")');
  await beat(page, 500);
  await page.locator('input[maxlength="6"]').fill(otp);
  await page.waitForFunction((c) => document.querySelector('input[maxlength="6"]')?.value === c, otp, { timeout: 10000 });
  await beat(page, 400);
  await page.locator('button:has-text("Join Room")').last().click();
  try { await page.waitForSelector('text=Joined Room!', { timeout: 25000 }); }
  catch { console.log(`  ! ${who} join not confirmed`); }
  await beat(page, 800);
  await page.click('text=Enter Workspace').catch(() => { });
  await beat(page, 1000);
  console.log(`  ${who} joined`);
}

(async () => {
  const browser = await chromium.launch();
  const ctxs = [];
  const mk = async (label, acct) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await login(page, label, acct);
    ctxs.push(ctx);
    return page;
  };

  try {
    const paul = await mk('Paul', U.A);
    const zyra = await mk('Zyra', U.B);
    const cora = await mk('Cora', U.C);

    await paul.goto(`${BASE}/app/peers`);
    await beat(paul, 1200);
    await paul.click('button:has-text("Create Room")');
    await beat(paul, 600);
    await paul.fill('input[placeholder*="Thesis Project"]', 'Peers Page Probe');
    await beat(paul, 400);
    await paul.click('button:has-text("Generate Room")');
    await paul.waitForSelector('text=INVITE CODE', { timeout: 40000 });
    const otp = (await paul.locator('text=INVITE CODE').locator('xpath=following-sibling::*[1]').innerText()).trim();
    console.log('room:', otp);
    await paul.click('text=Enter Workspace');
    await beat(paul, 1200);

    // Paul parks on the Sync Rooms list and does nothing further.
    await paul.goto(`${BASE}/app/peers`);
    await beat(paul, 3000);
    const before = await shownCount(paul);
    console.log(`\nPaul is on the Sync Rooms page. It shows: ${before} peer(s)`);

    console.log('\nothers join while Paul does not touch his screen...');
    await join(zyra, otp, 'Zyra');
    await join(cora, otp, 'Cora');

    console.log('\nwatching Paul’s screen for 30s without interacting:');
    let best = before;
    for (let i = 1; i <= 5; i++) {
      await beat(paul, 6000);
      const n = await shownCount(paul);
      if (n !== null && n > best) best = n;
      console.log(`   +${i * 6}s  Paul's page shows ${n} peer(s)`);
    }

    await paul.screenshot({ path: path.join(__dirname, 'ui-shots', 'peers-page-3dev.png') });
    console.log('\nscreenshot: scripts/ui-shots/peers-page-3dev.png');
    console.log(best >= 3
      ? `\nRESULT: the count updated on its own (${before} -> ${best}). Fixed.`
      : `\nRESULT: still stuck at ${best}. Not fixed.`);
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    for (const c of ctxs) await c.close().catch(() => { });
    await browser.close();
  }
})();
