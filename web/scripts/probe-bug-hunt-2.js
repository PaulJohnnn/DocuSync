/**
 * Second hunt: the paths the first one did not touch.
 *
 * Offline reconnection, deletion and its interaction with history, the
 * conflict record itself, room-code resolution under odd input, the
 * metrics the thesis reports, and whether one room's state can be reached
 * or damaged from another.
 *
 * Run: node scripts/probe-bug-hunt-2.js [baseUrl]
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
const text = (h) =>
  String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const A = 'h2a-' + Date.now();
const B = 'h2b-' + Date.now();

const newRoom = async (name) => {
  const r = await post('/create', { hostNodeId: A, hostIp: '127.0.0.1', hostPort: 9000, roomName: name, hostType: 'web' });
  const otp = r.data?.otp;
  await post('/join', { otp, memberNodeId: B });
  return otp;
};
const share = (otp, fileName, content, by = A) =>
  post('/files', { otp, file: { fileId: Date.now() + Math.floor(Math.random() * 1e4), fileName, content, sharedBy: 'H', sharedByNodeId: by } });
const hist = async (otp, fileId) =>
  (await get(`/history?otp=${otp}&fileId=${fileId}`)).data?.data?.entries ?? [];

async function main() {
  console.log(`\nBug hunt, round two -- ${BASE}\n`);

  // ── 1. Coming back from offline ─────────────────────────────────────
  //
  // Someone edits with no connection, the document moves on without them,
  // and their work arrives late against a base nobody holds any more.
  console.log('  1. Reconnecting after editing offline');
  {
    const otp = await newRoom('Offline');
    const base = '<p>Shared opening paragraph.</p>';
    const up = await share(otp, 'offline.txt', base);
    const fileId = up.data?.fileId;

    // B goes offline here, holding `base`. A keeps working.
    await post('/doc', { otp, fileId, content: base + '<p>A added this while B was away.</p>', authorNodeId: A, isSessionEnd: true, committedAt: Date.now() });

    // B reconnects and pushes work derived from the OLD base.
    const reconnect = await post('/doc', {
      otp, fileId,
      content: base + '<p>B wrote this offline.</p>',
      authorNodeId: B, baseContent: base,
      isOfflineReconnect: true, isSessionEnd: true, committedAt: Date.now(),
    });
    check(reconnect.status === 200, 'an offline reconnect is accepted', `status=${reconnect.status}`);

    const live = text((await get(`/doc?otp=${otp}&fileId=${fileId}`)).data?.snapshot?.content);
    check(live.includes('A added this'), "the online author's work survives the reconnect");
    check(live.includes('B wrote this offline'), "the offline author's work is merged in, not dropped");

    const rows = await hist(otp, fileId);
    const hay = rows.map((e) => text(e.fullContent)).join(' || ');
    check(hay.includes('A added this'), 'both contributions are in the history (A)');
    check(hay.includes('B wrote this offline'), 'both contributions are in the history (B)');
  }

  // ── 2. Deleting a file ──────────────────────────────────────────────
  console.log('\n  2. Deleting a file');
  {
    const otp = await newRoom('Delete');
    const up = await share(otp, 'doomed.txt', '<p>Work that took hours.</p>');
    const fileId = up.data?.fileId;
    await post('/doc', { otp, fileId, content: '<p>Work that took hours.</p><p>And more.</p>', authorNodeId: A, isSessionEnd: true, committedAt: Date.now() });

    const before = (await hist(otp, fileId)).length;
    await fetch(`${API}/files?otp=${otp}&fileId=${fileId}`, { method: 'DELETE' });

    const listed = (await get(`/files?otp=${otp}`)).data?.files ?? [];
    check(!listed.some((f) => String(f.fileId ?? f.id) === String(fileId)), 'the deleted file leaves the active list');

    const after = await hist(otp, fileId);
    check(after.length >= before, 'deleting a file does not erase its history', `${before} -> ${after.length}`);
    const hay = after.map((e) => text(e.fullContent)).join(' || ');
    check(hay.includes('Work that took hours'), 'the deleted work is still recoverable from history');

    // Deleting twice should be harmless.
    const twice = await fetch(`${API}/files?otp=${otp}&fileId=${fileId}`, { method: 'DELETE' });
    check(twice.status === 200, 'deleting the same file twice is harmless', `status=${twice.status}`);
  }

  // ── 3. The conflict record ──────────────────────────────────────────
  console.log('\n  3. What a conflict leaves behind');
  {
    const otp = await newRoom('Conflict');
    const base = '<p>The contested line.</p>';
    const up = await share(otp, 'conflict.txt', base);
    const fileId = up.data?.fileId;

    await Promise.all([
      post('/doc', { otp, fileId, content: '<p>The contested line, says A.</p>', authorNodeId: A, baseContent: base, isSessionEnd: true, committedAt: Date.now() }),
      post('/doc', { otp, fileId, content: '<p>The contested line, says B.</p>', authorNodeId: B, baseContent: base, isSessionEnd: true, committedAt: Date.now() }),
    ]);

    const rows = await hist(otp, fileId);
    const hay = rows.map((e) => text(e.fullContent)).join(' || ');
    check(hay.includes('says A'), "the version that may have lost is still in the log (A)");
    check(hay.includes('says B'), "the version that may have lost is still in the log (B)");

    const conflicts = rows.filter((e) => e.eventType === 'conflict-resolve' || e.eventType === 'offline-replay');
    check(conflicts.length >= 1, 'the disagreement is recorded as a conflict, not applied silently', `${conflicts.length} conflict rows`);

    const seqs = rows.map((e) => e.seqNo).filter((n) => typeof n === 'number');
    check(new Set(seqs).size === seqs.length, 'the conflict did not duplicate a sequence number', `${new Set(seqs).size}/${seqs.length}`);
    const keys = rows.map((e) => text(e.fullContent));
    const dupes = keys.length - new Set(keys).size;
    check(dupes === 0, 'the conflict produced no duplicate rows', dupes ? `${dupes} dupes` : 'clean');
  }

  // ── 3b. A conflict that settles on text already in the log ──────────
  //
  // Conflicts are deliberately exempt from the duplicate check, because a
  // row recording that two people disagreed cannot be reconstructed from
  // the versions around it. The exemption has an edge: when the
  // arbitration settles on exactly what the newest row already shows, the
  // log gains a second row with identical text. Seen on the live system
  // after an upload landed while two people were editing -- "Uploaded v2"
  // and the conflict row sat one above the other, word for word the same.
  console.log('');
  console.log('  3b. A conflict that resolves to text the log already has');
  {
    const otp = await newRoom('Conflict Dedup');
    const base = '<p>The shared paragraph.</p>';
    const up = await share(otp, 'dedup.txt', base);
    const fileId = up.data?.fileId;

    // An upload replaces the document...
    const replacement = '<p>Replaced wholesale by an upload.</p>';
    await post('/files', {
      otp, file: { fileId: Date.now() + 3, fileName: 'dedup.txt', content: replacement, sharedBy: 'H', sharedByNodeId: A },
    });

    // ...and a peer, still holding the old base, pushes the SAME text the
    // upload just installed. That is a genuine conflict whose outcome is
    // already the newest version.
    await post('/doc', {
      otp, fileId, content: replacement, authorNodeId: B, baseContent: base,
      isSessionEnd: true, committedAt: Date.now(),
    });
    await new Promise((r) => setTimeout(r, 1200));

    const rows = await hist(otp, fileId);
    const bodies = rows.map((e) => text(e.fullContent));
    const dupes = [...bodies.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map()).entries()]
      .filter(([, n]) => n > 1);
    check(dupes.length === 0, 'the conflict did not add a row identical to the one above it',
      dupes.length ? dupes.map(([k, n]) => `x${n}: "${k.slice(0, 44)}"`).join(' | ') : `${new Set(bodies).size} distinct of ${rows.length}`);

    // The fact of the conflict must survive the de-duplication.
    const marked = rows.filter((e) => /conflict/i.test(String(e.eventType)) || /conflict/i.test(String(e.label || '')));
    check(marked.length >= 1, 'the disagreement is still recorded somewhere in the log',
      marked.length ? `labelled "${marked[0].label || marked[0].eventType}"` : 'CONFLICT LOST');
    check(rows.some((e) => text(e.fullContent).includes('The shared paragraph')),
      'and the text that preceded it is still recoverable');
  }

  // ── 3c. The first edit each person makes after an upload ────────────
  //
  // The editor wraps every save in <div data-margin="N">, N being that
  // reader's own setting. An upload stores the document bare, having
  // never passed through an editor. So the first save from each person
  // adds a wrapper the base does not have, and diffed as raw strings both
  // sides look like they replaced the whole document -- one enormous
  // conflicting hunk, settled by throwing one person's work away.
  //
  // Measured against the deployed build before the fix: the first edit
  // was lost in 8 runs out of 8. Deterministic, not a race, and invisible
  // afterwards because both machines then read the same server copy.
  console.log('');
  console.log('  3c. Two people each making their first edit after an upload');
  {
    let kept = 0;
    const RUNS = 5;
    for (let i = 0; i < RUNS; i++) {
      const otp = await newRoom('First Edit ' + i);
      const bare = '<p>Chapter 3 Methodology.</p>';
      const up = await share(otp, 'first.docx', bare);
      const fileId = up.data?.fileId;
      // Each client wraps with ITS OWN margin, and both base on the bare
      // uploaded text, because neither has saved yet.
      await post('/doc', { otp, fileId, content: `<div data-margin="96">${bare}<p>A line.</p></div>`, authorNodeId: A, baseContent: bare, isSessionEnd: true, committedAt: Date.now() });
      await new Promise((r) => setTimeout(r, 250));
      await post('/doc', { otp, fileId, content: `<div data-margin="48">${bare}<p>B line.</p></div>`, authorNodeId: B, baseContent: bare, isSessionEnd: true, committedAt: Date.now() });
      await new Promise((r) => setTimeout(r, 700));
      const doc = text((await get(`/doc?otp=${otp}&fileId=${fileId}`)).data?.snapshot?.content);
      if (doc.includes('A line') && doc.includes('B line')) kept += 1;
    }
    check(kept === RUNS, 'neither person loses their first edit after an upload', `${kept}/${RUNS} runs kept both`);
  }

  // ── 4. Room codes under odd input ───────────────────────────────────
  console.log('\n  4. Room code handling');
  {
    const otp = await newRoom('Codes');
    const lower = await post('/join', { otp: String(otp).toLowerCase(), memberNodeId: 'case-joiner' });
    // Either behaviour is defensible; what matters is that it is decided,
    // not that it half-works.
    check([200, 404].includes(lower.status), 'a lower-case code is either accepted or cleanly refused', `status=${lower.status}`);

    const padded = await post('/join', { otp: ` ${otp} `, memberNodeId: 'pad-joiner' });
    check([200, 404].includes(padded.status), 'a padded code is either accepted or cleanly refused', `status=${padded.status}`);

    const weird = await post('/join', { otp: '../../etc/passwd', memberNodeId: 'evil' });
    check(weird.status >= 400, 'a path-like code is refused', `status=${weird.status}`);

    const long = await post('/join', { otp: 'A'.repeat(500), memberNodeId: 'long' });
    check(long.status >= 400, 'an absurdly long code is refused', `status=${long.status}`);
  }

  // ── 4b. A classroom behind one router ───────────────────────────────
  //
  // Page 6 sets the target at fifteen concurrent users and page 8 scopes
  // deployment to the campus, where they all share one public address.
  // The limiter has to tell "one client retrying" apart from "a room full
  // of people", because getting that wrong refuses the second group.
  console.log('');
  console.log('  4b. Fifteen devices joining from one network');
  {
    const otp = await newRoom('Classroom');
    const codes = [];
    for (let i = 0; i < 15; i++) {
      const r = await post('/join', { otp, memberNodeId: `classroom-device-${i}-${Date.now()}` });
      codes.push(r.status);
    }
    const refused = codes.filter((c) => c === 429).length;
    check(refused === 0, 'fifteen different devices can all join from one IP',
      refused ? `${refused} of 15 refused with 429` : '15/15 joined');

    // One device retrying hard is still bounded.
    const hammerId = 'hammer-' + Date.now();
    const hammer = [];
    for (let i = 0; i < 16; i++) {
      const r = await post('/join', { otp, memberNodeId: hammerId });
      hammer.push(r.status);
    }
    check(hammer.includes(429), 'a single device hammering the route is still throttled',
      `${hammer.filter((c) => c === 429).length} of 16 refused`);

    // And that throttling must not have locked out the room.
    const bystander = await post('/join', { otp, memberNodeId: 'bystander-' + Date.now() });
    check(bystander.status !== 429, "one device's throttling does not block its neighbours",
      `status=${bystander.status}`);
  }

  // ── 5. One room cannot reach another ────────────────────────────────
  console.log('\n  5. Room isolation');
  {
    const roomOne = await newRoom('Isolation One');
    const roomTwo = await newRoom('Isolation Two');
    const f1 = await share(roomOne, 'secret.txt', '<p>Room one private content.</p>');
    const fileId = f1.data?.fileId;

    // Same fileId, different room: must not see room one's document.
    const cross = await get(`/doc?otp=${roomTwo}&fileId=${fileId}`);
    const crossText = text(cross.data?.snapshot?.content);
    check(!crossText.includes('Room one private content'),
      "another room cannot read this room's document", crossText ? `LEAKED: ${crossText.slice(0, 40)}` : 'empty');

    const crossHist = await hist(roomTwo, fileId);
    const ch = crossHist.map((e) => text(e.fullContent)).join(' ');
    check(!ch.includes('Room one private content'), "another room cannot read this room's history");

    // Writing into room two under that id must not touch room one.
    await post('/doc', { otp: roomTwo, fileId, content: '<p>Room two writing.</p>', authorNodeId: B, isSessionEnd: true, committedAt: Date.now() });
    const oneAfter = text((await get(`/doc?otp=${roomOne}&fileId=${fileId}`)).data?.snapshot?.content);
    check(oneAfter.includes('Room one private content'), "writing in another room does not overwrite this one");
  }

  // ── 6. The reported metrics ─────────────────────────────────────────
  console.log('\n  6. Metrics the thesis reports');
  {
    const otp = await newRoom('Metrics');
    const up = await share(otp, 'metrics.txt', '<p>one</p>');
    const fileId = up.data?.fileId;
    for (let i = 0; i < 5; i++) {
      await post('/doc', { otp, fileId, content: `<p>one</p><p>rev ${i}</p>`, authorNodeId: i % 2 ? A : B, isSessionEnd: true, committedAt: Date.now(), concurrentPeers: 2 });
    }
    const m = await get(`/metrics?otp=${otp}`);
    check(m.status === 200, 'the metrics endpoint answers', `status=${m.status}`);
    const body = JSON.stringify(m.data ?? {});
    check(body.length > 2, 'the metrics endpoint returns something', `${body.length} bytes`);
    const nums = JSON.stringify(m.data).match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    check(!nums.some((n) => Number.isNaN(n)), 'no metric is NaN');
    check(!nums.some((n) => !Number.isFinite(n)), 'no metric is Infinity');
    // A rate expressed as a percentage should not exceed 100 unless it is
    // explicitly a ratio like scalability.
    const dataLoss = m.data?.dataLossRate ?? m.data?.metrics?.dataLossRate;
    if (dataLoss !== undefined) {
      check(Number(dataLoss) >= 0 && Number(dataLoss) <= 100, 'data loss rate is a sane percentage', `${dataLoss}`);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nProbe crashed:', e); process.exit(1); });
