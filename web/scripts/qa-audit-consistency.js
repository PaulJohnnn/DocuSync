/**
 * MERGE-READINESS AUDIT — the gaps the line-granularity suite does not cover.
 *
 *   O1..O3  offline line-level behaviour: both peers diverge while no peer
 *           link exists, then reconnect. The existing offline tests only ever
 *           had ONE side diverge, which the catch-up path handles by chaining
 *           deltas from a common base. Two sides diverging is a different
 *           case and is what these check.
 *   V1..V3  version-history immutability: editing the current state must not
 *           alter what an earlier version reconstructs to.
 *   B1..B2  burst behaviour: that the per-file serialisation chain holds under
 *           many edits, and that a self-race cannot corrupt the document.
 *
 * All three offline files are set up while the instances are disconnected, so
 * one reconnection exercises every case. The bridge exposes no way to drop an
 * established peer link, so "offline" is modelled as edits made before any
 * link exists — the same condition the catch-up path exists to recover from.
 *
 * Run: node scripts/qa-audit-consistency.js
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

const instances = [];
async function launch(label, wsPort, nodeIndex, user) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `aud-${label}-`));
  const app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: [MAIN, `--user-data-dir=${userData}`],
    cwd: DESKTOP_DIR,
    env: {
      ...process.env,
      DOCUSYNC_LOCAL_UI: '1',
      DOCUSYNC_WS_PORT: String(wsPort),
      DOCUSYNC_NODE_INDEX: String(nodeIndex),
      DOCUSYNC_NODE_COUNT: '4',
    },
    timeout: 60000,
  });
  const page = await app.firstWindow({ timeout: 45000 });
  const inst = { app, page, userData, label, wsPort, logs: [] };
  const keep = (d) => {
    for (const l of String(d).split(String.fromCharCode(10))) {
      const t = l.trim();
      if (t) inst.logs.push(t);
    }
    if (inst.logs.length > 600) inst.logs.splice(0, inst.logs.length - 600);
  };
  try {
    const proc = app.process();
    proc.stdout?.on('data', (d) => keep(d.toString()));
    proc.stderr?.on('data', (d) => keep('[err] ' + d.toString()));
  } catch { }
  await page.waitForLoadState('domcontentloaded').catch(() => { });
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 40000 });
  await page.fill('input[placeholder="Enter your username"]', user.email);
  await page.fill('input[placeholder="Enter your password"]', user.password);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !location.hash.includes('vault-login'), { timeout: 40000 });
  instances.push(inst);
  return inst;
}

const dead = new Set();
const bounded = (promise, label, inst, ms = 30000) =>
  Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} silent for ${ms}ms`)), ms)),
  ]).catch((err) => {
    if (inst && !dead.has(inst.label)) {
      dead.add(inst.label);
      check(false, `instance ${inst.label} stopped answering`, `${label}: ${err.message}`);
      for (const l of inst.logs.slice(-20)) console.log(`      ${l}`);
    }
    return { ok: false, content: null, timedOut: true };
  });

const imp = (inst, name, content, id) => bounded(inst.page.evaluate(async (a) => {
  const r = await window.docuSync.importRoomFile(a.name, a.content, a.id);
  return { ok: !!r.success, fileId: r.data?.fileId ?? r.fileId, err: r.error || null };
}, { name, content, id }), `import(${name})`, inst);

const save = (inst, id, html) => bounded(inst.page.evaluate(async (a) => {
  const r = await window.docuSync.saveFile(a.id, a.html, null);
  return { ok: !!r.success, data: r.data ?? null, err: r.error || null };
}, { id, html }), `save(${id})`, inst);

const doc = (inst, id, names) => bounded(inst.page.evaluate(async (a) => {
  const r = await window.docuSync.openFile(a.id, a.name);
  const d = (r && r.data) || {};
  return { ok: !!(r && r.success), content: d.content ?? null };
}, { id, name: names[inst.label] }), `open(${id})`, inst);

const history = (inst, id) => bounded(inst.page.evaluate(async (i) => {
  const r = await window.docuSync.getHistory(i);
  const d = (r && r.data) || {};
  return {
    ok: !!(r && r.success),
    entries: (d.entries || []).map((e) => ({
      eventId: e.eventId, type: e.eventType, ts: e.logicalTimestamp,
      node: String(e.nodeId).slice(0, 8), rebuilt: e.reconstructed, payload: e.payload,
    })),
  };
}, id), `history(${id})`, inst);

const connect = (inst, host, port) => inst.page.evaluate(async (a) => {
  const r = await window.docuSync.connectToPeer(a.host, a.port);
  return { ok: !!r.success, err: r.error || null };
}, { host, port });

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

let seq = 0;
/** Same file id on every instance, a distinct file NAME per instance. */
async function seed(insts, base, tag) {
  const stamp = `${Date.now()}-${seq++}`;
  const names = {};
  let id;
  for (const inst of insts) {
    const name = `aud-${tag}-${stamp}-${inst.label}.txt`;
    names[inst.label] = name;
    const r = await imp(inst, name, base, id);
    if (id === undefined) id = r.fileId;
  }
  await settle(1200);
  return { id, names };
}

