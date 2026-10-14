/**
 * Copies one Upstash database into another.
 *
 * Why: the database production uses has its primary region in iad1
 * (Washington DC). Everybody using DocuSync is in the Philippines, so
 * every request crosses the Pacific and back -- which is essentially the
 * whole of the ~300ms each call takes. Upstash fixes a store's region
 * when it is created, so the only way to move it is to copy it.
 *
 * What it copies: every key, with its type and its remaining time to
 * live. That is the accounts, the rooms, the document snapshots, the
 * version history and the join-code aliases -- all of DocuSync's state
 * lives in Redis.
 *
 * It never writes to the source, and by default it does not write at all:
 * run it once to see what it would do, then again with --commit.
 *
 *   vercel env pull .env.production.local        # get the current creds
 *   node scripts/migrate-redis.js                # dry run
 *   node scripts/migrate-redis.js --commit       # do it
 *
 * Env it needs:
 *   SOURCE_URL / SOURCE_TOKEN   the database being left behind
 *   TARGET_URL / TARGET_TOKEN   the new one, created in sin1
 *
 * If SOURCE_* is absent it falls back to KV_REST_API_URL / KV_REST_API_TOKEN,
 * which is what `vercel env pull` writes.
 */
const fs = require('fs');
const path = require('path');

const COMMIT = process.argv.includes('--commit');

// Load .env.production.local / .env.local without adding a dependency.
for (const f of ['.env.production.local', '.env.local']) {
  const p = path.join(__dirname, '..', f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const SOURCE_URL = process.env.SOURCE_URL || process.env.KV_REST_API_URL;
const SOURCE_TOKEN = process.env.SOURCE_TOKEN || process.env.KV_REST_API_TOKEN;
const TARGET_URL = process.env.TARGET_URL;
const TARGET_TOKEN = process.env.TARGET_TOKEN;

if (!SOURCE_URL || !SOURCE_TOKEN) {
  console.error('\nNo source database. Set SOURCE_URL and SOURCE_TOKEN, or run `vercel env pull .env.production.local` first.\n');
  process.exit(1);
}
if (COMMIT && (!TARGET_URL || !TARGET_TOKEN)) {
  console.error('\n--commit needs TARGET_URL and TARGET_TOKEN (the new sin1 database).\n');
  process.exit(1);
}

/** One Redis command over the REST API. */
const call = async (url, token, cmd) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || (body && body.error)) {
    throw new Error(`${cmd[0]} failed: ${res.status} ${body && body.error ? body.error : ''}`);
  }
  return body ? body.result : null;
};

/**
 * Many commands in one round trip.
 *
 * The first version of this asked three questions per key, one request
 * each. At 42ms a request that is two minutes per thousand keys spent
 * entirely on waiting, and the database being migrated is on the far
 * side of an ocean -- which is the whole reason for the migration.
 */
const pipeline = async (url, token, cmds) => {
  if (cmds.length === 0) return [];
  const out = [];
  // Kept to a few hundred per request so one failure is cheap to retry
  // and no single body gets unwieldy.
  for (let i = 0; i < cmds.length; i += 200) {
    const chunk = cmds.slice(i, i + 200);
    const res = await fetch(url.replace(/\/$/, '') + '/pipeline', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(body)) {
      throw new Error(`pipeline failed: ${res.status} ${body && body.error ? body.error : ''}`);
    }
    for (const r of body) {
      if (r && r.error) throw new Error('pipeline command failed: ' + r.error);
      out.push(r ? r.result : null);
    }
  }
  return out;
};

const src = (cmd) => call(SOURCE_URL, SOURCE_TOKEN, cmd);
const dst = (cmd) => call(TARGET_URL, TARGET_TOKEN, cmd);
const srcPipe = (cmds) => pipeline(SOURCE_URL, SOURCE_TOKEN, cmds);
const dstPipe = (cmds) => pipeline(TARGET_URL, TARGET_TOKEN, cmds);

/** Every key, in pages, rather than with KEYS. */
async function* scanPages() {
  let cursor = '0';
  do {
    const [next, keys] = await src(['SCAN', cursor, 'COUNT', '500']);
    cursor = next;
    if (keys.length) yield keys;
  } while (cursor !== '0');
}

