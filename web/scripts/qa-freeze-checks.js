/**
 * BRANCH-FREEZE CHECKS — the remaining evidence boundaries.
 *
 *   R   restore after offline divergence. The one version/offline case the
 *       previous report left UNVERIFIED. This measures what actually happens
 *       rather than assuming snapshot replay is safe.
 *   F   file isolation of the global vector clock. One clock serves every
 *       file, so heavy editing of one file must not make another file look
 *       synchronised or cause one of its events to be skipped on catch-up.
 *   D   replay idempotency. Catch-up is triggered again after convergence;
 *       the event count must not move.
 *   H   imported-file history, including restoring its very first version.
 *   P   production default. With DOCUSYNC_LOCAL_UI absent the window must
 *       still load the hosted web app, unchanged by this branch.
 *
 * Run: node scripts/qa-freeze-checks.js
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

const results = [];
let group = '';
const phase = (n) => { group = n; console.log(`\n== ${n} ${'='.repeat(Math.max(0, 56 - n.length))}`); };
function check(ok, name, detail = '') {
  results.push({ group, name, ok, detail });
  console.log(`  ${ok === null ? 'INFO' : ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
  return ok;
}
const info = (name, detail) => check(null, name, detail);
const sha = (s) => crypto.createHash('sha256').update(s ?? '', 'utf8').digest('hex').slice(0, 16);
const L = (s) => String(s ?? '').split('\n');
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = { A: 9000, B: 9001, C: 9002 };
const IDX = { A: 0, B: 1, C: 2 };
const live = [];

async function launch(label, extraEnv = {}, login = true) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `frz-${label}-`));
  const app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: [MAIN, `--user-data-dir=${userData}`],
    cwd: DESKTOP_DIR,
    env: {
      ...process.env,
      DOCUSYNC_WS_PORT: String(PORT[label] ?? 9000),
      DOCUSYNC_NODE_INDEX: String(IDX[label] ?? 0),
      DOCUSYNC_NODE_COUNT: '4',
      ...extraEnv,
    },
    timeout: 60000,
  });
  const page = await app.firstWindow({ timeout: 45000 });
  const inst = { app, page, userData, label };
  live.push(inst);
  await page.waitForLoadState('domcontentloaded').catch(() => { });
  if (login) {
    await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 40000 });
    await page.fill('input[placeholder="Enter your username"]', U[label].email);
    await page.fill('input[placeholder="Enter your password"]', U[label].password);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !location.hash.includes('vault-login'), { timeout: 40000 });
  }
  return inst;
}

async function closeAll() {
  while (live.length) {
    const inst = live.pop();
    if (inst?.app) await inst.app.close().catch(() => { });
    if (inst?.userData) fs.rmSync(inst.userData, { recursive: true, force: true });
  }
}

const bounded = (p, label, ms = 30000) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} silent ${ms}ms`)), ms))])
    .catch((e) => ({ ok: false, content: null, err: e.message }));

const imp = (inst, name, content, id) => bounded(inst.page.evaluate(async (a) => {
  const r = await window.docuSync.importRoomFile(a.name, a.content, a.id);
  return { ok: !!r.success, fileId: r.data?.fileId ?? r.fileId };
}, { name, content, id }), `import ${inst.label}`);

const save = (inst, id, html) => bounded(inst.page.evaluate(async (a) => {
  const r = await window.docuSync.saveFile(a.id, a.html, null);
  return { ok: !!r.success, err: r.error || null };
}, { id, html }), `save ${inst.label}`);

const doc = (inst, id, names) => bounded(inst.page.evaluate(async (a) => {
  const r = await window.docuSync.openFile(a.id, a.name);
  return { ok: !!(r && r.success), content: (r.data && r.data.content) ?? null };
}, { id, name: names[inst.label] }), `open ${inst.label}`);

const hist = (inst, id) => bounded(inst.page.evaluate(async (i) => {
  const r = await window.docuSync.getHistory(i);
  const entries = ((r && r.data) || {}).entries || [];
  return {
    ok: !!(r && r.success),
    n: entries.length,
    types: entries.map((e) => e.eventType),
    ids: entries.map((e) => e.eventId),
    firsts: entries.map((e) => String(e.payload ?? '').split(String.fromCharCode(10))[0]),
    rebuilt: entries.every((e) => e.reconstructed !== false),
    entries: entries.map((e) => ({ eventId: e.eventId, type: e.eventType, payload: e.payload })),
  };
}, id), `history ${inst.label}`);

const restore = (inst, id, eventId) => bounded(inst.page.evaluate(async (a) => {
  const r = await window.docuSync.restoreVersion(a.id, a.eventId);
  return { ok: !!r.success, err: r.error || null };
}, { id, eventId }), `restore ${inst.label}`);

const connect = (inst, port) => inst.page.evaluate(async (p) => {
  const r = await window.docuSync.connectToPeer('127.0.0.1', p);
  return { ok: !!r.success, err: r.error || null };
}, port);

const triggerSync = (inst) => bounded(inst.page.evaluate(async () => {
  const r = await window.docuSync.triggerSync();
  return { ok: !!r.success, err: r.error || null };
}), `triggerSync ${inst.label}`);

let seq = 0;
async function seed(insts, base, tag) {
  const stamp = `${Date.now()}-${seq++}`;
  const names = {};
  let id;
  for (const inst of insts) {
    const n = `frz-${tag}-${stamp}-${inst.label}.txt`;
    names[inst.label] = n;
    const r = await imp(inst, n, base, id);
    if (id === undefined) id = r.fileId;
  }
  await settle(1200);
  return { id, names };
}

(async () => {
  console.log('DocuSync -- branch-freeze checks\n');
  try {
    // ════════════════════════════════════════════════════════════════════
    phase('P - production default must be unchanged');
    {
      // No DOCUSYNC_LOCAL_UI, no VITE_DEV_SERVER_URL: the window must load
      // the hosted web app, which is what a packaged build does today.
      const p = await launch('A', { DOCUSYNC_LOCAL_UI: '' }, false);
      await settle(4000);
      const url = p.page.url();
      check(url.startsWith('https://docusync-dusky.vercel.app'),
        'P1 without DOCUSYNC_LOCAL_UI the window loads the hosted web app', url.slice(0, 60));
      await closeAll();

      const q = await launch('A', { DOCUSYNC_LOCAL_UI: '1' }, false);
      await settle(3000);
      const url2 = q.page.url();
      check(/^file:\/\//.test(url2),
        'P2 with DOCUSYNC_LOCAL_UI=1 the window loads the local renderer', url2.slice(0, 40));
      await closeAll();
      info('P3 engine integration remains opt-in',
        'default start shows the hosted UI, which does not call window.docuSync');
    }

    // ════════════════════════════════════════════════════════════════════
    phase('H - imported file history and restoring its first version');
    {
      const A = await launch('A', { DOCUSYNC_LOCAL_UI: '1' });
      const ORIGINAL = 'H original one.\nH original two.\n';
      const f = await seed([A], ORIGINAL, 'imp');
      await save(A, f.id, 'H edited one.\nH original two.\n');
      await settle(2500);
      await save(A, f.id, 'H edited one.\nH edited two.\n');
      await settle(2500);

      const h = await hist(A, f.id);
      check(h.n === 3 && h.types[0] === 'restore',
        'H1 the imported file has a baseline entry followed by its edits',
        `${h.n} entries: ${h.types.join(',')}`);
      check(h.firsts[0] === 'H original one.',
        'H2 the first history entry holds real document content',
        `"${h.firsts[0]}"`);
      const looksB64 = /^[A-Za-z0-9+/=]{40,}$/.test(String(h.firsts[0]).trim());
      check(!looksB64, 'H3 the first entry is not raw transport data',
        looksB64 ? 'base64 payload' : 'readable text');
      check(h.rebuilt, 'H4 every version rebuilt from the log', h.types.join(','));

      const first = h.entries[0];
      const r = await restore(A, f.id, first.eventId);
      check(r.ok, 'H5 restoring the very first version succeeded', r.err || 'restored');
      await settle(2500);
      const after = (await doc(A, f.id, f.names)).content;
      check(sha(after) === sha(ORIGINAL),
        'H6 restoring the first version reproduced the imported document exactly',
        `${sha(after)} vs original ${sha(ORIGINAL)}`);
      await closeAll();
    }

    // ════════════════════════════════════════════════════════════════════
    phase('F - one global clock must not couple two files');
    {
      const A = await launch('A', { DOCUSYNC_LOCAL_UI: '1' });
      const B = await launch('B', { DOCUSYNC_LOCAL_UI: '1' });
      const both = [A, B];

      const base1 = 'F1 line one.\nF1 line two.\n';
      const base2 = 'F2 line one.\nF2 line two.\n';
      const f1 = await seed(both, base1, 'f1');
      const f2 = await seed(both, base2, 'f2');

      // A hammers file 1, inflating its global counter well past B's.
      for (let i = 1; i <= 6; i++) {
        await save(A, f1.id, `F1 line one. A${i}\nF1 line two.\n`);
      }
      // B touches only file 2, once.
      await save(B, f2.id, 'F2 line one.\nF2 line two. FROM-B.\n');
      await settle(2500);

      const c = await connect(B, PORT.A);
      check(c.ok, 'F0 link established', c.err || 'connected');
      await settle(16000);

      const a1 = (await doc(A, f1.id, f1.names)).content;
      const b1 = (await doc(B, f1.id, f1.names)).content;
      check(L(b1)[0] === 'F1 line one. A6' && sha(a1) === sha(b1),
        'F1 the heavily-edited file reached the other peer',
        `A="${L(a1)[0]}" B="${L(b1)[0]}"`);

      const a2 = (await doc(A, f2.id, f2.names)).content;
      const b2 = (await doc(B, f2.id, f2.names)).content;
      check(L(a2)[1] === 'F2 line two. FROM-B.' && sha(a2) === sha(b2),
        'F2 the other file’s single edit was NOT skipped despite the clock gap',
        `A="${L(a2)[1]}" B="${L(b2)[1]}"`);
      check(L(a2)[0] === 'F2 line one.' && L(a1)[1] === 'F1 line two.',
        'F3 neither file picked up the other’s content',
        `f1 line2="${L(a1)[1]}" f2 line1="${L(a2)[0]}"`);

      // ── D: replay idempotency on an already-converged pair ────────────
      phase('D - replaying catch-up must not duplicate anything');
      const beforeA = await hist(A, f1.id);
      const beforeB = await hist(B, f1.id);
      await triggerSync(A);
      await triggerSync(B);
      await settle(10000);
      await triggerSync(A);
      await settle(8000);
      const afterA = await hist(A, f1.id);
      const afterB = await hist(B, f1.id);
      check(afterA.n === beforeA.n && afterB.n === beforeB.n,
        'D1 event counts unchanged after replaying catch-up twice',
        `A ${beforeA.n}->${afterA.n} | B ${beforeB.n}->${afterB.n}`);
      check(afterA.ids.length === new Set(afterA.ids).size &&
        afterB.ids.length === new Set(afterB.ids).size,
        'D2 all event ids still unique',
        `A ${afterA.ids.length} unique ${new Set(afterA.ids).size}`);
      const a1b = (await doc(A, f1.id, f1.names)).content;
      const b1b = (await doc(B, f1.id, f1.names)).content;
      check(sha(a1b) === sha(a1) && sha(b1b) === sha(b1),
        'D3 the document was not modified again by the replay',
        `A ${sha(a1)}->${sha(a1b)} | B ${sha(b1)}->${sha(b1b)}`);
      await closeAll();
    }

    // ════════════════════════════════════════════════════════════════════
    phase('R - restore after offline divergence');
    {
      const A = await launch('A', { DOCUSYNC_LOCAL_UI: '1' });
      const B = await launch('B', { DOCUSYNC_LOCAL_UI: '1' });
      const both = [A, B];

      const V1 = 'R version one.\nR steady line.\n';
      const f = await seed(both, V1, 'rst');

      // Both move on independently, with no link between them.
      await save(A, f.id, 'R version two.\nR steady line.\n');
      await settle(2000);
      await save(B, f.id, 'R version one.\nR steady line. FROM-B.\n');
      await settle(2000);

      const hA = await hist(A, f.id);
      const v1Entry = hA.entries.find((e) => String(e.payload).startsWith('R version one.'));
      check(!!v1Entry, 'R1 A can identify its version one in history',
        v1Entry ? `${v1Entry.type}/${v1Entry.eventId.slice(0, 8)}` : hA.firsts.join(' | '));

      const rr = v1Entry ? await restore(A, f.id, v1Entry.eventId) : { ok: false, err: 'no entry' };
      check(rr.ok, 'R2 A restored version one while disconnected', rr.err || 'restored');
      await settle(2500);

      const aBefore = (await doc(A, f.id, f.names)).content;
      const bBefore = (await doc(B, f.id, f.names)).content;
      info('R3 state before reconnection',
        `A="${L(aBefore)[0]}"/"${L(aBefore)[1]}" (${sha(aBefore)}) | B="${L(bBefore)[0]}"/"${L(bBefore)[1]}" (${sha(bBefore)})`);

      const c = await connect(B, PORT.A);
      check(c.ok, 'R4 link established after the offline period', c.err || 'connected');
      await settle(18000);

      const aAfter = (await doc(A, f.id, f.names)).content;
      const bAfter = (await doc(B, f.id, f.names)).content;
      info('R5 state after reconnection',
        `A="${L(aAfter)[0]}"/"${L(aAfter)[1]}" (${sha(aAfter)}) | B="${L(bAfter)[0]}"/"${L(bAfter)[1]}" (${sha(bAfter)})`);

      const converged = sha(aAfter) === sha(bAfter);
      check(converged, 'R6 the two peers converged after an offline restore',
        converged ? sha(aAfter) : `A=${sha(aAfter)} B=${sha(bAfter)} (divergent)`);

      const bWorkKept = String(aAfter).includes('FROM-B.') && String(bAfter).includes('FROM-B.');
      check(bWorkKept, 'R7 B’s unrelated offline work survived the restore',
        `A has it=${String(aAfter).includes('FROM-B.')} B has it=${String(bAfter).includes('FROM-B.')}`);

      const restorePropagated = L(bAfter)[0] === 'R version one.';
      check(restorePropagated, 'R8 the restore reached the other peer',
        `B line 1 = "${L(bAfter)[0]}" (expected "R version one.")`);

      const hA2 = await hist(A, f.id);
      const hB2 = await hist(B, f.id);
      check(hA2.rebuilt && hB2.rebuilt, 'R9 both event logs still rebuild from the log',
        `A: ${hA2.types.join(',')} | B: ${hB2.types.join(',')}`);
      info('R10 event logs after the offline restore',
        `A(${hA2.n}): ${hA2.types.join(',')} | B(${hB2.n}): ${hB2.types.join(',')}`);
      await closeAll();
    }
  } catch (err) {
    check(false, 'freeze checks ran to completion', err.message?.split('\n')[0] || String(err));
  } finally {
    await closeAll();
    console.log('\n' + '='.repeat(64));
    const pass = results.filter((r) => r.ok === true).length;
    const fail = results.filter((r) => r.ok === false).length;
    const inf = results.filter((r) => r.ok === null).length;
    console.log(`  ${pass} passed, ${fail} failed, ${inf} informational`);
    if (fail) {
      console.log('\nFAILURES:');
      results.filter((r) => r.ok === false).forEach((f) => console.log(`  - [${f.group}] ${f.name}${f.detail ? ` -- ${f.detail}` : ''}`));
      process.exitCode = 1;
    }
    fs.writeFileSync(path.join(__dirname, 'qa-freeze-checks-results.json'), JSON.stringify(results, null, 2));
  }
})();
