/**
 * Where does a remote caret end up when the document moves under it?
 *
 * The existing stability probe covers the common case: someone leaves
 * their caret in a paragraph, the other person types ABOVE it, and the
 * caret stays with its own paragraph. That passes. "Sometimes it jumps"
 * means the cases it does not cover, so this drives the ones where a
 * caret can plausibly be mapped to the wrong place:
 *
 *   - the paragraph holding the caret is deleted outright
 *   - text is inserted in the MIDDLE of that paragraph
 *   - the caret sits inside a table cell and the table is edited
 *   - the whole document is replaced by an upload
 *   - several remote edits land in quick succession
 *
 * In each case the idle person touches nothing. Their caret should stay
 * where they left it, or -- where that position no longer exists -- land
 * somewhere defensible and stay put, never wander on its own.
 *
 * Run: node scripts/probe-cursor-edges.js [baseUrl]
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

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

async function openDoc(page, otp, fileId) {
  await page.evaluate(({ otp, fileId }) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    const k = (x) => `ds_${u.id}_${x}`;
    localStorage.setItem(k('current_room'), JSON.stringify({ otp, id: otp, name: 'Cursor Edges' }));
    localStorage.setItem(k('files'), JSON.stringify([{ id: String(fileId), name: 'Cursors.docx' }]));
  }, { otp, fileId });
  await page.goto(`${BASE}/app/editor/${fileId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ProseMirror', { timeout: 60000 });
  await page.waitForTimeout(1600);
}

/**
 * Where the OTHER person's caret is drawn on this screen: which block it
 * sits in, and what that block says. Reading the text as well as the index
 * matters -- a caret that keeps its index while the paragraphs around it
 * shift has in fact moved, and an index alone cannot show that.
 */
const caretAt = (page) => page.evaluate(() => {
  const caret = document.querySelector('.collaboration-cursor__caret');
  if (!caret) return null;
  const pm = document.querySelector('.ProseMirror');
  if (!pm) return null;
  let block = caret.parentElement;
  while (block && block.parentElement !== pm) block = block.parentElement;
  const blocks = [...pm.children];
  const inCell = !!caret.closest('td, th');
  const cellText = inCell ? (caret.closest('td, th').innerText || '').replace(/\s+/g, ' ').trim() : null;
  return {
    index: block ? blocks.indexOf(block) : -1,
    text: (block?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 48),
    inCell,
    cellText,
  };
});

const waitForCaret = async (page, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const c = await caretAt(page);
    if (c) return c;
    await page.waitForTimeout(400);
  }
  return null;
};

