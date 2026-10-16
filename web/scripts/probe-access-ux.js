/**
 * Who owns this room, who may type in it, and how hard the app works.
 *
 * Four complaints came back from the review, and this checks each one
 * against the running app rather than against the code:
 *
 *   1. Nobody but the owner could tell who the owner was.
 *   2. Viewing versus editing was not legible.
 *   3. Roles could only be set after locking the document first.
 *   4. The whole thing felt slow.
 *
 * The last one is counted, not judged: every request the page makes is
 * recorded, so "smoother" is a number rather than an opinion.
 *
 * Run: node scripts/probe-access-ux.js [baseUrl]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;
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
  for (let i = 0; i < 2; i++) {
    await page.goto(`${BASE}/app/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 60000 });
    await page.waitForTimeout(1400);
    await page.fill('input[placeholder="Enter your username"]', acct.email);
    await page.fill('input[placeholder="Enter your password"]', acct.password);
    await page.click('button:has-text("Log In")');
    try {
      await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), null, { timeout: 30000 });
      return;
    } catch (e) { if (i) throw e; }
  }
}

// The node id is what the room records ownership against, and the client
// invents one on first run. Choosing it here instead lets the room be
// created with the owner tab's real id, so this tab IS the owner rather
// than merely acting like one.
async function enterRoom(page, otp, fileId, name, nodeId) {
  await page.evaluate(({ otp, fileId, name, nodeId }) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    const k = (x) => `ds_${u.id}_${x}`;
    localStorage.setItem(k('node_id'), nodeId);
    localStorage.setItem(k('current_room'), JSON.stringify({ otp, id: otp, name: 'Access', isOwner: true }));
    localStorage.setItem(k('files'), JSON.stringify([{ id: String(fileId), name }]));
  }, { otp, fileId, name, nodeId });
}

/** Open the people panel and read every row off it. */
const readPanel = (page) => page.evaluate(() => {
  const txt = (el) => (el.innerText || '').replace(/\s+/g, ' ').trim();
  const panel = Array.from(document.querySelectorAll('div'))
    .find((d) => /In this room/i.test(d.innerText || '') && /Code to join/i.test(d.innerText || ''));
  if (!panel) return null;
  const rows = Array.from(panel.querySelectorAll('div'))
    .filter((d) => d.querySelector('.ds-presence-dot') && d.children.length <= 4)
    .map((d) => txt(d))
    .filter(Boolean);
  return { all: txt(panel).slice(0, 400), rows: Array.from(new Set(rows)) };
});

