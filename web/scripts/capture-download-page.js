/**
 * Photographs the homepage download section and the download page.
 *
 * Both were revamped to drop the emoji and put the Windows build first,
 * so this takes a full-length picture of each at desktop and phone
 * widths, in light and dark, and reports any console error it sees --
 * a hydration mismatch is invisible in a screenshot but shows up there.
 *
 * Run: node scripts/capture-download-page.js [baseUrl] [outDir]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = process.argv[3] || path.join(__dirname, 'download-shots');

fs.mkdirSync(OUT, { recursive: true });

const VIEWS = [
  { tag: 'desktop', width: 1400, height: 1000, scheme: 'light' },
  { tag: 'desktop-dark', width: 1400, height: 1000, scheme: 'dark' },
  { tag: 'phone', width: 390, height: 844, scheme: 'light' },
];

const PAGES = [
  { tag: 'download', url: '/download', full: true },
  { tag: 'home-platforms', url: '/home#download', full: false },
];

async function main() {
  console.log('');
  console.log('Download pages -- ' + BASE);
  const browser = await chromium.launch();
  let problems = 0;

  try {
    for (const v of VIEWS) {
      const ctx = await browser.newContext({
        viewport: { width: v.width, height: v.height },
        colorScheme: v.scheme,
      });
      if (v.scheme === 'dark') {
        await ctx.addInitScript(() => {
          try { localStorage.setItem('docusync_theme', 'dark'); } catch (e) { /* ignore */ }
        });
      }
      for (const p of PAGES) {
        const page = await ctx.newPage();
        const errors = [];
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
        page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 120)));

        await page.goto(BASE + p.url, { waitUntil: 'networkidle' });
        // The homepage reveals its sections on scroll, so the platform
        // cards are invisible until they have been scrolled past.
        if (!p.full) {
          await page.evaluate(() => {
            const el = document.querySelector('#download');
            if (el) el.scrollIntoView({ block: 'start' });
          });
        }
        await page.waitForTimeout(1600);

        const theme = await page.evaluate(() => document.documentElement.className || '(none)');
        const wrong = theme !== v.scheme;
        const file = path.join(OUT, p.tag + '-' + v.tag + '.png');
        await page.screenshot({ path: file, fullPage: p.full });
        console.log('  shot  ' + path.basename(file) + '   theme=' + theme + (wrong ? '  <-- asked for ' + v.scheme : '') +
          (errors.length ? '   ' + errors.length + ' console error(s)' : ''));
        if (wrong) problems++;
        for (const e of errors) { problems++; console.log('        ! ' + e); }
        await page.close();
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  console.log('');
  console.log('  ' + (problems === 0 ? 'no console errors' : problems + ' console error(s)'));
  console.log('  screenshots in ' + OUT);
  console.log('');
}

main().catch((e) => { console.error(e); process.exit(1); });
