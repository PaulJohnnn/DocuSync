/**
 * Can a column actually be dragged wider?
 *
 * The table extension has been configured `resizable: true` all along,
 * but the handle ProseMirror inserts to drag had no styles -- a
 * zero-width invisible div, so the feature was switched on and
 * impossible to use. This drags a real column border with a real mouse
 * and checks the width changed, and then that the new width is still
 * there after the document has been round-tripped through the server.
 *
 * Run: node scripts/probe-table-resize.js [baseUrl]
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
  await page.goto(`${BASE}/app/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 60000 });
  await page.waitForTimeout(1400);
  await page.fill('input[placeholder="Enter your username"]', acct.email);
  await page.fill('input[placeholder="Enter your password"]', acct.password);
  await page.click('button:has-text("Log In")');
  await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), null, { timeout: 30000 });
}

async function main() {
  console.log(`\nDragging a column wider -- ${BASE}\n`);

  const host = 'resize-' + Date.now();
  const room = await post('/create', {
    hostNodeId: host, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Resize', hostType: 'web',
  });
  const otp = room.data.otp;
  const fileId = (await post('/files', {
    otp,
    file: {
      fileId: Date.now(), fileName: 'Table.docx',
      content: '<p>Table 4.</p>', sharedBy: 's', sharedByNodeId: host,
    },
  })).data.fileId;

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    await signIn(page, accts[0]);
    await page.evaluate(({ otp, fileId }) => {
      const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
      const k = (x) => `ds_${u.id}_${x}`;
      localStorage.setItem(k('node_id'), 'resize-node');
      localStorage.setItem(k('current_room'), JSON.stringify({ otp, id: otp, name: 'Resize', isOwner: true }));
      localStorage.setItem(k('files'), JSON.stringify([{ id: String(fileId), name: 'Table.docx' }]));
    }, { otp, fileId });
    await page.goto(`${BASE}/app/editor/${fileId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ProseMirror', { timeout: 60000 });
    await page.waitForTimeout(1800);

    // A table to drag.
    await page.locator('.ProseMirror').click();
    await page.locator('button:has(svg.lucide-table)').first().click();
    await page.waitForTimeout(500);
    await page.locator('button[aria-label="3 by 3"]').first().click();
    await page.waitForTimeout(1200);
    check(await page.locator('.ProseMirror table').count() === 1, 'there is a table to resize');

    const widthOf = (n) => page.evaluate((i) => {
      const cols = document.querySelectorAll('.ProseMirror table col');
      if (cols.length > i) {
        const w = cols[i].style.width;
        if (w) return parseFloat(w);
      }
      const cells = document.querySelectorAll('.ProseMirror table tr:first-child th, .ProseMirror table tr:first-child td');
      return cells[i] ? Math.round(cells[i].getBoundingClientRect().width) : 0;
    }, n);

    const before = await widthOf(0);
    check(before > 0, 'the first column has a width to begin with', `${before}px`);

    // The handle lives on the right edge of the cell. Hover there first so
    // ProseMirror inserts it, then drag.
    const cell = page.locator('.ProseMirror table tr:first-child th').first();
    const box = await cell.boundingBox();
    const edgeX = box.x + box.width - 1;
    const midY = box.y + box.height / 2;

    await page.mouse.move(edgeX, midY);
    await page.waitForTimeout(400);
    const handleVisible = await page.evaluate(() => {
      const h = document.querySelector('.ProseMirror .column-resize-handle');
      if (!h) return { present: false };
      const r = h.getBoundingClientRect();
      return { present: true, width: Math.round(r.width), height: Math.round(r.height) };
    });
    check(handleVisible.present, 'a resize handle appears on the column edge');
    check(handleVisible.present && handleVisible.width > 0 && handleVisible.height > 0,
      'and it is something you could actually grab',
      handleVisible.present ? `${handleVisible.width}x${handleVisible.height}px` : 'no handle');

    await page.mouse.down();
    await page.mouse.move(edgeX + 150, midY, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(1200);

    const after = await widthOf(0);
    check(after > before + 40, 'dragging the edge makes the column wider',
      `${before}px -> ${after}px`);

    // And it has to survive the round trip, or it is a local illusion.
    await page.waitForTimeout(4000);
    const stored = String((await fetch(`${API}/doc?otp=${otp}&fileId=${fileId}`).then((r) => r.json()))?.snapshot?.content || '');
    check(/colwidth/i.test(stored) || /<col[^>]*width/i.test(stored),
      'the new width is written into the document, not just the screen',
      (stored.match(/colwidth="[^"]*"/i) || stored.match(/<col[^>]*>/i) || ['not found'])[0]);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ProseMirror table', { timeout: 60000 });
    await page.waitForTimeout(2500);
    const afterReload = await widthOf(0);
    check(afterReload > before + 40, 'and it is still that width after a reload',
      `${afterReload}px`);

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
