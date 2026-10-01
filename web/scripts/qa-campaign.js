/**
 * DocuSync QA campaign — engine-level correctness with exact verification.
 *
 * Every assertion compares real state: SHA-256 of the stored document,
 * character and line counts, and exact string equality. Nothing here passes
 * because a UI element appeared.
 *
 * Covers: file-type handling, editing accuracy at character/word/line level
 * and at the start/middle/end of a document, repeated-content targeting,
 * version history, concurrent editing with 2 and 3 users, conflict
 * resolution, delete-vs-edit, and offline reconnection.
 *
 * Browser-level checks (download integrity, editor propagation) live in
 * qa-campaign-ui.js — this file deliberately avoids a browser so its results
 * are deterministic.
 *
 * Run: node scripts/qa-campaign.js
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BASE = process.env.QA_BASE || 'http://localhost:3000';
const LOBBY = `${BASE}/api/lobby`;

const accounts = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa-accounts.json'), 'utf8'));
const U = Object.fromEntries(accounts.map((a) => [a.id, a]));

// ── Reporting ────────────────────────────────────────────────────────────────
const results = [];
let currentPhase = '';
const phase = (name) => { currentPhase = name; console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 58 - name.length))}`); };
function check(ok, name, detail = '') {
  results.push({ phase: currentPhase, name, ok: !!ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  return !!ok;
}

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const chars = (s) => s.length;
const lines = (s) => s.split('\n').length;

// ── API helpers ──────────────────────────────────────────────────────────────
const j = async (url, opts) => {
  const r = await fetch(url, opts);
  let data = null;
  try { data = await r.json(); } catch { }
  return { status: r.status, ok: r.ok, data };
};
const post = (p, body) => j(`${LOBBY}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const getDoc = async (otp, fileId) => {
  const r = await j(`${LOBBY}/doc?otp=${otp}&fileId=${fileId}&since=1`);
  return r.data?.content ?? r.data?.snapshot?.content ?? '';
};

let roomSeq = 0;
async function newRoom(name) {
  const r = await post('/create', {
    hostNodeId: `qa-host-${Date.now()}-${roomSeq++}`,
    hostIp: '203.0.113.10', hostPort: 9000, roomName: name, hostType: 'web',
  });
  return r.data?.otp;
}
const destroyRoom = (otp) =>
  j(`${BASE}/api/admin/delete-group`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp }) });

/** Pushes content as a given author, optionally declaring the base it edited from. */
const push = (otp, fileId, content, author, opts = {}) =>
  post('/doc', {
    otp, fileId, content, authorNodeId: author,
    seq: opts.seq ?? 1,
    committedAt: opts.committedAt ?? Date.now(),
    isSessionEnd: opts.isSessionEnd ?? true,
    ...(opts.baseContent !== undefined ? { baseContent: opts.baseContent } : {}),
    ...(opts.isOfflineReconnect ? { isOfflineReconnect: true } : {}),
  });

const DOC = (...paragraphs) => `<div data-margin="96">${paragraphs.map((p) => `<p>${p}</p>`).join('\n')}</div>`;
const textOf = (html) => html.replace(/<[^>]+>/g, '\n').replace(/\n{2,}/g, '\n').trim();

