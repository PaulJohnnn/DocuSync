/**
 * Offline-reconnect check — the path the manuscript describes as a
 * three-way merge with owner escalation on a genuine overlap.
 *
 * Peer B is taken offline, both peers edit DIFFERENT lines, then B comes
 * back. Non-overlapping edits must merge so that both survive.
 *
 * Run: node scripts/qa-offline-reconnect.js
 */
const { chromium } = require('playwright');
const BASE = process.env.QA_BASE || 'http://localhost:3000';

const results = [];
const check = (c, n, d = '') => { results.push({ ok: c, n }); console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

async function login(page, name) {
  await page.goto(`${BASE}/app/login`);
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 25000 });
  await page.fill('input[placeholder="Enter your username"]', 'admin');
  await page.fill('input[placeholder="Enter your password"]', 'admin');
  await page.click('button:has-text("Log In")');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25000 });
  await page.evaluate((n) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    u.name = n; sessionStorage.setItem('docusync_auth_user', JSON.stringify(u));
  }, name);
}

/** Editor text with remote cursor labels stripped. */
const readText = (page) => page.evaluate(() => {
  const el = document.querySelector('.ProseMirror');
  if (!el) return '';
  const c = el.cloneNode(true);
  c.querySelectorAll('[class*="collaboration-cursor"]').forEach(n => n.remove());
  return (c.innerText || c.textContent || '').replace(/\s+/g, ' ').trim();
});

