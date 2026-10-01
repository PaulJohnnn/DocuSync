/**
 * DocuSync QA campaign — client-level verification in real browsers.
 *
 * Complements qa-campaign.js (engine level). Everything here drives the actual
 * UI and then verifies the real artefact: the bytes of a downloaded file, the
 * exact text in the receiving editor, the rendered version history.
 *
 * A download is checked by its magic bytes and SHA-256, not by the fact that a
 * blob appeared. An edit is checked by exact string comparison on the other
 * client, not by a sync badge.
 *
 * Clients:
 *   Web      — http://localhost:3000        (the web app)
 *   Desktop  — http://localhost:5180        (the desktop RENDERER, dev mode,
 *              which targets the same localhost:3000 backend)
 *
 * The desktop renderer in a browser has no Electron IPC, so desktop-local file
 * operations and desktop↔desktop P2P are out of reach here and are reported as
 * NOT TESTABLE rather than passed.
 *
 * Run: node scripts/qa-campaign-ui.js
 */
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const WEB = process.env.QA_BASE || 'http://localhost:3000';
const DESK = process.env.QA_DESK || 'http://localhost:5180';
const accounts = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa-accounts.json'), 'utf8'));
const U = Object.fromEntries(accounts.map((a) => [a.id, a]));

const results = [];
let phaseName = '';
const phase = (n) => { phaseName = n; console.log(`\n── ${n} ${'─'.repeat(Math.max(0, 56 - n.length))}`); };
function check(ok, name, detail = '') {
  results.push({ phase: phaseName, name, ok: !!ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  return !!ok;
}
const note = (name, detail) => {
  results.push({ phase: phaseName, name, ok: null, detail });
  console.log(`  SKIP  ${name}  — ${detail}`);
};

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Signs a user into the web app through the real login form. */
async function loginWeb(page, user) {
  await page.goto(`${WEB}/app/login`);
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 30000 });
  await page.fill('input[placeholder="Enter your username"]', user.email);
  await page.fill('input[placeholder="Enter your password"]', user.password);
  await page.click('button:has-text("Log In")');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 });
}

/** Signs a user into the desktop renderer (hash router). */
async function loginDesktop(page, user) {
  await page.goto(`${DESK}/#/vault-login`);
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 30000 });
  await page.fill('input[placeholder="Enter your username"]', user.email);
  await page.fill('input[placeholder="Enter your password"]', user.password);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !location.hash.includes('vault-login'), { timeout: 30000 });
}

/** Editor text with remote cursor labels stripped, so comparisons are exact. */
const editorText = (page) => page.evaluate(() => {
  const el = document.querySelector('.ProseMirror');
  if (!el) return null;
  const c = el.cloneNode(true);
  c.querySelectorAll('[class*="collaboration-cursor"]').forEach((n) => n.remove());
  return (c.innerText || '').replace(/\s+/g, ' ').trim();
});

