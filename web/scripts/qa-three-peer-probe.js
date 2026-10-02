/**
 * Probe: why does a THIRD desktop take no part in sync?
 *
 * L6 and the relay check both showed instance C neither sending nor
 * receiving, while A and B worked. This reports, per instance, the node id
 * the engine is using and the peers it believes it has, then has each
 * instance save and reports how many peers each save was pushed to.
 *
 * Run: node scripts/qa-three-peer-probe.js
 */
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DESKTOP_DIR = path.resolve(__dirname, '..', '..', 'desktop');
const MAIN = path.join(DESKTOP_DIR, 'dist-electron', 'main.js');
const ELECTRON_BIN = path.join(DESKTOP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe');
const accounts = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa-accounts.json'), 'utf8'));
const U = Object.fromEntries(accounts.map((a) => [a.id, a]));

const instances = [];
async function launch(label, wsPort, nodeIndex, user) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `probe-${label}-`));
  const app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: [MAIN, `--user-data-dir=${userData}`],
    cwd: DESKTOP_DIR,
    env: {
      ...process.env,
      DOCUSYNC_LOCAL_UI: '1',
      DOCUSYNC_WS_PORT: String(wsPort),
      DOCUSYNC_NODE_INDEX: String(nodeIndex),
      DOCUSYNC_NODE_COUNT: '4',
    },
    timeout: 60000,
  });
  const page = await app.firstWindow({ timeout: 45000 });
  const inst = { app, page, userData, label, wsPort, logs: [] };
  const keep = (s) => {
    for (const l of String(s).split(String.fromCharCode(10))) {
      const t = l.trim();
      if (t) inst.logs.push(t);
    }
  };
  try {
    const proc = app.process();
    proc.stdout?.on('data', (d) => keep(d.toString()));
    proc.stderr?.on('data', (d) => keep('[err] ' + d.toString()));
  } catch { }
  await page.waitForLoadState('domcontentloaded').catch(() => { });
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 40000 });
  await page.fill('input[placeholder="Enter your username"]', user.email);
  await page.fill('input[placeholder="Enter your password"]', user.password);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !location.hash.includes('vault-login'), { timeout: 40000 });
  instances.push(inst);
  return inst;
}

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

const status = (p) => p.evaluate(async () => {
  const s = await window.docuSync.getSyncStatus();
  const pl = await window.docuSync.getPeers();
  const vs = await window.docuSync.getVaultStatus();
  const peers = (pl.data && (pl.data.peers || pl.data)) || [];
  return {
    nodeId: (vs.data && vs.data.nodeId) || (s.data && s.data.nodeId) || null,
    syncNodeId: s.data ? s.data.nodeId : null,
    peerCount: Array.isArray(peers) ? peers.length : 0,
    peerIds: Array.isArray(peers) ? peers.map((x) => ({ nodeId: x.nodeId, online: x.isOnline ?? x.online, auth: x.isAuthenticated })) : [],
  };
});

(async () => {
  let A, B, C;
  try {
    A = await launch('A', 9000, 0, U.A);
    B = await launch('B', 9001, 1, U.B);
    C = await launch('C', 9002, 2, U.C);
    console.log('three instances up\n');

    await B.page.evaluate(() => window.docuSync.connectToPeer('127.0.0.1', 9000));
    await settle(2000);
    await C.page.evaluate(() => window.docuSync.connectToPeer('127.0.0.1', 9000));
    await settle(2000);
    await C.page.evaluate(() => window.docuSync.connectToPeer('127.0.0.1', 9001));
    await settle(4000);

    for (const inst of [A, B, C]) {
      const s = await status(inst.page);
      console.log(`${inst.label}: nodeId=${s.nodeId} syncNodeId=${s.syncNodeId} peers=${s.peerCount}`);
      for (const p of s.peerIds) console.log(`     peer ${p.nodeId} online=${p.online} auth=${p.auth}`);
    }

    console.log('\n-- distinct node ids? --');
    const ids = [];
    for (const inst of [A, B, C]) ids.push((await status(inst.page)).nodeId);
    console.log(`  ${JSON.stringify(ids)}  distinct=${new Set(ids).size}/3`);

    console.log('\n-- how many peers does each save actually reach? --');
    const base = 'P one.\nP two.\n';
    let id;
    for (const inst of [A, B, C]) {
      const r = await inst.page.evaluate(async (a) => {
        const x = await window.docuSync.importRoomFile(a.name, a.content, a.id);
        return x.data?.fileId ?? x.fileId;
      }, { name: `probe-${Date.now()}-${inst.label}.txt`, content: base, id });
      if (id === undefined) id = r;
    }
    await settle(1500);
    for (const inst of [A, B, C]) {
      const r = await inst.page.evaluate(async (a) => {
        const x = await window.docuSync.saveFile(a.id, a.html, null);
        return { ok: !!x.success, data: x.data ?? null, err: x.error || null };
      }, { id, html: base.replace('P one.', `P one. FROM-${inst.label}.`) });
      console.log(`  ${inst.label} save -> ${JSON.stringify(r.data)} ${r.err || ''}`);
      await settle(2500);
    }

    console.log('\n-- instance C main-process output (last 30 lines) --');
    for (const l of C.logs.slice(-30)) console.log(`  ${l}`);
    console.log('\n-- instance A main-process output (last 20 lines) --');
    for (const l of A.logs.slice(-20)) console.log(`  ${l}`);
  } catch (e) {
    console.log('PROBE ERROR: ' + (e.message || e));
  } finally {
    for (const inst of instances) {
      if (inst?.app) await inst.app.close().catch(() => { });
      if (inst?.userData) fs.rmSync(inst.userData, { recursive: true, force: true });
    }
  }
})();