(async () => {
  const browser = await chromium.launch();
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const A = await ctxA.newPage(), B = await ctxB.newPage();
  const sent = [];
  const watch = (page, who) => page.on('request', (r) => {
    if (!/\/api\/lobby\/doc/.test(r.url()) || r.method() !== 'POST') return;
    try {
      const b = JSON.parse(r.postData() || '{}');
      if (b.content !== undefined) sent.push({ who, len: b.content.length, content: b.content, base: b.baseContent, reconnect: !!b.isOfflineReconnect });
    } catch { }
  });
  watch(A, 'A'); watch(B, 'B');

  try {
    await Promise.all([login(A, 'Paul'), login(B, 'Zyra')]);

    await A.goto(`${BASE}/app/peers`);
    await A.click('button:has-text("Create Room")');
    await A.fill('input[placeholder*="Thesis Project"]', 'Offline Check');
    await A.click('button:has-text("Generate Room")');
    await A.waitForSelector('text=INVITE CODE', { timeout: 25000 });
    const otp = (await A.locator('text=INVITE CODE').locator('xpath=following-sibling::*[1]').innerText()).trim();
    await A.click('text=Enter Workspace');
    await A.waitForTimeout(1200);

    await B.goto(`${BASE}/app/peers`);
    await B.click('button:has-text("Join Room")');
    await B.locator('input[maxlength="6"]').fill(otp);
    await B.waitForFunction((c) => document.querySelector('input[maxlength="6"]')?.value === c, otp, { timeout: 10000 });
    await B.locator('button:has-text("Join Room")').last().click();
    await B.waitForSelector('text=Joined Room!', { timeout: 40000 });
    await B.click('text=Enter Workspace');
    await B.waitForTimeout(1200);

    const fileId = String(Date.now()).slice(-6);
    // Two clearly separate lines, so the reconnect merge has no genuine overlap.
    const html = '<div data-margin="96"><p>ALPHA line owned by Paul.</p>\n<p>BETA line owned by Zyra.</p>\n</div>';
    for (const p of [A, B]) {
      await p.evaluate(async ({ otp, fileId, html }) => {
        const db = await new Promise((res, rej) => {
          const r = indexedDB.open('DocuSyncDB', 1);
          r.onerror = () => rej(r.error); r.onsuccess = () => res(r.result);
          r.onupgradeneeded = (e) => { const d = e.target.result; if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' }); };
        });
        await new Promise((res, rej) => {
          const tx = db.transaction('files', 'readwrite');
          tx.objectStore('files').put({ id: fileId, name: 'offline.txt', type: 'text/plain', size: html.length, content: html, status: 'synced', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
          tx.oncomplete = res; tx.onerror = () => rej(tx.error);
        });
        await fetch('/api/lobby/doc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp, fileId, content: html, authorNodeId: 'seed', seq: 1, committedAt: Date.now(), isSessionEnd: true }) });
      }, { otp, fileId, html });
    }

    await A.goto(`${BASE}/app/editor/${fileId}`);
    await A.waitForSelector('.ProseMirror', { timeout: 25000 });
    await B.goto(`${BASE}/app/editor/${fileId}`);
    await B.waitForSelector('.ProseMirror', { timeout: 25000 });
    await A.waitForTimeout(3000);

    console.log('\n[offline-reconnect]');

    // Take B offline at the network layer — the real thing, not a flag.
    await ctxB.setOffline(true);
    await B.evaluate(() => window.dispatchEvent(new Event('offline')));
    await B.waitForTimeout(1500);
    check(true, 'second device taken offline');

    // B edits its own line while disconnected.
    await B.locator('.ProseMirror').click();
    await B.keyboard.press('Control+End');
    await B.keyboard.type(' ZYRA-OFFLINE.', { delay: 20 });
    await B.waitForTimeout(1500);
    const bOffline = await readText(B);
    check(bOffline.includes('ZYRA-OFFLINE'), 'offline edit is kept locally while disconnected');

    // Meanwhile A edits the FIRST line, which B has not touched.
    await A.evaluate(() => {
      const p = document.querySelector('.ProseMirror p');
      if (p) {
        const r = document.createRange(); r.selectNodeContents(p); r.collapse(false);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      }
    });
    await A.keyboard.type(' PAUL-ONLINE.', { delay: 20 });
    await A.waitForTimeout(4000);
    const aOnline = await readText(A);
    check(aOnline.includes('PAUL-ONLINE'), 'online peer edited a different line');

    // Reconnect B.
    await ctxB.setOffline(false);
    await B.evaluate(() => window.dispatchEvent(new Event('online')));
    console.log('  second device back online — waiting for reconcile');
    await B.waitForTimeout(20000);

    console.log('  --- document pushes ---');
    sent.slice(-6).forEach(s => {
      console.log(`    ${s.who} len=${s.len} reconnect=${s.reconnect}`);
      console.log(`      content: ${JSON.stringify(s.content).slice(0, 130)}`);
      console.log(`      base   : ${s.base === undefined || s.base === null ? String(s.base) : JSON.stringify(s.base).slice(0, 110)}`);
    });
    const storedDoc = await A.evaluate(async ({ otp, fileId }) => {
      const r = await fetch(`/api/lobby/doc?otp=${otp}&fileId=${fileId}&since=1`);
      return (await r.json()).content || '';
    }, { otp, fileId });
    console.log('  server stored: ' + JSON.stringify(storedDoc).slice(0, 200));
    console.log('    has ALPHA: ' + storedDoc.includes('ALPHA') + '  has PAUL-ONLINE: ' + storedDoc.includes('PAUL-ONLINE') + '  has ZYRA-OFFLINE: ' + storedDoc.includes('ZYRA-OFFLINE'));
    const finalA = await readText(A);
    const finalB = await readText(B);
    console.log(`  A: ${finalA.slice(0, 120)}`);
    console.log(`  B: ${finalB.slice(0, 120)}`);

    check(finalB.includes('ZYRA-OFFLINE'), 'reconnected peer kept its own offline edit');
    check(finalB.includes('PAUL-ONLINE'), 'reconnected peer received the edit made while it was away');
    check(!/ALPHA line owned by Paul[\s\S]*ALPHA line owned by Paul/.test(finalB), 'document did not duplicate on reconnect');

    await A.evaluate(async (o) => { await fetch('/api/admin/delete-group', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp: o }) }); }, otp);
  } catch (err) {
    check(false, 'offline-reconnect completed', err.message.split('\n')[0]);
  } finally {
    const bad = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - bad}/${results.length} checks passed`);
    if (bad) process.exitCode = 1;
    await browser.close();
  }
})();
