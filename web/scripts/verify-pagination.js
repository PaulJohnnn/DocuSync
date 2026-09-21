// Verifies no block overlaps the grey gap between page sheets, at every
// margin preset, with both uniform and mixed content.
// Run: node scripts/verify-pagination.js
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';

const UNIFORM = Array.from({ length: 40 }, () =>
  '<p>This is a shared paragraph edited together by Zyra and Paul. This is a shared paragraph edited together by Zyra and Paul. This is a shared paragraph edited together by Zyra and Paul.</p>'
).join('');

let MIXED = '';
for (let i = 0; i < 12; i++) {
  MIXED += `<h1>Section ${i}</h1><h2>Subsection ${i}</h2>`;
  MIXED += '<p>This is a shared paragraph edited together by Zyra and Paul. This is a shared paragraph edited together by Zyra and Paul.</p>';
  MIXED += '<p>Another paragraph of body text for this section, long enough to wrap onto more than a single rendered line in the page.</p>';
  MIXED += '<ul><li>First list item</li><li>Second list item</li><li>Third list item</li></ul>';
  MIXED += '<blockquote>A quoted remark from Zyra about the roadmap.</blockquote>';
}

async function login(page) {
  await page.goto(`${BASE}/app/login`);
  await page.fill('input[placeholder="Enter your username"]', 'admin');
  await page.fill('input[placeholder="Enter your password"]', 'admin');
  await page.click('button:has-text("Log In")');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
}

async function makeRoom(page, name) {
  await page.goto(`${BASE}/app/peers`);
  await page.click('button:has-text("Create Room")');
  await page.fill('input[placeholder*="Thesis Project"]', name);
  await page.click('button:has-text("Generate Room")');
  await page.waitForSelector('text=INVITE CODE');
  const otp = (await page.locator('text=INVITE CODE').locator('xpath=following-sibling::*[1]').innerText()).trim();
  await page.click('text=Enter Workspace');
  await page.waitForTimeout(1000);
  return otp;
}

async function seed(page, otp, fileId, html) {
  await page.evaluate(async ({ otp, fileId, html }) => {
    const req = indexedDB.open('DocuSyncDB', 1);
    const db = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
      req.onupgradeneeded = (e) => { const d = e.target.result; if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' }); };
    });
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put({ id: fileId, name: 'pagination.docx', type: 'text/plain', size: html.length, content: html, status: 'synced', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    await fetch('/api/lobby/doc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp, fileId, content: html, authorNodeId: 'seed', seq: 1, committedAt: Date.now(), isSessionEnd: true }) });
  }, { otp, fileId, html });
}

async function setMargin(page, value) {
  await page.evaluate((v) => {
    const sel = document.querySelector('select');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, v);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await page.waitForTimeout(2500);
}

async function check(page) {
  return page.evaluate(() => {
    const pm = document.querySelector('.ds-editor-page-view .ProseMirror');
    const canvas = document.querySelector('.ds-editor-canvas');
    const canvasRect = canvas.getBoundingClientRect();
    const sheets = Array.from(document.querySelectorAll('.ds-editor-page-sheet')).map((s) => {
      const r = s.getBoundingClientRect();
      return { top: r.top - canvasRect.top, bottom: r.bottom - canvasRect.top };
    });
    const blocks = Array.from(pm.children)
      .filter((c) => !c.classList.contains('collaboration-cursor__caret'))
      .map((el, i) => {
        const r = el.getBoundingClientRect();
        return { i, tag: el.tagName, top: r.top - canvasRect.top, bottom: r.bottom - canvasRect.top };
      });

    const violations = [];
    // Any block pixel inside a grey gap, or past a page's bottom margin edge.
    for (let s = 0; s < sheets.length - 1; s++) {
      const gapTop = sheets[s].bottom, gapBottom = sheets[s + 1].top;
      blocks.forEach((b) => {
        if (b.bottom > gapTop + 0.5 && b.top < gapBottom - 0.5) {
          violations.push(`block[${b.i}] ${b.tag} ${b.top.toFixed(1)}-${b.bottom.toFixed(1)} intrudes gap ${gapTop.toFixed(1)}-${gapBottom.toFixed(1)}`);
        }
      });
    }
    // Also: nothing should render below the last sheet's bottom.
    const lastBottom = sheets.length ? sheets[sheets.length - 1].bottom : 0;
    blocks.forEach((b) => {
      if (b.bottom > lastBottom + 0.5) {
        violations.push(`block[${b.i}] ${b.tag} bottom ${b.bottom.toFixed(1)} past last sheet ${lastBottom.toFixed(1)}`);
      }
    });

    return { sheets: sheets.length, blocks: blocks.length, violations };
  });
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  let failures = 0;
  try {
    await login(page);

    for (const [label, html] of [['uniform', UNIFORM], ['mixed', MIXED]]) {
      const otp = await makeRoom(page, `PgVerify-${label}-${Date.now()}`);
      const fileId = Date.now().toString();
      await seed(page, otp, fileId, html);
      await page.goto(`${BASE}/app/editor/${fileId}`);
      await page.waitForSelector('.ProseMirror');
      await page.waitForTimeout(1500);
      await page.evaluate(async ({ otp, fileId, html }) => {
        await fetch('/api/lobby/doc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp, fileId, content: html, authorNodeId: 'seed2', seq: 2, committedAt: Date.now(), isSessionEnd: true }) });
      }, { otp, fileId, html });
      await page.reload();
      await page.waitForSelector('.ProseMirror');
      await page.waitForTimeout(2500);

      for (const m of ['48', '96', '144']) {
        await setMargin(page, m);
        const r = await check(page);
        // Guard against a vacuous pass: if the seeded content never loaded,
        // there is nothing to overlap and the check would "pass" meaninglessly.
        const loaded = r.blocks >= 20 && r.sheets >= 2;
        const ok = loaded && r.violations.length === 0;
        if (!ok) failures += 1;
        const why = !loaded ? ' (CONTENT DID NOT LOAD — inconclusive)' : '';
        console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label} margin=${m}: ${r.blocks} blocks over ${r.sheets} pages${why}`);
        r.violations.slice(0, 6).forEach((v) => console.log('        ' + v));
      }
    }
  } finally {
    await browser.close();
  }
  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
