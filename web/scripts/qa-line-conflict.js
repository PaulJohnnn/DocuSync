/**
 * LINE-LEVEL CONFLICT GRANULARITY QA — tests L1 through L10.
 *
 * Central property under test:
 *
 *   A conflict belongs to the specific logical text region concurrently
 *   edited by multiple users. Independent edits on other regions must
 *   continue normally and must never be damaged by that conflict.
 *
 * Evidence rules:
 *   - three real Electron processes, no browser stands in for a desktop
 *   - nothing is mocked; the cloud path is never accepted as proof
 *   - convergence is NOT accepted as a pass. Two peers agreeing on a
 *     document that lost an edit is a failure, so every assertion names
 *     the exact line it expects and what must be on it.
 *
 * Source of truth for document content: the file the engine itself wrote
 * to disk in `onDeltaApplied` (ipc-handlers.ts), read back through
 * `file:open`. That is the document the user would actually open.
 *
 * `file:history` is deliberately NOT used to read content. Its handler
 * reconstructs by folding deltas from an empty string, so when a file's
 * first logged event is an `edit` delta taken against an imported base
 * that was never logged as a snapshot, `decode` throws and the catch at
 * ipc-handlers.ts:1248 assigns the raw base64 delta as the entry's
 * "payload". An earlier harness compared those payloads and read
 * matching base64 as "convergence". H1 below tests that defect directly
 * instead of depending on it.
 *
 * Run: node scripts/qa-line-conflict.js
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
  console.log(`  ${ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
  return ok;
}
const sha = (s) => crypto.createHash('sha256').update(s ?? '', 'utf8').digest('hex').slice(0, 16);

const instances = [];
async function launch(label, wsPort, nodeIndex, user) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `dlc-${label}-`));
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

  // Capture everything this instance says. When a bridge call stops
  // answering, the reason is in the main process's own output, and without
  // it a dead instance is indistinguishable from a slow one.
  const keep = (line) => {
    for (const l of String(line).split(String.fromCharCode(10))) {
      const t = l.trim();
      if (t) inst.logs.push(t);
    }
    if (inst.logs.length > 400) inst.logs.splice(0, inst.logs.length - 400);
  };
  try {
    const proc = app.process();
    proc.stdout?.on('data', (d) => keep('[out] ' + d.toString()));
    proc.stderr?.on('data', (d) => keep('[err] ' + d.toString()));
  } catch { /* process streams unavailable */ }
  page.on('pageerror', (e) => keep('[pageerror] ' + e.message));
  page.on('crash', () => keep('[RENDERER CRASHED]'));
  page.on('console', (m) => { if (m.type() === 'error') keep('[console.error] ' + m.text()); });
  app.on('close', () => keep('[APP CLOSED]'));

  await page.waitForLoadState('domcontentloaded').catch(() => { });
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 40000 });
  await page.fill('input[placeholder="Enter your username"]', user.email);
  await page.fill('input[placeholder="Enter your password"]', user.password);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !location.hash.includes('vault-login'), { timeout: 40000 });
  instances.push(inst);
  return inst;
}

// -- bridge wrappers ---------------------------------------------------------
/**
 * Bounds every bridge call. `file:open` falls back to a NATIVE open dialog
 * when a file id is not in the main process's `openFiles` map, and Playwright
 * cannot dismiss an OS dialog — the evaluate would then never settle and the
 * whole suite would stall with no output. A bounded call turns that into a
 * named failure instead.
 */
