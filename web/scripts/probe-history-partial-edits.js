/**
 * Real editing, not whole-document swaps.
 *
 * The earlier probes mostly replaced a document outright, which is the
 * easy case to get right. Nobody edits that way. People paste a block in,
 * change one word in the middle, cut a sentence out of one paragraph,
 * rewrite another and leave the rest untouched -- so most of the document
 * survives each save and only fragments of it move.
 *
 * That matters because losing a fragment is invisible in a whole-state
 * check: the document still looks almost right, the history still has
 * rows, and the one sentence somebody deleted an hour ago is simply not
 * anywhere. "Some text are not found" is a fragment-level complaint, so
 * this probe asserts at fragment level:
 *
 *   EVERY sentence that was ever in the document, at any point, must be
 *   findable somewhere in the version history.
 *
 * It also checks the opposite failure, because the fix for one is the
 * cause of the other: if every keystroke produced a version the list would
 * be useless, so the row count has to stay far below the number of saves.
 *
 * Run: node scripts/probe-history-partial-edits.js [baseUrl]
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

const A = 'part-a-' + Date.now();
const B = 'part-b-' + Date.now();

// A chapter, as paragraphs, so edits can be expressed the way a person
// makes them: touch one, leave the others alone.
const P = {
  intro:   'This chapter presents the methodology used in the study.',
  design:  'The research design is developmental, following an iterative build and test cycle.',
  resp:    'The respondents were thirty students drawn from the College of Computing Studies.',
  instr:   'The instrument used was a researcher made questionnaire validated by three experts.',
  stats:   'The data were analysed using weighted mean and standard deviation.',
  ethics:  'Ethical clearance was obtained before any data collection began.',
};
const doc = (parts) => parts.map((t) => `<p>${t}</p>`).join('');

async function main() {
  console.log(`\nPartial, realistic edits -- ${BASE}\n`);

  const room = await post('/create', {
    hostNodeId: A, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Partial Edits', hostType: 'web',
  });
  const otp = room.data?.otp;
  if (!otp) { console.error('create failed', room); process.exit(1); }
  await post('/join', { otp, memberNodeId: B });

  const seed = doc([P.intro, P.design, P.resp, P.instr]);
  const up = await post('/files', {
    otp, file: { fileId: Date.now(), fileName: 'chapter3.docx', content: seed, sharedBy: 'A', sharedByNodeId: A },
  });
  const fileId = up.data?.fileId;
  console.log(`  room ${otp}  fileId ${fileId}\n`);

  // Each step changes PART of the document and leaves the rest intact,
  // the way the editor is actually used. `explicit` is mostly false on
  // purpose: these are autosaves, which is where text used to disappear.
  const STEPS = [
    {
      kind: 'paste two paragraphs in at the end',
      by: A, explicit: false,
      html: doc([P.intro, P.design, P.resp, P.instr, P.stats, P.ethics]),
    },
    {
      kind: 'change ONE word, everything else untouched',
      by: A, explicit: false,
      html: doc([P.intro, P.design, P.resp.replace('thirty', 'forty-five'), P.instr, P.stats, P.ethics]),
    },
    {
      kind: 'delete HALF of one sentence, keep the rest',
      by: B, explicit: false,
      html: doc([P.intro, P.design, P.resp.replace('thirty', 'forty-five'), 'The instrument used was a researcher made questionnaire.', P.stats, P.ethics]),
    },
    {
      kind: 'rewrite one paragraph, leave five alone',
      by: B, explicit: false,
      html: doc([P.intro, 'The study adopts an experimental design with a control group.', P.resp.replace('thirty', 'forty-five'), 'The instrument used was a researcher made questionnaire.', P.stats, P.ethics]),
    },
    {
      kind: 'insert a sentence mid-paragraph',
      by: A, explicit: false,
      html: doc([P.intro + ' It also states the limitations.', 'The study adopts an experimental design with a control group.', P.resp.replace('thirty', 'forty-five'), 'The instrument used was a researcher made questionnaire.', P.stats, P.ethics]),
    },
    {
      kind: 'remove a whole paragraph from the middle',
      by: A, explicit: false,
      html: doc([P.intro + ' It also states the limitations.', 'The study adopts an experimental design with a control group.', 'The instrument used was a researcher made questionnaire.', P.stats, P.ethics]),
    },
    {
      kind: 'move a paragraph (cut from end, paste near top)',
      by: B, explicit: false,
      html: doc([P.intro + ' It also states the limitations.', P.ethics, 'The study adopts an experimental design with a control group.', 'The instrument used was a researcher made questionnaire.', P.stats]),
    },
    {
      kind: 'fix three typos in three different places at once',
      by: B, explicit: false,
      html: doc([P.intro + ' It also states the limitations.', P.ethics.replace('Ethical', 'Ethics'), 'The study adopts an experimental design with a control group.', 'The instrument used was a researcher-made questionnaire.', P.stats.replace('analysed', 'analyzed')]),
    },
    {
      kind: 'replace a phrase inside the pasted block',
      by: A, explicit: false,
      html: doc([P.intro + ' It also states the limitations.', P.ethics.replace('Ethical', 'Ethics'), 'The study adopts an experimental design with a control group.', 'The instrument used was a researcher-made questionnaire.', 'The data were analyzed using frequency counts and percentages.']),
    },
    {
      kind: 'explicit save, nothing changed',
      by: A, explicit: true,
      html: doc([P.intro + ' It also states the limitations.', P.ethics.replace('Ethical', 'Ethics'), 'The study adopts an experimental design with a control group.', 'The instrument used was a researcher-made questionnaire.', 'The data were analyzed using frequency counts and percentages.']),
    },
    {
      kind: 'paste a long block over the middle only',
      by: A, explicit: false,
      html: doc([P.intro + ' It also states the limitations.', P.ethics.replace('Ethical', 'Ethics'), 'A pasted replacement section about sampling procedure and inclusion criteria.', 'The instrument used was a researcher-made questionnaire.', 'The data were analyzed using frequency counts and percentages.']),
    },
    {
      kind: 'trim the pasted block back down',
      by: B, explicit: false,
      html: doc([P.intro + ' It also states the limitations.', P.ethics.replace('Ethical', 'Ethics'), 'A pasted replacement section.', 'The instrument used was a researcher-made questionnaire.', 'The data were analyzed using frequency counts and percentages.']),
    },
  ];

  for (const s of STEPS) {
    const r = await post('/doc', {
      otp, fileId, content: s.html, authorNodeId: s.by,
      isSessionEnd: s.explicit, isDone: s.explicit, committedAt: Date.now(),
    });
    if (r.status !== 200) check(false, `accepted: ${s.kind}`, `status=${r.status}`);
  }

  const h = await get(`/history?otp=${otp}&fileId=${fileId}`);
  const entries = h.data?.data?.entries ?? [];
  const logged = entries.map((e) => text(e.fullContent));
  const haystack = logged.join('  ||  ');

  console.log(`  ${STEPS.length + 1} saves, ${entries.length} versions logged\n`);

  // ── Fragment-level recovery ──────────────────────────────────────────
  //
  // Every distinct sentence the document ever contained, gathered from
  // every state, then looked for in the log. A sentence that existed and
  // cannot be found is text the user typed and can never get back.
  console.log('  Every sentence that ever existed is still findable');
  const allStates = [seed, ...STEPS.map((s) => s.html)];
  const sentences = new Set();
  for (const html of allStates) {
    for (const m of String(html).matchAll(/<p>(.*?)<\/p>/g)) {
      const t = text(m[1]);
      if (t) sentences.add(t);
    }
  }
  const missing = [];
  for (const s of sentences) {
    if (!haystack.includes(s)) missing.push(s);
  }
  check(
    missing.length === 0,
    `all ${sentences.size} distinct sentences are recoverable`,
    missing.length ? `MISSING ${missing.length}: ${missing.map((m) => '"' + m.slice(0, 46) + '…"').join(' | ')}` : '0 missing'
  );

  // Named spot-checks, so a failure says which real edit lost text.
  const spot = [
    ['the original "thirty students" before it became forty-five', 'thirty students'],
    ['the full instrument sentence before half of it was deleted', 'validated by three experts'],
    ['the original research-design paragraph before it was rewritten', 'developmental, following an iterative'],
    ['the paragraph that was removed from the middle', 'forty-five'],
    ['the pre-typo spelling "Ethical clearance"', 'Ethical clearance'],
    ['the pre-typo spelling "analysed"', 'analysed'],
    ['the long pasted block before it was trimmed', 'sampling procedure and inclusion criteria'],
    ['the original weighted-mean sentence', 'weighted mean and standard deviation'],
  ];
  for (const [label, needle] of spot) {
    check(haystack.includes(needle), `  ${label}`, haystack.includes(needle) ? '' : 'NOT FOUND');
  }

  // ── Still not a keystroke dump ───────────────────────────────────────
  console.log('\n  The list is still readable');
  check(
    entries.length <= STEPS.length + 1,
    'versions never exceed the number of saves',
    `${STEPS.length + 1} saves -> ${entries.length} versions`
  );
  const counts = logged.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
  const dupes = [...counts.entries()].filter(([, n]) => n > 1);
  check(
    dupes.length === 0,
    'no two versions show the same content',
    dupes.length ? dupes.map(([k, n]) => `x${n}: "${k.slice(0, 40)}…"`).join(' | ') : `${counts.size} distinct of ${entries.length}`
  );
  const ids = entries.map((e) => e.eventId);
  check(new Set(ids).size === ids.length, 'every row has a unique id', `${new Set(ids).size}/${ids.length}`);
  const seqs = entries.map((e) => e.seqNo).filter((n) => typeof n === 'number');
  check(new Set(seqs).size === seqs.length, 'every row has a unique sequence number', `${new Set(seqs).size}/${seqs.length}`);
  check(seqs.every((n, i) => i === 0 || seqs[i - 1] > n), 'rows are strictly newest-first', seqs.join('>'));

  // ── Typing on top of a partial edit still folds ──────────────────────
  console.log('\n  Pure typing after a partial edit still folds');
  const beforeTyping = entries.length;
  let typed = STEPS[STEPS.length - 1].html;
  for (let i = 1; i <= 5; i++) {
    typed = typed.replace('</p>' + '', '</p>');
    typed = typed + `<p>Appended line ${i}.</p>`;
    await post('/doc', { otp, fileId, content: typed, authorNodeId: A, isSessionEnd: false, committedAt: Date.now() });
  }
  const h2 = await get(`/history?otp=${otp}&fileId=${fileId}`);
  const after = (h2.data?.data?.entries ?? []).length;
  check(
    after - beforeTyping <= 1,
    'five pure appends added at most one version',
    `${beforeTyping} -> ${after}`
  );
  const l2 = (h2.data?.data?.entries ?? []).map((e) => text(e.fullContent));
  const d2 = [...l2.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map()).entries()].filter(([, n]) => n > 1);
  check(d2.length === 0, 'and produced no duplicates', d2.length ? `${d2.length} dupes` : 'clean');

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n  ${passed} passed, ${failed} failed`);
  console.log(`  room=${otp} fileId=${fileId}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nProbe crashed:', e); process.exit(1); });
