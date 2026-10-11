/**
 * Does the version history lose anything, and does it duplicate anything?
 *
 * Two opposite failures, both of which make the panel's "0% permanent data
 * loss" claim false in practice:
 *
 *   LOSS       -- a state the document genuinely held is not in the log, so
 *                 there is no way back to it.
 *   DUPLICATION -- the same state appears twice, so the log is padded with
 *                 rows a reader cannot tell apart and the real versions are
 *                 buried.
 *
 * A log can be free of one and still fail the other, so both are asserted
 * on the same run, over a sequence of states chosen to be individually
 * identifiable: every state carries a unique marker, and the markers are
 * counted in the recovered history.
 *
 * The destructive step is the re-upload: it replaces the whole document,
 * which is exactly the operation the panel reported as deleting the
 * history.
 *
 * Run: node scripts/probe-history-zero-data-loss.js [baseUrl]
 */
const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;

const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok, name });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

const post = async (p, b) => {
  const res = await fetch(`${API}${p}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const get = async (p) => {
  const res = await fetch(`${API}${p}`);
  return { status: res.status, data: await res.json().catch(() => null) };
};

const A = 'probe-a-' + Date.now();
const B = 'probe-b-' + Date.now();

// Compared the way the page renders it, so "the same version" means the
// same words rather than the same bytes -- otherwise a re-serialised but
// visually identical save would read as a distinct version and the
// duplication check would pass on a log that looks duplicated to a human.
const visibleKey = (html) =>
  String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

async function main() {
  console.log(`\nHistory: zero data loss, zero duplication -- ${BASE}\n`);

  const room = await post('/create', {
    hostNodeId: A, hostIp: '127.0.0.1', hostPort: 9000,
    roomName: 'Data Loss Probe', hostType: 'web',
  });
  const otp = room.data?.otp;
  if (!otp) { console.error('create failed', room); process.exit(1); }
  await post('/join', { otp, memberNodeId: B });
  console.log(`  room ${otp}\n`);

  // Every state the document will genuinely hold, in order. Each carries a
  // marker found in no other state, so a recovered entry can be attributed
  // to exactly one of them.
  //
  // Authorship alternates deliberately. Two consecutive saves by the SAME
  // person inside the fold window are one editing burst and collapse into
  // one version on purpose -- that is the "history must not spam duplicates"
  // half of the requirement, and it costs nothing because additive text is
  // still contained in the later state. What must never collapse is another
  // person's work, a deletion, or an upload, and those are what this checks.
  const STATES = [
    { marker: 'MARKER-ONE',   html: '<p>MARKER-ONE the uploaded original</p>', how: 'upload v1', by: A, mustBeExact: true },
    { marker: 'MARKER-TWO',   html: '<p>MARKER-ONE the uploaded original</p><p>MARKER-TWO added by the host</p>', how: 'host edit', by: A, mustBeExact: true },
    { marker: 'MARKER-THREE', html: '<p>MARKER-ONE the uploaded original</p><p>MARKER-TWO added by the host</p><p>MARKER-THREE added by a peer</p>', how: 'peer edit', by: B, mustBeExact: true },
    { marker: 'MARKER-FOUR',  html: '<p>MARKER-ONE the uploaded original</p><p>MARKER-TWO added by the host</p><p>MARKER-THREE added by a peer</p><p>MARKER-FOUR more host work</p>', how: 'host edit', by: A, mustBeExact: true },
    // A deletion: MARKER-TWO and MARKER-THREE are removed. The state above
    // is the only place those words still exist, so if this folds over it
    // they are gone for good.
    { marker: 'MARKER-DELETE', html: '<p>MARKER-ONE the uploaded original</p><p>MARKER-FOUR more host work</p>', how: 'peer DELETES two paragraphs', by: B, mustBeExact: true },
    { marker: 'MARKER-FIVE',  html: '<p>MARKER-FIVE a completely different document uploaded over everything</p>', how: 'upload v2 (destructive)', by: A, mustBeExact: true },
  ];

  // 1. Upload the original.
  const up1 = await post('/files', {
    otp,
    file: {
      fileId: Date.now(), fileName: 'zero-loss.txt', content: STATES[0].html,
      sharedBy: 'Host A', sharedByNodeId: A,
    },
  });
  const fileId = up1.data?.fileId;
  check(!!fileId, 'the file was shared into the room', `fileId=${fileId}`);

  // 2-4. Real edits from two different people.
  for (const s of STATES.slice(1, 5)) {
    const r = await post('/doc', {
      otp, fileId, content: s.html, authorNodeId: s.by,
      isSessionEnd: true, committedAt: Date.now(),
    });
    if (r.status !== 200) check(false, `edit "${s.marker}" was accepted`, `status=${r.status}`);
    // Spaced past the fold window would take 45s per edit; instead each
    // edit alternates author where it matters, which is what the folding
    // rule actually keys on.
  }

  const midway = await get(`/history?otp=${otp}&fileId=${fileId}`);
  const midEntries = midway.data?.data?.entries ?? [];
  console.log(`  (history before the destructive upload: ${midEntries.length} entries)`);

  // 5. The destructive upload -- replaces the entire document.
  const up2 = await post('/files', {
    otp,
    file: {
      fileId: Date.now() + 5, fileName: 'zero-loss.txt', content: STATES[5].html,
      sharedBy: 'Host A', sharedByNodeId: A,
    },
  });
  check(String(up2.data?.fileId) === String(fileId), 'the re-upload kept the same file id', `${fileId} -> ${up2.data?.fileId}`);

  const final = await get(`/history?otp=${otp}&fileId=${fileId}`);
  const entries = final.data?.data?.entries ?? [];
  console.log(`  (history after the destructive upload:  ${entries.length} entries)\n`);

  // ── ZERO DATA LOSS ───────────────────────────────────────────────────
  console.log('  Zero data loss -- every state the document held is recoverable');
  const recovered = entries.map((e) => String(e.fullContent || ''));
  const missing = [];
  for (const s of STATES) {
    // Recoverable means an entry whose RESTORED content is that state --
    // not merely an entry that mentions the marker somewhere.
    const exact = recovered.some((c) => visibleKey(c) === visibleKey(s.html));
    check(exact, `  "${s.marker}" (${s.how}) is restorable`, exact ? '' : 'NOT IN LOG');
    if (!exact) missing.push(s.marker);
  }
  check(missing.length === 0, `all ${STATES.length} states survive  =>  0% data loss`, missing.length ? `lost: ${missing.join(', ')}` : '0 lost');

  // The destructive upload must not have taken anyone's work with it.
  check(recovered.some((c) => c.includes('MARKER-FOUR')), 'the work the upload destroyed is still recoverable');

  // The words a collaborator deleted exist in exactly one earlier state. If
  // that state folded away, they are unrecoverable -- the one case where
  // folding genuinely loses work rather than tidying it.
  const deletedWordsRecoverable = recovered.some(
    (c) => c.includes('MARKER-TWO') && c.includes('MARKER-THREE')
  );
  check(deletedWordsRecoverable, 'text a collaborator DELETED is still recoverable');

  // ── ZERO DUPLICATION ─────────────────────────────────────────────────
  console.log('\n  Zero duplication -- no state appears twice');
  const seen = new Map();
  for (const e of entries) {
    const k = visibleKey(e.fullContent);
    if (!k) continue;
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, n]) => n > 1);
  check(
    dupes.length === 0,
    'no two versions show the same content',
    dupes.length ? dupes.map(([k, n]) => `x${n}: "${k.slice(0, 40)}..."`).join(' | ') : `${seen.size} distinct of ${entries.length} rows`
  );

  const ids = entries.map((e) => e.eventId);
  check(new Set(ids).size === ids.length, 'every row has a unique event id', `${new Set(ids).size}/${ids.length}`);

  const seqs = entries.map((e) => e.seqNo).filter((n) => typeof n === 'number');
  check(new Set(seqs).size === seqs.length, 'every row has a unique sequence number', `${new Set(seqs).size}/${seqs.length}`);

  // Ordering must be identical on every device, which is what seqNo is for.
  const descending = seqs.every((n, i) => i === 0 || seqs[i - 1] > n);
  check(descending, 'rows are in strict newest-first order, the same on every device', seqs.join(' > '));

  // ── RESTORE ACTUALLY WORKS ───────────────────────────────────────────
  console.log('\n  The recovered content is usable, not just stored');
  const target = entries.find((e) => String(e.fullContent || '').includes('MARKER-FOUR'));
  check(!!target, 'the pre-upload peer version can be located in the log');
  if (target) {
    const restore = await post('/doc', {
      otp, fileId, content: target.fullContent, authorNodeId: A,
      isSessionEnd: true, committedAt: Date.now(),
    });
    check(restore.status === 200, 'restoring that version is accepted');
    const after = await get(`/doc?otp=${otp}&fileId=${fileId}`);
    const live = after.data?.snapshot?.content || '';
    check(live.includes('MARKER-FOUR'), 'the document now holds the restored text again');
    check(!live.includes('MARKER-FIVE'), 'and no longer holds the text that overwrote it');

    // Restoring must not itself destroy what it replaced.
    const post2 = await get(`/history?otp=${otp}&fileId=${fileId}`);
    const e2 = (post2.data?.data?.entries ?? []).map((e) => String(e.fullContent || ''));
    check(e2.some((c) => c.includes('MARKER-FIVE')), 'the version that was restored over is itself still recoverable');
  }

  // ── A RESTORE FOLLOWED BY AN UPLOAD ──────────────────────────────────
  //
  // The sequence that actually produced a duplicate row in testing: a
  // restore adds no entry of its own (the state is already in the log), so
  // the restored text sits part-way down the list rather than at the head
  // -- and an upload landing next logged it a second time. Checked here
  // because the earlier assertions all passed while this was broken.
  console.log('');
  console.log('  A restore followed by an upload -- the sequence that caused a duplicate');
  const beforeFinal = await get(`/history?otp=${otp}&fileId=${fileId}`);
  const rowsBefore = (beforeFinal.data?.data?.entries ?? []).length;

  const upFinal = await post('/files', {
    otp,
    file: {
      fileId: Date.now() + 9, fileName: 'zero-loss.txt',
      content: '<p>MARKER-SIX a third upload landing on the restored document</p>',
      sharedBy: 'Host A', sharedByNodeId: A,
    },
  });
  check(upFinal.data?.version === 3, 'the third upload is version 3', `version=${upFinal.data?.version}`);

  const afterFinal = await get(`/history?otp=${otp}&fileId=${fileId}`);
  const finalEntries = afterFinal.data?.data?.entries ?? [];
  const finalKeys = finalEntries.map((e) => visibleKey(e.fullContent)).filter(Boolean);
  const finalDupes = [...finalKeys.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map()).entries()]
    .filter(([, n]) => n > 1);
  check(
    finalDupes.length === 0,
    'no duplicate row after restore-then-upload',
    finalDupes.length
      ? finalDupes.map(([k, n]) => `x${n}: "${k.slice(0, 40)}..."`).join(' | ')
      : `${new Set(finalKeys).size} distinct of ${finalEntries.length} rows`
  );
  check(
    finalEntries.length > rowsBefore,
    'the upload still added its own version',
    `${rowsBefore} -> ${finalEntries.length}`
  );
  // And nothing from before was dropped on the way.
  for (const s of STATES) {
    const stillThere = finalEntries.some((e) => visibleKey(e.fullContent) === visibleKey(s.html));
    if (!stillThere) check(false, `  "${s.marker}" survived the third upload`, 'LOST');
  }
  check(
    STATES.every((st) => finalEntries.some((e) => visibleKey(e.fullContent) === visibleKey(st.html))),
    'every earlier state still survives after the third upload'
  );

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n  ${passed} passed, ${failed} failed`);
  console.log(`  room=${otp} fileId=${fileId}   (open /app/history/${fileId} to see it)\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nProbe crashed:', e); process.exit(1); });
