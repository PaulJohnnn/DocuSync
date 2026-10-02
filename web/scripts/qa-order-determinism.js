/**
 * ORDER INDEPENDENCE — does the same logical input reach the same final
 * state regardless of the order peers meet and exchange it?
 *
 * The previous report verified three-peer convergence in the orders it
 * happened to produce, and said so. This drives the order deliberately.
 *
 * For each permutation the three instances are launched fresh and left
 * unconnected, every peer edits the same base in isolation, and only then are
 * the three links brought up in a chosen sequence. Connecting a link makes
 * catch-up run in both directions across it, so the sequence of links
 * determines the sequence in which each peer learns the others' edits.
 * Six of the possible orders are run.
 *
 * Two documents per permutation:
 *   MIXED  A -> line 1, B -> line 1, C -> line 3
 *   SAME   A -> line 1, B -> line 1, C -> line 1
 *
 * The claim under test is narrow and stated as such:
 *
 *   same logical input + different application order -> same final state
 *
 * Each peer's own edit timestamp and node id are recorded before the links
 * come up, so the winner can be checked against the documented rule --
 * highest logicalTimestamp, node id breaking an exact tie -- rather than
 * against whichever peer happened to finish first.
 *
 * Run: node scripts/qa-order-determinism.js
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

async function launch(label) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `ord-${label}-`));
  const app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: [MAIN, `--user-data-dir=${userData}`],
    cwd: DESKTOP_DIR,
    env: {
      ...process.env,
      DOCUSYNC_LOCAL_UI: '1',
      DOCUSYNC_WS_PORT: String(PORT[label]),
      DOCUSYNC_NODE_INDEX: String(IDX[label]),
      DOCUSYNC_NODE_COUNT: '4',
    },
    timeout: 60000,
  });
  const page = await app.firstWindow({ timeout: 45000 });
  await page.waitForLoadState('domcontentloaded').catch(() => { });
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 40000 });
  await page.fill('input[placeholder="Enter your username"]', U[label].email);
  await page.fill('input[placeholder="Enter your password"]', U[label].password);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !location.hash.includes('vault-login'), { timeout: 40000 });
  return { app, page, userData, label };
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

/** This peer's own newest `edit` event for the file: its LWW identity. */
const ownEdit = (inst, id) => bounded(inst.page.evaluate(async (i) => {
  const r = await window.docuSync.getHistory(i);
  const entries = ((r && r.data) || {}).entries || [];
  const edits = entries.filter((e) => e.eventType === 'edit');
  const last = edits[edits.length - 1];
  return last ? { ts: last.logicalTimestamp, nodeId: last.nodeId } : null;
}, id), `history ${inst.label}`);

const connect = (inst, port) => inst.page.evaluate(async (p) => {
  const r = await window.docuSync.connectToPeer('127.0.0.1', p);
  return { ok: !!r.success, err: r.error || null };
}, port);

const events = (inst, id) => bounded(inst.page.evaluate(async (i) => {
  const r = await window.docuSync.getHistory(i);
  const entries = ((r && r.data) || {}).entries || [];
  return {
    types: entries.map((e) => e.eventType),
    ids: entries.map((e) => e.eventId),
    rebuilt: entries.every((e) => e.reconstructed !== false),
  };
}, id), `events ${inst.label}`);

/** Higher (logicalTimestamp, nodeId) wins. The documented rule. */
const beats = (x, y) => x.ts > y.ts || (x.ts === y.ts && x.nodeId > y.nodeId);

let seq = 0;
async function seed(insts, base, tag) {
  const stamp = `${Date.now()}-${seq++}`;
  const names = {};
  let id;
  for (const inst of insts) {
    const n = `ord-${tag}-${stamp}-${inst.label}.txt`;
    names[inst.label] = n;
    const r = await imp(inst, n, base, id);
    if (id === undefined) id = r.fileId;
  }
  await settle(1200);
  return { id, names };
}

