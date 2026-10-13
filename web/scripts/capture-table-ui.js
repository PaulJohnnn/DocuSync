/**
 * Photographs the table controls on both apps.
 *
 * The panel's point, and then the user's: a table the author cannot
 * shape is not a table feature. So this drives the real interface --
 * the size grid, a custom size, the cell shading -- on the web app and
 * on the Electron desktop build, and writes a screenshot of each step
 * so the behaviour can be read off the pictures.
 *
 * Run: node scripts/capture-table-ui.js [baseUrl] [outDir]
 */
const { chromium, _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = process.argv[3] || path.join(__dirname, 'table-shots');
const API = `${BASE}/api/lobby`;
const DESKTOP = path.resolve(__dirname, '..', '..', 'desktop');
const MAIN = path.join(DESKTOP, 'dist-electron', 'main.js');
const EXE = path.join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe');
const accts = JSON.parse(fs.readFileSync(path.join(__dirname, 'live-accounts.json'), 'utf8'));

fs.mkdirSync(OUT, { recursive: true });
const shots = [];
const shot = async (page, name) => {
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file });
  shots.push(file);
  console.log('    shot  ' + name + '.png');
};

const post = async (p, b) => {
  const r = await fetch(API + p, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
  });
  return { status: r.status, data: await r.json().catch(() => null) };
};

async function signIn(page, acct) {
  for (let i = 0; i < 2; i++) {
    await page.goto(BASE + '/app/login', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 60000 });
    await page.waitForTimeout(1400);
    await page.fill('input[placeholder="Enter your username"]', acct.email);
    await page.fill('input[placeholder="Enter your password"]', acct.password);
    await page.click('button:has-text("Log In")');
    try {
      await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), null, { timeout: 30000 });
      return true;
    } catch (e) { if (i) throw e; }
  }
}

// The desktop window signs in through its own shell, so it only needs
// the room written in afterwards; both surfaces then open the editor the
// same way.
async function openEditor(page, otp, fileId, name) {
  await page.evaluate(({ otp, fileId, name }) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    const k = (x) => 'ds_' + u.id + '_' + x;
    localStorage.setItem(k('current_room'), JSON.stringify({ otp, id: otp, name: 'Tables' }));
    localStorage.setItem(k('files'), JSON.stringify([{ id: String(fileId), name }]));
  }, { otp, fileId, name });
  await page.goto(BASE + '/app/editor/' + fileId, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForSelector('.ProseMirror', { timeout: 60000 });
  } catch (e) {
    // Say where it actually ended up, rather than only that it timed out.
    const where = await page.evaluate(() => ({
      url: location.href,
      heading: (document.querySelector('h1,h2') || {}).textContent || '',
      body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
    })).catch(() => null);
    console.log('    stuck at: ' + JSON.stringify(where));
    await shot(page, 'DIAG-stuck');
    throw e;
  }
  await page.waitForTimeout(1500);
}

const SIZE_LABEL = new RegExp(String.raw`\d+ x \d+ table`);

/** The whole sequence, on whichever surface is handed in. */
async function run(page, tag) {
  console.log('');
  console.log('  ' + tag);

  // 1. The size grid, hovered to a size -- the thing that was asked for.
  await page.locator('.ProseMirror').first().click();
  await page.locator('button:has(svg.lucide-table)').first().click();
  await page.waitForTimeout(500);
  await page.locator('button[aria-label="4 by 6"]').first().hover();
  await page.waitForTimeout(350);
  const label = await page.getByText(SIZE_LABEL).first().innerText().catch(() => '');
  console.log('    grid reads: "' + label + '"');
  await shot(page, tag + '-1-size-grid');

  // 2. Place it at the size that was hovered.
  await page.locator('button[aria-label="4 by 6"]').first().click();
  await page.waitForTimeout(900);
  const cols = await page.locator('.ProseMirror table tr').first().locator('th,td').count();
  const rows = await page.locator('.ProseMirror table tr').count();
  console.log('    inserted:   ' + rows + ' x ' + cols);

  // 3. Fill the header row and a line of data, so the shading has
  //    something to land on and the picture is legible.
  const text = ['Indicator', 'Mean', 'SD', 'Rank', 'Verbal', 'n',
    'Ease of use', '4.52', '0.61', '1', 'Very High', '63'];
  const cells = page.locator('.ProseMirror table th, .ProseMirror table td');
  for (let i = 0; i < text.length; i++) {
    await cells.nth(i).click();
    await page.keyboard.type(text[i], { delay: 10 });
  }
  await page.waitForTimeout(600);

  // 4. Select the whole header row, then open the colours. Shading has
  //    to work on a selection, not one cell at a time, or colouring a
  //    header is six separate chores.
  const headers = page.locator('.ProseMirror table th');
  for (let attempt = 0; attempt < 4; attempt++) {
    await headers.first().click();
    await page.waitForTimeout(200);
    await headers.nth(5).click({ modifiers: ['Shift'] });
    // ProseMirror marks a cell selection in the DOM, so wait for the
    // selection itself instead of guessing at a delay -- shift-clicking
    // straight after a click does not always register.
    try {
      await page.waitForFunction(
        () => document.querySelectorAll('.ProseMirror table .selectedCell').length >= 6,
        null, { timeout: 2500 },
      );
      break;
    } catch (e) { /* try again */ }
  }
  const selected = await page.locator('.ProseMirror table .selectedCell').count();
  console.log('    selected:   ' + selected + ' header cells');
  await page.locator('button:has(svg.lucide-paint-bucket)').first().click();
  await page.waitForTimeout(450);
  await shot(page, tag + '-2-colour-palette');

  // 5. Shade it.
  await page.locator('button[title="Blue"]').first().click();
  await page.waitForTimeout(900);

  // 6. And a second colour on one data cell, to show it is per-cell.
  await page.locator('.ProseMirror table td').nth(4).click();
  await page.waitForTimeout(300);
  await page.locator('button:has(svg.lucide-paint-bucket)').first().click();
  await page.waitForTimeout(400);
  await page.locator('button[title="Green"]').first().click();
  await page.waitForTimeout(2600);
  await shot(page, tag + '-3-shaded-table');

  const painted = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.ProseMirror table th[data-bg], .ProseMirror table td[data-bg]')
      .forEach((c) => out.push(c.tagName.toLowerCase() + ':' + c.getAttribute('data-bg')));
    return out;
  });
  console.log('    shaded:     ' + (painted.join(' ') || 'nothing'));

  // 7. A custom size, larger than the grid reaches.
  const lastP = page.locator('.ProseMirror > p').last();
  if (await lastP.count()) await lastP.click();
  await page.locator('button:has(svg.lucide-table)').first().click();
  await page.waitForTimeout(450);
  await page.getByText('More rows and columns').first().click();
  await page.waitForTimeout(300);
  await page.fill('input[aria-label="Rows"]', '12');
  await page.fill('input[aria-label="Columns"]', '4');
  await shot(page, tag + '-4-typed-size');
  await page.locator('button:has-text("Insert")').first().click();
  await page.waitForTimeout(1400);
  const tables = await page.locator('.ProseMirror table').count();
  const second = page.locator('.ProseMirror table').nth(1);
  const r2 = await second.locator('tr').count();
  const c2 = await second.locator('tr').first().locator('th,td').count();
  console.log('    custom:     ' + tables + ' tables, the second ' + r2 + ' x ' + c2);
  await shot(page, tag + '-4-custom-size');

  return { label, rows, cols, painted, tables, r2, c2 };
}