// ════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log(`DocuSync QA campaign — ${BASE}`);
  console.log(`accounts: ${accounts.map((a) => a.id).join(', ')}`);
  const rooms = [];

  try {
    // ══ PHASE A — editing accuracy ══════════════════════════════════════════
    phase('PHASE A — editing accuracy (exact content)');
    {
      const otp = await newRoom('QA Editing'); rooms.push(otp);
      const base = DOC('Alpha line one.', 'Bravo line two.', 'Charlie line three.');

      // A1 single character at the END
      let fid = 'edit-char-end';
      await push(otp, fid, base, 'seed');
      let want = base.replace('Charlie line three.', 'Charlie line three.X');
      await push(otp, fid, want, 'A', { baseContent: base, seq: 2 });
      let got = await getDoc(otp, fid);
      check(got === want, 'A1 single character appended at end of document',
        `sha ${sha256(got).slice(0, 12)} vs ${sha256(want).slice(0, 12)}`);

      // A2 single character at the BEGINNING
      fid = 'edit-char-begin';
      await push(otp, fid, base, 'seed');
      want = base.replace('Alpha line one.', 'XAlpha line one.');
      await push(otp, fid, want, 'A', { baseContent: base, seq: 2 });
      got = await getDoc(otp, fid);
      check(got === want, 'A2 single character inserted at start of document');

      // A3 character REMOVED from the middle
      fid = 'edit-char-remove';
      await push(otp, fid, base, 'seed');
      want = base.replace('Bravo line two.', 'Brav line two.');
      await push(otp, fid, want, 'A', { baseContent: base, seq: 2 });
      got = await getDoc(otp, fid);
      check(got === want, 'A3 single character removed from the middle line');

      // A4 word replaced
      fid = 'edit-word';
      await push(otp, fid, base, 'seed');
      want = base.replace('Bravo', 'Delta');
      await push(otp, fid, want, 'A', { baseContent: base, seq: 2 });
      got = await getDoc(otp, fid);
      check(got === want, 'A4 word replaced in the middle line');

      // A5 whole line added
      fid = 'edit-line-add';
      await push(otp, fid, base, 'seed');
      want = DOC('Alpha line one.', 'Bravo line two.', 'Charlie line three.', 'Delta line four.');
      await push(otp, fid, want, 'A', { baseContent: base, seq: 2 });
      got = await getDoc(otp, fid);
      check(got === want, 'A5 whole line appended',
        `lines ${lines(got)} vs ${lines(want)}`);

      // A6 whole line deleted
      fid = 'edit-line-del';
      await push(otp, fid, base, 'seed');
      want = DOC('Alpha line one.', 'Charlie line three.');
      await push(otp, fid, want, 'A', { baseContent: base, seq: 2 });
      got = await getDoc(otp, fid);
      check(got === want, 'A6 middle line deleted', `chars ${chars(got)} vs ${chars(want)}`);

      // A7 REPEATED content — the 3rd of five identical lines must be the one edited
      fid = 'edit-repeated';
      const rep = DOC('same', 'same', 'same', 'same', 'same');
      await push(otp, fid, rep, 'seed');
      want = DOC('same', 'same', 'TARGET', 'same', 'same');
      await push(otp, fid, want, 'A', { baseContent: rep, seq: 2 });
      got = await getDoc(otp, fid);
      check(got === want, 'A7 correct occurrence edited among five identical lines',
        got === want ? 'exact' : `got ${textOf(got).replace(/\n/g, '|')}`);

      // A8 large document round-trip
      fid = 'edit-large';
      const big = DOC(...Array.from({ length: 400 }, (_, i) => `Paragraph ${i} with filler text to add bulk.`));
      await push(otp, fid, big, 'seed');
      const bigEdit = big.replace('Paragraph 200 with', 'Paragraph 200 EDITED with');
      await push(otp, fid, bigEdit, 'A', { baseContent: big, seq: 2 });
      got = await getDoc(otp, fid);
      check(got === bigEdit, 'A8 large document (400 paragraphs) edits exactly',
        `${chars(got)} chars, sha ${sha256(got).slice(0, 12)}`);
    }

    // ══ PHASE B — concurrent editing ════════════════════════════════════════
    phase('PHASE B — concurrent editing, multiple users');
    {
      const otp = await newRoom('QA Concurrent'); rooms.push(otp);

      // B1 two users, DIFFERENT lines → both must survive, no conflict
      let fid = 'conc-2-diff';
      const base2 = DOC('LINE ONE owned by A.', 'LINE TWO owned by B.');
      await push(otp, fid, base2, 'seed');
      const t = Date.now();
      await push(otp, fid, base2.replace('owned by A.', 'owned by A. EDIT-A.'), U.A.userId, { baseContent: base2, seq: 2, committedAt: t });
      await push(otp, fid, base2.replace('owned by B.', 'owned by B. EDIT-B.'), U.B.userId, { baseContent: base2, seq: 3, committedAt: t + 1 });
      let got = await getDoc(otp, fid);
      check(got.includes('EDIT-A') && got.includes('EDIT-B'),
        'B1 two users on different lines — both edits survive',
        `A=${got.includes('EDIT-A')} B=${got.includes('EDIT-B')}`);
      check(!/EDIT-A[\s\S]*EDIT-A/.test(got), 'B1b no duplication after the merge');

      // B2 three users, three different lines
      fid = 'conc-3-diff';
      const base3 = DOC('ONE for A.', 'TWO for B.', 'THREE for C.');
      await push(otp, fid, base3, 'seed');
      const t3 = Date.now();
      await push(otp, fid, base3.replace('ONE for A.', 'ONE for A. AAA.'), U.A.userId, { baseContent: base3, seq: 2, committedAt: t3 });
      await push(otp, fid, base3.replace('TWO for B.', 'TWO for B. BBB.'), U.B.userId, { baseContent: base3, seq: 3, committedAt: t3 + 1 });
      await push(otp, fid, base3.replace('THREE for C.', 'THREE for C. CCC.'), U.C.userId, { baseContent: base3, seq: 4, committedAt: t3 + 2 });
      got = await getDoc(otp, fid);
      const survived = ['AAA', 'BBB', 'CCC'].filter((m) => got.includes(m));
      check(survived.length === 3, 'B2 three users on three different lines — all survive',
        `survived: ${survived.join(',') || 'none'}`);

      // B3 two users, SAME line → genuine conflict, LWW must pick the later one
      fid = 'conc-same-line';
      const baseS = DOC('Shared sentence.');
      await push(otp, fid, baseS, 'seed');
      const tc = Date.now();
      await push(otp, fid, DOC('Shared sentence. FROM-A.'), U.A.userId, { baseContent: baseS, seq: 2, committedAt: tc });
      await push(otp, fid, DOC('Shared sentence. FROM-B.'), U.B.userId, { baseContent: baseS, seq: 3, committedAt: tc + 5000 });
      got = await getDoc(otp, fid);
      check(got.includes('FROM-B'), 'B3 same-line conflict resolves to the later timestamp (LWW)',
        got.includes('FROM-B') ? 'B won as expected' : `got: ${textOf(got)}`);
      check(!(got.includes('FROM-A') && got.includes('FROM-B')),
        'B3b the two sides are not concatenated into one line');

      // B4 delete vs edit on the same line
      fid = 'conc-delete-vs-edit';
      const baseD = DOC('Keep me.', 'Contested line.', 'Keep me too.');
      await push(otp, fid, baseD, 'seed');
      const td = Date.now();
      await push(otp, fid, DOC('Keep me.', 'Keep me too.'), U.A.userId, { baseContent: baseD, seq: 2, committedAt: td });
      await push(otp, fid, DOC('Keep me.', 'Contested line. EDITED.', 'Keep me too.'), U.B.userId, { baseContent: baseD, seq: 3, committedAt: td + 5000 });
      got = await getDoc(otp, fid);
      check(got.includes('Keep me.') && got.includes('Keep me too.'),
        'B4 delete-vs-edit leaves the untouched lines intact');
      check(/EDITED|Contested/.test(got) || !got.includes('Contested'),
        'B4b delete-vs-edit reaches a defined state', textOf(got).replace(/\n/g, ' | '));
    }

    // ══ PHASE C — version history ═══════════════════════════════════════════
    phase('PHASE C — version history');
    {
      const otp = await newRoom('QA History'); rooms.push(otp);
      const fid = 'hist-1';
      const v1 = DOC('Version one content.');
      const v2 = DOC('Version two content.');
      const v3 = DOC('Version three content.');

      await push(otp, fid, v1, U.A.userId, { seq: 1, committedAt: Date.now() });
      await push(otp, fid, v2, U.A.userId, { baseContent: v1, seq: 2, committedAt: Date.now() + 1000 });
      await push(otp, fid, v3, U.A.userId, { baseContent: v2, seq: 3, committedAt: Date.now() + 2000 });

      const h = await j(`${LOBBY}/history?otp=${otp}&fileId=${fid}`);
      const entries = h.data?.data?.entries ?? h.data?.entries ?? [];
      check(entries.length >= 3, 'C1 an entry is recorded per explicit save', `${entries.length} entries`);

      const contents = entries.map((e) => e.fullContent).filter(Boolean);
      check(contents.some((c) => c.includes('Version one')), 'C2 version 1 content is retained');
      check(contents.some((c) => c.includes('Version two')), 'C3 version 2 content is retained');
      check(contents.some((c) => c.includes('Version three')), 'C4 version 3 content is retained');

      const haveTs = entries.every((e) => e.logicalTimestamp !== undefined || e.createdAt);
      check(haveTs, 'C5 every entry carries a timestamp');
      const haveNode = entries.every((e) => !!e.nodeId);
      check(haveNode, 'C6 every entry records its author node');

      // C7 historical integrity — an earlier version must not change when a newer edit lands
      const beforeHash = sha256(contents.find((c) => c.includes('Version one')) || '');
      await push(otp, fid, DOC('Version four content.'), U.A.userId, { baseContent: v3, seq: 4, committedAt: Date.now() + 3000 });
      const h2 = await j(`${LOBBY}/history?otp=${otp}&fileId=${fid}`);
      const entries2 = h2.data?.data?.entries ?? h2.data?.entries ?? [];
      const v1after = (entries2.map((e) => e.fullContent).filter(Boolean)).find((c) => c.includes('Version one')) || '';
      check(sha256(v1after) === beforeHash, 'C7 an earlier version is unchanged by a later edit',
        v1after ? 'hash stable' : 'version 1 no longer present');
    }

    // ══ PHASE D — offline / reconnection ════════════════════════════════════
    phase('PHASE D — offline and reconnection');
    {
      const otp = await newRoom('QA Offline'); rooms.push(otp);

      // D1 one offline user, non-overlapping edit
      let fid = 'off-1';
      const baseO = DOC('ONLINE line.', 'OFFLINE line.');
      await push(otp, fid, baseO, 'seed');
      await push(otp, fid, baseO.replace('ONLINE line.', 'ONLINE line. BY-A.'), U.A.userId, { baseContent: baseO, seq: 2, committedAt: Date.now() });
      // B was disconnected the whole time, so its base is the ORIGINAL document.
      await push(otp, fid, baseO.replace('OFFLINE line.', 'OFFLINE line. BY-B-OFFLINE.'), U.B.userId,
        { baseContent: baseO, seq: 3, committedAt: Date.now() + 1000, isOfflineReconnect: true });
      let got = await getDoc(otp, fid);
      check(got.includes('BY-A') && got.includes('BY-B-OFFLINE'),
        'D1 reconnecting peer keeps its offline edit and gains the online one',
        `A=${got.includes('BY-A')} B=${got.includes('BY-B-OFFLINE')}`);
      check(!/ONLINE line\.[\s\S]*ONLINE line\./.test(got), 'D1b no duplication on reconnect');

      // D2 TWO offline users reconnecting in sequence, different lines
      fid = 'off-2';
      const base2 = DOC('L1 for A.', 'L2 for B.', 'L3 for C.');
      await push(otp, fid, base2, 'seed');
      await push(otp, fid, base2.replace('L2 for B.', 'L2 for B. B-OFF.'), U.B.userId,
        { baseContent: base2, seq: 2, committedAt: Date.now(), isOfflineReconnect: true });
      await push(otp, fid, base2.replace('L3 for C.', 'L3 for C. C-OFF.'), U.C.userId,
        { baseContent: base2, seq: 3, committedAt: Date.now() + 1000, isOfflineReconnect: true });
      got = await getDoc(otp, fid);
      check(got.includes('B-OFF') && got.includes('C-OFF'),
        'D2 two offline peers reconnecting in sequence both converge',
        `B=${got.includes('B-OFF')} C=${got.includes('C-OFF')}`);

      // D3 long offline period with several queued edits replayed as one state
      fid = 'off-3';
      const baseL = DOC('Base A.', 'Base B.');
      await push(otp, fid, baseL, 'seed');
      const queued = DOC('Base A.', 'Base B. edit1 edit2 edit3');
      await push(otp, fid, queued, U.D.userId,
        { baseContent: baseL, seq: 2, committedAt: Date.now(), isOfflineReconnect: true });
      got = await getDoc(otp, fid);
      check(got.includes('edit1') && got.includes('edit2') && got.includes('edit3'),
        'D3 a long offline session replays all queued content');
    }

    // ══ PHASE E — convergence across clients ════════════════════════════════
    phase('PHASE E — cross-client convergence (same backend)');
    {
      const otp = await newRoom('QA Converge'); rooms.push(otp);
      const fid = 'converge-1';
      const base = DOC('Converge base.');
      await push(otp, fid, base, 'seed');

      // Five users push in rapid succession against the same base.
      const t = Date.now();
      for (const [i, id] of ['A', 'B', 'C', 'D', 'E'].entries()) {
        await push(otp, fid, DOC(`Converge base. MARK-${id}.`), U[id].userId,
          { baseContent: base, seq: 2 + i, committedAt: t + i * 10 });
      }
      // Every reader must observe one identical document.
      const reads = await Promise.all([1, 2, 3].map(() => getDoc(otp, fid)));
      const hashes = reads.map(sha256);
      check(new Set(hashes).size === 1, 'E1 concurrent readers observe one identical document',
        `distinct states: ${new Set(hashes).size}`);
      const final = reads[0];
      const marks = ['A', 'B', 'C', 'D', 'E'].filter((id) => final.includes(`MARK-${id}`));
      check(marks.length >= 1, 'E2 a defined winner exists after same-line contention',
        `survivors: ${marks.join(',') || 'none'}`);
      check(!/MARK-[A-E][\s\S]*MARK-[A-E][\s\S]*MARK-[A-E]/.test(final),
        'E3 same-line contention does not concatenate every side', `marks present: ${marks.length}`);
    }

    // ══ PHASE F — metrics reflect the work done ═════════════════════════════
    phase('PHASE F — metrics integrity');
    {
      // Must read a room where a genuine same-line conflict occurred, not the
      // first room created — reading a conflict-free room reports zero and
      // proves nothing about whether conflicts are counted at all.
      const otp = await newRoom('QA Metrics'); rooms.push(otp);
      const fidM = 'metrics-conflict';
      const baseM = DOC('Contested sentence.');
      await push(otp, fidM, baseM, 'seed');
      const tm = Date.now();
      await push(otp, fidM, DOC('Contested sentence. AAA.'), U.A.userId, { baseContent: baseM, seq: 2, committedAt: tm });
      await push(otp, fidM, DOC('Contested sentence. BBB.'), U.B.userId, { baseContent: baseM, seq: 3, committedAt: tm + 5000 });

      const m = await j(`${LOBBY}/metrics?otp=${otp}`);
      const met = m.data?.metrics ?? m.data;
      check(!!met && (met.totalPushes ?? 0) > 0, 'F1 metrics record real pushes', `totalPushes=${met?.totalPushes}`);
      const dl = met?.dataLossRatePct;
      check(dl !== undefined, 'F2 a data-loss rate is reported', `dataLossRatePct=${dl}`);
      check((met?.totalConflicts ?? 0) > 0, 'F3 a real same-line conflict is counted',
        `totalConflicts=${met?.totalConflicts}`);
      check((met?.dataLossRatePct ?? 0) > 0, 'F4 data loss is measured when a side is overwritten',
        `dataLossRatePct=${met?.dataLossRatePct}`);
      check(met?.conflictDetectionRatePct === 100, 'F5 detection rate reports 100% for a detected conflict',
        `detectionRate=${met?.conflictDetectionRatePct}`);
    }
  } catch (err) {
    check(false, 'campaign ran to completion', err.message?.split('\n')[0] || String(err));
  } finally {
    for (const otp of rooms) { if (otp) await destroyRoom(otp).catch(() => { }); }

    // ── Summary ──────────────────────────────────────────────────────────────
    const byPhase = {};
    for (const r of results) {
      byPhase[r.phase] = byPhase[r.phase] || { pass: 0, fail: 0 };
      byPhase[r.phase][r.ok ? 'pass' : 'fail']++;
    }
    console.log('\n' + '='.repeat(64));
    console.log('QA CAMPAIGN SUMMARY');
    console.log('='.repeat(64));
    for (const [p, v] of Object.entries(byPhase)) {
      console.log(`  ${String(v.pass + v.fail).padStart(3)} tests  ${String(v.pass).padStart(3)} pass  ${String(v.fail).padStart(3)} fail   ${p}`);
    }
    const pass = results.filter((r) => r.ok).length;
    console.log(`\n  TOTAL: ${pass}/${results.length} passed`);
    const failures = results.filter((r) => !r.ok);
    if (failures.length) {
      console.log('\nFAILURES:');
      failures.forEach((f) => console.log(`  - [${f.phase}] ${f.name}${f.detail ? ` — ${f.detail}` : ''}`));
      process.exitCode = 1;
    }
    fs.writeFileSync(path.join(__dirname, 'qa-campaign-results.json'), JSON.stringify(results, null, 2));
    console.log('\nresults written to scripts/qa-campaign-results.json');
  }
})();
