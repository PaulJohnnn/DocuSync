/**
 * Does the cloud relay — the path the web app, the desktop shell and the
 * mobile app all actually run on — classify an update by causal history, or
 * by the pushing device's wall clock?
 *
 * Every client on this route already sends its vector clock and the server
 * already stores it, but nothing compared the two: ordering came from
 * `committedAt`, a reading taken on the client. A scalar timestamp cannot
 * tell these four cases apart, and two laptops a minute out of step get all
 * four wrong.
 *
 * Each case below is checked through the real HTTP route, with real clocks
 * built by the same VectorClock the engine uses.
 *
 * Run: node scripts/qa-causal-semantics.js [baseUrl]
 */
const path = require('path');
const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;

// The shipping clock, compiled on demand and loaded, so this exercises the
// same implementation the route imports rather than a re-creation of it.
// ts-node lives in the desktop workspace; resolving it from there avoids
// adding a dependency to the web package for one script.
const tsNodePath = require.resolve('ts-node', {
  paths: [path.join(__dirname, '..', '..', 'desktop', 'node_modules')],
});
require(tsNodePath).register({
  transpileOnly: true,
  // The web tsconfig targets a bundler and cannot be used to load a module
  // into plain Node, so it is skipped and the few options needed are given
  // here. Only the one source file is compiled.
  skipProject: true,
  compilerOptions: {
    module: 'commonjs', target: 'es2020',
    moduleResolution: 'node', esModuleInterop: true,
  },
});
const { createVectorClock, VectorClock } = require(path.join(__dirname, '..', 'src', 'lib', 'vector-clock.ts'));

const NODES = 3;
const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok, name });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

