/**
 * The mobile app's own calls, against the same server the others use.
 *
 * Mobile is the one platform never covered. It is not an Electron shell
 * around the web app -- it is a separate React Native client that builds
 * its own requests to /api/lobby, so a fix made in the web client does not
 * reach it. Two things had to be true and were not: the screen that pushes
 * edits did not compile at all, and the upload path minted its own file id
 * and discarded the one the room assigned.
 *
 * Driving the real app needs a simulator, which is not available here. So
 * this exercises the exact requests the mobile source makes -- read from
 * that source, not re-imagined -- and asserts it ends up with the same
 * document, the same history and the same identity as the other two
 * platforms.
 *
 * Run: node scripts/probe-mobile-parity.js [baseUrl]
 */
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;
const MOBILE = path.resolve(__dirname, '..', '..', 'mobile');

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

const MOB = 'mobile-node-' + Date.now();
const WEBN = 'web-node-' + Date.now();

async function main() {
  console.log(`\nMobile parity -- ${BASE}\n`);

  // ── The source itself ────────────────────────────────────────────────
  console.log('  The mobile source');
  const editor = fs.readFileSync(path.join(MOBILE, 'screens', 'EditorScreen.tsx'), 'utf8');
  const files = fs.readFileSync(path.join(MOBILE, 'screens', 'FilesScreen.tsx'), 'utf8');
  const settings = fs.readFileSync(path.join(MOBILE, 'screens', 'SettingsScreen.tsx'), 'utf8');

  // A preview deployment is frozen at the commit that produced it and is
  // deleted in time, so anything defaulting to one stops receiving fixes
  // and eventually stops answering.
  const stale = [['EditorScreen', editor], ['FilesScreen', files], ['SettingsScreen', settings]]
    .filter(([, src]) => /docusync-[a-z0-9]{6,}-[a-z-]*\.vercel\.app/.test(src))
    .map(([n]) => n);
  check(stale.length === 0, 'no screen falls back to a frozen preview deployment',
    stale.length ? `still stale: ${stale.join(', ')}` : 'all point at production');

  check(/docusync-dusky\.vercel\.app/.test(editor) && /docusync-dusky\.vercel\.app/.test(files),
    'the cloud fallback is the production address');

  // The upload must keep the id the ROOM assigns, not the one it proposed.
  check(/data\.fileId\s*\?\?\s*proposedId/.test(files),
    'the upload path adopts the file id the room assigns');
  check(/data\.replaced/.test(files),
    'the upload path reports a same-filename replacement to the user');

  // ── The same room, from mobile's point of view ───────────────────────
  console.log('\n  Mobile and web in one room');
  const room = await post('/create', {
    hostNodeId: WEBN, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Mobile Parity', hostType: 'web',
  });
  const otp = room.data?.otp;
  if (!otp) { console.error('create failed', room); process.exit(1); }
  const joined = await post('/join', { otp, memberNodeId: MOB });
  check(joined.status === 200, 'a mobile device can join the room', `status=${joined.status}`);

  // Mobile shares a file exactly as FilesScreen does.
  const first = await post('/files', {
    otp,
    file: {
      fileId: Date.now(), fileName: 'kabanata-3.docx',
      content: '<p>Kabanata 3 mula sa telepono.</p>',
      contentLength: 34, sharedBy: 'Mobile Node', sharedAt: new Date().toISOString(),
    },
  });
  const fileId = first.data?.fileId;
  check(!!fileId, 'mobile can share a file into the room', `fileId=${fileId}`);

  // ── Mobile -> Web ────────────────────────────────────────────────────
  console.log('\n  Mobile -> Web');
  await post('/doc', {
    otp, fileId, content: '<p>Kabanata 3 mula sa telepono.</p><p>MOBILE wrote this.</p>',
    authorNodeId: MOB, isSessionEnd: true, committedAt: Date.now(),
  });
  const seenByWeb = text((await get(`/doc?otp=${otp}&fileId=${fileId}`)).data?.snapshot?.content);
  check(seenByWeb.includes('MOBILE wrote this'), 'what mobile writes is visible to the other platforms');

  // ── Web -> Mobile ────────────────────────────────────────────────────
  console.log('\n  Web -> Mobile');
  await post('/doc', {
    otp, fileId,
    content: '<p>Kabanata 3 mula sa telepono.</p><p>MOBILE wrote this.</p><p>WEB wrote this.</p>',
    authorNodeId: WEBN, isSessionEnd: true, committedAt: Date.now(),
  });
  const seenByMobile = text((await get(`/doc?otp=${otp}&fileId=${fileId}`)).data?.snapshot?.content);
  check(seenByMobile.includes('WEB wrote this'), 'what the web writes is visible to mobile');
  check(seenByMobile.includes('MOBILE wrote this'), 'and neither side lost the other');

  // ── The panel's fixes reach mobile ───────────────────────────────────
  console.log('\n  The revisions apply to mobile too');
  const second = await post('/files', {
    otp,
    file: {
      fileId: Date.now() + 7, fileName: 'kabanata-3.docx',
      content: '<p>Bagong kabanata mula sa telepono.</p>',
      sharedBy: 'Mobile Node', sharedByNodeId: MOB,
    },
  });
  check(String(second.data?.fileId) === String(fileId),
    'P1.2 a re-upload from mobile keeps the same document id', `${fileId} -> ${second.data?.fileId}`);
  check(second.data?.replaced === true, 'P2.2 mobile is told the filename was already taken');
  check(second.data?.version === 2, 'P2.3 the upload is version 2', `v=${second.data?.version}`);

  const rows = (await get(`/history?otp=${otp}&fileId=${fileId}`)).data?.data?.entries ?? [];
  const hay = rows.map((e) => text(e.fullContent)).join(' || ');
  check(hay.includes('MOBILE wrote this'), 'P1.2 mobile work survives the re-upload');
  check(hay.includes('WEB wrote this'), 'P1.2 web work survives it too');
  check(rows.some((e) => e.eventType === 'upload' && e.version === 2),
    'P2.3 the upload is versioned in the history mobile reads');

  const snap = (await get(`/doc?otp=${otp}&fileId=${fileId}`)).data?.snapshot;
  check(typeof snap?.uploadedAt === 'number',
    'P1.1 mobile receives the marker that tells a user their file was replaced');

  // Locking must bind mobile as well, or "only specific users can edit"
  // is false on one third of the platforms.
  await post('/lock', { otp, nodeId: WEBN, fileId, locked: true, allowedNodeIds: [] });
  const denied = await post('/doc', {
    otp, fileId, content: '<p>mobile tries to write while locked</p>',
    authorNodeId: MOB, isSessionEnd: true, committedAt: Date.now(),
  });
  check(denied.status === 403, 'P1.4 a locked file refuses a mobile edit', `status=${denied.status}`);
  check(denied.data?.locked === true, 'P2.5 and tells mobile it is view-only, not broken');
  check((await get(`/doc?otp=${otp}&fileId=${fileId}`)).status === 200,
    'P2.5 mobile can still READ the locked file');

  await post('/lock', { otp, nodeId: WEBN, fileId, locked: true, allowedNodeIds: [MOB] });
  const allowed = await post('/doc', {
    otp, fileId, content: '<p>mobile writes once granted</p>',
    authorNodeId: MOB, isSessionEnd: true, committedAt: Date.now(),
  });
  check(allowed.status === 200, 'P2.5 the host can grant the mobile device edit access', `status=${allowed.status}`);
  await post('/lock', { otp, nodeId: WEBN, fileId, locked: false, allowedNodeIds: [] });

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nProbe crashed:', e); process.exit(1); });
