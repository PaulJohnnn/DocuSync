/**
 * Does a file that goes into DocuSync come back out as the same file?
 *
 * Driven through the real UI — the real picker, the real upload handler, the
 * real room — because the question is about the product, not about a helper
 * function. Every file is hashed before it goes in and after it is stored,
 * and the two hashes are compared. Nothing here compares filenames,
 * extensions or sizes: a file can carry the right name and the right length
 * and still be ruined.
 *
 * Run: node scripts/qa-file-integrity.js [baseUrl] [fixtureDir]
 */
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:3000';
const FIXTURES = process.argv[3] || path.join(__dirname, 'fixtures');

const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'manifest.json'), 'utf8'));
const acct = JSON.parse(fs.readFileSync(path.join(__dirname, 'local-account.json'), 'utf8'))[0];

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** What the leading bytes say the file actually is, whatever it is named. */
function sniff(buf) {
  if (buf.length >= 4) {
    const b = buf;
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
    if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5)) return 'zip/ooxml';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  }
  // Round-trips through UTF-8 unchanged and holds no NUL: it is text.
  if (!buf.includes(0) && Buffer.compare(Buffer.from(buf.toString('utf8'), 'utf8'), buf) === 0) return 'text';
  return 'binary';
}

const rows = [];

(async () => {
  console.log(`target: ${BASE}`);
  console.log(`fixtures: ${FIXTURES}\n`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);

  const notices = [];
  page.on('dialog', async (d) => { notices.push(d.message()); await d.dismiss().catch(() => {}); });

  await page.goto(`${BASE}/app/login`, { waitUntil: 'networkidle' });
  await page.fill('input[placeholder="Enter your username"]', acct.email);
  await page.fill('input[placeholder="Enter your password"]', acct.password);
  await page.click('button:has-text("Log In")');
  await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'));

  // A room to share into, created the way a user creates one.
  await page.goto(`${BASE}/app/peers`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.click('button:has-text("Create Room")');
  await page.waitForTimeout(600);
  await page.fill('input[placeholder*="Thesis Project"]', 'File Integrity');
  await page.click('button:has-text("Generate Room")');
  await page.waitForSelector('text=INVITE CODE', { timeout: 45000 });
  await page.click('text=Enter Workspace');
  await page.waitForTimeout(1500);

  await page.goto(`${BASE}/app/files`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  for (const fixture of manifest) {
    const srcPath = path.join(FIXTURES, fixture.name);
    const original = fs.readFileSync(srcPath);
    const row = {
      file: fixture.name,
      inBytes: original.length,
      inHash: fixture.sha256,
      inType: sniff(original),
      accepted: false,
      outBytes: null,
      outHash: null,
      outType: null,
      note: '',
    };

    notices.length = 0;
    await page.click('button:has-text("Understood")').catch(() => {});
    try {
      // The handler builds a hidden <input type=file> on click and clicks it
      // itself. The file is handed to that element directly, which runs the
      // application's own onchange — the real upload path — without needing
      // the OS picker.
      await page.waitForSelector('button:has-text("Upload file")', { timeout: 30000 });
      await page.click('button:has-text("Upload file")');
      const input = await page.waitForSelector('input[type=file]', { state: 'attached', timeout: 15000 });
      await input.setInputFiles(srcPath);
      await page.waitForTimeout(3000);

      // Read the refusal the application actually showed, rather than
      // pattern-matching for wording a future change would break.
      const shown = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button'))
          .find((b) => /Understood/i.test(b.textContent || ''));
        if (!btn) return null;
        const modal = btn.closest('div')?.parentElement;
        return (modal?.innerText || '').replace(/\s+/g, ' ').trim();
      });

      // Whether it is actually in this device's own file record is the
      // question, not whether its name appears somewhere on the page. The
      // record lives in IndexedDB, which is where the application reads it
      // back from when the file is reopened.
      const stored = await page.evaluate((name) => new Promise((resolve) => {
        const req = indexedDB.open('DocuSyncDB', 1);
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          try {
            const db = req.result;
            const all = db.transaction('files', 'readonly').objectStore('files').getAll();
            all.onsuccess = () => {
              const f = (all.result || []).find((x) => x.name === name);
              resolve(f ? { content: f.content, type: f.type, size: f.size } : null);
            };
            all.onerror = () => resolve(null);
          } catch { resolve(null); }
        };
      }), fixture.name);

      if (!stored) {
        row.accepted = false;
        const reason = shown || notices[0] || '';
        row.note = reason
          ? `refused: ${reason.replace(/^.*?cannot be processed\.?\s*/i, '').slice(0, 68)}`
          : 'not stored, and no reason was shown';
        rows.push(row);
        // Clear the rejection notice, or it covers the Upload button and
        // every later file reports a click timeout instead of its result.
        await page.click('button:has-text("Understood")').catch(() => {});
        await page.waitForTimeout(600);
        continue;
      }

      row.accepted = true;
      // The record holds a JavaScript string. Measured as the bytes it
      // would be written back to disk as.
      const storedBuf = Buffer.from(stored.content ?? '', 'utf8');
      row.outBytes = storedBuf.length;
      row.outHash = sha(storedBuf);
      row.outType = sniff(storedBuf);
      row.note = row.outHash === row.inHash
        ? 'bytes preserved'
        : 'accepted, but what was stored is not the file';
    } catch (err) {
      row.note = `error: ${String(err.message || err).split('\n')[0]}`;
    }
    rows.push(row);
  }

  await browser.close();

  const pad = (s, n) => String(s ?? '').padEnd(n);
  console.log(pad('FILE', 15) + pad('IN', 7) + pad('IS', 11) + pad('ACCEPTED', 10)
    + pad('STORED', 8) + pad('IS', 11) + pad('SHA-256', 9) + 'NOTE');
  console.log('-'.repeat(112));
  let preserved = 0, altered = 0, refused = 0;
  for (const r of rows) {
    const match = r.outHash ? (r.outHash === r.inHash ? 'MATCH' : 'DIFFERS') : '-';
    if (!r.accepted) refused++;
    else if (match === 'MATCH') preserved++;
    else altered++;
    console.log(pad(r.file, 15) + pad(r.inBytes, 7) + pad(r.inType, 11) + pad(r.accepted ? 'yes' : 'NO', 10)
      + pad(r.outBytes ?? '-', 8) + pad(r.outType ?? '-', 11) + pad(match, 9) + r.note);
  }
  console.log('-'.repeat(112));
  console.log(`  ${preserved} preserved byte-for-byte, ${altered} accepted but altered, ${refused} refused at upload`);

  fs.writeFileSync(path.join(__dirname, 'file-integrity-results.json'), JSON.stringify(rows, null, 2));
})();
