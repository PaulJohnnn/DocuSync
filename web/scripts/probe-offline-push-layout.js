/**
 * Reported: after an offline edit is pushed, the text overlaps the pages.
 *
 * The merge appends a banner marking where the offline work was added. Those
 * elements carried `margin: 40px 0` as an INLINE style. The pagination
 * measurement works out every page boundary from each block's height plus its
 * margin-BOTTOM, on the assumption that nothing has a top margin — globals.css
 * resets it. An inline margin-top beats that reset, so from the moment an
 * offline edit merged in, every boundary below it was computed from the wrong
 * origin and text ran across the page edge.
 *
 * Run: node scripts/probe-offline-push-layout.js [baseUrl]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;
const acct = JSON.parse(fs.readFileSync(path.join(__dirname, 'local-account.json'), 'utf8'))[0];
const FILE_ID = '353535';

const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok, name });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

(async () => {
  console.log(`target: ${BASE}\n`);
  const otp = String(100000 + Math.floor(Math.random() * 899999));

  // A document long enough to paginate, then the shape the offline merge
  // produces: a divider, a banner, and the recovered paragraphs.
  const body = Array.from({ length: 45 }, (_, i) =>
    `<p>Paragraph ${i + 1}: the quick brown fox jumps over the lazy dog, repeatedly, to fill the page.</p>`).join('');
  const merged = `<div data-margin="96">${body}`
    + `<hr class="offline-page-break" />`
    + `<h3 class="offline-edit-banner">[Offline edit merged in — by Paul]</h3>`
    + Array.from({ length: 20 }, (_, i) => `<p>Recovered offline paragraph ${i + 1}.</p>`).join('')
    + `</div>`;

  await fetch(`${API}/doc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp, fileId: FILE_ID, content: merged, authorNodeId: 'seed', seq: 1, committedAt: Date.now(), isSessionEnd: true }),
  });

  const browser = await chromium.launch();
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  p.setDefaultTimeout(45000);

  try {
    await p.goto(`${BASE}/app/login`, { waitUntil: 'networkidle' });
    await p.fill('input[placeholder="Enter your username"]', acct.email);
    await p.fill('input[placeholder="Enter your password"]', acct.password);
    await p.click('button:has-text("Log In")');
    await p.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'));
    await p.evaluate(({ otp, fileId }) => {
      const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
      const k = (n) => `ds_${u.id}_${n}`;
      localStorage.setItem(k('current_room'), JSON.stringify({ otp, name: 'Offline Layout' }));
      localStorage.setItem(k('files'), JSON.stringify([{ id: fileId, name: 'Long.docx' }]));
    }, { otp, fileId: FILE_ID });
    await p.goto(`${BASE}/app/editor/${FILE_ID}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.ProseMirror', { timeout: 45000 });
    await p.waitForTimeout(8000);

    const layout = await p.evaluate(() => {
      const pm = document.querySelector('.ProseMirror');
      const kids = Array.from(pm.children);
      const boxes = kids.map((el) => el.getBoundingClientRect());
      let overlaps = 0, worst = 0;
      for (let i = 1; i < boxes.length; i++) {
        const gap = boxes[i].top - boxes[i - 1].bottom;
        if (gap < -1) { overlaps++; worst = Math.min(worst, gap); }
      }
      // TipTap's schema strips class and style from parsed content, so the
      // merged-in banner arrives as a bare <hr> and <h3>. Found structurally.
      const hr = pm.querySelector('hr');
      const banner = Array.from(pm.querySelectorAll('h3'))
        .find((h) => /Offline edit merged in/i.test(h.textContent || '')) || null;
      const mt = (el) => el ? parseFloat(getComputedStyle(el).marginTop) || 0 : null;
      // A block sitting at a page boundary legitimately carries a large
      // margin-top — that IS the page break, applied by the pagination. To
      // read what the STYLESHEET gives an <hr>, measure one that has no push
      // on it, in a throwaway element inside the same editor styles.
      const probe = document.createElement('div');
      probe.className = 'tiptap';
      probe.style.cssText = 'position:absolute;visibility:hidden;left:-9999px';
      probe.innerHTML = '<p>x</p><hr><p>y</p>';
      document.body.appendChild(probe);
      const stylesheetHrMarginTop = parseFloat(getComputedStyle(probe.querySelector('hr')).marginTop) || 0;
      probe.remove();
      return {
        blocks: kids.length,
        overlaps,
        worst: Math.round(worst),
        pageBreaks: kids.filter((el) => parseFloat(getComputedStyle(el).marginTop || '0') > 40).length,
        bannerMarginTop: mt(banner),
        hrMarginTop: mt(hr),
        stylesheetHrMarginTop,
        bannerPresent: !!banner,
      };
    });

    console.log(`\n  blocks: ${layout.blocks}, page breaks: ${layout.pageBreaks}`);
    console.log(`  overlapping blocks: ${layout.overlaps}${layout.overlaps ? ` (worst ${layout.worst}px)` : ''}`);
    console.log(`  banner margin-top: ${layout.bannerMarginTop}px, divider margin-top: ${layout.hrMarginTop}px\n`);

    check(layout.bannerPresent, 'the offline banner is in the document');
    check(layout.overlaps === 0, 'no block overlaps the one above it',
      `${layout.overlaps} overlap(s)`);
    check(layout.pageBreaks > 0, 'the document is still paginated after the merge',
      `${layout.pageBreaks} page break(s)`);
    // The measurement assumes no top margin on anything; this is the check
    // that keeps the banner honest about that.
    // The measurement assumes the stylesheet gives no block a top margin.
    // <hr> was the one it missed, and the offline merge is the only path that
    // inserts one.
    check(layout.stylesheetHrMarginTop === 0,
      'the stylesheet gives a divider no top margin',
      `${layout.stylesheetHrMarginTop}px`);

    fs.mkdirSync(path.join(__dirname, 'ui-shots'), { recursive: true });
    await p.screenshot({ path: path.join(__dirname, 'ui-shots', 'offline-push-layout.png'), fullPage: false });
  } catch (err) {
    check(false, 'the offline-layout run completed', String(err.message || err).split('\n')[0]);
  } finally {
    await browser.close();
    const pass = results.filter((r) => r.ok).length;
    console.log(`\n  ${pass} passed, ${results.length - pass} failed`);
    if (results.length - pass) process.exitCode = 1;
  }
})();
