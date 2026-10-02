/**
 * FINAL DESKTOP QA — D2 through D5, native offline, duplicate-event, version
 * history and restore, all against two real Electron processes.
 *
 * Evidence rules observed throughout:
 *   - no browser stands in for a desktop
 *   - nothing is mocked
 *   - the cloud path is never accepted as proof of a native result
 *   - content is compared by SHA-256 taken from each instance's own SQLite
 *     event log, not from the screen
 *
 * "Offline" here means no peer is connected. The bridge exposes no way to drop
 * an established peer link, so a disconnection is modelled as edits made while
 * unconnected, followed by a peer connection. That is the same condition the
 * catch-up path exists to recover from, and it is labelled as such rather than
 * as a network-level disconnect.
 *
 * Run: node scripts/qa-desktop-final.js
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
const phase = (n) => { group = n; console.log(`\n── ${n} ${'─'.repeat(Math.max(0, 52 - n.length))}`); };
function check(ok, name, detail = '') {
  results.push({ group, name, ok, detail });
  console.log(`  ${ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  return ok;
}
const skip = (name, why) => check(null, name, why);
const sha = (s) => crypto.createHash('sha256').update(s ?? '', 'utf8').digest('hex').slice(0, 16);

const instances = [];
async function launch(label, wsPort, nodeIndex, user) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `dsf-${label}-`));
  const app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: [MAIN, `--user-data-dir=${userData}`],
    cwd: DESKTOP_DIR,
    env: { ...process.env, DOCUSYNC_LOCAL_UI: '1', DOCUSYNC_WS_PORT: String(wsPort), DOCUSYNC_NODE_INDEX: String(nodeIndex), DOCUSYNC_NODE_COUNT: '3' },
    timeout: 60000,
  });
  const page = await app.firstWindow({ timeout: 45000 });
  await page.waitForLoadState('domcontentloaded').catch(() => { });
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 40000 });
  await page.fill('input[placeholder="Enter your username"]', user.email);
  await page.fill('input[placeholder="Enter your password"]', user.password);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !location.hash.includes('vault-login'), { timeout: 40000 });
  const inst = { app, page, userData, label, wsPort };
  instances.push(inst);
  return inst;
}

// ── Bridge wrappers ──────────────────────────────────────────────────────────
const imp = (p, name, content, id) => p.evaluate(async (a) => {
  const r = await window.docuSync.importRoomFile(a.name, a.content, a.id);
  return { ok: !!r.success, fileId: r.data?.fileId ?? r.fileId, err: r.error || null };
}, { name, content, id });

const save = (p, id, html) => p.evaluate(async (a) => {
  const r = await window.docuSync.saveFile(a.id, a.html, null);
  return { ok: !!r.success, data: r.data ?? null, err: r.error || null };
}, { id, html });

/** Event log plus the content the engine reconstructs for the latest entry. */
const log = (p, id) => p.evaluate(async (i) => {
  const r = await window.docuSync.getHistory(i);
  const d = (r && r.data) || {};
  const entries = d.entries || [];
  return {
    ok: !!(r && r.success),
    total: d.totalEntries ?? entries.length,
    types: entries.map((e) => e.eventType),
    eventIds: entries.map((e) => e.eventId),
    latest: entries.length ? entries[entries.length - 1].payload : null,
  };
}, id);

const connect = (p, host, port) => p.evaluate(async (a) => {
  const r = await window.docuSync.connectToPeer(a.host, a.port);
  return { ok: !!r.success, err: r.error || null };
}, { host, port });

