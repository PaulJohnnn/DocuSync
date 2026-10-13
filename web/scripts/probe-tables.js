/**
 * Tables: can you make one, does it sync, does it survive a download?
 *
 * The panel's point was that a table is part of a document's text. The
 * extensions were loaded all along, so a table pasted in from Word
 * rendered correctly -- but nothing in the interface could create one,
 * and every exporter flattened it. The parser walked block tags, found
 * the paragraph TipTap puts inside each cell, and emitted those as loose
 * paragraphs: the words came out, the rows and columns did not.
 *
 * So this checks the whole path rather than the markup alone: build a
 * table in the editor, confirm the other person sees it, confirm the
 * version history keeps it, then download all four formats and look for
 * a real table in each.
 *
 * Run: node scripts/probe-tables.js [baseUrl]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;
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

async function enterRoom(page, otp, fileId, name) {
  await page.evaluate(({ otp, fileId, name }) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    const k = (x) => `ds_${u.id}_${x}`;
    localStorage.setItem(k('current_room'), JSON.stringify({ otp, id: otp, name: 'Tables' }));
    localStorage.setItem(k('files'), JSON.stringify([{ id: String(fileId), name }]));
  }, { otp, fileId, name });
}

async function main() {
  console.log(`\nTables -- ${BASE}\n`);

  const HOST = 'tbl-' + Date.now();
  const room = await post('/create', {
    hostNodeId: HOST, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Tables', hostType: 'web',
  });
  const otp = room.data?.otp;
  const shared = await post('/files', {
    otp, file: { fileId: Date.now(), fileName: 'Chapter 4.docx', content: '<p>Table 1. Respondents.</p>', sharedBy: 's', sharedByNodeId: HOST },
  });
  const fileId = shared.data?.fileId;
  console.log(`  room ${otp}  fileId ${fileId}\n`);

  const browser = await chromium.launch();
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-tables-'));

  try {
    const ctxA = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
    const a = await ctxA.newPage();
    const ctxB = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const b = await ctxB.newPage();
    a.setDefaultTimeout(60000); b.setDefaultTimeout(60000);

    await signIn(a, accts[0]);
    await signIn(b, accts[1]);
    await enterRoom(a, otp, fileId, 'Chapter 4.docx');
    await enterRoom(b, otp, fileId, 'Chapter 4.docx');

    await a.goto(`${BASE}/app/editor/${fileId}`, { waitUntil: 'domcontentloaded' });
    await a.waitForSelector('.ProseMirror', { timeout: 60000 });
    await a.waitForTimeout(1500);

    // ── Creating one ─────────────────────────────────────────────────
    console.log('  Creating a table');
    const before = await a.locator('.ProseMirror table').count();
    check(before === 0, 'the document starts with no table');

    // The toolbar button, not a scripted insert -- the complaint was that
    // the interface offered no way to do this.
    const buttons = a.locator('.ProseMirror').first();
    await buttons.click();
    await a.keyboard.press('Control+End');
    const tableBtn = a.locator('button:has(svg.lucide-table)').first();
    const hasBtn = await tableBtn.count();
    check(hasBtn > 0, 'the toolbar offers a table button');
    if (hasBtn) await tableBtn.click();
    await a.waitForTimeout(600);

    // The author picks the size, the way every word processor does it --
    // a 3x3 that could not be chosen is not really "inserting a table".
    const picker = a.locator('button[aria-label="3 by 3"]');
    check(await picker.count() > 0, 'a size grid appears to choose rows and columns');
    await picker.first().click();
    await a.waitForTimeout(900);

    const tables = await a.locator('.ProseMirror table').count();
    check(tables === 1, 'choosing a size inserts that table', `${tables} table(s)`);
    const headerCells = await a.locator('.ProseMirror table th').count();
    const bodyCells = await a.locator('.ProseMirror table td').count();
    check(headerCells === 3, 'with a header row', `${headerCells} header cells`);
    check(bodyCells === 6, 'and two body rows of three', `${bodyCells} body cells`);

    // ── Typing into it ───────────────────────────────────────────────
    console.log('');
    console.log('  Filling it in');
    const cellText = ['Year', 'Respondents', 'Percent', '2024', '30', '48%', '2025', '33', '52%'];
    const cells = a.locator('.ProseMirror table th, .ProseMirror table td');
    for (let i = 0; i < cellText.length; i++) {
      await cells.nth(i).click();
      await a.keyboard.type(cellText[i], { delay: 12 });
    }
    await a.waitForTimeout(2500);
    const shown = await a.locator('.ProseMirror table').first().innerText();
    check(/Year/.test(shown) && /Respondents/.test(shown) && /52%/.test(shown),
      'every cell holds what was typed into it');

    // ── Shading ──────────────────────────────────────────────────────
    //
    // Colour has to live in the document's own markup, not in the
    // editor's head: anything else is lost the moment the text syncs,
    // is written to the history, or is downloaded.
    console.log('');
    console.log('  Shading a cell');
    await a.locator('.ProseMirror table th').first().click();
    await a.waitForTimeout(400);
    const bucket = a.locator('button:has(svg.lucide-paint-bucket)').first();
    check(await bucket.count() > 0, 'a shading control appears inside a table');
    await bucket.click();
    await a.waitForTimeout(400);
    const swatch = a.locator('button[title="Blue"]').first();
    check(await swatch.count() > 0, 'it offers colours to choose from');
    await swatch.click();
    await a.waitForTimeout(2200);

    const shaded = await a.evaluate(() => {
      const cell = document.querySelector('.ProseMirror table th');
      if (!cell) return null;
      return {
        attr: cell.getAttribute('data-bg'),
        style: cell.style ? cell.style.backgroundColor : '',
      };
    });
    check(!!shaded && !!shaded.attr, 'the colour is written into the cell itself',
      shaded ? `data-bg=${shaded.attr}` : 'no cell');
    check(!!shaded && !!shaded.style, 'and renders on screen', shaded ? shaded.style : '');

    // ── A size the grid cannot reach ─────────────────────────────────
    console.log('');
    console.log('  A larger table than the grid offers');
    await a.locator('.ProseMirror').click();
    await a.keyboard.press('Control+End');
    await a.keyboard.press('Enter');
    await a.locator('button:has(svg.lucide-table)').first().click();
    await a.waitForTimeout(500);
    // Typed into the panel's own boxes. A native window.prompt was the
    // first attempt and it is dead on the desktop app -- Electron
    // refuses prompt() -- so the size is asked for in the page.
    await a.locator('text=More rows and columns').first().click();
    await a.waitForTimeout(300);
    await a.fill('input[aria-label="Rows"]', '4');
    await a.fill('input[aria-label="Columns"]', '6');
    await a.locator('button:has-text("Insert")').first().click();
    await a.waitForTimeout(1200);
    const tableCount = await a.locator('.ProseMirror table').count();
    check(tableCount === 2, 'a custom size can be typed in', `${tableCount} tables`);
    if (tableCount === 2) {
      const second = a.locator('.ProseMirror table').nth(1);
      const rows = await second.locator('tr').count();
      const cols = await second.locator('tr').first().locator('th,td').count();
      check(rows === 4 && cols === 6, 'and it is the size that was asked for', `${rows} x ${cols}`);
    }

    // ── Does the other person see it ─────────────────────────────────
    console.log('');
    console.log('  The other person');
    await b.goto(`${BASE}/app/editor/${fileId}`, { waitUntil: 'domcontentloaded' });
    await b.waitForSelector('.ProseMirror', { timeout: 60000 });
    let seen = null;
    for (let t = 0; t < 60; t++) {
      if (await b.locator('.ProseMirror table').count() > 0) { seen = t * 500; break; }
      await b.waitForTimeout(500);
    }
    check(seen !== null, 'the table reaches the other person', seen !== null ? `${seen}ms` : 'never');
    if (seen !== null) {
      const theirs = await b.locator('.ProseMirror table').first().innerText();
      check(/Respondents/.test(theirs) && /52%/.test(theirs),
        'with its contents, not an empty grid');
      // Read after the second table has had time to arrive too, so the
      // count is of a settled document rather than one mid-sync.
      await b.waitForTimeout(2500);
      const theirTables = await b.locator('.ProseMirror table').count();
      const theirHeaders = await b.locator('.ProseMirror table').first().locator('th').count();
      const stored = String((await get(`/doc?otp=${otp}&fileId=${fileId}`)).data?.snapshot?.content || '');
      const storedTables = (stored.match(/<table/g) || []).length;
      check(theirHeaders === 3, 'and its header row intact',
        `${theirHeaders} header cells, ${theirTables} tables on screen, ${storedTables} stored`);
    }

    // ── Is it in the stored document and the history ─────────────────
    console.log('');
    console.log('  Stored and versioned');
    const snap = String((await get(`/doc?otp=${otp}&fileId=${fileId}`)).data?.snapshot?.content || '');
    check(/<table/i.test(snap), 'the stored document holds a real table element');
    check(/<th/i.test(snap) && /<td/i.test(snap), 'with header and body cells');
    // Save explicitly first. History records save points, not keystrokes,
    // so checking it mid-typing asks whether an unsaved document is in the
    // log -- which it should not be. A person building a table presses
    // Done when they are finished, and that is the moment that must keep
    // it.
    const done = a.locator('button:has-text("Done")').first();
    if (await done.count()) {
      await done.click();
      await a.waitForTimeout(3000);
    }
    const rows = (await get(`/history?otp=${otp}&fileId=${fileId}`)).data?.data?.entries ?? [];
    check(rows.some((e) => /<table/i.test(String(e.fullContent || ''))),
      'a version in the history contains the table, so it can be restored');

    // ── Downloading it ───────────────────────────────────────────────
    console.log('');
    console.log('  Downloading, in every format');
    await a.goto(`${BASE}/app/files`, { waitUntil: 'domcontentloaded' });
    await a.waitForTimeout(2500);

    const grab = async (label) => {
      const menu = a.locator('button[aria-expanded]').first();
      await menu.click();
      await a.waitForTimeout(400);
      const [dl] = await Promise.all([
        a.waitForEvent('download', { timeout: 30000 }),
        a.locator(`text=${label}`).first().click(),
      ]);
      const to = path.join(downloads, dl.suggestedFilename());
      await dl.saveAs(to);
      return to;
    };

    for (const [label, ext, test] of [
      ['Plain text', 'txt', (t) => /Year/.test(t) && /Respondents/.test(t) && /2025/.test(t)],
      ['Markdown', 'md', (t) => /\|\s*Year\s*\|/.test(t) && /\|\s*---/.test(t)],
      ['Web page', 'html', (t) => /<table/i.test(t) && /<th>/i.test(t)],
    ]) {
      try {
        const file = await grab(label);
        const body = fs.readFileSync(file, 'utf8');
        if (ext === 'html') {
          check(/background-color\s*:/i.test(body), 'the html download keeps the shading');
        }
        check(test(body), `the ${ext} download contains the table`,
          test(body) ? '' : `"${body.replace(/\s+/g, ' ').slice(0, 70)}"`);
      } catch (e) {
        check(false, `the ${ext} download contains the table`, String(e).slice(0, 70));
      }
    }

    // .docx is a ZIP, so the table is checked in the unpacked XML.
    try {
      const file = await grab('Word document');
      const buf = fs.readFileSync(file);
      // The document part is stored uncompressed by this writer, so the
      // markup is readable straight out of the container.
      const raw = buf.toString('latin1');
      check(/<w:tbl>/.test(raw), 'the docx download contains a real Word table');
      check(/<w:shd[^>]*w:fill="D0EBFF"/i.test(raw),
        'and the cell shading, as a Word fill');
      check(/<w:tblBorders>/.test(raw), 'with borders, so it is visible when opened');
      check(/Respondents/.test(raw), 'and the cell text');
    } catch (e) {
      check(false, 'the docx download contains a real Word table', String(e).slice(0, 70));
    }

  } catch (err) {
    check(false, 'the table run completed', String(err).slice(0, 170));
  } finally {
    try { await browser.close(); } catch {}
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('crashed:', e); process.exit(1); });
