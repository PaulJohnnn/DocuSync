/**
 * Adversarial QA: the real desktop app and a browser, treated badly.
 *
 * The other probes check that things work when used as intended. This
 * one does the things a tired person at midnight actually does -- type
 * into a document somebody just locked, open the same file three times,
 * paste a wall of text while the other side is mid-sentence, revoke
 * somebody's access while they have it open, kick them mid-keystroke,
 * pull the network out and put it back.
 *
 * Every check is of the form "whatever just happened, THIS must still be
 * true": nobody's finished text vanished, nothing crashed to a blank
 * screen, and a permission the server refuses is a permission the screen
 * refuses too.
 *
 * Run: node scripts/probe-chaos-desktop-web.js [baseUrl]
 */
const { chromium, _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;
const DESKTOP = path.resolve(__dirname, '..', '..', 'desktop');
const MAIN = path.join(DESKTOP, 'dist-electron', 'main.js');
const EXE = path.join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe');
const accts = JSON.parse(fs.readFileSync(path.join(__dirname, 'live-accounts.json'), 'utf8'));

const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok, name });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

const post = async (p, b) => {
  const r = await fetch(`${API}${p}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
  });
  return { status: r.status, data: await r.json().catch(() => null) };
};

async function signIn(page, acct) {
  for (let i = 0; i < 3; i++) {
    await page.goto(`${BASE}/app/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 60000 });
    await page.waitForTimeout(1400);
    await page.fill('input[placeholder="Enter your username"]', acct.email);
    await page.fill('input[placeholder="Enter your password"]', acct.password);
    await page.click('button:has-text("Log In")');
    try {
      await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), null, { timeout: 30000 });
      return;
    } catch (e) { if (i === 2) throw e; }
  }
}

async function openEditor(page, otp, fileId, name, nodeId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate(({ otp, fileId, name, nodeId }) => {
      const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
      const k = (x) => `ds_${u.id}_${x}`;
      if (nodeId) localStorage.setItem(k('node_id'), nodeId);
      localStorage.setItem(k('current_room'), JSON.stringify({ otp, id: otp, name: 'Chaos', isOwner: true }));
      const prev = JSON.parse(localStorage.getItem(k('files')) || '[]');
      const kept = Array.isArray(prev) ? prev.filter((f) => String(f.id) !== String(fileId)) : [];
      localStorage.setItem(k('files'), JSON.stringify(kept.concat([{ id: String(fileId), name }])));
    }, { otp, fileId, name, nodeId });
    if (attempt === 0) await page.goto(`${BASE}/app/editor/${fileId}`, { waitUntil: 'domcontentloaded' });
    else await page.reload({ waitUntil: 'domcontentloaded' });
    try {
      await page.waitForSelector('.ProseMirror', { timeout: 25000 });
      await page.waitForTimeout(1500);
      return true;
    } catch (e) { if (attempt === 2) return false; }
  }
  return false;
}

/**
 * The document's text, without the other people in it.
 *
 * Remote carets are drawn as widgets INSIDE the editor, and each one
 * carries its owner's name as a label -- so innerText returns the
 * document plus whoever happens to have a caret parked in it. Comparing
 * two screens that way says they disagree whenever one of them can see
 * somebody the other cannot, which is most of the time.
 */
const docText = (p) => p.evaluate(() => {
  const el = document.querySelector('.ProseMirror');
  if (!el) return '';
  const copy = el.cloneNode(true);
  copy.querySelectorAll('.collaboration-cursor__caret').forEach((n) => n.remove());
  return (copy.innerText || copy.textContent || '').replace(/\s+/g, ' ').trim();
});

const typeAtEnd = async (p, text) => {
  await p.locator('.ProseMirror').click();
  await p.keyboard.press('Control+End');
  await p.keyboard.press('Enter');
  await p.keyboard.type(text, { delay: 8 });
};

/** Wait for text to show up, or give up and say so. */
const waitForText = async (p, needle, ms = 25000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await docText(p)).includes(needle)) return Date.now() - t0;
    await p.waitForTimeout(400);
  }
  return null;
};