async function main() {
  console.log('');
  console.log(COMMIT ? 'Migrating' : 'Dry run -- nothing will be written');
  console.log('  from ' + new URL(SOURCE_URL).host);
  console.log('  to   ' + (TARGET_URL ? new URL(TARGET_URL).host : '(not set)'));
  console.log('');

  const byType = {};
  const skipped = [];
  let copied = 0;
  let n = 0;

  // A page of keys at a time: one request to learn every type, one to
  // learn every expiry, one per type to read the values, one to write.
  for await (const page of scanPages()) {
    n += page.length;
    const types = await srcPipe(page.map((k) => ['TYPE', k]));
    const ttls = await srcPipe(page.map((k) => ['PTTL', k]));

    const reads = [];
    const plan = [];
    page.forEach((key, i) => {
      const type = types[i];
      const ttl = ttls[i];
      byType[type] = (byType[type] || 0) + 1;
      if (ttl === -2) { skipped.push(`${key} (expired mid-scan)`); return; }
      if (type === 'string') reads.push(['GET', key]);
      else if (type === 'set') reads.push(['SMEMBERS', key]);
      else if (type === 'hash') reads.push(['HGETALL', key]);
      else if (type === 'list') reads.push(['LRANGE', key, '0', '-1']);
      else if (type === 'zset') reads.push(['ZRANGE', key, '0', '-1', 'WITHSCORES']);
      else { skipped.push(`${key} (unhandled type ${type})`); return; }
      plan.push({ key, type, ttl });
    });

    const values = await srcPipe(reads);

    const writes = [];
    plan.forEach(({ key, type, ttl }, i) => {
      const v = values[i];
      if (type === 'string') {
        if (v === null) { skipped.push(`${key} (vanished)`); return; }
        writes.push(ttl > 0 ? ['SET', key, v, 'PX', String(ttl)] : ['SET', key, v]);
      } else if (type === 'set') {
        if (!v || !v.length) return;
        writes.push(['SADD', key, ...v]);
        if (ttl > 0) writes.push(['PEXPIRE', key, String(ttl)]);
      } else if (type === 'hash') {
        if (!v || !v.length) return;
        writes.push(['HSET', key, ...v]);
        if (ttl > 0) writes.push(['PEXPIRE', key, String(ttl)]);
      } else if (type === 'list') {
        if (!v || !v.length) return;
        writes.push(['RPUSH', key, ...v]);
        if (ttl > 0) writes.push(['PEXPIRE', key, String(ttl)]);
      } else if (type === 'zset') {
        if (!v || !v.length) return;
        const pairs = [];
        for (let j = 0; j < v.length; j += 2) pairs.push(v[j + 1], v[j]);
        writes.push(['ZADD', key, ...pairs]);
        if (ttl > 0) writes.push(['PEXPIRE', key, String(ttl)]);
      }
      copied++;
    });

    if (COMMIT && writes.length) await dstPipe(writes);
    process.stdout.write(`  ...${n} keys`);
  }

  console.log(`  ${n} keys seen` + ' '.repeat(24));
  console.log('  by type: ' + Object.entries(byType).map(([t, c]) => `${t}=${c}`).join(' '));
  console.log(`  ${COMMIT ? 'copied' : 'would copy'}: ${copied}`);
  if (skipped.length) {
    console.log(`  skipped ${skipped.length}:`);
    for (const sk of skipped.slice(0, 10)) console.log('    ' + sk);
  }

  // The number that matters: are the accounts there. Everything else is
  // a room, and rooms expire anyway -- an account does not.
  const authKeys = ['docusync_auth_db', 'auth_db', 'users'];
  for (const k of authKeys) {
    const t = await src(['TYPE', k]);
    if (t === 'none') continue;
    const raw = await src(['GET', k]);
    let count = null;
    try { count = (JSON.parse(raw).users || []).length; } catch (e) { /* not json */ }
    console.log(`  source "${k}": ${count === null ? t : count + ' accounts'}`);
    if (COMMIT) {
      const back = await dst(['GET', k]);
      let after = null;
      try { after = (JSON.parse(back).users || []).length; } catch (e) { /* not json */ }
      console.log(`  target "${k}": ${after === null ? '(not readable)' : after + ' accounts'}`);
      if (after !== count) console.log('  !! ACCOUNT COUNTS DO NOT MATCH -- do not switch over');
    }
  }

  console.log('');
  if (!COMMIT) console.log('  Nothing was written. Re-run with --commit when the target is ready.');
  console.log('');
}

main().catch((e) => { console.error('\n' + e.message + '\n'); process.exit(1); });
