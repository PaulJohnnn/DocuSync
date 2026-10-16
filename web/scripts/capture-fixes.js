/**
 * Photographs the three things that were reported broken.
 *
 * A table that could not be adjusted, a room code that could not be
 * regenerated, and one control wearing two different sets of words.
 *
 * Run: node scripts/capture-fixes.js [baseUrl] [outDir]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = process.argv[3] || path.join(__dirname, 'fix-shots');
const API = `${BASE}/api/lobby`;
const accts = JSON.parse(fs.readFileSync(path.join(__dirname, 'live-accounts.json'), 'utf8'));

fs.mkdirSync(OUT, { recursive: true });
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('    shot  ' + name + '.png');
};

const post = async (p, b) => {
  const r = await fetch(`${API}${p}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
  });
  return { status: r.status, data: await r.json().catch(() => null) };
};

async function signIn(page, acct) {
  await page.goto(`${BASE}/app/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 60000 });
  await page.waitForTimeout(1400);
  await page.fill('input[placeholder="Enter your username"]', acct.email);
  await page.fill('input[placeholder="Enter your password"]', acct.password);
  await page.click('button:has-text("Log In")');
  await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), null, { timeout: 30000 });
}

async function main() {
  console.log('');
  console.log('The three fixes -- ' + BASE);

  const host = 'fix-' + Date.now();
  const guestNode = 'fix-guest-' + Date.now();
  const otp = (await post('/create', {
    hostNodeId: host, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Thesis', hostType: 'web',
  })).data.otp;
  const fileId = (await post('/files', {
    otp,
    file: {
      fileId: Date.now(), fileName: 'Chapter 4 - Results.docx',
      content: '<p>Table 4. Level of usability.</p>', sharedBy: 'Maria Santos', sharedByNodeId: host,
    },
  })).data.fileId;
  console.log('  room ' + otp);

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 820 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    await signIn(page, accts[0]);
    await page.evaluate(({ otp, fileId, host }) => {
      const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
      const k = (x) => `ds_${u.id}_${x}`;
      localStorage.setItem(k('node_id'), host);
      localStorage.setItem(k('current_room'), JSON.stringify({ otp, id: otp, name: 'Thesis', isOwner: true }));
      localStorage.setItem(k('files'), JSON.stringify([{ id: String(fileId), name: 'Chapter 4 - Results.docx' }]));
    }, { otp, fileId, host });

    // A second person, so the room has somebody in it.
    const ctx2 = await browser.newContext();
    const guest = await ctx2.newPage();
    await signIn(guest, accts[1]);
    await guest.evaluate(({ otp, fileId, guestNode }) => {
      const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
      const k = (x) => `ds_${u.id}_${x}`;
      localStorage.setItem(k('node_id'), guestNode);
      localStorage.setItem(k('current_room'), JSON.stringify({ otp, id: otp, name: 'Thesis' }));
      localStorage.setItem(k('files'), JSON.stringify([{ id: String(fileId), name: 'Chapter 4 - Results.docx' }]));
    }, { otp, fileId, guestNode });
    await guest.goto(`${BASE}/app/editor/${fileId}`, { waitUntil: 'domcontentloaded' });

    await page.goto(`${BASE}/app/editor/${fileId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ProseMirror', { timeout: 60000 });
    await page.waitForTimeout(2000);

    // ── 1. A table, before the drag ──────────────────────────────────
    console.log('');
    console.log('  1. The table');
    await page.locator('.ProseMirror').click();
    await page.locator('button:has(svg.lucide-table)').first().click();
    await page.waitForTimeout(500);
    await page.locator('button[aria-label="3 by 4"]').first().click();
    await page.waitForTimeout(1200);
    const text = ['Indicator', 'Mean', 'SD', 'Verbal', 'Ease of use', '4.52', '0.61', 'Very High'];
    const cells = page.locator('.ProseMirror table th, .ProseMirror table td');
    for (let i = 0; i < text.length; i++) {
      await cells.nth(i).click();
      await page.keyboard.type(text[i], { delay: 10 });
    }
    await page.waitForTimeout(800);
    await shot(page, '1-table-before-drag');

    // Hover the column edge so the handle shows, then drag it.
    const cell = page.locator('.ProseMirror table tr:first-child th').first();
    const box = await cell.boundingBox();
    const edgeX = box.x + box.width - 1;
    const midY = box.y + box.height / 2;
    await page.mouse.move(edgeX, midY);
    await page.waitForTimeout(500);
    await shot(page, '2-the-handle-you-can-grab');
    await page.mouse.down();
    await page.mouse.move(edgeX + 170, midY, { steps: 16 });
    await shot(page, '3-dragging-the-column');
    await page.mouse.up();
    await page.waitForTimeout(1500);
    await shot(page, '4-column-is-wider');

    const widths = await page.evaluate(() => Array.from(
      document.querySelectorAll('.ProseMirror table tr:first-child th')
    ).map((c) => Math.round(c.getBoundingClientRect().width)));
    console.log('    column widths now: ' + widths.join(', '));

    // ── 2. The room code ─────────────────────────────────────────────
    console.log('');
    console.log('  2. The room code');
    await page.waitForTimeout(3000);
    await page.locator('text=/Can edit|View only|Owner/').first().click().catch(() => {});
    await page.waitForTimeout(1000);
    const codeBefore = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('p'));
      const label = els.find((e) => /^Code to join$/i.test((e.textContent || '').trim()));
      const v = label && label.parentElement ? label.parentElement.querySelector('p:nth-of-type(2)') : null;
      return v ? (v.textContent || '').trim() : null;
    });
    await shot(page, '5-code-and-the-new-button');

    await page.locator('button:has-text("Give out a new code")').click();
    await page.waitForTimeout(3500);
    const codeAfter = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('p'));
      const label = els.find((e) => /^Code to join$/i.test((e.textContent || '').trim()));
      const v = label && label.parentElement ? label.parentElement.querySelector('p:nth-of-type(2)') : null;
      return v ? (v.textContent || '').trim() : null;
    });
    await shot(page, '6-a-new-code-is-in-force');
    console.log(`    the code changed: ${codeBefore} -> ${codeAfter}`);

    const oldRefused = await post('/join', { otp: String(codeBefore).replace(/\s/g, ''), memberNodeId: 'shot-old-' + Date.now() });
    const newWorks = await post('/join', { otp: String(codeAfter).replace(/\s/g, ''), memberNodeId: 'shot-new-' + Date.now() });
    console.log(`    old code -> ${oldRefused.status}, new code -> ${newWorks.status}`);

  } finally {
    await browser.close();
  }
  console.log('');
  console.log('  screenshots in ' + OUT);
  console.log('');
}

main().catch((e) => { console.error(e); process.exit(1); });