const dead = new Set();
const withTimeout = (promise, label, ms = 30000, inst = null) =>
  Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} did not respond within ${ms}ms`)), ms)),
  ]).catch((err) => {
    if (inst && !dead.has(inst.label)) {
      dead.add(inst.label);
      check(false, `instance ${inst.label} stopped answering the bridge`, `${label}: ${err.message}`);
      console.log(`  ---- last output from instance ${inst.label} ----`);
      for (const l of inst.logs.slice(-25)) console.log(`    ${l}`);
      console.log('  ------------------------------------------');
    }
    return { ok: false, content: null, timedOut: true, err: err.message };
  });

const imp = (p, name, content, id) => withTimeout(p.evaluate(async (a) => {
  const r = await window.docuSync.importRoomFile(a.name, a.content, a.id);
  return { ok: !!r.success, fileId: r.data?.fileId ?? r.fileId, err: r.error || null };
}, { name, content, id }), `importRoomFile(${name})`);

const save = (p, id, html) => withTimeout(p.evaluate(async (a) => {
  const r = await window.docuSync.saveFile(a.id, a.html, null);
  return { ok: !!r.success, data: r.data ?? null, err: r.error || null };
}, { id, html }), `file:save(${id})`);

/**
 * THE authoritative document: what the engine wrote to disk. `onDeltaApplied`
 * writes merged content there, and `file:save` writes local edits, so this is
 * the converged state as a user would see it.
 */
const doc = (inst, id, names) => withTimeout(inst.page.evaluate(async (a) => {
  const r = await window.docuSync.openFile(a.id, a.name);
  const d = (r && r.data) || {};
  return { ok: !!(r && r.success), content: d.content ?? null };
}, { id, name: names[inst.label] }), `file:open(${id}) on ${inst.label}`, 30000, inst);

/** Event-log shape only -- types and counts, never used as content. */
const evt = (p, id) => withTimeout(p.evaluate(async (i) => {
  const r = await window.docuSync.getHistory(i);
  const d = (r && r.data) || {};
  const entries = d.entries || [];
  return {
    ok: !!(r && r.success),
    total: d.totalEntries ?? entries.length,
    types: entries.map((e) => e.eventType),
    eventIds: entries.map((e) => e.eventId),
    lastPayload: entries.length ? entries[entries.length - 1].payload : null,
  };
}, id), `file:history(${id})`);

const connect = (p, host, port) => p.evaluate(async (a) => {
  const r = await window.docuSync.connectToPeer(a.host, a.port);
  return { ok: !!r.success, err: r.error || null };
}, { host, port });

const conflicts = (p) => p.evaluate(async () => {
  const r = await window.docuSync.listConflicts();
  const d = (r && r.data) || {};
  const list = Array.isArray(d.conflicts) ? d.conflicts : (Array.isArray(d) ? d : []);
  return { ok: !!(r && r.success), count: d.totalPending ?? list.length };
});

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

// -- line-level assertion helpers -------------------------------------------
const L = (s) => String(s ?? '').split('\n');
const looksLikeBase64Delta = (s) => /^[A-Za-z0-9+/=]{40,}$/.test(String(s ?? '').trim());

/**
 * Asserts the exact content of named regions, independently of whichever
 * side won any conflict. `spec` maps a 0-based line index to either a
 * string the line must equal, or an array of acceptable strings (used for
 * a genuinely contested region where either winner is correct).
 */
function assertLines(label, content, spec, extra = '') {
  const got = L(content);
  const bad = [];
  for (const [idxStr, want] of Object.entries(spec)) {
    const i = Number(idxStr);
    const actual = got[i];
    const okLine = Array.isArray(want) ? want.includes(actual) : actual === want;
    if (!okLine) {
      bad.push(`line ${i + 1}: expected ${Array.isArray(want) ? `one of [${want.join(' | ')}]` : `"${want}"`}, got "${actual}"`);
    }
  }
  return check(bad.length === 0, label, bad.length ? bad.join('; ') : (extra || `${Object.keys(spec).length} region(s) verified`));
}

/** A document must not gain or lose logical lines through a merge. */
function assertShape(label, content, expectedNonEmpty) {
  const got = L(content).filter((l) => l.length > 0);
  const dupes = got.length !== new Set(got).size;
  const ok = got.length === expectedNonEmpty && !dupes;
  return check(ok, label,
    `${got.length} non-empty line(s), expected ${expectedNonEmpty}${dupes ? ' -- DUPLICATED LINES PRESENT' : ''}`);
}

let seq = 0;
/**
 * Imports one document on every instance: identical content and identical
 * file id, but a DISTINCT FILE NAME per instance.
 *
 * The distinct name is essential. `file:import-room-file` writes to
 * `app.getPath('downloads')/DocuSync/<fileName>`, and `--user-data-dir`
 * does not redirect the OS Downloads folder, so every instance on this
 * machine resolves the same name to the same path. Sharing a name made all
 * three instances read and write ONE file: observations were whichever
 * instance wrote last, writes raced each other to truncation, and no
 * per-instance content could be measured at all. The file id is what the
 * engine syncs on, and it is still shared, so peer behaviour is unchanged.
 */
async function seed(insts, base, tag) {
  const stamp = `${Date.now()}-${seq++}`;
  const names = {};
  let id;
  for (const inst of insts) {
    const name = `lc-${tag}-${stamp}-${inst.label}.txt`;
    names[inst.label] = name;
    const r = await imp(inst.page, name, base, id);
    if (id === undefined) id = r.fileId;
  }
  await settle(1500);
  return { id, names };
}

(async () => {
  console.log('DocuSync -- line-level conflict granularity QA (L1-L10)\n');
  let A = null, B = null, C = null;
  try {
    phase('Launch three real Electron instances');
    A = await launch('A', 9000, 0, U.A);
    B = await launch('B', 9001, 1, U.B);
    C = await launch('C', 9002, 2, U.C);
    check(instances.length === 3, 'three desktop instances running',
      'ports 9000 / 9001 / 9002, separate user-data dirs and node indices');
    check([A, B, C].every((i) => /^file:\/\//.test(i.page.url())),
      'each loaded the local renderer that drives the engine',
      [A, B, C].map((i) => i.label + '=' + i.page.url().slice(0, 7)).join(' '));

    phase('Full mesh peer links');
    const cBA = await connect(B.page, '127.0.0.1', 9000);
    const cCA = await connect(C.page, '127.0.0.1', 9000);
    const cCB = await connect(C.page, '127.0.0.1', 9001);
    check(cBA.ok && cCA.ok && cCB.ok, 'B-A, C-A and C-B peer links established',
      `B-A=${cBA.ok} C-A=${cCA.ok} C-B=${cCB.ok}`);
    await settle(3000);

    const AB = [A, B];

    // -- L1 ------------------------------------------------------------------
    phase('L1 - single edit, no concurrency: only the edited region changes');
    {
      const base = 'L1 alpha one.\nL1 bravo two.\nL1 charlie three.\n';
      const { id, names } = await seed(AB, base, 'l1');
      await save(A.page, id, base.replace('L1 bravo two.', 'L1 bravo two. EDITED-A.'));
      await settle(5000);
      const spec = { 0: 'L1 alpha one.', 1: 'L1 bravo two. EDITED-A.', 2: 'L1 charlie three.' };
      const a = await doc(A, id, names), b = await doc(B, id, names);
      assertLines('L1 A holds the edit with neighbours intact', a.content, spec);
      assertLines('L1 B received it with neighbours intact', b.content, spec);
      assertShape('L1 no line gained or lost', b.content, 3);
      const e = await evt(B.page, id);
      check(e.types.length > 0, 'L1 B logged the remote event', `types: ${e.types.join(',')}`);
    }

    // -- L2 ------------------------------------------------------------------
    phase('L2 - CONCURRENT edits on DIFFERENT lines: both must survive');
    {
      const base = 'L2 region one.\nL2 region two.\nL2 region three.\n';
      const { id, names } = await seed(AB, base, 'l2');
      await Promise.all([
        save(A.page, id, base.replace('L2 region one.', 'L2 region one. FROM-A.')),
        save(B.page, id, base.replace('L2 region three.', 'L2 region three. FROM-B.')),
      ]);
      await settle(8000);
      const spec = {
        0: 'L2 region one. FROM-A.',
        1: 'L2 region two.',
        2: 'L2 region three. FROM-B.',
      };
      const a = await doc(A, id, names), b = await doc(B, id, names);
      assertLines('L2 A kept BOTH independent edits', a.content, spec);
      assertLines('L2 B kept BOTH independent edits', b.content, spec);
      check(sha(a.content) === sha(b.content), 'L2 the two engines agree on one document',
        sha(a.content) === sha(b.content) ? sha(a.content) : `A=${sha(a.content)} B=${sha(b.content)}`);
      assertShape('L2 no line gained or lost', a.content, 3);
      const cf = await conflicts(A.page);
      check(cf.count === 0, 'L2 no conflict recorded for non-overlapping regions',
        `${cf.count} conflict(s) on A`);
    }

    // -- L3 ------------------------------------------------------------------
    phase('L3 - CONCURRENT edits on the SAME line: conflict stays on that line');
    {
      const base = 'L3 contested line.\nL3 bystander two.\nL3 bystander three.\n';
      const { id, names } = await seed(AB, base, 'l3');
      await Promise.all([
        save(A.page, id, base.replace('L3 contested line.', 'L3 contested line. FROM-A.')),
        save(B.page, id, base.replace('L3 contested line.', 'L3 contested line. FROM-B.')),
      ]);
      await settle(8000);
      const spec = {
        0: ['L3 contested line. FROM-A.', 'L3 contested line. FROM-B.'],
        1: 'L3 bystander two.',
        2: 'L3 bystander three.',
      };
      const a = await doc(A, id, names), b = await doc(B, id, names);
      assertLines('L3 A: one side won line 1, bystanders undamaged', a.content, spec);
      assertLines('L3 B: one side won line 1, bystanders undamaged', b.content, spec);
      check(sha(a.content) === sha(b.content), 'L3 both engines chose the same winner',
        sha(a.content) === sha(b.content) ? sha(a.content) : `A=${sha(a.content)} B=${sha(b.content)}`);
      assertShape('L3 no line gained or lost', a.content, 3);
    }

    // -- L4 ------------------------------------------------------------------
    phase('L4 - same-line conflict PLUS an independent edit in the same round');
    {
      const base = 'L4 contested one.\nL4 quiet two.\nL4 independent three.\nL4 b-region four.\n';
      const { id, names } = await seed(AB, base, 'l4');
      await Promise.all([
        // A contests line 1 and also edits line 3.
        save(A.page, id, base
          .replace('L4 contested one.', 'L4 contested one. FROM-A.')
          .replace('L4 independent three.', 'L4 independent three. ALSO-A.')),
        // B contests line 1 and also edits line 4. Whichever side loses
        // line 1, BOTH of these far-line edits must survive.
        save(B.page, id, base
          .replace('L4 contested one.', 'L4 contested one. FROM-B.')
          .replace('L4 b-region four.', 'L4 b-region four. ALSO-B.')),
      ]);
      await settle(8000);
      const spec = {
        0: ['L4 contested one. FROM-A.', 'L4 contested one. FROM-B.'],
        1: 'L4 quiet two.',
        2: 'L4 independent three. ALSO-A.',
        3: 'L4 b-region four. ALSO-B.',
      };
      const a = await doc(A, id, names), b = await doc(B, id, names);
      assertLines('L4 A: both uncontested edits survived the conflict', a.content, spec);
      assertLines('L4 B: both uncontested edits survived the conflict', b.content, spec);
      assertShape('L4 no line gained or lost', a.content, 4);
    }

    // -- L5 ------------------------------------------------------------------
    phase('L5 - INSERTION against an edit on a different line');
    {
      const base = 'L5 head one.\nL5 middle two.\nL5 tail three.\n';
      const { id, names } = await seed(AB, base, 'l5');
      await Promise.all([
        save(A.page, id, 'L5 head one.\nL5 INSERTED-BY-A.\nL5 middle two.\nL5 tail three.\n'),
        save(B.page, id, base.replace('L5 tail three.', 'L5 tail three. FROM-B.')),
      ]);
      await settle(8000);
      for (const inst of AB) {
        const r = await doc(inst, id, names);
        const ls = L(r.content);
        const hasInsert = ls.includes('L5 INSERTED-BY-A.');
        const hasEdit = ls.includes('L5 tail three. FROM-B.');
        check(hasInsert && hasEdit, `L5 ${inst.label} kept the insertion AND the far-line edit`,
          `insertion=${hasInsert} far-edit=${hasEdit} | ${ls.filter((x) => x).length} line(s)`);
      }
      assertShape('L5 insertion produced exactly one extra line',
        (await doc(A, id, names)).content, 4);
    }

    // -- L6 ------------------------------------------------------------------
    phase('L6 - THREE desktops: A vs B contest line 1 while C edits line 3');
    {
      const base = 'L6 contested one.\nL6 quiet two.\nL6 c-region three.\nL6 quiet four.\n';
      const { id, names } = await seed([A, B, C], base, 'l6');
      await Promise.all([
        save(A.page, id, base.replace('L6 contested one.', 'L6 contested one. FROM-A.')),
        save(B.page, id, base.replace('L6 contested one.', 'L6 contested one. FROM-B.')),
        save(C.page, id, base.replace('L6 c-region three.', 'L6 c-region three. FROM-C.')),
      ]);
      await settle(10000);
      const spec = {
        0: ['L6 contested one. FROM-A.', 'L6 contested one. FROM-B.'],
        1: 'L6 quiet two.',
        2: 'L6 c-region three. FROM-C.',
        3: 'L6 quiet four.',
      };
      const shas = [];
      for (const inst of [A, B, C]) {
        const r = await doc(inst, id, names);
        assertLines(`L6 ${inst.label}: line 1 contested, line 3 is C's edit, rest intact`, r.content, spec);
        shas.push(sha(r.content));
      }
      check(new Set(shas).size === 1, 'L6 all three engines agree on one document', shas.join(' / '));
      assertShape('L6 no line gained or lost', (await doc(A, id, names)).content, 4);
    }

    // -- L7 ------------------------------------------------------------------
    phase('L7 - line DELETION against an edit on a different line');
    {
      const base = 'L7 keep one.\nL7 doomed two.\nL7 keep three.\nL7 edited four.\n';
      const { id, names } = await seed(AB, base, 'l7');
      await Promise.all([
        save(A.page, id, 'L7 keep one.\nL7 keep three.\nL7 edited four.\n'),
        save(B.page, id, base.replace('L7 edited four.', 'L7 edited four. FROM-B.')),
      ]);
      await settle(8000);
      for (const inst of AB) {
        const r = await doc(inst, id, names);
        const ls = L(r.content);
        const deleted = !ls.includes('L7 doomed two.');
        const edited = ls.includes('L7 edited four. FROM-B.');
        const kept = ls.includes('L7 keep one.') && ls.includes('L7 keep three.');
        check(deleted && edited && kept,
          `L7 ${inst.label} applied the deletion AND kept the far edit`,
          `deleted=${deleted} far-edit=${edited} neighbours=${kept}`);
      }
    }

    // -- L8 ------------------------------------------------------------------
    phase('L8 - BLOCK granularity: concurrent edits in different paragraphs');
    {
      const base = '<p>L8 para one.</p>\n<p>L8 para two.</p>\n<p>L8 para three.</p>\n';
      const { id, names } = await seed(AB, base, 'l8');
      await Promise.all([
        save(A.page, id, base.replace('L8 para one.', 'L8 para one. FROM-A.')),
        save(B.page, id, base.replace('L8 para three.', 'L8 para three. FROM-B.')),
      ]);
      await settle(8000);
      for (const inst of AB) {
        const r = await doc(inst, id, names);
        const s = String(r.content ?? '');
        const keptA = s.includes('L8 para one. FROM-A.');
        const keptB = s.includes('L8 para three. FROM-B.');
        const mid = s.includes('<p>L8 para two.</p>');
        check(keptA && keptB && mid, `L8 ${inst.label} merged both paragraphs, middle untouched`,
          `A-para=${keptA} B-para=${keptB} middle=${mid}`);
      }
    }

    // -- L9 ------------------------------------------------------------------
    phase('L9 - editing still works normally AFTER a conflict (no poisoning)');
    {
      const base = 'L9 contested one.\nL9 later-a two.\nL9 later-b three.\n';
      const { id, names } = await seed(AB, base, 'l9');
      // Round 1: force a same-line conflict.
      await Promise.all([
        save(A.page, id, base.replace('L9 contested one.', 'L9 contested one. R1-A.')),
        save(B.page, id, base.replace('L9 contested one.', 'L9 contested one. R1-B.')),
      ]);
      await settle(8000);
      const afterR1 = (await doc(A, id, names)).content;
      check(!!afterR1 && L(afterR1).length >= 3, 'L9 round 1 produced a resolved document',
        `${sha(afterR1)} / ${L(afterR1).filter((x) => x).length} line(s)`);

      // Round 2: each peer edits its OWN separate line, sequentially, starting
      // from whatever round 1 settled on. Both must land.
      await save(A.page, id, String(afterR1).replace('L9 later-a two.', 'L9 later-a two. R2-A.'));
      await settle(5000);
      const midB = (await doc(B, id, names)).content;
      await save(B.page, id, String(midB).replace('L9 later-b three.', 'L9 later-b three. R2-B.'));
      await settle(6000);
      for (const inst of AB) {
        const ls = L((await doc(inst, id, names)).content);
        const a2 = ls.some((l) => l.includes('R2-A.'));
        const b2 = ls.some((l) => l.includes('R2-B.'));
        const c1 = ls.some((l) => l.includes('R1-A.') || l.includes('R1-B.'));
        check(a2 && b2 && c1, `L9 ${inst.label} post-conflict edits both landed`,
          `R2-A=${a2} R2-B=${b2} round-1-winner-still-present=${c1}`);
      }
    }

    // -- L10 -----------------------------------------------------------------
    phase('L10 - structural integrity of a long document around a conflict');
    {
      const rows = [];
      for (let i = 1; i <= 12; i++) rows.push(`L10 row ${String(i).padStart(2, '0')}.`);
      const base = rows.join('\n') + '\n';
      const { id, names } = await seed(AB, base, 'l10');
      await Promise.all([
        save(A.page, id, base.replace('L10 row 06.', 'L10 row 06. FROM-A.')),
        save(B.page, id, base.replace('L10 row 06.', 'L10 row 06. FROM-B.')),
      ]);
      await settle(8000);
      for (const inst of AB) {
        const got = L((await doc(inst, id, names)).content).filter((l) => l.length > 0);
        const dupes = got.length !== new Set(got).size;
        const others = rows.filter((l) => l !== 'L10 row 06.');
        const missing = others.filter((l) => !got.includes(l));
        check(got.length === 12 && !dupes && missing.length === 0,
          `L10 ${inst.label} 11 uncontested rows intact, no duplication`,
          `${got.length} rows, dupes=${dupes}, missing=${missing.length ? missing.join(',') : 'none'}`);
      }
    }

    // -- H1: the Version History reconstruction defect ------------------------
    phase('H1 - Version History reconstruction for an imported room file');
    {
      const base = 'H1 original line.\n';
      const { id } = await seed(AB, base, 'h1');
      await save(A.page, id, 'H1 original line. EDITED.\n');
      await settle(4000);
      const e = await evt(A.page, id);
      const garbled = looksLikeBase64Delta(e.lastPayload);
      check(!garbled, 'H1 history entries expose readable content, not raw base64 deltas',
        garbled
          ? `payload begins "${String(e.lastPayload).slice(0, 28)}..." -- reconstruction fell back to the encoded delta`
          : `payload: "${String(e.lastPayload).slice(0, 40)}"`);
    }

    // -- R1: version restore across peers -------------------------------------
    phase('R1 - a version restore reaches the other desktops');
    {
      const v1 = 'R1 version one.\nR1 steady line.\n';
      const { id, names } = await seed([A, B, C], v1, 'r1');

      await save(A.page, id, 'R1 version two.\nR1 steady line.\n');
      await settle(4000);
      await save(A.page, id, 'R1 version three.\nR1 steady line.\n');
      await settle(4000);

      const before = await doc(B, id, names);
      check(L(before.content)[0] === 'R1 version three.',
        'R1 all peers are on the newest version before the restore',
        `B line 1 = "${L(before.content)[0]}"`);

      // Find the entry that holds version two and roll back to it.
      const hist = await evt(A.page, id);
      const entries = await A.page.evaluate(async (i) => {
        const r = await window.docuSync.getHistory(i);
        const d = (r && r.data) || {};
        return (d.entries || []).map((e) => ({
          eventId: e.eventId, type: e.eventType,
          first: String(e.payload ?? '').split(String.fromCharCode(10))[0],
          reconstructed: e.reconstructed,
        }));
      }, id);
      check(entries.every((e) => e.reconstructed !== false),
        'R1 every history entry was rebuilt from the log',
        entries.map((e) => `${e.type}:"${e.first.slice(0, 22)}"`).join(' | '));

      const target = entries.find((e) => e.first === 'R1 version two.');
      if (!target) {
        check(false, 'R1 version two is present in history as readable content',
          `types: ${hist.types.join(',')} | firsts: ${entries.map((e) => e.first.slice(0, 18)).join(' | ')}`);
      } else {
        check(true, 'R1 version two is present in history as readable content', target.eventId.slice(0, 8));
        const r = await A.page.evaluate(async (a) => {
          const x = await window.docuSync.restoreVersion(a.id, a.eventId);
          return { ok: !!x.success, err: x.error || null };
        }, { id, eventId: target.eventId });
        check(r.ok, 'R1 A restored version two', r.err || 'restored');
        await settle(7000);

        const spec = { 0: 'R1 version two.', 1: 'R1 steady line.' };
        for (const inst of [A, B, C]) {
          assertLines(`R1 ${inst.label} holds the restored version`,
            (await doc(inst, id, names)).content, spec);
        }
      }
    }

    // -- relay ----------------------------------------------------------------
    phase('Topology - peer delivery across the mesh');
    {
      const base = 'RELAY one.\nRELAY two.\n';
      const { id, names } = await seed([A, B, C], base, 'relay');
      await save(B.page, id, base.replace('RELAY one.', 'RELAY one. FROM-B.'));
      await settle(7000);
      const onA = L((await doc(A, id, names)).content).includes('RELAY one. FROM-B.');
      const onC = L((await doc(C, id, names)).content).includes('RELAY one. FROM-B.');
      check(onA, 'B edit reached A over their direct link', `A has it = ${onA}`);
      check(onC, 'B edit reached C over their direct link', `C has it = ${onC}`);
    }
  } catch (err) {
    check(false, 'line-granularity suite ran to completion', err.message?.split('\n')[0] || String(err));
  } finally {
    for (const inst of instances) {
      if (inst?.app) await inst.app.close().catch(() => { });
      if (inst?.userData) fs.rmSync(inst.userData, { recursive: true, force: true });
    }
    console.log('\n' + '='.repeat(64));
    const pass = results.filter((r) => r.ok === true).length;
    const fail = results.filter((r) => r.ok === false).length;
    const sk = results.filter((r) => r.ok === null).length;
    console.log(`  ${pass} passed, ${fail} failed, ${sk} skipped`);
    if (fail) {
      console.log('\nFAILURES:');
      results.filter((r) => r.ok === false).forEach((f) => console.log(`  - [${f.group}] ${f.name}${f.detail ? ` -- ${f.detail}` : ''}`));
      process.exitCode = 1;
    }
    fs.writeFileSync(path.join(__dirname, 'qa-line-conflict-results.json'), JSON.stringify(results, null, 2));
  }
})();
