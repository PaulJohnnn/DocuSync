// Measures real keystroke-to-other-screen latency between two live peers.
// Run: node scripts/measure-sync-latency.js [trials]
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
const TRIALS = parseInt(process.argv[2] || '6', 10);

async function login(page, name) {
  await page.goto(`${BASE}/app/login`);
  await page.fill('input[placeholder="Enter your username"]', 'admin');
  await page.fill('input[placeholder="Enter your password"]', 'admin');
  await page.click('button:has-text("Log In")');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
  await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), { timeout: 15000 });
  await page.evaluate((n) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    u.name = n; sessionStorage.setItem('docusync_auth_user', JSON.stringify(u));
  }, name);
}

async function seed(page, otp, fileId, html) {
  await page.evaluate(async ({ otp, fileId, html }) => {
    const req = indexedDB.open('DocuSyncDB', 1);
    const db = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
      req.onupgradeneeded = (e) => { const d = e.target.result; if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' }); };
    });
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put({ id: fileId, name: 'latency.docx', type: 'text/plain', size: html.length, content: html, status: 'synced', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    localStorage.setItem(`ds_user-002_docusync_cached_room_files_${otp}`, JSON.stringify([{ fileId: Number(fileId), fileName: 'latency.docx', content: html, contentLength: html.length, sharedBy: 'Paul', sharedAt: new Date().toISOString() }]));
    await fetch('/api/lobby/doc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp, fileId, content: html, authorNodeId: 'seed', seq: 1, committedAt: Date.now(), isSessionEnd: true }) });
  }, { otp, fileId, html });
}

(async () => {
  const browser = await chromium.launch();
  const a = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  const b = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  try {
    await login(a, 'Paul');
    await login(b, 'Zyra');

    await a.goto(`${BASE}/app/peers`);
    await a.click('button:has-text("Create Room")');
    await a.fill('input[placeholder*="Thesis Project"]', 'LatencyTest');
    await a.click('button:has-text("Generate Room")');
    await a.waitForSelector('text=INVITE CODE');
    const otp = (await a.locator('text=INVITE CODE').locator('xpath=following-sibling::*[1]').innerText()).trim();
    await a.click('text=Enter Workspace');
    await a.waitForTimeout(1000);

    await b.goto(`${BASE}/app/peers`);
    await b.click('button:has-text("Join Room")');
    await b.locator('input[maxlength="6"]').fill(otp);
    await b.click('button:has-text("Join Room")');
    await b.waitForSelector('text=Joined Room!', { timeout: 15000 });
    await b.click('text=Enter Workspace');
    await b.waitForTimeout(1000);

    const fileId = Date.now().toString();
    const html = '<p>Baseline paragraph for the latency measurement.</p>';
    await seed(a, otp, fileId, html);
    await seed(b, otp, fileId, html);

    for (const p of [a, b]) {
      await p.goto(`${BASE}/app/editor/${fileId}`);
      await p.waitForSelector('.ProseMirror');
      await p.waitForTimeout(1200);
    }
    await a.evaluate(async ({ otp, fileId, html }) => {
      await fetch('/api/lobby/doc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp, fileId, content: html, authorNodeId: 'seed2', seq: 2, committedAt: Date.now(), isSessionEnd: true }) });
    }, { otp, fileId, html });
    for (const p of [a, b]) {
      await p.reload();
      await p.waitForSelector('.ProseMirror');
      await p.waitForTimeout(2500);
    }

    // (Trial 0 below acts as the warm-up and is excluded from the stats.)

    // Track every doc poll each page makes, with whether the reply carried
    // the token, so a stall can be attributed to "receiver stopped polling"
    // vs "server never had it" vs "receiver got it but didn't apply it".
    const pollLog = { a: [], b: [] };
    const trackPolls = (page, key) => {
      page.on('response', async (res) => {
        const url = res.url();
        if (!url.includes('/api/lobby/doc')) return;
        const isGet = res.request().method() === 'GET';
        let hasToken = null, upToDate = null;
        try {
          const body = await res.json();
          upToDate = body.upToDate;
          hasToken = typeof body.content === 'string' ? body.content : (body.snapshot?.content || '');
        } catch {}
        pollLog[key].push({ t: Date.now(), method: isGet ? 'GET' : 'POST', upToDate, content: hasToken });
      });
    };
    trackPolls(a, 'a');
    trackPolls(b, 'b');

    // In-browser timing hooks. The sender records Date.now() on every
    // `input` event; the receiver records Date.now() the instant a
    // MutationObserver sees a watched token appear. Both browsers share
    // this machine's clock, so the difference is the true keystroke →
    // other-screen latency with no Playwright dispatch delay mixed in.
    for (const p of [a, b]) {
      await p.evaluate(() => {
        window.__lastInputAt = 0;
        document.addEventListener('input', () => { window.__lastInputAt = Date.now(); }, true);
        window.__seenAt = {};      // token first visible in the LIVE .ProseMirror
        window.__gotTokenAt = {};  // token first present in a GET /api/lobby/doc reply
        window.__watch = [];
        window.__pmSwaps = 0;      // how many times the .ProseMirror element was replaced (remount)
        window.__pmOriginal = document.querySelector('.ProseMirror');

        // Document text with remote-cursor widgets stripped. The other
        // peer's cursor is a widget decoration carrying a name label
        // (<span class="collaboration-cursor__caret"><div>Zyra</div></span>)
        // and it renders one character behind the true caret after typing
        // stops (the 200ms cursor throttle drops the final update) — i.e.
        // INSIDE the token just typed. Reading innerText naively then sees
        // "TOKEN13\nZyra\nX" and never matches "TOKEN13X", which looked
        // like a ~19s sync stall until the server's cursor TTL expired.
        window.__docText = () => {
          const live = document.querySelector('.ProseMirror');
          if (!live) return '';
          const clone = live.cloneNode(true);
          clone.querySelectorAll('.collaboration-cursor__caret, .collaboration-cursor__label').forEach((e) => e.remove());
          return clone.textContent || '';
        };

        // Watch the whole body so a remounted editor is still caught, and
        // always read the LIVE .ProseMirror rather than a captured reference.
        new MutationObserver(() => {
          if (!window.__watch.length) return;
          const text = window.__docText();
          for (const tok of window.__watch) {
            if (!window.__seenAt[tok] && text.includes(tok)) window.__seenAt[tok] = Date.now();
          }
        }).observe(document.body, { childList: true, characterData: true, subtree: true });

        setInterval(() => {
          const live = document.querySelector('.ProseMirror');
          if (live && live !== window.__pmOriginal) { window.__pmSwaps += 1; window.__pmOriginal = live; }
        }, 100);

        // Log when each watched token first arrives over the network.
        const origFetch = window.fetch;
        window.fetch = async (...args) => {
          const res = await origFetch(...args);
          try {
            const url = typeof args[0] === 'string' ? args[0] : args[0].url;
            if (url.includes('/api/lobby/doc') && (!args[1] || !args[1].method || args[1].method === 'GET')) {
              const clone = res.clone();
              clone.json().then((d) => {
                const c = d.content || (d.snapshot && d.snapshot.content) || '';
                for (const tok of window.__watch) {
                  if (!window.__gotTokenAt[tok] && c.includes(tok)) window.__gotTokenAt[tok] = Date.now();
                }
              }).catch(() => {});
            }
          } catch {}
          return res;
        };
      });
    }

    const results = [];
    for (let i = 0; i < TRIALS + 1; i++) {
      const token = `TOKEN${i}X`;
      // Alternate direction so both A→B and B→A are covered.
      const sender = i % 2 === 0 ? a : b;
      const receiver = i % 2 === 0 ? b : a;
      const recvKey = i % 2 === 0 ? 'b' : 'a';
      const sendKey = i % 2 === 0 ? 'a' : 'b';

      await receiver.evaluate((t) => { window.__watch.push(t); }, token);
      await sender.locator('.ProseMirror').click();
      await sender.keyboard.press('Control+End');
      // Type the whole token; the clock starts on the LAST keystroke's input
      // event (read back from the sender's browser), since that is when the
      // user has finished the edit they expect to sync.
      await sender.keyboard.type(' ' + token, { delay: 15 });
      const t0 = await sender.evaluate(() => window.__lastInputAt);

      // STRESS mode reproduces the stall's trigger on purpose: once the
      // sender's push has landed, force the receiver to fire the same
      // "session end" save that the presence-count effect used to fire
      // spuriously. That pushes the receiver's STALE content, the server
      // merges it with the sender's newer edit, and the resulting snapshot
      // is authored by the receiver — the exact state in which the old
      // author-gated poll dropped the other peer's edit forever.
      if (process.env.STRESS) {
        await sender.waitForTimeout(650);
        await receiver.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
      }
      const pollDiagnostics = (label) => {
        const since = (log) => log.filter((e) => e.t >= t0);
        const rGets = since(pollLog[recvKey]).filter((e) => e.method === 'GET');
        const sPosts = since(pollLog[sendKey]).filter((e) => e.method === 'POST');
        const firstGetWithToken = rGets.find((e) => (e.content || '').includes(token));
        console.log(`\n  ${label} trial ${i + 1}:`);
        console.log(`    sender POSTs since keystroke: ${sPosts.length}` + (sPosts.length ? ` (first at +${sPosts[0].t - t0}ms, reply had token: ${(sPosts[0].content || '').includes(token)})` : '  <-- SENDER NEVER PUSHED'));
        console.log(`    receiver GET polls since keystroke: ${rGets.length}` + (rGets.length ? ` (first at +${rGets[0].t - t0}ms, last at +${rGets[rGets.length - 1].t - t0}ms)` : '  <-- RECEIVER STOPPED POLLING'));
        console.log(`    receiver GETs that carried the token: ${rGets.filter((e) => (e.content || '').includes(token)).length}` + (firstGetWithToken ? ` (first at +${firstGetWithToken.t - t0}ms)` : ''));
        console.log(`    receiver upToDate replies: ${rGets.filter((e) => e.upToDate === true).length}`);
        const rPosts = since(pollLog[recvKey]).filter((e) => e.method === 'POST');
        console.log(`    receiver POSTs since keystroke: ${rPosts.length}` + (rPosts.length ? ` (first at +${rPosts[0].t - t0}ms, reply had token: ${(rPosts[0].content || '').includes(token)})` : ''));
        // Gaps in the receiver's polling longer than ~3 ticks point at the
        // typing/pending guard blocking it.
        const gaps = [];
        for (let g = 1; g < rGets.length; g++) {
          const d = rGets[g].t - rGets[g - 1].t;
          if (d > 2500) gaps.push(`+${rGets[g - 1].t - t0}ms → +${rGets[g].t - t0}ms (${d}ms gap)`);
        }
        if (gaps.length) console.log(`    receiver polling gaps: ${gaps.join('; ')}`);
      };

      const browserMarkers = async (label) => {
        const m = await receiver.evaluate((t) => ({
          gotTokenAt: window.__gotTokenAt[t] || null,
          seenAt: window.__seenAt[t] || null,
          pmSwaps: window.__pmSwaps,
          liveHasToken: window.__docText().includes(t),
          statusBadge: document.body.innerText.match(/(Cloud Synced|Live synced[^\n]*|Syncing\.\.\.|Offline[^\n]*|Room unavailable|Merged[^\n]*)/)?.[0] || '(none)',
        }), token);
        console.log(`    [${label}] network delivered token at: ${m.gotTokenAt ? '+' + (m.gotTokenAt - t0) + 'ms' : 'never'}`);
        console.log(`    [${label}] token visible in editor DOM at: ${m.seenAt ? '+' + (m.seenAt - t0) + 'ms' : 'never'}  (live DOM has it now: ${m.liveHasToken})`);
        console.log(`    [${label}] .ProseMirror element replaced (remounts) so far: ${m.pmSwaps}`);
        console.log(`    [${label}] receiver status badge: ${m.statusBadge}`);
      };

      let seenAt = 0;
      try {
        await receiver.waitForFunction((t) => !!window.__seenAt[t], token, { timeout: 20000, polling: 25 });
        seenAt = await receiver.evaluate((t) => window.__seenAt[t], token);
        if (seenAt - t0 > 3000 || process.env.VERBOSE) {
          pollDiagnostics(seenAt - t0 > 3000 ? 'SLOW' : 'DETAIL');
          await browserMarkers('browser');
        }
      } catch (err) {
        await browserMarkers('browser');
        pollDiagnostics('STALL');
        // Diagnose where the edit got stuck: sender's editor, server, or receiver.
        const senderHas = await sender.evaluate((t) => document.querySelector('.ProseMirror').innerText.includes(t), token);
        const server = await sender.evaluate(async ({ otp, fileId }) => {
          const r = await fetch(`/api/lobby/doc?otp=${otp}&fileId=${fileId}&since=0`);
          const d = await r.json();
          return { author: d.authorNodeId, len: (d.content || '').length, head: (d.content || '').slice(0, 300) };
        }, { otp, fileId });
        const serverHas = server.head.includes(token) || (await sender.evaluate(async ({ otp, fileId, t }) => {
          const r = await fetch(`/api/lobby/doc?otp=${otp}&fileId=${fileId}&since=0`);
          const d = await r.json();
          return (d.content || '').includes(t);
        }, { otp, fileId, t: token }));
        const receiverStatus = await receiver.evaluate(() => document.body.innerText.match(/(Cloud Synced|Live synced[^\n]*|Syncing\.\.\.|Offline[^\n]*|Room unavailable|Merged[^\n]*)/)?.[0] || '(no status found)');
        const receiverHead = await receiver.evaluate(() => document.querySelector('.ProseMirror').innerText.slice(-200));
        console.log(`\n  STUCK on trial ${i + 1}:`);
        console.log(`    sender editor has token: ${senderHas}`);
        console.log(`    server has token: ${serverHas} (author=${server.author}, len=${server.len})`);
        console.log(`    receiver status badge: ${receiverStatus}`);
        console.log(`    receiver editor tail: ${JSON.stringify(receiverHead)}`);
        throw err;
      }
      const ms = seenAt - t0;
      if (process.env.VERBOSE || process.env.STRESS) {
        // Document growth is the tell for the merge-duplication bug: a
        // healthy merge keeps the doc roughly the size of what was typed.
        const srv = await sender.evaluate(async ({ otp, fileId }) => {
          const r = await fetch(`/api/lobby/doc?otp=${otp}&fileId=${fileId}&since=0`);
          const d = await r.json();
          const c = d.content || '';
          return { len: c.length, paragraphs: (c.match(/<p>/g) || []).length };
        }, { otp, fileId });
        console.log(`    server doc after trial: ${srv.len} chars, ${srv.paragraphs} <p> blocks`);
      }
      if (i === 0) {
        console.log(`warm-up (${sender === a ? 'A→B' : 'B→A'}): ${ms} ms  [excluded]`);
      } else {
        results.push(ms);
        console.log(`trial ${i} (${sender === a ? 'A→B' : 'B→A'}): ${ms} ms`);
      }
      // Let both sides settle before the next trial. Randomised on purpose:
      // a fixed settle equal to (or a multiple of) the poll interval
      // phase-locks every trial to the same point in the receiver's poll
      // cycle and silently measures a best case instead of the average.
      await sender.waitForTimeout(1500 + Math.floor(Math.random() * 2300));
    }

    const avg = Math.round(results.reduce((s, x) => s + x, 0) / results.length);
    const max = Math.max(...results);
    const min = Math.min(...results);
    console.log(`\nkeystroke → other screen: avg ${avg} ms, min ${min} ms, max ${max} ms over ${results.length} trials`);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