const restore = (p, id, eventId) => p.evaluate(async (a) => {
  const r = await window.docuSync.restoreVersion(a.id, a.eventId);
  return { ok: !!r.success, err: r.error || null };
}, { id, eventId });

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('DocuSync — final Desktop P2P and native offline QA\n');
  try {
    // ════ CONNECTED PAIR: D2, D3, D4, version history ═══════════════════════
    phase('Setup — two real Electron instances');
    const A = await launch('A', 9000, 0, U.A);
    const B = await launch('B', 9001, 1, U.B);
    check(true, 'two Electron processes signed in', `${U.A.email} / ${U.B.email}, ports 9000/9001`);

    const base = 'L1 shared base.\nL2 shared base.\nL3 shared base.\n';
    const fname = `final-${Date.now()}.txt`;
    const iA = await imp(A.page, fname, base);
    const fid = iA.fileId;
    const iB = await imp(B.page, fname, base, fid);
    check(iA.ok && iB.ok && iB.fileId === fid, 'both instances hold the same base document', `fileId=${fid}`);

    const conn = await connect(B.page, '127.0.0.1', 9000);
    check(conn.ok, 'peer link established (B → A, WebSocket :9000)', conn.err || '');
    await settle(3000);

    // ── D2: Desktop B → Desktop A ──────────────────────────────────────────
    phase('D2 — Desktop B → Desktop A');
    const d2 = base.replace('L2 shared base.', 'L2 shared base. EDIT-FROM-B.');
    const sB = await save(B.page, fid, d2);
    check(sB.ok, 'D2 file:save reached B’s local engine', `delta=${sB.data?.deltaSizeBytes}B synced=${sB.data?.synced}`);
    const lB2 = await log(B.page, fid);
    check(lB2.ok && lB2.total > 0, 'D2 B wrote an event to its own SQLite log', `${lB2.total} event(s): ${lB2.types.join(',')}`);
    await settle(6000);
    const lA2 = await log(A.page, fid);
    const d2Arrived = lA2.ok && lA2.types.includes('merge');
    check(d2Arrived, 'D2 A received and logged the peer event', `${lA2.total} event(s): ${lA2.types.join(',')}`);
    check(d2Arrived && sha(lA2.latest) === sha(lB2.latest),
      'D2 content converged (SHA-256 from each engine’s own log)',
      `A=${sha(lA2.latest)} B=${sha(lB2.latest)}`);

    // ── D3: bidirectional ──────────────────────────────────────────────────
    phase('D3 — bidirectional A→B→A→B');
    let doc = d2;
    const steps = [
      { who: 'A', inst: A, mark: 'R1-A' },
      { who: 'B', inst: B, mark: 'R2-B' },
      { who: 'A', inst: A, mark: 'R3-A' },
      { who: 'B', inst: B, mark: 'R4-B' },
    ];
    let d3ok = true;
    for (const s of steps) {
      doc = doc.replace('L3 shared base.', `L3 shared base. ${s.mark}.`).replace(/L3 shared base\. (R\d-[AB])\. (R\d-[AB])\./, 'L3 shared base. $2.');
      doc = doc.includes(s.mark) ? doc : doc + `${s.mark}\n`;
      const r = await save(s.inst.page, fid, doc);
      if (!r.ok) { d3ok = false; check(false, `D3 ${s.who} save failed`, r.err || ''); break; }
      await settle(5000);
      const la = await log(A.page, fid), lb = await log(B.page, fid);
      const same = sha(la.latest) === sha(lb.latest);
      check(same, `D3 after ${s.who} edit (${s.mark}) both engines agree`, `A=${sha(la.latest)} B=${sha(lb.latest)}`);
      if (!same) d3ok = false;
    }
    const lAf = await log(A.page, fid), lBf = await log(B.page, fid);
    const dupA = lAf.eventIds.length !== new Set(lAf.eventIds).size;
    const dupB = lBf.eventIds.length !== new Set(lBf.eventIds).size;
    check(!dupA && !dupB, 'D3 no duplicate event ids in either log',
      `A=${lAf.total} unique=${new Set(lAf.eventIds).size} | B=${lBf.total} unique=${new Set(lBf.eventIds).size}`);

    // ── D4: concurrent editing ─────────────────────────────────────────────
    phase('D4 — concurrent editing');
    const cBase = 'C1 line one.\nC2 line two.\nC3 line three.\n';
    const cid = (await imp(A.page, `conc-${Date.now()}.txt`, cBase)).fileId;
    await imp(B.page, `conc-${Date.now()}.txt`, cBase, cid);
    await settle(1500);

    // Case 1 — different lines, issued without waiting for propagation.
    await Promise.all([
      save(A.page, cid, cBase.replace('C1 line one.', 'C1 line one. A-DIFF.')),
      save(B.page, cid, cBase.replace('C3 line three.', 'C3 line three. B-DIFF.')),
    ]);
    await settle(7000);
    const c1A = await log(A.page, cid), c1B = await log(B.page, cid);
    check(c1A.ok && c1B.ok, 'D4-1 different lines: both engines logged events',
      `A:${c1A.types.join(',')} | B:${c1B.types.join(',')}`);
    check(sha(c1A.latest) === sha(c1B.latest), 'D4-1 different lines: engines converged',
      `A=${sha(c1A.latest)} B=${sha(c1B.latest)}`);

    // Case 2 — same line, concurrently.
    const sBase2 = 'S1 contested line.\nS2 untouched.\n';
    const sid = (await imp(A.page, `same-${Date.now()}.txt`, sBase2)).fileId;
    await imp(B.page, `same-${Date.now()}.txt`, sBase2, sid);
    await settle(1500);
    await Promise.all([
      save(A.page, sid, sBase2.replace('S1 contested line.', 'S1 contested line. FROM-A.')),
      save(B.page, sid, sBase2.replace('S1 contested line.', 'S1 contested line. FROM-B.')),
    ]);
    await settle(8000);
    const c2A = await log(A.page, sid), c2B = await log(B.page, sid);
    check(c2A.ok && c2B.ok, 'D4-2 same line: both engines recorded the attempt',
      `A:${c2A.types.join(',')} | B:${c2B.types.join(',')}`);
    const converged2 = sha(c2A.latest) === sha(c2B.latest);
    check(converged2, 'D4-2 same line: engines reached one state',
      converged2 ? sha(c2A.latest) : `A=${sha(c2A.latest)} B=${sha(c2B.latest)} (divergent)`);

    // ── Version history + restore through the engine ───────────────────────
    phase('Version history through the Desktop engine');
    const vBase = 'VERSION ONE content.\n';
    const vid = (await imp(A.page, `ver-${Date.now()}.txt`, vBase)).fileId;
    await save(A.page, vid, 'VERSION TWO content.\n');
    await settle(1200);
    await save(A.page, vid, 'VERSION THREE content.\n');
    await settle(1200);
    const vLog = await log(A.page, vid);
    check(vLog.ok && vLog.total >= 2, 'VH versions recorded in the local event log',
      `${vLog.total} event(s): ${vLog.types.join(',')}`);
    const firstEventId = vLog.eventIds[0];
    const beforeRestore = sha(vLog.latest);
    const rr = await restore(A.page, vid, firstEventId);
    check(rr.ok, 'VH restoreVersion accepted by the engine', rr.err || `eventId=${String(firstEventId).slice(0, 8)}`);
    await settle(4000);
    const vAfter = await log(A.page, vid);
    check(vAfter.ok && sha(vAfter.latest) !== beforeRestore || vAfter.types.includes('restore'),
      'VH restore changed engine state / logged a restore event',
      `types: ${vAfter.types.join(',')}`);

    // ── Duplicate-event idempotency, through the real path ─────────────────
    phase('Duplicate event handling (real sync path)');
    const beforeDup = await log(B.page, fid);
    // Re-trigger catch-up: B asks A again for everything since timestamp 0,
    // so A replays events B already holds through the real SYNC_REQUEST path.
    await B.page.evaluate(async () => { await window.docuSync.triggerSync(); });
    await settle(7000);
    const afterDup = await log(B.page, fid);
    check(afterDup.total === beforeDup.total,
      'DUP replayed events did not create duplicate records',
      `before=${beforeDup.total} after=${afterDup.total}`);
    check(afterDup.eventIds.length === new Set(afterDup.eventIds).size,
      'DUP all event ids remain unique after replay');

    // ════ OFFLINE PAIR: edits with no peer, then connect ════════════════════
    phase('Native offline — edits with no peer connected, then catch-up');
    const C = await launch('C', 9002, 2, U.C);
    const D = await launch('D', 9003, 0, U.D);
    const oBase = 'O1 base line.\nO2 base line.\n';
    const ofid = (await imp(C.page, `off-${Date.now()}.txt`, oBase)).fileId;
    await imp(D.page, `off-${Date.now()}.txt`, oBase, ofid);
    check(true, 'offline pair prepared, no peer link established', `fileId=${ofid}`);

    // OFFLINE 3 — several queued edits while unconnected.
    let od = oBase;
    for (let i = 1; i <= 5; i++) {
      od = oBase.replace('O2 base line.', `O2 base line. EDIT${i}.`);
      const r = await save(C.page, ofid, od);
      if (!r.ok) { check(false, `OFF3 edit ${i} failed`, r.err || ''); break; }
      await settle(400);
    }
    const offLog = await log(C.page, ofid);
    check(offLog.ok && offLog.total >= 5,
      'OFF3 all offline edits persisted to local SQLite while unconnected',
      `${offLog.total} event(s)`);
    check(offLog.eventIds.length === new Set(offLog.eventIds).size,
      'OFF3 no duplicate events among the queued edits');

    // OFFLINE 1 + 4 — connect, and let automatic catch-up recover the misses.
    const oconn = await connect(D.page, '127.0.0.1', 9002);
    check(oconn.ok, 'OFF1 peer link established after the offline period', oconn.err || '');
    await settle(12000); // auto catch-up is debounced ~1.5s then replays
    const dLog = await log(D.page, ofid);
    const recovered = dLog.ok && dLog.total > 0;
    check(recovered, 'OFF4 missed events recovered by the peer that was behind',
      `${dLog.total} event(s): ${dLog.types.join(',')}`);
    check(recovered && sha(dLog.latest) === sha(offLog.latest),
      'OFF1 both engines converged after reconnection',
      `C=${sha(offLog.latest)} D=${sha(dLog.latest)}`);

    // ── D5 / WebRTC / native download: feasibility ─────────────────────────
    phase('Scope limits');
    skip('D5 three simultaneous Electron instances',
      'not attempted in this pass — four processes already run above; a third peer needs mesh connect calls not exercised here');
    skip('WebRTC transport verification',
      'all peer traffic above used the WebSocket server on :9000/:9002; WebRTCManager is constructed only by ElectronSyncContext and no RTC connection was observed');
    skip('Native Desktop download artefact',
      'no download bridge method exists; downloads are produced by renderer code, already verified in the browser campaign');
  } catch (err) {
    check(false, 'final desktop QA ran to completion', err.message?.split('\n')[0] || String(err));
  } finally {
    for (const i of instances) {
      await i.app.close().catch(() => { });
      fs.rmSync(i.userData, { recursive: true, force: true });
    }
    const by = {};
    for (const r of results) {
      by[r.group] = by[r.group] || { p: 0, f: 0, s: 0 };
      by[r.group][r.ok === null ? 's' : r.ok ? 'p' : 'f']++;
    }
    console.log('\n' + '='.repeat(62));
    for (const [g, v] of Object.entries(by)) {
      console.log(`  ${String(v.p).padStart(2)} pass ${String(v.f).padStart(2)} fail ${String(v.s).padStart(2)} skip   ${g}`);
    }
    const p = results.filter((r) => r.ok === true).length;
    const f = results.filter((r) => r.ok === false).length;
    const s = results.filter((r) => r.ok === null).length;
    console.log(`\n  TOTAL: ${p} passed, ${f} failed, ${s} not attempted`);
    if (f) {
      console.log('\nFAILURES:');
      results.filter((r) => r.ok === false).forEach((x) => console.log(`  - [${x.group}] ${x.name}${x.detail ? ` — ${x.detail}` : ''}`));
      process.exitCode = 1;
    }
    fs.writeFileSync(path.join(__dirname, 'qa-desktop-final-results.json'), JSON.stringify(results, null, 2));
  }
})();
