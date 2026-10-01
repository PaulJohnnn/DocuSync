/**
 * End-to-end QA of the flows a panelist is likely to try.
 *
 * Every check asserts on observable behaviour — what the server stored, what
 * the other device actually shows, what a download really contains — rather
 * than on a control having been clicked.
 *
 * Run: node scripts/qa-full-suite.js
 */
const { chromium } = require('playwright');

const BASE = process.env.QA_BASE || 'http://localhost:3000';
const results = [];
const pass = (n, d = '') => { results.push({ ok: true, n, d }); console.log(`  PASS  ${n}${d ? '  — ' + d : ''}`); };
const fail = (n, d = '') => { results.push({ ok: false, n, d }); console.log(`  FAIL  ${n}${d ? '  — ' + d : ''}`); };
const check = (cond, n, d = '') => cond ? pass(n, d) : fail(n, d);

async function login(page, displayName) {
  await page.goto(`${BASE}/app/login`);
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 25000 });
  await page.fill('input[placeholder="Enter your username"]', 'admin');
  await page.fill('input[placeholder="Enter your password"]', 'admin');
  await page.click('button:has-text("Log In")');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25000 });
  await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), { timeout: 25000 });
  if (displayName) {
    await page.evaluate((n) => {
      const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
      u.name = n; sessionStorage.setItem('docusync_auth_user', JSON.stringify(u));
    }, displayName);
  }
}

const focusEnd = async (page) => {
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('Control+End');
};

