/**
 * Panel 2 #4: does the room code actually regenerate once it lapses, and
 * does the room survive it?
 *
 * The main probe can only show that a LIVE code is left alone — it cannot
 * wait a day for one to expire. This one reaches past the HTTP layer to age
 * the code by hand, then drives the ordinary host heartbeat and checks what
 * the rotation did:
 *
 *   - a new code is issued, and it is not the old one
 *   - the new code joins the room
 *   - the old code stops working, which is the point of rotating it
 *   - the room id does not move, so no document key is orphaned
 *   - the documents and their history are still there afterwards
 *
 * The last two are the ones that matter. A rotation that loses the room's
 * files is worse than a code that never expires.
 *
 * Run: node scripts/probe-code-rotation.js [baseUrl]
 */
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;

// Same credentials the running server uses, read from its own env file so
// this test cannot accidentally talk to a different store than the app.
const envPath = path.join(__dirname, '..', '.env.local');
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

// Hoisted to the workspace root, so it is resolved rather than assumed to
// sit under web/node_modules.
const { Redis } = require(require.resolve('@upstash/redis', {
  paths: [path.join(__dirname, '..'), path.join(__dirname, '..', '..')],
}));
const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN,
});

const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok, name });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

const post = async (p, body) => {
  const res = await fetch(`${API}${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const get = async (p) => {
  const res = await fetch(`${API}${p}`);
  return { status: res.status, data: await res.json().catch(() => null) };
};

const HOST = 'rot-host-' + Date.now();

async function main() {
  console.log(`\nRoom code rotation probe -- ${BASE}\n`);

  const created = await post('/create', {
    hostNodeId: HOST,
    hostIp: '127.0.0.1',
    hostPort: 9000,
    roomName: 'Rotation Probe',
    hostType: 'web',
  });
  const otp = created.data?.otp;
  if (!otp) { console.error('create failed', created); process.exit(1); }
  console.log(`  room ${otp}\n`);

  // Real content, so "the room survived" means something.
  const shared = await post('/files', {
    otp,
    file: {
      fileId: Date.now(),
      fileName: 'rotation.txt',
      content: '<p>work that must outlive the code</p>',
      sharedBy: 'Host',
      sharedByNodeId: HOST,
    },
  });
  const fileId = shared.data?.fileId;
  await post('/doc', {
    otp, fileId, authorNodeId: HOST, isSessionEnd: true, committedAt: Date.now(),
    content: '<p>work that must outlive the code</p><p>second paragraph</p>',
  });
  const before = await get(`/history?otp=${otp}&fileId=${fileId}`);
  const entriesBefore = (before.data?.data?.entries ?? []).length;
  check(entriesBefore > 0, 'the room has real document history before rotation', `${entriesBefore} entries`);

  // Age the join code. Everything else about the room is left exactly as
  // the app wrote it.
  const lobby = await redis.get(`lobby:${otp}`);
  if (!lobby) { console.error('room vanished from redis'); process.exit(1); }
  lobby.joinCodeExpiresAt = Date.now() - 1000;
  await redis.set(`lobby:${otp}`, lobby, { ex: 60 * 60 * 24 });
  console.log('  (join code aged past its expiry)\n');

  // The ordinary host heartbeat — nothing special is called.
  const beat = await post('/heartbeat', {
    nodeId: HOST,
    displayName: 'Rotation Host',
    hostedRoom: { otp, roomName: 'Rotation Probe', hostType: 'web', hostPort: 9000 },
  });

  check(beat.data?.joinCodeRotated === true, 'P2.4 a lapsed code is regenerated on the host heartbeat');
  const newCode = beat.data?.joinCode;
  check(typeof newCode === 'string' && newCode.length === 6, 'P2.4 the new code is a six-character code', `code=${newCode}`);
  check(newCode !== otp, 'P2.4 the new code differs from the old one', `${otp} -> ${newCode}`);

  const joinNew = await post('/join', { otp: newCode, memberNodeId: 'rot-joiner-new' });
  check(joinNew.status === 200, 'P2.4 the new code joins the room', `status=${joinNew.status}`);
  check(joinNew.data?.otp === otp, 'P2.4 it resolves to the same room id', `otp=${joinNew.data?.otp}`);

  const joinOld = await post('/join', { otp, memberNodeId: 'rot-joiner-old' });
  // The first code a room hands out IS its id, and that used to keep
  // admitting people for the life of the room however many times a new
  // code was minted. So the code everybody had been given never stopped
  // working, and "the code regenerates" described nothing anyone could
  // observe. The id still identifies the room internally -- every
  // document key is built from it -- but it no longer lets a stranger in.
  check(
    joinOld.status !== 200,
    'P2.4 the code people were first given stops working once it rotates',
    `status=${joinOld.status}`
  );
  const stillThere = await get(`/history?otp=${otp}&fileId=${fileId}`);
  check(
    (stillThere.data?.data?.entries ?? []).length > 0,
    'and the room itself is untouched, still addressed by that id'
  );

  // Rotate a second time: now the previous code is a genuine alias rather
  // than the room id, so its removal is observable.
  const lobby2 = await redis.get(`lobby:${otp}`);
  lobby2.joinCodeExpiresAt = Date.now() - 1000;
  await redis.set(`lobby:${otp}`, lobby2, { ex: 60 * 60 * 24 });
  const beat2 = await post('/heartbeat', {
    nodeId: HOST,
    displayName: 'Rotation Host',
    hostedRoom: { otp, roomName: 'Rotation Probe', hostType: 'web', hostPort: 9000 },
  });
  const newerCode = beat2.data?.joinCode;
  check(beat2.data?.joinCodeRotated === true, 'P2.4 the code rotates again when it lapses again');
  check(newerCode !== newCode, 'P2.4 each rotation issues a different code', `${newCode} -> ${newerCode}`);

  const joinStale = await post('/join', { otp: newCode, memberNodeId: 'rot-joiner-stale' });
  check(
    joinStale.status === 404,
    'P2.4 the superseded code stops working',
    `status=${joinStale.status}`
  );

  const joinNewest = await post('/join', { otp: newerCode, memberNodeId: 'rot-joiner-newest' });
  check(joinNewest.status === 200, 'P2.4 the current code works', `status=${joinNewest.status}`);

  // The whole reason the id and the code were separated.
  const after = await get(`/history?otp=${otp}&fileId=${fileId}`);
  const entriesAfter = (after.data?.data?.entries ?? []).length;
  check(
    entriesAfter >= entriesBefore,
    'P2.4 document history survives two rotations',
    `${entriesBefore} -> ${entriesAfter} entries`
  );

  const doc = await get(`/doc?otp=${otp}&fileId=${fileId}`);
  check(
    (doc.data?.snapshot?.content || '').includes('second paragraph'),
    'P2.4 the document itself survives two rotations'
  );

  const files = await get(`/files?otp=${otp}`);
  check(
    (files.data?.files ?? []).some((f) => (f.fileName || f.name) === 'rotation.txt'),
    'P2.4 the file list survives two rotations'
  );

  // ── The owner asks for a new one, on purpose ──────────────────────
  //
  // Rotation on expiry covers a code going stale with time. It never
  // covered the reason people actually want a new one: the old one has
  // got out -- forwarded, on a whiteboard, still held by somebody who
  // left. That wants a button, not a timer.
  const beforeManual = await redis.get(`lobby:${otp}`);
  const liveBefore = beforeManual?.joinCode || otp;
  const regen = await post('/code', { otp, nodeId: HOST });
  check(regen.status === 200 && typeof regen.data?.joinCode === 'string',
    'P2.4 the owner can ask for a new code at any time', `status=${regen.status}`);
  const manualCode = regen.data?.joinCode;
  check(!!manualCode && manualCode !== liveBefore,
    'and it is a different code', `${liveBefore} -> ${manualCode}`);

  const joinManual = await post('/join', { otp: manualCode, memberNodeId: 'rot-manual-' + Date.now() });
  check(joinManual.status === 200 && joinManual.data?.otp === otp,
    'the new code joins the same room', `status=${joinManual.status}`);

  const joinSuperseded = await post('/join', { otp: liveBefore, memberNodeId: 'rot-super-' + Date.now() });
  check(joinSuperseded.status !== 200,
    'and the one it replaced stops working immediately', `status=${joinSuperseded.status}`);

  const notOwner = await post('/code', { otp, nodeId: 'somebody-else-entirely' });
  check(notOwner.status === 403, 'only the owner can do it', `status=${notOwner.status}`);

  const survivedManual = await get(`/history?otp=${otp}&fileId=${fileId}`);
  check((survivedManual.data?.data?.entries ?? []).length > 0,
    'and the room keeps its documents through a manual change');

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => { console.error('\nProbe crashed:', err); process.exit(1); });
