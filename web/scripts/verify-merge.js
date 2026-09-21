// Exercises the server-side 3-way merge over HTTP with a hard timeout, so an
// infinite loop shows up as a FAIL instead of a hung terminal.
// Run against a running server: node scripts/verify-merge.js
const BASE = 'http://localhost:3000';
const wrap = (...ps) => `<div data-margin="96">${ps.map((p) => `<p>${p}</p>`).join('')}</div>`;

async function post(body, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE}/api/lobby/doc`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: ctrl.signal,
    });
    return { ok: true, ms: Date.now() - t0, data: await r.json() };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e.name === 'AbortError' ? `TIMED OUT after ${ms}ms (server hung)` : e.message };
  } finally { clearTimeout(timer); }
}

let failures = 0;
function check(name, cond, detail) {
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failures += 1;
}

(async () => {
  const otp = 'MRG' + Math.random().toString(36).slice(2, 5).toUpperCase();
  let seq = 0;
  const push = (fileId, node, content, baseContent, extra = {}) =>
    post({ otp, fileId, authorNodeId: node, content, baseContent, seq: ++seq, committedAt: Date.now(), ...extra });

  // Case A — the hang: insertion-only hunk while the document has moved on.
  {
    const fileId = 'a' + Date.now();
    const S = wrap('Alpha', 'Beta');
    await push(fileId, 'n1', S, null);
    const S2 = wrap('Alpha edited by n2', 'Beta');
    await push(fileId, 'n2', S2, S);                       // fast-forward: base === existing
    const incoming = wrap('Alpha', 'Beta', 'Gamma added by n1');
    const r = await push(fileId, 'n1', incoming, S);        // base (S) !== existing (S2) → merge, insert-only hunk
    check('A: insert-only merge returns (no hang)', r.ok, r.ok ? `${r.ms}ms` : r.error);
    if (r.ok) {
      const m = r.data.snapshot?.content || '';
      check('A: keeps the other peer\'s edit', m.includes('Alpha edited by n2'));
      check('A: keeps the inserted paragraph', m.includes('Gamma added by n1'));
      check('A: no conflict flagged (different lines)', r.data.hadConflict === false, `hadConflict=${r.data.hadConflict}`);
      check('A: no duplicated paragraphs', (m.match(/<p>/g) || []).length === 3, `${(m.match(/<p>/g) || []).length} <p> blocks`);
    }
  }

  // Case B — genuine same-line conflict must still be detected and LWW-resolved.
  {
    const fileId = 'b' + Date.now();
    const S = wrap('Alpha', 'Beta');
    await push(fileId, 'n1', S, null);
    await push(fileId, 'n2', wrap('Alpha by n2', 'Beta'), S);
    const r = await push(fileId, 'n1', wrap('Alpha by n1', 'Beta'), S);
    check('B: same-line merge returns (no hang)', r.ok, r.ok ? `${r.ms}ms` : r.error);
    if (r.ok) {
      const m = r.data.snapshot?.content || '';
      check('B: conflict flagged', r.data.hadConflict === true, `hadConflict=${r.data.hadConflict}, hunks=${r.data.conflictHunks}`);
      check('B: later push wins (LWW)', m.includes('Alpha by n1') && !m.includes('Alpha by n2'));
      check('B: untouched line preserved once', (m.match(/<p>Beta<\/p>/g) || []).length === 1);
    }
  }

  // Case C — hunk shifted by a concurrent insert ABOVE it must still apply.
  {
    const fileId = 'c' + Date.now();
    const S = wrap('Alpha', 'Beta', 'Gamma');
    await push(fileId, 'n1', S, null);
    await push(fileId, 'n2', wrap('Top by n2', 'Alpha', 'Beta', 'Gamma'), S);   // insert above
    const r = await push(fileId, 'n1', wrap('Alpha', 'Beta', 'Gamma by n1'), S); // edit last line, stale base
    check('C: shifted-hunk merge returns (no hang)', r.ok, r.ok ? `${r.ms}ms` : r.error);
    if (r.ok) {
      const m = r.data.snapshot?.content || '';
      const paras = (m.match(/<p>(.*?)<\/p>/g) || []).map((p) => p.replace(/<\/?p>/g, ''));
      check('C: no conflict flagged (lines intact, only shifted)', r.data.hadConflict === false, `hadConflict=${r.data.hadConflict}`);
      check('C: exact paragraph order preserved', JSON.stringify(paras) === JSON.stringify(['Top by n2', 'Alpha', 'Beta', 'Gamma by n1']), JSON.stringify(paras));
    }
  }

  // Case E — a GENUINE conflict that is also shifted: the other peer inserted
  // above AND edited the same line. LWW must replace that exact line, not a
  // neighbour, and must not lose or duplicate anything else.
  {
    const fileId = 'e' + Date.now();
    const S = wrap('Alpha', 'Beta', 'Gamma');
    await push(fileId, 'n1', S, null);
    await push(fileId, 'n2', wrap('Top by n2', 'Alpha', 'Beta', 'Gamma by n2'), S);
    await new Promise((r) => setTimeout(r, 20)); // ensure a strictly later timestamp so n1 wins LWW
    const r = await push(fileId, 'n1', wrap('Alpha', 'Beta', 'Gamma by n1'), S);
    check('E: shifted true-conflict merge returns (no hang)', r.ok, r.ok ? `${r.ms}ms` : r.error);
    if (r.ok) {
      const m = r.data.snapshot?.content || '';
      const paras = (m.match(/<p>(.*?)<\/p>/g) || []).map((p) => p.replace(/<\/?p>/g, ''));
      check('E: conflict flagged', r.data.hadConflict === true, `hadConflict=${r.data.hadConflict}`);
      check('E: LWW replaced the RIGHT line, neighbours intact', JSON.stringify(paras) === JSON.stringify(['Top by n2', 'Alpha', 'Beta', 'Gamma by n1']), JSON.stringify(paras));
    }
  }

  // Case D — modifying a line whose content repeats elsewhere (blank paragraphs).
  {
    const fileId = 'd' + Date.now();
    const S = wrap('', 'Middle', '');
    await push(fileId, 'n1', S, null);
    await push(fileId, 'n2', wrap('', 'Middle by n2', ''), S);
    const r = await push(fileId, 'n1', wrap('Filled by n1', 'Middle', ''), S);   // edits first blank line; blank repeats
    check('D: repeated-line merge returns (no hang)', r.ok, r.ok ? `${r.ms}ms` : r.error);
    if (r.ok) {
      const m = r.data.snapshot?.content || '';
      check('D: keeps the other peer\'s middle edit', m.includes('Middle by n2'));
      check('D: applies edit to the repeated blank line', m.includes('Filled by n1'));
    }
  }

  console.log(failures === 0 ? '\nALL MERGE CHECKS PASSED' : `\n${failures} MERGE CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