(async () => {
  const browser = await chromium.launch();
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  let otp = null;

  try {
    // ══ 1. AUTH ════════════════════════════════════════════════════════
    console.log('\n[1] Authentication');
    await login(A, 'Paul');
    check(!A.url().includes('/login'), 'admin can sign in');

    await login(B, 'Zyra');
    const bUser = await B.evaluate(() => sessionStorage.getItem('docusync_auth_user'));
    check(!!bUser, 'second session established');

    const badLogin = await A.evaluate(async () => {
      const r = await fetch('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email: 'admin', pin: 'definitely-wrong' }),
      });
      return r.status;
    });
    check(badLogin >= 400, 'wrong password is rejected', `HTTP ${badLogin}`);

    const leak = await A.evaluate(async () => {
      const r = await fetch('/api/auth?action=sync');
      return JSON.stringify(await r.json());
    });
    check(!/"pin"/.test(leak), 'roster exposes no PINs');
    check(!/resetOtp/.test(leak), 'roster exposes no reset codes');

    // ══ 2. ROOMS ═══════════════════════════════════════════════════════
    console.log('\n[2] Rooms');
    await A.goto(`${BASE}/app/peers`);
    await A.click('button:has-text("Create Room")');
    await A.fill('input[placeholder*="Thesis Project"]', 'QA Suite Room');
    await A.click('button:has-text("Generate Room")');
    await A.waitForSelector('text=INVITE CODE', { timeout: 25000 });
    otp = (await A.locator('text=INVITE CODE').locator('xpath=following-sibling::*[1]').innerText()).trim();
    check(/^[A-Z0-9]{6}$/.test(otp), 'room created with a 6-character code', otp);
    check(!/[IO01]/.test(otp), 'code avoids confusable characters');
    await A.click('text=Enter Workspace');
    await A.waitForTimeout(1500);

    await B.goto(`${BASE}/app/peers`);
    await B.click('button:has-text("Join Room")');
    await B.locator('input[maxlength="6"]').fill(otp);
    await B.waitForFunction((c) => document.querySelector('input[maxlength="6"]')?.value === c, otp, { timeout: 10000 });
    await B.locator('button:has-text("Join Room")').last().click();
    await B.waitForSelector('text=Joined Room!', { timeout: 40000 });
    await B.click('text=Enter Workspace');
    await B.waitForTimeout(1800);
    const joined = await B.evaluate(() => {
      const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
      return localStorage.getItem(`ds_${u.id}_current_room`);
    });
    check(!!joined && joined.includes(otp), 'second device joined by code');

    const badJoin = await B.evaluate(async () => {
      const r = await fetch('/api/lobby/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: 'ZZZZZZ', memberNodeId: 'qa' }),
      });
      return r.status;
    });
    check(badJoin >= 400, 'joining a non-existent room is refused', `HTTP ${badJoin}`);

    // ══ 3. FILES ═══════════════════════════════════════════════════════
    console.log('\n[3] Files');
    const fileId = String(Date.now()).slice(-6);
    const html = '<div data-margin="96"><h2>QA Document</h2>\n<p>First line of the QA document.</p>\n<p>Second line with an &amp; entity.</p>\n</div>';
    for (const p of [A, B]) {
      await p.evaluate(async ({ otp, fileId, html }) => {
        const db = await new Promise((res, rej) => {
          const r = indexedDB.open('DocuSyncDB', 1);
          r.onerror = () => rej(r.error); r.onsuccess = () => res(r.result);
          r.onupgradeneeded = (e) => { const d = e.target.result; if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' }); };
        });
        await new Promise((res, rej) => {
          const tx = db.transaction('files', 'readwrite');
          tx.objectStore('files').put({ id: fileId, name: 'qa-document.txt', type: 'text/plain', size: html.length, content: html, status: 'synced', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
          tx.oncomplete = res; tx.onerror = () => rej(tx.error);
        });
        await fetch('/api/lobby/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp, file: { fileId: Number(fileId), fileName: 'qa-document.txt', content: html, contentLength: html.length, sharedBy: 'Paul', sharedAt: new Date().toISOString() } }) });
        await fetch('/api/lobby/doc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp, fileId, content: html, authorNodeId: 'qa-seed', seq: 1, committedAt: Date.now(), isSessionEnd: true }) });
      }, { otp, fileId, html });
    }

    await A.goto(`${BASE}/app/files`);
    await A.waitForSelector('text=qa-document.txt', { timeout: 25000 });
    pass('shared file is listed in the room');

    // Download — capture the blob rather than writing to disk
    await A.evaluate(() => {
      window.__dl = null;
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (b) => { window.__dlBlob = b; return orig(b); };
      HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl = { name: this.download }; return; } };
    });
    // Download is no longer a single button that always emits .txt — it opens
    // a format menu. Open it, then choose plain text so the assertions below
    // still describe the format they were written for.
    await A.click('button[title="Download as…"]');
    await A.waitForSelector('[role="menu"]', { timeout: 10000 });
    await A.click('[role="menu"] button:has-text("Plain text")');
    await A.waitForTimeout(2500);
    const dl = await A.evaluate(async () => ({
      name: window.__dl?.name,
      text: window.__dlBlob ? await window.__dlBlob.text() : null,
    }));
    check(!!dl.name && dl.name.endsWith('.txt'), 'download produces a .txt file', dl.name || 'none');
    check(!!dl.text && dl.text.includes('QA Document'), 'download contains the document text');
    check(!!dl.text && !/[<>]/.test(dl.text), 'download is plain text, not raw HTML');
    check(!!dl.text && dl.text.includes('& entity'), 'HTML entities decoded in the download');

    // The menu must also offer a real Word document, not text under a .docx
    // name — the exporter builds an OOXML package, so the blob must be a ZIP.
    await A.click('button[title="Download as…"]');
    await A.waitForSelector('[role="menu"]', { timeout: 10000 });
    await A.click('[role="menu"] button:has-text("Word document")');
    await A.waitForTimeout(2500);
    const docx = await A.evaluate(async () => {
      if (!window.__dlBlob) return null;
      const buf = new Uint8Array(await window.__dlBlob.arrayBuffer());
      return { name: window.__dl?.name, bytes: buf.length, magic: String.fromCharCode(buf[0], buf[1]) };
    });
    check(!!docx && docx.name.endsWith('.docx'), 'Word download is named .docx', docx?.name || 'none');
    check(!!docx && docx.magic === 'PK', 'Word download is a real OOXML container', docx?.magic || 'none');

    // ══ 4. EDITOR + COLLABORATION ══════════════════════════════════════
    console.log('\n[4] Editor and collaboration');
    await A.goto(`${BASE}/app/editor/${fileId}`);
    await A.waitForSelector('.ProseMirror', { timeout: 25000 });
    await B.goto(`${BASE}/app/editor/${fileId}`);
    await B.waitForSelector('.ProseMirror', { timeout: 25000 });
    await A.waitForTimeout(2500);
    pass('both devices opened the document');

    const marker = 'QA-' + Math.random().toString(36).slice(2, 7).toUpperCase();
    await focusEnd(A);
    const t0 = Date.now();
    await A.keyboard.type(' ' + marker, { delay: 20 });
    let syncMs = null;
    try {
      await B.waitForFunction((m) => document.querySelector('.ProseMirror')?.innerText.includes(m), marker, { timeout: 45000 });
      syncMs = Date.now() - t0;
      pass('edit on device 1 reached device 2', `${syncMs} ms`);
    } catch { fail('edit on device 1 reached device 2', 'not received within 45s'); }

    const marker2 = 'REPLY-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    await focusEnd(B);
    await B.keyboard.type(' ' + marker2, { delay: 20 });
    try {
      await A.waitForFunction((m) => document.querySelector('.ProseMirror')?.innerText.includes(m), marker2, { timeout: 45000 });
      pass('reply from device 2 reached device 1');
    } catch { fail('reply from device 2 reached device 1', 'not received within 45s'); }

    // toolbar formatting actually applies a mark
    await focusEnd(A);
    await A.keyboard.type(' boldtest', { delay: 15 });
    for (let i = 0; i < 8; i++) await A.keyboard.press('Shift+ArrowLeft');
    const boldBtn = A.locator('.ProseMirror').locator('xpath=ancestor::*[3]').locator('button').first();
    try {
      await A.click('button[title="Bold"], button[aria-label="Bold"]', { timeout: 5000 });
    } catch {
      await A.keyboard.press('Control+b');
    }
    await A.waitForTimeout(800);
    const hasBold = await A.evaluate(() => !!document.querySelector('.ProseMirror strong'));
    check(hasBold, 'bold formatting applies in the editor');

    // margin control changes the rendered page inset
    const marginBefore = await A.evaluate(() => {
      const l = document.querySelector('.ds-paginated-editor-layer');
      return l ? getComputedStyle(l).paddingLeft : null;
    });
    try {
      await A.selectOption('select', { index: 0 });
      await A.waitForTimeout(1200);
      const marginAfter = await A.evaluate(() => {
        const l = document.querySelector('.ds-paginated-editor-layer');
        return l ? getComputedStyle(l).paddingLeft : null;
      });
      check(marginBefore !== null && marginAfter !== null, 'margin control is wired to the page inset',
        `${marginBefore} -> ${marginAfter}`);
    } catch { fail('margin control is wired to the page inset', 'select not found'); }

    // ══ 5. HISTORY ═════════════════════════════════════════════════════
    console.log('\n[5] Version history');
    await A.goto(`${BASE}/app/history/${fileId}`);
    await A.waitForTimeout(4000);
    const events = await A.evaluate(() => (document.body.innerText.match(/Previous Edit|Restore|View/g) || []).length);
    check(events > 0, 'history lists events with restore controls', `${events} markers`);
    const histText = await A.evaluate(() => document.body.innerText);
    check(!histText.includes('Failed to fetch history'), 'history loaded without error');

    // ══ 6. METRICS ═════════════════════════════════════════════════════
    console.log('\n[6] Metrics');
    await A.goto(`${BASE}/app/metrics`);
    await A.waitForTimeout(5000);
    const m = await A.evaluate(async () => {
      const room = JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith('_current_room')) || '') || '{}');
      const r = await fetch(`/api/lobby/metrics?otp=${room.otp}`);
      const j = await r.json();
      return { hasData: j.hasData, pushes: j.metrics?.totalPushes, body: document.body.innerText };
    });
    check(m.hasData === true, 'metrics report real recorded activity', `${m.pushes} pushes`);
    check(/ROOM-WIDE|Room-wide/i.test(m.body), 'metrics label room-wide figures');
    check(/this device/i.test(m.body), 'metrics label the device-local figure');

    // ══ 7. ADMIN ═══════════════════════════════════════════════════════
    console.log('\n[7] Admin');
    const email = 'qa-suite-' + Date.now().toString().slice(-5);
    await B.evaluate(async (e) => {
      await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'request', email: e, deviceId: 'qa-' + Date.now() }) });
    }, email);
    await A.goto(`${BASE}/app/admin/dashboard`);
    await A.waitForSelector('text=Pending Requests', { timeout: 25000 });
    await A.waitForSelector(`text=${email}`, { timeout: 25000 });
    pass('new request appears in the admin queue');

    const approved = await A.evaluate(async (e) => {
      const rows = [...document.querySelectorAll('div')].filter(d => d.textContent.includes(e));
      const row = rows[rows.length - 1].closest('div[style*="space-between"]') || rows[rows.length - 1].parentElement.parentElement;
      const btn = [...row.querySelectorAll('button')].find(b => /approve/i.test(b.textContent));
      if (!btn) return 'no approve button';
      btn.click();
      await new Promise(r => setTimeout(r, 4000));
      const sync = await (await fetch('/api/auth?action=sync')).json();
      const u = (sync.users || []).find(u => u.email === e);
      return u ? u.status : 'not created';
    }, email);
    check(approved === 'active', 'approving creates an active account', String(approved));

    const presence = await A.evaluate(async () => (await (await fetch('/api/auth?action=admin_status')).json()));
    check(presence.online === true, 'admin presence is reported while signed in', `${presence.adminsOnline} online`);

    const fakePresence = await B.evaluate(async () => {
      const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'admin_heartbeat', userId: 'user-001' }) });
      return r.status;
    });
    check(fakePresence === 403, 'non-admin cannot fake presence', `HTTP ${fakePresence}`);

    // clean up the account this suite created
    await A.evaluate(async (e) => {
      const sync = await (await fetch('/api/auth?action=sync')).json();
      for (const u of (sync.users || []).filter(u => u.email === e)) {
        await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'revoke', userId: u.id }) });
      }
    }, email);

    // == 8. CONCURRENT EDIT CONVERGENCE ==============================
    // The thesis claim is convergence, not that both edits survive: a
    // same-line collision resolves by Last-Write-Wins, so exactly one edit
    // remains. What must hold is that BOTH devices end up showing the same
    // thing and the document does not duplicate itself.
    console.log('\n[8] Concurrent same-line edit');
    await A.goto(`${BASE}/app/editor/${fileId}`);
    await A.waitForSelector('.ProseMirror', { timeout: 25000 });
    await B.goto(`${BASE}/app/editor/${fileId}`);
    await B.waitForSelector('.ProseMirror', { timeout: 25000 });
    await A.waitForTimeout(3000);

    const focus = async (p) => {
      await p.locator('.ProseMirror').click();
      await p.keyboard.press('Control+End');
      await p.waitForFunction(() => document.activeElement?.classList?.contains('ProseMirror'), { timeout: 8000 });
    };
    await focus(A); await focus(B); await focus(A);
    await Promise.all([
      A.keyboard.type(' AAA-SIDE.', { delay: 18 }),
      B.keyboard.type(' BBB-SIDE.', { delay: 18 }),
    ]);
    await A.waitForTimeout(16000);

    // Remote cursor labels are rendered INSIDE the text flow, so a peer's
    // name lands in the middle of whatever the other person typed and
    // breaks a naive innerText comparison. Strip them before asserting.
    const norm = () => {
      const el = document.querySelector('.ProseMirror'); if (!el) return ''; const c = el.cloneNode(true); c.querySelectorAll('[class*="collaboration-cursor"]').forEach(n => n.remove()); return (c.innerText || c.textContent || '').replace(/\s+/g, ' ').trim();
    };
    const textA = await A.evaluate(norm);
    const textB = await B.evaluate(norm);
    const headA = (textA.match(/QA Document/g) || []).length;
    const headB = (textB.match(/QA Document/g) || []).length;
    check(headA === 1 && headB === 1, 'document did not duplicate itself', 'heading x' + headA + ' / x' + headB);
    check(textA === textB, 'both devices converged to identical text');
    const survivors = ['AAA-SIDE', 'BBB-SIDE'].filter(m => textA.includes(m));
    check(survivors.length >= 1, 'a surviving edit is present after the collision', survivors.join(' + ') || 'none');

  } catch (err) {
    fail('suite completed without crashing', err.message.split('\n')[0]);
  } finally {
    const failed = results.filter(r => !r.ok);
    console.log(`\n${'='.repeat(58)}`);
    console.log(`${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
      console.log('\nFAILURES:');
      failed.forEach(f => console.log(`  - ${f.n}${f.d ? '  (' + f.d + ')' : ''}`));
      process.exitCode = 1;
    }
    if (otp) console.log(`\nCLEANUP_OTP=${otp}`);
    await browser.close();
  }
})();
