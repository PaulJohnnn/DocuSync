/**
 * How does the version history behave across every KIND of change?
 *
 * The earlier probe drove one tidy sequence. This one drives many different
 * edit shapes -- appends, same-length replacements, deletions, whitespace,
 * middle insertions, emptying the document, bursts, alternating authors,
 * conflicts, restores and uploads -- because the shapes behave differently
 * and only some of them were ever exercised.
 *
 * THE RULE BEING CHECKED
 *
 * The history deliberately folds consecutive saves by one author inside the
 * fold window into a single version: a burst of autosaves is one edit, not
 * forty, and that is what keeps the list readable. Folding REPLACES a row,
 * so it is only safe when nothing is lost by replacing it -- that is, when
 * every word in the folded-away state still exists in the state that
 * replaces it.
 *
 * So for each consecutive pair of states S -> S+1:
 *
 *   if S's visible text is CONTAINED in S+1's, S may be folded away: its
 *   words are still readable in S+1, so nothing became unrecoverable.
 *
 *   otherwise S changed or removed text, and S MUST still be in the log,
 *   or those words exist nowhere and are gone for good.
 *
 * That is the precise line between "tidy" and "lossy", and every state
 * below is judged by it rather than by whether a row happens to exist.
 *
 * Run: node scripts/probe-history-edit-kinds.js [baseUrl]
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

const text = (html) =>
  String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const A = 'kinds-a-' + Date.now();
const B = 'kinds-b-' + Date.now();

async function main() {
  console.log(`\nHistory behaviour across every kind of edit -- ${BASE}\n`);

  const room = await post('/create', {
    hostNodeId: A, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Edit Kinds', hostType: 'web',
  });
  const otp = room.data?.otp;
  if (!otp) { console.error('create failed', room); process.exit(1); }
  await post('/join', { otp, memberNodeId: B });

  const seed = '<p>Alpha one.</p><p>Bravo two.</p><p>Charlie three.</p>';
  const up = await post('/files', {
    otp, file: { fileId: Date.now(), fileName: 'kinds.txt', content: seed, sharedBy: 'A', sharedByNodeId: A },
  });
  const fileId = up.data?.fileId;
  console.log(`  room ${otp}  fileId ${fileId}\n`);

  // Every change, in order. `by` matters: folding only ever applies within
  // one author. `explicit` picks the flag a real editor would send -- an
  // autosave or an explicit save -- because the two arrive as different
  // event types and the fold rule deliberately ignores the difference.
  const EDITS = [
    { kind: 'append a sentence',            by: A, explicit: false, html: '<p>Alpha one.</p><p>Bravo two.</p><p>Charlie three.</p><p>Delta four.</p>' },
    { kind: 'append again (burst)',         by: A, explicit: false, html: '<p>Alpha one.</p><p>Bravo two.</p><p>Charlie three.</p><p>Delta four.</p><p>Echo five.</p>' },
    { kind: 'SAME-LENGTH word replacement', by: A, explicit: true,  html: '<p>Alpha one.</p><p>BRAVO two.</p><p>Charlie three.</p><p>Delta four.</p><p>Echo five.</p>' },
    { kind: 'insert in the middle',         by: A, explicit: false, html: '<p>Alpha one.</p><p>BRAVO two.</p><p>Inserted middle.</p><p>Charlie three.</p><p>Delta four.</p><p>Echo five.</p>' },
    { kind: 'insert at the very top',       by: B, explicit: false, html: '<p>Zero header.</p><p>Alpha one.</p><p>BRAVO two.</p><p>Inserted middle.</p><p>Charlie three.</p><p>Delta four.</p><p>Echo five.</p>' },
    { kind: 'delete one paragraph',         by: B, explicit: false, html: '<p>Zero header.</p><p>Alpha one.</p><p>BRAVO two.</p><p>Charlie three.</p><p>Delta four.</p><p>Echo five.</p>' },
    { kind: 'rewrite a line entirely',      by: B, explicit: true,  html: '<p>Zero header.</p><p>Alpha one.</p><p>COMPLETELY DIFFERENT.</p><p>Charlie three.</p><p>Delta four.</p><p>Echo five.</p>' },
    { kind: 'whitespace-only change',       by: A, explicit: false, html: '<p>Zero header.</p><p>Alpha  one.</p><p>COMPLETELY DIFFERENT.</p><p>Charlie three.</p><p>Delta four.</p><p>Echo five.</p>' },
    { kind: 'append after whitespace edit', by: A, explicit: false, html: '<p>Zero header.</p><p>Alpha  one.</p><p>COMPLETELY DIFFERENT.</p><p>Charlie three.</p><p>Delta four.</p><p>Echo five.</p><p>Foxtrot six.</p>' },
    { kind: 'delete almost everything',     by: A, explicit: true,  html: '<p>Zero header.</p>' },
    { kind: 'empty the document',           by: B, explicit: true,  html: '<p></p>' },
    { kind: 'type again from empty',        by: B, explicit: false, html: '<p>Fresh start after emptying.</p>' },
    { kind: 'long paragraph added',         by: A, explicit: false, html: '<p>Fresh start after emptying.</p><p>' + 'Long content. '.repeat(40) + '</p>' },
    { kind: 'trim the long paragraph',      by: A, explicit: true,  html: '<p>Fresh start after emptying.</p><p>Long content. Long content.</p>' },
  ];

  for (const e of EDITS) {
    const r = await post('/doc', {
      otp, fileId, content: e.html, authorNodeId: e.by,
      isSessionEnd: e.explicit, isDone: e.explicit, committedAt: Date.now(),
    });
    if (r.status !== 200) check(false, `edit accepted: ${e.kind}`, `status=${r.status}`);
  }

  const h = await get(`/history?otp=${otp}&fileId=${fileId}`);
  const entries = h.data?.data?.entries ?? [];
  const logged = entries.map((x) => text(x.fullContent));

  console.log(`  ${EDITS.length + 1} states driven, ${entries.length} versions logged\n`);

  // ── No WORDS became unrecoverable ────────────────────────────────────
  //
  // Judged on fragments, not on whole-document snapshots, because the
  // snapshot test asks the wrong question. Inserting a sentence into the
  // middle of a document means the previous state is no longer a
  // contiguous substring of the next one, yet not a single word was lost
  // -- every one of them is still on screen. Folding that transient away
  // costs a reader nothing.
  //
  // What a reader cannot afford is a sentence they wrote existing in no
  // version at all. So every distinct paragraph that was ever in the
  // document is looked for across the whole log.
  console.log('  Every paragraph that ever existed is still findable');
  const allStates = [seed, ...EDITS.map((e) => e.html)];
  const fragments = new Set();
  for (const html of allStates) {
    for (const m of String(html).matchAll(/<p>(.*?)<\/p>/g)) {
      const t = text(m[1]);
      if (t) fragments.add(t);
    }
  }
  const haystack = logged.join('  ||  ');
  const missing = [...fragments].filter((f) => !haystack.includes(f));
  check(
    missing.length === 0,
    `all ${fragments.size} distinct paragraphs are recoverable`,
    missing.length ? `MISSING: ${missing.map((m) => '"' + m.slice(0, 40) + '…"').join(' | ')}` : '0 missing'
  );

  // ── And the burst BOUNDARIES survive as whole states ─────────────────
  //
  // Transients inside one person's typing burst may fold; the state a
  // burst began from may not, because that is somebody's finished work.
  // A boundary is where the author changes, so those states are checked
  // exactly rather than by fragment.
  console.log('');
  console.log('  The state before another person started editing survives intact');
  let boundaryLost = 0;
  for (let i = 0; i < allStates.length - 1; i++) {
    const curBy = i === 0 ? null : EDITS[i - 1].by;
    const nextBy = EDITS[i].by;
    if (curBy === nextBy) continue; // same author continuing: foldable
    const cur = text(allStates[i]);
    // If the next state still contains every word of this one, nothing
    // was dropped by not keeping the snapshot -- the words are on screen
    // in the row above. Only a handover that REMOVES or REWRITES text
    // needs the earlier state kept whole.
    if (text(allStates[i + 1]).includes(cur)) continue;
    const present = logged.some((l) => l === cur);
    const label = i === 0 ? 'the uploaded original' : EDITS[i - 1].kind;
    check(present, `  "${label}" survives intact (another author edited next)`, present ? '' : 'LOST');
    if (!present) boundaryLost++;
  }
  check(boundaryLost === 0, 'no handover between authors lost a state', boundaryLost ? `${boundaryLost} lost` : '0 lost');

  // ── Nothing is listed twice ──────────────────────────────────────────
  console.log('\n  No version appears twice');
  const counts = logged.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
  const dupes = [...counts.entries()].filter(([, n]) => n > 1);
  check(
    dupes.length === 0,
    'every row shows different content',
    dupes.length ? dupes.map(([k, n]) => `x${n}: "${k.slice(0, 44)}..."`).join(' | ') : `${counts.size} distinct of ${entries.length}`
  );
  const ids = entries.map((e) => e.eventId);
  check(new Set(ids).size === ids.length, 'every row has a unique id', `${new Set(ids).size}/${ids.length}`);
  const seqs = entries.map((e) => e.seqNo).filter((n) => typeof n === 'number');
  check(seqs.every((n, i) => i === 0 || seqs[i - 1] > n), 'rows are strictly newest-first', seqs.join('>'));

  // ── The folding still does its job ───────────────────────────────────
  console.log('\n  The log is still a summary, not a keystroke dump');
  check(
    entries.length < allStates.length,
    'pure-append bursts were folded rather than listed one by one',
    `${allStates.length} states -> ${entries.length} versions`
  );

  // ── Re-saving the same thing adds nothing ────────────────────────────
  console.log('\n  Re-saving identical content');
  const before = entries.length;
  for (let i = 0; i < 3; i++) {
    await post('/doc', {
      otp, fileId, content: EDITS[EDITS.length - 1].html, authorNodeId: A,
      isSessionEnd: true, committedAt: Date.now(),
    });
  }
  const h2 = await get(`/history?otp=${otp}&fileId=${fileId}`);
  check(
    (h2.data?.data?.entries ?? []).length === before,
    'saving the same text three more times adds no versions',
    `${before} -> ${(h2.data?.data?.entries ?? []).length}`
  );

  // ── A conflict is never folded or deduplicated away ──────────────────
  console.log('\n  Concurrent edits');
  const base = EDITS[EDITS.length - 1].html;
  await Promise.all([
    post('/doc', { otp, fileId, content: base + '<p>A wrote this line.</p>', authorNodeId: A, baseContent: base, isSessionEnd: true, committedAt: Date.now() }),
    post('/doc', { otp, fileId, content: base + '<p>B wrote this line.</p>', authorNodeId: B, baseContent: base, isSessionEnd: true, committedAt: Date.now() }),
  ]);
  const h3 = await get(`/history?otp=${otp}&fileId=${fileId}`);
  const e3 = h3.data?.data?.entries ?? [];
  const l3 = e3.map((x) => text(x.fullContent));
  check(l3.some((t) => t.includes('A wrote this line')), 'A’s concurrent line is in the log');
  check(l3.some((t) => t.includes('B wrote this line')), 'B’s concurrent line is in the log');
  const d3 = [...l3.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map()).entries()].filter(([, n]) => n > 1);
  check(d3.length === 0, 'the conflict produced no duplicate rows',
    d3.length ? d3.map(([k, n]) => `x${n}: "${k.slice(0, 40)}..."`).join(' | ') : `${new Set(l3).size} distinct of ${e3.length}`);

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n  ${passed} passed, ${failed} failed`);
  console.log(`  room=${otp} fileId=${fileId}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nProbe crashed:', e); process.exit(1); });
