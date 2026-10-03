/**
 * INTEGRITY INJECTION — does the engine still reject a bad delta?
 *
 * BUG-2 was fixed by letting a delta that fails to apply locally reach
 * conflict resolution instead of being discarded. That is only safe if a
 * genuinely damaged payload is still refused. The line-granularity suites
 * cannot show this, because every delta they produce is valid.
 *
 * This test speaks the peer protocol directly. It opens a raw WebSocket to a
 * real Electron instance's engine port, completes PEER_HELLO, and pushes
 * deltas it has built by hand — one correct, three defective in different
 * ways. The engine is unmodified and does not know the sender is a test.
 *
 * The payload format is replicated from the engine's own codec:
 *   { version: 1, ops: [{type: 'equal'|'insert'|'delete', text}], checksum }
 * base64 of the JSON, checksum = FNV-1a 32 of the content the delta produces.
 * `equal` copies from the previous content at a cursor, `delete` skips it,
 * `insert` appends new text.
 *
 * Run: node scripts/qa-integrity-inject.js
 */
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const WebSocket = require(path.join(
  path.resolve(__dirname, '..', '..', 'desktop'), 'node_modules', 'ws'
));

const DESKTOP_DIR = path.resolve(__dirname, '..', '..', 'desktop');
const MAIN = path.join(DESKTOP_DIR, 'dist-electron', 'main.js');
const ELECTRON_BIN = path.join(DESKTOP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe');
const accounts = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa-accounts.json'), 'utf8'));
const U = Object.fromEntries(accounts.map((a) => [a.id, a]));

const results = [];
let group = '';
const phase = (n) => { group = n; console.log(`\n== ${n} ${'='.repeat(Math.max(0, 54 - n.length))}`); };
function check(ok, name, detail = '') {
  results.push({ group, name, ok, detail });
  console.log(`  ${ok === null ? 'INFO' : ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
  return ok;
}
const sha = (s) => crypto.createHash('sha256').update(s ?? '', 'utf8').digest('hex').slice(0, 16);

// ── the engine's own codec, replicated ──────────────────────────────────────
function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
const encodePayload = (ops, expectedOutput) =>
  Buffer.from(JSON.stringify({ version: 1, ops, checksum: fnv1a32(expectedOutput) }), 'utf8')
    .toString('base64');

/** Replaces one whole line, expressed the way the codec expects. */
function replaceLineDelta(previous, lineIndex, newLine) {
  const lines = previous.split('\n');
  const head = lines.slice(0, lineIndex).map((l) => l + '\n').join('');
  const oldLine = lines[lineIndex];
  const tail = lines.slice(lineIndex + 1).map((l, i, a) => (i < a.length - 1 ? l + '\n' : l)).join('');
  const output = head + newLine + '\n' + tail;
  const ops = [
    ...(head ? [{ type: 'equal', text: head }] : []),
    { type: 'delete', text: oldLine },
    { type: 'insert', text: newLine },
    { type: 'equal', text: previous.slice(head.length + oldLine.length) },
  ];
  return { deltaBase64: encodePayload(ops, output), output, ops };
}

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

let app = null, page = null, userData = null, ws = null;

(async () => {
  console.log('DocuSync -- integrity injection over the real peer protocol\n');
  try {
    phase('Launch one instance and open a document');
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'inj-'));
    app = await electron.launch({
      executablePath: ELECTRON_BIN,
      args: [MAIN, `--user-data-dir=${userData}`],
      cwd: DESKTOP_DIR,
      env: {
        ...process.env,
        DOCUSYNC_LOCAL_UI: '1',
        DOCUSYNC_WS_PORT: '9000',
        DOCUSYNC_NODE_INDEX: '0',
        DOCUSYNC_NODE_COUNT: '4',
      },
      timeout: 60000,
    });
    page = await app.firstWindow({ timeout: 45000 });
    const engineLog = [];
    try {
      const proc = app.process();
      const keep = (d) => {
        for (const l of String(d).split(String.fromCharCode(10))) {
          const t = l.trim();
          if (t) engineLog.push(t);
        }
      };
      proc.stdout?.on('data', (d) => keep(d.toString()));
      proc.stderr?.on('data', (d) => keep('[err] ' + d.toString()));
    } catch { }
    await page.waitForLoadState('domcontentloaded').catch(() => { });
    await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 40000 });
    await page.fill('input[placeholder="Enter your username"]', U.A.email);
    await page.fill('input[placeholder="Enter your password"]', U.A.password);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !location.hash.includes('vault-login'), { timeout: 40000 });
    check(true, 'instance running with its engine port open', 'ws://127.0.0.1:9000');

    const BASE = 'I one.\nI two.\nI three.\n';
    const name = `inj-${Date.now()}.txt`;
    const fileId = await page.evaluate(async (a) => {
      const r = await window.docuSync.importRoomFile(a.name, a.content);
      return r.data?.fileId ?? r.fileId;
    }, { name, content: BASE });
    check(typeof fileId === 'number', 'document imported', `fileId=${fileId}`);

    // Move this instance off the base, so an incoming delta taken against the
    // base cannot apply cleanly and must go through the integrity gate.
    const LOCAL = BASE.replace('I one.', 'I one. LOCAL-EDIT.');
    await page.evaluate(async (a) => window.docuSync.saveFile(a.id, a.html, null), { id: fileId, html: LOCAL });
    await settle(2500);

    const read = () => page.evaluate(async (a) => {
      const r = await window.docuSync.openFile(a.id, a.name);
      return (r.data && r.data.content) ?? null;
    }, { id: fileId, name });

    check(sha(await read()) === sha(LOCAL), 'instance holds its own edit before injection', sha(LOCAL));

    phase('Speak the peer protocol as an unmodified peer would');
    const senderNode = '00000000-dead-beef-0000-000000000001';
    ws = new WebSocket('ws://127.0.0.1:9000');
    await new Promise((res, rej) => {
      ws.on('open', res);
      ws.on('error', rej);
      setTimeout(() => rej(new Error('socket did not open within 10s')), 10000);
    });
    const inbound = [];
    ws.on('message', (d) => { try { inbound.push(JSON.parse(d.toString())); } catch { } });

    ws.send(JSON.stringify({
      type: 'PEER_HELLO',
      nodeId: senderNode,
      displayName: 'integrity-probe',
      nodeCount: 4,
      nodeIndex: 3,
      timestamp: new Date().toISOString(),
    }));
    await settle(2500);
    check(ws.readyState === WebSocket.OPEN, 'handshake accepted, socket still open',
      `inbound messages: ${inbound.map((m) => m.type).join(',') || 'none'}`);

    const vectorClockJson = { nodeCount: 4, nodeIndex: 3, root: {} };
    const push = async (extra) => {
      ws.send(JSON.stringify({
        type: 'DELTA_PUSH',
        nodeId: senderNode,
        fileId,
        logicalTimestamp: 50,
        vectorClockJson,
        timestamp: new Date().toISOString(),
        ...extra,
      }));
      await settle(3500);
    };

    // The honest delta the probe "made": change line 3, taken against BASE.
    const good = replaceLineDelta(BASE, 2, 'I three. REMOTE-EDIT.');

    phase('I1 - a corrupted payload must be refused');
    {
      const beforeC = await read();
      // Tamper the base64 so the JSON inside is damaged.
      const tampered = good.deltaBase64.slice(0, 20) + 'ZZZZ' + good.deltaBase64.slice(24);
      await push({
        eventId: crypto.randomUUID(),
        deltaBase64: tampered,
        baseContent: BASE,
        content: good.output,
      });
      const afterC = await read();
      check(sha(beforeC) === sha(afterC), 'I1 document unchanged after a corrupted delta',
        `${sha(beforeC)} -> ${sha(afterC)}`);
      const logged = engineLog.some((l) => /Failed to apply DELTA_PUSH/i.test(l));
      check(logged, 'I1 the rejection is visible in the engine log',
        logged ? engineLog.filter((l) => /Failed to apply DELTA_PUSH/i.test(l)).slice(-1)[0] : 'no failure logged');
    }

    phase('I2 - a payload whose checksum does not match must be refused');
    {
      const beforeC = await read();
      const wrongChecksum = Buffer.from(JSON.stringify({
        version: 1, ops: good.ops, checksum: fnv1a32('something else entirely'),
      }), 'utf8').toString('base64');
      await push({
        eventId: crypto.randomUUID(),
        deltaBase64: wrongChecksum,
        baseContent: BASE,
        content: good.output,
      });
      const afterC = await read();
      check(sha(beforeC) === sha(afterC), 'I2 document unchanged when the checksum disagrees',
        `${sha(beforeC)} -> ${sha(afterC)}`);
    }

    phase('I3 - a payload that misreports its own result must be refused');
    {
      // The delta is internally valid, but `content` is NOT what it produces.
      // Only the round-trip gate can catch this: the delta decodes, its
      // checksum is right, and nothing but replaying it against the stated
      // base reveals that the claimed result is a lie.
      const beforeC = await read();
      await push({
        eventId: crypto.randomUUID(),
        deltaBase64: good.deltaBase64,
        baseContent: BASE,
        content: 'I one. FORGED.\nI two. FORGED.\nI three. FORGED.\n',
      });
      const afterC = await read();
      check(sha(beforeC) === sha(afterC), 'I3 document unchanged when the claimed result is false',
        `${sha(beforeC)} -> ${sha(afterC)}`);
      const forged = String(afterC).includes('FORGED');
      check(!forged, 'I3 none of the forged content was written', forged ? 'FORGED TEXT PRESENT' : 'absent');
    }

    phase('I4 - a valid concurrent delta must still reach the merge');
    {
      const beforeC = await read();
      await push({
        eventId: crypto.randomUUID(),
        deltaBase64: good.deltaBase64,
        baseContent: BASE,
        content: good.output,
      });
      const afterC = await read();
      const lines = String(afterC).split('\n');
      const keptLocal = lines[0] === 'I one. LOCAL-EDIT.';
      const tookRemote = lines[2] === 'I three. REMOTE-EDIT.';
      check(keptLocal && tookRemote,
        'I4 the valid concurrent delta merged line-wise, keeping both edits',
        `line 1="${lines[0]}" line 3="${lines[2]}"`);
      check(sha(beforeC) !== sha(afterC), 'I4 the document did change for the valid delta',
        `${sha(beforeC)} -> ${sha(afterC)}`);
      const merged = engineLog.some((l) => /merged line-wise/i.test(l));
      check(merged, 'I4 the engine logged a line-wise merge',
        merged ? engineLog.filter((l) => /merged line-wise/i.test(l)).slice(-1)[0] : 'not logged');
    }

    phase('I5 - a delta with no stated ancestor must be refused');
    {
      // Without `baseContent` there is no common ancestor, so the engine has
      // nothing to merge against and must not guess.
      const beforeC = await read();
      const fromCurrent = replaceLineDelta(BASE, 1, 'I two. NO-BASE.');
      await push({
        eventId: crypto.randomUUID(),
        deltaBase64: fromCurrent.deltaBase64,
        content: fromCurrent.output,
      });
      const afterC = await read();
      check(sha(beforeC) === sha(afterC), 'I5 document unchanged with no ancestor supplied',
        `${sha(beforeC)} -> ${sha(afterC)}`);
      check(!String(afterC).includes('NO-BASE.'), 'I5 the unanchored edit was not written',
        String(afterC).includes('NO-BASE.') ? 'WRITTEN' : 'absent');
    }

    phase('Event log state after the injections');
    {
      const h = await page.evaluate(async (i) => {
        const r = await window.docuSync.getHistory(i);
        const d = (r && r.data) || {};
        return (d.entries || []).map((e) => ({ type: e.eventType, node: String(e.nodeId).slice(0, 8), rebuilt: e.reconstructed }));
      }, fileId);
      check(h.length === 3, 'only the accepted events were logged',
        `${h.length} entries: ${h.map((e) => e.type + '/' + e.node).join(' | ')} (expected baseline + local edit + one merge)`);
      check(h.every((e) => e.rebuilt !== false), 'every logged event still rebuilds from the log',
        h.map((e) => e.type).join(','));
    }
  } catch (err) {
    check(false, 'integrity injection ran to completion', err.message?.split('\n')[0] || String(err));
  } finally {
    try { if (ws && ws.readyState === WebSocket.OPEN) ws.close(); } catch { }
    if (app) await app.close().catch(() => { });
    if (userData) fs.rmSync(userData, { recursive: true, force: true });
    console.log('\n' + '='.repeat(62));
    const pass = results.filter((r) => r.ok === true).length;
    const fail = results.filter((r) => r.ok === false).length;
    console.log(`  ${pass} passed, ${fail} failed`);
    if (fail) {
      console.log('\nFAILURES:');
      results.filter((r) => r.ok === false).forEach((f) => console.log(`  - [${f.group}] ${f.name}${f.detail ? ` -- ${f.detail}` : ''}`));
      process.exitCode = 1;
    }
    fs.writeFileSync(path.join(__dirname, 'qa-integrity-inject-results.json'), JSON.stringify(results, null, 2));
  }
})();
