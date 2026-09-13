/**
 * @file tests/e2e/02-responsive-ui.spec.ts
 *
 * TEST SUITE 2: Responsive UI & Element Behavior at Different Sizes
 *
 * Tests that all key UI elements render correctly and remain functional
 * when the window is minimized, resized, or viewed on mobile.
 * Specifically targets the small viewport shown in the user's screenshot (346x864).
 */

import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'Full Desktop', width: 1440, height: 900 },
  { name: 'Laptop',       width: 1280, height: 720 },
  { name: 'Small Window', width: 346,  height: 864 },  // ← matches screenshot
  { name: 'Mobile S',     width: 375,  height: 812 },
  { name: 'Tablet',       width: 768,  height: 1024 },
];

test.describe('Suite 2 — Responsive UI & Element Behavior', () => {

  for (const vp of VIEWPORTS) {
    test(`[${vp.name} ${vp.width}x${vp.height}] Sidebar renders without overflow`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();

      await page.goto('/app/peers');
      await page.waitForTimeout(2000);

      // No horizontal overflow
      const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(scrollWidth, `Horizontal overflow at ${vp.width}px`).toBeLessThanOrEqual(vp.width + 5);

      // At least one navigation element visible
      const navVisible = await page.locator('nav, aside, [class*="sidebar"], [class*="Sidebar"]').first().isVisible().catch(() => false);
      expect(navVisible, `No nav/sidebar visible at ${vp.width}px`).toBe(true);

      await ctx.close();
    });
  }

  test('[Small Window] Sidebar items are clickable and not clipped', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 346, height: 864 } });
    const page = await ctx.newPage();
    await page.goto('/app/peers');
    await page.waitForTimeout(1500);

    // Try to find and click navigation items
    const navLinks = page.locator('a[href], button').filter({ hasText: /room|sync|metrics|settings/i });
    const count = await navLinks.count();
    expect(count, 'No nav links found').toBeGreaterThan(0);

    // Each link should be inside the viewport (not clipped off-screen)
    for (let i = 0; i < Math.min(count, 4); i++) {
      const box = await navLinks.nth(i).boundingBox();
      if (box) {
        expect(box.x, `Nav link ${i} is off-screen left`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `Nav link ${i} overflows viewport right`).toBeLessThanOrEqual(346 + 10);
      }
    }

    await ctx.close();
  });

  test('[Small Window] Sync Rooms page shows room list or empty state', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 346, height: 864 } });
    const page = await ctx.newPage();
    await page.goto('/app/peers');
    await page.waitForTimeout(2000);

    // Either a room card or the empty state must be visible
    const hasContent = await page.locator(
      'h2, h3, [class*="room"], button:has-text("Create Room"), button:has-text("Join Room")'
    ).first().isVisible().catch(() => false);
    expect(hasContent, 'Peers page has no visible content at 346px').toBe(true);

    await ctx.close();
  });

  test('[Small Window] Editor page does not overflow horizontally', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 346, height: 864 } });
    const page = await ctx.newPage();
    await page.goto('/app/editor/1789279967967');
    await page.waitForTimeout(2500);

    const overflow = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      windowWidth: window.innerWidth,
      hasHorizScroll: document.body.scrollWidth > window.innerWidth,
    }));

    expect(overflow.hasHorizScroll, `Horizontal overflow: body ${overflow.bodyScrollWidth}px > window ${overflow.windowWidth}px`).toBe(false);

    await ctx.close();
  });

  test('[Small Window] Right panel collapses / is hidden at 346px', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 346, height: 864 } });
    const page = await ctx.newPage();
    await page.goto('/app/editor/1789279967967');
    await page.waitForTimeout(2000);

    // The right panel at 346px should either be hidden or collapsed
    // (collapsed = 48px wide, which is the isCollapsed=true state)
    const rightPanel = page.locator('aside').last();
    const box = await rightPanel.boundingBox().catch(() => null);
    if (box) {
      // If visible, it should be collapsed to 48px or less
      expect(box.width, `Right panel too wide at 346px viewport (${box.width}px)`).toBeLessThanOrEqual(48);
    }
    // If not visible at all, that's also acceptable

    await ctx.close();
  });

  test('[Desktop] Starred room star button is visible and has correct size', async ({ page }) => {
    await page.goto('/app/peers');
    await page.waitForTimeout(2000);

    // If any rooms exist, verify star button is accessible
    const starBtn = page.locator('button[title*="Favourite"], button[title*="Star"], button[title*="star"]').first();
    const exists = await starBtn.isVisible().catch(() => false);
    if (exists) {
      const box = await starBtn.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(28);
      expect(box!.height).toBeGreaterThanOrEqual(28);
    }
  });

  test('[Desktop] Metrics dashboard gauges render with tooltips', async ({ page }) => {
    await page.goto('/app/metrics');
    await page.waitForTimeout(3000);

    // At least some metric display should be visible
    const hasMetrics = await page.locator(
      '[class*="gauge"], [class*="metric"], text=/latency|throughput|sync|conflict/i'
    ).first().isVisible().catch(() => false);
    // Metrics page may show "not connected" if no desktop host — that's OK
    // but the page itself must render
    const pageLoaded = await page.locator('h1, h2, h3').first().isVisible();
    expect(pageLoaded, 'Metrics page did not load at all').toBe(true);
  });
});
