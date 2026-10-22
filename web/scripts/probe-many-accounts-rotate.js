/**
 * Five accounts, a room, and the code replaced underneath them.
 *
 * The question is not whether one person can join once. It is whether a
 * group ends up in the SAME room when the code keeps changing between
 * their arrivals -- which is what happens in practice, because the
 * owner regenerates it, or it lapses, in the middle of inviting people.
 *
 * Each person joins from a clean browser profile through the real form,
 * at a different point in the code's life. Then every one of them has to
 * be in the same room: same room id, same files, able to write, and
 * visible to everyone else.
 *
 * Run: node scripts/probe-many-accounts-rotate.js [baseUrl] [outDir]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = process.argv[3] || path.join(__dirname, 'many-accounts-shots');
const API = `${BASE}/api/lobby`;
const accts = JSON.parse(fs.readFileSync(path.join(__dirname, 'live-accounts.json'), 'utf8'));
const NAMES = ['Maria Santos', 'Juan dela Cruz', 'Ana Reyes', 'Carlo Bautista', 'Liza Mendoza'];

fs.mkdirSync(OUT, { recursive: true });
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

/** The real form: type the code, press the button, walk through. */
async function joinByCode(page, code) {
  await page.goto(`${BASE}/app/peers`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.locator('button:has-text("Join Room")').first().click();
  await page.waitForSelector('text=Join a Room', { timeout: 20000 });
  await page.evaluate(() => { const el = document.querySelector('input'); if (el) el.focus(); });
  await page.keyboard.type(code, { delay: 60 });
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Join Room")').last().click();
  await page.waitForTimeout(6500);
  const accepted = await page.evaluate(() => /You.{0,3}re now in/i.test(document.body.innerText || ''));
  if (!accepted) return false;
  await page.locator('button:has-text("Enter Workspace")').click();
  await page.waitForTimeout(3500);
  return true;
}

const storedOtp = (page) => page.evaluate(() => {
  const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
  const raw = localStorage.getItem(`ds_${u.id}_current_room`);
  return raw ? (JSON.parse(raw).otp || JSON.parse(raw).id) : null;
});

const storedNodeId = (page) => page.evaluate(() => {
  const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
  return localStorage.getItem(`ds_${u.id}_node_id`);
});

const docText = (p) => p.evaluate(() => {
  const el = document.querySelector('.ProseMirror');
  if (!el) return '';
  const copy = el.cloneNode(true);
  copy.querySelectorAll('.collaboration-cursor__caret').forEach((n) => n.remove());
  return (copy.innerText || '').replace(/\s+/g, ' ').trim();
});

async function main() {
  console.log(`\nFive accounts, and the code kept changing -- ${BASE}\n`);

  const ownerNode = 'many-owner-' + Date.now();
  const otp = (await post('/create', {
    hostNodeId: ownerNode, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Thesis Room', hostType: 'web',
  })).data.otp;
  const fileId = (await post('/files', {
    otp,
    file: {
      fileId: Date.now(), fileName: 'Chapter 4 - Results.docx',
      content: '<p>Table 4. Level of usability.</p>',
      sharedBy: NAMES[0], sharedByNodeId: ownerNode,
    },
  })).data.fileId;
  console.log(`  room id ${otp}  (never changes)\n`);

  const codeNow = async () => (await post('/heartbeat', {
    nodeId: ownerNode, displayName: NAMES[0], hostedRoom: { otp },
  })).data?.joinCode;

  const browser = await chromium.launch();
  const joined = [];
  try {
    // The owner is in from the start.
    const ownerCtx = await browser.newContext({ viewport: { width: 1400, height: 820 } });
    const owner = await ownerCtx.newPage();
    owner.setDefaultTimeout(60000);
    await signIn(owner, accts[0]);
    await owner.evaluate(({ otp, ownerNode }) => {
      const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
      const k = (x) => `ds_${u.id}_${x}`;
      localStorage.setItem(k('node_id'), ownerNode);
      localStorage.setItem(k('current_room'), JSON.stringify({ otp, id: otp, name: 'Thesis Room', isOwner: true }));
    }, { otp, ownerNode });
    await owner.goto(`${BASE}/app/files`, { waitUntil: 'domcontentloaded' });
    await owner.waitForTimeout(7000);

    // Four more people, each arriving at a different point in the
    // code's life, each from a browser that has never seen this app.
    const plan = [
      { i: 1, rotateFirst: false, note: 'joins on the original code' },
      { i: 2, rotateFirst: true, note: 'joins after the code is replaced once' },
      { i: 3, rotateFirst: false, note: 'joins on that same replacement' },
      { i: 4, rotateFirst: true, note: 'joins after it is replaced again' },
    ];

    for (const step of plan) {
      if (step.rotateFirst) {
        const r = await post('/code', { otp, nodeId: ownerNode });
        console.log(`  -- code replaced: now ${r.data?.joinCode}`);
      }
      const code = await codeNow();
      const ctx = await browser.newContext({ viewport: { width: 1400, height: 820 } });
      const page = await ctx.newPage();
      page.setDefaultTimeout(60000);
      await signIn(page, accts[step.i]);
      const ok = await joinByCode(page, code);
      check(ok, `${NAMES[step.i]} ${step.note}`, `code ${code}`);
      joined.push({ name: NAMES[step.i], page, ctx, nodeId: await storedNodeId(page) });
      await page.waitForTimeout(2500);
    }

    // ── Everyone in the same room ────────────────────────────────────
    console.log('');
    console.log('  Are they all in the same room');
    for (const p of joined) {
      const theirs = await storedOtp(p.page);
      check(theirs === otp, `${p.name} is in room ${otp}`, `has ${theirs}`);
    }

    // ── Everyone sees the same files ─────────────────────────────────
    console.log('');
    console.log('  Can they all see it');
    for (const p of joined) {
      await p.page.goto(`${BASE}/app/files`, { waitUntil: 'domcontentloaded' });
      await p.page.waitForTimeout(6000);
      const sees = await p.page.locator('text=Chapter 4 - Results.docx').count();
      check(sees > 0, `${p.name} sees the room's file`, `${sees} rows`);
    }

    // ── The owner sees all of them ───────────────────────────────────
    const beat = await post('/heartbeat', {
      nodeId: ownerNode, displayName: NAMES[0], hostedRoom: { otp },
    });
    const peers = beat.data?.activePeers ?? [];
    // Counted by person, not by connection. One account signed in twice
    // is two nodes and still one person -- the owner's own window and
    // this script are both Maria Santos.
    const people = Array.from(new Set(peers.map((p) => p.displayName).filter(Boolean))).sort();
    check(people.length === 5, 'the owner sees all five people',
      `${people.length} of 5: ${people.join(', ')}  (${peers.length} connections)`);

    // Each person is looked for by the node they joined from, not by the
    // name this script calls them. The NAMES above are for reading the
    // output; the account's real name is whatever it is on the site being
    // tested, and on the live site that is its username. Checking for the
    // persona instead would report four absent people who are plainly
    // there.
    check(peers.some((p) => p.nodeId === ownerNode), `${NAMES[0]} is in the room`);
    for (const p of joined) {
      const seen = peers.find((q) => q.nodeId === p.nodeId);
      check(!!seen, `${p.name} is in the room`,
        seen ? `the room calls them ${seen.displayName}` : `node ${p.nodeId} is not in the list`);
    }

    // ── And they can all write to the same document ──────────────────
    console.log('');
    console.log('  Can they all write to it');
    for (const p of joined) {
      await p.page.locator('button:has-text("Open & edit")').first().click();
      await p.page.waitForSelector('.ProseMirror', { timeout: 60000 });
      await p.page.waitForTimeout(2500);
      await p.page.locator('.ProseMirror').click();
      await p.page.keyboard.press('Control+End');
      await p.page.keyboard.press('Enter');
      await p.page.keyboard.type(`${p.name.split(' ')[0].toUpperCase()}WROTE here.`, { delay: 8 });
      await p.page.waitForTimeout(5000);
    }
    await owner.waitForTimeout(6000);

    const stored = String((await fetch(`${API}/doc?otp=${otp}&fileId=${fileId}`).then((r) => r.json()))?.snapshot?.content || '');
    for (const p of joined) {
      const tag = `${p.name.split(' ')[0].toUpperCase()}WROTE`;
      check(stored.includes(tag), `${p.name}'s writing is in the room's document`);
    }

    // ── Proof, as pictures ───────────────────────────────────────────
    console.log('');
    console.log('  Pictures');
    await owner.goto(`${BASE}/app/files`, { waitUntil: 'domcontentloaded' });
    await owner.waitForTimeout(7000);
    await owner.locator('text=/connected/').first().click().catch(() => {});
    await owner.waitForTimeout(1200);
    await owner.screenshot({ path: path.join(OUT, '1-owner-sees-everyone.png') });
    console.log('    shot  1-owner-sees-everyone.png');

    await owner.locator('body').click({ position: { x: 5, y: 600 } }).catch(() => {});
    await owner.waitForTimeout(500);
    await owner.locator('button[title="Room code"]').click();
    await owner.waitForTimeout(900);
    await owner.screenshot({ path: path.join(OUT, '2-the-code-they-used.png') });
    console.log('    shot  2-the-code-they-used.png');

    const last = joined[joined.length - 1];
    await last.page.goto(`${BASE}/app/editor/${fileId}`, { waitUntil: 'domcontentloaded' });
    await last.page.waitForSelector('.ProseMirror', { timeout: 60000 });
    await last.page.waitForTimeout(6000);
    await last.page.screenshot({ path: path.join(OUT, '3-newest-joiner-sees-everything.png') });
    console.log('    shot  3-newest-joiner-sees-everything.png');
    const lastText = await docText(last.page);
    console.log(`    the newest joiner's document reads: "${lastText.slice(0, 120)}"`);

    for (const p of joined) await p.ctx.close();
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