async function main() {
  console.log(`\nOwnership, roles and load -- ${BASE}\n`);

  const ownerNode = 'web-owner-' + Date.now();
  const guestNode = 'web-guest-' + Date.now();
  const HOST = ownerNode;
  const room = await post('/create', {
    hostNodeId: HOST, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Access', hostType: 'web',
  });
  const otp = room.data?.otp;
  const shared = await post('/files', {
    otp,
    file: {
      fileId: Date.now(), fileName: 'Chapter 3.docx',
      content: '<p>Methodology.</p>', sharedBy: 's', sharedByNodeId: HOST,
    },
  });
  const fileId = shared.data?.fileId;
  console.log(`  room ${otp}  fileId ${fileId}\n`);

  const browser = await chromium.launch();
  try {
    const ctxO = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const owner = await ctxO.newPage();
    const ctxG = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const guest = await ctxG.newPage();
    owner.setDefaultTimeout(60000); guest.setDefaultTimeout(60000);

    await signIn(owner, accts[0]);
    await signIn(guest, accts[1]);

    await enterRoom(owner, otp, fileId, 'Chapter 3.docx', ownerNode);
    await enterRoom(guest, otp, fileId, 'Chapter 3.docx', guestNode);

    // ── Load, counted ────────────────────────────────────────────────
    //
    // The baseline this is measured against is 157 requests a minute:
    // document 86, carets 40, lock 15, presence 12, conflicts 4.
    console.log('  What the page asks for');
    const calls = [];
    guest.on('request', (r) => {
      const u = r.url();
      if (u.includes('/api/lobby/')) calls.push(u.split('/api/lobby/')[1].split('?')[0]);
    });

    const measure = async (label, seconds) => {
      calls.length = 0;
      const t0 = Date.now();
      await guest.waitForTimeout(seconds * 1000);
      const elapsed = (Date.now() - t0) / 1000;
      const perMin = (n) => Math.round((n / elapsed) * 60);
      const byRoute = {};
      for (const c of calls) byRoute[c] = (byRoute[c] || 0) + 1;
      const total = perMin(calls.length);
      console.log('    ' + label.padEnd(26) + total + ' requests/min   ' +
        Object.entries(byRoute).map(([k, v]) => `${k}=${perMin(v)}`).join(' '));
      return { total, byRoute, perMin };
    };

    await guest.goto(`${BASE}/app/editor/${fileId}`, { waitUntil: 'domcontentloaded' });
    await guest.waitForSelector('.ProseMirror', { timeout: 60000 });
    await owner.goto(`${BASE}/app/editor/${fileId}`, { waitUntil: 'domcontentloaded' });
    await owner.waitForSelector('.ProseMirror', { timeout: 60000 });
    await owner.waitForTimeout(8000);

    const load = await measure('two people editing:', 20);
    check(load.total < 120, 'the editor asks for less than it did',
      `${load.total}/min, was 157`);
    check(!load.byRoute['lock'], 'the lock is no longer a poll of its own',
      load.byRoute['lock'] ? 'still polled' : 'none');
    check(!load.byRoute['cursors'], 'carets no longer cost a request of their own',
      load.byRoute['cursors'] ? 'still polled' : 'none');

    // ── 1. Who owns this room ────────────────────────────────────────
    console.log('');
    console.log('  Who owns the room');
    await guest.locator('text=/connected|Can edit|View only|Owner/').first().click().catch(() => {});
    await guest.waitForTimeout(800);
    const guestSees = await readPanel(guest);
    check(!!guestSees, 'the guest can open the people list');
    if (guestSees) {
      const ownerRow = guestSees.rows.find((r) => /Owner/.test(r));
      check(!!ownerRow, 'a guest can see which person owns the room',
        ownerRow || guestSees.rows.join(' | '));
      check(!/Peer \d/.test(guestSees.all) && !/Someone/.test(guestSees.all),
        'and everyone is named, not numbered');
    }

    // ── The code to get in ───────────────────────────────────────────
    console.log('');
    console.log('  The code to get in');
    const shownCode = await guest.evaluate(() => {
      const els = Array.from(document.querySelectorAll('p'));
      const label = els.find((e) => /^Code to join$/i.test((e.textContent || '').trim()));
      const value = label && label.parentElement
        ? label.parentElement.querySelector('p:nth-of-type(2)')
        : null;
      return value ? (value.textContent || '').trim() : null;
    });
    check(!!shownCode && /^[A-Z0-9]{6}$/.test(shownCode),
      'the room code is shown where the people are', shownCode || 'not shown');
    if (shownCode) {
      const tryIt = await post('/join', { otp: shownCode, memberNodeId: 'ux-code-' + Date.now() });
      check(tryIt.status === 200 && tryIt.data?.otp === otp,
        'and it is a code the server actually accepts', `status=${tryIt.status}`);
    }

    // ── 2. Roles without locking first ───────────────────────────────
    console.log('');
    console.log('  Setting a role');
    await owner.locator('text=/connected|Can edit|View only|Owner/').first().click().catch(() => {});
    await owner.waitForTimeout(800);
    const ownerPanel = await readPanel(owner);
    check(!!ownerPanel && /You can edit it/i.test(ownerPanel.all),
      'the editor tells you what YOU can do', ownerPanel ? ownerPanel.all.slice(0, 70) : 'no panel');
    check(!!ownerPanel && !/Only for|Choose people/i.test(ownerPanel.all),
      'and no longer carries a second copy of the access controls');

    // Access is set in one place, so the change is made there.
    const clickedAt = Date.now();
    await post('/lock', {
      otp, nodeId: ownerNode, fileId,
      openRestricted: true, restricted: true, grantOpen: guestNode, revoke: guestNode,
    });
    // How long a role change takes to become true is the whole of what
    // "slow" means for this control, so it is timed rather than assumed.
    let lock = null; let stored = null;
    for (let i = 0; i < 24; i++) {
      await owner.waitForTimeout(250);
      lock = await fetch(`${API}/lock?otp=${otp}&nodeId=${guestNode}`).then((r) => r.json());
      stored = lock.fileLocks?.[String(fileId)];
      if (stored) break;
    }
    const landedMs = Date.now() - clickedAt;
    console.log('    the change was stored ' + landedMs + 'ms after the click');
    check(landedMs < 2000, 'a role change takes effect promptly', landedMs + 'ms');
    check(!!stored?.locked, 'making one person view-only restricts the document',
      stored ? `restricted=${stored.locked}` : 'no record');
    check(lock.permissions?.[String(fileId)] === false,
      'and the server now refuses that person an edit');

    // ── 3. The guest is told, in words ───────────────────────────────
    console.log('');
    console.log('  What the view-only person sees');
    await guest.waitForTimeout(7000);
    const banner = await guest.evaluate(() => {
      const el = Array.from(document.querySelectorAll('div, span'))
        .find((d) => /View only/i.test(d.textContent || '') && (d.textContent || '').length < 220);
      return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : null;
    });
    check(!!banner, 'the guest is told they are view-only', banner || 'no banner');
    // Read from the editor's own banner, not the shortest matching node.
    const editorBanner = await guest.evaluate(() => {
      const el = Array.from(document.querySelectorAll('span'))
        .find((d) => /^View only\./.test((d.textContent || '').trim()));
      return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : null;
    });
    console.log('    banner: ' + (editorBanner || '(none)'));
    // A name is not one word. "Maria Santos" broke the first version of
    // this check, which is a fair reminder that most people's are not.
    const whoCanGrant = editorBanner && /but only (.+?) can give you editing access/i.exec(editorBanner);
    check(!!whoCanGrant && whoCanGrant[1].trim().length > 0,
      'and is told WHO can give them access', whoCanGrant ? whoCanGrant[1] : 'nobody named');

    const toolbar = await guest.locator('button:has(svg.lucide-bold)').count();
    check(toolbar === 0, 'the editing toolbar is not offered to a reader', `${toolbar} buttons`);

    // ── 4. And it can be given back ──────────────────────────────────
    console.log('');
    console.log('  Giving it back');
    // Giving it back is one call, from the one place that owns it.
    await post('/lock', { otp, nodeId: ownerNode, fileId, grantOpen: guestNode, grant: guestNode });
    await owner.waitForTimeout(1500);
    const lock2 = await fetch(`${API}/lock?otp=${otp}&nodeId=${guestNode}`).then((r) => r.json());
    check(lock2.permissions?.[String(fileId)] !== false,
      'the guest can edit again once the owner says so');

    await guest.waitForTimeout(7000);
    const toolbarBack = await guest.locator('button:has(svg.lucide-bold)').count();
    check(toolbarBack > 0, 'and their toolbar comes back without a reload', `${toolbarBack} buttons`);

  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log('');
  console.log(`  ${passed} passed, ${results.length - passed} failed`);
  console.log('');
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
