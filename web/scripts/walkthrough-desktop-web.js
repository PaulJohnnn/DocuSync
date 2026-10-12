/**
 * A guided run of the panel's revisions, with both apps side by side.
 *
 * The cross-platform probe already asserts these; this one photographs
 * them. It drives the real Electron build and a real browser through the
 * sequence a panelist would ask for -- two people editing, an upload
 * landing on a file somebody is in, the host locking it -- and writes a
 * screenshot of BOTH screens at each step, so the behaviour can be read
 * off the pictures rather than taken on trust.
 *
 * Run: node scripts/walkthrough-desktop-web.js [baseUrl] [outDir]
 */
const { chromium, _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'https://docusync-dusky.vercel.app';
const OUT = process.argv[3] || path.join(__dirname, 'walkthrough-shots');
const API = `${BASE}/api/lobby`;
const DESKTOP = path.resolve(__dirname, '..', '..', 'desktop');
const MAIN = path.join(DESKTOP, 'dist-electron', 'main.js');
const EXE = path.join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe');
const accts = JSON.parse(fs.readFileSync(path.join(__dirname, 'live-accounts.json'), 'utf8'));

const steps = [];
const note = (ok, what) => {
  steps.push({ ok, what });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${what}`);
};

const post = async (p, b) => {
  const res = await fetch(`${API}${p}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

const docText = (w) => w.evaluate(() => {
  const pm = document.querySelector('.ProseMirror');
  if (!pm) return '';
  const c = pm.cloneNode(true);
  c.querySelectorAll('.collaboration-cursor__caret, .collaboration-cursor__label').forEach((e) => e.remove());
  return (c.innerText || c.textContent || '').replace(/\s+/g, ' ').trim();
});

async function waitForText(w, needle, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await docText(w)).includes(needle)) return Date.now() - t0;
    await w.waitForTimeout(350);
  }
  return null;
}

let shotNo = 0;
async function shot(desk, web, label) {
  shotNo += 1;
  const n = String(shotNo).padStart(2, '0');
  await desk.screenshot({ path: path.join(OUT, `step-${n}-desktop-${label}.png`) }).catch(() => {});
  await web.screenshot({ path: path.join(OUT, `step-${n}-web-${label}.png`) }).catch(() => {});
  console.log(`        captured step-${n}-*-${label}.png`);
}