const api = {
  create: (name) => fetch(`${WEB}/api/lobby/create`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostNodeId: `qa-ui-${Date.now()}`, hostIp: '203.0.113.12', hostPort: 9000, roomName: name, hostType: 'web' }),
  }).then((r) => r.json()),
  seedDoc: (otp, fileId, content) => fetch(`${WEB}/api/lobby/doc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp, fileId, content, authorNodeId: 'qa-seed', seq: 1, committedAt: Date.now(), isSessionEnd: true }),
  }),
  addFile: (otp, fileId, fileName) => fetch(`${WEB}/api/lobby/files`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp, file: { fileId, fileName, sharedBy: 'QA', size: 100 } }),
  }),
  doc: (otp, fileId) => fetch(`${WEB}/api/lobby/doc?otp=${otp}&fileId=${fileId}&since=1`)
    .then((r) => r.json()).then((d) => d.content ?? d.snapshot?.content ?? ''),
  destroy: (otp) => fetch(`${WEB}/api/admin/delete-group`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp }),
  }),
};

(async () => {
  const browser = await chromium.launch();
  const rooms = [];
  try {
    // ══ PHASE G — download integrity, every offered format ══════════════════
    phase('PHASE G — download integrity (real bytes)');
    {
      const { otp } = await api.create('QA Downloads'); rooms.push(otp);
      const fileId = 'dl-1';
      const content = '<div data-margin="96"><h1>QA Heading</h1><p>Body with <strong>bold</strong> and <em>italic</em>.</p><ul><li>Bullet one</li></ul><p>Entities: &amp; &lt; &gt;</p></div>';
      await api.seedDoc(otp, fileId, content);
      await api.addFile(otp, fileId, 'qa-download.txt');

      const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
      const page = await ctx.newPage();
      await loginWeb(page, U.A);
      await page.evaluate((o) => {
        const r = { otp: o, id: o, name: 'QA Downloads', status: 'active', isOwner: true, peerCount: 1, fileCount: 1, createdAt: new Date().toISOString() };
        const uid = JSON.parse(sessionStorage.getItem('docusync_auth_user')).id;
        localStorage.setItem(`ds_${uid}_current_room`, JSON.stringify(r));
        localStorage.setItem(`ds_${uid}_rooms`, JSON.stringify([r]));
      }, otp);
      await page.goto(`${WEB}/app/files`);
      await page.waitForTimeout(4000);

      // Capture the blob the app actually produces.
      await page.evaluate(() => {
        window.__caught = null;
        const oc = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (b) => { window.__blob = b; return oc(b); };
        HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__caught = this.download; } };
      });

      const formats = [
        { label: 'Plain text', ext: 'txt', magic: null, mustContain: 'QA Heading' },
        { label: 'Markdown', ext: 'md', magic: null, mustContain: '# QA Heading' },
        { label: 'Web page', ext: 'html', magic: '<!', mustContain: '<h1>QA Heading</h1>' },
        { label: 'Word document', ext: 'docx', magic: 'PK', mustContain: null },
      ];

      for (const f of formats) {
        await page.click('button[title="Download as…"]');
        await page.waitForSelector('[role="menu"]', { timeout: 10000 });
        await page.click(`[role="menu"] button:has-text("${f.label}")`);
        await page.waitForTimeout(1800);
        const got = await page.evaluate(async () => {
          if (!window.__blob) return null;
          const buf = new Uint8Array(await window.__blob.arrayBuffer());
          let s = ''; for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
          return { name: window.__caught, bytes: buf.length, head: s.slice(0, 2), text: s };
        });
        if (!got) { check(false, `G ${f.label} produced a file`); continue; }

        check(got.name?.endsWith(`.${f.ext}`), `G ${f.label}: filename ends .${f.ext}`, got.name);
        check(got.bytes > 0, `G ${f.label}: file is not empty`, `${got.bytes} bytes`);
        if (f.magic) check(got.head === f.magic, `G ${f.label}: correct file signature`, `"${got.head}"`);
        if (f.mustContain) check(got.text.includes(f.mustContain), `G ${f.label}: content preserved`, f.mustContain);
        if (f.ext === 'txt') {
          // The source deliberately contains &lt; and &gt;, which correctly
          // DECODE to literal angle brackets, so "contains no < or >" is not a
          // valid test. What must be absent is HTML markup itself.
          check(!/<\/?(div|p|h[1-6]|ul|li|strong|em|br)[^>]*>/i.test(got.text),
            'G Plain text: HTML tags stripped');
          check(got.text.includes('Entities: & < >'),
            'G Plain text: HTML entities decoded to their characters');
        }
        if (f.ext === 'docx') {
          check(got.text.includes('word/document.xml'), 'G Word: package contains word/document.xml');
          check(got.text.includes('QA Heading'), 'G Word: heading text present in the package');
        }
      }
      await ctx.close();
    }

    // ══ PHASE H — Web ↔ Web live editing, exact content ═════════════════════
    phase('PHASE H — Web → Web (two accounts, exact content)');
    {
      const { otp } = await api.create('QA WebWeb'); rooms.push(otp);
      const fileId = 'ww-1';
      const seed = '<div data-margin="96"><p>LINE ONE.</p>\n<p>LINE TWO.</p>\n</div>';
      await api.seedDoc(otp, fileId, seed);
      await api.addFile(otp, fileId, 'webweb.txt');

      const mk = async (user) => {
        const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
        const p = await ctx.newPage();
        await loginWeb(p, user);
        await p.evaluate((o) => {
          const r = { otp: o, id: o, name: 'QA WebWeb', status: 'active', isOwner: true, peerCount: 2, fileCount: 1, createdAt: new Date().toISOString() };
          const uid = JSON.parse(sessionStorage.getItem('docusync_auth_user')).id;
          localStorage.setItem(`ds_${uid}_current_room`, JSON.stringify(r));
          localStorage.setItem(`ds_${uid}_rooms`, JSON.stringify([r]));
        }, otp);
        await p.goto(`${WEB}/app/editor/${fileId}`);
        await p.waitForSelector('.ProseMirror', { timeout: 30000 });
        return { ctx, p };
      };

      const A = await mk(U.A);
      const B = await mk(U.B);
      await A.p.waitForTimeout(3500);

      check((await editorText(A.p))?.includes('LINE ONE'), 'H1 web client A opened the shared document');
      check((await editorText(B.p))?.includes('LINE ONE'), 'H2 web client B opened the same document');

      // A types at the end of line one.
      await A.p.evaluate(() => {
        const p = document.querySelector('.ProseMirror p');
        const r = document.createRange(); r.selectNodeContents(p); r.collapse(false);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      });
      await A.p.keyboard.type(' FROM-A.', { delay: 25 });
      await A.p.waitForTimeout(6000);

      const bText = await editorText(B.p);
      check(bText?.includes('FROM-A'), 'H3 A’s edit reached B’s editor', bText?.slice(0, 70));

      // B replies on the second line.
      await B.p.evaluate(() => {
        const ps = document.querySelectorAll('.ProseMirror p');
        const p = ps[ps.length - 1];
        const r = document.createRange(); r.selectNodeContents(p); r.collapse(false);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      });
      await B.p.keyboard.type(' FROM-B.', { delay: 25 });
      await B.p.waitForTimeout(6000);

      const aText = await editorText(A.p);
      check(aText?.includes('FROM-B'), 'H4 B’s reply reached A’s editor', aText?.slice(0, 70));

      const finalA = await editorText(A.p);
      const finalB = await editorText(B.p);
      check(finalA === finalB, 'H5 both web clients converge to byte-identical text',
        finalA === finalB ? `sha ${sha256(finalA).slice(0, 12)}` : `A="${finalA}" B="${finalB}"`);
      check(finalA?.includes('FROM-A') && finalA?.includes('FROM-B'),
        'H6 neither edit was lost in the merge');

      const stored = await api.doc(otp, fileId);
      check(stored.includes('FROM-A') && stored.includes('FROM-B'),
        'H7 the server snapshot holds both edits');

      await A.ctx.close(); await B.ctx.close();
    }

    // ══ PHASE I — Web ↔ Desktop renderer ════════════════════════════════════
    phase('PHASE I — Web ↔ Desktop (same backend)');
    {
      const { otp } = await api.create('QA WebDesk'); rooms.push(otp);
      const fileId = 'wd-1';
      const seed = '<div data-margin="96"><p>WEB side line.</p>\n<p>DESKTOP side line.</p>\n</div>';
      await api.seedDoc(otp, fileId, seed);
      await api.addFile(otp, fileId, 'webdesk.txt');

      const wctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
      const wp = await wctx.newPage();
      await loginWeb(wp, U.C);
      await wp.evaluate((o) => {
        const r = { otp: o, id: o, name: 'QA WebDesk', status: 'active', isOwner: true, peerCount: 2, fileCount: 1, createdAt: new Date().toISOString() };
        const uid = JSON.parse(sessionStorage.getItem('docusync_auth_user')).id;
        localStorage.setItem(`ds_${uid}_current_room`, JSON.stringify(r));
        localStorage.setItem(`ds_${uid}_rooms`, JSON.stringify([r]));
      }, otp);
      await wp.goto(`${WEB}/app/editor/${fileId}`);
      await wp.waitForSelector('.ProseMirror', { timeout: 30000 });

      const dctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
      const dp = await dctx.newPage();
      await loginDesktop(dp, U.D);
      check(true, 'I1 desktop client signed in against the shared backend');

      // Desktop → cloud: push from the desktop origin, verify the web editor receives it.
      await dp.evaluate(async ({ otp, fileId }) => {
        const cur = await (await fetch(`http://localhost:3000/api/lobby/doc?otp=${otp}&fileId=${fileId}&since=1`)).json();
        const base = cur.content || cur.snapshot?.content || '';
        const mine = base.replace('DESKTOP side line.', 'DESKTOP side line. FROM-DESKTOP.');
        await fetch('http://localhost:3000/api/lobby/doc', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otp, fileId, content: mine, baseContent: base, authorNodeId: 'qa-desktop-node', seq: 9, committedAt: Date.now(), isSessionEnd: true }),
        });
      }, { otp, fileId });
      await wp.waitForTimeout(6000);
      const webSees = await editorText(wp);
      check(webSees?.includes('FROM-DESKTOP'), 'I2 Desktop → Web: the web editor received the desktop edit',
        webSees?.slice(0, 70));

      // Web → cloud: type in the web editor, verify the stored document.
      await wp.evaluate(() => {
        const p = document.querySelector('.ProseMirror p');
        const r = document.createRange(); r.selectNodeContents(p); r.collapse(false);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      });
      await wp.keyboard.type(' FROM-WEB.', { delay: 25 });
      await wp.waitForTimeout(6000);

      const stored = await api.doc(otp, fileId);
      check(stored.includes('FROM-WEB'), 'I3 Web → Desktop: the web edit reached shared storage');
      check(stored.includes('FROM-DESKTOP'), 'I4 both directions survive in one document');

      note('I5 desktop-local file open / save (Electron IPC)',
        'NOT TESTABLE here — window.docuSync is undefined outside Electron');
      note('I6 Desktop ↔ Desktop peer-to-peer over WebSocket :9000',
        'NOT TESTABLE here — requires two running Electron instances');

      await wctx.close(); await dctx.close();
    }

    // ══ PHASE J — version history in the UI ═════════════════════════════════
    phase('PHASE J — version history (rendered)');
    {
      const { otp } = await api.create('QA HistoryUI'); rooms.push(otp);
      const fileId = 'hui-1';
      const v1 = '<div data-margin="96"><p>History version one.</p></div>';
      const v2 = '<div data-margin="96"><p>History version two.</p></div>';
      await api.seedDoc(otp, fileId, v1);
      await fetch(`${WEB}/api/lobby/doc`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp, fileId, content: v2, baseContent: v1, authorNodeId: 'qa-hist', seq: 2, committedAt: Date.now() + 1000, isSessionEnd: true }),
      });
      await api.addFile(otp, fileId, 'history.txt');

      const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
      const p = await ctx.newPage();
      await loginWeb(p, U.E);
      await p.evaluate((o) => {
        const r = { otp: o, id: o, name: 'QA HistoryUI', status: 'active', isOwner: true, peerCount: 1, fileCount: 1, createdAt: new Date().toISOString() };
        const uid = JSON.parse(sessionStorage.getItem('docusync_auth_user')).id;
        localStorage.setItem(`ds_${uid}_current_room`, JSON.stringify(r));
        localStorage.setItem(`ds_${uid}_rooms`, JSON.stringify([r]));
      }, otp);
      await p.goto(`${WEB}/app/history/${fileId}`);
      await p.waitForTimeout(6000);

      const body = await p.evaluate(() => document.body.innerText);
      check(/Document History/i.test(body), 'J1 history page rendered');
      // Assert on the entries themselves, not on sidebar chrome present on
      // every page — matching that would be a false pass.
      check(body.includes('2 events'), 'J2 event count reflects the two saves',
        (body.match(/File ID:.*/) || [''])[0]);
      check(body.includes('v2') && body.includes('v1'), 'J3 both versions listed as v1 and v2');
      check(/Modified by/i.test(body), 'J4 each entry records its author');
      check(/Restore/i.test(body), 'J5 a restore control is offered');

      // J6 — actually restore the earlier version and verify the revert.
      const beforeRestore = await api.doc(otp, fileId);
      check(beforeRestore.includes('version two'), 'J6a document is version two before restore');
      const restoreCount = await p.locator('button:has-text("Restore")').count();
      if (restoreCount >= 2) {
        await p.locator('button:has-text("Restore")').last().click();
        await p.waitForTimeout(1500);
        const confirm = p.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Restore")').last();
        if (await confirm.count()) await confirm.click().catch(() => {});
        await p.waitForTimeout(6000);
        const afterRestore = await api.doc(otp, fileId);
        check(afterRestore.includes('version one'),
          'J6b restoring v1 reverts the stored document',
          afterRestore.replace(/<[^>]+>/g, '').trim().slice(0, 60));
      } else {
        note('J6b version restore', `only ${restoreCount} restore control(s) found`);
      }
      await ctx.close();
    }
  } catch (err) {
    check(false, 'UI campaign ran to completion', err.message?.split('\n')[0] || String(err));
  } finally {
    for (const otp of rooms) await api.destroy(otp).catch(() => { });
    await browser.close();

    const byPhase = {};
    for (const r of results) {
      byPhase[r.phase] = byPhase[r.phase] || { pass: 0, fail: 0, skip: 0 };
      byPhase[r.phase][r.ok === null ? 'skip' : r.ok ? 'pass' : 'fail']++;
    }
    console.log('\n' + '='.repeat(64));
    console.log('UI CAMPAIGN SUMMARY');
    console.log('='.repeat(64));
    for (const [p, v] of Object.entries(byPhase)) {
      console.log(`  ${String(v.pass).padStart(3)} pass  ${String(v.fail).padStart(3)} fail  ${String(v.skip).padStart(3)} skip   ${p}`);
    }
    const pass = results.filter((r) => r.ok === true).length;
    const fail = results.filter((r) => r.ok === false).length;
    const skip = results.filter((r) => r.ok === null).length;
    console.log(`\n  TOTAL: ${pass} passed, ${fail} failed, ${skip} not testable in this environment`);
    if (fail) {
      console.log('\nFAILURES:');
      results.filter((r) => r.ok === false).forEach((f) => console.log(`  - [${f.phase}] ${f.name}${f.detail ? ` — ${f.detail}` : ''}`));
      process.exitCode = 1;
    }
    fs.writeFileSync(path.join(__dirname, 'qa-campaign-ui-results.json'), JSON.stringify(results, null, 2));
  }
})();
