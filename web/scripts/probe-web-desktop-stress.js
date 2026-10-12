/**
 * Web and desktop under sustained, realistic load.
 *
 * The cross-platform probe walks a happy path: one line each way, one
 * upload, one lock. That proves the features exist. It does not prove the
 * two apps hold up over a working session, which is what a demo actually
 * is -- minutes of two people typing, correcting, deleting and pasting
 * while the other watches.
 *
 * So this drives the real Electron build and a real browser through a
 * long exchange and measures what matters when someone is watching:
 *
 *   - does every contribution arrive, every time
 *   - do the two documents agree after each round, not just at the end
 *   - how long does an edit take to appear, across many samples
 *   - does the log stay free of duplicates while all that happens
 *   - does a disconnected desktop catch up when it returns
 *
 * Mobile is deliberately out of scope here.
 *
 * Run: node scripts/probe-web-desktop-stress.js [baseUrl] [rounds]
 */
const { chromium, _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'https://docusync-dusky.vercel.app';
const ROUNDS = Number(process.argv[3] || 8);
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
  const res = await fetch(`${API}${p}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const get = async (p) => {
  const res = await fetch(`${API}${p}`);
  return { status: res.status, data: await res.json().catch(() => null) };
};
const flat = (h) =>
  String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

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
    await w.waitForTimeout(250);
  }
  return null;
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
  const live = await page.evaluate(() => sessionStorage.getItem('docusync_auth_user'));
  if (!live) throw new Error('session dropped after signing in');
  await page.evaluate(({ otp, fileId, name }) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    const k = (x) => `ds_${u.id}_${x}`;
    localStorage.setItem(k('current_room'), JSON.stringify({ otp, id: otp, name: 'Stress' }));
    localStorage.setItem(k('files'), JSON.stringify([{ id: String(fileId), name }]));
  }, { otp, fileId, name });
  await page.goto(`${BASE}/app/editor/${fileId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ProseMirror', { timeout: 60000 });
  await page.waitForTimeout(1500);
}

/**
 * Keystroke delay and the pause between rounds.
 *
 * The default drives the apps faster than any person types, which is the
 * right way to find a race but the wrong way to describe everyday use.
 * PACE=human slows it to a brisk typist with a short think between
 * paragraphs, so the same session can be judged at both speeds.
 */
const HUMAN = process.env.PACE === 'human';
const KEY_DELAY = HUMAN ? 55 : 10;
const ROUND_PAUSE = HUMAN ? 2500 : 0;

async function typeLine(page, line) {
  await page.click('.ProseMirror');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(line, { delay: KEY_DELAY });
}

const pct = (xs, p) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

async function main() {
  console.log(`\nWeb + desktop under load -- ${BASE}   (${ROUNDS} rounds)\n`);

  const HOST = 'stress-' + Date.now();
  const room = await post('/create', {
    hostNodeId: HOST, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Stress', hostType: 'web',
  });
  const otp = room.data?.otp;
  const seeded = await post('/files', {
    otp, file: { fileId: Date.now(), fileName: 'Chapter 3.docx', content: '<p>Chapter 3 Methodology.</p>', sharedBy: 'Setup', sharedByNodeId: HOST },
  });
  const fileId = seeded.data?.fileId;
  console.log(`  room ${otp}  fileId ${fileId}\n`);

  let app, browser;
  const dToW = [];
  const wToD = [];
  const everTyped = [];

  try {
    app = await electron.launch({
      executablePath: EXE, args: [MAIN], cwd: DESKTOP, timeout: 120000,
      env: { ...process.env, VITE_DEV_SERVER_URL: `${BASE}/app/login`, DOCUSYNC_WS_PORT: '9461' },
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

    // ── A working session ───────────────────────────────────────────────
    console.log(`  ${ROUNDS} rounds of two people working`);
    let divergedAt = null;
    let lostAt = null;
    const inputDropped = [];

    for (let r = 1; r <= ROUNDS; r++) {
      const dLine = `Desktop paragraph ${r} about the research design.`;
      const wLine = `Web paragraph ${r} about the respondents.`;

      if (r % 3 === 0) {
        // Every third round they type AT THE SAME TIME, which is the case
        // the arbitration exists for.
        await Promise.all([typeLine(desk, dLine), typeLine(web, wLine)]);
      } else {
        await typeLine(desk, dLine);
        await desk.waitForTimeout(600);
        await typeLine(web, wLine);
      }
      everTyped.push(dLine, wLine);

      // Did the keystrokes even land?
      //
      // Typing is: click, Control+End, Enter, then characters. If a remote
      // update is applied to ProseMirror between the Enter and the
      // characters, the document is replaced and the caret resets, so the
      // input goes nowhere. That is a different failure from "typed but
      // not delivered", and only this check can tell them apart -- without
      // it, keystrokes eaten at the keyboard look exactly like text lost
      // in transit.
      const dLanded = (await docText(desk)).includes(dLine);
      const wLanded = (await docText(web)).includes(wLine);
      if (!dLanded) inputDropped.push(`round ${r}: the desktop's own keystrokes never entered its editor`);
      if (!wLanded) inputDropped.push(`round ${r}: the web's own keystrokes never entered its editor`);

      if (ROUND_PAUSE) await desk.waitForTimeout(ROUND_PAUSE);
      const a = await waitForText(web, dLine, 25000);
      const b = await waitForText(desk, wLine, 25000);
      if (a !== null) dToW.push(a); else if (lostAt === null) lostAt = `round ${r}: desktop line never reached web`;
      if (b !== null) wToD.push(b); else if (lostAt === null) lostAt = `round ${r}: web line never reached desktop`;

      // Both documents must agree after every round, not merely at the end.
      await desk.waitForTimeout(2200);
      const dt = await docText(desk);
      const wt = await docText(web);
      if (dt !== wt && divergedAt === null) divergedAt = `round ${r}`;
      // What the SERVER holds, so a line that vanishes can be traced to
      // the client that dropped it or to the merge that discarded it.
      const srvDoc = await get(`/doc?otp=${otp}&fileId=${fileId}`);
      const srv = flat(srvDoc.data?.snapshot?.content);
      const y = (hay, l) => (hay.includes(l) ? 'y' : 'N');
      process.stdout.write(
        `    r${r}: d->w ${String(a ?? 'LOST').padStart(5)}  w->d ${String(b ?? 'LOST').padStart(5)}  `
        + `${dt === wt ? 'agree' : 'DIVER'}  server[d:${y(srv, dLine)} w:${y(srv, wLine)}]`
        + `  desk[${y(dt, dLine)}${y(dt, wLine)}]  web[${y(wt, dLine)}${y(wt, wLine)}]
`
      );
    }

    check(inputDropped.length === 0, 'every line actually entered the editor it was typed into',
      inputDropped.length ? `${inputDropped.length} of ${ROUNDS * 2}: ${inputDropped[0]}` : `${ROUNDS * 2} lines`);
    check(lostAt === null, `every contribution arrived across ${ROUNDS} rounds`, lostAt || `${dToW.length + wToD.length} deliveries`);
    check(divergedAt === null, 'the two documents agreed after every round', divergedAt || 'always identical');

    // ── Nothing anyone typed went missing ───────────────────────────────
    const finalText = await docText(desk);
    const missing = everTyped.filter((l) => !finalText.includes(l));
    check(missing.length === 0, 'every line typed by either person is in the final document',
      missing.length ? `${missing.length} missing, e.g. "${missing[0].slice(0, 40)}"` : `${everTyped.length} lines`);

    // ── Speed, across many samples rather than one ──────────────────────
    console.log('');
    console.log('  Delivery time');
    const all = [...dToW, ...wToD];
    console.log(`    desktop -> web : median ${pct(dToW, 50)}ms   slowest ${Math.max(...dToW, 0)}ms`);
    console.log(`    web -> desktop : median ${pct(wToD, 50)}ms   slowest ${Math.max(...wToD, 0)}ms`);
    check(pct(all, 50) < 3000, 'a typical edit appears on the other machine in under 3s', `median ${pct(all, 50)}ms`);
    check(pct(all, 95) < 12000, '95% of edits appear within 12s', `p95 ${pct(all, 95)}ms`);

    // ── The log, after all that ─────────────────────────────────────────
    console.log('');
    console.log('  The version history after the session');
    const rows = (await get(`/history?otp=${otp}&fileId=${fileId}`)).data?.data?.entries ?? [];
    const bodies = rows.map((e) => flat(e.fullContent));
    const dupes = [...bodies.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map()).entries()].filter(([, n]) => n > 1);
    check(dupes.length === 0, 'no two versions show the same text',
      dupes.length ? dupes.map(([k, n]) => `x${n}: "${k.slice(0, 40)}"`).join(' | ') : `${new Set(bodies).size} distinct of ${rows.length}`);
    const seqs = rows.map((e) => e.seqNo).filter((n) => typeof n === 'number');
    check(new Set(seqs).size === seqs.length, 'every row has a unique sequence number', `${new Set(seqs).size}/${seqs.length}`);
    check(rows.length < everTyped.length, 'the log summarises the session rather than logging every save',
      `${everTyped.length} edits -> ${rows.length} versions`);
    const hay = bodies.join(' || ');
    const unrecoverable = everTyped.filter((l) => !hay.includes(l));
    check(unrecoverable.length === 0, 'everything typed is recoverable from the history',
      unrecoverable.length ? `${unrecoverable.length} unrecoverable` : 'all of it');

    // ── The desktop loses its connection and comes back ─────────────────
    console.log('');
    console.log('  The desktop drops offline and returns');
    await desk.context().setOffline(true);
    const whileAway = 'Web wrote this while the desktop was offline.';
    await typeLine(web, whileAway);
    await web.waitForTimeout(3000);
    const sawItOffline = (await docText(desk)).includes(whileAway);
    check(!sawItOffline, 'an offline desktop does not receive edits (as expected)');

    await desk.context().setOffline(false);
    const caughtUp = await waitForText(desk, whileAway, 45000);
    check(caughtUp !== null, 'it catches up once the connection returns',
      caughtUp !== null ? `${caughtUp}ms after reconnecting` : 'never caught up');

    await desk.waitForTimeout(2500);
    const dEnd = await docText(desk);
    const wEnd = await docText(web);
    check(dEnd === wEnd, 'and the two documents agree again afterwards',
      dEnd === wEnd ? 'identical' : `desktop "${dEnd.slice(-40)}" vs web "${wEnd.slice(-40)}"`);

  } catch (err) {
    check(false, 'the session completed', String(err).slice(0, 160));
  } finally {
    try { if (browser) await browser.close(); } catch {}
    try { if (app) await app.close(); } catch {}
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('crashed:', e); process.exit(1); });