const push = (body) => fetch(`${API}/doc`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const read = (otp, fileId) =>
  fetch(`${API}/doc?otp=${otp}&fileId=${fileId}&since=0&have=none`).then((r) => r.json());

const doc = (lines) => `<div data-margin="96">${lines.map((l) => `<p>${l}</p>`).join('')}</div>`;
const plain = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const room = () => String(100000 + Math.floor(Math.random() * 899999));

/** A client that keeps its own clock, the way a real peer does. */
function peer(nodeIndex, nodeId) {
  const clock = createVectorClock(NODES, nodeIndex);
  return {
    nodeId,
    clock,
    /** A local edit: increment, then send the resulting clock. */
    tick() { clock.increment(); return clock.toJSON(); },
    /** Having seen someone else's state, absorb its history. */
    observe(json) { if (json) { try { clock.merge(VectorClock.fromJSON(json)); } catch { /* ignore */ } } },
    snapshot() { return clock.toJSON(); },
  };
}

(async () => {
  console.log(`target: ${BASE}\n`);

  // ── 1. Sequential: B has seen A's edit, so B's push is a continuation ──
  {
    const otp = room(), f = 'causal-seq';
    const A = peer(0, 'web-A'), B = peer(1, 'web-B');
    const base = doc(['LINE A.', 'LINE B.']);
    await push({ otp, fileId: f, content: base, authorNodeId: A.nodeId, vectorClock: A.tick(), seq: 1, committedAt: Date.now(), isSessionEnd: true });

    const seen = await read(otp, f);
    B.observe(seen?.snapshot?.vectorClock ?? seen?.vectorClock);
    const r = await push({
      otp, fileId: f, content: doc(['LINE A.', 'LINE B. THEN B.']),
      authorNodeId: B.nodeId, vectorClock: B.tick(), seq: 2,
      committedAt: Date.now(), isSessionEnd: true, baseContent: base,
    });
    check(!r.body?.ignored, 'a client that has seen the server state may continue from it',
      r.body?.reason || 'applied');
    const after = await read(otp, f);
    check(/THEN B/.test(plain(after?.content)), 'the continuation is what the document now holds');
  }

  // ── 2. Duplicate: the same push delivered twice ───────────────────────
  {
    const otp = room(), f = 'causal-dup';
    const A = peer(0, 'web-A');
    const base = doc(['ONE.']);
    await push({ otp, fileId: f, content: base, authorNodeId: A.nodeId, vectorClock: A.tick(), seq: 1, committedAt: Date.now(), isSessionEnd: true });

    const body = {
      otp, fileId: f, content: doc(['ONE.', 'TWO.']), authorNodeId: A.nodeId,
      vectorClock: A.tick(), seq: 2, committedAt: Date.now(), isSessionEnd: true, baseContent: base,
    };
    const first = await push(body);
    // A retry, a reconnect replay, a message arriving twice: byte-identical.
    const second = await push({ ...body });
    check(!first.body?.ignored && second.body?.ignored && second.body?.reason === 'duplicate',
      'the same push delivered twice is applied once',
      `first=${first.body?.ignored ? 'ignored' : 'applied'}, second=${second.body?.reason || 'applied'}`);

    const h = await fetch(`${API}/history?otp=${otp}&fileId=${f}`).then((r) => r.json());
    const entries = h?.data?.entries || [];
    check(new Set(entries.map((e) => e.fullContent)).size === entries.length,
      'the duplicate leaves no second version behind', `${entries.length} versions`);
  }

  // ── 3. Stale: an old client pushes a state the server moved past ──────
  {
    const otp = room(), f = 'causal-stale';
    const A = peer(0, 'web-A'), B = peer(1, 'web-B');
    const base = doc(['ONE.']);
    await push({ otp, fileId: f, content: base, authorNodeId: A.nodeId, vectorClock: A.tick(), seq: 1, committedAt: Date.now(), isSessionEnd: true });

    // B catches up, then edits twice. A never sees either.
    const seen = await read(otp, f);
    B.observe(seen?.snapshot?.vectorClock ?? seen?.vectorClock);
    let prev = base;
    for (const text of ['ONE. B1', 'ONE. B1 B2']) {
      const next = doc([text]);
      await push({ otp, fileId: f, content: next, authorNodeId: B.nodeId, vectorClock: B.tick(), seq: 9, committedAt: Date.now(), isSessionEnd: true, baseContent: prev });
      prev = next;
    }

    // A re-pushes its old state, with a wall clock that reads LATER than
    // everything B sent — the precise case a timestamp comparison gets
    // wrong, and the one that used to roll the document back.
    const stale = await push({
      otp, fileId: f, content: doc(['ONE. A-OLD']), authorNodeId: A.nodeId,
      vectorClock: A.snapshot(), seq: 2, committedAt: Date.now() + 600000,
      isSessionEnd: true, baseContent: base,
    });
    const after = await read(otp, f);
    check(/B1/.test(plain(after?.content)) && /B2/.test(plain(after?.content)),
      'a stale push with a fast clock does not roll the document back',
      plain(after?.content));
    check(stale.body?.reason === 'stale' || !/A-OLD/.test(plain(after?.content)),
      'the stale push is recognised as stale rather than as the newest write',
      stale.body?.reason || 'applied');
  }

  // ── 4. Concurrent: neither side saw the other ─────────────────────────
  {
    const otp = room(), f = 'causal-conc';
    const A = peer(0, 'web-A'), B = peer(1, 'web-B');
    const base = doc(['PARA ONE.', 'PARA TWO.']);
    await push({ otp, fileId: f, content: base, authorNodeId: 'seed', vectorClock: peer(2, 'seed').tick(), seq: 1, committedAt: Date.now(), isSessionEnd: true });

    // Both branch from `base`, neither observes the other. Different
    // paragraphs, so a correct merge keeps both.
    const t = Date.now();
    await push({ otp, fileId: f, content: doc(['PARA ONE BY A.', 'PARA TWO.']), authorNodeId: A.nodeId, vectorClock: A.tick(), seq: 2, committedAt: t, isSessionEnd: true, baseContent: base });
    await push({ otp, fileId: f, content: doc(['PARA ONE.', 'PARA TWO BY B.']), authorNodeId: B.nodeId, vectorClock: B.tick(), seq: 2, committedAt: t - 120000, isSessionEnd: true, baseContent: base });

    const after = await read(otp, f);
    const text = plain(after?.content);
    check(/BY A/.test(text) && /BY B/.test(text),
      'two concurrent edits on different paragraphs both survive', text);
    check(!!after?.snapshot?.vectorClock || !!after?.vectorClock,
      'the merged state carries a clock forward');
  }

  // ── 5. The merged clock has seen both sides ───────────────────────────
  {
    const otp = room(), f = 'causal-merge-clock';
    const A = peer(0, 'web-A'), B = peer(1, 'web-B');
    const base = doc(['X.']);
    await push({ otp, fileId: f, content: base, authorNodeId: A.nodeId, vectorClock: A.tick(), seq: 1, committedAt: Date.now(), isSessionEnd: true });
    await push({ otp, fileId: f, content: doc(['X. B-EDIT']), authorNodeId: B.nodeId, vectorClock: B.tick(), seq: 2, committedAt: Date.now(), isSessionEnd: true, baseContent: base });

    const after = await read(otp, f);
    const storedJson = after?.snapshot?.vectorClock ?? after?.vectorClock;
    let dominatesBoth = false;
    if (storedJson) {
      try {
        const stored = VectorClock.fromJSON(storedJson);
        // The state reflects both pushes, so its clock must not be behind
        // either contributor. Keeping only the incoming clock here made the
        // next comparison answer about a document that no longer existed.
        const vsA = stored.compare(VectorClock.fromJSON(A.snapshot()));
        const vsB = stored.compare(VectorClock.fromJSON(B.snapshot()));
        dominatesBoth = ['dominant', 'equal'].includes(vsA) && ['dominant', 'equal'].includes(vsB);
      } catch { /* leaves it false */ }
    }
    check(dominatesBoth, 'the stored clock reflects every push folded into the state');
  }

  const pass = results.filter((r) => r.ok).length;
  console.log(`\n  ${pass} passed, ${results.length - pass} failed`);
  if (results.length - pass) process.exitCode = 1;
})();
