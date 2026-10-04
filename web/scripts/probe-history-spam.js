/**
 * Reported: the document-history timeline fills with duplicate entries, the
 * times disagree between devices, and the order looks wrong.
 *
 * Reproduces the three separately, against whatever server is given.
 *
 * Run: node scripts/probe-history-spam.js [baseUrl]
 */
const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;

const post = (p, body) => fetch(`${API}${p}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const hist = (otp, fileId) =>
  fetch(`${API}/history?otp=${otp}&fileId=${fileId}`).then((r) => r.json()).then((j) => j?.data?.entries || []);

const doc = (otp, fileId, content, nodeId, committedAt, extra = {}) =>
  post('/doc', { otp, fileId, content, authorNodeId: nodeId, seq: 1, committedAt, ...extra });

const wrap = (s) => `<div data-margin="96"><p>${s}</p></div>`;
const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok, name });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

(async () => {
  console.log(`target: ${BASE}\n`);

  // ---- 1. the same save, sent twice ------------------------------------
  {
    const otp = String(100000 + Math.floor(Math.random() * 899999));
    const f = 'spam-same';
    await doc(otp, f, wrap('SEED'), 'web-A', Date.now(), { isSessionEnd: true });
    const body = wrap('HELLO WORLD');
    await doc(otp, f, body, 'web-A', Date.now(), { isSessionEnd: true });
    await doc(otp, f, body, 'web-A', Date.now() + 1, { isSessionEnd: true });
    const h = await hist(otp, f);
    check(h.filter((e) => e.fullContent === body).length === 1,
      'identical content saved twice logs one entry',
      `${h.filter((e) => e.fullContent === body).length} entries`);
  }

  // ---- 2. two devices alternating (ping-pong) ---------------------------
  {
    const otp = String(100000 + Math.floor(Math.random() * 899999));
    const f = 'spam-pingpong';
    await doc(otp, f, wrap('SEED'), 'web-A', Date.now(), { isSessionEnd: true });
    const A = wrap('SEED FROM-A'), B = wrap('SEED FROM-B');
    // Each device re-sends its own view six times, as the 700ms poll does
    // while both users are still typing.
    for (let i = 0; i < 6; i++) {
      await doc(otp, f, A, 'web-A', Date.now(), { isSessionEnd: true });
      await doc(otp, f, B, 'web-B', Date.now(), { isSessionEnd: true });
    }
    const h = await hist(otp, f);
    const distinct = new Set(h.map((e) => e.fullContent)).size;
    check(h.length <= distinct + 1,
      'alternating saves do not pile up repeats',
      `${h.length} entries for ${distinct} distinct states`);
  }

  // ---- 3. clock skew: whose order does the timeline follow? -----------
  {
    const otp = String(100000 + Math.floor(Math.random() * 899999));
    const f = 'spam-skew';
    const base = `<div data-margin="96"><p>PARA ONE.</p><p>PARA TWO.</p></div>`;
    await doc(otp, f, base, 'web-A', Date.now(), { isSessionEnd: true });
    // Both branch off the same base and touch different paragraphs, so the
    // server merges and keeps both. B's laptop is 90 seconds behind A's —
    // enough to reorder a clock-sorted list, not enough to lose the write.
    await doc(otp, f, `<div data-margin="96"><p>PARA ONE EDITED BY A.</p><p>PARA TWO.</p></div>`,
      'web-A', Date.now(), { isSessionEnd: true, baseContent: base });
    await doc(otp, f, `<div data-margin="96"><p>PARA ONE.</p><p>PARA TWO EDITED BY B.</p></div>`,
      'web-B', Date.now() - 90000, { isSessionEnd: true, baseContent: base });

    const h = await hist(otp, f);
    const text = (e) => (e?.fullContent || '').replace(/<[^>]+>/g, ' ');
    // What the page does now: server-assigned order.
    const newest = [...h].sort((a, b) => (b.seqNo ?? 0) - (a.seqNo ?? 0))[0];
    check(/EDITED BY A/.test(text(newest)) && /EDITED BY B/.test(text(newest)),
      'the newest version shown is the one holding both edits',
      `top of list is "${text(newest).trim()}"`);

    check(h.every((e) => typeof e.seqNo === 'number' && typeof e.recordedAt === 'number'),
      'every version carries the server’s own order and time');

    const bySeq = [...h].sort((a, b) => (b.seqNo ?? 0) - (a.seqNo ?? 0));
    const times = bySeq.map((e) => e.recordedAt);
    check(times.every((t, i) => i === 0 || times[i - 1] >= t),
      'displayed times decrease down the list on every device');
  }

  // ---- 4. the version that loses Last-Write-Wins ----------------------
  {
    const otp = String(100000 + Math.floor(Math.random() * 899999));
    const f = 'spam-lww';
    const base = `<div data-margin="96"><p>LINE A.</p><p>LINE B.</p></div>`;
    await doc(otp, f, base, 'seed', Date.now(), { isSessionEnd: true });
    const t = Date.now();
    // Both edit the SAME line from the same base. Zyra's clock is older, so
    // Last-Write-Wins settles it in Paul's favour and her text is not in the
    // merged result. It still has to be somewhere she can get it back.
    await doc(otp, f, `<div data-margin="96"><p>LINE A.</p><p>LINE B. PAUL</p></div>`,
      'web-paul', t, { isSessionEnd: true, baseContent: base });
    await doc(otp, f, `<div data-margin="96"><p>LINE A.</p><p>LINE B. ZYRA</p></div>`,
      'web-zyra', t - 5000, { isSessionEnd: true, baseContent: base });

    const h = await hist(otp, f);
    const txt = (e) => (e.fullContent || '').replace(/<[^>]+>/g, ' ');
    const current = [...h].sort((a, b) => (b.seqNo ?? 0) - (a.seqNo ?? 0))[0];
    // Zyra writes second and so wins the contested line, even though her
    // clock reads earlier. The tie-break is the order the server received
    // the two writes, not whose device clock is further ahead — otherwise
    // the winner is decided by whichever laptop is running fast, which is
    // what it used to be.
    check(/ZYRA/.test(txt(current)),
      'the last write the server received decides the contested line', txt(current).trim());
    check(h.some((e) => e.eventType === 'conflict-resolve'),
      'the arbitration is logged as a conflict, not applied silently');
    check(h.some((e) => /PAUL/.test(txt(e))),
      'the version that lost the arbitration is still in the log, restorable');
  }

  // ---- 4b. saves that change nothing a reader can see -----------------
  {
    const otp = String(100000 + Math.floor(Math.random() * 899999));
    const f = 'spam-invisible';
    const body = '<div data-margin="96"><p>Nakatira sa mabuhay</p><p>pepe</p>';
    // What the editor actually emits as someone works: an empty paragraph
    // left behind by Enter, re-serialised three different ways, arriving
    // alternately as an autosave and an explicit save.
    const steps = [
      [body + '</div>', { isDone: true }],
      [body + '<p></p></div>', { isSessionEnd: true }],
      [body + '<p><br></p></div>', { isDone: true }],
      [body + '<p>&nbsp;</p></div>', { isSessionEnd: true }],
    ];
    for (const [i, [content, flags]] of steps.entries()) {
      await post('/doc', { otp, fileId: f, content, authorNodeId: 'web-A', seq: 1, committedAt: Date.now() + i, ...flags });
    }
    const h = await hist(otp, f);
    const visible = (e) => (e.fullContent || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const distinct = new Set(h.map(visible));
    check(h.length === distinct.size,
      'saves that change nothing visible do not become versions',
      `${h.length} rows for ${distinct.size} distinct pages`);
  }

  // ---- 4c. a second person's edit is still its own version -------------
  {
    const otp = String(100000 + Math.floor(Math.random() * 899999));
    const f = 'spam-twoauthors';
    const base = wrap('SHARED LINE.');
    await doc(otp, f, base, 'web-paul', Date.now(), { isSessionEnd: true });
    // Folding one author's successive saves must not fold away someone else.
    await doc(otp, f, wrap('SHARED LINE. BY PAUL'), 'web-paul', Date.now(), { isSessionEnd: true, baseContent: base });
    const mid = wrap('SHARED LINE. BY PAUL');
    await doc(otp, f, wrap('SHARED LINE. BY PAUL AND ZYRA'), 'web-zyra', Date.now(), { isSessionEnd: true, baseContent: mid });

    const h = await hist(otp, f);
    const authors = new Set(h.map((e) => e.nodeId));
    check(authors.has('web-paul') && authors.has('web-zyra'),
      'both people appear in the version list', [...authors].join(', '));
    check(h.some((e) => /ZYRA/.test((e.fullContent || '').replace(/<[^>]+>/g, ' '))),
      'the second person’s edit is recorded as its own version');
  }

  // ---- 5. the conflict feed -------------------------------------------
  {
    const otp = String(100000 + Math.floor(Math.random() * 899999));
    // The editor's poll loop re-posts while the local side keeps changing,
    // so localContent drifts by a character each tick.
    for (let i = 0; i < 5; i++) {
      await post('/conflicts', {
        otp, conflictId: `c-${i}`, fileId: 'spam-conf',
        localContent: wrap('sample zyra'), serverContent: wrap('sample'),
        mergedContent: wrap('sample'), timestamp: Date.now(),
      });
    }
    const r = await fetch(`${API}/conflicts?otp=${otp}`).then((x) => x.json());
    check((r.conflicts || []).length === 1,
      'the same conflict posted five times is stored once',
      `${(r.conflicts || []).length} stored`);
  }

  const pass = results.filter((r) => r.ok).length;
  console.log(`\n  ${pass} passed, ${results.length - pass} failed`);
})();
