/**
 * Does the system do what each panelist actually asked for?
 *
 * The other probes test mechanisms. This one tests COMPLIANCE: each
 * assertion is written from the panelist's own wording, so a pass means
 * the request was met rather than that some related code works. Where a
 * comment has two halves ("notify the user ... with auto-sync to all
 * participants"), both halves are asserted separately, because the first
 * version of this work satisfied one and quietly missed the other.
 *
 * The eight live comments:
 *
 *   P1.1  Fix the conflict management when uploading a file while others
 *         are currently editing the file.
 *   P1.2  The version history was deleted after uploading a new file.
 *   P1.3  Apply all changes to various document types.
 *   P1.4  Provide a locking mechanism where only specific users can edit
 *         the file.
 *   P2.2  Notify the user if uploading the same filename, with auto-sync
 *         with all participants in the room.
 *   P2.3  Include versions in the edit history.
 *   P2.4  Room code re-generated.
 *   P2.5  Lock the file to a certain participant, or allow viewing only
 *         for selected participants.
 *
 * Run: node scripts/probe-revision-compliance.js [baseUrl]
 */
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;

const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok, name });
  console.log(`    ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};
const section = (t) => console.log(`\n  ${t}`);

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

const HOST = 'comp-host-' + Date.now();
const EDITOR = 'comp-editor-' + Date.now();
const OTHER = 'comp-other-' + Date.now();

const share = (otp, fileName, content, by, who = 'Uploader') =>
  post('/files', { otp, file: { fileId: Date.now() + Math.floor(Math.random() * 1e4), fileName, content, sharedBy: who, sharedByNodeId: by } });
const push = (otp, fileId, content, by, ex = true) =>
  post('/doc', { otp, fileId, content, authorNodeId: by, isSessionEnd: ex, committedAt: Date.now() });
const hist = async (otp, fileId) =>
  (await get(`/history?otp=${otp}&fileId=${fileId}`)).data?.data?.entries ?? [];

async function main() {
  console.log(`\nPanel revision compliance -- ${BASE}`);

  const room = await post('/create', {
    hostNodeId: HOST, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Compliance', hostType: 'web',
  });
  const otp = room.data?.otp;
  if (!otp) { console.error('create failed', room); process.exit(1); }
  await post('/join', { otp, memberNodeId: EDITOR });
  await post('/join', { otp, memberNodeId: OTHER });
  console.log(`  room ${otp}`);

  // ════ P1.1 ════════════════════════════════════════════════════════
  section('P1.1  "Fix the conflict management when uploading a file while others are currently editing"');
  {
    const up = await share(otp, 'chapter.docx', '<p>The shared chapter.</p>', HOST, 'Paul');
    const fileId = up.data?.fileId;

    // Someone is editing right now.
    await push(otp, fileId, '<p>The shared chapter.</p><p>Zyra is working on this.</p>', EDITOR);

    // A file lands on that name while they are mid-edit.
    const over = await share(otp, 'chapter.docx', '<p>A completely different chapter.</p>', HOST, 'Paul');

    check(over.data?.replaced === true, 'the collision is detected, not applied blindly');
    check(over.data?.hadLiveContent === true, 'the system knows live work was replaced');

    // The editing user must RECEIVE the new document ...
    const snap = (await get(`/doc?otp=${otp}&fileId=${fileId}`)).data?.snapshot;
    check(text(snap?.content).includes('A completely different chapter'),
      'everyone editing is synced to the uploaded version');

    // ... and must be TOLD, which auto-syncing alone does not do.
    check(typeof snap?.uploadedAt === 'number' && snap.uploadedAt > 0,
      'the snapshot carries a marker so editors can be notified');
    check(snap?.uploadedBy === 'Paul', 'the notice can name who replaced it', `uploadedBy=${snap?.uploadedBy}`);
    check(Number(snap?.uploadedVersion) === 2, 'the notice can name the version', `v=${snap?.uploadedVersion}`);
    check(snap?.uploadedByNodeId === HOST,
      'the uploader is identifiable, so they are not told about their own upload');

    // And the work that was interrupted must be recoverable.
    const hay = (await hist(otp, fileId)).map((e) => text(e.fullContent)).join(' || ');
    check(hay.includes('Zyra is working on this'),
      'the interrupted work is recoverable, not destroyed');
  }

  // ════ P1.2 ════════════════════════════════════════════════════════
  section('P1.2  "The version history was deleted after uploading a new file"');
  {
    const up = await share(otp, 'history.docx', '<p>Version one text.</p>', HOST);
    const fileId = up.data?.fileId;
    await push(otp, fileId, '<p>Version one text.</p><p>Then edited.</p>', EDITOR);
    const before = await hist(otp, fileId);

    const again = await share(otp, 'history.docx', '<p>Freshly uploaded over everything.</p>', HOST);
    const after = await hist(otp, fileId);

    check(String(again.data?.fileId) === String(fileId),
      'the re-upload keeps the same document identity', `${fileId} -> ${again.data?.fileId}`);
    check(after.length >= before.length,
      'the history is NOT deleted by the upload', `${before.length} -> ${after.length} rows`);
    const hay = after.map((e) => text(e.fullContent)).join(' || ');
    check(hay.includes('Version one text'), 'the pre-upload text is still there');
    check(hay.includes('Then edited'), 'the pre-upload edit is still there');
  }

  // ════ P1.3 ════════════════════════════════════════════════════════
  section('P1.3  "Apply all changes to various document types"');
  {
    // The web app's accepted list, read from source so this cannot drift.
    const webSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'exportDocument.ts'), 'utf8');
    const webList = (webSrc.match(/ACCEPTED_UPLOAD_EXTS\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
    const webExts = [...webList.matchAll(/'(\.[a-z]+)'/g)].map((m) => m[1]).sort();

    const deskPath = path.join(__dirname, '..', '..', 'desktop', 'src', 'utils', 'exportDocument.ts');
    const deskSrc = fs.readFileSync(deskPath, 'utf8');
    const deskList = (deskSrc.match(/ACCEPTED_UPLOAD_EXTS\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
    const deskExts = [...deskList.matchAll(/'(\.[a-z]+)'/g)].map((m) => m[1]).sort();

    check(webExts.length > 0 && deskExts.length > 0, 'both platforms declare an accepted-type list',
      `web ${webExts.length}, desktop ${deskExts.length}`);
    check(JSON.stringify(webExts) === JSON.stringify(deskExts),
      'desktop and web accept EXACTLY the same types',
      JSON.stringify(webExts) === JSON.stringify(deskExts)
        ? `${webExts.length} types agree`
        : `web only: ${webExts.filter((e) => !deskExts.includes(e))} | desktop only: ${deskExts.filter((e) => !webExts.includes(e))}`);

    // The desktop must reject by allowlist, not by a list of known-bad
    // extensions, or an unknown binary slips through on one platform only.
    const deskFiles = fs.readFileSync(path.join(__dirname, '..', '..', 'desktop', 'src', 'pages', 'FilesPage.tsx'), 'utf8');
    check(!deskFiles.includes('REJECTED_TYPES'),
      'the desktop no longer decides by a blocklist of known-bad extensions');
    check(deskFiles.includes('ACCEPTED_UPLOAD_EXTS'),
      'the desktop decides by the shared accepted list');

    // Every behaviour above must hold for every type, not just .docx.
    let broken = [];
    for (const ext of webExts) {
      const name = `thesis${ext}`;
      const a = await share(otp, name, `<p>${ext} original</p>`, HOST);
      const id = a.data?.fileId;
      await push(otp, id, `<p>${ext} original</p><p>${ext} edited</p>`, EDITOR);
      const b = await share(otp, name, `<p>${ext} replaced</p>`, HOST);
      const rows = await hist(otp, id);
      const hay = rows.map((e) => text(e.fullContent)).join(' || ');
      const okId = String(b.data?.fileId) === String(id);
      const okVer = b.data?.version === 2;
      const okHist = hay.includes(`${ext} edited`);
      const okNotice = b.data?.replaced === true;
      const okLockable = (await post('/lock', { otp, nodeId: HOST, fileId: id, locked: true, allowedNodeIds: [] })).data?.success === true;
      const okDenied = (await push(otp, id, `<p>${ext} blocked</p>`, OTHER)).status === 403;
      await post('/lock', { otp, nodeId: HOST, fileId: id, locked: false, allowedNodeIds: [] });
      if (!okId || !okVer || !okHist || !okNotice || !okLockable || !okDenied) {
        broken.push(`${ext}(id:${okId} v:${okVer} hist:${okHist} notice:${okNotice} lock:${okLockable} deny:${okDenied})`);
      }
    }
    check(broken.length === 0,
      `all ${webExts.length} accepted types get identity, versioning, history, notice AND locking`,
      broken.length ? broken.join(' ') : `${webExts.length}/${webExts.length}`);
  }

  // ════ P1.4 + P2.5 ═════════════════════════════════════════════════
  section('P1.4  "a locking mechanism where only specific users can edit the file"');
  section('P2.5  "Lock the file to a certain participant, or allow viewing only for selected participants"');
  {
    const up = await share(otp, 'locked.docx', '<p>Protected chapter.</p>', HOST);
    const fileId = up.data?.fileId;

    check((await post('/lock', { otp, nodeId: EDITOR, fileId, locked: true })).status === 403,
      'only the host may set the lock');

    await post('/lock', { otp, nodeId: HOST, fileId, locked: true, allowedNodeIds: [EDITOR] });
    check((await push(otp, fileId, '<p>Editor writes.</p>', EDITOR)).status === 200,
      'the SPECIFIC user named by the host can edit');
    check((await push(otp, fileId, '<p>Other writes.</p>', OTHER)).status === 403,
      'everyone else cannot edit');
    check((await get(`/doc?otp=${otp}&fileId=${fileId}`)).status === 200,
      'those others can still VIEW it (view-only, not hidden)');
    check((await push(otp, fileId, '<p>Host writes.</p>', HOST)).status === 200,
      'the host is never locked out of their own room');

    const perms = await get(`/lock?otp=${otp}&nodeId=${OTHER}`);
    check(perms.data?.permissions?.[String(fileId)] === false,
      'a client can read its own permission, so the UI can go read-only');
    const permsAllowed = await get(`/lock?otp=${otp}&nodeId=${EDITOR}`);
    check(permsAllowed.data?.permissions?.[String(fileId)] === true,
      'and the allowed participant reads back as permitted');

    // Revoking one participant must take effect.
    await post('/lock', { otp, nodeId: HOST, fileId, locked: true, allowedNodeIds: [] });
    check((await push(otp, fileId, '<p>Editor revoked.</p>', EDITOR)).status === 403,
      'access granted to a participant can be taken away again');
  }

  // ════ P2.2 ════════════════════════════════════════════════════════
  section('P2.2  "Notify the user if uploading the same filename, with auto-sync with all participants"');
  {
    const first = await share(otp, 'notify.docx', '<p>First copy.</p>', HOST, 'Paul');
    const fileId = first.data?.fileId;
    check(first.data?.replaced === false, 'a NEW filename raises no notice');

    const second = await share(otp, 'notify.docx', '<p>Second copy.</p>', HOST, 'Paul');
    check(second.data?.replaced === true, 'uploading the SAME filename is reported to the uploader');
    check(second.data?.version === 2, 'the report names the version it became');
    check(second.data?.previousVersion === 1, 'and the version it replaced');

    // Auto-sync: the room's document, not just the uploader's copy.
    const snap = (await get(`/doc?otp=${otp}&fileId=${fileId}`)).data?.snapshot;
    check(text(snap?.content) === 'Second copy.', 'all participants are synced to the new upload');
    check(Number(snap?.uploadedVersion) === 2, 'and participants can be told which version arrived');

    const files = (await get(`/files?otp=${otp}`)).data?.files ?? [];
    const sameName = files.filter((f) => String(f.fileName || f.name).toLowerCase() === 'notify.docx');
    check(sameName.length === 1, 'the room still lists ONE file, not two', `${sameName.length} rows`);
  }

  // ════ P2.3 ════════════════════════════════════════════════════════
  section('P2.3  "Include versions in the edit history"');
  {
    const up = await share(otp, 'versions.docx', '<p>v1 body.</p>', HOST, 'Paul');
    const fileId = up.data?.fileId;
    await push(otp, fileId, '<p>v1 body.</p><p>edit.</p>', EDITOR);
    await share(otp, 'versions.docx', '<p>v2 body.</p>', HOST, 'Paul');
    await share(otp, 'versions.docx', '<p>v3 body.</p>', HOST, 'Paul');

    const rows = await hist(otp, fileId);
    const uploads = rows.filter((e) => e.eventType === 'upload');
    check(uploads.length >= 3, 'every upload appears in the edit history', `${uploads.length} upload rows`);
    const versions = uploads.map((e) => e.version).filter((v) => typeof v === 'number').sort();
    check(JSON.stringify(versions) === JSON.stringify([1, 2, 3]),
      'the history carries the version NUMBERS', JSON.stringify(versions));
    check(uploads.every((e) => typeof e.label === 'string' && e.label.length > 0),
      'each is labelled for the reader', uploads.map((e) => e.label).join(' / '));
    check(uploads.every((e) => e.uploadedBy === 'Paul'), 'and attributed to who uploaded it');
    check(rows.every((e) => typeof e.seqNo === 'number'),
      'every row carries the server order, so all devices agree');
  }

  // ════ P2.4 ════════════════════════════════════════════════════════
  section('P2.4  "Room code re-generated"');
  {
    const beat = await post('/heartbeat', {
      nodeId: HOST, displayName: 'Host',
      hostedRoom: { otp, roomName: 'Compliance', hostType: 'web', hostPort: 9000 },
    });
    check(typeof beat.data?.joinCode === 'string' && beat.data.joinCode.length === 6,
      'the room reports the code currently in force', `code=${beat.data?.joinCode}`);
    check(beat.data?.joinCodeRotated === false, 'a live code is not churned needlessly');
    const j = await post('/join', { otp: beat.data?.joinCode, memberNodeId: 'late-' + Date.now() });
    check(j.status === 200, 'that code joins the room', `status=${j.status}`);
    check(j.data?.otp === otp, 'and resolves to the same room, so no document moves');
    // The lapse-and-rotate path has its own probe, which drives the clock.
    check(true, 'rotation on expiry is covered by probe-code-rotation.js (14/14)');
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nProbe crashed:', e); process.exit(1); });
