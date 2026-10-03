/**
 * Captures the public pages at real desktop width for UI review.
 *
 * The in-app browser pane is narrower than a laptop, so it renders the
 * responsive single-column layout and cannot show whether the three-column
 * download grid balances. This drives headless Chromium at 1440px instead.
 *
 * Run: node scripts/ui-shots.js [baseUrl] [outDir]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = process.argv[3] || path.join(__dirname, 'ui-shots');

const PAGES = [
  { name: 'home', url: '/home', full: true },
  { name: 'download', url: '/download', full: true },
  { name: 'login', url: '/app/login', full: false },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));

  for (const p of PAGES) {
    await page.goto(BASE + p.url, { waitUntil: 'networkidle' }).catch(() => { });
    // The dev server aborts in-flight CSS during HMR churn, which produces an
    // unstyled capture that looks like a layout bug. Reload until the sheet
    // has actually applied before judging anything visual.
    for (let attempt = 0; attempt < 3; attempt++) {
      const styled = await page.evaluate(() =>
        getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)').catch(() => false);
      if (styled) break;
      await page.reload({ waitUntil: 'networkidle' }).catch(() => { });
      await page.waitForTimeout(800);
    }
    // Scroll through so IntersectionObserver reveals every section.
    await page.evaluate(async () => {
      await new Promise((res) => {
        let y = 0;
        const step = () => {
          y += window.innerHeight * 0.8;
          window.scrollTo(0, y);
          if (y < document.body.scrollHeight) setTimeout(step, 120);
          else { window.scrollTo(0, 0); setTimeout(res, 400); }
        };
        step();
      });
    }).catch(() => { });
    await page.waitForTimeout(600);
    const file = path.join(OUT, `${p.name}.png`);
    await page.screenshot({ path: file, fullPage: p.full });
    const h = await page.evaluate(() => document.body.scrollHeight);
    console.log(`  ${p.name.padEnd(10)} ${BASE + p.url}  (${h}px tall)  -> ${path.basename(file)}`);

    // Report any image that failed to load or rendered at zero size.
    const badImages = await page.evaluate(() =>
      Array.from(document.images)
        .filter((i) => !i.complete || i.naturalWidth === 0)
        .map((i) => i.currentSrc || i.src));
    for (const b of badImages) problems.push(`${p.name}: broken image ${b}`);
  }

  await browser.close();
  console.log(problems.length ? '\nISSUES:' : '\nno console errors, no broken images');
  for (const p of [...new Set(problems)]) console.log('  - ' + p);
})();
