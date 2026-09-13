/**
 * @file tests/e2e/helpers/console-monitor.ts
 * Captures ALL browser console output (errors, warnings, network failures).
 * Attach to any page to get a live F12-equivalent log.
 */

import { Page } from '@playwright/test';

export interface ConsoleCapture {
  errors: string[];
  warnings: string[];
  networkErrors: string[];
  allLogs: string[];
}

/**
 * Attach console & network error listeners to a Playwright page.
 * Returns a capture object that accumulates all output.
 */
export function attachConsoleMonitor(page: Page): ConsoleCapture {
  const capture: ConsoleCapture = {
    errors: [],
    warnings: [],
    networkErrors: [],
    allLogs: [],
  };

  // Capture all console.log / console.error / console.warn
  page.on('console', (msg) => {
    const text = `[${msg.type().toUpperCase()}] ${msg.text()}`;
    capture.allLogs.push(text);
    if (msg.type() === 'error') {
      capture.errors.push(msg.text());
    }
    if (msg.type() === 'warning') {
      capture.warnings.push(msg.text());
    }
  });

  // Capture uncaught JS exceptions (the red X errors in F12)
  page.on('pageerror', (err) => {
    const text = `[PAGE_ERROR] ${err.message}`;
    capture.errors.push(text);
    capture.allLogs.push(text);
  });

  // Capture network failures (ERR_CONNECTION_REFUSED etc.)
  page.on('requestfailed', (req) => {
    const text = `[NET_FAIL] ${req.method()} ${req.url()} → ${req.failure()?.errorText}`;
    capture.networkErrors.push(text);
    capture.allLogs.push(text);
  });

  return capture;
}

/**
 * Filters network errors to only those hitting unexpected localhost:PORT
 * (the bug we fixed — hitting localhost:3000 from Vercel).
 */
export function getLocalhostLeaks(capture: ConsoleCapture, allowedPort?: number): string[] {
  return capture.networkErrors.filter((e) => {
    const hasLocalhost = e.includes('localhost') || e.includes('127.0.0.1');
    if (!allowedPort) return hasLocalhost;
    // Allow if it's the expected port
    return hasLocalhost && !e.includes(`:${allowedPort}/`);
  });
}

/**
 * Print a full F12-style summary of captured console output.
 */
export function printConsoleSummary(capture: ConsoleCapture, label = '') {
  const divider = '─'.repeat(60);
  console.log(`\n${divider}`);
  console.log(`  🖥  BROWSER CONSOLE SUMMARY ${label}`);
  console.log(divider);
  console.log(`  Errors:          ${capture.errors.length}`);
  console.log(`  Warnings:        ${capture.warnings.length}`);
  console.log(`  Network Fails:   ${capture.networkErrors.length}`);
  console.log(`  Total Log Lines: ${capture.allLogs.length}`);

  if (capture.errors.length > 0) {
    console.log('\n  ❌ ERRORS:');
    capture.errors.slice(0, 20).forEach((e) => console.log(`    • ${e}`));
  }
  if (capture.networkErrors.length > 0) {
    console.log('\n  🔴 NETWORK FAILURES:');
    capture.networkErrors.slice(0, 20).forEach((e) => console.log(`    • ${e}`));
  }
  console.log(divider + '\n');
}