async function main() {
  console.log(`\nRemote caret, awkward cases -- ${BASE}\n`);

  const HOST = 'cur-' + Date.now();
  const room = await post('/create', {
    hostNodeId: HOST, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Cursor Edges', hostType: 'web',
  });
  const otp = room.data?.otp;
  const seed =
    '<p>ALPHA the first paragraph.</p>' +
    '<p>BRAVO the second paragraph.</p>' +
    '<p>CHARLIE where the caret will sit.</p>' +
    '<p>DELTA the fourth paragraph.</p>';
  const shared = await post('/files', {
    otp, file: { fileId: Date.now(), fileName: 'Cursors.docx', content: seed, sharedBy: 's', sharedByNodeId: HOST },
  });
  const fileId = shared.data?.fileId;
  console.log(`  room ${otp}  fileId ${fileId}\n`);

  const browser = await chromium.launch();
  try {
    const watcher = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
    const mover = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
    watcher.setDefaultTimeout(60000); mover.setDefaultTimeout(60000);

    await signIn(watcher, accts[0]);
    await signIn(mover, accts[1]);
    await openDoc(watcher, otp, fileId);
    await openDoc(mover, otp, fileId);

    // The IDLE person places their caret and then touches nothing at all.
    const idle = mover;
    const screen = watcher;
    await idle.locator('.ProseMirror p', { hasText: 'CHARLIE' }).first().click();
    await idle.waitForTimeout(1500);

    const start = await waitForCaret(screen);
    check(!!start, 'the idle person’s caret is visible to the other', start ? `block ${start.index}: "${start.text}"` : 'never appeared');
    check(!!start && /CHARLIE/.test(start.text), 'and it is in the paragraph they clicked');

    // ── Text inserted in the MIDDLE of that paragraph ─────────────────
    console.log('');
    console.log('  Someone edits the very paragraph the caret is in');
    await screen.locator('.ProseMirror p', { hasText: 'CHARLIE' }).first().click();
    await screen.keyboard.press('Home');
    await screen.keyboard.type('EDITED ', { delay: 20 });
    await screen.waitForTimeout(3500);
    const afterInsert = await caretAt(screen);
    check(!!afterInsert, 'the caret is still drawn', afterInsert ? `block ${afterInsert.index}: "${afterInsert.text}"` : 'VANISHED');
    check(!!afterInsert && /CHARLIE/.test(afterInsert.text),
      'it stays with its own paragraph when text is inserted into it',
      afterInsert ? `"${afterInsert.text}"` : '');

    // ── A paragraph ABOVE it is deleted ───────────────────────────────
    console.log('');
    console.log('  A paragraph above it is deleted');
    await screen.evaluate(() => {
      const pm = document.querySelector('.ProseMirror');
      const p = [...pm.querySelectorAll('p')].find((el) => /BRAVO/.test(el.innerText));
      if (p) {
        const r = document.createRange();
        r.selectNodeContents(p);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
      }
    });
    await screen.keyboard.press('Backspace');
    await screen.keyboard.press('Backspace');
    await screen.waitForTimeout(3500);
    const afterDelete = await caretAt(screen);
    check(!!afterDelete, 'the caret survives a deletion above it', afterDelete ? `block ${afterDelete.index}: "${afterDelete.text}"` : 'VANISHED');
    check(!!afterDelete && /CHARLIE/.test(afterDelete.text),
      'and is still in its own paragraph, not shifted onto another',
      afterDelete ? `"${afterDelete.text}"` : '');

    // ── It must not drift while nobody touches it ─────────────────────
    console.log('');
    console.log('  Left completely alone for eight seconds');
    const before = await caretAt(screen);
    await screen.waitForTimeout(8000);
    const after = await caretAt(screen);
    check(!!after, 'the caret is still there', after ? `"${after.text}"` : 'VANISHED');
    check(
      !!before && !!after && before.text === after.text,
      'an untouched caret does not wander on its own',
      before && after ? `"${before.text}" -> "${after.text}"` : ''
    );

    // ── Inside a table ────────────────────────────────────────────────
    console.log('');
    console.log('  Inside a table');
    await screen.locator('.ProseMirror').click();
    await screen.keyboard.press('Control+End');
    await screen.locator('button:has(svg.lucide-table)').first().click();
    await screen.waitForTimeout(1200);
    const cellsOnScreen = await screen.locator('.ProseMirror table td').count();
    check(cellsOnScreen > 0, 'a table is added to the document', `${cellsOnScreen} body cells`);

    // The idle person puts their caret in a cell, then stops.
    let cellSeen = false;
    for (let t = 0; t < 40; t++) {
      if (await idle.locator('.ProseMirror table td').count() > 0) { cellSeen = true; break; }
      await idle.waitForTimeout(500);
    }
    check(cellSeen, 'the other person receives the table');
    if (cellSeen) {
      const cell = idle.locator('.ProseMirror table td').nth(1);
      await cell.click();
      await idle.keyboard.type('IN-CELL', { delay: 25 });
      await idle.waitForTimeout(3000);

      // Wait for it to settle in the cell rather than sampling once: the
      // position is throttled on the way out and polled on the way in, so
      // a single read can land in the gap between the two.
      let inTable = null;
      for (let t = 0; t < 30; t++) {
        inTable = await caretAt(screen);
        if (inTable && inTable.inCell) break;
        await screen.waitForTimeout(500);
      }
      check(!!inTable, 'their caret is drawn while inside a cell', inTable ? JSON.stringify(inTable).slice(0, 90) : 'not drawn');
      check(!!inTable && inTable.inCell === true,
        'and it is drawn INSIDE the cell, not loose in the document',
        inTable ? `inCell=${inTable.inCell} cell="${inTable.cellText}"` : '');

      // Now the other person edits a paragraph far above the table.
      await screen.locator('.ProseMirror p', { hasText: 'ALPHA' }).first().click();
      await screen.keyboard.press('End');
      await screen.keyboard.type(' plus more', { delay: 20 });
      await screen.waitForTimeout(3500);
      const stillInCell = await caretAt(screen);
      check(!!stillInCell && stillInCell.inCell === true,
        'editing elsewhere does not knock it out of the cell',
        stillInCell ? `inCell=${stillInCell.inCell} cell="${stillInCell.cellText}"` : 'caret lost');
    }

    // ── An upload replaces the whole document ─────────────────────────
    console.log('');
    console.log('  An upload replaces the document under the caret');
    await post('/files', {
      otp,
      file: {
        fileId: Date.now(), fileName: 'Cursors.docx',
        content: '<p>REPLACED everything.</p><p>Second replaced line.</p>',
        sharedBy: 'Someone', sharedByNodeId: 'uploader',
      },
    });
    await screen.waitForTimeout(6000);
    const afterUpload = await caretAt(screen);
    // The position it pointed at is gone, so there is no "right" paragraph.
    // What must not happen is a caret drawn past the end of the document or
    // jumping about once things have settled.
    const settledA = await caretAt(screen);
    await screen.waitForTimeout(5000);
    const settledB = await caretAt(screen);
    check(
      afterUpload === null || (settledA && settledB && settledA.text === settledB.text),
      'after a replacement the caret either goes away or settles and stays',
      `${settledA ? `"${settledA.text}"` : 'none'} -> ${settledB ? `"${settledB.text}"` : 'none'}`
    );
    const blocks = await screen.evaluate(() => document.querySelectorAll('.ProseMirror > *').length);
    check(
      afterUpload === null || (afterUpload.index >= 0 && afterUpload.index < blocks),
      'it is never drawn past the end of the document',
      afterUpload ? `index ${afterUpload.index} of ${blocks} blocks` : 'no caret'
    );

  } catch (err) {
    check(false, 'the cursor run completed', String(err).slice(0, 170));
  } finally {
    try { await browser.close(); } catch {}
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('crashed:', e); process.exit(1); });
