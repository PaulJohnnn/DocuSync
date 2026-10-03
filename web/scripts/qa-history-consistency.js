/**
 * Probe: after a concurrent edit on different lines, does replaying each
 * instance's own event log reproduce the document that instance actually
 * holds?
 *
 * The line-granularity suite reads content from disk and reports both peers
 * agreeing. The older desktop suite reads the newest event-log entry and
 * reports them differing, with the same two hashes on every run. Both cannot
 * be right about the same instances, so this prints, per instance, the live
 * document and the log replay side by side, with every entry.
 *
 * Run: node scripts/qa-history-consistency.js
 */
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const DESKTOP_DIR = path.resolve(__dirname, '..', '..', 'desktop');
const MAIN = path.join(DESKTOP_DIR, 'dist-electron', 'main.js');
const ELECTRON_BIN = path.join(DESKTOP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe');
const accounts = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa-accounts.json'), 'utf8'));
const U = Object.fromEntries(accounts.map((a) => [a.id, a]));
const sha = (s) => crypto.createHash('sha256').update(s ?? '', 'utf8').digest('hex').slice(0, 16);

const instances = [];
async function launch(label, wsPort, nodeIndex, user) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `hist-${label}-`));
  const app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: [MAIN, `--user-data-dir=${userData}`],
    cwd: DESKTOP_DIR,
    env: {
      ...process.env,
      DOCUSYNC_LOCAL_UI: '1',
      DOCUSYNC_WS_PORT: String(wsPort),
      DOCUSYNC_NODE_INDEX: String(nodeIndex),
      DOCUSYNC_NODE_COUNT: '3',
    },
    timeout: 60000,
  });
  const page = await app.firstWindow({ timeout: 45000 });
  await page.waitForLoadState('domcontentloaded').catch(() => { });
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 40000 });
  await page.fill('input[placeholder="Enter your username"]', user.email);
  await page.fill('input[placeholder="Enter your password"]', user.password);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !location.hash.includes('vault-login'), { timeout: 40000 });
  const inst = { app, page, userData, label, wsPort, logs: [] };
  try {
    const proc = app.process();
    const keep = (d) => {
      for (const l of String(d).split(String.fromCharCode(10))) {
        const t = l.trim();
        if (t) inst.logs.push(t);
      }
    };
    proc.stdout?.on('data', (d) => keep(d.toString()));
    proc.stderr?.on('data', (d) => keep('[err] ' + d.toString()));
  } catch { }
  instances.push(inst);
  return inst;
}

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let A, B;
  try {
    A = await launch('A', 9000, 0, U.A);
    B = await launch('B', 9001, 1, U.B);
    await B.page.evaluate(() => window.docuSync.connectToPeer('127.0.0.1', 9000));
    await settle(3000);

    const base = 'H one.\nH two.\nH three.\n';
    const stamp = Date.now();
    const names = { A: `hist-${stamp}-A.txt`, B: `hist-${stamp}-B.txt` };
    let id;
    for (const inst of [A, B]) {
      const r = await inst.page.evaluate(async (a) => {
        const x = await window.docuSync.importRoomFile(a.name, a.content, a.id);
        return x.data?.fileId ?? x.fileId;
      }, { name: names[inst.label], content: base, id });
      if (id === undefined) id = r;
    }
    await settle(1500);

    // Warm-up: the older suite runs several sequential rounds before its
    // concurrent case, which changes the logical timestamps in play.
    await A.page.evaluate(async (a) => window.docuSync.saveFile(a.id, a.html, null),
      { id, html: base.replace('H two.', 'H two. W1-A.') });
    await settle(3000);
    await B.page.evaluate(async (a) => window.docuSync.saveFile(a.id, a.html, null),
      { id, html: base.replace('H two.', 'H two. W1-A.').replace('H three.', 'H three. W2-B.') });
    await settle(3000);

    const live0 = await B.page.evaluate(async (a) => {
      const r = await window.docuSync.openFile(a.id, a.name);
      return (r.data && r.data.content) ?? null;
    }, { id, name: names.B });

    await Promise.all([
      A.page.evaluate(async (a) => window.docuSync.saveFile(a.id, String(a.live).replace('H one.', 'H one. FROM-A.'), null),
        { id, live: live0 }),
      B.page.evaluate(async (a) => window.docuSync.saveFile(a.id, String(a.live).replace('H three. W2-B.', 'H three. FROM-B.'), null),
        { id, live: live0 }),
    ].map((pr) => pr));
    await settle(9000);

    for (const inst of [A, B]) {
      const live = await inst.page.evaluate(async (a) => {
        const r = await window.docuSync.openFile(a.id, a.name);
        return (r.data && r.data.content) ?? null;
      }, { id, name: names[inst.label] });

      const entries = await inst.page.evaluate(async (i) => {
        const r = await window.docuSync.getHistory(i);
        const d = (r && r.data) || {};
        return (d.entries || []).map((e) => ({
          type: e.eventType, node: String(e.nodeId).slice(0, 8),
          ts: e.logicalTimestamp, rebuilt: e.reconstructed, payload: e.payload,
        }));
      }, id);

      const replay = entries.length ? entries[entries.length - 1].payload : null;
      console.log(`\n=== instance ${inst.label} ===`);
      console.log(`  live on disk : ${sha(live)}  ${JSON.stringify(live)}`);
      console.log(`  log replay   : ${sha(replay)}  ${JSON.stringify(replay)}`);
      console.log(`  agree        : ${sha(live) === sha(replay)}`);
      console.log(`  entries:`);
      for (const e of entries) {
        console.log(`    ${e.type.padEnd(8)} node=${e.node} ts=${e.ts} rebuilt=${e.rebuilt} -> ${JSON.stringify(String(e.payload).slice(0, 70))}`);
      }
    }
    for (const inst of [A, B]) {
      console.log(`
-- ${inst.label} fold-check / save / delta lines --`);
      for (const l of inst.logs.filter((l) => /fold-check|file:save|DELTA_PUSH|merged line-wise|Applied delta|already-seen/.test(l))) {
        console.log(`    ${l}`);
      }
    }
  } catch (e) {
    console.log('PROBE ERROR: ' + (e.message || e));
  } finally {
    for (const inst of instances) {
      if (inst?.app) await inst.app.close().catch(() => { });
      if (inst?.userData) fs.rmSync(inst.userData, { recursive: true, force: true });
    }
  }
})();
