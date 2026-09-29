/**
 * Finds interactive controls that do nothing.
 *
 * React attaches handlers at the root, so a listener is not visible on the
 * element itself — but the fiber's props are, via the `__reactProps$*` key.
 * A <button> whose props carry no onClick (and which is not a form submit,
 * and not disabled) cannot respond to a click at all. That is exactly how
 * "Edit Profile" and the admin approve controls were dead.
 *
 * Run: node scripts/qa-dead-controls.js
 */
const { chromium } = require('playwright');

const BASE = process.env.QA_BASE || 'http://localhost:3000';

const PAGES = [
  { path: '/home', auth: false },
  { path: '/download', auth: false },
  { path: '/app/login', auth: false },
  { path: '/app/peers', auth: true },
  { path: '/app/files', auth: true },
  { path: '/app/metrics', auth: true },
  { path: '/app/settings', auth: true },
  { path: '/app/admin/dashboard', auth: true },
];

const PROBE = () => {
  const out = [];
  const seen = new Set();
  const react = (el) => {
    const k = Object.keys(el).find(x => x.startsWith('__reactProps$'));
    return k ? el[k] : null;
  };
  for (const el of document.querySelectorAll('button, [role="button"], a')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;      // not rendered
    const label = (el.innerText || el.getAttribute('aria-label') || el.title || '').trim().replace(/\s+/g, ' ').slice(0, 48);
    if (!label) continue;
    const key = el.tagName + '|' + label;
    if (seen.has(key)) continue;
    seen.add(key);

    if (el.tagName === 'A') {
      const href = el.getAttribute('href');
      const p = react(el);
      if (!href && !p?.onClick) out.push({ kind: 'link', label, issue: 'no href and no onClick' });
      continue;
    }
    if (el.disabled) continue;                           // disabled on purpose
    const p = react(el);
    const isSubmit = el.getAttribute('type') === 'submit' || el.closest('form');
    if (!p) { out.push({ kind: 'button', label, issue: 'no react props found' }); continue; }
    if (!p.onClick && !isSubmit) out.push({ kind: 'button', label, issue: 'no onClick handler' });
  }
  return out;
};

async function login(page) {
  await page.goto(`${BASE}/app/login`);
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 20000 });
  await page.fill('input[placeholder="Enter your username"]', 'admin');
  await page.fill('input[placeholder="Enter your password"]', 'admin');
  await page.click('button:has-text("Log In")');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25000 });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  let total = 0;

  try {
    await login(page);

    for (const { path } of PAGES) {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500);   // let client rendering settle
      const dead = await page.evaluate(PROBE);
      const scanned = await page.evaluate(() =>
        document.querySelectorAll('button, [role="button"], a').length);
      if (dead.length === 0) {
        console.log(`OK    ${path.padEnd(24)} ${scanned} controls, none dead`);
      } else {
        total += dead.length;
        console.log(`DEAD  ${path.padEnd(24)} ${scanned} controls, ${dead.length} with no handler:`);
        dead.forEach(d => console.log(`        - [${d.kind}] "${d.label}"  (${d.issue})`));
      }
    }

    // Modal and panel contents only exist once opened, so probe a few by hand.
    console.log('\n--- controls behind interactions ---');
    const extras = [
      { path: '/app/peers', open: 'button:has-text("Create Room")', name: 'Create Room form' },
      { path: '/app/peers', open: 'button:has-text("Join Room")', name: 'Join Room form' },
      { path: '/app/settings', open: 'button:has-text("Edit Profile")', name: 'Edit Profile dialog' },
    ];
    for (const e of extras) {
      await page.goto(BASE + e.path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      try {
        await page.click(e.open, { timeout: 8000 });
        await page.waitForTimeout(1500);
        const dead = await page.evaluate(PROBE);
        if (dead.length === 0) console.log(`OK    ${e.name}: none dead`);
        else {
          total += dead.length;
          console.log(`DEAD  ${e.name}:`);
          dead.forEach(d => console.log(`        - [${d.kind}] "${d.label}"  (${d.issue})`));
        }
      } catch (err) {
        console.log(`SKIP  ${e.name}: could not open (${err.message.split('\n')[0]})`);
      }
    }

    console.log(total === 0 ? '\nNO DEAD CONTROLS FOUND' : `\n${total} CONTROL(S) WITH NO HANDLER`);
  } finally {
    await browser.close();
  }
})();