// Six link orders. Each entry is the pair of labels whose link comes up.
const PERMUTATIONS = [
  { id: 'P1', order: [['B', 'A'], ['C', 'A'], ['C', 'B']] },
  { id: 'P2', order: [['B', 'A'], ['C', 'B'], ['C', 'A']] },
  { id: 'P3', order: [['C', 'A'], ['C', 'B'], ['B', 'A']] },
  { id: 'P4', order: [['C', 'B'], ['B', 'A'], ['C', 'A']] },
  { id: 'P5', order: [['C', 'A'], ['B', 'A'], ['C', 'B']] },
  { id: 'P6', order: [['C', 'B'], ['C', 'A'], ['B', 'A']] },
];

const MIXED_BASE = 'M contested one.\nM quiet two.\nM c-region three.\nM quiet four.\n';
const SAME_BASE = 'S contested one.\nS quiet two.\nS quiet three.\n';
const MIXED_TEXT = { A: 'M contested one. FROM-A.', B: 'M contested one. FROM-B.' };
const SAME_TEXT = {
  A: 'S contested one. FROM-A.',
  B: 'S contested one. FROM-B.',
  C: 'S contested one. FROM-C.',
};

const summary = [];

async function runPermutation(p) {
  phase(`${p.id} - links come up in order ${p.order.map((x) => x.join('-')).join(' then ')}`);
  const insts = {};
  try {
    for (const label of ['A', 'B', 'C']) insts[label] = await launch(label);
    const all = [insts.A, insts.B, insts.C];

    // ── offline edits, same base on every peer ──────────────────────────
    const mixed = await seed(all, MIXED_BASE, 'mix');
    await save(insts.A, mixed.id, MIXED_BASE.replace('M contested one.', MIXED_TEXT.A));
    await save(insts.B, mixed.id, MIXED_BASE.replace('M contested one.', MIXED_TEXT.B));
    await save(insts.C, mixed.id, MIXED_BASE.replace('M c-region three.', 'M c-region three. FROM-C.'));

    const same = await seed(all, SAME_BASE, 'same');
    await save(insts.A, same.id, SAME_BASE.replace('S contested one.', SAME_TEXT.A));
    await save(insts.B, same.id, SAME_BASE.replace('S contested one.', SAME_TEXT.B));
    await save(insts.C, same.id, SAME_BASE.replace('S contested one.', SAME_TEXT.C));
    await settle(2500);

    // LWW identities, captured before anything is exchanged.
    const idMixed = {}, idSame = {};
    for (const label of ['A', 'B', 'C']) {
      idMixed[label] = await ownEdit(insts[label], mixed.id);
      idSame[label] = await ownEdit(insts[label], same.id);
    }
    info(`${p.id} clocks (MIXED)`,
      ['A', 'B', 'C'].map((l) => `${l}: ts=${idMixed[l]?.ts} node=${String(idMixed[l]?.nodeId).slice(0, 8)}`).join(' | '));
    info(`${p.id} clocks (SAME)`,
      ['A', 'B', 'C'].map((l) => `${l}: ts=${idSame[l]?.ts} node=${String(idSame[l]?.nodeId).slice(0, 8)}`).join(' | '));

    // ── bring the links up in this permutation's order ──────────────────
    for (const [from, to] of p.order) {
      const r = await connect(insts[from], PORT[to]);
      if (!r.ok) check(false, `${p.id} link ${from}-${to} established`, r.err || 'failed');
      await settle(9000); // let catch-up finish across this link before the next
    }
    await settle(8000);

    // ── MIXED: one contested region, one independent region ─────────────
    const mixedDocs = {};
    for (const label of ['A', 'B', 'C']) mixedDocs[label] = (await doc(insts[label], mixed.id, mixed.names)).content;

    const mixedOk = ['A', 'B', 'C'].every((label) => {
      const l = L(mixedDocs[label]);
      return (
        (l[0] === MIXED_TEXT.A || l[0] === MIXED_TEXT.B) &&
        l[1] === 'M quiet two.' &&
        l[2] === 'M c-region three. FROM-C.' &&
        l[3] === 'M quiet four.'
      );
    });
    check(mixedOk, `${p.id} MIXED every peer: region 1 contested, region 3 is C's, others unchanged`,
      ['A', 'B', 'C'].map((l) => `${l}:"${L(mixedDocs[l])[0]}"/"${L(mixedDocs[l])[2]}"`).join(' | '));

    const mixedShas = ['A', 'B', 'C'].map((l) => sha(mixedDocs[l]));
    check(new Set(mixedShas).size === 1, `${p.id} MIXED all three peers identical`, mixedShas.join(' / '));

    // If the peers disagree, wait considerably longer and look again. A
    // disagreement that heals is a propagation delay; one that persists with
    // no traffic left to deliver is a divergence.
    if (new Set(mixedShas).size !== 1) {
      await settle(30000);
      const healed = [];
      for (const label of ['A', 'B', 'C']) healed.push(sha((await doc(insts[label], mixed.id, mixed.names)).content));
      check(new Set(healed).size === 1,
        `${p.id} MIXED disagreement resolved after a further 30s`,
        new Set(healed).size === 1 ? `healed to ${healed[0]}` : `still divergent: ${healed.join(' / ')}`);
    }

    // ── SAME: all three contest one region ──────────────────────────────
    const sameDocs = {};
    for (const label of ['A', 'B', 'C']) sameDocs[label] = (await doc(insts[label], same.id, same.names)).content;

    const sameWinnerText = L(sameDocs.A)[0];
    const sameWinner = ['A', 'B', 'C'].find((l) => SAME_TEXT[l] === sameWinnerText) || null;
    check(sameWinner !== null, `${p.id} SAME the surviving region 1 is one of the three edits`,
      `"${sameWinnerText}"`);
    const sameUntouched = ['A', 'B', 'C'].every((label) => {
      const l = L(sameDocs[label]);
      return l[1] === 'S quiet two.' && l[2] === 'S quiet three.';
    });
    check(sameUntouched, `${p.id} SAME no unrelated line changed on any peer`,
      ['A', 'B', 'C'].map((l) => `${l}:"${L(sameDocs[l])[1]}"`).join(' | '));

    const sameShas = ['A', 'B', 'C'].map((l) => sha(sameDocs[l]));
    check(new Set(sameShas).size === 1, `${p.id} SAME all three peers identical`, sameShas.join(' / '));

    if (new Set(sameShas).size !== 1) {
      await settle(30000);
      const healed = [];
      for (const label of ['A', 'B', 'C']) healed.push(sha((await doc(insts[label], same.id, same.names)).content));
      check(new Set(healed).size === 1,
        `${p.id} SAME disagreement resolved after a further 30s`,
        new Set(healed).size === 1 ? `healed to ${healed[0]}` : `still divergent: ${healed.join(' / ')}`);
    }

    // The documented rule, applied to the three identities captured above.
    let predicted = null;
    if (idSame.A && idSame.B && idSame.C) {
      predicted = ['A', 'B', 'C'].reduce((best, l) => (beats(idSame[l], idSame[best]) ? l : best), 'A');
    }
    check(predicted !== null && sameWinner === predicted,
      `${p.id} SAME the winner is the highest (logicalTimestamp, nodeId)`,
      `predicted=${predicted} actual=${sameWinner}` +
      (predicted && idSame[predicted] ? ` (ts=${idSame[predicted].ts})` : ''));

    // ── event log state ─────────────────────────────────────────────────
    for (const label of ['A', 'B', 'C']) {
      const e = await events(insts[label], mixed.id);
      const dupes = e.ids && e.ids.length !== new Set(e.ids).size;
      check(!dupes && e.rebuilt, `${p.id} ${label} event log has no duplicates and rebuilds`,
        `${(e.types || []).length} entries: ${(e.types || []).join(',')}`);
    }

    summary.push({
      permutation: p.id,
      order: p.order.map((x) => x.join('-')).join(' > '),
      mixedSha: mixedShas.join('/'),
      sameSha: sameShas.join('/'),
      mixedAgreed: new Set(mixedShas).size === 1,
      sameAgreed: new Set(sameShas).size === 1,
      sameWinner,
      predicted,
    });
  } catch (err) {
    check(false, `${p.id} permutation ran to completion`, err.message?.split('\n')[0] || String(err));
  } finally {
    for (const label of ['A', 'B', 'C']) {
      const inst = insts[label];
      if (inst?.app) await inst.app.close().catch(() => { });
      if (inst?.userData) fs.rmSync(inst.userData, { recursive: true, force: true });
    }
  }
}

