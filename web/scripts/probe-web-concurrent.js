/**
 * Does the WEB path keep both edits when two people type on different lines
 * at the same time?
 *
 * The line-level merge work in this branch is in the desktop engine. The web
 * app posts to /api/lobby/doc, which runs its own merge. The demo recording
 * is made against the web app, so this has to be established before anything
 * is claimed on top of that footage.
 *
 * Posts directly to the API, the way the client does, so the result is about
 * the merge and not about editor timing.
 *
 * Run: node scripts/probe-web-concurrent.js
 */
const BASE = process.env.DEMO_BASE || 'http://localhost:3000';

const BASE_DOC =
  '<div data-margin="96"><h2>Roadmap</h2>\n'
  + '<p>LINE A. First paragraph.</p>\n'
  + '<p>LINE B. Second paragraph.</p>\n'
  + '<p>LINE C. Third paragraph.</p>\n</div>';

const post = async (body) => {
  const r = await fetch(`${BASE}/api/lobby/doc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { }
  return { status: r.status, json, text: text.slice(0, 200) };
};

const get = async (otp, fileId) => {
  const r = await fetch(`${BASE}/api/lobby/doc?otp=${otp}&fileId=${fileId}`);
  const j = await r.json().catch(() => null);
  return j;
};

(async () => {
  const otp = 'PROBE' + Math.floor(Math.random() * 10);
  const fileId = String(Date.now()).slice(-6);
  console.log(`room ${otp}  file ${fileId}\n`);

  // Seed the shared base.
  await post({
    otp, fileId, content: BASE_DOC, authorNodeId: 'seed',
    seq: 1, committedAt: Date.now(), isSessionEnd: true,
  });
  await new Promise((r) => setTimeout(r, 400));

  const committedAt = Date.now();
  const paulDoc = BASE_DOC.replace('LINE A. First paragraph.', 'LINE A. First paragraph. [PAUL]');
  const zyraDoc = BASE_DOC.replace('LINE C. Third paragraph.', 'LINE C. Third paragraph. [ZYRA]');

  // Both post from the SAME base, which is what "at the same time" means.
  const [pRes, zRes] = await Promise.all([
    post({ otp, fileId, content: paulDoc, baseContent: BASE_DOC, authorNodeId: 'paul-node',
           seq: 2, committedAt, vectorClock: { paul: 1 } }),
    post({ otp, fileId, content: zyraDoc, baseContent: BASE_DOC, authorNodeId: 'zyra-node',
           seq: 2, committedAt: committedAt + 1, vectorClock: { zyra: 1 } }),
  ]);
  console.log('  paul post:', pRes.status, pRes.json ? JSON.stringify(pRes.json).slice(0, 120) : pRes.text);
  console.log('  zyra post:', zRes.status, zRes.json ? JSON.stringify(zRes.json).slice(0, 120) : zRes.text);

  await new Promise((r) => setTimeout(r, 1500));
  const final = await get(otp, fileId);
  const content = (final && (final.content ?? final.snapshot ?? final.doc)) || '';

  const keptPaul = content.includes('[PAUL]');
  const keptZyra = content.includes('[ZYRA]');
  const middle = content.includes('LINE B. Second paragraph.');

  console.log('\n  final document:');
  console.log('   ', JSON.stringify(String(content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 220));
  console.log('\n  [PAUL] kept :', keptPaul);
  console.log('  [ZYRA] kept :', keptZyra);
  console.log('  LINE B kept :', middle);
  console.log('\n  VERDICT:', keptPaul && keptZyra
    ? 'BOTH edits survived on the web path'
    : 'ONE EDIT WAS LOST on the web path');
})();
