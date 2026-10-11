/**
 * Restore EVERY version in the list, one after another, and check each one.
 *
 * Earlier probes sampled: they picked an interesting version, restored it,
 * and confirmed that one came back. Sampling cannot catch a log where most
 * rows are right and one in the middle is not -- which is exactly what a
 * reader would hit, because they restore the version they need, not the
 * version a test chose.
 *
 * So this walks the entire history. For each row it restores that version,
 * reads the live document back, and requires an exact match. It then
 * re-reads the history and requires that every fragment known so far is
 * still somewhere in it, because a restore is itself a write and a write
 * that quietly drops older versions would otherwise pass unnoticed.
 *
 * Restoring is destructive by nature -- it overwrites the current document
 * -- so this doubles as a soak test of the preservation rule: after N
 * restores the log must still hold every sentence the document ever had,
 * and must not have grown a duplicate for each one.
 *
 * Run: node scripts/probe-history-restore-every-version.js [baseUrl]
 */
const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;

const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok, name });
  if (!ok || process.env.VERBOSE) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
  }
};
const checkLoud = (ok, name, detail = '') => {
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

const A = 'rest-a-' + Date.now();
const B = 'rest-b-' + Date.now();

const P = {
  intro: 'This chapter presents the methodology used in the study.',
  design: 'The research design is developmental and iterative.',
  resp: 'The respondents were thirty students from the College of Computing Studies.',
  instr: 'The instrument was a researcher made questionnaire validated by three experts.',
  stats: 'The data were analysed using weighted mean and standard deviation.',
  ethics: 'Ethical clearance was obtained before any data collection began.',
};
const doc = (parts) => parts.map((t) => `<p>${t}</p>`).join('');

async function main() {
  console.log(`\nRestore every version in the list -- ${BASE}\n`);

  const room = await post('/create', {
    hostNodeId: A, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Restore All', hostType: 'web',
  });
  const otp = room.data?.otp;
  if (!otp) { console.error('create failed', room); process.exit(1); }
  await post('/join', { otp, memberNodeId: B });

  const seed = doc([P.intro, P.design, P.resp]);
  const up = await post('/files', {
    otp, file: { fileId: Date.now(), fileName: 'restore-all.docx', content: seed, sharedBy: 'A', sharedByNodeId: A },
  });
  const fileId = up.data?.fileId;
  console.log(`  room ${otp}  fileId ${fileId}`);

  // Varied, partial, two authors, mixed autosave and explicit save.
  const STEPS = [
    { by: A, ex: false, html: doc([P.intro, P.design, P.resp, P.instr]) },
    { by: B, ex: false, html: doc([P.intro, P.design, P.resp.replace('thirty', 'forty-five'), P.instr]) },
    { by: B, ex: true,  html: doc([P.intro, P.design, P.resp.replace('thirty', 'forty-five'), 'The instrument was a questionnaire.']) },
    { by: A, ex: false, html: doc([P.intro, 'The study adopts an experimental design.', P.resp.replace('thirty', 'forty-five'), 'The instrument was a questionnaire.']) },
    { by: A, ex: false, html: doc([P.intro, 'The study adopts an experimental design.', 'The instrument was a questionnaire.', P.stats]) },
    { by: B, ex: false, html: doc([P.ethics, P.intro, 'The study adopts an experimental design.', 'The instrument was a questionnaire.', P.stats]) },
    { by: B, ex: true,  html: doc([P.ethics, P.intro, 'The instrument was a questionnaire.', P.stats.replace('analysed', 'analyzed')]) },
    { by: A, ex: false, html: doc([P.ethics, P.intro, 'A pasted section about sampling and inclusion criteria.', P.stats.replace('analysed', 'analyzed')]) },
    { by: A, ex: true,  html: doc([P.ethics, P.intro, 'A pasted section.', P.stats.replace('analysed', 'analyzed')]) },
  ];
  for (const s of STEPS) {
    await post('/doc', { otp, fileId, content: s.html, authorNodeId: s.by, isSessionEnd: s.ex, isDone: s.ex, committedAt: Date.now() });
  }

  // Every sentence the document ever held, which must remain recoverable
  // no matter how much restoring happens afterwards.
  const fragments = new Set();
  for (const html of [seed, ...STEPS.map((s) => s.html)]) {
    for (const m of String(html).matchAll(/<p>(.*?)<\/p>/g)) {
      const t = text(m[1]);
      if (t) fragments.add(t);
    }
  }

  const h0 = await get(`/history?otp=${otp}&fileId=${fileId}`);
  const versions = h0.data?.data?.entries ?? [];
  console.log(`  ${STEPS.length + 1} saves -> ${versions.length} versions, ${fragments.size} distinct sentences\n`);
  checkLoud(versions.length > 0, 'the history has versions to walk');

  // ── Walk the whole list ──────────────────────────────────────────────
  console.log(`  Restoring all ${versions.length} versions in turn`);
  let mismatches = [];
  let fragmentLosses = [];
  for (let i = 0; i < versions.length; i++) {
    const v = versions[i];
    const want = String(v.fullContent || '');
    const label = `v${versions.length - i} (${v.label || v.eventType}, seq ${v.seqNo})`;

    // Restoring is exactly what the page does: push the old content back
    // as a new write.
    const r = await post('/doc', {
      otp, fileId, content: want, authorNodeId: A, isSessionEnd: true, committedAt: Date.now(),
    });
    check(r.status === 200, `${label} restore accepted`, `status=${r.status}`);

    const live = await get(`/doc?otp=${otp}&fileId=${fileId}`);
    const got = String(live.data?.snapshot?.content || '');
    const exact = text(got) === text(want);
    check(exact, `${label} restored exactly`, exact ? '' : `wanted "${text(want).slice(0, 48)}…" got "${text(got).slice(0, 48)}…"`);
    if (!exact) mismatches.push(label);

    // A restore is a destructive write. Nothing known may fall out of the
    // log because of it.
    const hn = await get(`/history?otp=${otp}&fileId=${fileId}`);
    const hay = (hn.data?.data?.entries ?? []).map((e) => text(e.fullContent)).join(' || ');
    const lost = [...fragments].filter((f) => !hay.includes(f));
    if (lost.length) fragmentLosses.push(`${label}: ${lost.length} lost`);
  }

  checkLoud(mismatches.length === 0, `all ${versions.length} versions restored to exactly their own content`,
    mismatches.length ? mismatches.join(' | ') : `${versions.length}/${versions.length}`);
  checkLoud(fragmentLosses.length === 0, 'no sentence fell out of the log during the walk',
    fragmentLosses.length ? fragmentLosses.join(' | ') : '0 lost at every step');

  // ── The log after all that ───────────────────────────────────────────
  console.log('\n  The log after restoring everything');
  const hEnd = await get(`/history?otp=${otp}&fileId=${fileId}`);
  const end = hEnd.data?.data?.entries ?? [];
  const endText = end.map((e) => text(e.fullContent));
  const hay = endText.join(' || ');

  const stillMissing = [...fragments].filter((f) => !hay.includes(f));
  checkLoud(stillMissing.length === 0, `all ${fragments.size} sentences are still recoverable`,
    stillMissing.length ? `MISSING: ${stillMissing.map((m) => '"' + m.slice(0, 40) + '…"').join(' | ')}` : '0 missing');

  const counts = endText.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
  const dupes = [...counts.entries()].filter(([, n]) => n > 1);
  checkLoud(dupes.length === 0, 'restoring every version produced no duplicate rows',
    dupes.length ? dupes.map(([k, n]) => `x${n}: "${k.slice(0, 40)}…"`).join(' | ') : `${counts.size} distinct of ${end.length}`);

  const ids = end.map((e) => e.eventId);
  checkLoud(new Set(ids).size === ids.length, 'every row still has a unique id', `${new Set(ids).size}/${ids.length}`);
  const seqs = end.map((e) => e.seqNo).filter((n) => typeof n === 'number');
  checkLoud(new Set(seqs).size === seqs.length, 'every row still has a unique sequence number', `${new Set(seqs).size}/${seqs.length}`);
  checkLoud(seqs.every((n, i) => i === 0 || seqs[i - 1] > n), 'rows are still strictly newest-first');
  checkLoud(end.every((e) => typeof e.fullContent === 'string'), 'every row still carries restorable content',
    `${end.filter((e) => typeof e.fullContent === 'string').length}/${end.length}`);

  // The list must not have exploded. Each restore may legitimately add a
  // row (it is a real change), but nothing beyond that.
  checkLoud(
    end.length <= versions.length * 2 + 2,
    'the list did not balloon from the restores',
    `${versions.length} -> ${end.length}`
  );

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n  ${passed} passed, ${failed} failed  (${versions.length} versions each checked individually)`);
  console.log(`  room=${otp} fileId=${fileId}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nProbe crashed:', e); process.exit(1); });