async function signIn(page, acct, who) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto(`${BASE}/app/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 60000 });
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /log in/i.test(x.textContent || ''));
      return !!b && !b.disabled;
    }, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.fill('input[placeholder="Enter your username"]', acct.email);
    await page.fill('input[placeholder="Enter your password"]', acct.password);
    await page.click('button:has-text("Log In")');
    try {
      await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), null, { timeout: 30000 });
      return;
    } catch {
      if (attempt === 2) throw new Error(`${who} could not sign in as ${acct.email}`);
    }
  }
}

async function openDoc(page, otp, fileId, name) {
  await page.evaluate(({ otp, fileId, name }) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    const k = (x) => `ds_${u.id}_${x}`;
    localStorage.setItem(k('current_room'), JSON.stringify({ otp, id: otp, name: 'Panel Demo' }));
    localStorage.setItem(k('files'), JSON.stringify([{ id: String(fileId), name }]));
  }, { otp, fileId, name });
  await page.goto(`${BASE}/app/editor/${fileId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ProseMirror', { timeout: 60000 });
  await page.waitForTimeout(1800);
}

async function typeAtEnd(page, line) {
  await page.click('.ProseMirror');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(line, { delay: 14 });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`\nWalkthrough -- ${BASE}\n`);

  const HOST = 'demo-host-' + Date.now();
  const room = await post('/create', {
    hostNodeId: HOST, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Panel Demo', hostType: 'web',
  });
  const otp = room.data?.otp;
  const shared = await post('/files', {
    otp,
    file: {
      fileId: Date.now(), fileName: 'Chapter 3.docx',
      content: '<p>Chapter 3 Methodology.</p>', sharedBy: 'Setup', sharedByNodeId: HOST,
    },
  });
  const fileId = shared.data?.fileId;
  console.log(`  room ${otp}   fileId ${fileId}\n`);

  let app, browser;
  try {
    app = await electron.launch({
      executablePath: EXE, args: [MAIN], cwd: DESKTOP, timeout: 120000,
      env: { ...process.env, VITE_DEV_SERVER_URL: `${BASE}/app/login`, DOCUSYNC_WS_PORT: '9451' },
    });
    const desk = await app.firstWindow({ timeout: 120000 });
    desk.setDefaultTimeout(60000);
    await desk.waitForLoadState('domcontentloaded');

    browser = await chromium.launch();
    const web = await (await browser.newContext({ viewport: { width: 1280, height: 820 } })).newPage();
    web.setDefaultTimeout(60000);

    await signIn(desk, accts[0], 'desktop');
    await signIn(web, accts[1], 'web');
    await openDoc(desk, otp, fileId, 'Chapter 3.docx');
    await openDoc(web, otp, fileId, 'Chapter 3.docx');
    note(true, 'both apps open the same document, signed in as different people');
    await shot(desk, web, 'both-open');

    // 1. Desktop -> Web
    const D = 'Typed on the DESKTOP app';
    await typeAtEnd(desk, D);
    await desk.waitForTimeout(1200);
    const dw = await waitForText(web, D, 30000);
    note(dw !== null, `desktop -> web  (${dw ?? 'never'}ms)`);

    // 2. Web -> Desktop
    const W = 'Typed in the WEB app';
    await typeAtEnd(web, W);
    await web.waitForTimeout(1200);
    const wd = await waitForText(desk, W, 30000);
    note(wd !== null, `web -> desktop  (${wd ?? 'never'}ms)`);

    await desk.waitForTimeout(2500);
    const dT = await docText(desk);
    const wT = await docText(web);
    note(dT === wT && dT.includes(D) && dT.includes(W), 'both show the same document, holding both edits');
    await shot(desk, web, 'both-directions');

    // 3. An upload lands while both are editing
    await post('/files', {
      otp,
      file: {
        fileId: Date.now(), fileName: 'Chapter 3.docx',
        content: '<p>A REPLACEMENT Chapter 3 uploaded by a groupmate.</p>',
        sharedBy: 'Zyra', sharedByNodeId: 'demo-uploader',
      },
    });
    const dU = await waitForText(desk, 'REPLACEMENT', 30000);
    const wU = await waitForText(web, 'REPLACEMENT', 30000);
    note(dU !== null && wU !== null, `the upload reaches both  (desktop ${dU}ms, web ${wU}ms)`);
    // Captured immediately: the notice is a toast and fades.
    await shot(desk, web, 'upload-notice');
    const told = async (p) => /uploaded a new copy|Replaced by a new upload/i.test(
      (await p.evaluate(() => document.body.innerText || '')).replace(/\s+/g, ' ')
    );
    note(await told(desk) && await told(web), 'both are TOLD their file was replaced, not just changed');

    // 4. The host locks the file
    await post('/lock', { otp, nodeId: HOST, fileId, locked: true, allowedNodeIds: [] });
    await desk.waitForTimeout(6500);
    await web.waitForTimeout(1000);
    const ro = async (p) => p.evaluate(() => {
      const pm = document.querySelector('.ProseMirror');
      return {
        editable: pm ? pm.getAttribute('contenteditable') : null,
        banner: /view only/i.test(document.body.innerText || ''),
      };
    });
    const dL = await ro(desk); const wL = await ro(web);
    note(
      (dL.editable === 'false' || dL.banner) && (wL.editable === 'false' || wL.banner),
      'the host locks it and BOTH go view-only'
    );
    await shot(desk, web, 'locked-view-only');

    // Typing must actually be refused, not merely discouraged.
    const before = await docText(desk);
    await desk.click('.ProseMirror').catch(() => {});
    await desk.keyboard.type('THIS MUST NOT APPEAR').catch(() => {});
    await desk.waitForTimeout(1500);
    note((await docText(desk)) === before, 'typing into the locked document is refused');

    // 5. Unlock
    await post('/lock', { otp, nodeId: HOST, fileId, locked: false, allowedNodeIds: [] });
    await desk.waitForTimeout(6500);
    const dF = await ro(desk);
    note(dF.editable !== 'false', 'unlocking restores editing');
    await shot(desk, web, 'unlocked');

    // 6. The history both platforms read
    await desk.goto(`${BASE}/app/history/${fileId}`, { waitUntil: 'domcontentloaded' });
    await web.goto(`${BASE}/app/history/${fileId}`, { waitUntil: 'domcontentloaded' });
    await desk.waitForTimeout(3500); await web.waitForTimeout(3500);
    const rows = (p) => p.evaluate(() => {
      const out = [];
      document.querySelectorAll('.ds-card').forEach((c) => {
        const m = (c.innerText || '').replace(/\s+/g, ' ').trim().match(/^v(\d+)\s+([A-Za-z ]+?)\s/);
        if (m) out.push(`v${m[1]}:${m[2].trim()}`);
      });
      return out;
    });
    const dR = await rows(desk); const wR = await rows(web);
    note(dR.length > 0 && JSON.stringify(dR) === JSON.stringify(wR),
      `both read an identical history  (${dR.join(' | ')})`);
    await shot(desk, web, 'history');

    // What is actually INSIDE each version, not just its label.
    //
    // Reading the labels alone hid a duplicate once: two adjacent rows
    // read "Uploaded v2" and "Conflict resolved" while holding identical
    // text. A version list is only trustworthy if the contents differ.
    console.log('');
    console.log('  Inside every version:');
    const hist = await (await fetch(`${API}/history?otp=${otp}&fileId=${fileId}`)).json();
    const entries = hist?.data?.entries ?? [];
    const flat = (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    entries.forEach((e, i) => {
      console.log(`    v${entries.length - i}  [${e.label || e.eventType}]`);
      console.log(`         "${flat(e.fullContent)}"`);
    });
    const bodies = entries.map((e) => flat(e.fullContent));
    note(new Set(bodies).size === bodies.length,
      `every version holds DIFFERENT text  (${new Set(bodies).size} distinct of ${bodies.length})`);
    note(bodies.some((b) => b.includes('Typed on the DESKTOP app')), 'the desktop edit is recoverable');
    note(bodies.some((b) => b.includes('Typed in the WEB app')), 'the web edit is recoverable');
    note(bodies.some((b) => b === 'Chapter 3 Methodology.'), 'the original upload is recoverable');
    note(bodies.some((b) => b.includes('REPLACEMENT')), 'the replacement upload is recoverable');

  } catch (err) {
    note(false, 'walkthrough completed: ' + String(err).slice(0, 150));
  } finally {
    try { if (browser) await browser.close(); } catch {}
    try { if (app) await app.close(); } catch {}
  }

  const ok = steps.filter((s) => s.ok).length;
  console.log(`\n  ${ok}/${steps.length} steps behaved as the panel asked`);
  console.log(`  screenshots: ${OUT}\n`);
  process.exit(ok === steps.length ? 0 : 1);
}

main().catch((e) => { console.error('crashed:', e); process.exit(1); });