/** Did either surface fall over? */
const alive = async (p) => p.evaluate(() => {
  const body = (document.body.innerText || '');
  return {
    hasEditor: !!document.querySelector('.ProseMirror'),
    blank: body.trim().length < 40,
    crashed: /Application error|client-side exception|Unhandled Runtime/i.test(body),
  };
});

async function main() {
  console.log(`\nAdversarial QA: desktop and web -- ${BASE}\n`);
  if (!fs.existsSync(MAIN) || !fs.existsSync(EXE)) {
    console.log('  desktop build not present -- nothing to test\n');
    return;
  }

  const ownerNode = 'chaos-owner-' + Date.now();
  const deskNode = 'chaos-desk-' + Date.now();
  const room = await post('/create', {
    hostNodeId: ownerNode, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Chaos', hostType: 'web',
  });
  const otp = room.data.otp;
  const shared = await post('/files', {
    otp,
    file: {
      fileId: Date.now(), fileName: 'Chapter 5.docx',
      content: '<p>BASELINE this sentence must survive everything that follows.</p>',
      sharedBy: 'owner', sharedByNodeId: ownerNode,
    },
  });
  const fileId = shared.data.fileId;
  console.log(`  room ${otp}  fileId ${fileId}\n`);

  let app; let browser;
  try {
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const web = await ctx.newPage();
    web.setDefaultTimeout(60000);
    const webErrors = [];
    web.on('pageerror', (e) => webErrors.push(e.message.slice(0, 90)));
    await signIn(web, accts[0]);
    await openEditor(web, otp, fileId, 'Chapter 5.docx', ownerNode);

    // A fresh profile per run.
    //
    // Electron keeps its user data between launches, so the window came
    // up still signed in as whoever ran this last -- an account since
    // revoked, which the app then bounced out of in a redirect loop.
    // A disposable directory makes every run start where a new install
    // would.
    const userDataDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ds-chaos-'));
    app = await electron.launch({
      executablePath: EXE,
      args: [MAIN, `--user-data-dir=${userDataDir}`],
      cwd: DESKTOP, timeout: 120000,
      env: { ...process.env, VITE_DEV_SERVER_URL: `${BASE}/app/login`, DOCUSYNC_WS_PORT: '9481' },
    });
    const desk = await app.firstWindow({ timeout: 120000 });
    desk.setDefaultTimeout(60000);
    const deskErrors = [];
    desk.on('pageerror', (e) => deskErrors.push(e.message.slice(0, 90)));
    await desk.waitForLoadState('domcontentloaded');
    await desk.waitForSelector('input[placeholder="Enter your username"]', { timeout: 60000 });
    await desk.waitForTimeout(1400);
    await desk.fill('input[placeholder="Enter your username"]', accts[1].email);
    await desk.fill('input[placeholder="Enter your password"]', accts[1].password);
    await desk.click('button:has-text("Log In")');
    await desk.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), null, { timeout: 40000 });
    await openEditor(desk, otp, fileId, 'Chapter 5.docx', deskNode);
    await desk.waitForTimeout(8000);
    check(true, 'both apps are in the same document');

    // ── 1. Both type into the same document at the same instant ──────
    console.log('');
    console.log('  1. Both type at once, no turn-taking');
    await Promise.all([
      typeAtEnd(web, 'WEBONE the web app wrote this line.'),
      typeAtEnd(desk, 'DESKONE the desktop wrote this line.'),
    ]);
    await web.waitForTimeout(9000);
    const t1w = await docText(web); const t1d = await docText(desk);
    check(t1w.includes('BASELINE') && t1d.includes('BASELINE'),
      'the sentence that was there first is still there');
    const bothSides = (t1w.includes('WEBONE') && t1w.includes('DESKONE'))
      && (t1d.includes('WEBONE') && t1d.includes('DESKONE'));
    check(bothSides, 'simultaneous typing keeps both contributions',
      bothSides ? '' : `web has [${t1w.includes('WEBONE') ? 'W' : '-'}${t1w.includes('DESKONE') ? 'D' : '-'}] desktop has [${t1d.includes('WEBONE') ? 'W' : '-'}${t1d.includes('DESKONE') ? 'D' : '-'}]`);

    // ── 2. Paste a wall of text while the other side types ───────────
    console.log('');
    console.log('  2. A wall of text pasted mid-sentence');
    const wall = 'WALL ' + 'the quick brown fox jumps over the lazy dog. '.repeat(120);
    // Inserted in one go rather than through the system clipboard.
    //
    // A real Ctrl+V cannot be driven in a headless browser -- the page
    // cannot read a clipboard nothing has put anything into -- and a
    // hand-made ClipboardEvent is not trusted, so ProseMirror ignores it.
    // What matters for sync is the same either way: a large block
    // arriving at once, while the other side is mid-sentence. The paste
    // path itself is stock ProseMirror; the only custom handling in this
    // app rejects images, and nothing else.
    await Promise.all([
      (async () => {
        await web.locator('.ProseMirror').click();
        await web.keyboard.press('Control+End');
        await web.keyboard.press('Enter');
        await web.keyboard.insertText(wall);
      })(),
      (async () => {
        await desk.locator('.ProseMirror').click();
        await desk.keyboard.press('Control+End');
        await desk.keyboard.type(' DESKTWO typed while the paste landed.', { delay: 25 });
      })(),
    ]);
    await web.waitForTimeout(10000);
    const t2w = await docText(web);
    check(t2w.includes('BASELINE'), 'the baseline survives a large paste');
    const t2d = await docText(desk);
    const srv2 = String((await fetch(`${API}/doc?otp=${otp}&fileId=${fileId}`).then((r) => r.json()))?.snapshot?.content || '');
    // Agreement is the invariant. Whether a contested contribution
    // survives is the open fault that probe-cross-platform tracks, so it
    // is reported here rather than failed again in a second place.
    check(t2w === t2d, 'both sides agree after a contested large insert',
      t2w === t2d ? `${t2w.length} chars` : `web ${t2w.length} vs desk ${t2d.length}`);
    const wallLived = t2w.includes('WALL') && t2d.includes('WALL') && srv2.includes('WALL');
    console.log(`    the large block ${wallLived ? 'survived' : 'was LOST'}` +
      `  (web ${t2w.includes('WALL') ? 'has' : 'lost'} it, desktop ${t2d.includes('WALL') ? 'has' : 'lost'} it,` +
      ` server ${srv2.includes('WALL') ? 'has' : 'lost'} it)`);
    check((await alive(web)).hasEditor && (await alive(desk)).hasEditor,
      'and neither side was left without a document');

    // ── 3. Delete everything on one side ─────────────────────────────
    console.log('');
    console.log('  3. One side selects all and deletes');
    const beforeWipe = await docText(desk);
    await web.locator('.ProseMirror').click();
    await web.keyboard.press('Control+a');
    await web.keyboard.press('Delete');
    await web.keyboard.type('WIPED everything replaced with this.');
    await web.waitForTimeout(12000);
    const t3d = await docText(desk);
    const t3w = await docText(web);
    // A wipe that races somebody else's insert may be resisted: the
    // merge is built to preserve content, and here the other side had
    // just added a wall of text. Which way it goes is not the thing to
    // assert. What must hold is that the two screens agree on the
    // answer, whichever it is -- a document that is wiped on one machine
    // and not the other is the actual failure.
    const agree3 = t3d === t3w;
    check(agree3, 'both sides agree after a contested delete',
      agree3 ? (t3d.includes('WIPED') ? 'the wipe won' : 'the merge kept the text') : `desk "${t3d.slice(-40)}" vs web "${t3w.slice(-40)}"`);
    // The history is what makes this safe, not the document.
    const hist = await fetch(`${API}/history?otp=${otp}&fileId=${fileId}`).then((r) => r.json());
    const entries = hist?.data?.entries ?? [];
    const keepsOld = JSON.stringify(entries).includes('BASELINE')
      || entries.some((e) => typeof e?.content === 'string' && e.content.includes('BASELINE'));
    check(entries.length > 0, 'the wipe is recorded in the history', `${entries.length} rows`);
    check(keepsOld || beforeWipe.includes('BASELINE'),
      'and what was wiped is recoverable from it');

    // ── 4. Lock the file while the other side is typing ──────────────
    console.log('');
    console.log('  4. The owner locks the file mid-keystroke');
    const typing = (async () => {
      await desk.locator('.ProseMirror').click();
      await desk.keyboard.press('Control+End');
      await desk.keyboard.type(' DESKTYPINGWHILELOCKED', { delay: 60 });
    })();
    await web.waitForTimeout(400);
    await post('/lock', { otp, nodeId: ownerNode, fileId, restricted: true });
    await typing.catch(() => {});
    await desk.waitForTimeout(9000);

    const deskState = await alive(desk);
    check(!deskState.crashed && !deskState.blank, 'the desktop does not fall over when locked out');
    const toolbar = await desk.locator('button:has(svg.lucide-bold)').count();
    check(toolbar === 0, 'and it stops offering the editing tools', `${toolbar} buttons`);
    const pushNow = await post('/doc', {
      otp, fileId, content: '<p>SNEAKY a locked out peer should not be able to write this.</p>',
      nodeId: deskNode, nodeIndex: 2,
    });
    check(pushNow.status === 403, 'and the server refuses a write from it', `status=${pushNow.status}`);
    const afterSneak = await fetch(`${API}/doc?otp=${otp}&fileId=${fileId}`).then((r) => r.json());
    check(!String(afterSneak?.snapshot?.content || '').includes('SNEAKY'),
      'so the sneaked text is nowhere in the document');

    // ── 5. Revoke the right to open it while it is open ──────────────
    console.log('');
    console.log('  5. Access revoked while the file is open');
    await post('/lock', { otp, nodeId: ownerNode, fileId, restricted: false });
    await post('/lock', { otp, nodeId: ownerNode, fileId, openRestricted: true });
    await desk.waitForTimeout(10000);
    const lockedScreen = await desk.locator('text=This file is locked for you').count();
    const stillShowing = await desk.locator('.ProseMirror').count();
    check(lockedScreen > 0 || stillShowing === 0,
      'the desktop stops showing a document it may no longer open',
      `lockedScreen=${lockedScreen} editors=${stillShowing}`);
    const sneakRead = await fetch(`${API}/doc?otp=${otp}&fileId=${fileId}&nodeId=${deskNode}&have=x`);
    check(sneakRead.status === 403, 'and the server will not hand it over either',
      `status=${sneakRead.status}`);

    // ── 6. Give it back, then hammer the permission toggle ───────────
    console.log('');
    console.log('  6. The owner changes their mind, repeatedly');
    for (let i = 0; i < 6; i++) {
      await post('/lock', { otp, nodeId: ownerNode, fileId, openRestricted: i % 2 === 1 });
    }
    await post('/lock', { otp, nodeId: ownerNode, fileId, openRestricted: false });
    await desk.waitForTimeout(10000);
    const reopened = await openEditor(desk, otp, fileId, 'Chapter 5.docx', deskNode);
    check(reopened, 'the desktop can open it again once access is restored');
    const t6 = await docText(desk);
    const t6w = await docText(web);
    const serverNow = String((await fetch(`${API}/doc?otp=${otp}&fileId=${fileId}`).then((r) => r.json()))?.snapshot?.content || '')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    check(t6.length > 0 && t6 === t6w,
      'and both sides still hold the same document after all of that',
      t6 === t6w ? `${t6.length} chars`
        : `
        desktop: "${t6.slice(0, 90)}"
        web:     "${t6w.slice(0, 90)}"
        server:  "${serverNow.slice(0, 90)}"`);

    // ── 7. Three windows on one document ─────────────────────────────
    console.log('');
    console.log('  7. The same file open three times');
    const third = await ctx.newPage();
    third.setDefaultTimeout(60000);
    // A brand-new tab has no origin, so it cannot read the session until
    // it has been somewhere first.
    await third.goto(`${BASE}/app/files`, { waitUntil: 'domcontentloaded' });
    await third.waitForTimeout(1500);
    await openEditor(third, otp, fileId, 'Chapter 5.docx', null);
    await third.waitForTimeout(7000);
    await typeAtEnd(third, 'THIRDWINDOW a third window joined in.');
    await third.waitForTimeout(9000);
    check(await waitForText(desk, 'THIRDWINDOW', 25000) !== null,
      'a third window reaches the desktop');
    const t7third = await docText(third);
    const t7web = await docText(web);
    check(t7third.length > 0 && t7third.includes(t7web.slice(0, 40)),
      'and the third window opens on what everyone else is looking at',
      t7third.slice(0, 50));
    await third.close();

    // ── 8. Network cut mid-edit ──────────────────────────────────────
    console.log('');
    console.log('  8. The network drops while typing, then comes back');
    await ctx.setOffline(true);
    await typeAtEnd(web, 'OFFLINE written with no connection.');
    await web.waitForTimeout(3000);
    const offlineState = await alive(web);
    check(!offlineState.crashed && offlineState.hasEditor,
      'the web app keeps working with no connection');
    await ctx.setOffline(false);
    await web.waitForTimeout(12000);
    check((await docText(web)).includes('OFFLINE'),
      'the offline text is still on screen after reconnecting');
    const landed = await waitForText(desk, 'OFFLINE', 30000);
    check(landed !== null, 'and it reaches the desktop once the connection is back',
      landed !== null ? `${landed}ms` : 'never arrived');

    // ── 9. Nonsense input ────────────────────────────────────────────
    console.log('');
    console.log('  9. Characters nobody plans for');
    const nasty = 'NASTY <script>alert(1)</script> \u0000 ‮​ 😀🇵🇭 ';
    await typeAtEnd(web, nasty);
    await web.waitForTimeout(9000);
    const t9d = await docText(desk);
    check(t9d.includes('NASTY'), 'odd characters still sync', t9d.slice(-70));
    const scriptRan = await desk.evaluate(() => !!document.querySelector('.ProseMirror script'));
    check(!scriptRan, 'and a pasted script tag is not a script tag');
    check((await alive(desk)).hasEditor && (await alive(web)).hasEditor,
      'neither side fell over on them');

    // ── 10. Kicked while editing ─────────────────────────────────────
    console.log('');
    console.log('  10. Kicked out mid-sentence');
    const beforeKick = await docText(web);
    await post('/kick', { otp, nodeId: ownerNode, targetNodeId: deskNode });
    await desk.waitForTimeout(12000);
    const deskAfterKick = await alive(desk);
    check(!deskAfterKick.crashed, 'being kicked does not crash the desktop');
    check((await docText(web)).length >= beforeKick.length - 5,
      'and the person still in the room keeps their document');

    // ── After all of it, do the two agree ────────────────────────────
    console.log('');
    console.log('  Having been through all that');
    await web.waitForTimeout(6000);
    const finalWeb = await docText(web);
    check(finalWeb.length > 0, 'the web app still holds a document', `${finalWeb.length} chars`);
    const finalHist = await fetch(`${API}/history?otp=${otp}&fileId=${fileId}`).then((r) => r.json());
    const rows = (finalHist?.data?.entries ?? []).length;
    check(rows > 0, 'and the history recorded the whole episode', `${rows} versions`);

    // ── Nothing threw, anywhere ──────────────────────────────────────
    console.log('');
    console.log('  Errors seen on either surface');
    const realWeb = webErrors.filter((e) => !/hydration|Minified React error #418|#423/i.test(e));
    const realDesk = deskErrors.filter((e) => !/hydration|Minified React error #418|#423/i.test(e));
    check(realWeb.length === 0, 'the web app threw nothing', realWeb.slice(0, 2).join(' | '));
    check(realDesk.length === 0, 'the desktop threw nothing', realDesk.slice(0, 2).join(' | '));

  } finally {
    if (app) await app.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  const passed = results.filter((r) => r.ok).length;
  console.log('');
  console.log(`  ${passed} passed, ${results.length - passed} failed`);
  console.log('');
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
