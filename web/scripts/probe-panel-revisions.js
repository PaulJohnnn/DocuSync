/**
 * The eight panel revisions, checked through the real HTTP routes.
 *
 * Each case below is the panel's comment restated as something that either
 * happens or does not, so a failing line names the comment it belongs to
 * rather than an internal symptom.
 *
 *   P1.1  conflict management when uploading while others edit
 *   P1.2  version history survives uploading a new file
 *   P1.3  the above holds for every accepted document type
 *   P1.4  locking, so only specific users can edit
 *   P2.2  notify on same filename, and auto-sync the room
 *   P2.3  versions appear in the edit history
 *   P2.4  the room code regenerates when it lapses
 *   P2.5  lock a file to a participant / view-only for others
 *
 * Run: node scripts/probe-panel-revisions.js [baseUrl]
 */
const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;

const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok, name });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

const post = async (path, body) => {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

const get = async (path) => {
  const res = await fetch(`${API}${path}`);
  return { status: res.status, data: await res.json().catch(() => null) };
};

const HOST = 'probe-host-' + Date.now();
const PEER = 'probe-peer-' + Date.now();

const shareFile = (otp, fileName, content, nodeId, sharedBy) =>
  post('/files', {
    otp,
    file: {
      fileId: Date.now() + Math.floor(Math.random() * 1000),
      fileName,
      content,
      contentLength: content.length,
      sharedBy,
      sharedByNodeId: nodeId,
      sharedAt: new Date().toISOString(),
    },
  });

const pushEdit = (otp, fileId, content, nodeId) =>
  post('/doc', {
    otp,
    fileId,
    content,
    authorNodeId: nodeId,
    isSessionEnd: true,
    committedAt: Date.now(),
  });

const historyOf = (otp, fileId) => get(`/history?otp=${otp}&fileId=${fileId}`);

async function main() {
  console.log(`\nPanel revisions probe -- ${BASE}\n`);

  // ── Setup ────────────────────────────────────────────────────────────
  const created = await post('/create', {
    hostNodeId: HOST,
    hostIp: '127.0.0.1',
    hostPort: 9000,
    roomName: 'Panel Revision Probe',
    hostType: 'web',
  });
  if (!created.data?.otp) {
    console.error('Could not create a room:', created.status, created.data);
    process.exit(1);
  }
  const otp = created.data.otp;
  console.log(`  room ${otp}\n`);

  await post('/join', { otp, memberNodeId: PEER });

  // ── P1.2 / P2.3: history survives a re-upload, and is versioned ──────
  console.log('  P1.2 / P2.3 -- version history across an upload');
  const first = await shareFile(otp, 'thesis.txt', '<p>Chapter 1 original</p>', HOST, 'Host');
  const fileId = first.data?.fileId;
  check(!!fileId, 'the room assigns the file an id', `fileId=${fileId}`);
  check(first.data?.version === 1, 'a new filename is version 1', `version=${first.data?.version}`);
  check(first.data?.replaced === false, 'a new filename is not reported as a replacement');

  await pushEdit(otp, fileId, '<p>Chapter 1 original</p><p>Real collaborative work</p>', PEER);
  const beforeReupload = await historyOf(otp, fileId);
  const countBefore = beforeReupload.data?.data?.entries?.length ?? 0;
  check(countBefore >= 2, 'edits are recorded in the history', `${countBefore} entries`);

  // The comment: "The version history was deleted after uploading a new file."
  const second = await shareFile(otp, 'thesis.txt', '<p>Chapter 1 REPLACED</p>', HOST, 'Host');
  check(
    String(second.data?.fileId) === String(fileId),
    'P1.2 re-uploading the same name keeps the same file id',
    `${fileId} -> ${second.data?.fileId}`
  );
  check(second.data?.version === 2, 'P2.3 the re-upload becomes version 2', `version=${second.data?.version}`);

  const afterReupload = await historyOf(otp, fileId);
  const entries = afterReupload.data?.data?.entries ?? [];
  check(
    entries.length > countBefore,
    'P1.2 the history survives the upload and grows',
    `${countBefore} -> ${entries.length} entries`
  );

  const uploadRows = entries.filter((e) => e.eventType === 'upload');
  check(uploadRows.length >= 2, 'P2.3 each upload appears in the history', `${uploadRows.length} upload rows`);
  check(
    uploadRows.some((e) => e.version === 2),
    'P2.3 the history carries the upload version number'
  );

  // The work the upload replaced must still be reachable, or "nothing was
  // lost" is a claim rather than a fact.
  check(
    entries.some((e) => typeof e.fullContent === 'string' && e.fullContent.includes('Real collaborative work')),
    'P1.1 the text the upload replaced is still restorable'
  );

  // ── P1.1 / P2.2: the upload is reported, and reaches the room ────────
  console.log('\n  P1.1 / P2.2 -- same-filename notice and auto-sync');
  check(second.data?.replaced === true, 'P2.2 the uploader is told the name was already taken');
  check(second.data?.hadLiveContent === true, 'P2.2 the uploader is told live work was replaced');
  check(second.data?.previousVersion === 1, 'P2.2 the notice names the version it replaced');

  const synced = await get(`/doc?otp=${otp}&fileId=${fileId}`);
  check(
    (synced.data?.snapshot?.content || '').includes('REPLACED'),
    'P1.1 everyone in the room is synced to the uploaded text'
  );

  // ── P1.4 / P2.5: file locking, host only ─────────────────────────────
  console.log('\n  P1.4 / P2.5 -- file locking and view-only participants');
  const peerBeforeLock = await pushEdit(otp, fileId, '<p>peer edit before lock</p>', PEER);
  check(peerBeforeLock.status === 200, 'an unlocked file accepts edits from a peer');

  const notHost = await post('/lock', { otp, nodeId: PEER, fileId, locked: true });
  check(notHost.status === 403, 'P1.4 a non-host cannot lock a file', `status=${notHost.status}`);

  const locked = await post('/lock', { otp, nodeId: HOST, fileId, locked: true, allowedNodeIds: [] });
  check(locked.data?.success === true && locked.data?.scope === 'file', 'P1.4 the host can lock a file');

  const peerAfterLock = await pushEdit(otp, fileId, '<p>peer edit AFTER lock</p>', PEER);
  check(peerAfterLock.status === 403, 'P1.4 a locked file refuses a peer edit', `status=${peerAfterLock.status}`);
  check(peerAfterLock.data?.locked === true, 'P1.4 the refusal says the file is locked, not that sync failed');

  const afterRefusal = await get(`/doc?otp=${otp}&fileId=${fileId}`);
  check(
    !(afterRefusal.data?.snapshot?.content || '').includes('AFTER lock'),
    'P1.4 the refused edit did not reach the document'
  );
  check(
    afterRefusal.status === 200 && !!afterRefusal.data,
    'P2.5 a view-only participant can still read the document'
  );

  const hostWhileLocked = await pushEdit(otp, fileId, '<p>host edit while locked</p>', HOST);
  check(hostWhileLocked.status === 200, 'P1.4 the host is never locked out of their own room');

  // "lock the file to a certain participant"
  const granted = await post('/lock', { otp, nodeId: HOST, fileId, locked: true, allowedNodeIds: [PEER] });
  check(granted.data?.success === true, 'P2.5 the host can grant one participant edit access');

  const peerGranted = await pushEdit(otp, fileId, '<p>granted peer edit</p>', PEER);
  check(peerGranted.status === 200, 'P2.5 the granted participant can edit again', `status=${peerGranted.status}`);

  const perms = await get(`/lock?otp=${otp}&nodeId=${PEER}`);
  check(perms.data?.permissions?.[String(fileId)] === true, 'P2.5 the permission is readable by the client');

  const unlocked = await post('/lock', { otp, nodeId: HOST, fileId, locked: false, allowedNodeIds: [] });
  check(unlocked.data?.success === true, 'P1.4 the host can unlock the file again');
  const afterUnlock = await pushEdit(otp, fileId, '<p>everyone can edit again</p>', PEER);
  check(afterUnlock.status === 200, 'P1.4 unlocking restores editing for everyone');

  // ── P1.3: the same guarantees for every accepted document type ───────
  console.log('\n  P1.3 -- the same behaviour across every accepted file type');
  const TYPES = ['txt', 'md', 'markdown', 'html', 'htm', 'json', 'csv', 'tsv', 'xml', 'yml', 'yaml', 'log', 'tex', 'rtf', 'docx'];
  let typeFailures = [];
  for (const ext of TYPES) {
    const name = `chapter.${ext}`;
    const a = await shareFile(otp, name, `<p>${ext} v1</p>`, HOST, 'Host');
    const id = a.data?.fileId;
    await pushEdit(otp, id, `<p>${ext} v1</p><p>${ext} edited</p>`, HOST);
    const b = await shareFile(otp, name, `<p>${ext} v2</p>`, HOST, 'Host');
    const h = await historyOf(otp, id);
    const es = h.data?.data?.entries ?? [];
    const sameId = String(b.data?.fileId) === String(id);
    const versioned = b.data?.version === 2;
    const keptWork = es.some((e) => typeof e.fullContent === 'string' && e.fullContent.includes(`${ext} edited`));
    if (!sameId || !versioned || !keptWork) {
      typeFailures.push(`${ext}(id:${sameId} v:${versioned} kept:${keptWork})`);
    }
  }
  check(
    typeFailures.length === 0,
    `P1.3 all ${TYPES.length} accepted types keep their id, version and history`,
    typeFailures.length ? typeFailures.join(' ') : `${TYPES.length}/${TYPES.length} types`
  );

  // ── P2.4: the join code regenerates when it lapses ───────────────────
  console.log('\n  P2.4 -- room code regeneration');
  const joinByCode = await post('/join', { otp, memberNodeId: 'probe-late-joiner' });
  check(joinByCode.status === 200, 'the current code still joins the room');
  check(
    !!joinByCode.data?.joinCode,
    'P2.4 join reports the code to share',
    `joinCode=${joinByCode.data?.joinCode}`
  );
  check(
    joinByCode.data?.otp === otp,
    'P2.4 the room id is stable, so document keys never move',
    `otp=${joinByCode.data?.otp}`
  );

  const beat = await post('/heartbeat', {
    nodeId: HOST,
    displayName: 'Probe Host',
    hostedRoom: { otp, roomName: 'Panel Revision Probe', hostType: 'web', hostPort: 9000 },
  });
  check(beat.status === 200, 'the host heartbeat succeeds');
  check(
    typeof beat.data?.joinCode === 'string',
    'P2.4 the heartbeat reports the code currently in force',
    `joinCode=${beat.data?.joinCode}`
  );
  check(
    beat.data?.joinCodeRotated === false,
    'P2.4 a code that has not lapsed is left alone',
    `rotated=${beat.data?.joinCodeRotated}`
  );

  // The documents must still be reachable under the room id after all of
  // the above — the whole reason the id is kept separate from the code.
  const stillThere = await historyOf(otp, fileId);
  check(
    (stillThere.data?.data?.entries ?? []).length > 0,
    'P2.4 document history is intact after code handling'
  );

  // ── Summary ──────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nProbe crashed:', err);
  process.exit(1);
});