async function main() {
  console.log('');
  console.log('Table controls -- ' + BASE);
  const HOST = 'cap-' + Date.now();
  const room = await post('/create', {
    hostNodeId: HOST, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Tables', hostType: 'web',
  });
  const otp = room.data && room.data.otp;

  // A file each, so the two surfaces are photographed independently
  // rather than racing to edit one document.
  const mk = async (name) => (await post('/files', {
    otp,
    file: {
      fileId: Date.now() + Math.floor(Math.random() * 1000), fileName: name,
      content: '<p>Table 4. Level of usability.</p>', sharedBy: 's', sharedByNodeId: HOST,
    },
  })).data.fileId;
  const webFile = await mk('Chapter 4 - web.docx');
  await new Promise((r) => setTimeout(r, 50));
  const deskFile = await mk('Chapter 4 - desktop.docx');
  console.log('  room ' + otp + '   web ' + webFile + '   desktop ' + deskFile);

  let browser; let app; const summary = {};
  try {
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 940 } });
    const web = await ctx.newPage();
    web.setDefaultTimeout(60000);
    await signIn(web, accts[0]);
    await openEditor(web, otp, webFile, 'Chapter 4 - web.docx');
    if (process.env.ONLY === 'desktop') console.log('  web skipped');
    else summary.web = await run(web, 'web');

    if (fs.existsSync(MAIN) && fs.existsSync(EXE)) {
      app = await electron.launch({
        executablePath: EXE, args: [MAIN], cwd: DESKTOP, timeout: 120000,
        env: { ...process.env, VITE_DEV_SERVER_URL: BASE + '/app/login', DOCUSYNC_WS_PORT: '9461' },
      });
      const desk = await app.firstWindow({ timeout: 120000 });
      desk.setDefaultTimeout(60000);
      await desk.waitForLoadState('domcontentloaded');
      await desk.waitForSelector('input[placeholder="Enter your username"]', { timeout: 60000 });
      await desk.waitForTimeout(1400);
      await desk.fill('input[placeholder="Enter your username"]', accts[1].email);
      await desk.fill('input[placeholder="Enter your password"]', accts[1].password);
      await desk.click('button:has-text("Log In")');
      await desk.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), null, { timeout: 40000 });
      await openEditor(desk, otp, deskFile, 'Chapter 4 - desktop.docx');
      summary.desktop = await run(desk, 'desktop');
    } else {
      console.log('');
      console.log('  desktop build not present -- skipped');
    }
  } finally {
    if (app) await app.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  console.log('');
  for (const k of Object.keys(summary)) {
    const v = summary[k];
    const sizeOk = v.rows === 4 && v.cols === 6;      // header + three body rows
    const ok = sizeOk && v.painted.length >= 2 && v.tables === 2 && v.r2 === 12 && v.c2 === 4;
    console.log('  ' + (ok ? 'OK   ' : 'CHECK') + '  ' + k + ': grid "' + v.label + '", ' +
      v.rows + 'x' + v.cols + ' placed, ' + v.painted.length + ' cells shaded, custom ' +
      v.r2 + 'x' + v.c2);
  }
  console.log('');
  console.log('  ' + shots.length + ' screenshots in ' + OUT);
  console.log('');
}

main().catch((e) => { console.error(e); process.exit(1); });
