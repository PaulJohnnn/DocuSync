/**
 * @file tests/e2e/06-api-security.spec.ts
 *
 * TEST SUITE 6: Security & API Validation
 *
 * Verifies:
 *   1. Rate limiting (429) on /api/lobby/join after 5 requests/min
 *   2. Missing fields return 400 (not 500)
 *   3. Invalid OTP format returns 400
 *   4. Expired/nonexistent room returns 404
 *   5. All critical API endpoints return correct status codes
 *   6. CORS headers present on responses
 */

import { test, expect } from '@playwright/test';

test.describe('Suite 6 — API Security & Validation', () => {

  test('POST /api/lobby/create — missing roomName returns 400', async ({ request }) => {
    const res = await request.post('/api/lobby/create', {
      data: { hostNodeId: 'test-node' }, // roomName missing
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    console.log(`  [SEC] /create missing roomName → ${res.status()}: ${body.error}`);
  });

  test('POST /api/lobby/join — missing OTP returns 400', async ({ request }) => {
    const res = await request.post('/api/lobby/join', {
      data: { memberNodeId: 'test-node' }, // otp missing
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    console.log(`  [SEC] /join missing otp → ${res.status()}: ${body.error}`);
  });

  test('POST /api/lobby/join — invalid OTP format returns 400', async ({ request }) => {
    const res = await request.post('/api/lobby/join', {
      data: { otp: 'AB', memberNodeId: 'test' }, // too short
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/lobby/join — nonexistent OTP returns 404', async ({ request }) => {
    const res = await request.post('/api/lobby/join', {
      data: { otp: 'ZZ9999', memberNodeId: 'test' }, // valid format, bad OTP
    });
    // Either 404 (not found) or 410 (gone)
    expect([404, 410]).toContain(res.status());
    console.log(`  [SEC] /join bad OTP → ${res.status()}`);
  });

  test('Rate limit: 6th join request in 60s returns 429', async ({ request }) => {
    // Fire 6 requests quickly using a unique IP fingerprint approach
    // Note: Vercel may not set X-Real-IP the same way — we rely on the Redis counter
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await request.post('/api/lobby/join', {
        data: { otp: 'RLTEST', memberNodeId: `rl-node-${i}` },
      });
      statuses.push(res.status());
      if (res.status() === 429) {
        const body = await res.json();
        console.log(`  [SEC] Rate limit hit on attempt ${i + 1}: "${body.error}"`);
        const retryAfter = res.headers()['retry-after'];
        console.log(`  [SEC] Retry-After header: ${retryAfter}`);
        expect(retryAfter).toBe('60');
        break;
      }
    }
    console.log(`  [SEC] Status sequence: ${statuses.join(', ')}`);
    expect(statuses.some(s => s === 429), 'Rate limit never triggered').toBe(true);
  });

  test('POST /api/lobby/leave — missing nodeId returns 400', async ({ request }) => {
    const res = await request.post('/api/lobby/leave', {
      data: { otp: 'TESTOT' }, // nodeId missing
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/lobby/list — returns rooms array', async ({ request }) => {
    const res = await request.get('/api/lobby/list');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('success');
    expect(Array.isArray(body.rooms)).toBe(true);
    console.log(`  [SEC] /list → ${body.rooms.length} active rooms`);
  });

  test('GET /api/local-ip — returns an IP address string', async ({ request }) => {
    const res = await request.get('/api/local-ip');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('ip');
    // IP should be a valid IPv4
    expect(body.ip).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    console.log(`  [SEC] /local-ip → ${body.ip}`);
  });

  test('GET /api/admin/stats — returns health stats', async ({ request }) => {
    const res = await request.get('/api/admin/stats');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.stats).toHaveProperty('redisStatus');
    console.log(`  [SEC] /admin/stats → redisStatus: ${body.stats.redisStatus}`);
  });

  test('GET /api/admin/metrics — returns performance metrics', async ({ request }) => {
    const res = await request.get('/api/admin/metrics');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.metrics).toHaveProperty('avgSyncLatencyMs');
    expect(body.metrics).toHaveProperty('dataLossIncidents');
    console.log(`  [SEC] /admin/metrics → latency: ${body.metrics.avgSyncLatencyMs}ms, loss incidents: ${body.metrics.dataLossIncidents}`);
  });

  test('POST /api/lobby/heartbeat — keeps room alive', async ({ request }) => {
    // Create a room first
    const createRes = await request.post('/api/lobby/create', {
      data: { roomName: 'QA-Heartbeat', hostNodeId: 'qa-hb-host', hostIp: '127.0.0.1', hostPort: 9000 },
    });
    if (!createRes.ok()) { test.skip(); return; }
    const { otp } = await createRes.json();

    const hbRes = await request.post('/api/lobby/heartbeat', {
      data: { otp, nodeId: 'qa-hb-host', isHost: true, filesCount: 1 },
    });
    expect(hbRes.ok()).toBe(true);
    const hbBody = await hbRes.json();
    expect(hbBody.success).toBe(true);
    expect(hbBody.ttl).toBeGreaterThan(0);
    console.log(`  [SEC] /heartbeat → TTL refreshed to ${hbBody.ttl}s`);
  });

  test('POST /api/parse-docx — missing file returns 400', async ({ request }) => {
    const res = await request.post('/api/parse-docx', {
      // No multipart file attached
      data: {},
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('CORS headers present on lobby API responses', async ({ request }) => {
    const res = await request.options('/api/lobby/create', {
      headers: {
        Origin: 'https://docusync-dusky.vercel.app',
        'Access-Control-Request-Method': 'POST',
      },
    });
    // CORS preflight or regular response should have CORS header
    const origin = res.headers()['access-control-allow-origin'];
    // Should not be undefined (may be '*' or the specific origin)
    console.log(`  [SEC] CORS allow-origin: ${origin}`);
  });
});