function assertLines(label, content, spec) {
  const got = L(content);
  const bad = [];
  for (const [k, want] of Object.entries(spec)) {
    const i = Number(k);
    const actual = got[i];
    const ok = Array.isArray(want) ? want.includes(actual) : actual === want;
    if (!ok) bad.push(`line ${i + 1}: expected ${Array.isArray(want) ? `one of [${want.join(' | ')}]` : `"${want}"`}, got "${actual}"`);
  }
  return check(bad.length === 0, label, bad.length ? bad.join('; ') : `${Object.keys(spec).length} region(s) verified`);
}

(async () => {
  console.log('DocuSync -- merge-readiness audit (offline line-level, version immutability, bursts)\n');
  let A = null, B = null, C = null;
  try {
    phase('Launch three instances, deliberately NOT connected');
    A = await launch('A', 9000, 0, U.A);
    B = await launch('B', 9001, 1, U.B);
    C = await launch('C', 9002, 2, U.C);
    check(instances.length === 3, 'three desktop instances running, no peer links yet',
      'ports 9000 / 9001 / 9002');

    // ── Offline divergence, set up while no link exists ───────────────────
    phase('Offline edits made with no peer link');

    const base1 = 'O1 line one.\nO1 line two.\nO1 line three.\n';
    const f1 = await seed([A, B], base1, 'o1');
    await save(A, f1.id, base1.replace('O1 line one.', 'O1 line one. FROM-A.'));
    await save(B, f1.id, base1.replace('O1 line three.', 'O1 line three. FROM-B.'));

    const base2 = 'O2 contested.\nO2 bystander two.\nO2 bystander three.\n';
    const f2 = await seed([A, B], base2, 'o2');
    await save(A, f2.id, base2.replace('O2 contested.', 'O2 contested. FROM-A.'));
    await save(B, f2.id, base2.replace('O2 contested.', 'O2 contested. FROM-B.'));

    const base3 = 'O3 contested.\nO3 quiet two.\nO3 c-region three.\nO3 quiet four.\n';
    const f3 = await seed([A, B, C], base3, 'o3');
    await save(A, f3.id, base3.replace('O3 contested.', 'O3 contested. FROM-A.'));
    await save(B, f3.id, base3.replace('O3 contested.', 'O3 contested. FROM-B.'));
    await save(C, f3.id, base3.replace('O3 c-region three.', 'O3 c-region three. FROM-C.'));

    const preA = await doc(A, f1.id, f1.names), preB = await doc(B, f1.id, f1.names);
    check(
      L(preA.content).includes('O1 line one. FROM-A.') && L(preB.content).includes('O1 line three. FROM-B.'),
      'each instance persisted its own offline edit before any link existed',
      `A=${sha(preA.content)} B=${sha(preB.content)} (deliberately different)`
    );

    phase('Reconnect the mesh and let catch-up run');
    const c1 = await connect(B, '127.0.0.1', 9000);
    const c2 = await connect(C, '127.0.0.1', 9000);
    const c3 = await connect(C, '127.0.0.1', 9001);
    check(c1.ok && c2.ok && c3.ok, 'peer links established after the offline period',
      `B-A=${c1.ok} C-A=${c2.ok} C-B=${c3.ok}`);
    await settle(16000); // catch-up is debounced ~1.5s, then replays per file

    phase('O1 - offline edits on DIFFERENT regions');
    {
      const spec = {
        0: 'O1 line one. FROM-A.',
        1: 'O1 line two.',
        2: 'O1 line three. FROM-B.',
      };
      const a = await doc(A, f1.id, f1.names), b = await doc(B, f1.id, f1.names);
      assertLines('O1 A kept both offline edits', a.content, spec);
      assertLines('O1 B kept both offline edits', b.content, spec);
      check(sha(a.content) === sha(b.content), 'O1 both engines agree',
        sha(a.content) === sha(b.content) ? sha(a.content) : `A=${sha(a.content)} B=${sha(b.content)}`);
    }

    phase('O2 - offline edits on the SAME region');
    {
      const spec = {
        0: ['O2 contested. FROM-A.', 'O2 contested. FROM-B.'],
        1: 'O2 bystander two.',
        2: 'O2 bystander three.',
      };
      const a = await doc(A, f2.id, f2.names), b = await doc(B, f2.id, f2.names);
      assertLines('O2 A resolved line 1, bystanders intact', a.content, spec);
      assertLines('O2 B resolved line 1, bystanders intact', b.content, spec);
      check(sha(a.content) === sha(b.content), 'O2 both engines chose the same winner',
        sha(a.content) === sha(b.content) ? sha(a.content) : `A=${sha(a.content)} B=${sha(b.content)}`);
    }

    phase('O3 - MIXED: two contest a region while a third edits another');
    {
      const spec = {
        0: ['O3 contested. FROM-A.', 'O3 contested. FROM-B.'],
        1: 'O3 quiet two.',
        2: 'O3 c-region three. FROM-C.',
        3: 'O3 quiet four.',
      };
      const shas = [];
      for (const inst of [A, B, C]) {
        const r = await doc(inst, f3.id, f3.names);
        assertLines(`O3 ${inst.label}: region 1 contested, region 3 is C's edit`, r.content, spec);
        shas.push(sha(r.content));
      }
      check(new Set(shas).size === 1, 'O3 all three engines agree', shas.join(' / '));
    }

    // ── Version history immutability ──────────────────────────────────────
    phase('V - version history immutability');
    {
      const v1 = 'V one.\nV steady.\n';
      const f = await seed([A, B], v1, 'ver');
      await save(A, f.id, 'V two.\nV steady.\n');
      await settle(3000);
      await save(A, f.id, 'V three.\nV steady.\n');
      await settle(3000);

      const before = await history(A, f.id);
      const snap = before.entries.map((e) => ({ eventId: e.eventId, h: sha(e.payload), first: L(e.payload)[0] }));
      check(before.entries.every((e) => e.rebuilt !== false),
        'V1 every version rebuilt from the log',
        snap.map((s) => `"${String(s.first).slice(0, 14)}"`).join(' -> '));

      // Change the current state, then check the earlier versions again.
      await save(A, f.id, 'V four.\nV steady. EDITED.\n');
      await settle(3000);
      const after = await history(A, f.id);
      const stillThere = snap.every((s) => {
        const m = after.entries.find((e) => e.eventId === s.eventId);
        return m && sha(m.payload) === s.h;
      });
      check(stillThere, 'V2 earlier versions unchanged after editing the current state',
        `${snap.length} earlier version(s) compared by content hash`);
      check(after.entries.length === snap.length + 1,
        'V3 the new edit added exactly one version',
        `${snap.length} -> ${after.entries.length}`);
    }

    // ── Burst behaviour ───────────────────────────────────────────────────
    phase('B - burst behaviour under the per-file lock');
    {
      const rows = Array.from({ length: 10 }, (_, i) => `row ${String(i + 1).padStart(2, '0')}.`);
      const bbase = rows.join('\n') + '\n';
      const f = await seed([A, B], bbase, 'burst');

      // B1: ten sequential edits, each built on the previous result.
      let cur = bbase;
      for (let i = 0; i < 10; i++) {
        cur = cur.replace(`row ${String(i + 1).padStart(2, '0')}.`, `row ${String(i + 1).padStart(2, '0')}. M${i + 1}`);
        await save(A, f.id, cur);
      }
      await settle(12000);
      const a1 = await doc(A, f.id, f.names), b1 = await doc(B, f.id, f.names);
      const markersA = rows.map((_, i) => `M${i + 1}`).filter((m) => String(a1.content).includes(m + '\n') || String(a1.content).includes(m));
      check(markersA.length === 10, 'B1 all ten sequential edits present on the author',
        `${markersA.length}/10 markers`);
      check(sha(a1.content) === sha(b1.content), 'B1 the peer converged on the same document',
        sha(a1.content) === sha(b1.content) ? sha(a1.content) : `A=${sha(a1.content)} B=${sha(b1.content)}`);
      const hist = await history(A, f.id);
      check(hist.entries.every((e) => e.rebuilt !== false),
        'B1 every burst event still rebuilds from the log',
        `${hist.entries.length} entries, types: ${[...new Set(hist.entries.map((e) => e.type))].join(',')}`);

      // B2: five saves issued at once from ONE stale base -- a self-race. The
      // engine cannot keep all five (they rewrite the same lines from the same
      // base), so this checks only that nothing is corrupted and peers agree.
      const f2b = await seed([A, B], bbase, 'race');
      await Promise.all(Array.from({ length: 5 }, (_, i) =>
        save(A, f2b.id, bbase.replace(`row 0${i + 1}.`, `row 0${i + 1}. R${i + 1}`))));
      await settle(10000);
      const a2 = await doc(A, f2b.id, f2b.names), b2 = await doc(B, f2b.id, f2b.names);
      const lines2 = L(a2.content).filter((l) => l.length > 0);
      check(lines2.length === 10 && lines2.length === new Set(lines2).size,
        'B2 a self-race left the document structurally intact',
        `${lines2.length} lines, duplicates=${lines2.length !== new Set(lines2).size}`);
      check(sha(a2.content) === sha(b2.content), 'B2 the peer still converged',
        sha(a2.content) === sha(b2.content) ? sha(a2.content) : `A=${sha(a2.content)} B=${sha(b2.content)}`);
      const survived = [1, 2, 3, 4, 5].filter((i) => String(a2.content).includes(`R${i}`));
      info('B2 markers surviving a five-way self-race (informational)',
        `${survived.length}/5 kept: ${survived.map((i) => 'R' + i).join(',') || 'none'}`);
    }
  } catch (err) {
    check(false, 'audit suite ran to completion', err.message?.split('\n')[0] || String(err));
  } finally {
    for (const inst of instances) {
      if (inst?.app) await inst.app.close().catch(() => { });
      if (inst?.userData) fs.rmSync(inst.userData, { recursive: true, force: true });
    }
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
    fs.writeFileSync(path.join(__dirname, 'qa-audit-consistency-results.json'), JSON.stringify(results, null, 2));
  }
})();
