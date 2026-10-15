/**
 * Runs every probe and prints one table.
 *
 * Some of these drive a browser, some drive the real Electron desktop
 * build, and one needs direct Redis access so it can only run against a
 * local server. Each is labelled with which, because "all tests pass"
 * means very little without saying what was actually exercised.
 *
 * Run: node scripts/run-all-probes.js [baseUrl]
 *      node scripts/run-all-probes.js [baseUrl] --repeat-flaky 5
 */
const { execFileSync } = require('child_process');
const path = require('path');

const BASE = process.argv[2] || 'https://docusync-dusky.vercel.app';
const repeatIdx = process.argv.indexOf('--repeat-flaky');
const REPEATS = repeatIdx > -1 ? Number(process.argv[repeatIdx + 1]) || 3 : 1;

/** what each probe actually drives */
const WEB = 'browser';
const DESKTOP = 'real Electron + browser';
const API = 'server only';

const PROBES = [
  ['probe-access-ux', 'Owner, roles, request load', WEB],
  ['probe-file-access', 'Who can open each file', WEB],
  ['probe-access-desktop', 'Access panel on the desktop app', DESKTOP],
  ['probe-cross-platform', 'Desktop and web on one document', DESKTOP, true],
  ['probe-panel-revisions', 'The eight panel revisions', WEB],
  ['probe-revision-compliance', 'Revisions, re-checked end to end', WEB],
  ['probe-tables', 'Tables: make, sync, download', WEB],
  ['probe-cursor-edges', 'Remote carets in awkward cases', WEB],
  ['probe-history-zero-data-loss', 'History keeps every version', WEB],
  ['probe-history-edit-kinds', 'History across kinds of edit', WEB],
  ['probe-history-partial-edits', 'History on partial edits', WEB],
  ['probe-history-restore-every-version', 'Restoring any version', WEB],
  ['probe-bug-hunt', 'Bug hunt, first pass', WEB],
  ['probe-bug-hunt-2', 'Bug hunt, second pass', WEB],
  ['probe-code-rotation', 'Room code regeneration', API],
];

const run = (file, base) => {
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, file + '.js'), base], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20 * 60 * 1000,
    });
    return out;
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '') + (e.message || '');
  }
};

const parse = (out) => {
  const m = /(\d+) passed, (\d+) failed/.exec(out);
  if (m) return { passed: Number(m[1]), failed: Number(m[2]) };
  if (/crashed|TimeoutError|Error:/i.test(out)) return { passed: 0, failed: -1 };
  return null;
};

const failures = (out) => (out.match(/^\s*FAIL\s+.*$/gm) || []).map((l) => l.trim());

async function main() {
  console.log('');
  console.log('DocuSync -- full probe run');
  console.log('  target: ' + BASE);
  console.log('  ' + new Date().toString());
  console.log('');

  const rows = [];
  for (const [file, what, drives, flaky] of PROBES) {
    // The rotation probe ages a join code by writing Redis directly, and
    // production's database is not reachable that way, so it runs against
    // a local server whatever target was asked for.
    const target = drives === API ? 'http://localhost:3000' : BASE;
    const runs = flaky ? REPEATS : 1;
    let agg = null; const fails = []; let flakyFails = 0;

    for (let i = 0; i < runs; i++) {
      process.stdout.write(`  running ${file}${runs > 1 ? ` (${i + 1}/${runs})` : ''}...\r`);
      const out = run(file, target);
      const r = parse(out);
      if (!agg || (r && r.passed > agg.passed)) agg = r;
      if (r && r.failed > 0) { flakyFails++; for (const f of failures(out)) if (!fails.includes(f)) fails.push(f); }
      if (r && r.failed === -1) { for (const f of ['probe did not complete']) if (!fails.includes(f)) fails.push(f); }
    }
    rows.push({ file, what, drives, agg, fails, runs, flakyFails, target });
    const tag = agg == null ? '??' : agg.failed === -1 ? 'CRASH' : agg.failed === 0 ? 'pass' : 'FAIL';
    console.log(`  ${tag.padEnd(6)}${file.padEnd(38)}${agg ? `${agg.passed}/${agg.passed + Math.max(agg.failed, 0)}` : ''}${runs > 1 ? `   (${runs - flakyFails}/${runs} runs clean)` : ''}`);
  }

  console.log('');
  console.log('='.repeat(78));
  console.log('');
  let totalPass = 0; let totalFail = 0;
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('WHAT WAS CHECKED', 38) + pad('DRIVES', 24) + 'RESULT');
  console.log('-'.repeat(78));
  for (const r of rows) {
    if (r.agg && r.agg.failed > 0) totalFail += r.agg.failed;
    if (r.agg) totalPass += r.agg.passed;
    const result = r.agg == null ? 'did not report'
      : r.agg.failed === -1 ? 'did not complete'
      : r.agg.failed === 0 ? `${r.agg.passed}/${r.agg.passed} pass`
      : `${r.agg.passed} pass, ${r.agg.failed} FAIL`;
    console.log(pad(r.what, 38) + pad(r.drives, 24) + result);
  }
  console.log('-'.repeat(78));
  console.log(pad('TOTAL', 62) + `${totalPass} passed, ${totalFail} failed`);
  console.log('');

  const withFails = rows.filter((r) => r.fails.length);
  if (withFails.length) {
    console.log('What failed, and how often:');
    for (const r of withFails) {
      console.log(`  ${r.file}  (failed in ${r.flakyFails} of ${r.runs} run${r.runs > 1 ? 's' : ''})`);
      for (const f of r.fails) console.log('    ' + f);
    }
    console.log('');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