(async () => {
  console.log('DocuSync -- three-peer order independence (6 link orders, fresh instances each)\n');
  try {
    for (const p of PERMUTATIONS) await runPermutation(p);

    phase('Determinism across orders');
    console.log('  permutation | link order                  | MIXED            | SAME             | contested region');
    for (const s of summary) {
      console.log(`  ${s.permutation.padEnd(11)} | ${s.order.padEnd(27)} | MIXED ${s.mixedAgreed ? 'agreed  ' : 'DIVERGED'} | SAME ${s.sameAgreed ? 'agreed  ' : 'DIVERGED'} | winner ${s.sameWinner}${s.sameWinner === s.predicted ? '' : ` (rule said ${s.predicted})`}`);
    }

    check(summary.length === PERMUTATIONS.length, 'every permutation produced a result',
      `${summary.length}/${PERMUTATIONS.length}`);

    // Comparing raw hashes ACROSS permutations would be the wrong test. Each
    // permutation launches fresh instances, so the node ids are new every
    // time, and a node id is the documented tie-breaker when two edits carry
    // the same logical timestamp. A different winner across two permutations
    // can therefore be the rule working correctly on different inputs.
    //
    // The property that must hold is that the final state is a function of
    // the edits, their timestamps and their node ids ALONE -- never of the
    // order the links came up. That is what these two checks state: within
    // each permutation all three peers agree, and in every permutation the
    // contested region went to the peer the rule names.
    const agreeing = summary.filter((s) => s.mixedAgreed && s.sameAgreed).length;
    check(agreeing === summary.length,
      'every permutation reached a single agreed state on all three peers',
      `${agreeing}/${summary.length}` +
      (agreeing === summary.length ? '' : ' — divergent: ' +
        summary.filter((s) => !s.mixedAgreed || !s.sameAgreed)
          .map((s) => `${s.permutation}(${!s.mixedAgreed ? 'MIXED' : ''}${!s.mixedAgreed && !s.sameAgreed ? '+' : ''}${!s.sameAgreed ? 'SAME' : ''})`)
          .join(' ')));

    const ruleHeld = summary.filter((s) => s.sameWinner && s.sameWinner === s.predicted);
    check(ruleHeld.length === summary.length,
      'the contested region went to the highest (logicalTimestamp, nodeId) in EVERY link order',
      `${ruleHeld.length}/${summary.length} — ` +
      summary.map((s) => `${s.permutation}:${s.sameWinner}${s.sameWinner === s.predicted ? '' : `(expected ${s.predicted})`}`).join(' '));

    info('final hashes differ between permutations by design',
      'fresh instances mean fresh node ids, and the node id is the documented tie-breaker');
  } catch (err) {
    check(false, 'suite ran to completion', err.message?.split('\n')[0] || String(err));
  } finally {
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
    fs.writeFileSync(path.join(__dirname, 'qa-order-determinism-results.json'),
      JSON.stringify({ results, summary }, null, 2));
  }
})();
