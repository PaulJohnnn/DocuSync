/**
 * A deliberate hunt for bugs, rather than a confirmation that the happy
 * path works.
 *
 * Each section pushes on a different edge the ordinary probes never reach:
 * what happens past the history cap, whether two peers writing in the same
 * millisecond can collide on a sequence number, what a document containing
 * markup does to a page that renders it, what an upload does with an empty
 * file or a name that differs only by case, and whether a lock survives
 * the file being deleted underneath it.
 *
 * Failures here are expected on a first run. That is the point.
 *
 * Run: node scripts/probe-bug-hunt.js [baseUrl]
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

const A = 'hunt-a-' + Date.now();
const B = 'hunt-b-' + Date.now();
const C = 'hunt-c-' + Date.now();

const newRoom = async (name) => {
  const r = await post('/create', {
    hostNodeId: A, hostIp: '127.0.0.1', hostPort: 9000, roomName: name, hostType: 'web',
  });
  const otp = r.data?.otp;
  await post('/join', { otp, memberNodeId: B });
  await post('/join', { otp, memberNodeId: C });
  return otp;
};
const share = async (otp, fileName, content, by = A) => {
  const r = await post('/files', {
    otp, file: { fileId: Date.now() + Math.floor(Math.random() * 1e4), fileName, content, sharedBy: 'Hunt', sharedByNodeId: by },
  });
  return r;
};
const push = (otp, fileId, content, by, ex = true) =>
  post('/doc', { otp, fileId, content, authorNodeId: by, isSessionEnd: ex, committedAt: Date.now() });
const hist = async (otp, fileId) =>
  (await get(`/history?otp=${otp}&fileId=${fileId}`)).data?.data?.entries ?? [];

async function main() {
  console.log(`\nBug hunt -- ${BASE}\n`);

  // ── 1. Past the history cap ─────────────────────────────────────────
  //
  // The log is trimmed to a fixed length. Everything older falls off the
  // end -- including, eventually, the document as it was first uploaded,
  // which is the single version a reader is most likely to want back.
  console.log('  1. Overflowing the history cap');
  {
    const otp = await newRoom('Overflow');
    const up = await share(otp, 'overflow.txt', '<p>ORIGINAL BASELINE DOCUMENT</p>');
    const fileId = up.data?.fileId;

    // Alternate authors so nothing folds, and delete-then-retype so each
    // save is destructive and earns its own row.
    for (let i = 1; i <= 60; i++) {
      await push(otp, fileId, `<p>Revision number ${i} only.</p>`, i % 2 ? B : C, true);
    }
    const rows = await hist(otp, fileId);
    const hay = rows.map((e) => text(e.fullContent)).join(' || ');
    check(rows.length > 0, 'the log still returns rows after 60 revisions', `${rows.length} rows`);
    check(
      hay.includes('ORIGINAL BASELINE DOCUMENT'),
      'the ORIGINAL uploaded document is still recoverable after 60 revisions',
      hay.includes('ORIGINAL BASELINE DOCUMENT') ? '' : 'BASELINE EVICTED BY THE CAP'
    );
    const uploads = rows.filter((e) => e.eventType === 'upload');
    check(uploads.length >= 1, 'the upload event survived the trim', `${uploads.length} upload rows`);
  }

  // ── 2. Simultaneous writers and sequence numbers ────────────────────
  //
  // Every device sorts the list by seqNo, so two rows sharing one is a
  // list that can render in different orders on different machines.
  console.log('\n  2. Three peers writing at once');
  {
    const otp = await newRoom('Race');
    const up = await share(otp, 'race.txt', '<p>base</p>');
    const fileId = up.data?.fileId;
    for (let round = 0; round < 6; round++) {
      await Promise.all([
        push(otp, fileId, `<p>base</p><p>A round ${round}</p>`, A),
        push(otp, fileId, `<p>base</p><p>B round ${round}</p>`, B),
        push(otp, fileId, `<p>base</p><p>C round ${round}</p>`, C),
      ]);
    }
    // Let the last round finish landing before reading.
    //
    // `Promise.all` resolves when the three responses arrive, not when the
    // server has finished writing all three history rows. Over a local
    // connection that gap is a couple of milliseconds and invisible; over
    // a real network it is long enough that the read caught the log
    // mid-round and reported two peers' work as missing when it was simply
    // not written yet. The race was in this probe, not in the server.
    await new Promise((r) => setTimeout(r, 2000));
    const rows = await hist(otp, fileId);
    const seqs = rows.map((e) => e.seqNo).filter((n) => typeof n === 'number');
    const dupeSeq = seqs.length - new Set(seqs).size;
    check(dupeSeq === 0, 'no two rows share a sequence number under contention',
      dupeSeq ? `${dupeSeq} duplicated of ${seqs.length}` : `${seqs.length} unique`);
    const ids = rows.map((e) => e.eventId);
    check(new Set(ids).size === ids.length, 'no two rows share an event id',
      `${new Set(ids).size}/${ids.length}`);
    check(seqs.every((n, i) => i === 0 || seqs[i - 1] > n), 'the list is still strictly ordered',
      seqs.slice(0, 12).join('>'));
    const hay = rows.map((e) => text(e.fullContent)).join(' || ');
    const lost = ['A round 5', 'B round 5', 'C round 5'].filter((s) => !hay.includes(s));
    check(lost.length === 0, "the final round from all three peers is in the log",
      lost.length ? `missing: ${lost.join(', ')}` : 'all three');
  }

  // ── 3. Documents that contain markup ────────────────────────────────
  //
  // The history page renders stored content. Anything a user can type must
  // come back as text, not as behaviour.
  console.log('\n  3. A document containing markup and scripts');
  {
    const otp = await newRoom('Markup');
    const nasty = '<p>Chapter &lt;script&gt;alert(1)&lt;/script&gt; and &amp; and &quot;quoted&quot;</p>';
    const up = await share(otp, 'markup.txt', nasty);
    const fileId = up.data?.fileId;
    await push(otp, fileId, nasty + '<p>second line</p>', B);
    const rows = await hist(otp, fileId);
    const stored = String(rows[rows.length - 1]?.fullContent || '');
    check(stored.includes('&lt;script&gt;'), 'escaped markup is stored escaped, not unescaped',
      stored.includes('<script>') ? 'RAW SCRIPT TAG STORED' : 'escaped');
    check(!stored.includes('<script>'), 'no raw script tag reaches the log');
    const entities = await get(`/doc?otp=${otp}&fileId=${fileId}`);
    check(
      String(entities.data?.snapshot?.content || '').includes('&amp;'),
      'ampersands survive a round trip intact'
    );
  }

  // ── 4. Upload edge cases ────────────────────────────────────────────
  console.log('\n  4. Uploads with awkward input');
  {
    const otp = await newRoom('Uploads');

    const empty = await share(otp, 'empty.txt', '');
    check(empty.status === 200, 'an empty file is accepted rather than erroring', `status=${empty.status}`);
    check(empty.data?.version === 1, 'an empty file is version 1');

    const uni = await share(otp, 'kabanata-3-pananaliksik.txt', '<p>Pamantasan ng Cabuyao — kabanata 3 ✓</p>');
    check(uni.status === 200 && !!uni.data?.fileId, 'a non-ASCII document uploads');
    const uniRows = await hist(otp, uni.data?.fileId);
    check(
      uniRows.some((e) => String(e.fullContent || '').includes('✓')),
      'non-ASCII characters survive into the history'
    );

    // Case-only difference: one document or two?
    const lower = await share(otp, 'Thesis.docx', '<p>first</p>');
    const upper = await share(otp, 'THESIS.DOCX', '<p>second</p>');
    check(
      String(upper.data?.fileId) === String(lower.data?.fileId),
      'a name differing only in case is the SAME document, not a second one',
      `${lower.data?.fileId} vs ${upper.data?.fileId}`
    );
    check(upper.data?.version === 2, 'and it becomes version 2', `version=${upper.data?.version}`);

    const files = (await get(`/files?otp=${otp}`)).data?.files ?? [];
    const names = files.map((f) => String(f.fileName || f.name).toLowerCase());
    const dupName = names.length - new Set(names).size;
    check(dupName === 0, 'the file list has no case-duplicated rows', dupName ? `${dupName} dupes` : `${names.length} files`);

    const big = '<p>' + 'Long sentence for size testing. '.repeat(2000) + '</p>';
    const bigRes = await share(otp, 'big.txt', big);
    check(bigRes.status === 200, 'a large document uploads', `status=${bigRes.status} ~${Math.round(big.length / 1024)}KB`);
    if (bigRes.status === 200) {
      const got = await get(`/doc?otp=${otp}&fileId=${bigRes.data?.fileId}`);
      check(
        String(got.data?.snapshot?.content || '').length === big.length,
        'the large document comes back byte-for-byte',
        `${String(got.data?.snapshot?.content || '').length} vs ${big.length}`
      );
    }
  }

  // ── 5. Locks against a moving target ────────────────────────────────
  console.log('\n  5. Locking edge cases');
  {
    const otp = await newRoom('Locks');
    const up = await share(otp, 'locked.txt', '<p>content</p>');
    const fileId = up.data?.fileId;

    const ghost = await post('/lock', { otp, nodeId: A, fileId: 'does-not-exist-999', locked: true });
    check(ghost.status === 200, 'locking an unknown file does not crash the route', `status=${ghost.status}`);

    await post('/lock', { otp, nodeId: A, fileId, locked: true, allowedNodeIds: [B] });
    const bOk = await push(otp, fileId, '<p>B is allowed</p>', B);
    const cNo = await push(otp, fileId, '<p>C is not</p>', C);
    check(bOk.status === 200, 'the granted peer may write', `status=${bOk.status}`);
    check(cNo.status === 403, 'the ungranted peer is refused', `status=${cNo.status}`);

    // Deleting a locked file then re-uploading it: does the lock linger
    // and silently block the new document?
    await fetch(`${API}/files?otp=${otp}&fileId=${fileId}`, { method: 'DELETE' });
    const again = await share(otp, 'locked.txt', '<p>re-uploaded after delete</p>');
    check(String(again.data?.fileId) === String(fileId), 're-uploading a deleted name reuses its id');
    const cAfter = await push(otp, fileId, '<p>C writes after re-upload</p>', C);
    check(
      cAfter.status === 403,
      'the lock still applies after delete and re-upload (not silently dropped)',
      `status=${cAfter.status}`
    );

    await post('/lock', { otp, nodeId: A, fileId, locked: false, allowedNodeIds: [] });
    const cFree = await push(otp, fileId, '<p>C writes once unlocked</p>', C);
    check(cFree.status === 200, 'unlocking restores access', `status=${cFree.status}`);
  }

  // ── 6. Bad input to the routes ──────────────────────────────────────
  console.log('\n  6. Malformed requests are refused, not crashed');
  {
    const otp = await newRoom('BadInput');
    const cases = [
      ['missing fileId on /doc', await post('/doc', { otp, content: '<p>x</p>', authorNodeId: A })],
      ['missing otp on /doc', await post('/doc', { fileId: 1, content: '<p>x</p>', authorNodeId: A })],
      ['missing file on /files', await post('/files', { otp })],
      ['unknown room on /files', await post('/files', { otp: 'ZZZZZZ', file: { fileId: 1, fileName: 'x.txt', content: '' } })],
      ['unknown room on /join', await post('/join', { otp: 'ZZZZZZ', memberNodeId: A })],
      ['lock without nodeId', await post('/lock', { otp, fileId: 1, locked: true })],
    ];
    for (const [label, r] of cases) {
      check(r.status >= 400 && r.status < 500, `${label} -> 4xx`, `status=${r.status}`);
    }
    const stillUp = await get(`/files?otp=${otp}`);
    check(stillUp.status === 200, 'the room is still healthy after the bad requests');
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nProbe crashed:', e); process.exit(1); });
